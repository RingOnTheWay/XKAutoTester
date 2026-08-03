"""LogcatMonitor facade — 实时监控 logcat 输出,检测致命闪退。

编排 3 协作器:
- LogcatProcess: subprocess 边界 (clear + Popen + readline + stop)
- LogRingBuffer: ring buffer (deque + snapshot + crash_context)
- 纯函数 (logcat_parser + crash_detector): 解析 + 崩溃检测

自身保留:
- _read_loop daemon 线程 (read → parse → buffer → crash-detect → callback)
- 双锁 _lock (buffer) + _crash_lock (crash state)
- _crash_capture_remaining 状态机计数器

设计:
- 7 公共方法签名保持向后兼容 (ADBManager 零改动)
- adapter: AdbCommandPort 可选注入 (默认 SubprocessAdbAdapter)
- 修复 L155 bug: adb 路径走 adapter,不再硬编码 "adb"
- on_crash 回调在 _crash_lock 外调用 (消除死锁风险)
- _CURRENT_YEAR 模块级缓存 (避免每行 time.strftime)
"""
from __future__ import annotations

import logging
import threading
import time
from collections.abc import Callable

from main.core.adb.adb_port import AdbCommandPort
from main.core.adb.subprocess_adb_adapter import SubprocessAdbAdapter
from main.core.logcat.crash_detector import detect_crash_type, is_crash_line
from main.core.logcat.log_ring_buffer import LogRingBuffer
from main.core.logcat.logcat_parser import LOG_LEVEL_MAP, format_line
from main.core.logcat.logcat_process import LogcatProcess
from main.utils.i18n import t

logger = logging.getLogger(__name__)

# 年份缓存 (避免每行 time.strftime 调用)
_CURRENT_YEAR = time.strftime("%Y")

OnCrashCallback = Callable[[str, str, str], None]


class LogcatMonitor:
    """Logcat 实时监控器 (facade)。

    在后台 daemon 线程中持续读取 adb logcat 输出,
    Python 侧按 PID/包名过滤 + 崩溃 tag 特殊捕获,
    检测致命闪退并触发回调。
    """

    def __init__(
        self,
        device_name: str,
        app_package: str,
        app_pid: int | None = None,
        on_crash: Callable | None = None,
        buffer_size: int = 500,
        min_log_level: str = "I",
        *,
        adapter: AdbCommandPort | None = None,
    ) -> None:
        """
        Args:
            device_name: ADB 设备标识
            app_package: 应用包名
            app_pid: 应用进程 ID (可选,None 时按包名过滤)
            on_crash: 崩溃回调 (crash_type, crash_line, full_log) -> None
            buffer_size: 日志环形缓冲区大小
            min_log_level: 最低日志级别 (V/D/I/W/E/F)
            adapter: AdbCommandPort 注入 (默认 SubprocessAdbAdapter,测试用 FakeAdbAdapter)
        """
        self.device_name = device_name
        self.app_package = app_package
        self.app_pid = str(app_pid) if app_pid else None
        self.on_crash = on_crash
        self.buffer_size = buffer_size
        self.min_log_level = LOG_LEVEL_MAP.get(min_log_level.upper(), LOG_LEVEL_MAP["I"])

        self._adb: AdbCommandPort = adapter or SubprocessAdbAdapter()
        self._process = LogcatProcess(self._adb, device_name)
        self._buffer = LogRingBuffer(maxlen=buffer_size)
        self._thread: threading.Thread | None = None
        self._stop_event = threading.Event()
        self._lock = threading.Lock()
        self._crash_lock = threading.Lock()
        self._crash_detected = False
        self._crash_type: str | None = None
        self._crash_line: str | None = None
        self._crash_capture_remaining = 0

    @property
    def crash_detected(self) -> bool:
        """是否检测到崩溃。"""
        return self._crash_detected

    @property
    def crash_info(self) -> dict:
        """崩溃信息 dict (形状保持向后兼容)。"""
        with self._crash_lock:
            return {
                "crash_detected": self._crash_detected,
                "crash_type": self._crash_type,
                "crash_line": self._crash_line,
            }

    def update_pid(self, new_pid: int | None) -> None:
        """更新监听的 PID。None 静默跳过。"""
        if new_pid is None:
            return
        self.app_pid = str(new_pid)
        logger.info(t("python.logcatMonitor.pidUpdated", pid=new_pid))

    def start(self) -> bool:
        """启动 logcat 监听 (流式持续模式)。

        Returns:
            bool: 启动是否成功 (已运行时返回 False)
        """
        if self._thread is not None and self._thread.is_alive():
            logger.warning(t("python.logcatMonitor.alreadyRunning"))
            return False

        try:
            self._process.clear_buffer()
            self._process.start_stream()

            self._stop_event.clear()
            self._crash_capture_remaining = 0
            self._thread = threading.Thread(
                target=self._read_loop,
                name="logcat-monitor",
                daemon=True,
            )
            self._thread.start()

            logger.info(
                t("python.logcatMonitor.started",
                  device=self.device_name, pid=self.app_pid or "unknown")
            )
            return True
        except Exception as e:
            logger.error(t("python.logcatMonitor.startFailed", error=e))
            self._process.stop()
            return False

    def stop(self) -> None:
        """停止 logcat 监听 (幂等)。"""
        self._stop_event.set()
        self._process.stop()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=5)
        self._thread = None
        logger.info(t("python.logcatMonitor.stopped"))

    def get_full_log(self) -> str:
        """获取从启动到当前的完整日志。"""
        with self._lock:
            return self._buffer.snapshot()

    def get_crash_log(self, context_lines: int = 50) -> str:
        """获取崩溃发生时的上下文日志。"""
        with self._lock:
            return self._buffer.crash_context(is_crash_line, context_lines)

    def _read_loop(self) -> None:
        """后台线程: 持续读取 logcat 输出。

        编排: read → parse → buffer → crash-detect → callback。
        回调在 _crash_lock 外调用 (避免死锁)。
        """
        try:
            while not self._stop_event.is_set():
                line = self._process.readline()
                if not line:
                    if not self._process.is_alive():
                        break
                    continue

                try:
                    decoded = line.decode("utf-8", errors="replace").rstrip()
                except Exception:
                    continue

                if not decoded.strip():
                    continue

                # format_line 是纯函数,传当前 crash_capture_remaining 快照
                capture_remaining = self._crash_capture_remaining
                formatted = format_line(
                    decoded,
                    app_package=self.app_package,
                    app_pid=self.app_pid,
                    min_log_level=self.min_log_level,
                    crash_capture_remaining=capture_remaining,
                    current_year=_CURRENT_YEAR,
                )
                if formatted is None:
                    continue

                with self._lock:
                    self._buffer.append(formatted)

                if self._crash_capture_remaining > 0:
                    self._crash_capture_remaining -= 1

                # 检测崩溃 (纯函数)
                if is_crash_line(decoded):
                    crash_type = detect_crash_type(decoded)
                    with self._crash_lock:
                        self._crash_detected = True
                        self._crash_type = crash_type
                        self._crash_line = formatted

                    self._crash_capture_remaining = 100

                    logger.error(
                        t("python.logcatMonitor.crashDetected",
                          type=crash_type, line=formatted)
                    )

                    if self.on_crash:
                        try:
                            # 回调在 _crash_lock 外调用 (避免死锁)
                            full_log = self.get_full_log()
                            self.on_crash(crash_type, formatted, full_log)
                        except Exception as e:
                            logger.error(
                                t("python.logcatMonitor.crashCallbackError", error=e)
                            )

        except Exception as e:
            if not self._stop_event.is_set():
                logger.error(t("python.logcatMonitor.readLoopError", error=e))

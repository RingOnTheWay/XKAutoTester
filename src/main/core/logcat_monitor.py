"""
Logcat 实时监控模块
在测试执行期间持续监听 Android 设备 logcat 输出，
检测致命闪退（FATAL EXCEPTION / Process died / Native crash / ANR），
捕获完整日志上下文并附加到 Allure 报告，同时终止测试。

输出格式精简风格：
    2026-06-03 14:41:33.183  com.xxx.app  E  FATAL EXCEPTION: main

设计要点：
    - 使用 -T（流式）而非 -t（dump 后退出）
    - 不使用 --pid 过滤（进程崩溃后 --pid 会丢弃崩溃日志行）
    - Python 侧按 PID 或包名匹配过滤，崩溃行（AndroidRuntime/DEBUG/ActivityManager）特殊处理
    - PID 可选：无 PID 时按包名过滤 + 崩溃 tag 捕获
    - 支持崩溃后 PID 变更的场景
"""

import logging
import re
import subprocess
import threading
import time
from collections import deque
from collections.abc import Callable

from main.utils.i18n import t

logger = logging.getLogger(__name__)

# logcat 时间戳行格式（-v threadtime 格式）
# 格式: MM-DD HH:MM:SS.mmm  PID  TID LEVEL TAG: MESSAGE
# 注意: PID 和 TID 之间是空格（可能多个），不是连字符
# 注意: LEVEL 和 TAG 之间可能是 / 或空格（不同 Android 版本格式不同）
TIMESTAMP_LINE_PATTERN = re.compile(
    r'^(\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3})\s+(\d+)\s+(\d+)\s+([VDIWEF])[/\s]+(.+?):\s+(.*?)$'
)

# logcat 行格式正则（-v time 格式回退）
# 格式: MM-DD HH:MM:SS.mmm LEVEL/TAG(PID): MESSAGE
TIME_LINE_PATTERN = re.compile(
    r'^(\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3})\s+([VDIWEF])/(.+?)\(\s*(\d+)\):\s+(.*?)$'
)

# 致命闪退检测模式
FATAL_EXCEPTION_PATTERN = re.compile(r'FATAL\s+EXCEPTION')
PROCESS_DIED_PATTERN = re.compile(r'Process\s+.+\(pid\s+\d+\)\s+has\s+died')
PROCESS_KILL_PATTERN = re.compile(r'Killing\s+\d+:.+?:\s+')
NATIVE_SIGNAL_PATTERN = re.compile(r'signal\s+\d+\s+\(SIG\w+\)')
ANR_PATTERN = re.compile(r'ANR\s+in\s+.+|Application\s+Not\s+Responding|anr\s+in', re.IGNORECASE)

# 崩溃相关的系统 tag：即使 PID 不匹配也需要捕获
CRASH_RELATED_TAGS = {
    'AndroidRuntime', 'System.err', 'DEBUG', 'ActivityManager',
    'Process', 'ActivityThread', 'AndroidRuntimeUtils',
}

# 日志级别映射
LOG_LEVELS = 'VDIWEF'
LOG_LEVEL_MAP = {c: i for i, c in enumerate(LOG_LEVELS)}


class LogcatMonitor:
    """Logcat 实时监控器

    在后台线程中持续读取 adb logcat 输出，
    Python 侧按 PID/包名过滤 + 崩溃 tag 特殊捕获，
    检测致命闪退并触发回调。
    """

    def __init__(
        self,
        device_name: str,
        app_package: str,
        app_pid: int | None = None,
        on_crash: Callable | None = None,
        buffer_size: int = 500,
        min_log_level: str = 'I',
    ):
        """
        Args:
            device_name: ADB 设备标识
            app_package: 应用包名
            app_pid: 应用进程 ID（可选，为 None 时按包名过滤）
            on_crash: 崩溃回调函数
            buffer_size: 日志环形缓冲区大小
            min_log_level: 最低日志级别
        """
        self.device_name = device_name
        self.app_package = app_package
        self.app_pid = str(app_pid) if app_pid else None
        self.on_crash = on_crash
        self.buffer_size = buffer_size
        self.min_log_level = LOG_LEVEL_MAP.get(min_log_level.upper(), LOG_LEVEL_MAP['I'])

        self._process: subprocess.Popen | None = None
        self._thread: threading.Thread | None = None
        self._stop_event = threading.Event()
        self._log_buffer: deque = deque(maxlen=buffer_size)
        self._crash_detected = False
        self._crash_type: str | None = None
        self._crash_line: str | None = None
        self._lock = threading.Lock()
        self._crash_lock = threading.Lock()
        self._start_timestamp: str | None = None
        self._crash_capture_remaining = 0

    @property
    def crash_detected(self) -> bool:
        return self._crash_detected

    @property
    def crash_info(self) -> dict:
        with self._crash_lock:
            return {
                'crash_detected': self._crash_detected,
                'crash_type': self._crash_type,
                'crash_line': self._crash_line,
            }

    def update_pid(self, new_pid: int | None):
        """更新监听的 PID

        Args:
            new_pid: 新的应用进程 ID，None 表示未知
        """
        self.app_pid = str(new_pid) if new_pid else None
        logger.info(t('python.logcatMonitor.pidUpdated', pid=new_pid or 'unknown'))

    def start(self) -> bool:
        """启动 logcat 监听（流式持续模式）

        Returns:
            bool: 启动是否成功
        """
        if self._process is not None:
            logger.warning(t('python.logcatMonitor.alreadyRunning'))
            return False

        try:
            # 先清空 logcat 缓冲区，避免捕获旧日志
            subprocess.run(
                ['adb', '-s', self.device_name, 'logcat', '-c'],
                capture_output=True, timeout=10,
            )

            # 纯流式读取：不带 -T（某些 adb 版本不支持）或 --pid（崩溃后过滤失效）
            cmd = [
                'adb', '-s', self.device_name,
                'logcat', '-v', 'threadtime',
            ]

            self._process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )

            self._stop_event.clear()
            self._crash_capture_remaining = 0
            self._thread = threading.Thread(
                target=self._read_loop,
                name='logcat-monitor',
                daemon=True,
            )
            self._thread.start()

            logger.info(t('python.logcatMonitor.started', device=self.device_name, pid=self.app_pid or 'unknown'))
            return True

        except Exception as e:
            logger.error(t('python.logcatMonitor.startFailed', error=e))
            self._cleanup_process()
            return False

    def stop(self):
        """停止 logcat 监听"""
        self._stop_event.set()
        self._cleanup_process()

        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=5)

        self._thread = None
        logger.info(t('python.logcatMonitor.stopped'))

    def get_full_log(self) -> str:
        """获取从启动到当前的完整日志"""
        with self._lock:
            return '\n'.join(self._log_buffer)

    def get_crash_log(self, context_lines: int = 50) -> str:
        """获取崩溃发生时的上下文日志"""
        with self._lock:
            log_list = list(self._log_buffer)

        if not log_list:
            return ''

        crash_index = -1
        for i, line in enumerate(log_list):
            if self._is_crash_line(line):
                crash_index = i
                break

        if crash_index == -1:
            start = max(0, len(log_list) - context_lines)
            return '\n'.join(log_list[start:])

        start = max(0, crash_index - context_lines)
        end = min(len(log_list), crash_index + context_lines + 1)
        return '\n'.join(log_list[start:end])

    def _should_capture_line(self, pid: str, tag: str, level: str, message: str = '') -> bool:
        """判断是否应捕获该日志行

        核心原则：只保留与所测试包名相关的日志行。

        规则（优先级从高到低）：
        1. 崩溃捕获模式（堆栈续行）→ 捕获
        2. PID 匹配 → 捕获（该进程的所有日志）
        3. 消息中包含包名 → 捕获（系统对 app 的操作记录）
        4. 崩溃相关 tag + 消息含包名或崩溃关键词 → 捕获
        """
        # 崩溃捕获模式
        if self._crash_capture_remaining > 0:
            return True

        # PID 匹配：该进程的所有日志都保留
        if self.app_pid and pid == self.app_pid:
            return True

        # 消息中包含包名：系统对 app 的操作（Force stopping、Start proc、has died 等）
        if self.app_package in message:
            return True

        # 崩溃相关 tag + 消息含崩溃关键词（FATAL、crash 等）
        level_idx = LOG_LEVEL_MAP.get(level, 0)
        if tag in CRASH_RELATED_TAGS and level_idx >= LOG_LEVEL_MAP.get('E', 4):
            if self._has_crash_keyword(message):
                return True

        return False

    def _read_loop(self):
        """后台线程：持续读取 logcat 输出"""
        try:
            while not self._stop_event.is_set():
                line = self._process.stdout.readline()
                if not line:
                    if self._process.poll() is not None:
                        break
                    continue

                try:
                    decoded = line.decode('utf-8', errors='replace').rstrip()
                except Exception:
                    continue

                if not decoded.strip():
                    continue

                formatted = self._format_line(decoded)
                if formatted is None:
                    continue

                with self._lock:
                    self._log_buffer.append(formatted)

                if self._crash_capture_remaining > 0:
                    self._crash_capture_remaining -= 1

                if self._is_crash_line(decoded):
                    crash_type = self._detect_crash_type(decoded)
                    with self._crash_lock:
                        self._crash_detected = True
                        self._crash_type = crash_type
                        self._crash_line = formatted

                    self._crash_capture_remaining = 100

                    logger.error(t('python.logcatMonitor.crashDetected', type=crash_type, line=formatted))

                    if self.on_crash:
                        try:
                            full_log = self.get_full_log()
                            self.on_crash(crash_type, formatted, full_log)
                        except Exception as e:
                            logger.error(t('python.logcatMonitor.crashCallbackError', error=e))

        except Exception as e:
            if not self._stop_event.is_set():
                logger.error(t('python.logcatMonitor.readLoopError', error=e))

    def _format_line(self, raw_line: str) -> str | None:
        """格式化 logcat 行为精简风格

        输出格式: YYYY-MM-DD HH:MM:SS.mmm  PACKAGE  LEVEL  MESSAGE
        只保留时间、包名、等级、消息

        支持两种输入格式：
        - -v threadtime: MM-DD HH:MM:SS.mmm PID TID LEVEL TAG: MESSAGE
        - -v time:        MM-DD HH:MM:SS.mmm LEVEL/TAG(PID): MESSAGE
        """
        year = time.strftime('%Y')

        # 优先匹配 -v threadtime 格式
        ts_match = TIMESTAMP_LINE_PATTERN.match(raw_line)
        if ts_match:
            timestamp, pid, tid, level, tag, message = ts_match.groups()
            tag = tag.strip()

            if LOG_LEVEL_MAP.get(level, 0) < self.min_log_level:
                return None

            if not self._should_capture_line(pid, tag, level, message):
                return None

            # 格式: YYYY-MM-DD HH:MM:SS.mmm  PACKAGE  LEVEL  MESSAGE
            full_ts = f'{year}-{timestamp}'
            return f'{full_ts}  {self.app_package}  {level}  {message}'

        # 回退匹配 -v time 格式
        time_match = TIME_LINE_PATTERN.match(raw_line)
        if time_match:
            timestamp, level, tag, pid, message = time_match.groups()
            tag = tag.strip()

            if LOG_LEVEL_MAP.get(level, 0) < self.min_log_level:
                return None

            if not self._should_capture_line(pid, tag, level, message):
                return None

            full_ts = f'{year}-{timestamp}'
            return f'{full_ts}  {self.app_package}  {level}  {message}'

        # 不匹配的行：崩溃捕获模式下保留（精简格式）
        if self._crash_capture_remaining > 0:
            full_ts = time.strftime('%Y-%m-%d %H:%M:%S')
            return f'{full_ts}  {self.app_package}  {raw_line}'

        return None

    def _has_crash_keyword(self, message: str) -> bool:
        """检查消息是否包含崩溃相关关键词"""
        crash_keywords = ('has died', 'Killing', 'FATAL', 'crash', 'ANR', 'not responding')
        msg_lower = message.lower()
        return any(kw.lower() in msg_lower for kw in crash_keywords)

    def _is_crash_line(self, line: str) -> bool:
        """判断是否为致命闪退日志行"""
        return bool(
            FATAL_EXCEPTION_PATTERN.search(line)
            or PROCESS_DIED_PATTERN.search(line)
            or NATIVE_SIGNAL_PATTERN.search(line)
            or ANR_PATTERN.search(line)
        )

    def _detect_crash_type(self, line: str) -> str:
        """检测崩溃类型"""
        if FATAL_EXCEPTION_PATTERN.search(line):
            return 'FATAL_EXCEPTION'
        if NATIVE_SIGNAL_PATTERN.search(line):
            return 'NATIVE_CRASH'
        if PROCESS_DIED_PATTERN.search(line):
            return 'PROCESS_DIED'
        if ANR_PATTERN.search(line):
            return 'ANR'
        return 'UNKNOWN_CRASH'

    def _cleanup_process(self):
        """清理子进程"""
        if self._process:
            try:
                self._process.terminate()
                try:
                    self._process.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    self._process.kill()
                    self._process.wait(timeout=2)
            except Exception:
                pass
            self._process = None

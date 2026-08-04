"""LogcatProcess — logcat 子进程边界封装。

职责:
- clear_buffer: 调 adapter.execute 清空 logcat 缓冲区
- start_stream: 调 adapter.popen_stream 启动流式读取
- readline: 读取一行 stdout,EOF 返回 None
- is_alive: 反映子进程 poll() 状态
- stop: terminate→wait(3)→kill→wait(2) 幂等

设计:
- 不 catch 异常,冒泡到 facade (薄封装)
- 修复原 logcat_monitor.py L155 硬编码 "adb" bug — adb 路径走 adapter
- 不持锁,锁由 facade 持有
"""
from __future__ import annotations

import logging
import subprocess

from main.core.adb.adb_port import AdbCommandPort, AdbResult

logger = logging.getLogger(__name__)


class LogcatProcess:
    """logcat 子进程边界。

    持有 adapter + Popen 句柄,封装 clear/start_stream/readline/stop 生命周期。
    """

    def __init__(self, adapter: AdbCommandPort, device_name: str) -> None:
        """
        Args:
            adapter: AdbCommandPort 实现 (生产 SubprocessAdbAdapter,测试 FakeAdbAdapter)
            device_name: ADB 设备标识 (如 '192.168.1.100:5555')
        """
        self._adapter = adapter
        self._device_name = device_name
        self._process: subprocess.Popen | None = None

    def clear_buffer(self) -> AdbResult:
        """清空 logcat 缓冲区 (adb logcat -c)。

        Returns:
            AdbResult: adapter.execute 的结果 (success/returncode/stdout/stderr)
        """
        return self._adapter.execute(
            ["-s", self._device_name, "logcat", "-c"],
        )

    def start_stream(self) -> None:
        """启动流式 logcat 读取 (Popen)。

        修复 L155 bug: adb 路径走 adapter,不再硬编码 "adb"。
        异常冒泡到 facade (薄封装)。
        """
        self._process = self._adapter.popen_stream(
            ["-s", self._device_name, "logcat", "-v", "threadtime"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )

    def readline(self) -> bytes | None:
        """读取一行 stdout。

        Returns:
            bytes: 含 \\n 的行,EOF 返回 None。
            未启动 (start_stream 未调用) 也返回 None。
        """
        if self._process is None or self._process.stdout is None:
            return None
        line = self._process.stdout.readline()
        return line if line else None

    def is_alive(self) -> bool:
        """子进程是否仍在运行。

        Returns:
            True 若 start_stream 已调用且 poll() 返回 None (运行中)。
            False 若未启动或已终止。
        """
        if self._process is None:
            return False
        return self._process.poll() is None

    def stop(self) -> None:
        """停止子进程: terminate → wait(3) → kill → wait(2)。幂等。

        异常静默吞掉 (调用方在 stop 路径不期望抛异常)。
        """
        if self._process is None:
            return
        try:
            self._process.terminate()
            try:
                self._process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                self._process.kill()
                self._process.wait(timeout=2)
        except Exception as e:
            # M8: 加可观测性 (terminate/wait/kill 失败已知, 记录原因便于排查孤儿进程)
            logger.warning(f"LogcatProcess stop failed (non-fatal, process may be orphaned): {e}")
        self._process = None

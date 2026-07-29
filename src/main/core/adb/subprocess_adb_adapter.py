"""SubprocessAdbAdapter — subprocess.run/Popen 实现 AdbCommandPort。

设计:
- 唯一 subprocess 出口,所有 16+ 处 subprocess.run/Popen 散落收敛到此
- 注入 runner (默认 subprocess.run),便于单元测试
- 注入 popen_factory (默认 subprocess.Popen),便于单元测试
- ADB_CMD 模块级常量保留 (向后兼容)
- 异常包装为 AdbResult(-1, "", str(exc)),不外抛 (仅 execute 路径)
- stdout/stderr None 防御 → "" (仅 execute 路径)
- popen_stream 不包装异常 (调用方负责 Popen 生命周期管理)
"""
from __future__ import annotations

import os
import subprocess
from collections.abc import Callable

from main.core.adb.adb_port import AdbResult

ADB_CMD = os.environ.get("XKAUTOTESTER_ADB_PATH", "adb")


class SubprocessAdbAdapter:
    """生产 Adapter — subprocess.run/Popen 实现 AdbCommandPort。

    隐藏:
    - ADB_CMD 路径解析 (修复原 logcat_monitor.py L155 硬编码 "adb" bug)
    - subprocess.run 参数构造 (capture_output/text/timeout)
    - subprocess.Popen 参数构造 (stdout/stderr PIPE 默认)
    - TimeoutExpired / Exception → AdbResult 转换 (仅 execute)
    - stdout/stderr None 防御 → "" (仅 execute)
    """

    def __init__(
        self,
        adb_path: str = ADB_CMD,
        runner: Callable[..., subprocess.CompletedProcess] | None = None,
        popen_factory: Callable[..., subprocess.Popen] | None = None,
    ) -> None:
        """
        Args:
            adb_path: adb 二进制路径 (默认 ADB_CMD 环境变量)
            runner: subprocess.run 或等价函数 (execute 测试注入用)
            popen_factory: subprocess.Popen 或等价函数 (popen_stream 测试注入用)
        """
        self._adb_path = adb_path
        self._runner = runner if runner is not None else subprocess.run
        self._popen_factory = popen_factory if popen_factory is not None else subprocess.Popen

    def execute(
        self,
        args: list[str],
        *,
        timeout: float = 10.0,
        capture_output: bool = True,
        text: bool = True,
    ) -> AdbResult:
        """执行 adb <args>,返回 AdbResult。异常包装,不外抛。"""
        cmd = [self._adb_path, *args]
        try:
            proc = self._runner(
                cmd,
                capture_output=capture_output,
                text=text,
                timeout=timeout,
            )
            return AdbResult(
                returncode=proc.returncode,
                stdout=proc.stdout or "",
                stderr=proc.stderr or "",
            )
        except subprocess.TimeoutExpired as e:
            return AdbResult(-1, "", f"timeout: {e}")
        except Exception as e:
            return AdbResult(-1, "", str(e))

    def popen_stream(
        self,
        args: list[str],
        **popen_kwargs,
    ) -> subprocess.Popen:
        """流式启动 adb <args>,返回 Popen 用于逐行读取 stdout。

        修复 L155 bug: adb 路径走 self._adb_path,不再硬编码 "adb"。

        默认 stdout=PIPE + stderr=PIPE (调用方可覆盖)。
        不捕获、不超时、不包装异常 — 调用方负责 Popen 生命周期。
        """
        cmd = [self._adb_path, *args]
        kwargs = {
            "stdout": subprocess.PIPE,
            "stderr": subprocess.PIPE,
            **popen_kwargs,
        }
        return self._popen_factory(cmd, **kwargs)

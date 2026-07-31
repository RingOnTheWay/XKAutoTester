"""adb 命令执行 Port — 跨进程边界抽象。

定义:
- AdbResult: 不可变值对象,封装 returncode/stdout/stderr
- AdbCommandPort: Protocol,双方法 execute + popen_stream

设计:
- Protocol (PEP 544) 鸭子类型,FakeAdapter 无需继承
- execute: 一次性命令 (捕获 stdout/stderr,超时控制)
- popen_stream: 流式启动 (长生命周期,readline 循环,不超时)
- AdbResult.success property 代替 16 处 returncode == 0 判断
"""
from __future__ import annotations

import subprocess
from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class AdbResult:
    """adb 命令执行结果 (不可变值对象)。

    Attributes:
        returncode: 进程退出码 (0=成功, -1=异常/超时)
        stdout: 标准输出 (防御 None,空字符串)
        stderr: 标准错误 (防御 None,空字符串)
    """

    returncode: int
    stdout: str
    stderr: str

    @property
    def success(self) -> bool:
        """退出码为 0 即成功。"""
        return self.returncode == 0


class AdbCommandPort(Protocol):
    """adb 命令执行 Port — 跨进程边界抽象。

    双方法:
    - execute: 一次性命令 (capture_output + timeout)
    - popen_stream: 流式启动 (PIPE + readline 循环,不超时)

    生产实现 SubprocessAdbAdapter,测试用 FakeAdbAdapter (鸭子类型)。
    """

    def execute(
        self,
        args: list[str],
        *,
        timeout: float = 10.0,
        capture_output: bool = True,
        text: bool = True,
    ) -> AdbResult:
        """执行 adb <args>,返回 AdbResult。异常由 adapter 包装,不外抛。

        Args:
            args: adb 参数列表 (如 ['-s', 'dev:5555', 'shell', 'pidof', 'com.x'])
            timeout: 超时秒数 (默认 10s)
            capture_output: 是否捕获 stdout/stderr (默认 True)
            text: 是否以文本模式返回 (默认 True)

        Returns:
            AdbResult: 不可变结果,含 returncode/stdout/stderr
        """
        ...

    def popen_stream(
        self,
        args: list[str],
        **popen_kwargs,
    ) -> subprocess.Popen:
        """流式启动 adb <args>,返回 Popen 用于逐行读取 stdout。

        区别于 execute:
        - 长生命周期 (readline 循环读取)
        - 不捕获 stdout (PIPE 用于流式读取)
        - 不超时 (持续到 stop)
        - 调用方负责 Popen 生命周期 (terminate/wait/kill)

        Args:
            args: adb 参数列表 (如 ['-s', 'dev:5555', 'logcat', '-v', 'threadtime'])
            **popen_kwargs: 透传给 Popen (如 stdout=PIPE, stderr=PIPE)

        Returns:
            subprocess.Popen: 已启动的子进程,stdout 可 readline
        """
        ...

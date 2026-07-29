"""FakeAdbAdapter — 测试用 AdbCommandPort 鸭子类型实现。

提供:
- when(args_prefix, result): 注册 execute 响应
- when_stream(args_prefix, lines): 注册 popen_stream 响应
- execute(args, ...): 返回匹配响应,记录调用
- popen_stream(args, **kwargs): 返回 FakePopen,记录调用
- calls: 所有 execute 调用历史
- popen_calls: 所有 popen_stream 调用历史

设计:
- 按 args 前缀匹配 (支持模糊匹配多命令场景)
- execute 无匹配返回 AdbResult(0, "", "")
- popen_stream 无匹配返回 FakePopen([]) (空流,立即 EOF)
- 纯 Python,无 subprocess 依赖
"""
from __future__ import annotations

from main.core.adb.adb_port import AdbResult


class _FakePopenStdout:
    """Fake Popen.stdout — readline 返回预注册行。"""

    def __init__(self, lines: list[bytes]) -> None:
        self._lines = list(lines)

    def readline(self) -> bytes:
        """返回下一行 (含 \\n); 列表空返回 b'' 表示 EOF。"""
        if not self._lines:
            return b""
        return self._lines.pop(0)


class FakePopen:
    """Fake subprocess.Popen — 满足 LogcatProcess 调用契约。

    提供:
    - stdout: _FakePopenStdout (readline 逐行返回)
    - stderr: _FakePopenStdout (空,默认)
    - poll(): None=运行中, 0=已终止
    - terminate() / kill(): 标记终止
    - wait(timeout): 立即返回 0
    """

    def __init__(self, lines: list[bytes]) -> None:
        self.stdout = _FakePopenStdout(lines)
        self.stderr = _FakePopenStdout([])
        self._poll: int | None = None

    def poll(self) -> int | None:
        return self._poll

    def terminate(self) -> None:
        self._poll = 0

    def kill(self) -> None:
        self._poll = 0

    def wait(self, timeout: float | None = None) -> int:
        return 0


class FakeAdbAdapter:
    """测试 fake — 鸭子类型满足 AdbCommandPort Protocol。"""

    def __init__(self) -> None:
        self.calls: list[list[str]] = []
        self.popen_calls: list[list[str]] = []
        self._responses: list[tuple[tuple[str, ...], AdbResult]] = []
        self._stream_responses: list[tuple[tuple[str, ...], list[bytes]]] = []

    def when(self, args_prefix: list[str], result: AdbResult) -> None:
        """注册 execute 响应: 当 args 前 N 位匹配 args_prefix 时返回 result。"""
        self._responses.append((tuple(args_prefix), result))

    def when_stream(self, args_prefix: list[str], lines: list[bytes]) -> None:
        """注册 popen_stream 响应: 当 args 前 N 位匹配时返回 FakePopen(lines)。"""
        self._stream_responses.append((tuple(args_prefix), list(lines)))

    def execute(
        self,
        args: list[str],
        *,
        timeout: float = 10.0,
        capture_output: bool = True,
        text: bool = True,
    ) -> AdbResult:
        self.calls.append(list(args))
        # FIFO 消费: 找到第一个匹配项,返回并移除 (支持同 prefix 多次调用返回不同结果)
        for idx, (key, result) in enumerate(self._responses):
            if tuple(args[: len(key)]) == key:
                self._responses.pop(idx)
                return result
        return AdbResult(0, "", "")

    def popen_stream(self, args: list[str], **popen_kwargs) -> FakePopen:
        """返回 FakePopen,按 when_stream 注册的行列表逐行返回。"""
        self.popen_calls.append(list(args))
        for idx, (key, lines) in enumerate(self._stream_responses):
            if tuple(args[: len(key)]) == key:
                self._stream_responses.pop(idx)
                return FakePopen(lines)
        return FakePopen([])

    @property
    def call_count(self) -> int:
        return len(self.calls)

    @property
    def popen_call_count(self) -> int:
        return len(self.popen_calls)

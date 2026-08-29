"""PytestProcess 单元测试 — subprocess 边界封装。

验证:
- run(): 启动 Popen + 双线程捕获 stdout/stderr + 阻塞至结束
- 返回 PytestRunResult (exit_code/stdout/stderr)
- ANSI 转义字符清理
- 命令完整传递给 popen_factory
- success 属性 (exit_code==0)

注入 FakePopen + popen_factory, 无真子进程。
"""

from __future__ import annotations

from collections.abc import Callable

from main.core.pytest.pytest_process import PytestProcess
from main.core.pytest.pytest_process_port import PytestRunResult


class _FakePipe:
    """模拟 subprocess.PIPE 文本流 (text=True)。

    readline() 返回剩余行, 耗尽后返回 "" (EOF)。
    """

    def __init__(self, lines: list[str]) -> None:
        self._lines = list(lines)
        self._idx = 0

    def readline(self) -> str:
        if self._idx >= len(self._lines):
            return ""
        line = self._lines[self._idx]
        self._idx += 1
        return line


class FakePopen:
    """模拟 subprocess.Popen。

    进程视为已退出 (poll() 立即返回 exit_code), 管道有缓冲数据。
    """

    def __init__(
        self,
        stdout_lines: list[str],
        stderr_lines: list[str],
        exit_code: int = 0,
    ) -> None:
        self.stdout = _FakePipe(stdout_lines)
        self.stderr = _FakePipe(stderr_lines)
        self._exit_code = exit_code

    def poll(self) -> int | None:
        return self._exit_code

    def wait(self) -> int:
        return self._exit_code


def make_popen_factory(
    captured: list[list[str]],
    stdout_lines: list[str],
    stderr_lines: list[str],
    exit_code: int = 0,
) -> Callable[[list[str]], FakePopen]:
    """构造 popen_factory, 记录 command 到 captured。"""

    def _factory(command: list[str]) -> FakePopen:
        captured.append(list(command))
        return FakePopen(stdout_lines, stderr_lines, exit_code)

    return _factory


class TestPytestProcessRun:
    """PytestProcess.run() 集成测试。"""

    def test_run_returns_pytest_run_result_with_all_fields(self) -> None:
        """run() 返回 PytestRunResult, 含 exit_code + stdout + stderr。

        stdout 行经 rstrip + \\n join, stderr 同理。
        """
        captured: list[list[str]] = []
        factory = make_popen_factory(
            captured,
            stdout_lines=["line1\n", "line2\n"],
            stderr_lines=["err1\n"],
            exit_code=0,
        )

        proc = PytestProcess(popen_factory=factory)
        result = proc.run(["python", "-m", "pytest", "-v"])

        assert isinstance(result, PytestRunResult)
        assert result.exit_code == 0
        assert result.stdout == "line1\nline2"
        assert result.stderr == "err1"
        assert captured[0] == ["python", "-m", "pytest", "-v"]

    def test_run_success_property_true_when_exit_zero(self) -> None:
        """exit_code=0 → PytestRunResult.success 为 True。"""
        factory = make_popen_factory([], [], [], exit_code=0)

        proc = PytestProcess(popen_factory=factory)
        result = proc.run(["pytest"])

        assert result.success is True

    def test_run_success_property_false_when_non_zero(self) -> None:
        """exit_code=1 → success 为 False。"""
        factory = make_popen_factory([], [], [], exit_code=1)

        proc = PytestProcess(popen_factory=factory)
        result = proc.run(["pytest"])

        assert result.success is False
        assert result.exit_code == 1

    def test_run_strips_ansi_escape_from_stdout(self) -> None:
        """stdout 含 ANSI 转义字符 → clean_ansi_escape 后再 rstrip + join。"""
        # \x1b[32m 是绿色, \x1b[0m 是重置
        ansi_line = "\x1b[32mPASSED\x1b[0m\n"
        factory = make_popen_factory([], [ansi_line], [], exit_code=0)

        proc = PytestProcess(popen_factory=factory)
        result = proc.run(["pytest"])

        # ANSI 转义被清理, 行尾 \n 被 rstrip
        assert result.stdout == "PASSED"

    def test_run_strips_ansi_escape_from_stderr(self) -> None:
        """stderr 含 ANSI 转义字符 → 清理。"""
        ansi_err = "\x1b[31mERROR\x1b[0m detail\n"
        factory = make_popen_factory([], [], [ansi_err], exit_code=1)

        proc = PytestProcess(popen_factory=factory)
        result = proc.run(["pytest"])

        assert result.stderr == "ERROR detail"

    def test_run_empty_stdout_stderr(self) -> None:
        """空 stdout + 空 stderr + exit=0 → 空字符串。"""
        factory = make_popen_factory([], [], [], exit_code=0)

        proc = PytestProcess(popen_factory=factory)
        result = proc.run(["pytest"])

        assert result.stdout == ""
        assert result.stderr == ""
        assert result.exit_code == 0

    def test_run_multiple_stderr_lines_joined(self) -> None:
        """多行 stderr 经 rstrip + \\n join。"""
        factory = make_popen_factory(
            [],
            [],
            ["err line 1\n", "err line 2\n", "err line 3\n"],
            exit_code=1,
        )

        proc = PytestProcess(popen_factory=factory)
        result = proc.run(["pytest"])

        assert result.stderr == "err line 1\nerr line 2\nerr line 3"

    def test_run_preserves_exit_code_2_interrupted(self) -> None:
        """exit_code=2 (中断) 保留, success=False。"""
        factory = make_popen_factory([], [], [], exit_code=2)

        proc = PytestProcess(popen_factory=factory)
        result = proc.run(["pytest"])

        assert result.exit_code == 2
        assert result.success is False

    def test_run_preserves_exit_code_5_no_tests(self) -> None:
        """exit_code=5 (无用例) 保留, success=False。"""
        factory = make_popen_factory([], [], [], exit_code=5)

        proc = PytestProcess(popen_factory=factory)
        result = proc.run(["pytest"])

        assert result.exit_code == 5
        assert result.success is False

    def test_pytest_run_result_is_frozen(self) -> None:
        """PytestRunResult 是 frozen dataclass, 不可变。"""
        from dataclasses import FrozenInstanceError

        import pytest as _pytest

        factory = make_popen_factory([], [], [], exit_code=0)

        proc = PytestProcess(popen_factory=factory)
        result = proc.run(["pytest"])

        with _pytest.raises(FrozenInstanceError):
            result.exit_code = 99  # type: ignore[misc]

    def test_run_passes_full_command_to_factory(self) -> None:
        """完整 command (含 sys.executable 前缀) 传给 popen_factory。"""
        captured: list[list[str]] = []
        factory = make_popen_factory(captured, [], [], exit_code=0)
        full_cmd = ["/usr/bin/python", "-m", "pytest", "-v", "--alluredir", "/tmp"]

        proc = PytestProcess(popen_factory=factory)
        proc.run(full_cmd)

        assert captured[0] == full_cmd


class _StuckPipe:
    """模拟"存活但无输出"的卡死子进程管道 (死锁用例)。

    readline() 恒返回 "" (管道空), 进程 poll() 恒 None (活着)。
    回归场景: 原实现 readline 阻塞/空转导致 process.wait(timeout=timeout)
    永远执行不到 → 看门狗失效 (P1-9 声称修复实则失效)。
    """

    def readline(self) -> str:
        return ""


class _StuckPopen:
    """模拟卡死的 Popen: 无输出 + 永不退出, 直到被 stop() terminate。"""

    def __init__(self) -> None:
        self.stopped = False
        self.stdout = _StuckPipe()
        self.stderr = _StuckPipe()

    def poll(self) -> int | None:
        return None if not self.stopped else 9

    def terminate(self) -> None:
        self.stopped = True

    def kill(self) -> None:
        self.stopped = True

    def wait(self, timeout: float | None = None) -> int:
        # terminate 视为立即生效, 不抛 TimeoutExpired (避免测试等待 4s kill 兜底)
        return 9


class TestPytestProcessTimeout:
    """R24 P1-4: 看门狗移入读循环 — 死锁用例超时强制终止回归测试。"""

    def test_timeout_kills_stuck_process_and_returns_minus_one(self) -> None:
        """卡死进程 (存活且无输出) 超时后 stop() + 返回 exit_code=-1。

        回归验证: 原实现在 stdout readline() 空转/阻塞期间, wait(timeout=timeout)
        永不执行 → run() 永久挂起; 修复后超时检查在读循环内按耗时触发。
        """
        stuck = _StuckPopen()

        def _factory(command: list[str]) -> _StuckPopen:
            return stuck

        proc = PytestProcess(popen_factory=_factory)
        result = proc.run(["pytest", "--timeout"], timeout=0.2)

        assert result.exit_code == -1
        assert "[pytest 执行超时 (0.2s), 已强制终止]" in result.stderr
        assert stuck.stopped is True, "超时路径必须调用 stop() 终止子进程"

    def test_timeout_none_no_watchdog(self) -> None:
        """timeout=None 时不触发看门狗, 正常流程不受影响。"""
        factory = make_popen_factory([], ["ok\n"], [], exit_code=0)

        proc = PytestProcess(popen_factory=factory)
        result = proc.run(["pytest"])

        assert result.exit_code == 0
        assert result.stdout == "ok"

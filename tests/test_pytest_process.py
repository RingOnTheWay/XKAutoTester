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

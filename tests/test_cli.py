"""Cli 入口深模块 factory 注入单元测试。

测试覆盖 (RFC §6 阶段 4):
- 成功路径 (fake PytestRunner exit_code=0 → return 0)
- 失败路径 (exit_code=1 → return 1)
- 异常路径 (PytestRunner raise → return 1)
- inspector 成功路径 (fake StdioProtocol + fake InspectorService)
- inspector 命令注册 (6 命令全注册, 名字来自常量)
- argparse 缺互斥参数 → SystemExit(2)
- stdout/stderr wrapper 注入跳过 utf-8 wrap (sys.stdout 不被替换)
- translator 注入 (i18n key 调用被捕获)

factory 注入用 MagicMock + identity wrapper, 跳过 TextIOWrapper (StringIO 无 buffer)。
"""

from __future__ import annotations

import sys
from unittest.mock import MagicMock

import pytest

from main.cli import Cli
from main.core.inspector_constants import (
    FIND_LOCATORS,
    GET_SCREENSHOT,
    GET_SOURCE,
    REFRESH,
    START_SESSION,
    STOP_SESSION,
)


class FakePytestRunner:
    """PytestRunner 替身。记录调用 + 可控 result/异常。"""

    def __init__(
        self,
        *,
        exit_code: int = 0,
        test_stats: dict | None = None,
        raise_exc: Exception | None = None,
    ) -> None:
        self._exit_code = exit_code
        self._test_stats = test_stats or {"passed": 1, "failed": 0, "skipped": 0, "broken": 0, "total": 1}
        self._raise_exc = raise_exc
        self.run_custom_tests_calls: list[dict] = []
        self.get_test_summary_calls: list[dict] = []

    def run_custom_tests(self, *, test_paths, markers, generate_allure, test_plan_name):
        if self._raise_exc is not None:
            raise self._raise_exc
        self.run_custom_tests_calls.append(
            {
                "test_paths": test_paths,
                "markers": markers,
                "generate_allure": generate_allure,
                "test_plan_name": test_plan_name,
            }
        )
        return {"exit_code": self._exit_code, "test_stats": self._test_stats}

    def get_test_summary(self, result):
        self.get_test_summary_calls.append({"result": result})
        return f"SUMMARY exit={result.get('exit_code', 0)}"


class FakeStdioProtocol:
    """StdioProtocol 替身。记录 command 注册 + run() 立即返回。"""

    def __init__(self) -> None:
        self.handlers: dict[str, object] = {}
        self.run_called = False

    def command(self, name: str):
        def decorator(func):
            self.handlers[name] = func
            return func

        return decorator

    def run(self) -> None:
        self.run_called = True


def _make_cli(
    *,
    pytest_runner: FakePytestRunner | None = None,
    stdio_proto: FakeStdioProtocol | None = None,
    inspector_service: MagicMock | None = None,
    translator=None,
    logger_factory=None,
) -> tuple[Cli, FakePytestRunner, FakeStdioProtocol, MagicMock]:
    """构造测试用 Cli。identity wrapper 跳过 utf-8 wrap (sys.stdout 无 buffer 风险)。"""
    pr = pytest_runner or FakePytestRunner()
    proto = stdio_proto or FakeStdioProtocol()
    svc = inspector_service or MagicMock(name="InspectorService")
    cli = Cli(
        pytest_runner_factory=lambda: pr,
        stdio_protocol_factory=lambda: proto,
        inspector_service_factory=lambda p: svc,
        translator=translator or (lambda key, **kw: f"T:{key}"),
        logger_factory=logger_factory or (lambda name: MagicMock(name=f"logger:{name}")),
        stdout_wrapper=lambda s: s,  # identity, 跳过 TextIOWrapper
        stderr_wrapper=lambda s: s,
    )
    return cli, pr, proto, svc


class TestCliRunTestsMode:
    """--test-paths 模式 3 路径测试。"""

    def test_run_tests_success_returns_zero(self) -> None:
        """exit_code=0 → return 0。"""
        cli, pr, _, _ = _make_cli(pytest_runner=FakePytestRunner(exit_code=0))

        code = cli.run(argv=["--test-paths", "a.py,b.py", "--markers", "smoke", "--test-plan", "p1"])

        assert code == 0
        assert len(pr.run_custom_tests_calls) == 1
        call = pr.run_custom_tests_calls[0]
        assert call["test_paths"] == ["a.py", "b.py"]
        assert call["markers"] == ["smoke"]
        assert call["test_plan_name"] == "p1"
        assert call["generate_allure"] is True

    def test_run_tests_failure_returns_one(self) -> None:
        """exit_code=1 → return 1。"""
        cli, _, _, _ = _make_cli(pytest_runner=FakePytestRunner(exit_code=1))

        code = cli.run(argv=["--test-paths", "a.py"])

        assert code == 1

    def test_run_tests_exception_returns_one(self) -> None:
        """PytestRunner raise → return 1 (不传播)。"""
        cli, _, _, _ = _make_cli(pytest_runner=FakePytestRunner(raise_exc=RuntimeError("boom")))

        code = cli.run(argv=["--test-paths", "a.py"])

        assert code == 1


class TestCliInspectorMode:
    """--inspector 模式测试。"""

    def test_inspector_success_runs_proto_and_returns_zero(self) -> None:
        """fake StdioProtocol.run() 调用 + return 0。"""
        cli, _, proto, _ = _make_cli()

        code = cli.run(argv=["--inspector"])

        assert code == 0
        assert proto.run_called is True

    def test_inspector_registers_six_commands_with_constant_names(self) -> None:
        """6 命令全注册, 名字来自 inspector_constants 具名常量。"""
        cli, _, proto, _ = _make_cli()

        cli.run(argv=["--inspector"])

        expected = {START_SESSION, GET_SCREENSHOT, GET_SOURCE, FIND_LOCATORS, REFRESH, STOP_SESSION}
        assert set(proto.handlers.keys()) == expected
        # 全部为可调用
        for name, handler in proto.handlers.items():
            assert callable(handler), f"{name} handler not callable"


class TestCliArgparseError:
    """argparse 错误处理测试。"""

    def test_no_mutex_arg_raises_system_exit_2(self) -> None:
        """缺互斥参数 → argparse SystemExit(2)。"""
        cli, _, _, _ = _make_cli()

        with pytest.raises(SystemExit) as exc_info:
            cli.run(argv=[])

        assert exc_info.value.code == 2


class TestCliSideEffectInjection:
    """副作用注入测试。"""

    def test_identity_stdio_wrapper_does_not_replace_sys_stdout(self) -> None:
        """stdout_wrapper=lambda s: s → sys.stdout 不变 (跳过 utf-8 wrap)。"""
        cli, _, _, _ = _make_cli()
        original_stdout = sys.stdout
        original_stderr = sys.stderr

        cli.run(argv=["--test-paths", "a.py"])

        assert sys.stdout is original_stdout
        assert sys.stderr is original_stderr

    def test_translator_injection_receives_i18n_keys(self) -> None:
        """translator 注入: 验证 argDescription + startTestPlan 等 key 调用被捕获。"""
        captured_keys: list[str] = []

        def fake_translator(key: str, **kw) -> str:
            captured_keys.append(key)
            return f"T:{key}"

        cli, _, _, _ = _make_cli(translator=fake_translator)

        cli.run(argv=["--test-paths", "a.py"])

        # argparse description + 至少一个 startTestPlan/testPaths key
        assert "python.main.argDescription" in captured_keys
        assert any(k.startswith("python.main.") for k in captured_keys)

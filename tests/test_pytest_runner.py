"""PytestRunner facade 集成测试。

验证:
- run_tests 编排 (清理 allure → build_args → process.run → parse_stats → record_run)
- 7 公共方法签名 + 返回 dict 形状
- process kwarg 注入 (FakePytestProcess 替身, 不起子进程)
- run_custom_tests 路径解析
- get_test_summary 委托 format_test_summary
- discover_test_directories 行为
- get_pytest_runner 单例
- L82 破口回归: pytest_runner.py 不含 import subprocess / threading.Thread / re

通过 monkeypatch XKAUTOTESTER_USER_DATA 隔离 fs, FakePytestProcess 隔离子进程。
"""
from __future__ import annotations

from pathlib import Path

import pytest

from main.core.pytest.pytest_process_port import PytestRunResult
from main.core.pytest_runner import PytestRunner, get_pytest_runner


class FakePytestProcess:
    """PytestProcessPort 测试替身。

    记录所有传入 command, 返回预设 PytestRunResult。
    默认返回成功 + 1 passed。
    """

    def __init__(
        self,
        *,
        stdout: str = "1 passed in 0.5s",
        stderr: str = "",
        exit_code: int = 0,
    ) -> None:
        self._stdout = stdout
        self._stderr = stderr
        self._exit_code = exit_code
        self.captured_commands: list[list[str]] = []

    def run(self, command: list[str]) -> PytestRunResult:
        self.captured_commands.append(list(command))
        return PytestRunResult(
            exit_code=self._exit_code,
            stdout=self._stdout,
            stderr=self._stderr,
        )


@pytest.fixture
def isolated_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """隔离 user data env, 返回 tmp_path 作为 user_data_root。

    - 设 XKAUTOTESTER_USER_DATA=tmp_path
    - 创建 config/ 目录 (config.json / pytest.ini 读取需要)
    """
    monkeypatch.setenv("XKAUTOTESTER_USER_DATA", str(tmp_path))
    (tmp_path / "config").mkdir(parents=True, exist_ok=True)
    return tmp_path


@pytest.fixture
def runner(isolated_env: Path) -> PytestRunner:
    """构造 PytestRunner, 注入 FakePytestProcess (返回成功)。"""
    return PytestRunner(process=FakePytestProcess())


class TestRunTests:
    """run_tests 编排测试。"""

    def test_success_returns_full_dict(self, runner: PytestRunner) -> None:
        """exit_code=0 + stdout 含 "1 passed" → 返回 dict 含 exit_code/stats/allure_dir。"""
        result = runner.run_tests(
            test_paths=["tests/test_a.py"],
            markers=["smoke"],
            test_plan_name="plan1",
            generate_allure=False,
        )

        assert result["exit_code"] == 0
        assert result["test_paths"] == ["tests/test_a.py"]
        assert result["markers"] == ["smoke"]
        assert result["test_plan_name"] == "plan1"
        assert result["test_stats"]["passed"] == 1
        assert result["test_stats"]["total"] == 1
        assert result["allure_results_dir"] is None  # generate_allure=False

    def test_default_test_paths_when_none(self, runner: PytestRunner) -> None:
        """test_paths=None → 默认 ["tests/"]。"""
        result = runner.run_tests(test_plan_name="plan2", generate_allure=False)

        assert result["test_paths"] == ["tests/"]

    def test_auto_test_plan_name_when_empty(self, runner: PytestRunner) -> None:
        """test_plan_name=None → 自动生成 "test_plan_<timestamp>"。"""
        result = runner.run_tests(generate_allure=False)

        assert result["test_plan_name"].startswith("test_plan_")

    def test_exit_code_5_preserved(self, isolated_env: Path) -> None:
        """exit_code=5 (无用例) 保留在返回 dict。"""
        fake = FakePytestProcess(stdout="no tests ran in 0.0s", exit_code=5)
        r = PytestRunner(process=fake)

        result = r.run_tests(generate_allure=False)

        assert result["exit_code"] == 5
        assert result["test_stats"]["total"] == 0

    def test_command_passed_to_process_includes_python_prefix(self, runner: PytestRunner) -> None:
        """完整命令 (含 sys.executable -m pytest 前缀) 传给 PytestProcess。"""
        fake = runner._process  # type: ignore[attr-defined]
        assert isinstance(fake, FakePytestProcess)

        runner.run_tests(test_paths=["tests/x.py"], generate_allure=False)

        cmd = fake.captured_commands[0]
        # [python, -m, pytest, ...args]
        assert cmd[1] == "-m"
        assert cmd[2] == "pytest"
        assert "python" in cmd[0].lower()
        assert "tests/x.py" in cmd

    def test_returns_run_data_in_result(self, runner: PytestRunner, capsys: pytest.CaptureFixture[str]) -> None:
        """run_tests 返回 result dict 含运行数据 (纯函数: 标记行副作用已移至 Cli 层)。

        单源化: Electron 解析 Cli 写的 XKAT_TEST_PLAN_RUN 标记行后由 TestPlanService 统一写 test_plans.json。
        PytestRunner 不再直写 stdout 标记行, 仅返回 dict 供 Cli 写入。
        """
        result = runner.run_tests(
            test_paths=["tests/a.py"], markers=["smoke"], test_plan_name="p1", generate_allure=False
        )

        # result dict 含运行数据 (供 Cli._write_electron_markers 写标记行)
        assert result["test_plan_name"] == "p1"
        assert result["test_paths"] == ["tests/a.py"]
        assert result["markers"] == ["smoke"]
        # PytestRunner 不再输出 stdout 标记行 (副作用移至 Cli)
        out = capsys.readouterr().out
        assert "XKAT_TEST_PLAN_RUN:" not in out
        assert "XKAT_ALLURE_RESULTS_DIR:" not in out


class TestConvenienceMethods:
    """run_all_tests / run_smoke_tests / run_unit_tests / run_exception_tests。"""

    def test_run_all_tests_no_markers(self, runner: PytestRunner) -> None:
        """run_all_tests: test_paths=["tests/"], markers=None。"""
        result = runner.run_all_tests(generate_allure=False)

        assert result["test_paths"] == ["tests/"]
        assert result["markers"] is None

    def test_run_smoke_tests_marker(self, runner: PytestRunner) -> None:
        """run_smoke_tests: markers=["smoke"]。"""
        result = runner.run_smoke_tests(generate_allure=False)

        assert result["markers"] == ["smoke"]

    def test_run_unit_tests_marker(self, runner: PytestRunner) -> None:
        """run_unit_tests: markers=["unit"]。"""
        result = runner.run_unit_tests(generate_allure=False)

        assert result["markers"] == ["unit"]

    def test_run_exception_tests_marker(self, runner: PytestRunner) -> None:
        """run_exception_tests: markers=["exception"]。"""
        result = runner.run_exception_tests(generate_allure=False)

        assert result["markers"] == ["exception"]


class TestRunCustomTests:
    """run_custom_tests 4 策略路径解析 + 无效路径。"""

    def test_valid_path_resolves_and_runs(
        self,
        isolated_env: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """有效路径 (project_root/tests/test_x.py) → 解析为相对路径 + 调 run_tests。"""
        project_root = isolated_env
        tests_dir = project_root / "tests"
        tests_dir.mkdir()
        (tests_dir / "test_x.py").touch()

        fake = FakePytestProcess()
        r = PytestRunner(project_root=project_root, process=fake)

        result = r.run_custom_tests(
            test_paths=["tests/test_x.py"],
            generate_allure=False,
            test_plan_name="custom1",
        )

        assert result["exit_code"] == 0
        # 命令中应包含解析后的路径
        cmd = fake.captured_commands[0]
        assert any("test_x.py" in arg for arg in cmd)

    def test_no_valid_paths_returns_exit_code_5(self, isolated_env: Path) -> None:
        """全部无效路径 → exit_code=5 + 空测试, 不调 process.run。"""
        project_root = isolated_env
        fake = FakePytestProcess()
        r = PytestRunner(project_root=project_root, process=fake)

        result = r.run_custom_tests(
            test_paths=["nonexistent.py", "also_missing.py"],
            generate_allure=False,
        )

        assert result["exit_code"] == 5
        assert result["test_stats"]["total"] == 0
        assert result["allure_results_dir"] is None
        assert fake.captured_commands == []  # 没启动子进程


class TestGetTestSummary:
    """get_test_summary 委托 format_test_summary 纯函数。"""

    def test_delegates_to_pure_function(self, runner: PytestRunner) -> None:
        """get_test_summary 返回字符串 (i18n 摘要)。"""
        result = {
            "exit_code": 0,
            "test_stats": {"passed": 1, "failed": 0, "skipped": 0, "broken": 0, "total": 1},
            "markers": ["smoke"],
            "test_paths": ["tests/"],
        }

        summary = runner.get_test_summary(result)

        assert isinstance(summary, str)
        assert len(summary) > 0


class TestDiscoverTestDirectories:
    """discover_test_directories 扫描项目根。"""

    def test_returns_list_of_test_dirs(
        self,
        isolated_env: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """扫描 project_root, 返回 tests/ + 任何含 test/tests/testing/spec 的目录。"""
        project_root = isolated_env
        (project_root / "tests").mkdir()
        (project_root / "spec_tests").mkdir()

        r = PytestRunner(project_root=project_root, process=FakePytestProcess())

        dirs = r.discover_test_directories()

        assert "tests/" in dirs
        assert "spec_tests/" in dirs


class TestGetPytestRunner:
    """get_pytest_runner 模块级单例。"""

    def test_singleton_returns_same_instance(self, isolated_env: Path) -> None:
        """get_pytest_runner 两次调用返回同一实例。"""
        # 重置模块级单例
        import main.core.pytest_runner as pr_module

        pr_module._pytest_runner_instance = None

        r1 = get_pytest_runner()
        r2 = get_pytest_runner()

        assert r1 is r2

        # 清理, 避免污染其他测试
        pr_module._pytest_runner_instance = None


class TestNoSubprocessLeak:
    """L82 破口回归: pytest_runner.py 源码不含 subprocess/threading/re 局部 import。"""

    def test_source_has_no_subprocess_import(self) -> None:
        """pytest_runner.py 不含 'import subprocess' (已移入 pytest_process.py)。"""
        import re

        source_path = Path(__file__).parent.parent / "src" / "main" / "core" / "pytest_runner.py"
        content = source_path.read_text(encoding="utf-8")

        # 用正则单词边界, 避免匹配 "import resolve_test_paths" 中的 "import re"
        assert not re.search(r"^import subprocess\b", content, re.MULTILINE)
        assert not re.search(r"^from subprocess\b", content, re.MULTILINE)

    def test_source_has_no_threading_import(self) -> None:
        """pytest_runner.py 不含 'from threading import Thread'。"""
        import re

        source_path = Path(__file__).parent.parent / "src" / "main" / "core" / "pytest_runner.py"
        content = source_path.read_text(encoding="utf-8")

        assert not re.search(r"^from threading\b", content, re.MULTILINE)
        assert not re.search(r"^import threading\b", content, re.MULTILINE)

    def test_source_has_no_re_import(self) -> None:
        """pytest_runner.py 不含 'import re' (已移入 stats_parser.py)。"""
        import re as re_module

        source_path = Path(__file__).parent.parent / "src" / "main" / "core" / "pytest_runner.py"
        content = source_path.read_text(encoding="utf-8")

        # 用单词边界, 避免匹配 "import resolve_test_paths" 中的 "import re"
        assert not re_module.search(r"^import re\b", content, re_module.MULTILINE)

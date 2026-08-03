"""PytestRunner 集成测试 - 字段改造 + result dict 运行数据验证。

单源化后 PytestRunner 不再持有 plan_repo, 也不再直写 stdout 标记行 (副作用移至 Cli 层)。
PytestRunner 为纯函数: 输入参数 → 输出 result dict, 供 Cli._write_electron_markers 写标记行。
Electron 侧 TestPlanService 统一写 test_plans.json (避免双端无锁并发写丢失更新)。
"""

from unittest.mock import MagicMock, patch

import pytest

from main.core.pytest_runner import PytestRunner


@pytest.fixture
def runner(tmp_path, monkeypatch):
    """构造 PytestRunner 实例（使用临时目录）"""
    monkeypatch.setenv("XKAUTOTESTER_USER_DATA", str(tmp_path))
    return PytestRunner()


@pytest.mark.unit
class TestPytestRunnerFields:
    """PytestRunner 字段改造验证"""

    def test_no_test_plans_field(self, runner):
        """应删除 self.test_plans 字段"""
        assert not hasattr(runner, "test_plans")

    def test_no_test_plans_file_field(self, runner):
        """应删除 self.test_plans_file 字段"""
        assert not hasattr(runner, "test_plans_file")

    def test_no_plan_repo_field(self, runner):
        """应删除 self.plan_repo 字段 (单源化: Electron 侧 TestPlanService 统一写 test_plans.json)"""
        assert not hasattr(runner, "plan_repo")

    def test_no_legacy_methods(self, runner):
        """应删除 5 个旧方法"""
        assert not hasattr(runner, "_record_test_plan")
        assert not hasattr(runner, "_load_test_plans")
        assert not hasattr(runner, "_save_test_plans")
        assert not hasattr(runner, "get_test_plans")
        assert not hasattr(runner, "get_test_plan_runs")


@pytest.mark.unit
class TestPytestRunnerResultData:
    """PytestRunner result dict 运行数据验证 (标记行副作用已移至 Cli 层, PytestRunner 为纯函数)"""

    @patch("subprocess.Popen")
    def test_run_tests_returns_run_data(self, mock_popen, runner, capsys):
        """run_tests 应返回含运行数据的 result dict (供 Cli._write_electron_markers 写标记行)"""
        mock_process = MagicMock()
        mock_process.stdout.readline.return_value = ""  # 立即结束读取循环
        mock_process.stderr.readline.return_value = ""
        mock_process.poll.return_value = 0  # exit_code = 0
        mock_process.wait.return_value = 0
        mock_popen.return_value = mock_process

        result = runner.run_tests(
            test_paths=["tests/test_fake.py"], markers=None, generate_allure=False, test_plan_name="mocked_test"
        )

        assert result["test_plan_name"] == "mocked_test"
        assert result["test_paths"] == ["tests/test_fake.py"]
        assert result["markers"] is None
        # PytestRunner 不再输出 stdout 标记行 (副作用移至 Cli)
        out = capsys.readouterr().out
        assert "XKAT_TEST_PLAN_RUN:" not in out

    @patch("subprocess.Popen")
    def test_result_includes_markers_when_provided(self, mock_popen, runner, capsys):
        """result dict 应包含 markers 字段"""
        mock_process = MagicMock()
        mock_process.stdout.readline.return_value = ""
        mock_process.stderr.readline.return_value = ""
        mock_process.poll.return_value = 0
        mock_process.wait.return_value = 0
        mock_popen.return_value = mock_process

        result = runner.run_tests(
            test_paths=["tests/"], markers=["smoke"], generate_allure=False, test_plan_name="mk"
        )

        assert result["markers"] == ["smoke"]

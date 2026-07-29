"""PytestRunner 集成测试 - plan_repo 持有 + 旧字段移除验证"""

from unittest.mock import MagicMock, patch

import pytest

from main.core.pytest_runner import PytestRunner
from main.core.test_plan_repository import TestPlanRepository


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

    def test_has_plan_repo_field(self, runner):
        """应有 self.plan_repo 字段"""
        assert hasattr(runner, "plan_repo")
        assert isinstance(runner.plan_repo, TestPlanRepository)

    def test_no_legacy_methods(self, runner):
        """应删除 5 个旧方法"""
        assert not hasattr(runner, "_record_test_plan")
        assert not hasattr(runner, "_load_test_plans")
        assert not hasattr(runner, "_save_test_plans")
        assert not hasattr(runner, "get_test_plans")
        assert not hasattr(runner, "get_test_plan_runs")


@pytest.mark.unit
class TestPytestRunnerPlanRepoIntegration:
    """PytestRunner plan_repo 集成测试"""

    def test_plan_repo_uses_user_data_path(self, runner, tmp_path):
        """plan_repo 存储路径应使用 XKAUTOTESTER_USER_DATA"""
        expected_path = tmp_path / "config" / "test_plans.json"
        assert runner.plan_repo._storage_path == expected_path

    def test_record_run_via_plan_repo(self, runner):
        """通过 plan_repo.record_run 应能写入文件"""
        runner.plan_repo.record_run("integration_test", ["tests/"], ["smoke"], None)
        plans = runner.plan_repo.get_plans()
        assert len(plans) == 1
        assert plans[0]["name"] == "integration_test"

    @patch("subprocess.Popen")
    def test_run_tests_calls_plan_repo_record_run(self, mock_popen, runner):
        """run_tests 应调用 plan_repo.record_run"""
        # mock subprocess 避免真实 pytest 执行
        mock_process = MagicMock()
        mock_process.stdout.readline.return_value = ""  # 立即结束读取循环
        mock_process.stderr.readline.return_value = ""
        mock_process.poll.return_value = 0  # exit_code = 0
        mock_process.wait.return_value = 0
        mock_popen.return_value = mock_process

        # mock plan_repo 验证调用
        runner.plan_repo = MagicMock()

        runner.run_tests(
            test_paths=["tests/test_fake.py"], markers=None, generate_allure=False, test_plan_name="mocked_test"
        )

        runner.plan_repo.record_run.assert_called_once()
        # positional args: (test_plan_name, test_paths, markers, report_path)
        args, kwargs = runner.plan_repo.record_run.call_args
        assert args[0] == "mocked_test"
        assert args[1] == ["tests/test_fake.py"]
        assert args[2] is None
        assert args[3] is None

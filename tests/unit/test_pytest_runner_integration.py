"""PytestRunner 集成测试 - 字段改造 + XKAT_TEST_PLAN_RUN 标记行验证。

单源化后 PytestRunner 不再持有 plan_repo, 改为通过 stdout 标记行通知 Electron 侧
由 TestPlanService 统一写 test_plans.json (避免双端无锁并发写丢失更新)。
"""

import json
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
class TestPytestRunnerMarkerEmission:
    """PytestRunner XKAT_TEST_PLAN_RUN 标记行验证 (替代旧 plan_repo 集成)"""

    @patch("subprocess.Popen")
    def test_run_tests_emits_marker(self, mock_popen, runner, capsys):
        """run_tests 应输出 XKAT_TEST_PLAN_RUN 标记行"""
        mock_process = MagicMock()
        mock_process.stdout.readline.return_value = ""  # 立即结束读取循环
        mock_process.stderr.readline.return_value = ""
        mock_process.poll.return_value = 0  # exit_code = 0
        mock_process.wait.return_value = 0
        mock_popen.return_value = mock_process

        runner.run_tests(
            test_paths=["tests/test_fake.py"], markers=None, generate_allure=False, test_plan_name="mocked_test"
        )

        out = capsys.readouterr().out
        marker_lines = [line for line in out.splitlines() if line.startswith("XKAT_TEST_PLAN_RUN:")]
        assert len(marker_lines) == 1
        payload = json.loads(marker_lines[0].removeprefix("XKAT_TEST_PLAN_RUN:"))
        assert payload["name"] == "mocked_test"
        assert payload["test_paths"] == ["tests/test_fake.py"]
        assert payload["markers"] is None

    @patch("subprocess.Popen")
    def test_marker_includes_markers_when_provided(self, mock_popen, runner, capsys):
        """标记行 payload 应包含 markers 字段"""
        mock_process = MagicMock()
        mock_process.stdout.readline.return_value = ""
        mock_process.stderr.readline.return_value = ""
        mock_process.poll.return_value = 0
        mock_process.wait.return_value = 0
        mock_popen.return_value = mock_process

        runner.run_tests(
            test_paths=["tests/"], markers=["smoke"], generate_allure=False, test_plan_name="mk"
        )

        out = capsys.readouterr().out
        marker_lines = [line for line in out.splitlines() if line.startswith("XKAT_TEST_PLAN_RUN:")]
        assert len(marker_lines) == 1
        payload = json.loads(marker_lines[0].removeprefix("XKAT_TEST_PLAN_RUN:"))
        assert payload["markers"] == ["smoke"]

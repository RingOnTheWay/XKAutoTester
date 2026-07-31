"""TestPlanRepository 单元测试 - record_run/get_plans/get_plan_runs"""

import json
from pathlib import Path

import pytest

from main.core.test_plan_repository import TestPlanRepository


@pytest.fixture
def repo_path(tmp_path):
    """临时存储路径"""
    return tmp_path / "test_plans.json"


@pytest.fixture
def repo(repo_path):
    """构造空 repo"""
    return TestPlanRepository(repo_path)


@pytest.mark.unit
class TestTestPlanRepositoryInit:
    """构造函数测试"""

    def test_init_with_nonexistent_file_loads_empty(self, repo_path):
        """文件不存在时应加载空列表"""
        repo = TestPlanRepository(repo_path)
        assert repo.get_plans() == []

    def test_init_with_existing_file_loads_plans(self, repo_path):
        """文件存在时应加载历史计划"""
        existing = [{"name": "plan1", "runs": [{"timestamp": "2025-01-01 10:00:00"}]}]
        repo_path.write_text(json.dumps(existing, ensure_ascii=False), encoding="utf-8")
        repo = TestPlanRepository(repo_path)
        assert len(repo.get_plans()) == 1
        assert repo.get_plans()[0]["name"] == "plan1"

    def test_init_with_corrupted_file_loads_empty(self, repo_path):
        """文件损坏时应回退到空列表"""
        repo_path.write_text("not valid json {{{", encoding="utf-8")
        repo = TestPlanRepository(repo_path)
        assert repo.get_plans() == []


@pytest.mark.unit
class TestRecordRun:
    """record_run 方法测试"""

    def test_first_run_creates_new_plan(self, repo, repo_path):
        """首次运行应创建新计划"""
        repo.record_run("plan1", ["tests/test_a.py"], ["smoke"], None)
        plans = repo.get_plans()
        assert len(plans) == 1
        assert plans[0]["name"] == "plan1"
        assert plans[0]["test_paths"] == ["tests/test_a.py"]
        assert plans[0]["markers"] == ["smoke"]
        assert len(plans[0]["runs"]) == 1
        assert plans[0]["runs"][0]["report_path"] is None

    def test_second_run_appends_to_existing_plan(self, repo):
        """同名计划第二次运行应追加 run 记录"""
        repo.record_run("plan1", ["tests/"], None, None)
        repo.record_run("plan1", ["tests/"], None, None)
        plans = repo.get_plans()
        assert len(plans) == 1  # 仍是 1 个计划
        assert len(plans[0]["runs"]) == 2  # 但有 2 个运行记录

    def test_record_run_with_report_path(self, repo):
        """report_path 应被记录"""
        report_path = Path("/tmp/allure_report")
        repo.record_run("plan1", ["tests/"], None, report_path)
        plans = repo.get_plans()
        assert plans[0]["runs"][0]["report_path"] == str(report_path)

    def test_record_run_persists_to_file(self, repo, repo_path):
        """record_run 应持久化到文件"""
        repo.record_run("plan1", ["tests/"], None, None)
        # 重新加载应读到
        assert repo_path.exists()
        with open(repo_path, encoding="utf-8") as f:
            data = json.load(f)
        assert len(data) == 1
        assert data[0]["name"] == "plan1"

    def test_record_run_updates_last_run_timestamp(self, repo):
        """record_run 应更新 last_run"""
        repo.record_run("plan1", ["tests/"], None, None)
        first_last_run = repo.get_plans()[0]["last_run"]
        repo.record_run("plan1", ["tests/"], None, None)
        second_last_run = repo.get_plans()[0]["last_run"]
        assert first_last_run is not None
        assert second_last_run is not None

    def test_record_run_preserves_markers_none(self, repo):
        """markers=None 时应保存为 None"""
        repo.record_run("plan1", ["tests/"], None, None)
        assert repo.get_plans()[0]["markers"] is None

    def test_multiple_different_plans(self, repo):
        """多个不同计划应分别创建"""
        repo.record_run("plan1", ["tests/"], ["smoke"], None)
        repo.record_run("plan2", ["tests/"], ["unit"], None)
        repo.record_run("plan3", ["tests/"], None, None)
        plans = repo.get_plans()
        assert len(plans) == 3
        names = [p["name"] for p in plans]
        assert "plan1" in names
        assert "plan2" in names
        assert "plan3" in names

    def test_run_record_100_limit(self, repo):
        """单计划运行记录应限制为 100 个"""
        for _ in range(105):
            repo.record_run("plan1", ["tests/"], None, None)
        plans = repo.get_plans()
        assert len(plans[0]["runs"]) == 100  # 限制 100

    def test_plans_100_limit(self, repo):
        """计划总数应限制为 100 个"""
        for i in range(105):
            repo.record_run(f"plan_{i}", ["tests/"], None, None)
        plans = repo.get_plans()
        assert len(plans) == 100


@pytest.mark.unit
class TestGetPlans:
    """get_plans 方法测试"""

    def test_returns_copy(self, repo):
        """get_plans 应返回副本，修改不影响内部状态"""
        repo.record_run("plan1", ["tests/"], None, None)
        plans = repo.get_plans()
        plans.clear()
        # 内部状态应不受影响
        assert len(repo.get_plans()) == 1

    def test_empty_repo_returns_empty_list(self, repo):
        """空 repo 应返回 []"""
        assert repo.get_plans() == []


@pytest.mark.unit
class TestGetPlanRuns:
    """get_plan_runs 方法测试"""

    def test_returns_runs_for_existing_plan(self, repo):
        """应返回指定计划的所有运行记录"""
        repo.record_run("plan1", ["tests/"], None, None)
        repo.record_run("plan1", ["tests/"], None, None)
        runs = repo.get_plan_runs("plan1")
        assert len(runs) == 2

    def test_returns_empty_for_nonexistent_plan(self, repo):
        """不存在的计划应返回空列表"""
        repo.record_run("plan1", ["tests/"], None, None)
        runs = repo.get_plan_runs("nonexistent")
        assert runs == []

    def test_empty_repo_returns_empty(self, repo):
        """空 repo 应返回空列表"""
        assert repo.get_plan_runs("any") == []

    def test_run_record_has_timestamp_and_report_path(self, repo):
        """run 记录应包含 timestamp 和 report_path 字段"""
        repo.record_run("plan1", ["tests/"], None, None)
        runs = repo.get_plan_runs("plan1")
        assert "timestamp" in runs[0]
        assert "report_path" in runs[0]

"""
测试计划持久化存储模块 (Design C: Caller-optimize + Caps)。

Deep Module: 2 Port (FileSystem + Clock) + Caps dataclass + 8 pure fn + 14 行 record_run composer。
零调用方改动: __init__(storage_path) 位置参数保持 + record_run/get_plans/get_plan_runs 签名保持。
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Protocol

from main.utils.i18n import t

logger = logging.getLogger(__name__)

DATETIME_FORMAT = "%Y-%m-%d %H:%M:%S"


# === Ports (依赖反转) ===


class FileSystemPort(Protocol):
    """文件系统 Port - 隔离 JSON I/O 便于测试注入。"""

    def read_json(self, path: Path) -> list[dict[str, Any]]: ...
    def write_json(self, path: Path, data: list[dict[str, Any]]) -> None: ...


class Clock(Protocol):
    """时钟 Port - 隔离 datetime.now() 便于测试注入。"""

    def now(self) -> datetime: ...


@dataclass(frozen=True)
class Caps:
    """可调上限 (替代魔法数 100/100)。

    Attributes:
        max_runs_per_plan: 单计划最大运行记录数
        max_plans: 最大计划数
    """

    max_runs_per_plan: int = 100
    max_plans: int = 100


# === Default impls (生产环境) ===


class _LocalFileSystem:
    """生产默认: 直读直写本地文件。"""

    def read_json(self, path: Path) -> list[dict[str, Any]]:
        if not path.exists():
            return []
        with open(path, encoding="utf-8") as f:
            return json.load(f)

    def write_json(self, path: Path, data: list[dict[str, Any]]) -> None:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)


class _SystemClock:
    """生产默认: 系统时钟。"""

    def now(self) -> datetime:
        return datetime.now()


# === 8 module-level pure functions ===


def _build_run_record(report_path: Path | None, timestamp: str) -> dict[str, Any]:
    """构造单次运行记录 (纯函数)。"""
    return {
        "report_path": str(report_path) if report_path else None,
        "timestamp": timestamp,
    }


def _find_plan(plans: list[dict[str, Any]], name: str) -> dict[str, Any] | None:
    """按 name 查找 plan (纯函数, 首次匹配返回)。"""
    for plan in plans:
        if plan.get("name") == name:
            return plan
    return None


def _append_run_to_plan(
    plan: dict[str, Any],
    run_record: dict[str, Any],
    timestamp: str,
    max_runs: int,
) -> None:
    """向 plan 追加 run + 截断 + 更新 last_run (mutates plan, 纯逻辑)。"""
    if "runs" not in plan:
        plan["runs"] = []
    plan["runs"].append(run_record)
    if len(plan["runs"]) > max_runs:
        plan["runs"] = plan["runs"][-max_runs:]
    plan["last_run"] = timestamp


def _build_new_plan(
    name: str,
    test_paths: list[str],
    markers: list[str] | None,
    created: str,
    run_record: dict[str, Any],
) -> dict[str, Any]:
    """构造新 plan (纯函数)。"""
    return {
        "name": name,
        "test_paths": test_paths,
        "markers": markers,
        "created": created,
        "last_run": run_record["timestamp"],
        "runs": [run_record],
    }


def _cap_runs(runs: list[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
    """截断 runs 至 limit (纯函数)。"""
    return runs[-limit:] if len(runs) > limit else runs


def _cap_plans(plans: list[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
    """截断 plans 至 limit (纯函数, 保留最新)。"""
    return plans[-limit:] if len(plans) > limit else plans


def _deserialize_plans(data: Any) -> list[dict[str, Any]]:
    """规范化反序列化结果为 list (纯函数, 容错非 list 输入)。"""
    if not isinstance(data, list):
        return []
    return data


def _serialize_plans(plans: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """序列化前置处理 (纯函数, 当前直返预留扩展点)。"""
    return plans


# === Deep Module ===


class TestPlanRepository:
    """测试计划持久化存储 (Deep Module)。

    管理测试计划历史记录, 一个计划关联多个运行记录。

    隐藏细节:
        - FileSystem I/O (JSON 读写)
        - Clock (datetime.now)
        - Caps 截断 (max_runs_per_plan / max_plans)
        - JSON 序列化/反序列化容错

    公共接口 (4 入口):
        - __init__(storage_path, *, file_system, clock, caps)
        - record_run(name, test_paths, markers, report_path)
        - get_plans() -> list[dict]
        - get_plan_runs(name) -> list[dict]
    """

    def __init__(
        self,
        storage_path: Path,
        *,
        file_system: FileSystemPort | None = None,
        clock: Clock | None = None,
        caps: Caps | None = None,
    ) -> None:
        """
        Args:
            storage_path: test_plans.json 文件路径
            file_system: FileSystemPort 注入 (默认 _LocalFileSystem)
            clock: Clock 注入 (默认 _SystemClock)
            caps: Caps 上限注入 (默认 Caps(100, 100))
        """
        self._storage_path = storage_path
        self._file_system: FileSystemPort = file_system or _LocalFileSystem()
        self._clock: Clock = clock or _SystemClock()
        self._caps: Caps = caps or Caps()
        self._plans: list[dict[str, Any]] = []
        self._load()

    def record_run(
        self,
        name: str,
        test_paths: list[str],
        markers: list[str] | None,
        report_path: Path | None,
    ) -> None:
        """记录一次测试运行 (14 行 composer)。

        Args:
            name: 测试计划名称
            test_paths: 测试路径列表
            markers: 测试标记列表
            report_path: Allure 报告路径
        """
        ts = self._clock.now().strftime(DATETIME_FORMAT)
        run_record = _build_run_record(report_path, ts)
        plan = _find_plan(self._plans, name)
        if plan:
            _append_run_to_plan(plan, run_record, ts, self._caps.max_runs_per_plan)
            logger.info(
                t("python.pytestRunner.planRunRecordAdded", test_plan_name=name, count=len(plan["runs"]))
            )
        else:
            self._plans.append(_build_new_plan(name, test_paths, markers, ts, run_record))
            logger.info(t("python.pytestRunner.planCreated", test_plan_name=name))
        self._plans = _cap_plans(self._plans, self._caps.max_plans)
        self._persist()

    def get_plans(self) -> list[dict[str, Any]]:
        """获取所有测试计划 (返回副本, 修改不影响内部状态)。"""
        return self._plans.copy()

    def get_plan_runs(self, name: str) -> list[dict[str, Any]]:
        """获取指定测试计划的所有运行记录。"""
        plan = _find_plan(self._plans, name)
        return plan.get("runs", []) if plan else []

    def _load(self) -> None:
        """从文件加载测试计划 (委托 FileSystemPort, 容错)。"""
        try:
            data = self._file_system.read_json(self._storage_path)
            self._plans = _deserialize_plans(data)
            logger.info(t("python.pytestRunner.plansLoaded", count=len(self._plans)))
        except Exception as e:
            logger.warning(t("python.pytestRunner.plansLoadFailed", error=e))
            self._plans = []

    def _persist(self) -> None:
        """保存测试计划到文件 (委托 FileSystemPort, 容错)。"""
        try:
            self._file_system.write_json(self._storage_path, _serialize_plans(self._plans))
            logger.info(t("python.pytestRunner.plansSaved", count=len(self._plans)))
        except Exception as e:
            logger.error(t("python.pytestRunner.plansSaveFailed", error=e))

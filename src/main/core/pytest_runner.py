"""PytestRunner — pytest 测试运行器 facade。

编排 4 纯函数 + PytestProcess 协作者, 保留原 7 公共方法签名 + 返回 dict 形状。

深模块协作者 (src/main/core/pytest/):
- PytestProcess: subprocess.Popen + 双线程捕获 (注入 PytestProcessPort)
- args_builder.build_pytest_args: 命令行参数构建纯函数
- stats_parser.parse_test_stats: 用例统计解析纯函数
- summary_formatter.format_test_summary: 摘要 i18n 拼接纯函数
- path_resolver.resolve_test_paths: 4 策略路径解析纯函数

调用方契约 (__main__.py ElectronTestRunner) 零改动:
- 7 公共方法签名保持
- 返回 dict 字段形状保持
- get_pytest_runner() 单例保留
"""

from __future__ import annotations

import logging
import shutil
import sys
import time
from pathlib import Path
from typing import Any

from main.core.pytest.args_builder import build_pytest_args
from main.core.pytest.path_resolver import resolve_test_paths
from main.core.pytest.pytest_process import PytestProcess
from main.core.pytest.pytest_process_port import PytestProcessPort
from main.core.pytest.stats_parser import parse_test_stats
from main.core.pytest.summary_formatter import format_test_summary
from main.utils.i18n import t
from main.utils.paths import get_logs_path, get_project_root

logger = logging.getLogger(__name__)


class PytestRunner:
    """Pytest 测试运行器 facade。

    7 公共方法签名 + 返回 dict 形状保持 (__main__.py 零改动)。
    """

    def __init__(
        self,
        project_root: Path | None = None,
        *,
        process: PytestProcessPort | None = None,
    ) -> None:
        """
        Args:
            project_root: 项目根 (默认 get_project_root())
            process: PytestProcessPort 注入 (默认 PytestProcess, 测试用 FakePytestProcess)
        """
        self.project_root = project_root or get_project_root()

        self.allure_base_dir = get_logs_path("Allure")
        self.allure_results_dir = self.allure_base_dir / "allure-results"
        self.allure_report_base_dir = self.allure_base_dir / "allure-reports"

        self._process: PytestProcessPort = process or PytestProcess()
        self._pytest_ini = self.project_root / "config" / "pytest.ini"

    def run_tests(
        self,
        test_paths: list[str] = None,
        markers: list[str] = None,
        keywords: list[str] = None,
        generate_allure: bool = True,
        test_plan_name: str = None,
    ) -> dict[str, Any]:
        """运行 Pytest 测试。

        Args:
            test_paths: 测试路径列表, 默认 ["tests/"]
            markers: 测试标记列表 (OR 拼接为 -m)
            keywords: 关键字过滤列表 (AND 拼接为 -k)
            generate_allure: 是否生成 Allure 报告
            test_plan_name: 测试计划名称 (用于报告目录)

        Returns:
            测试结果 dict (exit_code/allure_results_dir/test_paths/markers/
            keywords/test_plan_name/test_stats)
        """
        if test_paths is None:
            test_paths = ["tests/"]

        if not test_plan_name:
            test_plan_name = f"test_plan_{int(time.time())}"

        # 清理之前的 allure-results 目录
        if self.allure_results_dir.exists():
            shutil.rmtree(self.allure_results_dir)
        self.allure_results_dir.mkdir(parents=True, exist_ok=True)

        # 构建参数 (纯函数)
        pytest_args = build_pytest_args(
            test_paths=test_paths,
            markers=markers,
            keywords=keywords,
            allure_results_dir=self.allure_results_dir,
            pytest_ini_path=self._pytest_ini,
        )

        logger.info(t("python.pytestRunner.startPytest", test_plan_name=test_plan_name, pytest_args=pytest_args))

        # 完整命令: sys.executable -m pytest + args
        pytest_command = [sys.executable, "-m", "pytest"] + pytest_args
        logger.info(t("python.pytestRunner.executeCommand", command=" ".join(pytest_command)))

        # 执行 (PytestProcess 封 Popen + 双线程, 替代原 L82-128)
        run_result = self._process.run(pytest_command)

        # 解析统计 (纯函数)
        test_stats = parse_test_stats(run_result.stdout)
        exit_code = run_result.exit_code

        # 检查 allure 结果是否存在
        allure_results_dir: str | None = None
        allure_skipped_reason: str | None = None
        if generate_allure and self.allure_results_dir.exists():
            if not self._has_allure_results():
                allure_skipped_reason = "no_results"
                logger.warning(t("python.pytestRunner.noAllureResults", exit_code=exit_code))
            else:
                allure_results_dir = str(self.allure_results_dir)

        if allure_skipped_reason == "no_results":
            logger.warning(t("python.pytestRunner.noTestResults", exit_code=exit_code))
        elif exit_code == 0:
            if allure_results_dir:
                logger.info(t("python.pytestRunner.testSuccessWithReport"))
            else:
                logger.info(t("python.pytestRunner.testSuccessNoReport"))
        else:
            if allure_results_dir:
                logger.warning(t("python.pytestRunner.testFailedWithReport", exit_code=exit_code))
            else:
                logger.warning(t("python.pytestRunner.testFailedNoReport", exit_code=exit_code))

        # 标记行 (XKAT_ALLURE_RESULTS_DIR / XKAT_TEST_PLAN_RUN) 由 Cli 层基于 result dict 写入 stdout,
        # PytestRunner 保持纯函数 (输入参数 → 输出 dict, 无 stdout 副作用)

        return {
            "exit_code": exit_code,
            "allure_results_dir": allure_results_dir,
            "test_paths": test_paths,
            "markers": markers,
            "keywords": keywords,
            "test_plan_name": test_plan_name,
            "test_stats": test_stats,
        }

    def run_all_tests(self, generate_allure: bool = True, test_plan_name: str = None) -> dict[str, Any]:
        """运行所有测试。"""
        logger.info(t("python.pytestRunner.startAllTests"))
        return self.run_tests(test_paths=["tests/"], generate_allure=generate_allure, test_plan_name=test_plan_name)

    def run_smoke_tests(self, generate_allure: bool = True, test_plan_name: str = None) -> dict[str, Any]:
        """运行冒烟测试。"""
        logger.info(t("python.pytestRunner.startSmokeTests"))
        return self.run_tests(
            test_paths=["tests/"], markers=["smoke"], generate_allure=generate_allure, test_plan_name=test_plan_name
        )

    def run_unit_tests(self, generate_allure: bool = True, test_plan_name: str = None) -> dict[str, Any]:
        """运行单元功能测试。"""
        logger.info(t("python.pytestRunner.startUnitTests"))
        return self.run_tests(
            test_paths=["tests/"], markers=["unit"], generate_allure=generate_allure, test_plan_name=test_plan_name
        )

    def run_exception_tests(self, generate_allure: bool = True, test_plan_name: str = None) -> dict[str, Any]:
        """运行异常场景测试。"""
        logger.info(t("python.pytestRunner.startExceptionTests"))
        return self.run_tests(
            test_paths=["tests/"], markers=["exception"], generate_allure=generate_allure, test_plan_name=test_plan_name
        )

    def _has_allure_results(self) -> bool:
        result_files = list(self.allure_results_dir.glob("*-result.json"))
        if result_files:
            return True
        all_files = list(self.allure_results_dir.iterdir())
        json_files = [f for f in all_files if f.suffix == ".json"]
        return len(json_files) > 0

    def get_test_summary(self, result: dict[str, Any]) -> str:
        """获取测试结果摘要 (委托 format_test_summary 纯函数)。"""
        return format_test_summary(result)

    def discover_test_directories(self) -> list[str]:
        """发现项目中的测试目录。

        Returns:
            测试目录路径列表
        """
        test_dirs: list[str] = []

        # 默认测试目录
        default_test_dir = self.project_root / "tests"
        if default_test_dir.exists():
            test_dirs.append("tests/")

        # 扫描项目根目录下的所有目录, 寻找可能的测试目录
        for item in self.project_root.iterdir():
            if item.is_dir():
                dir_name = item.name.lower()
                if any(keyword in dir_name for keyword in ["test", "tests", "testing", "spec"]):
                    test_dirs.append(f"{item.name}/")

        # 去重并排序
        test_dirs = sorted(set(test_dirs))

        logger.info(t("python.pytestRunner.discoveredTestDirs", dirs=test_dirs))
        return test_dirs

    def run_custom_tests(
        self,
        test_paths: list[str],
        markers: list[str] = None,
        keywords: list[str] = None,
        generate_allure: bool = True,
        test_plan_name: str = None,
    ) -> dict[str, Any]:
        """运行自定义路径的测试。

        4 策略路径解析 (委托 resolve_test_paths 纯函数):
        1. 直接路径 (os.path.exists)
        2. project_root / path
        3. project_root / tests / path
        4. project_root / tests / path (文件名)

        Args:
            test_paths: 自定义测试路径列表
            markers: 测试标记列表
            keywords: 关键字过滤列表
            generate_allure: 是否生成 Allure 报告
            test_plan_name: 测试计划名称

        Returns:
            测试结果 dict (无有效路径时 exit_code=5)
        """
        logger.info(t("python.pytestRunner.startCustomTests", paths=test_paths))
        logger.info(t("python.pytestRunner.projectRoot", root=self.project_root))

        # 解析路径 (纯函数)
        valid_paths = resolve_test_paths(test_paths, self.project_root)

        if not valid_paths:
            logger.error(t("python.pytestRunner.noValidTestPaths"))
            return {
                "exit_code": 5,
                "allure_results_dir": None,
                "test_paths": test_paths,
                "markers": markers,
                "keywords": keywords,
                "test_stats": {"passed": 0, "failed": 0, "skipped": 0, "broken": 0, "total": 0},
            }

        return self.run_tests(
            test_paths=valid_paths,
            markers=markers,
            keywords=keywords,
            generate_allure=generate_allure,
            test_plan_name=test_plan_name,
        )


# 模块级懒加载实例 (避免导入时触发文件 I/O, 构造时会读 test_plans.json)
_pytest_runner_instance: PytestRunner | None = None


def get_pytest_runner() -> PytestRunner:
    """获取 PytestRunner 单例 (首次调用构造, 零配置)。"""
    global _pytest_runner_instance
    if _pytest_runner_instance is None:
        _pytest_runner_instance = PytestRunner()
    return _pytest_runner_instance

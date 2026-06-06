"""
Pytest测试运行器
使用Pytest Python API直接运行测试，不依赖命令行
"""
import pytest
import sys
import os
import tempfile
import shutil
import time
from pathlib import Path
from typing import List, Optional, Dict, Any
from main.utils.i18n import t
from main.utils.logger import get_logger

logger = get_logger(__name__)


class PytestRunner:
    """Pytest测试运行器类"""
    
    def __init__(self, project_root: Optional[Path] = None):
        self.project_root = project_root or Path(__file__).parent.parent.parent.parent
        
        user_data = os.environ.get('XKAUTOTESTER_USER_DATA')
        data_root = Path(user_data) if user_data else self.project_root
        
        self.allure_base_dir = data_root / "logs" / "Allure"
        self.allure_results_dir = self.allure_base_dir / "allure-results"
        self.allure_report_base_dir = self.allure_base_dir / "allure-reports"
        
        self.test_plans = []
        if user_data:
            self.test_plans_file = Path(user_data) / "config" / "test_plans.json"
        else:
            self.test_plans_file = self.project_root / "config" / "test_plans.json"
        
        # 加载已有的测试计划历史
        self._load_test_plans()
    
    def run_tests(self, 
                  test_paths: List[str] = None,
                  markers: List[str] = None,
                  keywords: List[str] = None,
                  generate_allure: bool = True,
                  test_plan_name: str = None) -> Dict[str, Any]:
        """
        运行Pytest测试
        
        Args:
            test_paths: 测试路径列表，默认为["tests/"]
            markers: 测试标记列表
            keywords: 关键字过滤列表
            generate_allure: 是否生成Allure报告
            test_plan_name: 测试计划名称，用于生成独立的报告目录
            
        Returns:
            测试结果字典
        """
        if test_paths is None:
            test_paths = ["tests/"]
        
        # 如果没有提供测试计划名称，使用默认名称
        if not test_plan_name:
            test_plan_name = f"test_plan_{int(time.time())}"
        
        # 清理之前的allure-results目录
        if self.allure_results_dir.exists():
            shutil.rmtree(self.allure_results_dir)
        self.allure_results_dir.mkdir(parents=True, exist_ok=True)
        
        # 构建Pytest参数
        pytest_args = self._build_pytest_args(test_paths, markers, keywords)
        
        logger.info(t('python.pytestRunner.startPytest', test_plan_name=test_plan_name, pytest_args=pytest_args))
        
        # 运行测试并实时捕获输出
        import subprocess
        import sys
        import re
        
        # 清理ANSI转义字符的函数
        def clean_ansi_escape(text):
            """清理ANSI转义字符"""
            # 匹配ANSI转义序列的正则表达式
            ansi_escape = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
            return ansi_escape.sub('', text)
        
        # 构建完整的pytest命令
        pytest_command = [sys.executable, "-m", "pytest"] + pytest_args
        logger.info(t('python.pytestRunner.executeCommand', command=' '.join(pytest_command)))
        
        # 使用subprocess.Popen实现实时输出捕获
        process = subprocess.Popen(
            pytest_command,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,  # 直接输出文本而不是字节
            bufsize=1,  # 行缓冲，确保实时输出
            universal_newlines=True  # 启用通用换行符支持
        )
        
        # 实时读取并处理stdout
        stdout_content = []
        while True:
            line = process.stdout.readline()
            if not line and process.poll() is not None:
                break
            if line:
                # 清理ANSI转义字符
                clean_line = clean_ansi_escape(line).rstrip()
                stdout_content.append(clean_line)
                if clean_line.strip():
                    logger.info(f"Pytest: {clean_line}")
        
        # 实时读取并处理stderr
        stderr_content = []
        while True:
            line = process.stderr.readline()
            if not line and process.poll() is not None:
                break
            if line:
                # 清理ANSI转义字符
                clean_line = clean_ansi_escape(line).rstrip()
                stderr_content.append(clean_line)
                if clean_line.strip():
                    logger.error(f"Pytest Error: {clean_line}")
        
        # 获取最终的退出码
        exit_code = process.wait()
        
        # 合并输出内容，用于后续处理
        stdout_content = '\n'.join(stdout_content)
        stderr_content = '\n'.join(stderr_content)
        
        # 解析用例级统计
        test_stats = self._parse_test_stats(stdout_content)
        
        # 检查allure结果是否存在
        allure_results_dir = None
        allure_skipped_reason = None
        if generate_allure and self.allure_results_dir.exists():
            if not self._has_allure_results():
                allure_skipped_reason = "no_results"
                logger.warning(
                    t('python.pytestRunner.noAllureResults', exit_code=exit_code)
                )
            else:
                allure_results_dir = str(self.allure_results_dir)
                # 输出特殊标记行，供Electron侧解析allure-results路径
                print(f"XKAT_ALLURE_RESULTS_DIR:{allure_results_dir}", flush=True)

        if allure_skipped_reason == "no_results":
            logger.warning(t('python.pytestRunner.noTestResults', exit_code=exit_code))
        elif exit_code == 0:
            if allure_results_dir:
                logger.info(t('python.pytestRunner.testSuccessWithReport'))
            else:
                logger.info(t('python.pytestRunner.testSuccessNoReport'))
        else:
            if allure_results_dir:
                logger.warning(t('python.pytestRunner.testFailedWithReport', exit_code=exit_code))
            else:
                logger.warning(t('python.pytestRunner.testFailedNoReport', exit_code=exit_code))
        
        # 记录测试计划运行信息（报告路径由Electron侧生成后更新）
        self._record_test_plan(test_plan_name, test_paths, markers, None)
        
        return {
            "exit_code": exit_code,
            "allure_results_dir": allure_results_dir,
            "test_paths": test_paths,
            "markers": markers,
            "keywords": keywords,
            "test_plan_name": test_plan_name,
            "test_stats": test_stats
        }
    
    def run_all_tests(self, generate_allure: bool = True, test_plan_name: str = None) -> Dict[str, Any]:
        """运行所有测试"""
        logger.info(t('python.pytestRunner.startAllTests'))
        return self.run_tests(
            test_paths=["tests/"],
            generate_allure=generate_allure,
            test_plan_name=test_plan_name
        )
    
    def run_smoke_tests(self, generate_allure: bool = True, test_plan_name: str = None) -> Dict[str, Any]:
        """运行冒烟测试"""
        logger.info(t('python.pytestRunner.startSmokeTests'))
        return self.run_tests(
            test_paths=["tests/"],
            markers=["smoke"],
            generate_allure=generate_allure,
            test_plan_name=test_plan_name
        )
    
    def run_unit_tests(self, generate_allure: bool = True, test_plan_name: str = None) -> Dict[str, Any]:
        """运行单元功能测试"""
        logger.info(t('python.pytestRunner.startUnitTests'))
        return self.run_tests(
            test_paths=["tests/"],
            markers=["unit"],
            generate_allure=generate_allure,
            test_plan_name=test_plan_name
        )
    
    def run_exception_tests(self, generate_allure: bool = True, test_plan_name: str = None) -> Dict[str, Any]:
        """运行异常场景测试"""
        logger.info(t('python.pytestRunner.startExceptionTests'))
        return self.run_tests(
            test_paths=["tests/"],
            markers=["exception"],
            generate_allure=generate_allure,
            test_plan_name=test_plan_name
        )
    
    def _build_pytest_args(self, 
                          test_paths: List[str],
                          markers: List[str] = None,
                          keywords: List[str] = None) -> List[str]:
        """构建Pytest命令行参数"""
        args = []
        
        # 添加测试路径（用户在文件选择器中选择的路径）
        args.extend(test_paths)
        
        # 添加详细输出
        args.extend(["-v"])
        
        # 添加颜色支持
        args.extend(["--color", "yes"])
        
        # 添加标记过滤
        if markers:
            marker_expr = " or ".join(markers)
            args.extend(["-m", marker_expr])
        
        # 添加关键字过滤
        if keywords:
            keyword_expr = " and ".join(keywords)
            args.extend(["-k", keyword_expr])
        
        # 添加Allure结果目录
        args.extend(["--alluredir", str(self.allure_results_dir)])
        
        # 添加配置文件 - pytest.ini 移动到 config 目录
        args.extend(["-c", str(self.project_root / "config" / "pytest.ini")])
        
        return args
    
    def _has_allure_results(self) -> bool:
        result_files = list(self.allure_results_dir.glob("*-result.json"))
        if result_files:
            return True
        all_files = list(self.allure_results_dir.iterdir())
        json_files = [f for f in all_files if f.suffix == ".json"]
        return len(json_files) > 0

    def _record_test_plan(self, test_plan_name: str, test_paths: List[str], 
                         markers: List[str], allure_report_path: Optional[Path]) -> None:
        """记录测试计划信息，支持一个测试计划关联多个报告"""
        from datetime import datetime
        
        # 创建本次运行记录
        run_record = {
            "report_path": str(allure_report_path) if allure_report_path else None,
            "timestamp": datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        }
        
        # 查找是否已存在同名测试计划
        existing_plan = None
        for plan in self.test_plans:
            if plan.get("name") == test_plan_name:
                existing_plan = plan
                break
        
        if existing_plan:
            # 已存在测试计划，添加新的运行记录
            if "runs" not in existing_plan:
                existing_plan["runs"] = []
            existing_plan["runs"].append(run_record)
            
            # 保持每个测试计划最多100个运行记录
            if len(existing_plan["runs"]) > 100:
                existing_plan["runs"] = existing_plan["runs"][-100:]
            
            # 更新最后运行时间
            existing_plan["last_run"] = run_record["timestamp"]
            logger.info(t('python.pytestRunner.planRunRecordAdded', test_plan_name=test_plan_name, count=len(existing_plan['runs'])))
        else:
            # 创建新的测试计划
            test_plan = {
                "name": test_plan_name,
                "test_paths": test_paths,
                "markers": markers,
                "created": datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                "last_run": run_record["timestamp"],
                "runs": [run_record]
            }
            self.test_plans.append(test_plan)
            logger.info(t('python.pytestRunner.planCreated', test_plan_name=test_plan_name))
        
        # 保持最近100个测试计划
        if len(self.test_plans) > 100:
            self.test_plans = self.test_plans[-100:]
        
        # 保存到文件
        self._save_test_plans()
    
    def _load_test_plans(self) -> None:
        """从文件加载测试计划历史记录"""
        try:
            if self.test_plans_file.exists():
                import json
                with open(self.test_plans_file, 'r', encoding='utf-8') as f:
                    self.test_plans = json.load(f)
                logger.info(t('python.pytestRunner.plansLoaded', count=len(self.test_plans)))
        except Exception as e:
            logger.warning(t('python.pytestRunner.plansLoadFailed', error=e))
            self.test_plans = []
    
    def _save_test_plans(self) -> None:
        """保存测试计划历史记录到文件"""
        try:
            import json
            with open(self.test_plans_file, 'w', encoding='utf-8') as f:
                json.dump(self.test_plans, f, ensure_ascii=False, indent=2)
            logger.info(t('python.pytestRunner.plansSaved', count=len(self.test_plans)))
        except Exception as e:
            logger.error(t('python.pytestRunner.plansSaveFailed', error=e))
    
    def get_test_plans(self) -> List[Dict[str, Any]]:
        """获取测试计划历史记录"""
        return self.test_plans.copy()
    
    def get_test_plan_runs(self, test_plan_name: str) -> List[Dict[str, Any]]:
        """获取指定测试计划的所有运行记录"""
        for plan in self.test_plans:
            if plan.get("name") == test_plan_name:
                return plan.get("runs", [])
        return []
    
    def _parse_test_stats(self, stdout_content: str) -> Dict[str, int]:
        """从pytest输出中解析用例级统计信息
        
        pytest -v 输出的最后一行格式示例:
        - "5 passed, 2 failed, 3 skipped, 1 broken in 10.5s"
        - "3 passed in 1.2s"
        - "2 skipped in 0.5s"
        - "1 failed, 1 passed in 2.0s"
        - "no tests ran in 0.0s"
        """
        import re
        
        stats = {
            "passed": 0,
            "failed": 0,
            "skipped": 0,
            "broken": 0,
            "total": 0
        }
        
        # 从输出末尾查找统计行（包含 "in X.Xs" 的行通常是最后的汇总行）
        lines = stdout_content.strip().split('\n')
        summary_line = None
        for line in reversed(lines):
            line = line.strip()
            if re.search(r'\d+\s+(passed|failed|skipped|broken)', line):
                summary_line = line
                break
        
        if not summary_line:
            return stats
        
        # 逐个提取各状态的数量
        passed_match = re.search(r'(\d+)\s+passed', summary_line)
        failed_match = re.search(r'(\d+)\s+failed', summary_line)
        skipped_match = re.search(r'(\d+)\s+skipped', summary_line)
        broken_match = re.search(r'(\d+)\s+broken', summary_line)
        
        stats["passed"] = int(passed_match.group(1)) if passed_match else 0
        stats["failed"] = int(failed_match.group(1)) if failed_match else 0
        stats["skipped"] = int(skipped_match.group(1)) if skipped_match else 0
        stats["broken"] = int(broken_match.group(1)) if broken_match else 0
        stats["total"] = stats["passed"] + stats["failed"] + stats["skipped"] + stats["broken"]
        
        return stats

    def get_test_summary(self, result: Dict[str, Any]) -> str:
        """获取测试结果摘要"""
        exit_code = result["exit_code"]
        test_stats = result.get("test_stats", {})
        
        if exit_code == 0:
            status = t('python.pytestRunner.statusPassed')
        elif exit_code == 1:
            status = t('python.pytestRunner.statusFailed')
        elif exit_code == 2:
            status = t('python.pytestRunner.statusInterrupted')
        elif exit_code == 3:
            status = t('python.pytestRunner.statusInternalError')
        elif exit_code == 4:
            status = t('python.pytestRunner.statusUsageError')
        elif exit_code == 5:
            status = t('python.pytestRunner.statusNoTestsCollected')
        else:
            status = t('python.pytestRunner.statusUnknown', exit_code=exit_code)
        
        summary = t('python.pytestRunner.testStatusLine', status=status)
        
        if test_stats and test_stats.get("total", 0) > 0:
            passed = test_stats.get("passed", 0)
            failed = test_stats.get("failed", 0)
            skipped = test_stats.get("skipped", 0)
            broken = test_stats.get("broken", 0)
            total = test_stats.get("total", 0)
            effective_total = passed + failed + broken
            if effective_total > 0:
                pass_rate = (passed / effective_total) * 100
            else:
                pass_rate = 0.0
            summary += t('python.pytestRunner.caseStatsLine', passed=passed, failed=failed, skipped=skipped, broken=broken, total=total)
            summary += t('python.pytestRunner.passRateLine', pass_rate=f'{pass_rate:.2f}')
        
        if result.get("allure_results_dir"):
            summary += t('python.pytestRunner.allureResultsLine', path=result['allure_results_dir'])
        
        if result["markers"]:
            summary += t('python.pytestRunner.testMarkersLine', markers=', '.join(result['markers']))
        
        if result["test_paths"]:
            summary += t('python.pytestRunner.testPathsLine', paths=', '.join(result['test_paths']))
        
        return summary
    
    def discover_test_directories(self) -> List[str]:
        """
        发现项目中的测试目录
        
        Returns:
            测试目录路径列表
        """
        test_dirs = []
        
        # 默认测试目录
        default_test_dir = self.project_root / "tests"
        if default_test_dir.exists():
            test_dirs.append("tests/")
        
        # 扫描项目根目录下的所有目录，寻找可能的测试目录
        for item in self.project_root.iterdir():
            if item.is_dir():
                dir_name = item.name.lower()
                # 检查是否是测试相关的目录
                if any(keyword in dir_name for keyword in ["test", "tests", "testing", "spec"]):
                    test_dirs.append(f"{item.name}/")
        
        # 去重并排序
        test_dirs = sorted(list(set(test_dirs)))
        
        logger.info(t('python.pytestRunner.discoveredTestDirs', dirs=test_dirs))
        return test_dirs
    
    def run_custom_tests(self, 
                        test_paths: List[str],
                        markers: List[str] = None,
                        keywords: List[str] = None,
                        generate_allure: bool = True,
                        test_plan_name: str = None) -> Dict[str, Any]:
        """
        运行自定义路径的测试
        
        Args:
            test_paths: 自定义测试路径列表
            markers: 测试标记列表
            keywords: 关键字过滤列表
            generate_allure: 是否生成Allure报告
            test_plan_name: 测试计划名称
            
        Returns:
            测试结果字典
        """
        logger.info(t('python.pytestRunner.startCustomTests', paths=test_paths))
        logger.info(t('python.pytestRunner.projectRoot', root=self.project_root))
        
        # 验证测试路径是否存在
        valid_paths = []
        for path in test_paths:
            # 处理多种可能的路径格式
            full_path = None
            
            # 1. 尝试直接使用路径（可能是相对路径或绝对路径）
            if os.path.exists(path):
                full_path = Path(path)
            else:
                # 2. 尝试相对于项目根目录的路径
                relative_path = self.project_root / path.rstrip('/')
                if relative_path.exists():
                    full_path = relative_path
                else:
                    # 3. 尝试在tests目录下查找
                    tests_path = self.project_root / "tests" / path.rstrip('/')
                    if tests_path.exists():
                        full_path = tests_path
                    else:
                        # 4. 尝试直接使用文件名（在tests目录中查找）
                        filename_path = self.project_root / "tests" / path
                        if filename_path.exists():
                            full_path = filename_path
            
            if full_path and full_path.exists():
                # 安全地转换为相对于项目根目录的路径
                try:
                    relative_path = full_path.relative_to(self.project_root)
                    valid_paths.append(str(relative_path))
                    logger.info(t('python.pytestRunner.foundTestPath', path=path, full_path=full_path))
                except ValueError:
                    # 如果路径不在项目根目录的子路径中，直接使用绝对路径
                    logger.debug(t('python.pytestRunner.testPathNotUnderProject', full_path=full_path))
                    # 记录详细信息用于调试
                    logger.debug(t('python.pytestRunner.projectRootDebug', root=self.project_root))
                    logger.debug(t('python.pytestRunner.testFilePath', full_path=full_path))
                    # 直接使用绝对路径
                    valid_paths.append(str(full_path))
                    logger.info(t('python.pytestRunner.usingAbsolutePath', path=full_path))
            else:
                logger.warning(t('python.pytestRunner.testPathNotExist', path=path))
                # 记录详细的路径信息用于调试
                logger.debug(t('python.pytestRunner.triedPath', path=path))
                logger.debug(t('python.pytestRunner.projectRootDebug', root=self.project_root))
                logger.debug(t('python.pytestRunner.testsDir', path=self.project_root / 'tests'))
                logger.debug(t('python.pytestRunner.testsDirContent', content=list((self.project_root / 'tests').glob('*.py')) if (self.project_root / 'tests').exists() else 'N/A'))
        
        if not valid_paths:
            logger.error(t('python.pytestRunner.noValidTestPaths'))
            return {
                "exit_code": 5,
                "allure_results_dir": None,
                "test_paths": test_paths,
                "markers": markers,
                "keywords": keywords,
                "test_stats": {"passed": 0, "failed": 0, "skipped": 0, "broken": 0, "total": 0}
            }
        
        return self.run_tests(
            test_paths=valid_paths,
            markers=markers,
            keywords=keywords,
            generate_allure=generate_allure,
            test_plan_name=test_plan_name
        )


# 创建全局运行器实例
pytest_runner = PytestRunner()


if __name__ == "__main__":
    # 测试运行器功能
    runner = PytestRunner()
    
    print(t('python.pytestRunner.testingRunner'))
    
    # 运行所有测试
    result = runner.run_all_tests(generate_allure=True)
    
    # 显示结果摘要
    print(runner.get_test_summary(result))

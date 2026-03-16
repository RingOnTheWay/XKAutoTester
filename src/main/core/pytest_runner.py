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
from main.utils.logger import get_logger

logger = get_logger(__name__)


class PytestRunner:
    """Pytest测试运行器类"""
    
    def __init__(self, project_root: Optional[Path] = None):
        self.project_root = project_root or Path(__file__).parent.parent.parent.parent
        # Allure相关目录统一放在 logs/Allure/ 下
        self.allure_base_dir = self.project_root / "logs" / "Allure"
        self.allure_results_dir = self.allure_base_dir / "allure-results"
        self.allure_report_base_dir = self.allure_base_dir / "allure-reports"
        
        # 不自动创建报告目录，只在需要时创建
        
        # 存储测试计划历史 - 移动到 config 目录
        self.test_plans = []
        self.test_plans_file = self.project_root / "config" / "test_plans.json"
        
        # Allure服务器相关属性
        self.allure_server_process = None
        self.allure_server_port = None
        self.allure_server_start_time = None
        
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
        
        logger.info(f"开始运行Pytest测试，测试计划: {test_plan_name}，参数: {pytest_args}")
        
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
        logger.info(f"执行Pytest命令: {' '.join(pytest_command)}")
        
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
        
        # 生成Allure报告
        allure_report_path = None
        if generate_allure and self.allure_results_dir.exists():
            allure_report_path = self._generate_allure_report(test_plan_name)
            
            if exit_code == 0:
                if allure_report_path:
                    logger.info("✅ 测试成功，已生成Allure报告")
                else:
                    logger.info("✅ 测试成功，但Allure报告生成失败")
            else:
                if allure_report_path:
                    logger.warning(f"测试失败 (退出码: {exit_code})，但已生成Allure报告供分析")
                else:
                    logger.warning(f"测试失败 (退出码: {exit_code})，且Allure报告生成失败")
        
        # 记录测试计划运行信息
        self._record_test_plan(test_plan_name, test_paths, markers, allure_report_path)
        
        return {
            "exit_code": exit_code,
            "allure_report_path": allure_report_path,
            "test_paths": test_paths,
            "markers": markers,
            "keywords": keywords,
            "test_plan_name": test_plan_name
        }
    
    def run_all_tests(self, generate_allure: bool = True, test_plan_name: str = None) -> Dict[str, Any]:
        """运行所有测试"""
        logger.info("开始运行所有测试...")
        return self.run_tests(
            test_paths=["tests/"],
            generate_allure=generate_allure,
            test_plan_name=test_plan_name
        )
    
    def run_smoke_tests(self, generate_allure: bool = True, test_plan_name: str = None) -> Dict[str, Any]:
        """运行冒烟测试"""
        logger.info("开始运行冒烟测试...")
        return self.run_tests(
            test_paths=["tests/"],
            markers=["smoke"],
            generate_allure=generate_allure,
            test_plan_name=test_plan_name
        )
    
    def run_unit_tests(self, generate_allure: bool = True, test_plan_name: str = None) -> Dict[str, Any]:
        """运行单元功能测试"""
        logger.info("开始运行单元功能测试...")
        return self.run_tests(
            test_paths=["tests/"],
            markers=["unit"],
            generate_allure=generate_allure,
            test_plan_name=test_plan_name
        )
    
    def run_exception_tests(self, generate_allure: bool = True, test_plan_name: str = None) -> Dict[str, Any]:
        """运行异常场景测试"""
        logger.info("开始运行异常场景测试...")
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
    
    def _generate_allure_report(self, test_plan_name: str) -> Optional[Path]:
        """生成Allure报告"""
        try:
            from datetime import datetime
            
            logger.info(f"开始生成Allure报告，测试计划: {test_plan_name}")
            
            # 使用时间戳创建唯一的报告目录，支持同一测试计划多次运行
            run_timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            
            # 创建测试计划特定的报告目录：test_plan_name/run_timestamp
            test_plan_dir = self.allure_report_base_dir / test_plan_name
            allure_report_dir = test_plan_dir / run_timestamp
            
            # 确保测试计划目录存在
            test_plan_dir.mkdir(parents=True, exist_ok=True)
            
            # 使用命令行执行Allure报告生成
            import subprocess
            
            # 优先使用项目内的allure命令
            project_allure_bat = self.project_root / "env" / "allure" / "bin" / "allure.bat"
            project_allure = self.project_root / "env" / "allure" / "bin" / "allure"
            
            if project_allure_bat.exists():
                # Windows系统使用.bat文件
                allure_cmd = [str(project_allure_bat)]
            elif project_allure.exists():
                # Unix系统使用可执行文件
                allure_cmd = [str(project_allure)]
            else:
                # 回退到系统环境变量中的allure
                allure_cmd = ["allure"]
            
            # 构建完整的Allure命令
            allure_cmd.extend([
                "generate",
                str(self.allure_results_dir),
                "-o",
                str(allure_report_dir),
                "--clean"
            ])
            
            # 执行命令 - 使用二进制模式，避免UTF-8解码错误
            result = subprocess.run(allure_cmd, capture_output=True)
            
            # 手动处理输出编码
            def decode_output(output):
                """安全解码输出，处理不同编码"""
                if not output:
                    return ""
                try:
                    return output.decode('utf-8')
                except UnicodeDecodeError:
                    try:
                        return output.decode('gbk')  # Windows系统常用GBK编码
                    except UnicodeDecodeError:
                        return output.decode('utf-8', errors='replace')  # 最后使用replace模式
            
            stdout = decode_output(result.stdout)
            stderr = decode_output(result.stderr)
            
            if result.returncode == 0:
                allure_index = allure_report_dir / "index.html"
                if allure_index.exists():
                    logger.info(f"Allure报告生成成功: {allure_report_dir}")
                    
                    # 生成报告成功后，自动删除allure-results文件夹
                    try:
                        if self.allure_results_dir.exists():
                            shutil.rmtree(self.allure_results_dir)
                            logger.info("✅ 已自动清理allure-results文件夹")
                    except Exception as e:
                        logger.warning(f"清理allure-results文件夹失败: {e}")
                    
                    return allure_report_dir
                else:
                    logger.error("Allure报告生成失败，index.html文件不存在")
                    return None
            else:
                logger.error(f"Allure命令执行失败: {result.stderr}，请检查JAVA环境")
                
                # 检查Allure是否可用
                if project_allure_bat.exists() or project_allure.exists():
                    logger.error("项目内的Allure命令执行失败")
                else:
                    logger.warning("Allure命令行工具未安装，无法生成HTML报告")
                    logger.info("请安装Allure命令行工具: https://docs.qameta.io/allure/")
                
                return None
                
        except Exception as e:
            logger.error(f"生成Allure报告失败: {e}")
            return None
    
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
            logger.info(f"测试计划 '{test_plan_name}' 添加新的运行记录，共 {len(existing_plan['runs'])} 次运行")
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
            logger.info(f"创建新的测试计划 '{test_plan_name}'")
        
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
                logger.info(f"已加载 {len(self.test_plans)} 个测试计划历史记录")
        except Exception as e:
            logger.warning(f"加载测试计划历史记录失败: {e}")
            self.test_plans = []
    
    def _save_test_plans(self) -> None:
        """保存测试计划历史记录到文件"""
        try:
            import json
            with open(self.test_plans_file, 'w', encoding='utf-8') as f:
                json.dump(self.test_plans, f, ensure_ascii=False, indent=2)
            logger.info(f"已保存 {len(self.test_plans)} 个测试计划历史记录")
        except Exception as e:
            logger.error(f"保存测试计划历史记录失败: {e}")
    
    def get_test_plans(self) -> List[Dict[str, Any]]:
        """获取测试计划历史记录"""
        return self.test_plans.copy()
    
    def get_test_plan_runs(self, test_plan_name: str) -> List[Dict[str, Any]]:
        """获取指定测试计划的所有运行记录"""
        for plan in self.test_plans:
            if plan.get("name") == test_plan_name:
                return plan.get("runs", [])
        return []
    
    def open_allure_report(self, test_plan_name: str = None, run_index: int = -1) -> bool:
        """
        打开Allure报告
        
        Args:
            test_plan_name: 测试计划名称，如果为None则使用最新的测试计划
            run_index: 运行记录索引，-1表示最新一次运行，0表示第一次运行
        """
        # 如果没有指定测试计划名称，使用最新的测试计划
        if not test_plan_name:
            if self.test_plans:
                test_plan_name = self.test_plans[-1]["name"]
            else:
                logger.error("没有可用的测试计划，请先运行测试")
                return False
        
        # 查找测试计划
        test_plan = None
        for plan in self.test_plans:
            if plan.get("name") == test_plan_name:
                test_plan = plan
                break
        
        if not test_plan:
            logger.error(f"测试计划 '{test_plan_name}' 不存在")
            return False
        
        # 获取运行记录
        runs = test_plan.get("runs", [])
        if not runs:
            logger.error(f"测试计划 '{test_plan_name}' 没有运行记录")
            return False
        
        # 处理索引
        if run_index < 0:
            run_index = len(runs) + run_index
        if run_index < 0 or run_index >= len(runs):
            logger.error(f"运行记录索引 {run_index} 超出范围 (0-{len(runs)-1})")
            return False
        
        # 获取指定的运行记录
        run_record = runs[run_index]
        report_path = run_record.get("report_path")
        
        if not report_path:
            logger.error(f"运行记录没有关联的报告路径")
            return False
        
        allure_report_dir = Path(report_path)
        
        if not allure_report_dir.exists():
            logger.error(f"报告目录不存在: {allure_report_dir}")
            return False
        
        logger.info(f"正在打开测试计划 '{test_plan_name}' 的第 {run_index + 1} 次运行报告")
        
        try:
            # 优先使用项目内的allure命令
            project_allure_bat = self.project_root / "env" / "allure" / "bin" / "allure.bat"
            project_allure = self.project_root / "env" / "allure" / "bin" / "allure"
            
            if project_allure_bat.exists():
                # Windows系统使用.bat文件
                allure_cmd = [str(project_allure_bat)]
            elif project_allure.exists():
                # Unix系统使用可执行文件
                allure_cmd = [str(project_allure)]
            else:
                # 回退到系统环境变量中的allure
                allure_cmd = ["allure"]
            
            # 使用allure open命令启动服务器
            allure_cmd.extend(["open", str(allure_report_dir)])
            
            # 执行命令（非阻塞方式，让服务器在后台运行）
            import subprocess
            import threading
            
            # 启动allure服务器进程 - 使用二进制模式，避免UTF-8解码错误
            allure_process = subprocess.Popen(
                allure_cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                # 不使用text=True，避免UnicodeDecodeError
            )
            
            # 存储服务器进程信息
            self.allure_server_process = allure_process
            self.allure_server_port = 4040  # allure默认端口
            self.allure_server_start_time = time.time()
            
            # 启动后台线程监控服务器状态
            def monitor_allure_server():
                try:
                    # 等待服务器启动
                    time.sleep(3)
                    
                    # 检查服务器是否在运行
                    if allure_process.poll() is None:
                        logger.info(f"测试计划 '{test_plan_name}' 的Allure报告服务器已启动 (PID: {allure_process.pid})")
                        logger.info("报告将在浏览器中打开，请稍等...")
                        
                        # 启动浏览器监控线程
                        self._start_browser_monitor(test_plan_name)
                    else:
                        # 服务器启动失败，尝试直接打开文件
                        logger.error("Allure服务器启动失败，尝试直接打开报告文件...")
                        self._open_report_directly(allure_report_dir, test_plan_name)
                        
                except Exception as e:
                    logger.error(f"监控Allure服务器失败: {e}")
                    # 出错时尝试直接打开文件
                    self._open_report_directly(allure_report_dir, test_plan_name)
            
            # 启动监控线程
            monitor_thread = threading.Thread(target=monitor_allure_server, daemon=True)
            monitor_thread.start()
            
            return True
                
        except Exception as e:
            logger.error(f"打开Allure报告失败: {e}")
            # 出错时尝试直接打开文件
            return self._open_report_directly(allure_report_dir, test_plan_name)
    
    def _open_report_directly(self, allure_report_dir, test_plan_name):
        """直接打开报告文件（不使用allure服务器）"""
        try:
            import subprocess
            import os
            import sys
            
            allure_index = allure_report_dir / "index.html"
            if allure_index.exists():
                if sys.platform == "win32":
                    os.startfile(str(allure_index))
                elif sys.platform == "darwin":
                    subprocess.run(["open", str(allure_index)])
                else:
                    subprocess.run(["xdg-open", str(allure_index)])
                logger.info(f"测试计划 '{test_plan_name}' 的Allure报告已打开（直接打开）")
                return True
            else:
                logger.error("无法打开Allure报告，index.html文件不存在")
                return False
        except Exception as e:
            logger.error(f"直接打开报告文件失败: {e}")
            return False
    
    def _start_browser_monitor(self, test_plan_name):
        """启动浏览器监控线程"""
        import threading
        import time
        import psutil
        
        def monitor_browser():
            try:
                # 等待浏览器打开
                time.sleep(5)
                
                # 查找与allure服务器相关的浏览器进程
                browser_processes = []
                for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
                    try:
                        # 检查是否是浏览器进程且连接到allure服务器端口
                        if any(browser in proc.info['name'].lower() for browser in ['chrome', 'firefox', 'edge', 'safari']):
                            # 检查是否连接到allure服务器端口
                            connections = proc.connections()
                            for conn in connections:
                                if conn.status == 'ESTABLISHED' and conn.laddr.port == self.allure_server_port:
                                    browser_processes.append(proc)
                                    break
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        continue
                
                if browser_processes:
                    logger.info(f"检测到 {len(browser_processes)} 个浏览器进程连接到Allure服务器")
                    
                    # 监控浏览器进程状态
                    while True:
                        time.sleep(10)  # 每10秒检查一次
                        
                        # 检查是否还有浏览器进程连接到服务器
                        active_browsers = []
                        for proc in browser_processes:
                            try:
                                if proc.is_running():
                                    # 检查是否仍然连接到allure服务器
                                    connections = proc.connections()
                                    connected = False
                                    for conn in connections:
                                        if conn.status == 'ESTABLISHED' and conn.laddr.port == self.allure_server_port:
                                            connected = True
                                            break
                                    
                                    if connected:
                                        active_browsers.append(proc)
                            except (psutil.NoSuchProcess, psutil.AccessDenied):
                                continue
                        
                        # 如果没有活动的浏览器进程，关闭allure服务器
                        if not active_browsers:
                            logger.info("所有浏览器已关闭，正在停止Allure服务器...")
                            self._stop_allure_server()
                            break
                        
                        # 更新浏览器进程列表
                        browser_processes = active_browsers
                        
                else:
                    # 如果没有检测到浏览器进程，等待一段时间后关闭服务器
                    logger.info("未检测到浏览器进程，将在30秒后自动关闭Allure服务器...")
                    time.sleep(30)
                    self._stop_allure_server()
                    
            except Exception as e:
                logger.error(f"浏览器监控失败: {e}")
                # 出错时关闭服务器
                self._stop_allure_server()
        
        # 启动浏览器监控线程
        browser_monitor_thread = threading.Thread(target=monitor_browser, daemon=True)
        browser_monitor_thread.start()
    
    def _stop_allure_server(self):
        """停止Allure服务器"""
        try:
            if hasattr(self, 'allure_server_process') and self.allure_server_process:
                if self.allure_server_process.poll() is None:
                    # 进程仍在运行，终止它
                    self.allure_server_process.terminate()
                    try:
                        # 等待进程终止
                        self.allure_server_process.wait(timeout=5)
                        logger.info("Allure服务器已成功停止")
                    except subprocess.TimeoutExpired:
                        # 如果进程没有正常终止，强制杀死
                        self.allure_server_process.kill()
                        logger.info("Allure服务器已被强制停止")
                
                # 清理进程引用
                self.allure_server_process = None
                self.allure_server_port = None
                self.allure_server_start_time = None
                
        except Exception as e:
            logger.error(f"停止Allure服务器失败: {e}")
    
    def get_test_summary(self, result: Dict[str, Any]) -> str:
        """获取测试结果摘要"""
        exit_code = result["exit_code"]
        
        if exit_code == 0:
            status = "✅ 测试通过"
        elif exit_code == 1:
            status = "❌ 测试失败"
        elif exit_code == 2:
            status = "⚠️  测试中断"
        elif exit_code == 3:
            status = "❌ 内部错误"
        elif exit_code == 4:
            status = "❌ 使用错误"
        elif exit_code == 5:
            status = "❌ 未收集到测试"
        else:
            status = f"❓ 未知状态 (退出码: {exit_code})"
        
        summary = f"测试状态: {status}"
        
        if result["allure_report_path"]:
            summary += f"\nAllure报告: {result['allure_report_path']}"
        
        if result["markers"]:
            summary += f"\n测试标记: {', '.join(result['markers'])}"
        
        if result["test_paths"]:
            summary += f"\n测试路径: {', '.join(result['test_paths'])}"
        
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
        
        logger.info(f"发现测试目录: {test_dirs}")
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
        logger.info(f"开始运行自定义路径测试: {test_paths}")
        logger.info(f"项目根目录: {self.project_root}")
        
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
                    logger.info(f"找到测试路径: {path} -> {full_path}")
                except ValueError:
                    # 如果路径不在项目根目录的子路径中，直接使用绝对路径
                    logger.debug(f"测试路径不在项目根目录下: {full_path}")
                    # 记录详细信息用于调试
                    logger.debug(f"项目根目录: {self.project_root}")
                    logger.debug(f"测试文件路径: {full_path}")
                    # 直接使用绝对路径
                    valid_paths.append(str(full_path))
                    logger.info(f"使用绝对路径: {full_path}")
            else:
                logger.warning(f"测试路径不存在: {path}")
                # 记录详细的路径信息用于调试
                logger.debug(f"尝试的路径: {path}")
                logger.debug(f"项目根目录: {self.project_root}")
                logger.debug(f"tests目录: {self.project_root / 'tests'}")
                logger.debug(f"tests目录内容: {list((self.project_root / 'tests').glob('*.py')) if (self.project_root / 'tests').exists() else '目录不存在'}")
        
        if not valid_paths:
            logger.error("没有有效的测试路径")
            return {
                "exit_code": 5,  # 未收集到测试
                "allure_report_path": None,
                "test_paths": test_paths,
                "markers": markers,
                "keywords": keywords
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
    
    print("测试Pytest运行器...")
    
    # 运行所有测试
    result = runner.run_all_tests(generate_allure=True)
    
    # 显示结果摘要
    print(runner.get_test_summary(result))
    
    # 尝试打开报告
    if result["allure_report_path"]:
        runner.open_allure_report()

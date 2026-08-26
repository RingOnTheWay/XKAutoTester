"""
Appium服务器启动器
使用subprocess自动启动和管理Appium服务器

深模块重构 (2026-07-24):
- 接口收窄: start() + stop() 两方法, stop() 统一优雅终止 + 端口清理
- 实现藏深: _LogPump (日志文件+线程) 私有类 + 模块级端口清理函数 (平台 if/else)
- 消除 shell=True: 两步法 (netstat + Python 过滤)
- 可测: subprocess_module 模块级注入
"""

import datetime
import logging
import os
import platform
import subprocess
import threading
import time
from pathlib import Path

import requests

from main.core.subprocess_handle import SubprocessHandle
from main.utils.paths import get_logs_path
from main.utils.text import DATETIME_FORMAT, clean_ansi_escape

logger = logging.getLogger(__name__)


class _LogPump:
    """Appium 子进程日志泵: 读 stdout -> 清洗 ANSI -> 写文件. 线程安全.

    全权拥有日志文件句柄 + 读取线程. AppiumServer 不再直接管理这些资源.
    """

    def __init__(self, log_file_path: Path, process: subprocess.Popen):
        """打开日志文件 (utf-8, w 模式). 不启动线程.

        Args:
            log_file_path: 日志文件路径
            process: Appium 子进程对象 (需有 stdout/poll)
        """
        self._log_file_path = log_file_path
        self._process = process
        self._file = open(log_file_path, "w", encoding="utf-8")
        self._thread: threading.Thread | None = None
        self._stop_event = threading.Event()

    def start(self) -> None:
        """启动 daemon 线程读 process.stdout.readline -> _write_clean_log."""
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def _run(self) -> None:
        """日志读取线程主循环. 退出条件: _stop_event / process.poll() 非 None."""
        try:
            while not self._stop_event.is_set():
                if self._process is None or self._process.poll() is not None:
                    logger.info("进程已结束，日志读取线程退出")
                    break
                line = self._process.stdout.readline()
                if not line:
                    time.sleep(0.1)
                    continue
                self._write_clean_log(line)
        except Exception as e:
            logger.error(f"日志读取线程异常: {e}")

    def _write_clean_log(self, text: str) -> None:
        """清洗 ANSI 转义后写入文件 + flush."""
        clean_text = clean_ansi_escape(text)
        self._file.write(clean_text)
        self._file.flush()

    def stop(self) -> None:
        """幂等停止: set event -> join 线程 (timeout=5) -> 关闭文件."""
        if self._stop_event.is_set():
            return
        self._stop_event.set()
        if self._thread is not None and self._thread.is_alive():
            logger.info("等待日志读取线程安全退出...")
            self._thread.join(timeout=5)
            if self._thread.is_alive():
                logger.warning("日志读取线程未在5秒内退出，继续执行")
        try:
            self._file.flush()
            self._file.close()
        except Exception as e:
            logger.error(f"关闭日志文件时出错: {e}")


def _kill_port_windows(port: int, subprocess_module=subprocess) -> None:
    """Windows: netstat -ano (无 shell) + Python 过滤 + taskkill /F /PID。幂等。"""
    try:
        logger.info(f"开始查找占用端口{port}的进程...")
        result = subprocess_module.run(
            ["netstat", "-ano"], capture_output=True, text=True, encoding="gbk", errors="replace", timeout=10
        )
        logger.info(f"netstat命令执行结果 - 返回码: {result.returncode}")
        if result.stdout:
            logger.info(f"netstat输出内容长度: {len(result.stdout)}字符")
        if result.stderr:
            logger.warning(f"netstat错误输出: {result.stderr}")

        pids = _extract_listening_pids(result.stdout or "", port)
        if pids:
            logger.info(f"发现{len(pids)}个需要终止的进程: {pids}")
            for pid in pids:
                _taskkill_pid(pid, subprocess_module)
        else:
            logger.info(f"未发现占用端口{port}的进程")
    except Exception as e:
        logger.error(f"端口清理时出错: {e}")


def _extract_listening_pids(netstat_output: str, port: int) -> list[str]:
    """从 netstat -ano 输出提取占用 port 的 LISTENING PID。

    精确匹配 local_addr endswith :{port} + state == LISTENING + pid isdigit,
    避免子串误匹配 (如 :4723 vs :47230)。
    """
    pids = []
    port_suffix = f":{port}"
    for line in netstat_output.split("\n"):
        parts = line.split()
        if len(parts) < 5:
            continue
        local_addr = parts[1]
        state = parts[3]
        pid = parts[4]
        if local_addr.endswith(port_suffix) and state == "LISTENING" and pid.isdigit():
            logger.info(f"找到占用端口{port}的进程ID: {pid}")
            pids.append(pid)
    return pids


def _taskkill_pid(pid: str, subprocess_module=subprocess) -> None:
    """taskkill /F /PID {pid}。"""
    try:
        logger.info(f"开始终止进程ID {pid}")
        kill_result = subprocess_module.run(
            ["taskkill", "/F", "/PID", pid],
            capture_output=True,
            text=True,
            encoding="gbk",
            errors="replace",
            timeout=10,
        )
        logger.info(f"taskkill命令执行结果 - 返回码: {kill_result.returncode}")
        if kill_result.stdout:
            logger.info(f"taskkill输出: {kill_result.stdout}")
        if kill_result.stderr:
            logger.warning(f"taskkill错误: {kill_result.stderr}")
        logger.info(f"已终止进程ID {pid}")
    except Exception as e:
        logger.error(f"终止进程ID {pid}时出错: {e}")


def _kill_port_unix(port: int, subprocess_module=subprocess) -> None:
    """Unix/Linux: fuser -k {port}/tcp。幂等。"""
    try:
        logger.info(f"Unix/Linux系统端口{port}清理...")
        result = subprocess_module.run(
            ["fuser", "-k", f"{port}/tcp"], capture_output=True, text=True, timeout=10
        )
        logger.info(f"Unix/Linux系统端口{port}清理完成 - 返回码: {result.returncode}")
    except Exception as e:
        logger.error(f"Unix端口清理时出错: {e}")


def _kill_port_process(port: int, subprocess_module=subprocess) -> None:
    """按 platform.system() 选平台端口清理函数。幂等。"""
    if platform.system() == "Windows":
        _kill_port_windows(port, subprocess_module)
    else:
        _kill_port_unix(port, subprocess_module)


class AppiumServer(SubprocessHandle):
    """Appium服务器管理器

    深模块接口:
    - start(): 启动服务器, 已在运行则复用, 失败自动 stop()
    - stop(): 统一停止 (优雅终止 process + 端口清理兜底), 幂等
    - server_url: @property, 从 host/port 计算
    - apply_default_capabilities(): 静态方法, 应用 6 个默认 capabilities

    内部实现藏深:
    - _LogPump: 日志文件 + 读取线程 (全权拥有)
    - 模块级端口清理函数 (_kill_port_process 平台分发): 跨平台端口清理
    - 继承 SubprocessHandle: 统一 terminate→wait→kill→wait 终止模板 (M10 抽取)
    """

    _TERMINATE_TIMEOUT = 10.0
    _KILL_TIMEOUT = 2.0  # 修复: 原 kill 后不 wait, 可能孤儿; 统一 2s wait
    _LABEL = "AppiumServer"

    DEFAULT_HOST = "127.0.0.1"
    DEFAULT_PORT = 4723
    DEFAULT_AUTOMATION_NAME = "UiAutomator2"
    DEFAULT_SETTINGS_TIMEOUT = 10000
    DEFAULT_SESSION_TIMEOUT = 60

    DEFAULT_CAPABILITIES = {
        "ensure_webviews_have_pages": True,
        "native_web_screenshot": True,
        "new_command_timeout": 3600,
        "connect_hardware_keyboard": True,
    }

    def __init__(
        self,
        host: str = "127.0.0.1",
        port: int = 4723,
        log_level: str = "info",
        *,
        subprocess_module=subprocess,
    ):
        """初始化Appium服务器配置. 不启动服务器.

        Args:
            host: 服务器主机地址
            port: 服务器端口
            log_level: 日志级别
            subprocess_module: subprocess 模块 (测试注入, 默认用真实 subprocess)
        """
        self.host = host
        self.port = port
        self.log_level = log_level
        self._process: subprocess.Popen | None = None
        self._subprocess = subprocess_module
        self._log_pump: _LogPump | None = None
        # P1-6: 标记 Appium 进程是否由本对象创建。
        # start() 检测到端口已被外部 Appium 占用时会复用, stop() 不得杀外部实例。
        self._started_by_us: bool = False

        # 查找Appium可执行文件路径
        self.appium_executable = self._find_appium_executable()

        # 日志文件路径固定为项目根目录下的logs/Appium
        self.log_dir = get_logs_path("Appium")
        self.log_dir.mkdir(parents=True, exist_ok=True)

        # 生成与XKAT日志格式一致的日志文件名
        current_time = datetime.datetime.now().strftime(DATETIME_FORMAT)
        self.log_file = self.log_dir / f"Appium-{current_time}.log"

    @property
    def process(self) -> subprocess.Popen | None:
        """公开 process 字段 (测试 + 外部读取兼容, 内部存 self._process)。

        M10: 继承 SubprocessHandle 后内部用 self._process, 此 property 保持原公开 API
        (测试 server.process = fake_process 赋值 + server.process is None 读取零改动)。
        """
        return self._process

    @process.setter
    def process(self, value: subprocess.Popen | None) -> None:
        self._process = value

    @property
    def server_url(self) -> str:
        """从 host/port 计算, 保证同步."""
        return f"http://{self.host}:{self.port}"

    @staticmethod
    def apply_default_capabilities(options):
        """将默认的Appium高级配置应用到options对象.

        Args:
            options: UiAutomator2Options对象

        Returns:
            options: 应用了默认配置的options对象
        """
        options.automation_name = AppiumServer.DEFAULT_AUTOMATION_NAME
        options.ensureWebviewsHavePages = AppiumServer.DEFAULT_CAPABILITIES["ensure_webviews_have_pages"]
        options.nativeWebScreenshot = AppiumServer.DEFAULT_CAPABILITIES["native_web_screenshot"]
        options.newCommandTimeout = AppiumServer.DEFAULT_CAPABILITIES["new_command_timeout"]
        options.connectHardwareKeyboard = AppiumServer.DEFAULT_CAPABILITIES["connect_hardware_keyboard"]
        options.androidInstallTimeout = AppiumServer.DEFAULT_SETTINGS_TIMEOUT
        options.appWaitDuration = AppiumServer.DEFAULT_SETTINGS_TIMEOUT
        return options

    def _find_appium_executable(self):
        """查找Appium可执行文件路径.

        Returns:
            Appium可执行文件完整路径
        """
        # 检查PATH环境变量中的appium
        for path in os.environ.get("PATH", "").split(os.pathsep):
            appium_path = os.path.join(path, "appium.cmd")
            if os.path.exists(appium_path):
                return appium_path

        # 如果都找不到，返回'appium'让系统尝试查找
        return "appium"

    def start(self, timeout=30):
        """启动Appium服务器.

        Args:
            timeout: 启动超时时间（秒）

        Returns:
            bool: 启动是否成功. 已在运行也返 True (复用现有服务器).
            失败时自动调 stop() 后返 False.
        """
        try:
            # 检查是否已经在运行
            if self.is_server_running():
                logger.info(f"Appium服务器已在运行: {self.server_url}")
                # P1-6: 复用外部实例, 标记非本对象创建 (stop() 不得杀它)
                self._started_by_us = False
                return True

            # 构建启动命令 - Appium 3.x需要使用server子命令
            cmd = [
                self.appium_executable,
                "--address",
                self.host,
                "--port",
                str(self.port),
                "--log-no-colors",  # 禁用颜色输出，减少转义字符
            ]

            logger.info(f"启动Appium服务器: {' '.join(cmd)} > {self.log_file}")

            # 启动子进程 (用注入的 subprocess_module)
            self.process = self._subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
                bufsize=1,  # 设置行缓冲
            )
            # P1-6: 进程由本对象创建 → stop() 时允许端口清理
            self._started_by_us = True

            # 启动日志泵 (全权管理文件 + 线程)
            self._log_pump = _LogPump(self.log_file, self.process)
            self._log_pump.start()

            # 等待线程启动
            time.sleep(0.5)

            # 等待服务器启动
            start_time = time.time()
            while time.time() - start_time < timeout:
                if self.is_server_running():
                    logger.info(f"Appium服务器启动成功: {self.server_url}")
                    return True
                time.sleep(2)

            # 超时处理
            logger.error(f"Appium服务器启动超时 ({timeout}秒)")
            self.stop()
            return False

        except Exception as e:
            logger.error(f"启动Appium服务器失败: {e}")
            self.stop()
            return False

    def stop(self):
        """统一停止: 优雅终止 self.process + 端口扫描清理兜底. 幂等.

        顺序:
        1. self._stop_process() (委托 SubprocessHandle: terminate→wait(10)→kill→wait(2))
           ── 先终止进程, 使日志读取线程的 readline() 读到 EOF / poll() 非 None 尽快退出,
              避免日志线程 join(timeout=5) 元阻塞滞留
        2. _LogPump.stop() (join 线程 + 关日志文件)
        3. _kill_port_process(port) 兜底 (杀端口上残留进程)

        注: _LogPump 持有自己的 process 引用 (构造时传入), 不受 _stop_process 置
            self._process=None 影响, 仍能正确 poll() 感知进程结束。
        """
        # 1. 先优雅终止进程 (M10: 委托 SubprocessHandle._stop_process, 统一 terminate→wait→kill→wait 模板)
        self._stop_process()

        # 2. 再停日志泵 (此时进程已死, 日志线程迅速读到 EOF 退出, join 不被阻塞)
        if self._log_pump is not None:
            try:
                self._log_pump.stop()
            except Exception as e:
                logger.error(f"停止日志泵时出错: {e}")
            self._log_pump = None

        # 3. 端口清理兜底 (P1-6: 仅当进程由本对象创建时才扫端口,
        #    复用外部 Appium 实例时跳过, 避免 taskkill /F 误杀用户自启服务)
        if self._started_by_us:
            try:
                _kill_port_process(self.port, self._subprocess)
                logger.info("Appium服务器端口清理完成")
            except Exception as e:
                logger.error(f"端口清理时出错: {e}")
        else:
            logger.info("Appium进程非本对象创建, 跳过端口清理 (保护外部实例)")

    def is_server_running(self):
        """检查Appium服务器是否在运行.

        Returns:
            bool: 服务器是否在运行 (HTTP GET /status, 200 = running)
        """
        try:
            response = requests.get(f"{self.server_url}/status", timeout=5)
            return response.status_code == 200
        except Exception as e:
            # 加可观测性, 区分"未运行"与"检查失败" (HTTP 异常被当作未运行会触发重复 start 或端口冲突)
            # 轮询期间"状态检查失败"属启动预期, 不刷控制台; 仅最终启动失败(超时)走 ERROR 上报
            logger.debug(f"Appium server 状态检查失败 (视为未运行): {e}")
            return False

    def __enter__(self) -> "AppiumServer":
        """上下文管理器入口. start() 失败 raise RuntimeError."""
        if not self.start():
            raise RuntimeError("Appium server start failed")
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """上下文管理器出口."""
        self.stop()

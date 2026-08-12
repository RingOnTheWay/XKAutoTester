"""AppiumServer 单元测试 - 深模块重构 (subprocess_module 注入 + _LogPump + 模块级端口清理函数)"""

import time
from unittest.mock import MagicMock, patch

import pytest
import requests

from main.core.appium_server import (
    AppiumServer,
    _LogPump,
    _extract_listening_pids,
    _kill_port_process,
    _kill_port_unix,
    _kill_port_windows,
)

# ── Fake 对象 ─────────────────────────────────────────────────


class FakeStream:
    """模拟 process.stdout, readline() 依次返回预设行, 之后返 ''"""

    def __init__(self, lines=None):
        self._lines = list(lines) if lines else []
        self._idx = 0

    def readline(self):
        if self._idx >= len(self._lines):
            return ""
        line = self._lines[self._idx]
        self._idx += 1
        return line


class FakePopen:
    """模拟 subprocess.Popen"""

    def __init__(self, stdout_lines=None, returncode=0):
        self.stdout = FakeStream(stdout_lines or [])
        self._returncode = returncode
        self._terminated = False
        self._killed = False
        self._wait_timeout_raised = False

    def poll(self):
        if self._terminated or self._killed:
            return self._returncode
        return None

    def terminate(self):
        self._terminated = True

    def wait(self, timeout=None):
        if self._wait_timeout_raised:
            import subprocess as sp

            raise sp.TimeoutExpired(cmd="fake", timeout=timeout)
        self._terminated = True
        return self._returncode

    def kill(self):
        self._killed = True


class FakeCompletedProcess:
    """模拟 subprocess.run 返回的 CompletedProcess"""

    def __init__(self, returncode=0, stdout="", stderr=""):
        self.returncode = returncode
        self.stdout = stdout
        self.stderr = stderr


class FakeSubprocessModule:
    """模拟 subprocess 模块, 提供 Popen + run"""

    def __init__(self, popen_factory=None, run_results=None):
        self.Popen = popen_factory or (lambda *a, **kw: FakePopen())
        self._run_results = list(run_results) if run_results else []
        self._run_idx = 0
        self.run_calls = []
        self.popen_calls = []

    def run(self, cmd, **kwargs):
        self.run_calls.append(cmd)
        if self._run_idx >= len(self._run_results):
            return FakeCompletedProcess(0, "")
        result = self._run_results[self._run_idx]
        self._run_idx += 1
        return result


# ── _LogPump 测试 ─────────────────────────────────────────────


@pytest.mark.unit
class TestLogPump:
    """_LogPump 私有类: 日志文件 + 线程"""

    def test_init_opens_log_file(self, tmp_path):
        """__init__ 应打开日志文件 (utf-8, w 模式)"""
        log_path = tmp_path / "test.log"
        process = FakePopen()
        pump = _LogPump(log_path, process)
        assert log_path.exists()
        assert pump._file is not None
        assert not pump._file.closed

    def test_start_launches_daemon_thread(self, tmp_path):
        """start() 应启动 daemon 线程"""
        log_path = tmp_path / "test.log"
        process = FakePopen(stdout_lines=["line1\n"])
        pump = _LogPump(log_path, process)
        pump.start()
        assert pump._thread is not None
        assert pump._thread.daemon is True
        pump.stop()

    def test_stop_joins_thread_and_closes_file(self, tmp_path):
        """stop() 应 join 线程 + 关闭文件"""
        log_path = tmp_path / "test.log"
        process = FakePopen(stdout_lines=["line1\n"])
        pump = _LogPump(log_path, process)
        pump.start()
        time.sleep(0.1)
        pump.stop()
        assert pump._file.closed
        assert not pump._thread.is_alive()

    def test_stop_idempotent(self, tmp_path):
        """stop() 多次调用应安全"""
        log_path = tmp_path / "test.log"
        process = FakePopen(stdout_lines=["line1\n"])
        pump = _LogPump(log_path, process)
        pump.start()
        pump.stop()
        pump.stop()
        pump.stop()
        assert pump._file.closed

    def test_writes_cleaned_ansi(self, tmp_path):
        """日志写入应清洗 ANSI 转义字符"""
        log_path = tmp_path / "test.log"
        ansi_line = "\x1b[32mGREEN LINE\x1b[0m\n"
        process = FakePopen(stdout_lines=[ansi_line])
        pump = _LogPump(log_path, process)
        pump.start()
        time.sleep(0.2)
        pump.stop()
        content = log_path.read_text(encoding="utf-8")
        assert "GREEN LINE" in content
        assert "\x1b" not in content

    def test_thread_exits_on_process_poll(self, tmp_path):
        """process.poll() 返非 None 时线程应退出"""
        log_path = tmp_path / "test.log"
        process = FakePopen(stdout_lines=[])
        pump = _LogPump(log_path, process)
        pump.start()
        time.sleep(0.1)
        # 模拟进程退出
        process._terminated = True
        time.sleep(0.3)
        assert not pump._thread.is_alive()
        pump.stop()


# ── _kill_port_windows 测试 ───────────────────────────────────


@pytest.mark.unit
class TestKillPortWindows:
    """Windows 端口清理: netstat + Python 过滤 + taskkill"""

    def test_no_match_skips_taskkill(self, tmp_path):
        """netstat 无 LISTENING 匹配 -> 不调 taskkill"""
        fake_sub = FakeSubprocessModule(
            run_results=[FakeCompletedProcess(0, " Proto  Local Address  Foreign Address  State  PID\n", "")]
        )
        _kill_port_windows(4723, fake_sub)
        # 仅 netstat 调用, 无 taskkill
        assert len(fake_sub.run_calls) >= 1
        for cmd in fake_sub.run_calls:
            assert "taskkill" not in " ".join(cmd)

    def test_listening_match_calls_taskkill(self, tmp_path):
        """netstat 有 LISTENING 匹配 -> 提取 PID + 调 taskkill"""
        netstat_output = "  TCP    127.0.0.1:4723         0.0.0.0:0              LISTENING       12345\n"
        fake_sub = FakeSubprocessModule(
            run_results=[
                FakeCompletedProcess(0, netstat_output, ""),
                FakeCompletedProcess(0, "", ""),
            ]
        )
        _kill_port_windows(4723, fake_sub)
        # 应有 taskkill 调用
        taskkill_calls = [c for c in fake_sub.run_calls if "taskkill" in " ".join(c)]
        assert len(taskkill_calls) == 1
        assert "12345" in taskkill_calls[0]

    def test_non_digit_pid_skipped(self, tmp_path):
        """PID 非数字 -> 跳过"""
        netstat_output = "  TCP    127.0.0.1:4723         0.0.0.0:0              LISTENING       abcde\n"
        fake_sub = FakeSubprocessModule(run_results=[FakeCompletedProcess(0, netstat_output, "")])
        _kill_port_windows(4723, fake_sub)
        for cmd in fake_sub.run_calls:
            assert "taskkill" not in " ".join(cmd)

    def test_short_line_skipped(self, tmp_path):
        """行分割后长度不足 -> 跳过"""
        netstat_output = "  short line\n"
        fake_sub = FakeSubprocessModule(run_results=[FakeCompletedProcess(0, netstat_output, "")])
        _kill_port_windows(4723, fake_sub)
        for cmd in fake_sub.run_calls:
            assert "taskkill" not in " ".join(cmd)

    def test_idempotent(self, tmp_path):
        """多次调用应安全"""
        fake_sub = FakeSubprocessModule(run_results=[FakeCompletedProcess(0, "", "")])
        _kill_port_windows(4723, fake_sub)
        _kill_port_windows(4723, fake_sub)
        _kill_port_windows(4723, fake_sub)

    def test_no_shell_true(self, tmp_path):
        """命令应为 list 形式, 无 shell=True"""
        fake_sub = FakeSubprocessModule(run_results=[FakeCompletedProcess(0, "", "")])
        _kill_port_windows(4723, fake_sub)
        for cmd in fake_sub.run_calls:
            assert isinstance(cmd, list), f"cmd 应为 list, 实为 {type(cmd)}"

    def test_port_substring_not_matched(self, tmp_path):
        """端口 4723 不应误匹配 47230"""
        netstat_output = "  TCP    0.0.0.0:47230        0.0.0.0:0              LISTENING       99999\n"
        fake_sub = FakeSubprocessModule(run_results=[FakeCompletedProcess(0, netstat_output, "")])
        _kill_port_windows(4723, fake_sub)
        # 47230 不应触发 taskkill (实现用 endswith(':4723') 精确匹配, :47230 不匹配)
        taskkill_calls = [c for c in fake_sub.run_calls if "taskkill" in " ".join(c)]
        assert len(taskkill_calls) == 0


# ── _kill_port_unix 测试 ──────────────────────────────────────


@pytest.mark.unit
class TestKillPortUnix:
    """Unix 端口清理: fuser -k"""

    def test_kill_calls_fuser(self, tmp_path):
        """应调 fuser -k {port}/tcp"""
        fake_sub = FakeSubprocessModule(run_results=[FakeCompletedProcess(0, "", "")])
        _kill_port_unix(4725, fake_sub)
        assert len(fake_sub.run_calls) == 1
        cmd = fake_sub.run_calls[0]
        assert "fuser" in cmd
        assert "-k" in cmd
        assert "4725/tcp" in cmd

    def test_kill_no_shell_true(self, tmp_path):
        """命令应为 list 形式"""
        fake_sub = FakeSubprocessModule(run_results=[FakeCompletedProcess(0, "", "")])
        _kill_port_unix(4725, fake_sub)
        assert isinstance(fake_sub.run_calls[0], list)


# ── _kill_port_process 分发测试 ───────────────────────────────


@pytest.mark.unit
class TestKillPortProcessDispatch:
    """_kill_port_process 按 platform.system() 分发到平台函数"""

    def test_dispatch_windows_calls_windows_func(self):
        """platform.system() == 'Windows' -> _kill_port_windows"""
        with patch("main.core.appium_server.platform") as mock_platform, patch(
            "main.core.appium_server._kill_port_windows"
        ) as mock_win:
            mock_platform.system.return_value = "Windows"
            _kill_port_process(4723)
            mock_win.assert_called_once()

    def test_dispatch_linux_calls_unix_func(self):
        """platform.system() == 'Linux' -> _kill_port_unix"""
        with patch("main.core.appium_server.platform") as mock_platform, patch(
            "main.core.appium_server._kill_port_unix"
        ) as mock_unix:
            mock_platform.system.return_value = "Linux"
            _kill_port_process(4723)
            mock_unix.assert_called_once()

    def test_dispatch_darwin_calls_unix_func(self):
        """platform.system() == 'Darwin' -> _kill_port_unix"""
        with patch("main.core.appium_server.platform") as mock_platform, patch(
            "main.core.appium_server._kill_port_unix"
        ) as mock_unix:
            mock_platform.system.return_value = "Darwin"
            _kill_port_process(4723)
            mock_unix.assert_called_once()

    def test_dispatch_injects_subprocess_module(self):
        """应支持 subprocess_module 注入"""
        fake_sub = FakeSubprocessModule()
        with patch("main.core.appium_server.platform") as mock_platform:
            mock_platform.system.return_value = "Windows"
            _kill_port_process(4723, fake_sub)


# ── AppiumServer 构造测试 ─────────────────────────────────────


@pytest.mark.unit
class TestAppiumServerConstruction:
    """AppiumServer __init__ + subprocess_module 注入"""

    def test_init_defaults(self, tmp_user_data):
        """默认 host/port/log_level"""
        server = AppiumServer()
        assert server.host == "127.0.0.1"
        assert server.port == 4723
        assert server.log_level == "info"

    def test_init_custom_host_port(self, tmp_user_data):
        """自定义 host/port"""
        server = AppiumServer(host="0.0.0.0", port=4725)
        assert server.host == "0.0.0.0"
        assert server.port == 4725

    def test_init_subprocess_module_injection(self, tmp_user_data):
        """subprocess_module 关键字参数注入"""
        fake_sub = FakeSubprocessModule()
        server = AppiumServer(subprocess_module=fake_sub)
        assert server._subprocess is fake_sub

    def test_init_no_is_running_field(self, tmp_user_data):
        """_is_running 字段应删除"""
        server = AppiumServer()
        assert not hasattr(server, "_is_running")

    def test_init_log_dir_created(self, tmp_user_data):
        """log_dir 应被创建"""
        server = AppiumServer()
        assert server.log_dir.exists()
        assert server.log_dir.is_dir()

    def test_init_process_none(self, tmp_user_data):
        """process 初始为 None"""
        server = AppiumServer()
        assert server.process is None

    def test_init_no_force_cleanup_method(self, tmp_user_data):
        """force_cleanup 公共方法应删除"""
        server = AppiumServer()
        assert not hasattr(server, "force_cleanup")

    def test_init_no_get_status_method(self, tmp_user_data):
        """get_status 方法应删除"""
        server = AppiumServer()
        assert not hasattr(server, "get_status")


# ── server_url @property 测试 ─────────────────────────────────


@pytest.mark.unit
class TestAppiumServerUrl:
    """server_url 应为 @property, 从 host/port 计算"""

    def test_server_url_format_default(self, tmp_user_data):
        """默认 host/port -> http://127.0.0.1:4723"""
        server = AppiumServer()
        assert server.server_url == "http://127.0.0.1:4723"

    def test_server_url_format_custom(self, tmp_user_data):
        """自定义 host/port -> http://0.0.0.0:4725"""
        server = AppiumServer(host="0.0.0.0", port=4725)
        assert server.server_url == "http://0.0.0.0:4725"

    def test_server_url_reflects_host_change(self, tmp_user_data):
        """host 变更后 server_url 同步"""
        server = AppiumServer(host="127.0.0.1", port=4723)
        assert server.server_url == "http://127.0.0.1:4723"
        server.host = "192.168.1.1"
        assert server.server_url == "http://192.168.1.1:4723"

    def test_server_url_reflects_port_change(self, tmp_user_data):
        """port 变更后 server_url 同步"""
        server = AppiumServer(host="127.0.0.1", port=4723)
        server.port = 4725
        assert server.server_url == "http://127.0.0.1:4725"


# ── apply_default_capabilities 测试 ───────────────────────────


@pytest.mark.unit
class TestApplyDefaultCapabilities:
    """apply_default_capabilities 静态方法"""

    def test_sets_six_fields(self):
        """应设置 6 个 capability 字段"""
        # R10: 不用 spec=UiAutomator2Options — camelCase setter (ensureWebviewsHavePages 等)
        # 不在 spec dir() 中, spec 会阻止 set。此处需灵活 mock 接受任意 attr set。
        options = MagicMock()
        AppiumServer.apply_default_capabilities(options)
        assert options.automation_name == AppiumServer.DEFAULT_AUTOMATION_NAME
        assert options.ensureWebviewsHavePages == AppiumServer.DEFAULT_CAPABILITIES["ensure_webviews_have_pages"]
        assert options.nativeWebScreenshot == AppiumServer.DEFAULT_CAPABILITIES["native_web_screenshot"]
        assert options.newCommandTimeout == AppiumServer.DEFAULT_CAPABILITIES["new_command_timeout"]
        assert options.connectHardwareKeyboard == AppiumServer.DEFAULT_CAPABILITIES["connect_hardware_keyboard"]
        assert options.androidInstallTimeout == AppiumServer.DEFAULT_SETTINGS_TIMEOUT
        assert options.appWaitDuration == AppiumServer.DEFAULT_SETTINGS_TIMEOUT

    def test_returns_options(self):
        """应返回 options 对象本身"""
        # R10: 同 test_sets_six_fields, camelCase setter 不兼容 spec
        options = MagicMock()
        result = AppiumServer.apply_default_capabilities(options)
        assert result is options


# ── start() 测试 ──────────────────────────────────────────────


@pytest.mark.unit
class TestAppiumServerStart:
    """start() 启动逻辑"""

    def test_start_already_running_returns_true(self, tmp_user_data):
        """已在运行 -> 返 True, 不创建 process"""
        fake_sub = FakeSubprocessModule()
        server = AppiumServer(subprocess_module=fake_sub)
        with patch.object(server, "is_server_running", return_value=True):
            result = server.start(timeout=1)
        assert result is True
        assert server.process is None  # 未创建新进程

    def test_start_success_returns_true(self, tmp_user_data):
        """Popen + is_server_running True -> 返 True"""
        fake_sub = FakeSubprocessModule(popen_factory=lambda *a, **kw: FakePopen(stdout_lines=[]))
        server = AppiumServer(subprocess_module=fake_sub)
        # 模拟: 第一次 is_server_running False (触发 Popen), 第二次 True (启动成功)
        with patch.object(server, "is_server_running", side_effect=[False, True]):
            result = server.start(timeout=5)
        assert result is True
        assert server.process is not None

    def test_start_timeout_auto_stop(self, tmp_user_data):
        """超时 -> 自动 stop() -> 返 False"""
        fake_sub = FakeSubprocessModule(popen_factory=lambda *a, **kw: FakePopen(stdout_lines=[]))
        server = AppiumServer(subprocess_module=fake_sub)
        # is_server_running 永远 False -> 超时
        with patch.object(server, "is_server_running", return_value=False):
            with patch.object(server, "stop") as mock_stop:
                result = server.start(timeout=1)
        assert result is False
        mock_stop.assert_called_once()

    def test_start_popen_exception_auto_stop(self, tmp_user_data):
        """Popen 异常 -> 自动 stop() -> 返 False"""

        def popen_raise(*a, **kw):
            raise OSError("spawn failed")

        fake_sub = FakeSubprocessModule(popen_factory=popen_raise)
        server = AppiumServer(subprocess_module=fake_sub)
        with patch.object(server, "is_server_running", return_value=False):
            with patch.object(server, "stop") as mock_stop:
                result = server.start(timeout=2)
        assert result is False
        mock_stop.assert_called()


# ── stop() 测试 ───────────────────────────────────────────────


@pytest.mark.unit
class TestAppiumServerStop:
    """stop() 统一清理: process + port"""

    def test_stop_idempotent(self, tmp_user_data):
        """多次 stop() 安全"""
        fake_sub = FakeSubprocessModule()
        server = AppiumServer(subprocess_module=fake_sub)
        server.stop()
        server.stop()
        server.stop()

    def test_stop_with_process_terminates(self, tmp_user_data):
        """有 process -> terminate + wait"""
        fake_sub = FakeSubprocessModule()
        server = AppiumServer(subprocess_module=fake_sub)
        fake_process = FakePopen()
        server.process = fake_process
        server._log_pump = None  # 跳过 log pump
        server.stop()
        assert fake_process._terminated is True

    def test_stop_no_process_still_port_cleanup(self, tmp_user_data):
        """无 process (用别人 server) -> 仍调 port killer"""
        fake_sub = FakeSubprocessModule(run_results=[FakeCompletedProcess(0, "", "")])
        server = AppiumServer(subprocess_module=fake_sub)
        server.process = None
        server._log_pump = None
        with patch("main.core.appium_server.platform") as mock_platform:
            mock_platform.system.return_value = "Windows"
            server.stop()
        # 应触发 netstat 调用 (端口清理兜底)
        assert len(fake_sub.run_calls) >= 1

    def test_stop_terminate_timeout_kills(self, tmp_user_data):
        """terminate wait 超时 -> kill"""
        fake_sub = FakeSubprocessModule()
        server = AppiumServer(subprocess_module=fake_sub)
        fake_process = FakePopen()
        fake_process._wait_timeout_raised = True
        server.process = fake_process
        server._log_pump = None
        server.stop()
        assert fake_process._killed is True

    def test_stop_resets_process_to_none(self, tmp_user_data):
        """stop 后 process 应为 None"""
        fake_sub = FakeSubprocessModule()
        server = AppiumServer(subprocess_module=fake_sub)
        server.process = FakePopen()
        server._log_pump = None
        server.stop()
        assert server.process is None


# ── is_server_running 测试 ────────────────────────────────────


@pytest.mark.unit
class TestAppiumServerIsRunning:
    """is_server_running HTTP 检测"""

    def test_running_200_returns_true(self, tmp_user_data):
        """200 -> True"""
        server = AppiumServer()
        with patch("main.core.appium_server.requests") as mock_req:
            mock_resp = MagicMock(spec=requests.Response)
            mock_resp.status_code = 200
            mock_req.get.return_value = mock_resp
            assert server.is_server_running() is True

    def test_non_200_returns_false(self, tmp_user_data):
        """非 200 -> False"""
        server = AppiumServer()
        with patch("main.core.appium_server.requests") as mock_req:
            mock_resp = MagicMock(spec=requests.Response)
            mock_resp.status_code = 500
            mock_req.get.return_value = mock_resp
            assert server.is_server_running() is False

    def test_exception_returns_false(self, tmp_user_data):
        """Exception -> False"""
        server = AppiumServer()
        with patch("main.core.appium_server.requests") as mock_req:
            mock_req.get.side_effect = Exception("conn refused")
            assert server.is_server_running() is False

    def test_keyboard_interrupt_not_caught(self, tmp_user_data):
        """KeyboardInterrupt 不应被捕获 (非 bare except)"""
        server = AppiumServer()
        with patch("main.core.appium_server.requests") as mock_req:
            mock_req.get.side_effect = KeyboardInterrupt()
            with pytest.raises(KeyboardInterrupt):
                server.is_server_running()


# ── 上下文管理器测试 ─────────────────────────────────────────


@pytest.mark.unit
class TestAppiumServerContextManager:
    """__enter__ / __exit__"""

    def test_enter_success_returns_self(self, tmp_user_data):
        """start 成功 -> __enter__ 返 self"""
        server = AppiumServer()
        with patch.object(server, "is_server_running", return_value=True):
            with patch.object(server, "stop"):
                result = server.__enter__()
                assert result is server
                server.__exit__(None, None, None)

    def test_enter_start_fails_raises(self, tmp_user_data):
        """start 失败 -> __enter__ raise RuntimeError"""
        server = AppiumServer()
        with patch.object(server, "is_server_running", return_value=False):
            with patch.object(server, "stop"):
                with pytest.raises(RuntimeError, match="Appium server start failed"):
                    server.__enter__()

    def test_exit_calls_stop(self, tmp_user_data):
        """__exit__ 应调 stop()"""
        server = AppiumServer()
        with patch.object(server, "stop") as mock_stop:
            server.__exit__(None, None, None)
            mock_stop.assert_called_once()

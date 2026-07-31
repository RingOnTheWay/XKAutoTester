"""ADBManager facade 集成测试。

验证:
- 默认构造 + adapter 注入
- 16+ 公共方法委托 collaborator
- 模块级工厂 + get_connected_devices
- check_crash_logs 双路径 (monitor 优先 + logcat -d 回退)
- LogcatMonitor lazy 持有
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

from main.core.adb.adb_port import AdbResult
from main.core.adb_manager import ADBManager, create_adb_manager, get_connected_devices
from tests.unit.helpers.fake_adb_adapter import FakeAdbAdapter


class TestADBManagerFacade:
    """ADBManager facade 集成测试。"""

    def _make_manager(self, device="dev:5555", pkg="com.x.app"):
        adapter = FakeAdbAdapter()
        mgr = ADBManager(device, pkg, adapter=adapter)
        return mgr, adapter

    # === 构造 + collaborator 装配 ===

    def test_default_construction_uses_subprocess_adapter(self):
        """无 adapter → 默认 SubprocessAdbAdapter (不抛错)。"""
        mgr = ADBManager("dev", "com.x")
        # 不暴露内部类型,仅验证 collaborator 装配成功
        assert mgr.device_name == "dev"
        assert mgr.app_package == "com.x"
        assert mgr._logcat_monitor is None

    def test_collaborators_kwarg_injection(self):
        """collaborators kwarg 注入自定义协作器。"""
        fake_conn = MagicMock()
        fake_app = MagicMock()
        fake_bt = MagicMock()
        mgr = ADBManager(
            "dev",
            "com.x",
            collaborators={"connection": fake_conn, "app": fake_app, "bluetooth": fake_bt},
        )

        fake_conn.check_adb_service.return_value = True
        assert mgr.check_adb_service() is True
        fake_conn.check_adb_service.assert_called_once()

    # === ADB 服务委托 ===

    def test_check_adb_service_delegates(self):
        mgr, adapter = self._make_manager()
        adapter.when(["version"], AdbResult(0, "Android Debug Bridge version 1.0.41", ""))

        assert mgr.check_adb_service() is True

    # === 设备连接委托 ===

    def test_connect_device_delegates(self):
        mgr, adapter = self._make_manager(device="70665345151351")
        adapter.when(
            ["devices"],
            AdbResult(0, "List of devices attached\n70665345151351\tdevice\n", ""),
        )

        ok, _ = mgr.connect_device()
        assert ok is True

    # === APP 生命周期委托 ===

    def test_check_app_status_delegates(self):
        mgr, adapter = self._make_manager()
        adapter.when(
            ["-s", "dev:5555", "shell", "dumpsys", "window", "windows"],
            AdbResult(0, "com.x.app", ""),
        )

        ok, err = mgr.check_app_status()
        assert ok is True
        assert err is None

    def test_force_stop_app_delegates(self):
        mgr, adapter = self._make_manager()
        adapter.when(
            ["-s", "dev:5555", "shell", "am", "force-stop", "com.x.app"],
            AdbResult(0, "", ""),
        )

        assert mgr.force_stop_app() is True

    def test_force_stop_app_silent_delegates(self):
        mgr, adapter = self._make_manager()
        adapter.when(
            ["-s", "dev:5555", "shell", "am", "force-stop", "com.x.app"],
            AdbResult(0, "", ""),
        )

        assert mgr.force_stop_app_silent() is True

    def test_get_app_pid_delegates(self):
        mgr, adapter = self._make_manager()
        adapter.when(
            ["-s", "dev:5555", "shell", "pidof", "com.x.app"],
            AdbResult(0, "12345\n", ""),
        )

        assert mgr.get_app_pid() == 12345

    def test_get_dumpsys_window_delegates(self):
        mgr, adapter = self._make_manager()
        adapter.when(
            ["-s", "dev:5555", "shell", "dumpsys", "window", "windows"],
            AdbResult(0, "window output", ""),
        )

        assert mgr.get_dumpsys_window() == "window output"

    def test_ensure_app_closed_delegates(self):
        mgr, adapter = self._make_manager()
        adapter.when(
            ["-s", "dev:5555", "shell", "dumpsys", "window", "windows"],
            AdbResult(0, "com.other.app", ""),
        )

        with patch("main.core.adb.app_lifecycle.time.sleep"):
            assert mgr.ensure_app_closed() is True

    # === 蓝牙委托 ===

    def test_check_bluetooth_status_delegates(self):
        mgr, adapter = self._make_manager()
        adapter.when(
            ["-s", "dev:5555", "shell", "settings", "get", "global", "bluetooth_on"],
            AdbResult(0, "1\n", ""),
        )

        ok, err = mgr.check_bluetooth_status()
        assert ok is True
        assert err is None

    def test_enable_bluetooth_delegates(self):
        mgr, adapter = self._make_manager()
        adapter.when(
            ["-s", "dev:5555", "shell", "svc", "bluetooth", "enable"],
            AdbResult(0, "", ""),
        )

        with patch("main.core.adb.bluetooth_control.time.sleep"):
            assert mgr.enable_bluetooth() is True

    def test_ensure_bluetooth_enabled_delegates(self):
        mgr, adapter = self._make_manager()
        adapter.when(
            ["-s", "dev:5555", "shell", "settings", "get", "global", "bluetooth_on"],
            AdbResult(0, "1\n", ""),
        )

        assert mgr.ensure_bluetooth_enabled() is True

    # === check_crash_logs 双路径 ===

    def test_check_crash_logs_uses_logcat_dump_when_no_monitor(self):
        """无 monitor → 走 logcat -d 回退路径。"""
        mgr, adapter = self._make_manager()
        adapter.when(
            ["-s", "dev:5555", "shell", "logcat -d"],
            AdbResult(
                0,
                "E AndroidRuntime: FATAL EXCEPTION: com.x.app\n"
                "E AndroidRuntime: Process: com.x.app, PID: 12345\n",
                "",
            ),
        )

        logs = mgr.check_crash_logs(pid=12345)

        assert len(logs) >= 1
        # 应捕获 FATAL EXCEPTION 行
        assert any("FATAL EXCEPTION" in line for line in logs)

    def test_check_crash_logs_uses_monitor_when_crash_detected(self):
        """monitor 已检测崩溃 → 走 monitor 路径,不调 adb。"""
        mgr, _ = self._make_manager()
        fake_monitor = MagicMock()
        fake_monitor.crash_detected = True
        fake_monitor.get_full_log.return_value = "full log content"
        fake_monitor.crash_info = {
            "crash_type": "FATAL",
            "crash_line": "NullPointerException",
        }
        mgr._logcat_monitor = fake_monitor

        logs = mgr.check_crash_logs()

        assert any("FATAL" in line for line in logs)
        assert any("NullPointerException" in line for line in logs)
        assert "full log content" in logs
        # 不应执行任何 adb 命令 (走 monitor 路径)
        # (FakeAdbAdapter.calls 应为空,但通过不抛错即可验证)

    def test_check_crash_logs_empty_when_no_crash_in_dump(self):
        """logcat -d 无崩溃行 → 返回空列表。"""
        mgr, adapter = self._make_manager()
        adapter.when(
            ["-s", "dev:5555", "shell", "logcat -d"],
            AdbResult(0, "I ActivityManager: Some normal log\n", ""),
        )

        logs = mgr.check_crash_logs()
        assert logs == []

    # === LogcatMonitor lazy 持有 ===

    def test_start_logcat_monitor_lazy_imports(self):
        """start_logcat_monitor lazy import LogcatMonitor。"""
        mgr, _ = self._make_manager()
        fake_monitor = MagicMock()
        fake_monitor.start.return_value = True

        with patch("main.core.logcat_monitor.LogcatMonitor", return_value=fake_monitor) as mock_cls:
            result = mgr.start_logcat_monitor(pid=12345, on_crash=lambda *a: None)

            assert result is True
            mock_cls.assert_called_once()
            # 实例化后保存
            assert mgr._logcat_monitor is fake_monitor

    def test_stop_logcat_monitor_when_not_started_is_noop(self):
        """未启动 monitor → stop 是 no-op。"""
        mgr, _ = self._make_manager()
        mgr.stop_logcat_monitor()  # 不抛错
        assert mgr._logcat_monitor is None

    def test_get_logcat_full_log_empty_when_not_started(self):
        """未启动 → 空字符串。"""
        mgr, _ = self._make_manager()
        assert mgr.get_logcat_full_log() == ""

    def test_is_crash_detected_false_when_not_started(self):
        """未启动 → False。"""
        mgr, _ = self._make_manager()
        assert mgr.is_crash_detected() is False

    def test_update_logcat_pid_when_not_started_logs_warning(self):
        """未启动 → 记 warning,不抛错。"""
        mgr, _ = self._make_manager()
        mgr.update_logcat_pid(12345)  # 不抛错

    def test_update_logcat_pid_none_is_noop(self):
        """pid=None → 静默跳过。"""
        mgr, _ = self._make_manager()
        fake_monitor = MagicMock()
        mgr._logcat_monitor = fake_monitor

        mgr.update_logcat_pid(None)
        fake_monitor.update_pid.assert_not_called()

    def test_update_logcat_pid_delegates_when_started(self):
        """已启动 → 委托 update_pid。"""
        mgr, _ = self._make_manager()
        fake_monitor = MagicMock()
        mgr._logcat_monitor = fake_monitor

        mgr.update_logcat_pid(99999)
        fake_monitor.update_pid.assert_called_once_with(99999)


class TestModuleLevelFunctions:
    """模块级函数测试。"""

    def test_create_adb_manager_returns_instance(self):
        mgr = create_adb_manager("dev:5555", "com.x.app")
        assert isinstance(mgr, ADBManager)
        assert mgr.device_name == "dev:5555"
        assert mgr.app_package == "com.x.app"

    def test_get_connected_devices_returns_list(self):
        """get_connected_devices 返回 list (不抛错即可)。"""
        with patch(
            "main.core.adb.subprocess_adb_adapter.subprocess.run"
        ) as mock_run:
            mock_run.return_value = MagicMock(
                returncode=0,
                stdout="List of devices attached\n",
                stderr="",
            )
            devices = get_connected_devices()
            assert isinstance(devices, list)

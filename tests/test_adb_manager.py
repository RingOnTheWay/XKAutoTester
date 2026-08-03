"""ADBManager 聚合根集成测试。

验证:
- 默认构造 + adapter 注入
- 聚合属性暴露 (connection/app/bluetooth)
- collaborator 通过属性可访问 (消除 pass-through 后调用方直接持属性)
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
    """ADBManager 聚合根集成测试。"""

    def _make_manager(self, device="dev:5555", pkg="com.x.app"):
        adapter = FakeAdbAdapter()
        mgr = ADBManager(device, pkg, adapter=adapter)
        return mgr, adapter

    # === 构造 + collaborator 装配 ===

    def test_default_construction_uses_subprocess_adapter(self):
        """无 adapter → 默认 SubprocessAdbAdapter (不抛错)。"""
        mgr = ADBManager("dev", "com.x")
        assert mgr.device_name == "dev"
        assert mgr.app_package == "com.x"
        assert mgr._logcat_monitor is None

    def test_collaborators_kwarg_injection(self):
        """collaborators kwarg 注入自定义协作器, 通过属性暴露。"""
        fake_conn = MagicMock()
        fake_app = MagicMock()
        fake_bt = MagicMock()
        mgr = ADBManager(
            "dev",
            "com.x",
            collaborators={"connection": fake_conn, "app": fake_app, "bluetooth": fake_bt},
        )

        # 聚合属性暴露注入的 collaborator (调用方直接持属性, 不再经由 pass-through)
        assert mgr.connection is fake_conn
        assert mgr.app is fake_app
        assert mgr.bluetooth is fake_bt
        # 通过属性访问 collaborator 方法
        fake_conn.check_adb_service.return_value = True
        assert mgr.connection.check_adb_service() is True
        fake_conn.check_adb_service.assert_called_once()

    # === 聚合属性: 默认构造 collaborator 可工作 ===

    def test_connection_property_returns_device_connection_service(self):
        """默认构造 → .connection 是 DeviceConnectionService, 可调 check_adb_service。"""
        mgr, adapter = self._make_manager()
        adapter.when(["version"], AdbResult(0, "Android Debug Bridge version 1.0.41", ""))

        assert mgr.connection.check_adb_service() is True

    def test_app_property_returns_app_lifecycle_service(self):
        """默认构造 → .app 是 AppLifecycleService, 可调 get_pid。"""
        mgr, adapter = self._make_manager()
        adapter.when(
            ["-s", "dev:5555", "shell", "pidof", "com.x.app"],
            AdbResult(0, "12345\n", ""),
        )

        assert mgr.app.get_pid() == 12345

    def test_bluetooth_property_returns_bluetooth_service(self):
        """默认构造 → .bluetooth 是 BluetoothService, 可调 check_status。"""
        mgr, adapter = self._make_manager()
        adapter.when(
            ["-s", "dev:5555", "shell", "settings", "get", "global", "bluetooth_on"],
            AdbResult(0, "1\n", ""),
        )

        ok, err = mgr.bluetooth.check_status()
        assert ok is True
        assert err is None

    # === check_crash_logs 双路径 (ADBManager 真实 deep 逻辑) ===

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
            assert mgr._logcat_monitor is fake_monitor

    def test_stop_logcat_monitor_when_not_started_is_noop(self):
        """未启动 monitor → stop 是 no-op。"""
        mgr, _ = self._make_manager()
        mgr.stop_logcat_monitor()
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
        mgr.update_logcat_pid(12345)

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
        with patch("main.core.adb.subprocess_adb_adapter.subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(
                returncode=0,
                stdout="List of devices attached\n",
                stderr="",
            )
            devices = get_connected_devices()
            assert isinstance(devices, list)

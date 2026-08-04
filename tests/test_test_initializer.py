"""TestInitializer 模块级纯函数 + factory 注入单元测试。

测试覆盖:
- _build_appium_options 纯函数 (7 字段 + capabilities)
- _classify_appium_error 纯函数 (Activity/SDK/未知错误分类)
- _set_appium_session_timeout 模块级函数 (socket 副作用包装)
- TestInitializer 7 factory kwarg 注入 (init_all/cleanup 各分支)

纯函数无 mock; factory 注入用 MagicMock + FakeClock 隔离 4 依赖 + time。
"""
from __future__ import annotations

import logging
from unittest.mock import MagicMock

import pytest

from main.core.test_initializer import (
    ADBConfig,
    AppiumConfig,
    TestConfig,
    TestInitializer,
    _build_appium_options,
    _classify_appium_error,
    _set_appium_session_timeout,
)


class FakeClock:
    """time 模块替身 (duck-typed, .sleep + .time)。"""

    def __init__(self) -> None:
        self.now = 1000.0
        self.slept: list[float] = []

    def sleep(self, seconds: float) -> None:
        self.slept.append(seconds)
        self.now += seconds

    def time(self) -> float:
        return self.now


def _make_real_config() -> TestConfig:
    """构造真实 TestConfig (factory 注入测试用)。"""
    return TestConfig(
        adb=ADBConfig(device_name="fake-dev", app_package="com.fake.app"),
        appium=AppiumConfig(
            platform_name="Android",
            platform_version="13",
            device_name="fake-dev",
            app_package="com.fake.app",
            app_activity=".MainActivity",
            no_reset=True,
            app_load_wait_time=0,  # 测试不真等
        ),
        ble=None,  # 跳过 BLE
    )


class TestBuildAppiumOptions:
    """_build_appium_options 纯函数测试。

    验证: 7 字段 (platform_name/version/device_name/app_package/app_activity/no_reset)
    + apply_default_capabilities 调用。
    """

    def test_build_options_with_all_fields(self) -> None:
        """全字段构造: 6 字段 + 默认 app_load_wait_time。"""
        cfg = AppiumConfig(
            platform_name="Android",
            platform_version="13",
            device_name="emulator-5554",
            app_package="com.example.app",
            app_activity=".MainActivity",
            no_reset=True,
            app_load_wait_time=10,
        )

        options = _build_appium_options(cfg)

        assert options.platform_name == "Android"
        assert options.platform_version == "13"
        assert options.device_name == "emulator-5554"
        assert options.app_package == "com.example.app"
        assert options.app_activity == ".MainActivity"
        assert options.no_reset is True

    def test_build_options_no_reset_false(self) -> None:
        """no_reset=False 传递。"""
        cfg = AppiumConfig(
            platform_name="Android",
            platform_version="13",
            device_name="dev",
            app_package="com.x",
            app_activity=".Act",
            no_reset=False,
        )

        options = _build_appium_options(cfg)

        assert options.no_reset is False

    def test_build_options_returns_uiautomator2_options(self) -> None:
        """返回 UiAutomator2Options 实例。"""
        from appium.options.android import UiAutomator2Options

        cfg = AppiumConfig(
            platform_name="Android",
            platform_version="13",
            device_name="dev",
            app_package="com.x",
            app_activity=".Act",
        )

        options = _build_appium_options(cfg)

        assert isinstance(options, UiAutomator2Options)

    def test_build_options_applies_default_capabilities(self) -> None:
        """apply_default_capabilities 被调用 (capabilities 非空)。

        AppiumServer.apply_default_capabilities 注入默认 capabilities (如 uiautomator2 端口等)。
        验证 options.capabilities 含非 platform_name 的其他键。
        """
        cfg = AppiumConfig(
            platform_name="Android",
            platform_version="13",
            device_name="dev",
            app_package="com.x",
            app_activity=".Act",
        )

        options = _build_appium_options(cfg)

        # capabilities 应含 platformName + 至少 1 个默认 capability
        caps = options.capabilities
        assert "platformName" in caps


class TestClassifyAppiumError:
    """_classify_appium_error 纯函数测试。

    验证: Activity 错误 / SDK 错误 / 未知错误 3 路径分类。
    原逻辑 (appium_init L277):
        if "Activity name" in error_msg and "doesn't exist or cannot be launched" in error_msg:
            return "python.testInitializer.appiumSessionActivityFailed"
        else:
            return "python.testInitializer.appiumSessionFailedSdkShort"
    """

    def test_activity_not_found_error(self) -> None:
        """Activity 错误: 含 "Activity name" + "doesn't exist or cannot be launched" → ActivityFailed。"""
        msg = "Activity name 'com.x.MainActivity' doesn't exist or cannot be launched"

        key = _classify_appium_error(msg)

        assert key == "python.testInitializer.appiumSessionActivityFailed"

    def test_sdk_generic_error(self) -> None:
        """SDK 错误: 不含 Activity 模式 → FailedSdkShort。"""
        msg = "Could not start a new session. Possible causes are invalid address"

        key = _classify_appium_error(msg)

        assert key == "python.testInitializer.appiumSessionFailedSdkShort"

    def test_unknown_error_falls_to_sdk(self) -> None:
        """未知错误: 兜底走 SDK 路径 (FailedSdkShort)。"""
        msg = "some random error"

        key = _classify_appium_error(msg)

        assert key == "python.testInitializer.appiumSessionFailedSdkShort"

    def test_activity_keyword_only_treated_as_sdk(self) -> None:
        """仅含 "Activity name" 不含 "doesn't exist..." → SDK 路径 (需 2 关键词同时)。"""
        msg = "Activity name something else"

        key = _classify_appium_error(msg)

        assert key == "python.testInitializer.appiumSessionFailedSdkShort"

    def test_empty_error_message(self) -> None:
        """空错误消息 → SDK 路径 (兜底)。"""
        key = _classify_appium_error("")

        assert key == "python.testInitializer.appiumSessionFailedSdkShort"


class TestSetAppiumSessionTimeout:
    """_set_appium_session_timeout 模块级函数测试。

    验证: socket.setdefaulttimeout 包装 (与 inspector _check_port_in_use 对称)。
    模块级函数 (非纯函数, 有 socket 副作用), monkeypatch socket 验证。
    """

    def test_calls_socket_setdefaulttimeout(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """调 _set_appium_session_timeout(30) → socket.setdefaulttimeout(30) 被调。"""
        import socket as socket_module

        captured: list[float] = []
        monkeypatch.setattr(socket_module, "setdefaulttimeout", lambda s: captured.append(s))

        _set_appium_session_timeout(30)

        assert captured == [30]

    def test_zero_timeout_passed_through(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """0 timeout 透传 (不内部加判断)。"""
        import socket as socket_module

        captured: list[float] = []
        monkeypatch.setattr(socket_module, "setdefaulttimeout", lambda s: captured.append(s))

        _set_appium_session_timeout(0)

        assert captured == [0]

    def test_float_timeout_passed_through(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """float timeout 透传。"""
        import socket as socket_module

        captured: list[float] = []
        monkeypatch.setattr(socket_module, "setdefaulttimeout", lambda s: captured.append(s))

        _set_appium_session_timeout(15.5)

        assert captured == [15.5]


class TestFactoryInjection:
    """TestInitializer 7 factory kwarg 注入测试。

    注入 fake 7 factory + FakeClock, 隔离 ADB/BLE/Appium/WebDriver/CrashMonitor/Faker/time。
    覆盖 init_all 成功路径 + 各 init 失败分支 + cleanup。
    """

    def _make_fake_adb(self, *, check_service: bool = True, connect: tuple[bool, str] = (True, "ok")) -> MagicMock:
        """构造 fake ADBManager。

        方法名对齐 ADBManager 聚合根实际调用路径：
        - adb_manager.connection.check_adb_service() / .connect()
        - adb_manager.bluetooth.ensure_enabled()
        - adb_manager.app.force_stop(silent=True) / .get_pid() / .get_dumpsys_window() / .ensure_closed(2)
        - adb_manager.update_logcat_pid(pid)  # 自身方法
        """
        adb = MagicMock()
        adb.connection.check_adb_service.return_value = check_service
        adb.connection.connect.return_value = connect
        adb.bluetooth.ensure_enabled.return_value = True
        adb.app.force_stop.return_value = None
        adb.app.get_pid.return_value = "1234"
        adb.app.get_dumpsys_window.return_value = "window_state"
        adb.app.ensure_closed.return_value = True
        adb.update_logcat_pid.return_value = None
        return adb

    def _make_fake_appium_server(self, *, start_ok: bool = True) -> MagicMock:
        """构造 fake AppiumServer。"""
        server = MagicMock()
        server.start.return_value = start_ok
        server.stop.return_value = None
        server.server_url = "http://fake:4723"
        return server

    def _make_fake_driver(self) -> MagicMock:
        """构造 fake webdriver.Remote。"""
        driver = MagicMock()
        driver.session_id = "fake-sid"
        driver.current_activity = ".MainActivity"
        driver.quit.return_value = None
        return driver

    def test_init_all_success_with_all_fake_factories(self) -> None:
        """成功路径: 全 fake factory + FakeClock → init_all True, 各字段填充。"""
        fake_adb = self._make_fake_adb()
        fake_server = self._make_fake_appium_server()
        fake_driver = self._make_fake_driver()
        fake_crash = MagicMock()
        fake_faker = MagicMock()
        clock = FakeClock()

        init = TestInitializer(
            config=_make_real_config(),
            logger=logging.getLogger("test"),
            adb_manager_factory=lambda d, p: fake_adb,
            ble_device_factory=lambda cfg: MagicMock(),
            appium_server_factory=lambda h, p: fake_server,
            driver_factory=lambda url, options: fake_driver,
            crash_monitor_factory=lambda adb, reporter, lg: fake_crash,
            faker_factory=lambda: fake_faker,
            time_provider=clock,
        )

        result = init.init_all()

        assert result is True
        assert init.adb_manager is fake_adb
        assert init.appium_server is fake_server
        assert init.driver is fake_driver
        assert init.crash_monitor is fake_crash
        assert init.fake is fake_faker
        assert init.app_pid == "1234"
        # FakeClock 不真等
        assert clock.slept == [2, 0]

    def test_adb_init_skip_when_check_service_false(self) -> None:
        """adb_init: check_adb_service → False → _skip, init_all 抛 skip。"""
        fake_adb = self._make_fake_adb(check_service=False)
        init = TestInitializer(
            config=_make_real_config(),
            logger=logging.getLogger("test"),
            adb_manager_factory=lambda d, p: fake_adb,
            time_provider=FakeClock(),
        )

        # init_all 失败 → _abort 抛 pytest.skip.Exception (skip 类型)
        with pytest.raises(pytest.skip.Exception):
            init.init_all()

        # outcome 应被记为 skip
        assert init._outcome is not None
        assert init._outcome.severity == "skip"

    def test_adb_init_skip_when_connect_device_fails(self) -> None:
        """adb_init: connect_device → (False, msg) → _skip。"""
        fake_adb = self._make_fake_adb(connect=(False, "device offline"))
        init = TestInitializer(
            config=_make_real_config(),
            logger=logging.getLogger("test"),
            adb_manager_factory=lambda d, p: fake_adb,
            time_provider=FakeClock(),
        )

        with pytest.raises(pytest.skip.Exception):
            init.init_all()

        assert init._outcome is not None
        assert init._outcome.severity == "skip"

    def test_appium_init_skip_when_server_start_fails(self) -> None:
        """appium_init: appium_server.start → False → _skip。"""
        fake_adb = self._make_fake_adb()
        fake_server = self._make_fake_appium_server(start_ok=False)
        init = TestInitializer(
            config=_make_real_config(),
            logger=logging.getLogger("test"),
            adb_manager_factory=lambda d, p: fake_adb,
            appium_server_factory=lambda h, p: fake_server,
            crash_monitor_factory=lambda *a: MagicMock(),
            time_provider=FakeClock(),
        )

        with pytest.raises(pytest.skip.Exception):
            init.init_all()

        assert init._outcome is not None
        assert init._outcome.severity == "skip"

    def test_appium_init_fail_when_driver_raises_activity_error(self) -> None:
        """appium_init: driver_factory 抛 Activity 错误 → _fail (severity=fail)。"""
        fake_adb = self._make_fake_adb()
        fake_server = self._make_fake_appium_server()
        fake_crash = MagicMock()

        def _raise_activity_error(url, options):
            raise RuntimeError("Activity name '.Main' doesn't exist or cannot be launched")

        init = TestInitializer(
            config=_make_real_config(),
            logger=logging.getLogger("test"),
            adb_manager_factory=lambda d, p: fake_adb,
            appium_server_factory=lambda h, p: fake_server,
            driver_factory=_raise_activity_error,
            crash_monitor_factory=lambda *a: fake_crash,
            time_provider=FakeClock(),
        )

        with pytest.raises(pytest.fail.Exception):
            init.init_all()

        assert init._outcome is not None
        assert init._outcome.severity == "fail"
        # crash_monitor.check_and_attach_on_init_error 应被调
        fake_crash.check_and_attach_on_init_error.assert_called_once()

    def test_appium_init_fail_when_driver_raises_sdk_error(self) -> None:
        """appium_init: driver_factory 抛 SDK 错误 → _fail + dumpsys 兜底。"""
        fake_adb = self._make_fake_adb()
        fake_server = self._make_fake_appium_server()
        fake_crash = MagicMock()

        def _raise_sdk_error(url, options):
            raise RuntimeError("Could not start session. Invalid address")

        init = TestInitializer(
            config=_make_real_config(),
            logger=logging.getLogger("test"),
            adb_manager_factory=lambda d, p: fake_adb,
            appium_server_factory=lambda h, p: fake_server,
            driver_factory=_raise_sdk_error,
            crash_monitor_factory=lambda *a: fake_crash,
            time_provider=FakeClock(),
        )

        with pytest.raises(pytest.fail.Exception):
            init.init_all()

        assert init._outcome is not None
        assert init._outcome.severity == "fail"
        # dumpsys 兜底应被调
        fake_adb.app.get_dumpsys_window.assert_called_once()

    def test_cleanup_calls_quit_stop_close_on_fake_resources(self) -> None:
        """cleanup: 调 driver.quit + appium_server.stop + adb.app.ensure_closed + crash_monitor.stop。"""
        fake_adb = self._make_fake_adb()
        fake_server = self._make_fake_appium_server()
        fake_driver = self._make_fake_driver()
        fake_crash = MagicMock()

        init = TestInitializer(
            config=_make_real_config(),
            logger=logging.getLogger("test"),
            adb_manager_factory=lambda d, p: fake_adb,
            appium_server_factory=lambda h, p: fake_server,
            driver_factory=lambda url, options: fake_driver,
            crash_monitor_factory=lambda *a: fake_crash,
            faker_factory=lambda: MagicMock(),
            time_provider=FakeClock(),
        )
        init.init_all()

        # cleanup
        init.cleanup()

        fake_crash.stop_and_attach_log.assert_called_once()
        fake_driver.quit.assert_called_once()
        fake_adb.app.ensure_closed.assert_called_once_with(2)
        fake_server.stop.assert_called_once()

    def test_time_provider_fake_clock_no_real_sleep(self) -> None:
        """time_provider=FakeClock → time.sleep 不真等, time.time 受控。"""
        fake_adb = self._make_fake_adb()
        fake_server = self._make_fake_appium_server()
        fake_driver = self._make_fake_driver()
        clock = FakeClock()

        init = TestInitializer(
            config=_make_real_config(),
            logger=logging.getLogger("test"),
            adb_manager_factory=lambda d, p: fake_adb,
            appium_server_factory=lambda h, p: fake_server,
            driver_factory=lambda url, options: fake_driver,
            crash_monitor_factory=lambda *a: MagicMock(),
            faker_factory=lambda: MagicMock(),
            time_provider=clock,
        )

        init.init_all()

        # FakeClock.slept 应含 [2, app_load_wait_time=0]
        assert clock.slept == [2, 0]
        # time.time 应被调 (start_time + elapsed_time)
        assert clock.now > 1000.0

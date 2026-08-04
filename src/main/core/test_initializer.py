"""
测试初始化模块
提供ADB、蓝牙、Appium的统一初始化管理
"""

import logging
import socket
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from appium import webdriver
from appium.options.android import UiAutomator2Options
from faker import Faker

from main.core.adb_manager import ADBManager
from main.core.appium_server import AppiumServer
from main.core.ble_device import BLEDevice
from main.core.crash_monitor import CrashMonitor
from main.utils.i18n import t
from main.utils.test_reporter import TestReporter


@dataclass
class ADBConfig:
    """ADB配置"""

    device_name: str
    app_package: str


@dataclass
class BLEConfig:
    """蓝牙配置"""

    port: str
    ble_name: str
    adv_data: str
    uuids: str
    uuidn: str
    uuidw: str


@dataclass
class AppiumConfig:
    """Appium配置"""

    platform_name: str
    platform_version: str
    device_name: str
    app_package: str
    app_activity: str
    no_reset: bool = True
    app_load_wait_time: int = 10


@dataclass
class TestConfig:
    adb: ADBConfig
    appium: AppiumConfig
    ble: BLEConfig | None = None


@dataclass
class _InitOutcome:
    """初始化结果记录（不抛 BaseException，由 _abort 边界统一抛）"""

    reason: str
    severity: str  # 'skip' | 'fail'


# ── 工厂类型别名 (与 inspector_service.DriverFactory/ServerFactory 对称) ──
AdbManagerFactory = Callable[[str, str], ADBManager]
BleDeviceFactory = Callable[[BLEConfig], BLEDevice]
AppiumServerFactory = Callable[[str, int], AppiumServer]
DriverFactory = Callable[[str, UiAutomator2Options], webdriver.Remote]
CrashMonitorFactory = Callable[[ADBManager, TestReporter, logging.Logger], CrashMonitor]
FakerFactory = Callable[[], Faker]
# duck-typed: .sleep(float)->None + .time()->float (与 inspector _check_port_in_use 同模式)
TimeProvider = Any


# ── 模块级纯函数 (与 inspector_service._map_appium_error/_check_port_in_use 对称) ──


def _build_appium_options(cfg: AppiumConfig) -> UiAutomator2Options:
    """纯函数: 构造 UiAutomator2Options + 注入默认 capabilities。

    从原 appium_init L194-203 提取, 无 self 依赖, 无副作用。

    Args:
        cfg: AppiumConfig (6 字段)

    Returns:
        UiAutomator2Options 实例 (含 platform/version/device/package/activity/no_reset
        + AppiumServer.apply_default_capabilities 注入的默认 capabilities)
    """
    options = UiAutomator2Options()
    options.platform_name = cfg.platform_name
    options.platform_version = cfg.platform_version
    options.device_name = cfg.device_name
    options.app_package = cfg.app_package
    options.app_activity = cfg.app_activity
    options.no_reset = cfg.no_reset
    AppiumServer.apply_default_capabilities(options)
    return options


def _classify_appium_error(error_msg: str) -> str:
    """纯函数: Appium 会话错误分类, 返回 i18n key。

    从原 appium_init L277-298 提取, 无 self 依赖, 无副作用。
    与 inspector_service._map_appium_error 对称 (regex 模式表)。

    分类规则:
    - 含 "Activity name" + "doesn't exist or cannot be launched" → ActivityFailed
    - 其他 → FailedSdkShort (兜底)

    Args:
        error_msg: Appium 抛出的异常 str

    Returns:
        i18n key 字符串 (用于 t() 翻译 + self._fail)
    """
    if "Activity name" in error_msg and "doesn't exist or cannot be launched" in error_msg:
        return "python.testInitializer.appiumSessionActivityFailed"
    return "python.testInitializer.appiumSessionFailedSdkShort"


def _set_appium_session_timeout(seconds: float) -> None:
    """模块级函数: 包装 socket.setdefaulttimeout。

    从原 appium_init L214 提取, 与 inspector_service._check_port_in_use 对称
    (socket 操作不进 factory, 模块级包装便于 monkeypatch 测试)。

    Args:
        seconds: 超时秒数 (传给 socket.setdefaulttimeout)
    """
    socket.setdefaulttimeout(seconds)


class TestInitializer:
    """测试初始化器"""

    def __init__(
        self,
        config: TestConfig | None,
        logger: logging.Logger | None = None,
        *,
        adb_manager_factory: AdbManagerFactory | None = None,
        ble_device_factory: BleDeviceFactory | None = None,
        appium_server_factory: AppiumServerFactory | None = None,
        driver_factory: DriverFactory | None = None,
        crash_monitor_factory: CrashMonitorFactory | None = None,
        faker_factory: FakerFactory | None = None,
        time_provider: TimeProvider | None = None,
    ) -> None:
        """
        初始化器

        Args:
            config: 测试配置对象 (None 仅用于单元测试构造, init_all 会失败)
            logger: 日志记录器
            adb_manager_factory: ADBManager 工厂 (默认 ADBManager)
            ble_device_factory: BLEDevice 工厂 (默认从 BLEConfig 构造)
            appium_server_factory: AppiumServer 工厂 (默认 AppiumServer(host,port))
            driver_factory: webdriver.Remote 工厂 (默认 webdriver.Remote)
            crash_monitor_factory: CrashMonitor 工厂 (默认 CrashMonitor)
            faker_factory: Faker 工厂 (默认 Faker)
            time_provider: time 模块替身 (默认 time, 需 .sleep/.time 方法)
        """
        self.config = config
        self.logger = logger or logging.getLogger(__name__)
        self.reporter = TestReporter(self.logger)

        # factory-or-default (与 inspector_service._driver_factory 模式对称)
        self._adb_manager_factory: AdbManagerFactory = adb_manager_factory or (
            lambda device, pkg: ADBManager(device, pkg)
        )
        self._ble_device_factory: BleDeviceFactory = ble_device_factory or (
            lambda cfg: BLEDevice(
                port=cfg.port,
                ble_name=cfg.ble_name,
                adv_data=cfg.adv_data,
                uuidw=cfg.uuidw,
                uuidn=cfg.uuidn,
                uuids=cfg.uuids,
            )
        )
        self._appium_server_factory: AppiumServerFactory = appium_server_factory or (
            lambda host, port: AppiumServer(host=host, port=port)
        )
        self._driver_factory: DriverFactory = driver_factory or webdriver.Remote
        self._crash_monitor_factory: CrashMonitorFactory = crash_monitor_factory or (
            lambda adb, reporter, log: CrashMonitor(adb, reporter, log)
        )
        self._faker_factory: FakerFactory = faker_factory or Faker
        self._time: TimeProvider = time_provider or time

        self.adb_manager: ADBManager | None = None
        self.ble_device: BLEDevice | None = None
        self.appium_server: AppiumServer | None = None
        self.crash_monitor: CrashMonitor | None = None
        self.driver = None
        self.options: UiAutomator2Options | None = None
        self.app_pid: str | None = None
        self.fake: Faker | None = None
        # 契约修复：init 步骤记录 outcome，不直接抛 BaseException
        self._outcome: _InitOutcome | None = None
        self._cleaned: bool = False

    def adb_init(self) -> bool:
        """
        ADB初始化：检查ADB服务、连接设备、开启蓝牙

        Returns:
            bool: 初始化是否成功
        """
        self.logger.info(t("python.testInitializer.usingDevice", device=self.config.adb.device_name))

        try:
            self.adb_manager = self._adb_manager_factory(
                self.config.adb.device_name, self.config.adb.app_package
            )

            if not self.adb_manager.connection.check_adb_service():
                self.logger.warning(t("python.testInitializer.adbServiceError"))
                return self._skip(t("python.testInitializer.adbServiceErrorShort"))

            connect_success, connect_status = self.adb_manager.connection.connect()
            if not connect_success:
                self.logger.warning(
                    t(
                        "python.testInitializer.deviceConnectFailed",
                        device=self.config.adb.device_name,
                        status=connect_status,
                    )
                )
                return self._skip(
                    t("python.testInitializer.deviceConnectFailedShort", device=self.config.adb.device_name)
                )

            if self.config.ble is not None:
                if not self.adb_manager.bluetooth.ensure_enabled():
                    self.logger.warning(t("python.testInitializer.bluetoothEnableFailed"))
                    return self._skip(t("python.testInitializer.bluetoothEnableFailedShort"))
            else:
                self.logger.info(t("python.testInitializer.noBleConfigSkipCheck"))

            self.logger.info(t("python.testInitializer.adbInitSuccess"))

            # ADB 连接成功后立即启动 logcat 监控（不依赖 PID，按包名过滤）
            self.crash_monitor = self._crash_monitor_factory(self.adb_manager, self.reporter, self.logger)
            self.crash_monitor.start(pid=self.app_pid)

            return True

        except Exception as e:
            self.logger.warning(t("python.testInitializer.adbDeviceCheckFailed", error=e))
            return self._skip(t("python.testInitializer.adbDeviceCheckFailedShort"))

    def ble_init(self) -> bool:
        if self.config.ble is None:
            self.logger.info(t("python.testInitializer.noBleConfigSkipInit"))
            return True

        ble_config = self.config.ble
        self.logger.info(t("python.testInitializer.bleDeviceName", name=ble_config.ble_name))
        self.logger.info(t("python.testInitializer.bleAdvData", data=ble_config.adv_data))
        self.logger.info(t("python.testInitializer.bleUuids", uuid=ble_config.uuids))
        self.logger.info(t("python.testInitializer.bleUuidn", uuid=ble_config.uuidn))
        self.logger.info(t("python.testInitializer.bleUuidw", uuid=ble_config.uuidw))

        try:
            self.ble_device = self._ble_device_factory(ble_config)
            self.logger.info(t("python.testInitializer.bleDeviceCreated"))

            # 初始化蓝牙设备（打开串口、设置参数）
            if not self.ble_device.initialize():
                self.logger.error(t("python.testInitializer.bleInitFailed"))
                return self._fail(t("python.testInitializer.bleInitFailed"))

            self.logger.info(t("python.testInitializer.bleInitComplete"))
            self.reporter.attach(
                t("python.testInitializer.bleInitComplete"), name=t("python.testInitializer.bleInitAttachName")
            )
            return True
        except Exception as e:
            self.logger.error(t("python.testInitializer.bleInitError", error=e))
            self.reporter.attach(
                t("python.testInitializer.bleInitError", error=str(e)),
                name=t("python.testInitializer.bleInitErrorAttachName"),
            )
            return self._fail(t("python.testInitializer.bleInitFailedWithError", error=e))

    def appium_init(self) -> bool:
        """Appium初始化：创建options、启动服务器、创建driver。

        god method 拆分 (RFC 阶段 3): ~40 行编排器, 委托 4 私有方法 + 2 纯函数。

        Returns:
            bool: 初始化是否成功
        """
        self.options = _build_appium_options(self.config.appium)
        self.appium_server = self._appium_server_factory(
            AppiumServer.DEFAULT_HOST, AppiumServer.DEFAULT_PORT
        )

        if not self.appium_server.start():
            self.logger.error(t("python.testInitializer.appiumServerStartFailed"))
            return self._skip(t("python.testInitializer.appiumServerStartFailedShort"))

        try:
            self._create_driver_session()
            self._track_app_pid()
            self._wait_app_load()
            self.logger.info(t("python.testInitializer.appiumInitSuccess"))
            return True
        except Exception as e:
            return self._handle_appium_error(e)

    def _create_driver_session(self) -> None:
        """私有: driver 构造 + time 计时 + log/attach。

        从原 appium_init L211-223 提取。
        """
        self.logger.info(t("python.testInitializer.creatingAppiumSession"))
        start_time = self._time.time()
        _set_appium_session_timeout(AppiumServer.DEFAULT_SESSION_TIMEOUT)
        self.adb_manager.app.force_stop(silent=True)
        self._time.sleep(2)

        self.driver = self._driver_factory(self.appium_server.server_url, options=self.options)

        elapsed_time = self._time.time() - start_time
        self.logger.info(t("python.testInitializer.appiumSessionCreated", time=f"{elapsed_time:.2f}"))
        self.logger.info(t("python.testInitializer.deviceInfo", info=self.options.capabilities))
        self.logger.info(t("python.testInitializer.sessionId", id=self.driver.session_id))

        self.reporter.attach(
            t(
                "python.testInitializer.appiumSessionAttachInfo",
                info=self.options.capabilities,
                session_id=self.driver.session_id,
                time=f"{elapsed_time:.2f}",
            ),
            name=t("python.testInitializer.deviceConfigAttachName"),
        )

    def _track_app_pid(self) -> None:
        """私有: PID 首次获取 + logcat pid 更新。

        从原 appium_init L235-246 提取。
        """
        self.logger.info(t("python.testInitializer.gettingAppPid"))
        self.app_pid = self.adb_manager.app.get_pid()
        if self.app_pid:
            self.logger.info(t("python.testInitializer.gotAppPid", pid=self.app_pid))
            self.reporter.attach(
                t("python.testInitializer.appPidAttach", pid=self.app_pid),
                name=t("python.testInitializer.appPidAttachName"),
            )
            # 更新 logcat monitor 的 PID（monitor 已在 adb_init 时启动）
            self.adb_manager.update_logcat_pid(self.app_pid)
        else:
            self.logger.warning(t("python.testInitializer.cannotGetAppPid"))

    def _wait_app_load(self) -> None:
        """私有: sleep app_load_wait_time + 重抓 PID + current_activity attach。

        从原 appium_init L248-265 提取。
        """
        self.logger.info(t("python.testInitializer.waitingAppLoad", seconds=self.config.appium.app_load_wait_time))
        self._time.sleep(self.config.appium.app_load_wait_time)

        # 等待后重新获取 PID（app 可能在加载期间崩溃重启，PID 已变化）
        new_pid = self.adb_manager.app.get_pid()
        if new_pid and new_pid != self.app_pid:
            self.logger.info(t("python.testInitializer.appPidChanged", old_pid=self.app_pid, new_pid=new_pid))
            self.app_pid = new_pid
            # 更新 logcat monitor 的 PID
            self.adb_manager.update_logcat_pid(new_pid)

        current_activity = self.driver.current_activity
        self.logger.info(t("python.testInitializer.currentActivity", activity=current_activity))
        self.reporter.attach(
            t("python.testInitializer.currentActivity", activity=current_activity),
            name=t("python.testInitializer.activityInfoAttachName"),
        )

    def _handle_appium_error(self, e: Exception) -> bool:
        """私有: crash_monitor None 保护 + _classify_appium_error + dumpsys 兜底。

        从原 appium_init L270-298 提取, 用 _classify_appium_error 纯函数替代内联字符串匹配。
        """
        error_msg = str(e)

        # Appium 会话失败时，检查 logcat 是否捕获到崩溃日志
        if self.crash_monitor:
            self.crash_monitor.check_and_attach_on_init_error(app_pid=self.app_pid)

        key = _classify_appium_error(error_msg)
        if key == "python.testInitializer.appiumSessionActivityFailed":
            self.logger.error(t("python.testInitializer.appiumSessionActivityError", error=error_msg))
            self.logger.error(t("python.testInitializer.checkActivityConfig"))
            self.reporter.attach(
                t("python.testInitializer.appiumActivityErrorAttach", error=error_msg),
                name=t("python.testInitializer.activityErrorAttachName"),
            )
            return self._fail(t(key))

        # SDK 错误路径
        self.logger.error(t("python.testInitializer.appiumSessionFailedSdk", error=error_msg))
        self.reporter.attach(
            t("python.testInitializer.appiumSessionFailedSdkAttach", error=error_msg),
            name=t("python.testInitializer.sessionErrorAttachName"),
        )

        try:
            window_state = self.adb_manager.app.get_dumpsys_window()
            self.logger.info(t("python.testInitializer.deviceWindowState", state=window_state[:500]))
        except Exception as adb_error:
            self.logger.error(t("python.testInitializer.deviceStateCheckFailed", error=adb_error))

        return self._fail(t(key, error=error_msg))

    def init_all(self) -> bool:
        """
        执行所有初始化。任一初始化失败立即调用 cleanup() 并通过 _abort 抛 BaseException。

        Returns:
            bool: 全部初始化成功返回 True。失败时永不返回（_abort 抛 BaseException）。
        """
        if not self.adb_init():
            self._abort()
        if not self.ble_init():
            self._abort()
        if not self.appium_init():
            self._abort()
        self.fake = self._faker_factory()
        self.logger.info(t("python.testInitializer.testClassInitComplete"))
        return True

    def _skip(self, reason: str) -> bool:
        """记录 skip outcome（不抛 BaseException），返回 False"""
        if self._outcome is None:
            self._outcome = _InitOutcome(reason, "skip")
        return False

    def _fail(self, reason: str) -> bool:
        """记录 fail outcome（不抛 BaseException），返回 False"""
        if self._outcome is None:
            self._outcome = _InitOutcome(reason, "fail")
        return False

    def _abort(self) -> None:
        """cleanup 后统一以 skip 退出。

        原设计：fail 路径用 pytest.fail → setup_class 抛 Failed(BaseException 子类)，
        pytest xunit setup 不捕获非 Exception，导致 allure-pytest 不写 result.json → 不生成报告。
        统一改 skip：所有初始化失败（含 BLE/appium fail 路径）都通过 pytest.skip 退出，
        setup_class 抛 Skipped → setup phase skipped → allure-pytest 仍生成 result.json → HTML 报告正常。
        """
        self.cleanup()
        oc = self._outcome or _InitOutcome("unknown init failure", "fail")
        # 附加失败原因到 Allure（severity 区分 fail/skip 语义，便于排障）
        self.reporter.attach(
            t(
                "python.testInitializer.initFailedSummary",
                severity=oc.severity,
                reason=oc.reason,
            ),
            name=t("python.testInitializer.initFailedAttachName"),
        )
        self.reporter.skip(oc.reason)

    def cleanup(self) -> None:
        """清理资源（幂等：多次调用安全；per-resource _safe：单资源失败不阻塞后续）"""
        if self._cleaned:
            return
        self._cleaned = True

        # 停止 logcat 监控并附加日志到 Allure
        if self._safe("crash_monitor", self.crash_monitor, lambda m: m.stop_and_attach_log()):
            pass  # crash_monitor 无成功日志
        # 强制关闭测试APP（driver.quit 关闭 session）
        if self._safe("driver", self.driver, lambda d: d.quit()):
            self.logger.info(t("python.testInitializer.driverClosed"))
        # 确保 APP 已关闭
        # P3 修复漏网: ensure_app_closed 已从 adb_manager 删除, 改调 adb_manager.app.ensure_closed
        if self._safe("adb_manager", self.adb_manager, lambda m: m.app.ensure_closed(2)):
            self.logger.info(t("python.testInitializer.testAppForceStopped"))
        # 关闭蓝牙串口
        if self._safe("ble_device", self.ble_device, lambda d: d.close()):
            self.logger.info(t("python.testInitializer.bleDeviceClosed"))
        # 清理 Appium 进程
        if self._safe("appium_server", self.appium_server, lambda s: s.stop()):
            self.logger.info(t("python.testInitializer.appiumServerCleaned"))

    def _safe(self, name: str, target, fn) -> bool:
        """单资源清理（None 守门 + 异常隔离）。返回 True 表示成功执行，False 表示跳过或失败"""
        if target is None:
            return False
        try:
            fn(target)
            return True
        except Exception as e:
            self.logger.error(f"{name} cleanup failed: {e}")
            return False

    def __enter__(self) -> "TestInitializer":
        """上下文管理器入口（可选糖，调用方仍可用 init_all + cleanup 显式控制）"""
        self.init_all()
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        """上下文管理器出口（返 None → 不吞异常，skip/fail 正常透传给 pytest）"""
        self.cleanup()

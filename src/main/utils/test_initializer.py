"""
测试初始化模块
提供ADB、蓝牙、Appium的统一初始化管理
"""
import subprocess
import time
import logging
import socket
from dataclasses import dataclass
from typing import Optional

import pytest
import allure
from appium import webdriver
from appium.options.android import UiAutomator2Options
from faker import Faker

from main.utils.i18n import t
from main.core.adb_manager import ADBManager
from main.core.appium_server import AppiumServer
from main.core.mock_ble_device import BLEDevice


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
    ble: Optional[BLEConfig] = None


class TestInitializer:
    """测试初始化器"""
    
    def __init__(self, config: TestConfig, logger: Optional[logging.Logger] = None):
        """
        初始化器
        
        Args:
            config: 测试配置对象
            logger: 日志记录器
        """
        self.config = config
        self.logger = logger or logging.getLogger(__name__)
        
        self.adb_manager: Optional[ADBManager] = None
        self.ble_device: Optional[BLEDevice] = None
        self.appium_server: Optional[AppiumServer] = None
        self.driver = None
        self.options: Optional[UiAutomator2Options] = None
        self.app_pid: Optional[str] = None
        self.fake: Optional[Faker] = None
    
    def adb_init(self) -> bool:
        """
        ADB初始化：检查ADB服务、连接设备、开启蓝牙
        
        Returns:
            bool: 初始化是否成功
        """
        self.logger.info(t('python.testInitializer.usingDevice', device=self.config.adb.device_name))
        
        try:
            self.adb_manager = ADBManager(
                self.config.adb.device_name, 
                self.config.adb.app_package
            )
            
            if not self.adb_manager.check_adb_service():
                self.logger.warning(t('python.testInitializer.adbServiceError'))
                pytest.skip(t('python.testInitializer.adbServiceErrorShort'))
            
            connect_success, connect_status = self.adb_manager.connect_device()
            if not connect_success:
                self.logger.warning(t('python.testInitializer.deviceConnectFailed', device=self.config.adb.device_name, status=connect_status))
                pytest.skip(t('python.testInitializer.deviceConnectFailedShort', device=self.config.adb.device_name))
            
            if self.config.ble is not None:
                if not self.adb_manager.ensure_bluetooth_enabled():
                    self.logger.warning(t('python.testInitializer.bluetoothEnableFailed'))
                    pytest.skip(t('python.testInitializer.bluetoothEnableFailedShort'))
            else:
                self.logger.info(t('python.testInitializer.noBleConfigSkipCheck'))
            
            self.logger.info(t('python.testInitializer.adbInitSuccess'))
            return True
                
        except Exception as e:
            self.logger.warning(t('python.testInitializer.adbDeviceCheckFailed', error=e))
            pytest.skip(t('python.testInitializer.adbDeviceCheckFailedShort'))
    
    def ble_init(self) -> bool:
        if self.config.ble is None:
            self.logger.info(t('python.testInitializer.noBleConfigSkipInit'))
            return True

        ble_config = self.config.ble
        self.logger.info(t('python.testInitializer.bleDeviceName', name=ble_config.ble_name))
        self.logger.info(t('python.testInitializer.bleAdvData', data=ble_config.adv_data))
        self.logger.info(t('python.testInitializer.bleUuids', uuid=ble_config.uuids))
        self.logger.info(t('python.testInitializer.bleUuidn', uuid=ble_config.uuidn))
        self.logger.info(t('python.testInitializer.bleUuidw', uuid=ble_config.uuidw))
        
        try:
            self.ble_device = BLEDevice(
                port=ble_config.port,
                ble_name=ble_config.ble_name,
                adv_data=ble_config.adv_data,
                uuidw=ble_config.uuidw,
                uuidn=ble_config.uuidn,
                uuids=ble_config.uuids
            )
            self.logger.info(t('python.testInitializer.bleDeviceCreated'))
            
            # 初始化蓝牙设备（打开串口、设置参数）
            if not self.ble_device.initialize():
                self.logger.error(t('python.testInitializer.bleInitFailed'))
                pytest.fail(t('python.testInitializer.bleInitFailed'))
            
            self.logger.info(t('python.testInitializer.bleInitComplete'))
            allure.attach(
                t('python.testInitializer.bleInitComplete'),
                name=t('python.testInitializer.bleInitAttachName'),
                attachment_type=allure.attachment_type.TEXT
            )
            return True
        except Exception as e:
            self.logger.error(t('python.testInitializer.bleInitError', error=e))
            allure.attach(
                t('python.testInitializer.bleInitError', error=str(e)),
                name=t('python.testInitializer.bleInitErrorAttachName'),
                attachment_type=allure.attachment_type.TEXT
            )
            pytest.fail(t('python.testInitializer.bleInitFailedWithError', error=e))
    
    def appium_init(self) -> bool:
        """
        Appium初始化：创建options、启动服务器、创建driver
        
        Returns:
            bool: 初始化是否成功
        """
        appium_config = self.config.appium
        
        self.options = UiAutomator2Options()
        self.options.platform_name = appium_config.platform_name
        self.options.platform_version = appium_config.platform_version
        self.options.device_name = appium_config.device_name
        self.options.app_package = appium_config.app_package
        self.options.app_activity = appium_config.app_activity
        self.options.no_reset = appium_config.no_reset
        AppiumServer.apply_default_capabilities(self.options)
        
        appium_server_url = f'http://{AppiumServer.DEFAULT_HOST}:{AppiumServer.DEFAULT_PORT}'
        self.appium_server = AppiumServer(
            host=AppiumServer.DEFAULT_HOST,
            port=AppiumServer.DEFAULT_PORT
        )
        
        if not self.appium_server.start():
            self.logger.error(t('python.testInitializer.appiumServerStartFailed'))
            if self.appium_server:
                self.appium_server.force_cleanup()
                self.logger.info(t('python.testInitializer.appiumServerStartFailedCleaned'))
            pytest.skip(t('python.testInitializer.appiumServerStartFailedShort'))
        
        try:
            self.logger.info(t('python.testInitializer.creatingAppiumSession'))
            start_time = time.time()
            socket.setdefaulttimeout(AppiumServer.DEFAULT_SESSION_TIMEOUT)
            subprocess.run(
                ['adb', '-s', self.config.adb.device_name, 'shell', 'am', 'force-stop', self.config.adb.app_package],
                capture_output=True, timeout=10
            )
            time.sleep(2)
            
            self.driver = webdriver.Remote(
                command_executor=appium_server_url,
                options=self.options
            )
            
            elapsed_time = time.time() - start_time
            self.logger.info(t('python.testInitializer.appiumSessionCreated', time=f'{elapsed_time:.2f}'))
            self.logger.info(t('python.testInitializer.deviceInfo', info=self.options.capabilities))
            self.logger.info(t('python.testInitializer.sessionId', id=self.driver.session_id))
            
            allure.attach(
                t('python.testInitializer.appiumSessionAttachInfo', info=self.options.capabilities, session_id=self.driver.session_id, time=f'{elapsed_time:.2f}'),
                name=t('python.testInitializer.deviceConfigAttachName'),
                attachment_type=allure.attachment_type.TEXT
            )
            
            self.logger.info(t('python.testInitializer.gettingAppPid'))
            self.app_pid = self.adb_manager.get_app_pid()
            if self.app_pid:
                self.logger.info(t('python.testInitializer.gotAppPid', pid=self.app_pid))
                allure.attach(
                    t('python.testInitializer.appPidAttach', pid=self.app_pid),
                    name=t('python.testInitializer.appPidAttachName'),
                    attachment_type=allure.attachment_type.TEXT
                )
            else:
                self.logger.warning(t('python.testInitializer.cannotGetAppPid'))
            
            # 等待APP加载完成
            self.logger.info(t('python.testInitializer.waitingAppLoad', seconds=self.config.appium.app_load_wait_time))
            time.sleep(self.config.appium.app_load_wait_time)
            current_activity = self.driver.current_activity
            self.logger.info(t('python.testInitializer.currentActivity', activity=current_activity))
            allure.attach(
                t('python.testInitializer.currentActivity', activity=current_activity),
                name=t('python.testInitializer.activityInfoAttachName'),
                attachment_type=allure.attachment_type.TEXT
            )
            
            self.logger.info(t('python.testInitializer.appiumInitSuccess'))
            return True
                
        except Exception as e:
            error_msg = str(e)
            
            if "Activity name" in error_msg and "doesn't exist or cannot be launched" in error_msg:
                self.logger.error(t('python.testInitializer.appiumSessionActivityError', error=error_msg))
                self.logger.error(t('python.testInitializer.checkActivityConfig'))
                allure.attach(
                    t('python.testInitializer.appiumActivityErrorAttach', error=error_msg),
                    name=t('python.testInitializer.activityErrorAttachName'),
                    attachment_type=allure.attachment_type.TEXT
                )
                pytest.fail(t('python.testInitializer.appiumSessionActivityFailed'))
            else:
                self.logger.error(t('python.testInitializer.appiumSessionFailedSdk', error=error_msg))
                allure.attach(
                    t('python.testInitializer.appiumSessionFailedSdkAttach', error=error_msg),
                    name=t('python.testInitializer.sessionErrorAttachName'),
                    attachment_type=allure.attachment_type.TEXT
                )
                
                try:
                    result = subprocess.run(
                        ['adb', '-s', self.config.adb.device_name, 'shell', 'dumpsys', 'window', 'windows'], 
                        capture_output=True, text=True, timeout=10
                    )
                    self.logger.info(t('python.testInitializer.deviceWindowState', state=result.stdout[:500]))
                except Exception as adb_error:
                    self.logger.error(t('python.testInitializer.deviceStateCheckFailed', error=adb_error))
                
                pytest.fail(t('python.testInitializer.appiumSessionFailedSdkShort', error=error_msg))
    
    def init_all(self) -> 'TestInitializer':
        """
        执行所有初始化
        
        Returns:
            TestInitializer: 返回自身以便链式调用
        """
        self.adb_init()
        self.ble_init()
        self.appium_init()
        self.fake = Faker()
        self.logger.info(t('python.testInitializer.testClassInitComplete'))
        return self
    
    def cleanup(self):
        """清理资源"""
        try:
            # 强制关闭测试APP
            if self.driver:
                self.driver.quit()
                self.logger.info(t('python.testInitializer.driverClosed'))
            
            if self.adb_manager:
                self.adb_manager.ensure_app_closed(2)
                self.logger.info(t('python.testInitializer.testAppForceStopped'))
            
            if self.ble_device:
                self.ble_device.close()
                self.logger.info(t('python.testInitializer.bleDeviceClosed'))
            
            if self.appium_server:
                self.appium_server.force_cleanup()
                self.logger.info(t('python.testInitializer.appiumServerCleaned'))
                
        except Exception as e:
            self.logger.error(t('python.testInitializer.cleanupError', error=e))
            if self.appium_server:
                self.appium_server.force_cleanup()
            if self.ble_device:
                self.ble_device.close()

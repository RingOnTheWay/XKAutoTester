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

from utils.adb_manager import ADBManager
from utils.appium_server import AppiumServer
from utils.mock_ble_device import BLEDevice


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
    """测试配置"""
    adb: ADBConfig
    ble: BLEConfig
    appium: AppiumConfig


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
        self.logger.info(f"使用此设备进行测试: {self.config.adb.device_name}")
        
        try:
            self.adb_manager = ADBManager(
                self.config.adb.device_name, 
                self.config.adb.app_package
            )
            
            if not self.adb_manager.check_adb_service():
                self.logger.warning("ADB服务异常，跳过安卓相关测试")
                pytest.skip("ADB服务异常")
            
            connect_success, connect_status = self.adb_manager.connect_device()
            if not connect_success:
                self.logger.warning(f"设备连接失败: {self.config.adb.device_name} - {connect_status}，跳过安卓相关测试")
                pytest.skip(f"设备连接失败: {self.config.adb.device_name}")
            
            if not self.adb_manager.ensure_bluetooth_enabled():
                self.logger.warning("蓝牙开启失败，跳过安卓相关测试")
                pytest.skip("蓝牙开启失败")
            
            self.logger.info("ADB初始化成功")
            return True
                
        except Exception as e:
            self.logger.warning(f"ADB设备检测失败: {e}，检查设备网络或端口情况，跳过安卓相关测试")
            pytest.skip("ADB设备检测失败")
    
    def ble_init(self) -> bool:
        """
        蓝牙初始化：创建蓝牙设备对象并初始化
        
        Returns:
            bool: 初始化是否成功
        """
        ble_config = self.config.ble
        self.logger.info(f"蓝牙设备名称: {ble_config.ble_name}")
        self.logger.info(f"自定义广播数据: {ble_config.adv_data}")
        self.logger.info(f"主服务UUID (UUIDS): {ble_config.uuids}")
        self.logger.info(f"读服务UUID (UUIDN): {ble_config.uuidn}")
        self.logger.info(f"写服务UUID (UUIDW): {ble_config.uuidw}")
        
        try:
            self.ble_device = BLEDevice(
                port=ble_config.port,
                ble_name=ble_config.ble_name,
                adv_data=ble_config.adv_data,
                uuidw=ble_config.uuidw,
                uuidn=ble_config.uuidn,
                uuids=ble_config.uuids
            )
            self.logger.info("蓝牙设备对象创建成功")
            
            # 初始化蓝牙设备（打开串口、设置参数）
            if not self.ble_device.initialize():
                self.logger.error("蓝牙设备初始化失败，请检查串口连接状态")
                pytest.fail("蓝牙设备初始化失败，请检查串口连接状态")
            
            self.logger.info("蓝牙设备初始化完成")
            allure.attach(
                "蓝牙设备初始化完成",
                name="蓝牙初始化",
                attachment_type=allure.attachment_type.TEXT
            )
            return True
        except Exception as e:
            self.logger.error(f"蓝牙设备初始化异常: {e}")
            allure.attach(
                f"蓝牙设备初始化异常: {str(e)}",
                name="蓝牙初始化异常",
                attachment_type=allure.attachment_type.TEXT
            )
            pytest.fail(f"蓝牙设备初始化失败: {e}")
    
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
            self.logger.error("Appium服务器启动失败，测试将无法进行")
            if self.appium_server:
                self.appium_server.force_cleanup()
                self.logger.info("Appium服务器启动失败，已清理相关端口对应的PID")
            pytest.skip("Appium服务器启动失败")
        
        try:
            self.logger.info("开始创建Appium会话...")
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
            self.logger.info(f"Appium会话创建成功! 耗时: {elapsed_time:.2f}秒")
            self.logger.info(f"设备信息: {self.options.capabilities}")
            self.logger.info(f"会话ID: {self.driver.session_id}")
            
            allure.attach(
                f"设备信息: {self.options.capabilities}\n会话ID: {self.driver.session_id}\n创建耗时: {elapsed_time:.2f}秒",
                name="设备配置",
                attachment_type=allure.attachment_type.TEXT
            )
            
            self.logger.info("获取应用PID")
            self.app_pid = self.adb_manager.get_app_pid()
            if self.app_pid:
                self.logger.info(f"成功获取应用PID: {self.app_pid}")
                allure.attach(
                    f"应用PID: {self.app_pid}",
                    name="应用进程ID",
                    attachment_type=allure.attachment_type.TEXT
                )
            else:
                self.logger.warning("无法获取应用PID")
            
            # 等待APP加载完成
            self.logger.info(f"等待APP加载完成（{self.config.appium.app_load_wait_time}秒）...")
            time.sleep(self.config.appium.app_load_wait_time)
            current_activity = self.driver.current_activity
            self.logger.info(f"当前Activity: {current_activity}")
            allure.attach(
                f"当前Activity: {current_activity}",
                name="Activity信息",
                attachment_type=allure.attachment_type.TEXT
            )
            
            self.logger.info("Appium初始化成功")
            return True
                
        except Exception as e:
            error_msg = str(e)
            
            if "Activity name" in error_msg and "doesn't exist or cannot be launched" in error_msg:
                self.logger.error(f"Appium会话创建失败: Activity名称填写错误。错误信息: {error_msg}")
                self.logger.error("请检查APP_ACTIVITY配置是否正确，确保Activity名称存在且可启动")
                allure.attach(
                    f"Appium会话创建失败: Activity名称填写错误\n错误信息: {error_msg}\n请检查APP_ACTIVITY配置是否正确，确保Activity名称存在且可启动",
                    name="Activity名称错误",
                    attachment_type=allure.attachment_type.TEXT
                )
                pytest.fail(f"Appium会话创建失败: Activity名称填写错误，请检查APP_ACTIVITY配置")
            else:
                self.logger.error(f"Appium会话创建失败: {error_msg}，请检查安卓SDK环境及在手机确认安装Appium Settings")
                allure.attach(
                    f"Appium会话创建失败: {error_msg}，请检查安卓SDK环境及在手机确认安装Appium Settings",
                    name="会话创建错误",
                    attachment_type=allure.attachment_type.TEXT
                )
                
                try:
                    result = subprocess.run(
                        ['adb', '-s', self.config.adb.device_name, 'shell', 'dumpsys', 'window', 'windows'], 
                        capture_output=True, text=True, timeout=10
                    )
                    self.logger.info(f"设备窗口状态: {result.stdout[:500]}...")
                except Exception as adb_error:
                    self.logger.error(f"设备状态检查失败: {adb_error}，请尝试使用Android13及以上版本进行测试")
                
                pytest.fail(f"Appium会话创建失败: {error_msg}，请检查安卓SDK环境")
    
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
        self.logger.info("测试类初始化完成")
        return self
    
    def cleanup(self):
        """清理资源"""
        try:
            # 强制关闭测试APP
            if self.driver:
                self.driver.quit()
                self.logger.info("Driver已关闭")
            
            if self.adb_manager:
                self.adb_manager.ensure_app_closed(2)
                self.logger.info("测试APP已强制关闭")
            
            if self.ble_device:
                self.ble_device.close()
                self.logger.info("蓝牙设备已关闭")
            
            if self.appium_server:
                self.appium_server.force_cleanup()
                self.logger.info("Appium服务器已使用查找端口方法清理")
                
        except Exception as e:
            self.logger.error(f"cleanup执行过程中出错: {e}")
            if self.appium_server:
                self.appium_server.force_cleanup()
            if self.ble_device:
                self.ble_device.close()

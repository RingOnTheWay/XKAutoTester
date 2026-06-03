"""
测试应用: {{APP_NAME}}({{PACKAGE_NAME}})
{{DESCRIPTION}}
"""
import pytest
import allure
from appium.webdriver.common.appiumby import AppiumBy
import time
import logging
import random
import sys
import os

current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
src_dir = os.path.join(parent_dir, 'src')

if os.path.exists(src_dir):
    sys.path.insert(0, src_dir)
from main.utils.test_initializer import (
    TestInitializer, TestConfig, ADBConfig{{BLE_IMPORT}}, AppiumConfig
)
{{ADDITIONAL_IMPORTS}}

# APP配置常量
APP_PACKAGE = '{{PACKAGE_NAME}}'
APP_ACTIVITY = '{{ACTIVITY_NAME}}'

# 设备配置常量
DEVICE_NAME = '{{DEVICE_NAME}}'
PLATFORM_NAME = '{{PLATFORM_NAME}}'
PLATFORM_VERSION = '{{PLATFORM_VERSION}}'

{{BLE_CONFIG}}

# Appium高级配置常量
NO_RESET = True

# 等待时间常量
APP_LOAD_WAIT_TIME = 10
ELEMENT_WAIT_TIMEOUT = 30
STEP_INTERVAL = 2
APP_CLOSE_WAIT_TIME = 2

# 按键码常量
KEYCODE_BACK = 4
KEYCODE_HOME = 3
KEYCODE_APP_SWITCH = 187

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

{{ALLURE_DECORATORS}}
class {{CLASS_NAME}}:
    @classmethod
    def setup_class(cls):
        """
        测试类初始化
        """
        ble_config = None
        {{BLE_CONFIG_INIT}}

        config = TestConfig(
            adb=ADBConfig(
                device_name=DEVICE_NAME,
                app_package=APP_PACKAGE
            ),
            ble=ble_config,
            appium=AppiumConfig(
                platform_name=PLATFORM_NAME,
                platform_version=PLATFORM_VERSION,
                device_name=DEVICE_NAME,
                app_package=APP_PACKAGE,
                app_activity=APP_ACTIVITY,
                no_reset=NO_RESET,
                app_load_wait_time=APP_LOAD_WAIT_TIME
            )
        )

        cls.initializer = TestInitializer(config, logger)
        cls.initializer.init_all()

        cls.driver = cls.initializer.driver
        cls.ble_device = cls.initializer.ble_device
        cls.app_pid = cls.initializer.app_pid
        cls.fake = cls.initializer.fake

    @classmethod
    def teardown_class(cls):
        """测试类级别的清理"""
        if hasattr(cls, 'initializer'):
            cls.initializer.cleanup()

    def setup_method(self):
        """
        每个测试方法前的初始化
        """
        {{SETUP_METHOD_CONTENT}}

    def teardown_method(self):
        """
        每个测试方法后的清理
        检查 logcat 监控是否检测到崩溃，如有则附加日志
        """
        try:
            if hasattr(self, 'initializer') and self.initializer.adb_manager:
                adb_mgr = self.initializer.adb_manager

                # 优先检查 logcat 实时监控的崩溃状态
                if adb_mgr.is_crash_detected():
                    # 等待 logcat 读取崩溃堆栈续行
                    import time as _time
                    _time.sleep(3)
                    full_log = adb_mgr.get_logcat_full_log()
                    if full_log:
                        logger.error("检测到应用致命闪退，已捕获崩溃日志并附加到报告")
                        allure.attach(
                            full_log,
                            name="应用崩溃日志（实时监控）",
                            attachment_type=allure.attachment_type.TEXT
                        )
                    else:
                        logger.warning("检测到应用崩溃，但未捕获到崩溃日志")
                else:
                    # 回退：检查崩溃日志（支持无 PID 场景）
                    crash_logs = adb_mgr.check_crash_logs(self.app_pid)
                    if crash_logs:
                        logger.error(f"检测到{len(crash_logs)}条崩溃日志")
                        for log in crash_logs:
                            allure.attach(
                                str(log),
                                name="崩溃日志",
                                attachment_type=allure.attachment_type.TEXT
                            )
                    else:
                        logger.info("未检测到崩溃日志")
        except Exception as e:
            logger.warning(f"检查崩溃日志时出错: {e}")

{{TEST_METHODS}}


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])

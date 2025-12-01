"""
Appium移动端自动化测试用例
测试对象：康随访APP (com.xiekang.medicalfollowup)
"""
import pytest
import allure
from appium import webdriver
from appium.webdriver.common.appiumby import AppiumBy
from appium.options.android import UiAutomator2Options
import time
import os
import logging

# 导入Appium服务器启动器
from utils.appium_server import AppiumServer

logger = logging.getLogger(__name__)


class TestXKMedicalFollowup:
    """康随访APP自动化测试类"""

    @classmethod
    def setup_class(cls):
        """测试类初始化"""
        cls.options = UiAutomator2Options()
        cls.options.platform_name = 'Android'
        cls.options.platform_version = '13'
        cls.options.device_name = 'iPlay50'
        # 康随访APP配置
        cls.options.app_package = 'com.xiekang.medicalfollowup'
        cls.options.app_activity = '.activity.SplashActivity'
        cls.options.automation_name = 'UiAutomator2'
        cls.options.no_reset = True  # 改为True避免重置应用
        cls.options.new_command_timeout = 300
        cls.options.auto_grant_permissions = True
        
        # Appium服务器配置
        cls.appium_server_host = '127.0.0.1'
        cls.appium_server_port = 4723
        cls.appium_server_url = f'http://{cls.appium_server_host}:{cls.appium_server_port}'
        
        # 启动Appium服务器
        cls.appium_server = AppiumServer(
            host=cls.appium_server_host,
            port=cls.appium_server_port
        )
        
        if not cls.appium_server.start():
            logger.error("Appium服务器启动失败，测试将无法进行")
            pytest.skip("Appium服务器启动失败")
    
    @classmethod
    def teardown_class(cls):
        """测试类清理"""
        if hasattr(cls, 'appium_server') and cls.appium_server:
            cls.appium_server.stop()
            logger.info("Appium服务器已停止")

    def setup_method(self):
        """每个测试方法前的初始化"""
        self.driver = None

    def teardown_method(self):
        """每个测试方法后的清理"""
        if self.driver:
            self.driver.quit()

    @allure.feature("康随访APP测试")
    @allure.story("登录功能测试")
    @allure.title("测试APP启动、登录和健康档案验证")
    @pytest.mark.appium
    @pytest.mark.smoke
    def test_app_launch_login_and_health_record(self):
        """
        测试APP启动、登录和健康档案验证
        步骤：
        1. 启动APP
        2. 点击登录按钮
        3. 验证后续页面是否包含"健康档案"文本
        """
        with allure.step("启动Appium驱动并连接设备"):
            self.driver = webdriver.Remote(
                command_executor=self.appium_server_url,
                options=self.options
            )
            allure.attach(
                f"设备信息: {self.options.capabilities}",
                name="设备配置",
                attachment_type=allure.attachment_type.TEXT
            )

        with allure.step("等待APP加载完成"):
            time.sleep(8)  # 等待APP启动
            current_activity = self.driver.current_activity
            allure.attach(
                f"当前Activity: {current_activity}",
                name="Activity信息",
                attachment_type=allure.attachment_type.TEXT
            )

        with allure.step("点击登录按钮 (ID: com.xiekang.medicalfollowup:id/bt_login)"):
            try:
                login_button = self.driver.find_element(
                    AppiumBy.ID, 
                    'com.xiekang.medicalfollowup:id/bt_login'
                )
                login_button.click()
                allure.attach(
                    "成功点击登录按钮",
                    name="按钮点击",
                    attachment_type=allure.attachment_type.TEXT
                )
                time.sleep(3)  # 等待页面跳转
            except Exception as e:
                allure.attach(
                    f"登录按钮点击失败: {str(e)}",
                    name="按钮点击错误",
                    attachment_type=allure.attachment_type.TEXT
                )
                pytest.fail(f"登录按钮点击失败: {str(e)}")

        with allure.step("验证后续页面是否包含'健康档案'文本"):
            try:
                # 使用UiAutomator定位器查找文本
                health_record_element = self.driver.find_element(
                    AppiumBy.ANDROID_UIAUTOMATOR,
                    'new UiSelector().text("健康档案")'
                )
                
                if health_record_element.is_displayed():
                    allure.attach(
                        "成功找到'健康档案'文本元素",
                        name="文本验证",
                        attachment_type=allure.attachment_type.TEXT
                    )
                    # 截图验证
                    screenshot = self.driver.get_screenshot_as_png()
                    allure.attach(
                        screenshot,
                        name="健康档案页面截图",
                        attachment_type=allure.attachment_type.PNG
                    )
                else:
                    pytest.fail("'健康档案'文本元素存在但不可见")
                    
            except Exception as e:
                allure.attach(
                    f"未找到'健康档案'文本: {str(e)}",
                    name="文本查找错误",
                    attachment_type=allure.attachment_type.TEXT
                )
                # 截图记录当前页面状态
                screenshot = self.driver.get_screenshot_as_png()
                allure.attach(
                    screenshot,
                    name="错误页面截图",
                    attachment_type=allure.attachment_type.PNG
                )
                pytest.fail(f"未找到'健康档案'文本: {str(e)}")

    @allure.feature("康随访APP测试")
    @allure.story("登录后页面验证")
    @allure.title("验证登录后页面元素和功能")
    @pytest.mark.appium
    @pytest.mark.smoke
    def test_after_login_page_elements(self):
        """
        验证登录后页面元素和功能
        步骤：
        1. 启动APP
        2. 点击登录按钮
        3. 验证登录后页面元素
        4. 截图记录页面状态
        """
        with allure.step("启动Appium驱动并连接设备"):
            self.driver = webdriver.Remote(
                command_executor=self.appium_server_url,
                options=self.options
            )
            allure.attach(
                f"设备信息: {self.options.capabilities}",
                name="设备配置",
                attachment_type=allure.attachment_type.TEXT
            )

        with allure.step("等待APP加载完成"):
            time.sleep(8)  # 等待APP启动
            current_activity = self.driver.current_activity
            allure.attach(
                f"当前Activity: {current_activity}",
                name="Activity信息",
                attachment_type=allure.attachment_type.TEXT
            )

        with allure.step("检查APP状态并处理登录流程"):
            try:
                # 检查是否在登录页面（登录按钮是否存在）
                login_button = self.driver.find_element(
                    AppiumBy.ID, 
                    'com.xiekang.medicalfollowup:id/bt_login'
                )
                # 如果找到登录按钮，点击登录
                login_button.click()
                allure.attach(
                    "成功点击登录按钮",
                    name="按钮点击",
                    attachment_type=allure.attachment_type.TEXT
                )
                time.sleep(5)  # 等待登录后页面加载
            except:
                # 如果找不到登录按钮，说明APP已经在登录后状态
                allure.attach(
                    "APP已在登录后状态，跳过登录按钮点击",
                    name="状态检查",
                    attachment_type=allure.attachment_type.TEXT
                )
                time.sleep(3)  # 等待页面稳定

        with allure.step("验证登录后页面元素"):
            try:
                # 验证"健康档案"文本
                health_record_element = self.driver.find_element(
                    AppiumBy.ANDROID_UIAUTOMATOR,
                    'new UiSelector().text("健康档案")'
                )
                
                # 验证其他可能的登录后元素
                try:
                    # 尝试查找其他常见元素
                    user_info_element = self.driver.find_element(
                        AppiumBy.ANDROID_UIAUTOMATOR,
                        'new UiSelector().textContains("用户")'
                    )
                    user_info_found = True
                except:
                    user_info_found = False
                    
                try:
                    # 尝试查找菜单或导航元素
                    menu_element = self.driver.find_element(
                        AppiumBy.ANDROID_UIAUTOMATOR,
                        'new UiSelector().textContains("菜单")'
                    )
                    menu_found = True
                except:
                    menu_found = False
                
                allure.attach(
                    f"找到健康档案: {health_record_element.is_displayed()}, 用户信息: {user_info_found}, 菜单: {menu_found}",
                    name="页面元素验证",
                    attachment_type=allure.attachment_type.TEXT
                )
                
            except Exception as e:
                allure.attach(
                    f"页面元素验证失败: {str(e)}",
                    name="元素验证错误",
                    attachment_type=allure.attachment_type.TEXT
                )
                # 添加错误信息附件
                screenshot = self.driver.get_screenshot_as_png()
                allure.attach(
                    screenshot,
                    name="错误页面截图",
                    attachment_type=allure.attachment_type.PNG
                )
                pytest.fail(f"页面元素验证失败: {str(e)}")

        with allure.step("截图记录登录后页面状态"):
            # 截图验证
            screenshot = self.driver.get_screenshot_as_png()
            allure.attach(
                screenshot,
                name="登录后页面截图",
                attachment_type=allure.attachment_type.PNG
            )

        with allure.step("重置APP状态"):
            # 关闭APP以重置状态，确保下一个测试用例从初始状态开始
            self.driver.terminate_app('com.xiekang.medicalfollowup')
            time.sleep(3)  # 等待APP完全关闭


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
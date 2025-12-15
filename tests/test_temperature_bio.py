"""
测试对象:D200外贸版(com.xiekang.idoctorcloudhealthcarehub)
测试标题:自动化测试-体温枪(爱奥乐)
"""
import pytest
import allure
from appium import webdriver
from appium.webdriver.common.appiumby import AppiumBy
from appium.options.android import UiAutomator2Options
import time
import os
import random
import subprocess
from faker import Faker
import logging
import sys
import os
from utils.mock_ble_device import BLEDevice
from utils.appium_server import AppiumServer
from utils.temp_hex_gen import generate_temperature_hex
from utils.adb_manager import ADBManager
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


# APP配置常量
APP_PACKAGE = 'com.xiekang.idoctorcloudhealthcarehub'  # APP包名
APP_ACTIVITY = '.activity.SplashActivity'  # APP启动Activity

# 设备配置常量
DEVICE_NAME = '192.168.2.141'  # 设备名称
APPIUM_SERVER_HOST = '127.0.0.1'  # Appium服务器主机
APPIUM_SERVER_PORT = 4723  # Appium服务器端口
PLATFORM_NAME = 'Android'        # 测试平台名称
PLATFORM_VERSION = '14'          # Android平台版本号
AUTOMATION_NAME = 'UiAutomator2' # 自动化引擎名称

# 蓝牙设备配置常量
BLE_UUIDS = "0000100000001000800000805F9B34FB"  # 主服务UUID
BLE_UUIDN = "0000100100001000800000805F9B34FB"  # 读服务UUID
BLE_UUIDW = "0000100200001000800000805F9B34FB"  # 写服务UUID
BLE_NAME = "Bioland-IT"  # 蓝牙设备名称
BLE_ADV_DATA = "FF01FF1126E37E"  # 自定义广播数据
BLE_PORT = "COM7"  # 蓝牙设备串口端口

# Appium高级配置常量
NO_RESET = True                    # 是否不清除应用数据
ENSURE_WEBVIEWS_HAVE_PAGES = True  # 确保WebView有页面
NATIVE_WEB_SCREENSHOT = True       # 原生Web截图
NEW_COMMAND_TIMEOUT = 3600         # 新命令超时时间（秒）
CONNECT_HARDWARE_KEYBOARD = True   # 连接硬件键盘

# 等待时间常量
APP_LOAD_WAIT_TIME = 10  # APP加载等待时间（秒）
BUTTON_WAIT_MAX_TIME = 30  # 按钮等待最大时间（秒）
BUTTON_WAIT_INTERVAL = 2  # 按钮检查间隔（秒）
APP_CLOSE_WAIT_TIME = 2  # APP关闭等待时间（秒）

# Appium配置超时常量
APPIUM_SETTINGS_TIMEOUT = 10000  # Appium Settings应用安装和等待超时（毫秒）
APPIUM_SESSION_TIMEOUT = 60      # Appium会话创建超时（秒）


# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("temperature_test.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


class TestTemperatureMeasurement:
    """
    体温测量APP自动化测试类
    """

    @classmethod
    def setup_class(cls):
        """
        测试类初始化
        """
        cls.options = UiAutomator2Options()
        cls.options.platform_name = PLATFORM_NAME
        cls.options.platform_version = PLATFORM_VERSION
        cls.options.device_name = DEVICE_NAME
        logger.info(f"使用此设备名称进行测试: {DEVICE_NAME}")
        
        # ADB连接
        try:
            # 创建ADB管理器实例
            adb_manager = ADBManager(DEVICE_NAME, APP_PACKAGE)
            
            # 检查ADB服务
            if not adb_manager.check_adb_service():
                logger.warning("ADB服务异常，跳过Appium相关测试")
                pytest.skip("ADB服务异常")
            
            # 连接设备
            connect_success, connect_status = adb_manager.connect_device()
            if not connect_success:
                logger.warning(f"设备连接失败: {DEVICE_NAME} - {connect_status}，跳过Appium相关测试")
                pytest.skip(f"设备连接失败: {DEVICE_NAME}")
            
            # 确保蓝牙已开启
            if not adb_manager.ensure_bluetooth_enabled():
                logger.warning("蓝牙开启失败，跳过Appium相关测试")
                pytest.skip("蓝牙开启失败")
                
        except Exception as e:
            logger.warning(f"ADB设备检测失败: {e}，检查设备网络或端口情况，跳过Appium相关测试")
            pytest.skip("ADB设备检测失败")
        
        # Appium配置
        cls.options.app_package = APP_PACKAGE
        cls.options.app_activity = APP_ACTIVITY
        cls.options.automation_name = AUTOMATION_NAME
        cls.options.no_reset = NO_RESET
        cls.options.ensureWebviewsHavePages = ENSURE_WEBVIEWS_HAVE_PAGES
        cls.options.nativeWebScreenshot = NATIVE_WEB_SCREENSHOT
        cls.options.newCommandTimeout = NEW_COMMAND_TIMEOUT
        cls.options.connectHardwareKeyboard = CONNECT_HARDWARE_KEYBOARD
        cls.options.androidInstallTimeout = APPIUM_SETTINGS_TIMEOUT
        cls.options.appWaitDuration = APPIUM_SETTINGS_TIMEOUT
        
        cls.appium_server_host = APPIUM_SERVER_HOST
        cls.appium_server_port = APPIUM_SERVER_PORT
        cls.appium_server_url = f'http://{APPIUM_SERVER_HOST}:{APPIUM_SERVER_PORT}'
        
        cls.appium_server = AppiumServer(
            host=APPIUM_SERVER_HOST,
            port=APPIUM_SERVER_PORT
        )
        
        if not cls.appium_server.start():
            logger.error("Appium服务器启动失败，测试将无法进行")
            if hasattr(cls, 'appium_server') and cls.appium_server:
                cls.appium_server.force_cleanup()
                logger.info("Appium服务器启动失败，已清理4723端口相关PID")
            pytest.skip("Appium服务器启动失败")
        
        # 蓝牙配置
        logger.info(f"蓝牙设备名称: {BLE_NAME}")
        logger.info(f"自定义广播数据: {BLE_ADV_DATA}")
        logger.info(f"主服务UUID (UUIDS): {BLE_UUIDS}")
        logger.info(f"读服务UUID (UUIDN): {BLE_UUIDN}")
        logger.info(f"写服务UUID (UUIDW): {BLE_UUIDW}")
        
        try:
            cls.ble_device = BLEDevice(
                port=BLE_PORT,
                ble_name=BLE_NAME,
                adv_data=BLE_ADV_DATA,
                uuidw=BLE_UUIDW,
                uuidn=BLE_UUIDN,
                uuids=BLE_UUIDS
            )
            logger.info("蓝牙设备对象创建成功")
        except Exception as e:
            logger.error(f"蓝牙设备对象创建失败: {e}")
            if hasattr(cls, 'appium_server') and cls.appium_server:
                cls.appium_server.force_cleanup()
                logger.info("蓝牙设备初始化失败，已使用查找端口方法清理4723端口相关PID")
            pytest.skip(f"蓝牙设备初始化失败: {e}")
        
        # 初始化Faker实例
        cls.fake = Faker()
        
        logger.info("测试类初始化完成")

    @classmethod
    def teardown_class(cls):
        """测试类级别的清理"""
        try:
            # 关闭蓝牙设备
            if hasattr(cls, 'ble_device') and cls.ble_device:
                cls.ble_device.close()
                logger.info("蓝牙设备已关闭")
            
            # 停止Appium服务器
            if hasattr(cls, 'appium_server') and cls.appium_server:
                cls.appium_server.force_cleanup()
                logger.info("Appium服务器已使用查找端口方法清理")
                
        except Exception as e:
            logger.error(f"teardown_class执行过程中出错: {e}")
            if hasattr(cls, 'appium_server') and cls.appium_server:
                cls.appium_server.force_cleanup()
                cls.ble_device.close()

    def setup_method(self):
        """
        每个测试方法前的初始化
        """
        self.driver = None
        self.test_temperature, self.temperature_hex = generate_temperature_hex()
        logger.info(f"开始测试，生成随机体温: {self.test_temperature}°C")
        self._ensure_app_closed()

    def _ensure_app_closed(self):
        """
        确保APP处于关闭状态，如果APP正在运行则强制关闭
        """
        try:
            # 创建ADB管理器实例
            adb_manager = ADBManager(DEVICE_NAME, APP_PACKAGE)
            
            # 确保APP关闭
            if not adb_manager.ensure_app_closed(APP_CLOSE_WAIT_TIME):
                logger.warning("确保APP关闭操作失败，继续执行")
                
        except Exception as e:
            logger.warning(f"检查APP状态时出错: {e}，继续执行")

    def teardown_method(self):
        """
        每个测试方法后的清理
        """
        if self.driver:
            self.driver.quit()
            logger.info("Driver已关闭")

    @allure.feature("iDoctor云医疗健康中心")
    @allure.story("体温测量功能测试")
    @allure.title("测试游客模式下的体温测量流程")
    @pytest.mark.smoke
    def test_guest_temperature_measurement(self):
        """
        测试游客模式下的体温测量流程
        步骤：
        1. 启动APP
        2. 点击游客登录
        3. 填写个人信息（姓名、性别、年龄）
        4. 开始测量体温
        5. 通过蓝牙发送体温数据
        6. 验证测量结果
        """
        with allure.step("初始化蓝牙设备"):
            try:
                if not self.ble_device.initialize():
                    if hasattr(self, 'appium_server') and self.appium_server:
                        self.appium_server.force_cleanup()
                        logger.info("蓝牙设备初始化失败，已使用查找端口方法清理4723端口相关PID")
                    pytest.fail("蓝牙设备初始化失败，请检查串口连接状态")
                allure.attach(
                        "蓝牙设备初始化完成",
                        name="蓝牙初始化",
                        attachment_type=allure.attachment_type.TEXT
                    )
            except Exception as e:
                error_msg = f"蓝牙设备初始化异常: {str(e)}"
                logger.error(error_msg)
                if hasattr(self, 'appium_server') and self.appium_server:
                    self.appium_server.force_cleanup()
                    logger.info("蓝牙设备初始化异常，已使用查找端口方法清理4723端口相关PID")
                allure.attach(
                    error_msg,
                    name="蓝牙初始化异常",
                    attachment_type=allure.attachment_type.TEXT
                )
                pytest.fail(error_msg)

        # 启动APP
        with allure.step("启动Appium驱动并连接设备"):
            try:
                logger.info("开始创建Appium会话...")
                start_time = time.time()
                import socket
                socket.setdefaulttimeout(APPIUM_SESSION_TIMEOUT)
                subprocess.run(
                    ['adb', '-s', DEVICE_NAME, 'shell', 'am', 'force-stop', 'com.xiekang.idoctorcloudhealthcarehub'],
                    capture_output=True, timeout=10
                )
                time.sleep(2)
                
                self.driver = webdriver.Remote(
                    command_executor=self.appium_server_url,
                    options=self.options
                )
                
                elapsed_time = time.time() - start_time
                logger.info(f"Appium会话创建成功! 耗时: {elapsed_time:.2f}秒")
                logger.info(f"设备信息: {self.options.capabilities}")
                logger.info(f"会话ID: {self.driver.session_id}")
                
                allure.attach(
                    f"设备信息: {self.options.capabilities}\n会话ID: {self.driver.session_id}\n创建耗时: {elapsed_time:.2f}秒",
                    name="设备配置",
                    attachment_type=allure.attachment_type.TEXT
                )
                
            except Exception as e:
                logger.error(f"Appium会话创建失败: {str(e)}，请检查安卓SDK环境及在手机确认安装Appium Settings")
                allure.attach(
                    f"Appium会话创建失败: {str(e)}，请检查安卓SDK环境及在手机确认安装Appium Settings",
                    name="会话创建错误",
                    attachment_type=allure.attachment_type.TEXT
                )
                
                try:
                    result = subprocess.run(['adb', '-s', DEVICE_NAME, 'shell', 'dumpsys', 'window', 'windows'], 
                                          capture_output=True, text=True, timeout=10)
                    logger.info(f"设备窗口状态: {result.stdout[:500]}...")
                except Exception as adb_error:
                    logger.error(f"设备状态检查失败: {adb_error}，请尝试使用Android13及以上版本进行测试")
                
                pytest.fail(f"Appium会话创建失败: {str(e)}，请检查安卓SDK环境")

        with allure.step("等待APP加载完成"):
            time.sleep(APP_LOAD_WAIT_TIME)
            current_activity = self.driver.current_activity
            logger.info(f"当前Activity: {current_activity}")
            allure.attach(
                f"当前Activity: {current_activity}",
                name="Activity信息",
                attachment_type=allure.attachment_type.TEXT
            )

        # 点击游客登录
        with allure.step("点击游客登录按钮"):
            try:
                guest_button = self.driver.find_element(
                    AppiumBy.ID, 
                    'com.xiekang.idoctorcloudhealthcarehub:id/layout_youke'
                )
                guest_button.click()
                logger.info("成功点击游客登录按钮")
                allure.attach(
                    "成功点击游客登录按钮",
                    name="按钮点击",
                    attachment_type=allure.attachment_type.TEXT
                )
                time.sleep(3)
            except Exception as e:
                logger.error(f"游客登录按钮点击失败: {str(e)}")
                allure.attach(
                    f"游客登录按钮点击失败: {str(e)}",
                    name="按钮点击错误",
                    attachment_type=allure.attachment_type.TEXT
                )
                pytest.fail(f"游客登录按钮点击失败: {str(e)}")

        # 输入姓名
        with allure.step("输入随机姓名"):
            try:
                name_input = self.driver.find_element(
                    AppiumBy.ID, 
                    'com.xiekang.idoctorcloudhealthcarehub:id/ed_fullName'
                )
                random_name = self.fake.name()
                name_input.send_keys(random_name)
                logger.info(f"输入随机姓名: {random_name}")
                allure.attach(
                    f"输入随机姓名: {random_name}",
                    name="姓名输入",
                    attachment_type=allure.attachment_type.TEXT
                )
                time.sleep(1)
            except Exception as e:
                logger.error(f"姓名输入失败: {str(e)}")
                allure.attach(
                    f"姓名输入失败: {str(e)}",
                    name="姓名输入错误",
                    attachment_type=allure.attachment_type.TEXT
                )
                pytest.fail(f"姓名输入失败: {str(e)}")

        # 选择性别
        with allure.step("随机选择性别"):
            try:
                is_male = random.choice([True, False])
                gender_element_id = 'com.xiekang.idoctorcloudhealthcarehub:id/iv_sex_man' if is_male else 'com.xiekang.idoctorcloudhealthcarehub:id/iv_sex_woman'
                gender_text = '男' if is_male else '女'
                
                gender_element = self.driver.find_element(
                    AppiumBy.ID, 
                    gender_element_id
                )
                gender_element.click()
                logger.info(f"选择性别: {gender_text}")
                allure.attach(
                    f"选择性别: {gender_text}",
                    name="性别选择",
                    attachment_type=allure.attachment_type.TEXT
                )
                time.sleep(1)
            except Exception as e:
                logger.error(f"性别选择失败: {str(e)}")
                allure.attach(
                    f"性别选择失败: {str(e)}",
                    name="性别选择错误",
                    attachment_type=allure.attachment_type.TEXT
                )
                pytest.fail(f"性别选择失败: {str(e)}")

        # 输入年龄
        with allure.step("输入随机年龄"):
            try:
                age_input = self.driver.find_element(
                    AppiumBy.ID, 
                    'com.xiekang.idoctorcloudhealthcarehub:id/ed_age'
                )
                random_age = random.randint(18, 80)
                age_input.send_keys(str(random_age))
                logger.info(f"输入随机年龄: {random_age}")
                allure.attach(
                    f"输入随机年龄: {random_age}",
                    name="年龄输入",
                    attachment_type=allure.attachment_type.TEXT
                )
                time.sleep(1)
            except Exception as e:
                logger.error(f"年龄输入失败: {str(e)}")
                allure.attach(
                    f"年龄输入失败: {str(e)}",
                    name="年龄输入错误",
                    attachment_type=allure.attachment_type.TEXT
                )
                pytest.fail(f"年龄输入失败: {str(e)}")

        # 点击确定按钮
        with allure.step("点击确定按钮"):
            try:
                ok_button = self.driver.find_element(
                    AppiumBy.ID, 
                    'com.xiekang.idoctorcloudhealthcarehub:id/btn_ok'
                )
                ok_button.click()
                logger.info("成功点击确定按钮")
                allure.attach(
                    "成功点击确定按钮",
                    name="按钮点击",
                    attachment_type=allure.attachment_type.TEXT
                )
                time.sleep(3)
            except Exception as e:
                logger.error(f"确定按钮点击失败: {str(e)}")
                allure.attach(
                    f"确定按钮点击失败: {str(e)}",
                    name="按钮点击错误",
                    attachment_type=allure.attachment_type.TEXT
                )
                pytest.fail(f"确定按钮点击失败: {str(e)}")

        # 点击开始测量
        with allure.step("点击开始测量按钮"):
            try:
                measure_button = self.driver.find_element(
                    AppiumBy.ID, 
                    'com.xiekang.idoctorcloudhealthcarehub:id/getMeasureTv'
                )
                measure_button.click()
                logger.info("成功点击开始测量按钮")
                allure.attach(
                    "成功点击开始测量按钮",
                    name="按钮点击",
                    attachment_type=allure.attachment_type.TEXT
                )
                time.sleep(3)
            except Exception as e:
                logger.error(f"开始测量按钮点击失败: {str(e)}")
                allure.attach(
                    f"开始测量按钮点击失败: {str(e)}",
                    name="按钮点击错误",
                    attachment_type=allure.attachment_type.TEXT
                )
                pytest.fail(f"开始测量按钮点击失败: {str(e)}")

        # 等待按钮文本变为Disconnect
        with allure.step("等待测量按钮状态变为Disconnect"):
            try:
                max_wait_time = BUTTON_WAIT_MAX_TIME
                wait_interval = BUTTON_WAIT_INTERVAL
                waited_time = 0
                
                while waited_time < max_wait_time:
                    try:
                        measure_button = self.driver.find_element(
                            AppiumBy.ID, 
                            'com.xiekang.idoctorcloudhealthcarehub:id/getMeasureTv'
                        )
                        current_text = measure_button.text
                        logger.info(f"当前按钮文本: {current_text}")
                        
                        if current_text == "Disconnect":
                            logger.info("按钮文本已变为Disconnect，可以发送体温数据")
                            allure.attach(
                                "按钮文本已变为Disconnect，可以发送体温数据",
                                name="按钮状态检查",
                                attachment_type=allure.attachment_type.TEXT
                            )
                            break
                        else:
                            logger.info(f"按钮文本仍为'{current_text}'，继续等待...")
                            time.sleep(wait_interval)
                            waited_time += wait_interval
                            
                    except Exception as e:
                        logger.warning(f"检查按钮状态时出错: {str(e)}，继续等待...")
                        time.sleep(wait_interval)
                        waited_time += wait_interval
                
                if waited_time >= max_wait_time:
                    logger.error("等待按钮文本变为Disconnect超时")
                    allure.attach(
                        "等待按钮文本变为Disconnect超时",
                        name="超时错误",
                        attachment_type=allure.attachment_type.TEXT
                    )
                    pytest.fail("等待按钮文本变为Disconnect超时")
                    
            except Exception as e:
                logger.error(f"等待按钮状态变化失败: {str(e)}")
                allure.attach(
                    f"等待按钮状态变化失败: {str(e)}",
                    name="状态检查错误",
                    attachment_type=allure.attachment_type.TEXT
                )
                pytest.fail(f"等待按钮状态变化失败: {str(e)}")

        # 发送体温数据
        with allure.step("发送体温数据"):
            try:
                logger.info(f"发送体温数据: {self.test_temperature}°C -> Hex: {self.temperature_hex}")
                allure.attach(
                    f"发送体温数据: {self.test_temperature}°C -> Hex: {self.temperature_hex}",
                    name="体温数据发送",
                    attachment_type=allure.attachment_type.TEXT
                )
                
                if not self.ble_device.send_hex_data(self.temperature_hex):
                    logger.error("体温数据发送失败")
                    pytest.fail("体温数据发送失败")
                
                time.sleep(2)
            except Exception as e:
                logger.error(f"体温数据发送失败: {str(e)}")
                allure.attach(
                    f"体温数据发送失败: {str(e)}",
                    name="数据发送错误",
                    attachment_type=allure.attachment_type.TEXT
                )
                pytest.fail(f"体温数据发送失败: {str(e)}")

        # 验证测量结果
        with allure.step("验证测量结果"):
            try:
                result_element = self.driver.find_element(
                    AppiumBy.ID, 
                    'com.xiekang.idoctorcloudhealthcarehub:id/temperatureMeasureResultValueTv'
                )
                displayed_temp = float(result_element.text)
                logger.info(f"显示的体温值: {displayed_temp}°C")
                allure.attach(
                    f"显示的体温值: {displayed_temp}°C",
                    name="测量结果",
                    attachment_type=allure.attachment_type.TEXT
                )
                
                screenshot = self.driver.get_screenshot_as_png()
                allure.attach(
                    screenshot,
                    name="测量结果页面截图",
                    attachment_type=allure.attachment_type.PNG
                )
                
                # 体温对比处理：确保只比较一位小数
                # 1. 特殊情况：如果第二位小数为0（如37.20、36.80），将生成的值-0.1后再对比
                # 2. 一般情况：将两位小数体温四舍五入到一位小数后再对比
                expected_temp = self.test_temperature
                
                # 判断是否为特殊情况（第二位小数为0）
                if abs(expected_temp * 10 - round(expected_temp * 10)) < 0.001:  # 判断第二位小数是否为0
                    logger.info(f"特殊情况：生成的体温第二位小数为0: {expected_temp}°C，进行特殊处理")
                    expected_temp = expected_temp - 0.1  # 减去0.1后再对比
                    logger.info(f"特殊处理后的期望体温: {expected_temp}°C")
                    allure.attach(
                        f"特殊处理：原始体温{self.test_temperature}°C -> 调整后{expected_temp}°C",
                        name="体温特殊处理",
                        attachment_type=allure.attachment_type.TEXT
                    )
                else:
                    # 一般情况：将两位小数体温截断舍入到一位小数
                    original_temp = expected_temp
                    expected_temp = int(expected_temp * 10) / 10.0  # 截断舍入到一位小数
                    logger.info(f"一般情况：将体温从{original_temp}°C截断舍入到{expected_temp}°C")
                    allure.attach(
                        f"一般处理：原始体温{original_temp}°C -> 截断舍入后{expected_temp}°C",
                        name="体温截断舍入",
                        attachment_type=allure.attachment_type.TEXT
                    )
                
                # 对比数据是否一致（允许0.1°C的误差）
                temperature_diff = abs(displayed_temp - expected_temp)
                logger.info(f"体温差值: {displayed_temp}°C - {expected_temp}°C = {temperature_diff}°C")
                
                if temperature_diff > 0.1:
                    logger.error(f"体温数据不一致! 期望: {expected_temp}°C, 显示: {displayed_temp}°C")
                    pytest.fail(f"体温数据不一致! 期望: {expected_temp}°C, 显示: {displayed_temp}°C")
                else:
                    logger.info("体温数据验证成功，期望值与显示值一致")
                    allure.attach(
                        "体温数据验证成功，期望值与显示值一致",
                        name="验证结果",
                        attachment_type=allure.attachment_type.TEXT
                    )
                    
            except Exception as e:
                logger.error(f"测量结果验证失败: {str(e)}")
                screenshot = self.driver.get_screenshot_as_png()
                allure.attach(
                    screenshot,
                    name="错误页面截图",
                    attachment_type=allure.attachment_type.PNG
                )
                pytest.fail(f"测量结果验证失败: {str(e)}")

        # 关闭APP
        with allure.step("关闭APP"):
            try:
                self.driver.back()
                time.sleep(0.4)
                logger.info("第一次返回键")
                
                self.driver.back()
                time.sleep(0.3)
                logger.info("第二次返回键")
                
                self.driver.back()
                time.sleep(0.4)
                logger.info("第三次返回键")
                
                allure.attach(
                    "已连续按三次返回键关闭APP",
                    name="APP关闭",
                    attachment_type=allure.attachment_type.TEXT
                )
                logger.info("APP已通过返回键关闭")
            except Exception as e:
                logger.warning(f"关闭APP时出现异常: {str(e)}")
                allure.attach(
                    f"关闭APP时出现异常: {str(e)}",
                    name="APP关闭异常",
                    attachment_type=allure.attachment_type.TEXT
                )

        logger.info("体温测量测试完成，所有步骤执行成功")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
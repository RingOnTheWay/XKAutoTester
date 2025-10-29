"""
检查APP当前状态的脚本
"""
import time
from appium import webdriver
from appium.webdriver.common.appiumby import AppiumBy
from appium.options.android import UiAutomator2Options

# Appium服务器配置
appium_server_url = 'http://192.168.2.211:5555'

# 设备配置
options = UiAutomator2Options()
options.platform_name = 'Android'
options.automation_name = 'UiAutomator2'
options.device_name = 'iPlay50'
options.platform_version = '13'
options.udid = '192.168.3.42:5555'
options.app_package = 'com.xiekang.medicalfollowup'
options.app_activity = '.activity.SplashActivity'
options.no_reset = True  # 不清除应用数据

try:
    # 启动驱动
    driver = webdriver.Remote(
        command_executor=appium_server_url,
        options=options
    )
    
    print("=== APP状态检查 ===")
    
    # 等待APP加载
    time.sleep(5)
    
    # 获取当前Activity
    current_activity = driver.current_activity
    print(f"当前Activity: {current_activity}")
    
    # 检查登录按钮是否存在
    try:
        login_button = driver.find_element(
            AppiumBy.ID, 
            'com.xiekang.medicalfollowup:id/bt_login'
        )
        print("登录按钮存在，APP在登录页面")
    except:
        print("登录按钮不存在，APP可能在登录后页面")
    
    # 检查健康档案文本是否存在
    try:
        health_record = driver.find_element(
            AppiumBy.ANDROID_UIAUTOMATOR,
            'new UiSelector().text("健康档案")'
        )
        print("健康档案文本存在，APP在登录后页面")
    except:
        print("健康档案文本不存在")
    
    # 截图
    driver.get_screenshot_as_file("current_app_status.png")
    print("截图已保存: current_app_status.png")
    
    # 获取页面源码长度
    page_source = driver.page_source
    print(f"页面源码长度: {len(page_source)} 字符")
    
except Exception as e:
    print(f"检查过程中出错: {e}")
    
finally:
    # 关闭驱动
    if 'driver' in locals():
        driver.quit()
    print("检查完成")
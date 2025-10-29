"""
XK管理系统自动化测试用例
使用Playwright进行Web UI自动化测试
"""
import re
import sys
import os
import pytest
import allure
from faker import Faker
from playwright.sync_api import Playwright, sync_playwright, expect

# 添加项目根目录到Python路径
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, project_root)

from utils.logger import get_logger
from utils.captcha_recognizer import captcha_recognizer

logger = get_logger(__name__)
fake = Faker(locale='zh_CN')


@allure.epic("XK管理系统")
@allure.feature("用户登录")
class TestXKLogin:
    """XK管理系统登录功能测试"""
    
    def setup_method(self):
        """测试方法前置设置"""
        self.playwright = sync_playwright().start()
        self.browser = self.playwright.chromium.launch(headless=False)
        self.context = self.browser.new_context()
        self.page = self.context.new_page()
        logger.info("浏览器环境初始化完成")
    
    def teardown_method(self):
        """测试方法后置清理"""
        if hasattr(self, 'page'):
            self.page.close()
        if hasattr(self, 'context'):
            self.context.close()
        if hasattr(self, 'browser'):
            self.browser.close()
        if hasattr(self, 'playwright'):
            self.playwright.stop()
        logger.info("浏览器环境清理完成")
    
    @allure.story("正常登录流程")
    @allure.title("使用有效凭据成功登录系统")
    @pytest.mark.smoke
    @pytest.mark.critical
    def test_successful_login(self):
        """测试使用有效用户名和密码成功登录系统"""
        with allure.step("导航到登录页面"):
            self.page.goto("http://web.xkejia.cn/login?redirect=%2FadminIndex")
            expect(self.page).to_have_url(re.compile(r".*login.*"))
        
        with allure.step("输入用户名"):
            username_input = self.page.get_by_role("textbox", name="请输入账号")
            username_input.click()
            username_input.fill("xkadmin")
            expect(username_input).to_have_value("xkadmin")
        
        with allure.step("输入密码"):
            password_input = self.page.get_by_role("textbox", name="请输入密码")
            password_input.click()
            password_input.fill("xk@12580")
            expect(password_input).to_have_value("xk@12580")
        
        with allure.step("输入验证码"):
            # 使用OCR识别验证码
            captcha_text = captcha_recognizer.recognize_captcha_from_element(self.page, "img")
            captcha_input = self.page.get_by_role("textbox", name="请输入验证码")
            captcha_input.click()
            captcha_input.fill(captcha_text)
            expect(captcha_input).to_have_value(captcha_text)
        
        with allure.step("点击登录按钮"):
            login_button = self.page.get_by_role("button", name="登录")
            login_button.click()
        
        with allure.step("验证登录成功"):
            # 等待页面跳转并验证URL
            expect(self.page).to_have_url(re.compile(r".*adminIndex.*"))
            # 验证页面包含管理相关的元素
            expect(self.page.locator("body")).to_contain_text(re.compile(r"管理|后台|首页", re.IGNORECASE))
        
        logger.info("登录测试执行完成")
    
    @allure.story("异常登录场景")
    @allure.title("使用无效用户名登录失败")
    @pytest.mark.exception
    def test_login_with_invalid_username(self):
        """测试使用无效用户名登录失败的情况"""
        with allure.step("导航到登录页面"):
            self.page.goto("http://web.xkejia.cn/login?redirect=%2FadminIndex")
        
        with allure.step("输入无效用户名"):
            username = fake.user_name()
            username_input = self.page.get_by_role("textbox", name="请输入账号")
            username_input.fill(username)
        
        with allure.step("输入有效密码"):
            password_input = self.page.get_by_role("textbox", name="请输入密码")
            password_input.fill("xk@12580")
        
        with allure.step("输入验证码"):
            captcha_text = captcha_recognizer.recognize_captcha_from_element(self.page, "img")
            captcha_input = self.page.get_by_role("textbox", name="请输入验证码")
            captcha_input.fill(captcha_text)
        
        with allure.step("点击登录按钮并验证失败"):
            login_button = self.page.get_by_role("button", name="登录")
            login_button.click()
            
            # 验证登录失败，页面应该仍然在登录页面或显示错误信息
            expect(self.page.locator("body")).to_contain_text(re.compile(r"错误|失败|不存在|无效", re.IGNORECASE))
        
        logger.info("无效用户名登录测试执行完成")
    
    @allure.story("异常登录场景")
    @allure.title("使用无效密码登录失败")
    @pytest.mark.exception
    def test_login_with_invalid_password(self):
        """测试使用无效密码登录失败的情况"""
        with allure.step("导航到登录页面"):
            self.page.goto("http://web.xkejia.cn/login?redirect=%2FadminIndex")
        
        with allure.step("输入有效用户名"):
            username_input = self.page.get_by_role("textbox", name="请输入账号")
            username_input.fill("xkadmin")
        
        with allure.step("输入无效密码"):
            password = fake.password()
            password_input = self.page.get_by_role("textbox", name="请输入密码")
            password_input.fill(password)
        
        with allure.step("输入验证码"):
            captcha_text = captcha_recognizer.recognize_captcha_from_element(self.page, "img")
            captcha_input = self.page.get_by_role("textbox", name="请输入验证码")
            captcha_input.fill(captcha_text)
        
        with allure.step("点击登录按钮并验证失败"):
            login_button = self.page.get_by_role("button", name="登录")
            login_button.click()
            
            # 验证登录失败
            expect(self.page.locator("body")).to_contain_text(re.compile(r"错误|失败|密码", re.IGNORECASE))
        
        logger.info("无效密码登录测试执行完成")
    
    @allure.story("边界测试")
    @allure.title("空用户名登录测试")
    @pytest.mark.exception
    def test_login_with_empty_username(self):
        """测试使用空用户名登录的情况"""
        with allure.step("导航到登录页面"):
            self.page.goto("http://web.xkejia.cn/login?redirect=%2FadminIndex")
        
        with allure.step("不输入用户名"):
            # 直接跳过用户名输入
            pass
        
        with allure.step("输入有效密码"):
            password_input = self.page.get_by_role("textbox", name="请输入密码")
            password_input.fill("xk@12580")
        
        with allure.step("输入验证码"):
            captcha_text = captcha_recognizer.recognize_captcha_from_element(self.page, "img")
            captcha_input = self.page.get_by_role("textbox", name="请输入验证码")
            captcha_input.fill(captcha_text)
        
        with allure.step("点击登录按钮并验证失败"):
            login_button = self.page.get_by_role("button", name="登录")
            login_button.click()
            
            # 验证登录失败，应该提示用户名不能为空
            expect(self.page.locator("body")).to_contain_text(re.compile(r"用户名|账号|不能为空|必填", re.IGNORECASE))
        
        logger.info("空用户名登录测试执行完成")


@allure.epic("XK管理系统")
@allure.feature("系统功能")
class TestXKSystem:
    """XK管理系统功能测试"""
    
    def setup_method(self):
        """测试方法前置设置"""
        self.playwright = sync_playwright().start()
        self.browser = self.playwright.chromium.launch(headless=False)
        self.context = self.browser.new_context()
        self.page = self.context.new_page()
        
        # 先登录系统
        self.page.goto("http://web.xkejia.cn/login?redirect=%2FadminIndex")
        self.page.get_by_role("textbox", name="请输入账号").fill("xkadmin")
        self.page.get_by_role("textbox", name="请输入密码").fill("xk@12580")
        
        # 使用OCR识别验证码
        captcha_text = captcha_recognizer.recognize_captcha_from_element(self.page, "img")
        self.page.get_by_role("textbox", name="请输入验证码").fill(captcha_text)
        
        self.page.get_by_role("button", name="登录").click()
        
        # 等待登录完成
        expect(self.page).to_have_url(re.compile(r".*adminIndex.*"))
        logger.info("系统功能测试环境初始化完成")
    
    def teardown_method(self):
        """测试方法后置清理"""
        if hasattr(self, 'page'):
            self.page.close()
        if hasattr(self, 'context'):
            self.context.close()
        if hasattr(self, 'browser'):
            self.browser.close()
        if hasattr(self, 'playwright'):
            self.playwright.stop()
        logger.info("系统功能测试环境清理完成")
    
    @allure.story("页面导航")
    @allure.title("验证管理首页加载正常")
    @pytest.mark.smoke
    def test_admin_homepage_load(self):
        """测试管理首页正常加载"""
        with allure.step("验证页面标题"):
            expect(self.page).to_have_title(re.compile(r".*携康.*|.*基卫.*", re.IGNORECASE))
        
        with allure.step("验证页面关键元素"):
            # 验证页面包含关键的管理功能元素
            expect(self.page.locator("body")).to_contain_text(re.compile(r"首页|档案管理|体检服务", re.IGNORECASE))
        
        with allure.step("验证导航菜单"):
            # 验证导航菜单存在
            expect(self.page.locator("nav, .navbar, .menu").first).to_be_visible()
        
        logger.info("管理首页加载测试执行完成")
    
    @allure.story("系统稳定性")
    @allure.title("页面刷新后保持登录状态")
    @pytest.mark.critical
    def test_session_persistence_after_refresh(self):
        """测试页面刷新后会话保持"""
        with allure.step("记录当前页面URL"):
            original_url = self.page.url
        
        with allure.step("刷新页面"):
            self.page.reload()
        
        with allure.step("验证刷新后页面正常"):
            expect(self.page).to_have_url(original_url)
            expect(self.page.locator("body")).to_be_visible()
        
        with allure.step("验证登录状态保持"):
            # 验证页面仍然显示管理相关内容，而不是跳转到登录页面
            expect(self.page.locator("body")).not_to_contain_text(re.compile(r"登录|账号|密码", re.IGNORECASE))
        
        logger.info("会话保持测试执行完成")

"""TestReporter 单元测试 - attach/skip/fail 桥接"""

import logging
from unittest.mock import patch

import pytest

from main.utils.test_reporter import TestReporter


@pytest.mark.unit
class TestTestReporterInit:
    """TestReporter 构造测试"""

    def test_init_stores_logger(self):
        """构造时应存储 logger 引用"""
        logger = logging.getLogger("test")
        reporter = TestReporter(logger)
        assert reporter._logger is logger

    def test_init_stores_no_extra_state(self):
        """构造时不应有额外状态"""
        reporter = TestReporter(logging.getLogger("test"))
        assert not hasattr(reporter, "_config")  # 不应预加载配置
        assert not hasattr(reporter, "_i18n")  # 不应预加载 i18n


@pytest.mark.unit
class TestTestReporterAttach:
    """attach 方法测试"""

    @patch("main.utils.test_reporter.allure.attach")
    def test_attach_default_text_type(self, mock_attach):
        """默认 attachment_type='TEXT' 应使用 allure.attachment_type.TEXT"""
        reporter = TestReporter(logging.getLogger("test"))
        reporter.attach("content", "name")
        mock_attach.assert_called_once()
        args, kwargs = mock_attach.call_args
        assert kwargs["name"] == "name"
        # 验证 attachment_type 是 TEXT
        import allure

        assert kwargs["attachment_type"] is allure.attachment_type.TEXT

    @patch("main.utils.test_reporter.allure.attach")
    def test_attach_explicit_text_type(self, mock_attach):
        """显式 attachment_type='TEXT' 应正常工作"""
        reporter = TestReporter(logging.getLogger("test"))
        reporter.attach("content", "name", attachment_type="TEXT")
        mock_attach.assert_called_once()

    @patch("main.utils.test_reporter.allure.attach")
    def test_attach_invalid_type_falls_back_to_text(self, mock_attach):
        """无效 attachment_type 应回退到 TEXT"""
        reporter = TestReporter(logging.getLogger("test"))
        reporter.attach("content", "name", attachment_type="INVALID_TYPE")
        mock_attach.assert_called_once()
        import allure

        _, kwargs = mock_attach.call_args
        assert kwargs["attachment_type"] is allure.attachment_type.TEXT

    @patch("main.utils.test_reporter.allure.attach")
    def test_attach_with_unicode_content(self, mock_attach):
        """Unicode 内容应正常附加"""
        reporter = TestReporter(logging.getLogger("test"))
        reporter.attach("崩溃日志：应用程序崩溃", "崩溃报告")
        mock_attach.assert_called_once()
        _, kwargs = mock_attach.call_args
        assert kwargs["name"] == "崩溃报告"

    @patch("main.utils.test_reporter.allure.attach")
    def test_attach_empty_content(self, mock_attach):
        """空内容也应调用 allure.attach"""
        reporter = TestReporter(logging.getLogger("test"))
        reporter.attach("", "empty")
        mock_attach.assert_called_once()


@pytest.mark.unit
class TestTestReporterSkip:
    """skip 方法测试"""

    def test_skip_raises_skip_exception(self):
        """skip 应抛出 pytest.skip 异常"""
        reporter = TestReporter(logging.getLogger("test"))
        with pytest.raises(pytest.skip.Exception):
            reporter.skip("设备未连接")

    def test_skip_raises_with_reason(self):
        """skip 异常应包含 reason"""
        reporter = TestReporter(logging.getLogger("test"))
        with pytest.raises(pytest.skip.Exception) as exc_info:
            reporter.skip("ADB 服务不可用")
        assert "ADB 服务不可用" in str(exc_info.value)

    def test_skip_with_empty_reason(self):
        """空 reason 也应抛出 skip 异常"""
        reporter = TestReporter(logging.getLogger("test"))
        with pytest.raises(pytest.skip.Exception):
            reporter.skip("")


@pytest.mark.unit
class TestTestReporterFail:
    """fail 方法测试"""

    def test_fail_raises_failed_exception(self):
        """fail 应抛出 pytest.fail 异常"""
        reporter = TestReporter(logging.getLogger("test"))
        with pytest.raises(pytest.fail.Exception):
            reporter.fail("测试失败")

    def test_fail_raises_with_reason(self):
        """fail 异常应包含 reason"""
        reporter = TestReporter(logging.getLogger("test"))
        with pytest.raises(pytest.fail.Exception) as exc_info:
            reporter.fail("Appium 会话创建失败")
        assert "Appium 会话创建失败" in str(exc_info.value)

    def test_fail_with_empty_reason(self):
        """空 reason 也应抛出 fail 异常"""
        reporter = TestReporter(logging.getLogger("test"))
        with pytest.raises(pytest.fail.Exception):
            reporter.fail("")

"""
测试报告桥接模块
封装 allure/pytest 调用，消除 TestInitializer 对 allure/pytest 直接依赖
"""

import logging

import allure
import pytest


class TestReporter:
    """测试报告桥接器：封装 Allure 附件与 pytest.skip/fail 调用"""

    def __init__(self, logger: logging.Logger):
        """
        Args:
            logger: 日志记录器
        """
        self._logger = logger

    def attach(self, content: str, name: str, attachment_type: str = "TEXT") -> None:
        """附加内容到 Allure 报告

        Args:
            content: 附件内容
            name: 附件名称
            attachment_type: allure.attachment_type 枚举名（如 'TEXT'），默认 'TEXT'
        """
        attach_type = getattr(allure.attachment_type, attachment_type, allure.attachment_type.TEXT)
        allure.attach(content, name=name, attachment_type=attach_type)

    def skip(self, reason: str) -> None:
        """跳过测试（透传 pytest.skip）"""
        pytest.skip(reason)

    def fail(self, reason: str) -> None:
        """标记测试失败（透传 pytest.fail）"""
        pytest.fail(reason)

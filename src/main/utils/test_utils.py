"""
测试工具模块
提供测试用例管理和标记功能
"""
import pytest
from typing import Callable, Any
from main.utils.logger import get_logger

logger = get_logger(__name__)


class TestMarker:
    """测试标记管理类"""
    
    @staticmethod
    def smoke_test(func: Callable) -> Callable:
        """冒烟测试标记装饰器"""
        return pytest.mark.smoke(func)
    
    @staticmethod
    def unit_test(func: Callable) -> Callable:
        """单元功能测试标记装饰器"""
        return pytest.mark.unit(func)
    
    @staticmethod
    def exception_test(func: Callable) -> Callable:
        """异常场景测试标记装饰器"""
        return pytest.mark.exception(func)
    
    @staticmethod
    def critical_test(func: Callable) -> Callable:
        """关键功能测试标记装饰器"""
        return pytest.mark.critical(func)


class AssertionUtils:
    """断言工具类"""
    
    @staticmethod
    def assert_dict_contains(actual: dict, expected: dict, message: str = ""):
        """断言实际字典包含期望字典的所有键值对"""
        for key, value in expected.items():
            assert key in actual, f"{message} - 缺少键: {key}"
            assert actual[key] == value, f"{message} - 键 {key} 的值不匹配: 期望 {value}, 实际 {actual[key]}"
    
    @staticmethod
    def assert_response_success(actual: dict, message: str = ""):
        """断言响应成功"""
        assert "success" in actual, f"{message} - 响应中缺少success字段"
        assert actual["success"] is True, f"{message} - 操作失败: {actual.get('message', '未知错误')}"
    
    @staticmethod
    def assert_response_failure(actual: dict, message: str = ""):
        """断言响应失败"""
        assert "success" in actual, f"{message} - 响应中缺少success字段"
        assert actual["success"] is False, f"{message} - 操作应该失败但实际成功"


# 创建全局实例
test_marker = TestMarker()
assertion_utils = AssertionUtils()

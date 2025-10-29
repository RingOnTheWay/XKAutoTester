"""
测试工具模块
提供测试用例管理和标记功能
"""
import pytest
from typing import Callable, Any
from utils.logger import get_logger

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


class TestDataProvider:
    """测试数据提供器"""
    
    @staticmethod
    def parametrize_from_yaml(test_type: str):
        """从YAML文件参数化测试用例"""
        def decorator(func: Callable) -> Callable:
            from utils.data_loader import data_loader
            
            test_cases = data_loader.get_test_cases(test_type)
            
            if not test_cases:
                logger.warning(f"未找到 {test_type} 类型的测试用例数据")
                return func
            
            # 提取测试数据
            ids = []
            argvalues = []
            
            for case in test_cases:
                ids.append(case.get("case_id", "unknown"))
                argvalues.append((case["data"], case["expected"], case))
            
            return pytest.mark.parametrize("test_data,expected,case_info", argvalues, ids=ids)(func)
        
        return decorator


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
data_provider = TestDataProvider()
assertion_utils = AssertionUtils()
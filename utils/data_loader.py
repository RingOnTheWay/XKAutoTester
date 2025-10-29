"""
数据驱动模块
提供YAML数据文件的读取和管理功能
"""
import yaml
from pathlib import Path
from typing import Dict, Any, List
from config.config import TEST_DATA_CONFIG
from utils.logger import get_logger

logger = get_logger(__name__)


class DataLoader:
    """数据加载器类"""
    
    def __init__(self):
        self.data_dir = Path(TEST_DATA_CONFIG["data_dir"])
        self._ensure_data_dir()
    
    def _ensure_data_dir(self):
        """确保数据目录存在"""
        self.data_dir.mkdir(parents=True, exist_ok=True)
        logger.info(f"数据目录已确认: {self.data_dir}")
    
    def load_yaml_data(self, filename: str) -> Dict[str, Any]:
        """加载YAML文件数据"""
        file_path = self.data_dir / filename
        
        if not file_path.exists():
            logger.warning(f"YAML文件不存在: {file_path}")
            return {}
        
        try:
            with open(file_path, 'r', encoding='utf-8') as file:
                data = yaml.safe_load(file)
                logger.info(f"成功加载YAML文件: {filename}")
                return data or {}
        except Exception as e:
            logger.error(f"加载YAML文件失败 {filename}: {e}")
            return {}
    
    def save_yaml_data(self, filename: str, data: Dict[str, Any]):
        """保存数据到YAML文件"""
        file_path = self.data_dir / filename
        
        try:
            with open(file_path, 'w', encoding='utf-8') as file:
                yaml.dump(data, file, default_flow_style=False, allow_unicode=True)
            logger.info(f"成功保存数据到YAML文件: {filename}")
        except Exception as e:
            logger.error(f"保存YAML文件失败 {filename}: {e}")
    
    def get_test_cases(self, test_type: str) -> List[Dict[str, Any]]:
        """根据测试类型获取测试用例数据"""
        filename_map = {
            "personal_info": TEST_DATA_CONFIG["personal_info_file"],
            "smoke": TEST_DATA_CONFIG["smoke_test_file"],
            "exception": TEST_DATA_CONFIG["exception_test_file"]
        }
        
        filename = filename_map.get(test_type)
        if not filename:
            logger.error(f"不支持的测试类型: {test_type}")
            return []
        
        data = self.load_yaml_data(filename)
        return data.get("test_cases", [])
    
    def generate_sample_data(self):
        """生成示例数据文件"""
        # 个人信息测试数据
        personal_info_data = {
            "test_cases": [
                {
                    "case_id": "PI_001",
                    "name": "正常个人信息填写",
                    "description": "验证正常个人信息填写功能",
                    "data": {
                        "name": "张三",
                        "age": 25,
                        "gender": "男",
                        "email": "zhangsan@example.com",
                        "phone": "13800138000",
                        "address": "北京市朝阳区"
                    },
                    "expected": {
                        "success": True,
                        "message": "个人信息保存成功"
                    }
                },
                {
                    "case_id": "PI_002",
                    "name": "边界年龄测试",
                    "description": "验证年龄边界值处理",
                    "data": {
                        "name": "李四",
                        "age": 150,
                        "gender": "女",
                        "email": "lisi@example.com",
                        "phone": "13900139000",
                        "address": "上海市浦东新区"
                    },
                    "expected": {
                        "success": False,
                        "message": "年龄超出合理范围"
                    }
                }
            ]
        }
        
        # 冒烟测试数据
        smoke_test_data = {
            "test_cases": [
                {
                    "case_id": "SMOKE_001",
                    "name": "个人信息页面加载",
                    "description": "验证个人信息页面正常加载",
                    "data": {
                        "page_url": "/personal/info"
                    },
                    "expected": {
                        "status_code": 200,
                        "page_title": "个人信息管理"
                    }
                }
            ]
        }
        
        # 异常场景测试数据
        exception_test_data = {
            "test_cases": [
                {
                    "case_id": "EX_001",
                    "name": "邮箱格式异常",
                    "description": "验证邮箱格式异常处理",
                    "data": {
                        "name": "王五",
                        "age": 30,
                        "gender": "男",
                        "email": "invalid-email",
                        "phone": "13600136000",
                        "address": "广州市天河区"
                    },
                    "expected": {
                        "success": False,
                        "message": "邮箱格式不正确"
                    }
                },
                {
                    "case_id": "EX_002",
                    "name": "手机号格式异常",
                    "description": "验证手机号格式异常处理",
                    "data": {
                        "name": "赵六",
                        "age": 28,
                        "gender": "女",
                        "email": "zhaoliu@example.com",
                        "phone": "123456",
                        "address": "深圳市南山区"
                    },
                    "expected": {
                        "success": False,
                        "message": "手机号格式不正确"
                    }
                }
            ]
        }
        
        # 保存示例数据
        self.save_yaml_data(TEST_DATA_CONFIG["personal_info_file"], personal_info_data)
        self.save_yaml_data(TEST_DATA_CONFIG["smoke_test_file"], smoke_test_data)
        self.save_yaml_data(TEST_DATA_CONFIG["exception_test_file"], exception_test_data)
        
        logger.info("示例数据文件生成完成")


# 全局数据加载器实例
data_loader = DataLoader()


if __name__ == "__main__":
    # 生成示例数据
    data_loader.generate_sample_data()
    
    # 测试数据加载
    test_cases = data_loader.get_test_cases("personal_info")
    print(f"加载到 {len(test_cases)} 个测试用例")
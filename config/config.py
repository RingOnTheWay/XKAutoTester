"""
项目配置文件
集中管理所有可自定义的参数和路径
"""
import os
from pathlib import Path

# 项目根目录
PROJECT_ROOT = Path(__file__).parent.parent

# 日志配置
LOG_CONFIG = {
    "level": "INFO",  # DEBUG, INFO, WARNING, ERROR, CRITICAL
    "format": "%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    "file_path": PROJECT_ROOT / "logs" / "test.log",
    "max_bytes": 10485760,  # 10MB
    "backup_count": 5
}

# 测试数据配置
TEST_DATA_CONFIG = {
    "data_dir": PROJECT_ROOT / "test_data",
    "personal_info_file": "personal_info.yaml",
    "smoke_test_file": "smoke_test.yaml",
    "exception_test_file": "exception_test.yaml"
}

# 测试报告配置
REPORT_CONFIG = {
    "allure_dir": PROJECT_ROOT / "allure-results",
    "allure_report_dir": PROJECT_ROOT / "allure-report",
    "html_report_dir": PROJECT_ROOT / "html-report"
}

# 测试用例配置
TEST_CASE_CONFIG = {
    "test_dir": PROJECT_ROOT / "tests",
    "unit_test_pattern": "test_*.py",
    "smoke_test_marker": "smoke",
    "unit_test_marker": "unit",
    "exception_test_marker": "exception"
}

# 确保目录存在
def ensure_directories():
    """确保所有必要的目录存在"""
    directories = [
        PROJECT_ROOT / "logs",
        PROJECT_ROOT / "test_data",
        PROJECT_ROOT / "tests"
    ]
    
    for directory in directories:
        directory.mkdir(parents=True, exist_ok=True)

# 初始化时只创建必要的目录（不创建报告目录）
ensure_directories()
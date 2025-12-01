#!/usr/bin/env python3
"""
测试日志记录修复效果
"""
import sys
import os

# 添加项目根目录到Python路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from utils.pytest_runner import PytestRunner

def test_logging_fix():
    """测试日志记录修复"""
    print("开始测试日志记录修复...")
    
    # 创建测试运行器
    runner = PytestRunner()
    
    # 运行测试，但不生成Allure报告
    result = runner.run_tests(
        test_paths=['tests/test_temperature_bio.py'], 
        markers=['smoke'], 
        generate_allure=False
    )
    
    print(f"测试退出码: {result['exit_code']}")
    print("测试完成，请检查 logs/test.log 文件查看详细的pytest输出")

if __name__ == "__main__":
    test_logging_fix()
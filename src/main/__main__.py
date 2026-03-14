#!/usr/bin/env python3
"""
Electron集成测试运行器
用于从Electron应用调用Python测试
"""
import sys
import os
import json
import argparse
from pathlib import Path

# 设置Python标准输出编码为UTF-8
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

# 添加 src 目录到 Python 路径（main 模块在 src/ 下）
src_dir = Path(__file__).parent.parent
sys.path.insert(0, str(src_dir))

from main.core.pytest_runner import PytestRunner
from main.utils.logger import get_logger

logger = get_logger(__name__)

class ElectronTestRunner:
    """Electron集成测试运行器"""
    
    def __init__(self):
        self.pytest_runner = PytestRunner()
    
    def run_tests(self, test_paths, markers=None, test_plan_name=None):
        """运行测试并返回结果"""
        try:
            # 打印开始信息（使用ASCII字符避免编码问题）
            print(f">>> 开始运行测试计划: {test_plan_name or '默认'}")
            print(f">>> 测试路径: {test_paths}")
            if markers:
                print(f">>> 测试标记: {markers}")
            
            # 运行测试
            result = self.pytest_runner.run_custom_tests(
                test_paths=test_paths,
                markers=markers,
                generate_allure=True,
                test_plan_name=test_plan_name
            )
            
            # 获取测试摘要
            summary = self.pytest_runner.get_test_summary(result)
            print(summary)
            
            # 根据测试结果的退出码决定success值
            success = result.get("exit_code", 0) == 0
            
            # 返回结果
            return {
                "success": success,
                "summary": summary,
                "test_plan_name": test_plan_name,
                "exit_code": result.get("exit_code", 0)
            }
            
        except Exception as e:
            error_msg = f">>> 测试运行失败: {str(e)}"
            logger.error(error_msg)
            print(error_msg)
            
            return {
                "success": False,
                "error": str(e),
                "test_plan_name": test_plan_name
            }

def main():
    """主函数 - 用于命令行调用"""
    parser = argparse.ArgumentParser(description='XKAutoTester Electron集成测试运行器')
    parser.add_argument('--test-paths', required=True, help='测试路径，多个路径用逗号分隔')
    parser.add_argument('--markers', help='测试标记，多个标记用逗号分隔')
    parser.add_argument('--test-plan', help='测试计划名称')
    
    args = parser.parse_args()
    
    # 解析参数
    test_paths = args.test_paths.split(',')
    markers = args.markers.split(',') if args.markers else None
    test_plan_name = args.test_plan
    
    # 创建运行器并执行测试
    runner = ElectronTestRunner()
    result = runner.run_tests(test_paths, markers, test_plan_name)
    
    # 退出码：0表示成功，1表示失败
    sys.exit(0 if result["success"] else 1)

if __name__ == "__main__":
    main()

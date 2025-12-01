#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
测试端口检测修复
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import logging
from utils.appium_server import AppiumServer

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

def test_port_detection():
    """测试端口检测功能"""
    print("=== 测试端口检测功能 ===")
    
    # 创建Appium服务器实例
    server = AppiumServer('127.0.0.1', 4723)
    
    # 测试force_cleanup方法
    print("\n=== 执行force_cleanup方法 ===")
    server.force_cleanup()
    
    print("\n=== 测试完成 ===")

if __name__ == "__main__":
    test_port_detection()
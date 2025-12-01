#!/usr/bin/env python3
"""
调试force_cleanup方法，查看详细的端口占用信息
"""
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from utils.appium_server import AppiumServer
import logging

# 配置详细的日志
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("debug_force_cleanup.log", encoding='utf-8'),
        logging.StreamHandler()
    ]
)

logger = logging.getLogger(__name__)

def debug_force_cleanup():
    """调试force_cleanup方法"""
    logger.info("开始调试force_cleanup方法...")
    
    # 创建AppiumServer实例
    server = AppiumServer(host='127.0.0.1', port=4723)
    
    # 先检查当前端口占用情况
    logger.info("=== 当前端口占用情况 ===")
    import subprocess
    
    # 检查所有端口
    result = subprocess.run(['netstat', '-ano'], capture_output=True, text=True, timeout=10)
    logger.info(f"netstat命令返回码: {result.returncode}")
    logger.info(f"netstat输出:\n{result.stdout}")
    if result.stderr:
        logger.warning(f"netstat错误: {result.stderr}")
    
    # 检查4723端口
    logger.info("=== 检查4723端口 ===")
    result = subprocess.run(['netstat', '-ano', '|', 'findstr', ':4723'], 
                          shell=True, capture_output=True, text=True, timeout=10)
    logger.info(f"findstr命令返回码: {result.returncode}")
    logger.info(f"findstr输出:\n{result.stdout}")
    if result.stderr:
        logger.warning(f"findstr错误: {result.stderr}")
    
    # 检查node.exe进程
    logger.info("=== 检查node.exe进程 ===")
    result = subprocess.run(['tasklist', '/FI', 'IMAGENAME eq node.exe'], 
                          capture_output=True, text=True, timeout=10)
    logger.info(f"tasklist命令返回码: {result.returncode}")
    logger.info(f"tasklist输出:\n{result.stdout}")
    if result.stderr:
        logger.warning(f"tasklist错误: {result.stderr}")
    
    # 执行force_cleanup
    logger.info("=== 执行force_cleanup方法 ===")
    server.force_cleanup()
    
    logger.info("调试完成")

if __name__ == "__main__":
    debug_force_cleanup()
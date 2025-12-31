"""
ADB设备管理模块
负责处理所有与ADB设备连接、状态检查相关的操作
"""

import subprocess
import logging
import time
from typing import Tuple, Optional

logger = logging.getLogger(__name__)


class ADBManager:
    """ADB设备管理器"""
    
    def __init__(self, device_name: str, app_package: str):
        """
        初始化ADB管理器
        
        Args:
            device_name: 设备名称或IP地址
            app_package: 应用包名
        """
        self.device_name = device_name
        self.app_package = app_package
    
    def check_adb_service(self) -> bool:
        """
        检查ADB服务是否正常运行
        
        Returns:
            bool: ADB服务是否正常
        """
        try:
            result = subprocess.run(['adb', 'version'], capture_output=True, text=True, timeout=5)
            return result.returncode == 0
        except Exception as e:
            logger.warning(f"ADB服务检查异常: {e}")
            return False
    
    def connect_device(self) -> Tuple[bool, str]:
        """
        连接ADB设备
        
        Returns:
            Tuple[bool, str]: (连接是否成功, 连接状态信息)
        """
        try:
            logger.info(f"尝试连接设备: {self.device_name}")
            connect_result = subprocess.run(
                ['adb', 'connect', f'{self.device_name}:5555'], 
                capture_output=True, text=True, timeout=10
            )
            
            stdout = connect_result.stdout
            stderr = connect_result.stderr
            
            # 完整输出命令执行结果到日志
            logger.info(f"ADB连接命令执行结果 - 标准输出: {stdout}")
            if stderr:
                logger.info(f"ADB连接命令执行结果 - 标准错误: {stderr}")
            logger.info(f"ADB连接命令执行结果 - 返回码: {connect_result.returncode}")
            
            # 检查连接结果
            if 'connected' in stdout or 'already' in stdout or 'failed to authenticate' in stdout:
                logger.info(f"设备连接尝试结果: {stdout.strip()}")
                
                # 无论连接命令返回什么，都检查设备列表状态
                devices_result = subprocess.run(
                    ['adb', 'devices'], 
                    capture_output=True, text=True, timeout=5
                )
                
                logger.info(f"ADB设备列表检查结果 - 标准输出: {devices_result.stdout}")
                if devices_result.stderr:
                    logger.info(f"ADB设备列表检查结果 - 标准错误: {devices_result.stderr}")
                
                # 检查设备授权状态
                device_line = f"{self.device_name}:5555"
                
                # 无论设备是否在列表中，都尝试断开并重新连接以触发授权
                logger.info("断开设备连接以重新触发授权提示...")
                disconnect_result = subprocess.run(
                    ['adb', 'disconnect', f'{self.device_name}:5555'], 
                    capture_output=True, text=True, timeout=5
                )
                logger.info(f"断开连接结果: {disconnect_result.stdout}")
                
                # 等待1秒后重新连接
                time.sleep(1)
                
                logger.info("重新连接设备以触发授权提示...")
                reconnect_result = subprocess.run(
                    ['adb', 'connect', f'{self.device_name}:5555'], 
                    capture_output=True, text=True, timeout=10
                )
                logger.info(f"重新连接结果: {reconnect_result.stdout}")
                
                # 再次检查设备列表
                devices_result = subprocess.run(
                    ['adb', 'devices'], 
                    capture_output=True, text=True, timeout=5
                )
                logger.info(f"重新连接后设备列表 - 标准输出: {devices_result.stdout}")
                
                if device_line in devices_result.stdout:
                    if 'unauthorized' in devices_result.stdout or 'failed to authenticate' in stdout:
                        logger.warning(f"设备未授权: {self.device_name}")
                        
                        logger.info("请在设备上点击'同意'授权此电脑连接，系统将每2秒检查一次授权状态")
                        
                        # 尝试调用Electron弹窗提醒用户
                        self._show_unauthorized_dialog()
                        
                        # 等待用户授权，最多等待1分钟
                        max_wait_time = 60  # 60秒超时
                        check_interval = 2  # 每2秒检查一次
                        waited_time = 0
                        
                        while waited_time < max_wait_time:
                            logger.info(f"等待授权中... 已等待{waited_time}秒")
                            time.sleep(check_interval)
                            waited_time += check_interval
                            
                            # 重新检查设备授权状态
                            devices_result = subprocess.run(
                                ['adb', 'devices'], 
                                capture_output=True, text=True, timeout=5
                            )
                            
                            logger.info(f"授权检查结果 - 标准输出: {devices_result.stdout}")
                            
                            if device_line in devices_result.stdout:
                                if 'unauthorized' not in devices_result.stdout:
                                    logger.info(f"设备已授权: {self.device_name}")
                                    return True, "设备连接成功并已授权"
                                else:
                                    logger.info(f"设备仍处于未授权状态，继续等待...")
                            else:
                                logger.warning(f"设备未在设备列表中: {self.device_name}")
                                # 设备不在列表中，再次尝试连接
                                logger.info("设备未在列表中，再次尝试连接...")
                                reconnect_result = subprocess.run(
                                    ['adb', 'connect', f'{self.device_name}:5555'], 
                                    capture_output=True, text=True, timeout=10
                                )
                                logger.info(f"再次连接结果: {reconnect_result.stdout}")
                        
                        # 超时处理
                        logger.error(f"设备授权超时: 等待{max_wait_time}秒后设备仍未授权")
                        return False, "设备授权超时"
                        
                    else:
                        logger.info(f"设备已授权: {self.device_name}")
                        return True, "设备连接成功并已授权"
                else:
                    logger.warning(f"设备未在设备列表中: {self.device_name}")
                    return False, "设备未在设备列表中"
                    
            elif 'cannot connect' in stdout or '目标计算机积极拒绝' in stdout or '10061' in stdout:
                logger.warning(f"设备连接被拒绝: {self.device_name}")
                return False, "设备连接被拒绝"
            else:
                logger.warning(f"设备连接失败: {self.device_name}")
                return False, "设备连接失败"
                
        except Exception as e:
            logger.warning(f"ADB设备连接异常: {e}")
            return False, f"ADB设备连接异常: {e}"
    
    def _show_unauthorized_dialog(self):
        """
        显示设备未授权弹窗提醒
        通过多种方式尝试与Electron前端通信
        """
        try:
            # 方法1: 通过环境变量或文件标记触发Electron弹窗
            import os
            import json
            from pathlib import Path
            
            # 创建弹窗触发文件
            dialog_trigger_file = Path(__file__).parent.parent / "logs" / "unauthorized_dialog.json"
            dialog_trigger_file.parent.mkdir(parents=True, exist_ok=True)
            
            dialog_data = {
                "device_name": self.device_name,
                "timestamp": time.time(),
                "message": f"设备 {self.device_name} 未授权，请在设备上点击'同意'授权此电脑连接"
            }
            
            with open(dialog_trigger_file, 'w', encoding='utf-8') as f:
                json.dump(dialog_data, f, ensure_ascii=False, indent=2)
            
            logger.info(f"已创建未授权弹窗触发文件: {dialog_trigger_file}")
            
            # 方法2: 尝试通过标准输出发送消息给Electron进程
            print(f"[ELECTRON_DIALOG] device_unauthorized:{self.device_name}")
            
            # 方法3: 如果可能，尝试直接调用Electron IPC
            # 这里需要检查是否在Electron环境中运行
            if os.environ.get('ELECTRON_RUN_AS_NODE'):
                # 在Electron环境中，尝试通过IPC发送消息
                try:
                    import socket
                    # 尝试连接到Electron IPC服务器（如果存在）
                    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                    sock.settimeout(1)
                    sock.connect(('localhost', 8080))
                    sock.send(json.dumps({
                        "type": "device_unauthorized",
                        "device_name": self.device_name
                    }).encode('utf-8'))
                    sock.close()
                except:
                    pass  # IPC连接失败，使用其他方法
            
        except Exception as e:
            logger.warning(f"显示未授权弹窗失败: {e}")
            # 即使弹窗失败，也不影响主要逻辑，继续等待授权
    
    def check_app_status(self) -> Tuple[bool, Optional[str]]:
        """
        检查APP运行状态
        
        Returns:
            Tuple[bool, Optional[str]]: (APP是否在前台运行, 错误信息)
        """
        try:
            result = subprocess.run(
                ['adb', '-s', self.device_name, 'shell', 'dumpsys', 'window', 'windows'], 
                capture_output=True, text=True, timeout=10
            )
            
            if result.returncode == 0:
                if self.app_package in result.stdout:
                    logger.info("检测到APP正在前台运行")
                    return True, None
                else:
                    logger.info("APP未在前台运行")
                    return False, None
            else:
                logger.warning("无法检查APP状态")
                return False, "无法检查APP状态"
                
        except Exception as e:
            logger.warning(f"检查APP状态时出错: {e}")
            return False, f"检查APP状态时出错: {e}"
    
    def force_stop_app(self) -> bool:
        """
        强制停止APP
        
        Returns:
            bool: 停止操作是否成功
        """
        try:
            result = subprocess.run(
                ['adb', '-s', self.device_name, 'shell', 'am', 'force-stop', self.app_package],
                capture_output=True, timeout=10
            )
            
            if result.returncode == 0:
                logger.info("APP已强制关闭")
                return True
            else:
                logger.warning("强制关闭APP失败")
                return False
                
        except Exception as e:
            logger.warning(f"强制关闭APP时出错: {e}")
            return False
    
    def ensure_app_closed(self, wait_time: int = 2) -> bool:
        """
        确保APP处于关闭状态，如果APP正在运行则强制关闭
        
        Args:
            wait_time: 关闭后等待时间（秒）
            
        Returns:
            bool: 操作是否成功
        """
        try:
            is_running, error_msg = self.check_app_status()
            
            if is_running:
                logger.info("检测到APP正在前台运行，强制关闭APP")
                if self.force_stop_app():
                    time.sleep(wait_time)
                    return True
                else:
                    return False
            else:
                if error_msg:
                    logger.warning(f"检查APP状态时出错: {error_msg}")
                else:
                    logger.info("APP未在前台运行，无需关闭")
                return True
                
        except Exception as e:
            logger.warning(f"确保APP关闭时出错: {e}")
            return False
    
    def check_bluetooth_status(self) -> Tuple[bool, Optional[str]]:
        """
        检查蓝牙状态
        
        Returns:
            Tuple[bool, Optional[str]]: (蓝牙是否开启, 错误信息)
        """
        try:
            result = subprocess.run(
                ['adb', '-s', self.device_name, 'shell', 'settings', 'get', 'global', 'bluetooth_on'], 
                capture_output=True, text=True, timeout=10
            )
            
            if result.returncode == 0:
                bluetooth_status = result.stdout.strip()
                if bluetooth_status == '1':
                    logger.info("蓝牙已开启")
                    return True, None
                else:
                    logger.warning("蓝牙未开启")
                    return False, "蓝牙未开启"
            else:
                logger.warning("无法检查蓝牙状态")
                return False, "无法检查蓝牙状态"
                
        except Exception as e:
            logger.warning(f"检查蓝牙状态时出错: {e}")
            return False, f"检查蓝牙状态时出错: {e}"
    
    def enable_bluetooth(self) -> bool:
        """
        开启蓝牙
        
        Returns:
            bool: 开启操作是否成功
        """
        try:
            result = subprocess.run(
                ['adb', '-s', self.device_name, 'shell', 'svc', 'bluetooth', 'enable'], 
                capture_output=True, timeout=10
            )
            
            if result.returncode == 0:
                logger.info("蓝牙开启命令执行成功")
                # 等待蓝牙开启
                time.sleep(3)
                return True
            else:
                logger.warning("蓝牙开启命令执行失败")
                return False
                
        except Exception as e:
            logger.warning(f"开启蓝牙时出错: {e}")
            return False
    
    def ensure_bluetooth_enabled(self) -> bool:
        """
        确保蓝牙已开启，如果未开启则尝试开启
        
        Returns:
            bool: 蓝牙是否已开启
        """
        try:
            bluetooth_enabled, error_msg = self.check_bluetooth_status()
            
            if bluetooth_enabled:
                logger.info("蓝牙已开启，无需操作")
                return True
            else:
                logger.warning("蓝牙未开启，尝试开启蓝牙")
                if self.enable_bluetooth():
                    # 再次检查蓝牙状态
                    time.sleep(2)
                    bluetooth_enabled, _ = self.check_bluetooth_status()
                    if bluetooth_enabled:
                        logger.info("蓝牙开启成功")
                        return True
                    else:
                        logger.warning("蓝牙开启后状态检查失败")
                        return False
                else:
                    logger.warning("蓝牙开启失败")
                    return False
                
        except Exception as e:
            logger.warning(f"确保蓝牙开启时出错: {e}")
            return False


def create_adb_manager(device_name: str, app_package: str) -> ADBManager:
    """
    创建ADB管理器实例的便捷函数
    
    Args:
        device_name: 设备名称或IP地址
        app_package: 应用包名
        
    Returns:
        ADBManager: ADB管理器实例
    """
    return ADBManager(device_name, app_package)
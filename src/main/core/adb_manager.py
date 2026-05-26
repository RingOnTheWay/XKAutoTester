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
    
    def _is_tcp_device(self) -> bool:
        """
        判断设备是否为TCP/IP连接（WiFi ADB）
        
        USB设备的device_name为纯序列号（如 70665345151351），
        TCP/IP设备的device_name格式为 IP:端口（如 192.168.1.100:5555）
        
        Returns:
            bool: 是否为TCP/IP连接设备
        """
        return ':' in self.device_name
    
    def _check_device_in_list(self, device_identifier: str = None) -> Tuple[bool, str]:
        """
        检查设备是否在adb devices列表中
        
        Args:
            device_identifier: 要查找的设备标识，默认使用self.device_name
            
        Returns:
            Tuple[bool, str]: (设备是否在列表中, 设备状态)
        """
        if device_identifier is None:
            device_identifier = self.device_name
        
        try:
            devices_result = subprocess.run(
                ['adb', 'devices'], 
                capture_output=True, text=True, timeout=5
            )
            
            logger.info(f"ADB设备列表检查结果 - 标准输出: {devices_result.stdout}")
            if devices_result.stderr:
                logger.info(f"ADB设备列表检查结果 - 标准错误: {devices_result.stderr}")
            
            for line in devices_result.stdout.split('\n'):
                line = line.strip()
                if line.startswith(device_identifier):
                    if 'unauthorized' in line:
                        return False, 'unauthorized'
                    elif 'device' in line:
                        return True, 'device'
                    elif 'offline' in line:
                        return False, 'offline'
            return False, 'not_found'
        except Exception as e:
            logger.warning(f"检查设备列表异常: {e}")
            return False, str(e)
    
    def _wait_for_usb_authorization(self) -> Tuple[bool, str]:
        """
        等待USB设备授权
        
        Returns:
            Tuple[bool, str]: (授权是否成功, 状态信息)
        """
        logger.info("请在设备上点击'同意'授权此电脑连接，系统将每2秒检查一次授权状态")
        self._show_unauthorized_dialog()
        
        max_wait_time = 60
        check_interval = 2
        waited_time = 0
        
        while waited_time < max_wait_time:
            logger.info(f"等待授权中... 已等待{waited_time}秒")
            time.sleep(check_interval)
            waited_time += check_interval
            
            found, status = self._check_device_in_list()
            logger.info(f"授权检查结果 - 状态: {status}")
            
            if found and status == 'device':
                logger.info(f"设备已授权: {self.device_name}")
                return True, "设备连接成功并已授权"
            elif status == 'unauthorized':
                logger.info("设备仍处于未授权状态，继续等待...")
            else:
                logger.warning(f"设备未在设备列表中: {self.device_name}")
        
        logger.error(f"设备授权超时: 等待{max_wait_time}秒后设备仍未授权")
        return False, "设备授权超时"
    
    def connect_device(self) -> Tuple[bool, str]:
        """
        连接ADB设备
        
        根据设备标识自动判断连接类型：
        - USB设备（无冒号）：直接检查设备列表，无需adb connect
        - TCP/IP设备（有冒号）：通过adb connect连接
        
        Returns:
            Tuple[bool, str]: (连接是否成功, 连接状态信息)
        """
        try:
            logger.info(f"尝试连接设备: {self.device_name}")
            
            if self._is_tcp_device():
                return self._connect_tcp_device()
            else:
                return self._connect_usb_device()
                
        except Exception as e:
            logger.warning(f"ADB设备连接异常: {e}")
            return False, f"ADB设备连接异常: {e}"
    
    def _connect_tcp_device(self) -> Tuple[bool, str]:
        """
        连接TCP/IP（WiFi ADB）设备
        
        Returns:
            Tuple[bool, str]: (连接是否成功, 连接状态信息)
        """
        if ':' in self.device_name:
            device_address = self.device_name
        else:
            device_address = f'{self.device_name}:5555'
        
        connect_result = subprocess.run(
            ['adb', 'connect', device_address], 
            capture_output=True, text=True, timeout=10
        )
        
        stdout = connect_result.stdout
        stderr = connect_result.stderr
        
        logger.info(f"ADB连接命令执行结果 - 标准输出: {stdout}")
        if stderr:
            logger.info(f"ADB连接命令执行结果 - 标准错误: {stderr}")
        logger.info(f"ADB连接命令执行结果 - 返回码: {connect_result.returncode}")
        
        if 'connected' in stdout or 'already' in stdout or 'failed to authenticate' in stdout:
            logger.info(f"设备连接尝试结果: {stdout.strip()}")
            
            devices_result = subprocess.run(
                ['adb', 'devices'], 
                capture_output=True, text=True, timeout=5
            )
            
            logger.info(f"ADB设备列表检查结果 - 标准输出: {devices_result.stdout}")
            if devices_result.stderr:
                logger.info(f"ADB设备列表检查结果 - 标准错误: {devices_result.stderr}")
            
            device_line = device_address
            
            logger.info("断开设备连接以重新触发授权提示...")
            disconnect_result = subprocess.run(
                ['adb', 'disconnect', device_address], 
                capture_output=True, text=True, timeout=5
            )
            logger.info(f"断开连接结果: {disconnect_result.stdout}")
            
            time.sleep(1)
            
            logger.info("重新连接设备以触发授权提示...")
            reconnect_result = subprocess.run(
                ['adb', 'connect', device_address], 
                capture_output=True, text=True, timeout=10
            )
            logger.info(f"重新连接结果: {reconnect_result.stdout}")
            
            devices_result = subprocess.run(
                ['adb', 'devices'], 
                capture_output=True, text=True, timeout=5
            )
            logger.info(f"重新连接后设备列表 - 标准输出: {devices_result.stdout}")
            
            if device_line in devices_result.stdout:
                if 'unauthorized' in devices_result.stdout or 'failed to authenticate' in stdout:
                    logger.warning(f"设备未授权: {self.device_name}")
                    return self._wait_for_usb_authorization()
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
    
    def _connect_usb_device(self) -> Tuple[bool, str]:
        """
        连接USB设备
        
        USB设备通过物理连接已被ADB识别，无需执行adb connect。
        直接检查设备是否在adb devices列表中即可。
        
        Returns:
            Tuple[bool, str]: (连接是否成功, 连接状态信息)
        """
        logger.info("检测到USB设备（非IP连接标识），跳过adb connect，直接检查设备状态")
        
        found, status = self._check_device_in_list()
        
        if found and status == 'device':
            logger.info(f"USB设备已连接并已授权: {self.device_name}")
            return True, "设备连接成功并已授权"
        elif status == 'unauthorized':
            logger.warning(f"USB设备未授权: {self.device_name}")
            return self._wait_for_usb_authorization()
        elif status == 'offline':
            logger.warning(f"USB设备处于离线状态: {self.device_name}")
            return False, "USB设备处于离线状态，请重新插拔USB连接"
        else:
            logger.warning(f"USB设备未在设备列表中: {self.device_name}")
            logger.info("请检查USB连接是否正常，或在终端执行 adb devices 确认设备状态")
            return False, "USB设备未在设备列表中，请检查USB连接"
    
    def _show_unauthorized_dialog(self):
        """
        显示设备未授权弹窗提醒
        通过多种方式尝试与Electron前端通信
        """
        try:
            import os
            import json
            from pathlib import Path
            
            user_data = os.environ.get('XKAUTOTESTER_USER_DATA')
            data_root = Path(user_data) if user_data else Path(__file__).parent.parent.parent.parent
            
            dialog_trigger_file = data_root / "logs" / "unauthorized_dialog.json"
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
    
    def get_app_pid(self) -> Optional[int]:
        """
        获取应用的PID
        
        Returns:
            Optional[int]: 应用PID，如果应用未运行则返回None
        """
        try:
            result = subprocess.run(
                ['adb', '-s', self.device_name, 'shell', 'pidof', self.app_package],
                capture_output=True, text=True, timeout=10
            )
            
            if result.returncode == 0 and result.stdout.strip():
                pid = int(result.stdout.strip())
                logger.info(f"获取到应用PID: {pid}")
                return pid
            else:
                logger.warning(f"应用未运行或无法获取PID: {self.app_package}")
                return None
                
        except Exception as e:
            logger.warning(f"获取应用PID时出错: {e}")
            return None
    
    def check_crash_logs(self, pid: int) -> list:
        """
        检查应用的崩溃日志
        
        Args:
            pid: 应用进程ID
            
        Returns:
            list: 崩溃日志列表
        """
        try:
            # 使用logcat -d命令获取缓存的日志，并通过PID过滤
            # 同时支持Windows的findstr和Linux的grep命令
            result = subprocess.run(
                ['adb', '-s', self.device_name, 'shell', f'logcat -d'],
                capture_output=True, text=True, timeout=15
            )
            
            crash_logs = []
            if result.returncode == 0:
                for line in result.stdout.strip().split('\n'):
                    if line.strip() and f"{pid}" in line and "E" in line and "AndroidRuntime" in line:
                        crash_logs.append(line.strip())
            
            logger.info(f"检查到{len(crash_logs)}条崩溃日志")
            return crash_logs
            
        except Exception as e:
            logger.warning(f"检查崩溃日志时出错: {e}")
            return []
    


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


def get_connected_devices() -> list:
    """
    获取所有连接的设备列表
    
    Returns:
        list: 设备ID列表
    """
    try:
        logger.info("获取连接的设备列表")
        
        # 执行adb devices命令
        result = subprocess.run(
            ['adb', 'devices'], 
            capture_output=True, text=True, timeout=10
        )
        
        logger.info(f"ADB设备列表命令执行结果 - 标准输出: {result.stdout}")
        if result.stderr:
            logger.info(f"ADB设备列表命令执行结果 - 标准错误: {result.stderr}")
        logger.info(f"ADB设备列表命令执行结果 - 返回码: {result.returncode}")
        
        # 解析设备列表
        devices = []
        lines = result.stdout.split('\n')
        
        import re
        
        for line in lines:
            # 匹配设备行，格式如："设备ID    device"
            match = re.match(r'^([^\s]+)\s+device$', line.strip())
            if match:
                devices.append(match.group(1))
        
        logger.info(f"解析到的设备列表: {devices}")
        return devices
    except Exception as e:
        logger.error(f"获取设备列表失败: {e}")
        return []

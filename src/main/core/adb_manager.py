"""
ADB设备管理模块
负责处理所有与ADB设备连接、状态检查相关的操作
"""

import subprocess
import logging
import time
from typing import Tuple, Optional

from main.utils.i18n import t

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
        self._logcat_monitor = None
    
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
            logger.warning(t('python.adbManager.adbServiceCheckError', error=e))
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
            
            logger.info(t('python.adbManager.adbDeviceListStdout', output=devices_result.stdout))
            if devices_result.stderr:
                logger.info(t('python.adbManager.adbDeviceListStderr', output=devices_result.stderr))
            
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
            logger.warning(t('python.adbManager.checkDeviceListError', error=e))
            return False, str(e)
    
    def _wait_for_usb_authorization(self) -> Tuple[bool, str]:
        """
        等待USB设备授权
        
        Returns:
            Tuple[bool, str]: (授权是否成功, 状态信息)
        """
        logger.info(t('python.adbManager.pleaseAuthorizeDevice'))
        self._show_unauthorized_dialog()
        
        max_wait_time = 60
        check_interval = 2
        waited_time = 0
        
        while waited_time < max_wait_time:
            logger.info(t('python.adbManager.waitingForAuth', seconds=waited_time))
            time.sleep(check_interval)
            waited_time += check_interval
            
            found, status = self._check_device_in_list()
            logger.info(t('python.adbManager.authCheckResult', status=status))
            
            if found and status == 'device':
                logger.info(t('python.adbManager.deviceAuthorized', device=self.device_name))
                return True, t('python.adbManager.deviceConnectedAndAuthorized')
            elif status == 'unauthorized':
                logger.info(t('python.adbManager.deviceStillUnauthorized'))
            else:
                logger.warning(t('python.adbManager.deviceNotInList', device=self.device_name))
        
        logger.error(t('python.adbManager.deviceAuthTimeout', seconds=max_wait_time))
        return False, t('python.adbManager.deviceAuthTimeoutShort')
    
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
            logger.info(t('python.adbManager.tryingConnectDevice', device=self.device_name))
            
            if self._is_tcp_device():
                return self._connect_tcp_device()
            else:
                return self._connect_usb_device()
                
        except Exception as e:
            logger.warning(t('python.adbManager.adbConnectError', error=e))
            return False, t('python.adbManager.adbConnectError', error=e)
    
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
        
        logger.info(t('python.adbManager.adbConnectStdout', output=stdout))
        if stderr:
            logger.info(t('python.adbManager.adbConnectStderr', output=stderr))
        logger.info(t('python.adbManager.adbConnectReturnCode', code=connect_result.returncode))
        
        if 'connected' in stdout or 'already' in stdout or 'failed to authenticate' in stdout:
            logger.info(t('python.adbManager.deviceConnectResult', output=stdout.strip()))
            
            devices_result = subprocess.run(
                ['adb', 'devices'], 
                capture_output=True, text=True, timeout=5
            )
            
            logger.info(t('python.adbManager.adbDeviceListStdout', output=devices_result.stdout))
            if devices_result.stderr:
                logger.info(t('python.adbManager.adbDeviceListStderr', output=devices_result.stderr))
            
            device_line = device_address
            
            logger.info(t('python.adbManager.disconnectForReauth'))
            disconnect_result = subprocess.run(
                ['adb', 'disconnect', device_address], 
                capture_output=True, text=True, timeout=5
            )
            logger.info(t('python.adbManager.disconnectResult', output=disconnect_result.stdout))
            
            time.sleep(1)
            
            logger.info(t('python.adbManager.reconnectForAuth'))
            reconnect_result = subprocess.run(
                ['adb', 'connect', device_address], 
                capture_output=True, text=True, timeout=10
            )
            logger.info(t('python.adbManager.reconnectResult', output=reconnect_result.stdout))
            
            devices_result = subprocess.run(
                ['adb', 'devices'], 
                capture_output=True, text=True, timeout=5
            )
            logger.info(t('python.adbManager.reconnectDeviceListStdout', output=devices_result.stdout))
            
            if device_line in devices_result.stdout:
                if 'unauthorized' in devices_result.stdout or 'failed to authenticate' in stdout:
                    logger.warning(t('python.adbManager.deviceUnauthorized', device=self.device_name))
                    return self._wait_for_usb_authorization()
                else:
                    logger.info(t('python.adbManager.deviceAuthorized', device=self.device_name))
                    return True, t('python.adbManager.deviceConnectedAndAuthorized')
            else:
                logger.warning(t('python.adbManager.deviceNotInList', device=self.device_name))
                return False, t('python.adbManager.deviceNotInListShort')
                
        elif 'cannot connect' in stdout or '目标计算机积极拒绝' in stdout or '10061' in stdout:
            logger.warning(t('python.adbManager.deviceConnectionRefused', device=self.device_name))
            return False, t('python.adbManager.deviceConnectionRefusedShort')
        else:
            logger.warning(t('python.adbManager.deviceConnectionFailed', device=self.device_name))
            return False, t('python.adbManager.deviceConnectionFailedShort')
    
    def _connect_usb_device(self) -> Tuple[bool, str]:
        """
        连接USB设备
        
        USB设备通过物理连接已被ADB识别，无需执行adb connect。
        直接检查设备是否在adb devices列表中即可。
        
        Returns:
            Tuple[bool, str]: (连接是否成功, 连接状态信息)
        """
        logger.info(t('python.adbManager.usbDeviceDetected'))
        
        found, status = self._check_device_in_list()
        
        if found and status == 'device':
            logger.info(t('python.adbManager.usbDeviceAuthorized', device=self.device_name))
            return True, t('python.adbManager.deviceConnectedAndAuthorized')
        elif status == 'unauthorized':
            logger.warning(t('python.adbManager.usbDeviceUnauthorized', device=self.device_name))
            return self._wait_for_usb_authorization()
        elif status == 'offline':
            logger.warning(t('python.adbManager.usbDeviceOffline', device=self.device_name))
            return False, t('python.adbManager.usbDeviceOfflineReplug')
        else:
            logger.warning(t('python.adbManager.usbDeviceNotInList', device=self.device_name))
            logger.info(t('python.adbManager.checkUsbConnection'))
            return False, t('python.adbManager.usbDeviceNotInListCheck')
    
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
                "message": t('python.adbManager.deviceUnauthorizedDialog', device=self.device_name)
            }
            
            with open(dialog_trigger_file, 'w', encoding='utf-8') as f:
                json.dump(dialog_data, f, ensure_ascii=False, indent=2)
            
            logger.info(t('python.adbManager.unauthorizedDialogFileCreated', path=dialog_trigger_file))
            
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
            logger.warning(t('python.adbManager.showUnauthorizedDialogFailed', error=e))
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
                    logger.info(t('python.adbManager.appRunningInForeground'))
                    return True, None
                else:
                    logger.info(t('python.adbManager.appNotInForeground'))
                    return False, None
            else:
                logger.warning(t('python.adbManager.cannotCheckAppStatus'))
                return False, t('python.adbManager.cannotCheckAppStatus')
                
        except Exception as e:
            logger.warning(t('python.adbManager.checkAppStatusError', error=e))
            return False, t('python.adbManager.checkAppStatusError', error=e)
    
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
                logger.info(t('python.adbManager.appForceStopped'))
                return True
            else:
                logger.warning(t('python.adbManager.appForceStopFailed'))
                return False
                
        except Exception as e:
            logger.warning(t('python.adbManager.appForceStopError', error=e))
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
                logger.info(t('python.adbManager.appRunningForceStop'))
                if self.force_stop_app():
                    time.sleep(wait_time)
                    return True
                else:
                    return False
            else:
                if error_msg:
                    logger.warning(t('python.adbManager.checkAppStatusError', error=error_msg))
                else:
                    logger.info(t('python.adbManager.appNotRunningNoNeedToClose'))
                return True
                
        except Exception as e:
            logger.warning(t('python.adbManager.ensureAppClosedError', error=e))
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
                    logger.info(t('python.adbManager.bluetoothEnabled'))
                    return True, None
                else:
                    logger.warning(t('python.adbManager.bluetoothNotEnabled'))
                    return False, t('python.adbManager.bluetoothNotEnabled')
            else:
                logger.warning(t('python.adbManager.cannotCheckBluetooth'))
                return False, t('python.adbManager.cannotCheckBluetooth')
                
        except Exception as e:
            logger.warning(t('python.adbManager.checkBluetoothError', error=e))
            return False, t('python.adbManager.checkBluetoothError', error=e)
    
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
                logger.info(t('python.adbManager.bluetoothEnableCommandSuccess'))
                # 等待蓝牙开启
                time.sleep(3)
                return True
            else:
                logger.warning(t('python.adbManager.bluetoothEnableCommandFailed'))
                return False
                
        except Exception as e:
            logger.warning(t('python.adbManager.enableBluetoothError', error=e))
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
                logger.info(t('python.adbManager.bluetoothAlreadyEnabled'))
                return True
            else:
                logger.warning(t('python.adbManager.bluetoothNotEnabledTrying'))
                if self.enable_bluetooth():
                    # 再次检查蓝牙状态
                    time.sleep(2)
                    bluetooth_enabled, _ = self.check_bluetooth_status()
                    if bluetooth_enabled:
                        logger.info(t('python.adbManager.bluetoothEnableSuccess'))
                        return True
                    else:
                        logger.warning(t('python.adbManager.bluetoothEnableCheckFailed'))
                        return False
                else:
                    logger.warning(t('python.adbManager.bluetoothEnableFailed'))
                    return False
                
        except Exception as e:
            logger.warning(t('python.adbManager.ensureBluetoothError', error=e))
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
                logger.info(t('python.adbManager.gotAppPid', pid=pid))
                return pid
            else:
                logger.warning(t('python.adbManager.appNotRunningOrNoPid', package=self.app_package))
                return None
                
        except Exception as e:
            logger.warning(t('python.adbManager.getAppPidError', error=e))
            return None
    
    def check_crash_logs(self, pid: int | None = None) -> list:
        """
        检查应用的崩溃日志（兼容旧接口，优先从 logcat_monitor 获取）

        Args:
            pid: 应用进程ID（可选，为 None 时按包名过滤）

        Returns:
            list: 崩溃日志列表
        """
        # 优先从 logcat_monitor 获取
        if self._logcat_monitor and self._logcat_monitor.crash_detected:
            full_log = self._logcat_monitor.get_full_log()
            crash_info = self._logcat_monitor.crash_info
            crash_logs = [
                f"[{crash_info['crash_type']}] {crash_info['crash_line']}",
                "--- 完整日志 ---",
                full_log,
            ]
            logger.info(t('python.adbManager.crashLogsFound', count=len(crash_logs)))
            return crash_logs

        # 回退到原有的一次性 dump 方式
        try:
            result = subprocess.run(
                ['adb', '-s', self.device_name, 'shell', f'logcat -d'],
                capture_output=True, text=True, timeout=15
            )

            crash_logs = []
            if result.returncode == 0:
                for line in result.stdout.strip().split('\n'):
                    if not line.strip():
                        continue
                    # 有 PID 时按 PID 过滤
                    if pid and f"{pid}" in line and "E" in line and "AndroidRuntime" in line:
                        crash_logs.append(line.strip())
                    # 无 PID 时按包名 + AndroidRuntime 过滤
                    elif not pid and self.app_package in line and "AndroidRuntime" in line:
                        crash_logs.append(line.strip())
                    # 始终捕获 FATAL EXCEPTION 行
                    elif "FATAL EXCEPTION" in line:
                        crash_logs.append(line.strip())

            logger.info(t('python.adbManager.crashLogsFound', count=len(crash_logs)))
            return crash_logs

        except Exception as e:
            logger.warning(t('python.adbManager.checkCrashLogsError', error=e))
            return []

    def start_logcat_monitor(self, pid: int | None = None, on_crash=None) -> bool:
        """
        启动 logcat 实时监控

        Args:
            pid: 应用进程 ID（可选，为 None 时按包名过滤）
            on_crash: 崩溃回调函数，接收 (crash_type, crash_line, full_log) 参数

        Returns:
            bool: 启动是否成功
        """
        from main.core.logcat_monitor import LogcatMonitor

        if self._logcat_monitor is not None:
            logger.warning(t('python.adbManager.logcatMonitorAlreadyRunning'))
            self.stop_logcat_monitor()

        self._logcat_monitor = LogcatMonitor(
            device_name=self.device_name,
            app_package=self.app_package,
            app_pid=pid,
            on_crash=on_crash,
        )

        success = self._logcat_monitor.start()
        if success:
            logger.info(t('python.adbManager.logcatMonitorStarted', pid=pid))
        else:
            logger.error(t('python.adbManager.logcatMonitorStartFailed'))
            self._logcat_monitor = None

        return success

    def stop_logcat_monitor(self):
        """停止 logcat 实时监控"""
        if self._logcat_monitor is not None:
            self._logcat_monitor.stop()
            self._logcat_monitor = None
            logger.info(t('python.adbManager.logcatMonitorStopped'))

    def get_logcat_full_log(self) -> str:
        """获取 logcat 监控的完整日志

        Returns:
            str: 完整日志文本，未启动监控时返回空字符串
        """
        if self._logcat_monitor is not None:
            return self._logcat_monitor.get_full_log()
        return ''

    def is_crash_detected(self) -> bool:
        """是否检测到崩溃

        Returns:
            bool: 是否检测到致命闪退
        """
        if self._logcat_monitor is not None:
            return self._logcat_monitor.crash_detected
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


def get_connected_devices() -> list:
    """
    获取所有连接的设备列表
    
    Returns:
        list: 设备ID列表
    """
    try:
        logger.info(t('python.adbManager.gettingConnectedDevices'))
        
        # 执行adb devices命令
        result = subprocess.run(
            ['adb', 'devices'], 
            capture_output=True, text=True, timeout=10
        )
        
        logger.info(t('python.adbManager.adbDeviceListStdout', output=result.stdout))
        if result.stderr:
            logger.info(t('python.adbManager.adbDeviceListStderr', output=result.stderr))
        logger.info(t('python.adbManager.adbDeviceListReturnCode', code=result.returncode))
        
        # 解析设备列表
        devices = []
        lines = result.stdout.split('\n')
        
        import re
        
        for line in lines:
            # 匹配设备行，格式如："设备ID    device"
            match = re.match(r'^([^\s]+)\s+device$', line.strip())
            if match:
                devices.append(match.group(1))
        
        logger.info(t('python.adbManager.parsedDeviceList', devices=devices))
        return devices
    except Exception as e:
        logger.error(t('python.adbManager.getDeviceListFailed', error=e))
        return []

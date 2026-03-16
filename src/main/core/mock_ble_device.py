"""
蓝牙设备模块
提供BLE设备的实际串口通信功能
"""
import serial
import logging
import time

logger = logging.getLogger(__name__)


class BLEDevice:
    """
    BLE设备类，用于实际硬件通信
    基于MB026A_BLE模块的实际串口通信实现
    支持蓝牙设备的初始化和数据发送
    """
    def __init__(self, port, baudrate=9600, uuidw=None, uuidn=None, uuids=None, ble_name=None, adv_data=None, response_timeout=5):
        """
        初始化蓝牙设备
        
        Args:
            port: 串口端口号，必须提供
            baudrate: 波特率，默认9600
            uuidw: 写服务UUID (可选)
            uuidn: 读服务UUID (可选)
            uuids: 主服务UUID (可选)
            ble_name: 蓝牙设备名称 (可选)
            adv_data: 自定义广播数据 (可选)
            response_timeout: 响应超时时间（秒），默认5秒
        """
        if not port:
            raise ValueError("必须提供串口端口号")
        
        self.port = port
        self.baudrate = baudrate
        self.ser = None
        self.is_initialized = False
        self.response_timeout = response_timeout
        # UUID参数，初始为None，需要通过AT指令设置
        self.uuidw = uuidw  # 写服务UUID
        self.uuidn = uuidn  # 读服务UUID
        self.uuids = uuids  # 主服务UUID
        # 蓝牙名称和广播数据参数
        self.ble_name = ble_name  # 蓝牙设备名称
        self.adv_data = adv_data  # 自定义广播数据
        logger.info(f"初始化蓝牙设备，端口: {port}，超时设置: {response_timeout}秒")
    
    def _read_response(self):
        """
        响应读取
        
        Returns:
            str: 响应内容，超时返回None
        """
        start_time = time.time()
        while time.time() - start_time < self.response_timeout:
            if self.ser and self.ser.in_waiting > 0:
                response = self.ser.readline().decode().strip()
                if response:
                    return response
            time.sleep(0.1)
        return None
    
    def initialize(self):
        """
        初始化设备，设置蓝牙参数
        
        Returns:
            bool: 初始化是否成功
        """
        try:
            # 打开串口
            self.ser = serial.Serial(self.port, self.baudrate, timeout=1)
            logger.info(f"成功打开串口: {self.port}")
            
            # 检查串口是否成功打开
            if not self.ser or not self.ser.is_open:
                logger.error("串口打开失败")
                return False
                        # 通过AT指令设置蓝牙名称，并检查响应
            if self.ble_name:
                if not self.set_ble_name(self.ble_name):
                    logger.error("蓝牙名称设置失败")
                    return False
            
            # 通过AT指令设置自定义广播数据，并检查响应
            if self.adv_data:
                if not self.set_adv_data(self.adv_data):
                    logger.error("广播数据设置失败")
                    return False
            
            # 如果有UUID参数，则通过AT指令设置，并检查响应
            if self.uuids:
                if not self.set_uuid("UUIDS", self.uuids):
                    logger.error("主服务UUID设置失败")
                    return False
            if self.uuidn:
                if not self.set_uuid("UUIDN", self.uuidn):
                    logger.error("读服务UUID设置失败")
                    return False
            if self.uuidw:
                if not self.set_uuid("UUIDW", self.uuidw):
                    logger.error("写服务UUID设置失败")
                    return False
            
            # 设置完毕后重启设备，确保配置生效
            if not self.reboot_device():
                logger.error("设备重启失败")
                return False
            
            # 开启广播
            if not self.enable_advertising():
                logger.error("广播开启失败")
                return False
            
            self.is_initialized = True
            logger.info("蓝牙设备初始化成功")
            return True
        except PermissionError as e:
            logger.error(f"蓝牙设备初始化失败: 无法打开端口 '{self.port}': {e}")
            logger.error("请检查以下可能的原因：")
            logger.error(f"1. 其他软件（如串口调试助手、设备管理器等）占用了{self.port}端口")
            logger.error(f"2. 请关闭其他软件的串口连接，释放{self.port}端口")
            logger.error(f"3. 检查设备管理器中的串口状态，确保{self.port}端口可用")
            logger.error("4. 尝试重新插拔蓝牙设备，重新识别串口")
            return False
        except Exception as e:
            logger.error(f"蓝牙设备初始化失败: {str(e)}")
            return False
    
    def set_ble_name(self, ble_name):
        """
        通过AT指令设置蓝牙设备名称
        
        Args:
            ble_name: 蓝牙设备名称
            
        Returns:
            bool: 设置是否成功
        """
        try:
            at_command = f"AT+NAME={ble_name}\r\n"
            self.ser.write(at_command.encode())
            logger.info(f"发送AT指令设置蓝牙名称: {at_command.strip()}")
            
            response = self._read_response()
            if response is None:
                logger.error(f"设置蓝牙名称超时（{self.response_timeout}秒内未收到响应）")
                return False
            
            logger.info(f"响应: {response}")
            success = response == "OK"
            
            if success:
                self.ble_name = ble_name
            
            return success
        except Exception as e:
            logger.error(f"设置蓝牙名称失败: {str(e)}")
            return False
    
    def set_adv_data(self, adv_data):
        """
        通过AT指令设置自定义广播数据
        
        Args:
            adv_data: 自定义广播数据，16进制字符串
            
        Returns:
            bool: 设置是否成功
        """
        try:
            at_command = f"AT+AMDATA={adv_data}\r\n"
            self.ser.write(at_command.encode())
            logger.info(f"发送AT指令设置广播数据: {at_command.strip()}")
            
            response = self._read_response()
            if response is None:
                logger.error(f"设置广播数据超时（{self.response_timeout}秒内未收到响应）")
                return False
            
            logger.info(f"响应: {response}")
            success = response == "OK"
            
            if success:
                self.adv_data = adv_data
            
            return success
        except Exception as e:
            logger.error(f"设置广播数据失败: {str(e)}")
            return False
    
    def set_uuid(self, uuid_type, uuid_value):
        """
        通过AT指令设置UUID
        
        Args:
            uuid_type: UUID类型，支持"UUIDS"(主服务), "UUIDN"(读服务), "UUIDW"(写服务)
            uuid_value: UUID值，16bit或128bit格式
            
        Returns:
            bool: 设置是否成功
        """
        try:
            valid_types = ["UUIDS", "UUIDN", "UUIDW"]
            if uuid_type not in valid_types:
                logger.error(f"无效的UUID类型: {uuid_type}，支持的类型: {valid_types}")
                return False
            
            at_command = f"AT+{uuid_type}={uuid_value}\r\n"
            self.ser.write(at_command.encode())
            logger.info(f"发送AT指令: {at_command.strip()}")
            
            response = self._read_response()
            if response is None:
                logger.error(f"设置{uuid_type}超时（{self.response_timeout}秒内未收到响应）")
                return False
            
            logger.info(f"响应: {response}")
            
            if response == "OK":
                if uuid_type == "UUIDS":
                    self.uuids = uuid_value
                elif uuid_type == "UUIDN":
                    self.uuidn = uuid_value
                elif uuid_type == "UUIDW":
                    self.uuidw = uuid_value
                return True
            
            return False
        except Exception as e:
            logger.error(f"设置{uuid_type}失败: {str(e)}")
            return False
    
    def get_uuid(self, uuid_type):
        """
        通过AT指令查询UUID
        
        Args:
            uuid_type: UUID类型，支持"UUIDS"(主服务), "UUIDN"(读服务), "UUIDW"(写服务)
            
        Returns:
            str: UUID值，如果获取失败返回None
        """
        try:
            valid_types = ["UUIDS", "UUIDN", "UUIDW"]
            if uuid_type not in valid_types:
                logger.error(f"无效的UUID类型: {uuid_type}，支持的类型: {valid_types}")
                return None
            
            at_command = f"AT+{uuid_type}?\r\n"
            self.ser.write(at_command.encode())
            logger.info(f"发送AT指令: {at_command.strip()}")
            
            response = self._read_response()
            if response is None:
                logger.error(f"查询{uuid_type}超时（{self.response_timeout}秒内未收到响应）")
                return None
            
            logger.info(f"响应: {response}")
            
            if response.startswith(f"+{uuid_type}:"):
                return response[len(f"+{uuid_type}:"):]
            return None
        except Exception as e:
            logger.error(f"查询{uuid_type}失败: {str(e)}")
            return None
    
    def send_hex_data(self, hex_data):
        """
        发送16进制数据
        
        Args:
            hex_data: 要发送的16进制字符串
            
        Returns:
            bool: 发送是否成功
        """
        try:
            # 移除可能的格式字符，只保留纯16进制字符
            clean_data = ''.join(c for c in hex_data if c in '0123456789ABCDEFabcdef')
            # 转换为字节数据
            byte_data = bytes.fromhex(clean_data)
            
            # 发送数据
            self.ser.write(byte_data)
            logger.info(f"发送数据: {hex_data}")
            
            return True
        except Exception as e:
            logger.error(f"发送数据失败: {str(e)}")
            return False
    
    def enable_advertising(self):
        """
        开启蓝牙广播
        
        Returns:
            bool: 广播开启是否成功
        """
        try:
            adv_command = "AT+ADV=1\r\n"
            self.ser.write(adv_command.encode())
            logger.info(f"发送开启广播指令: {adv_command.strip()}")
            
            response = self._read_response()
            if response is None:
                logger.error(f"开启广播超时（{self.response_timeout}秒内未收到响应）")
                return False
            
            logger.info(f"响应: {response}")
            
            if response == "OK":
                logger.info("蓝牙广播开启成功")
                return True
            else:
                logger.error(f"广播开启失败，响应: {response}")
                return False
        except Exception as e:
            logger.error(f"广播开启失败: {str(e)}")
            return False
    
    def reboot_device(self):
        """
        重启设备，确保配置生效
        
        Returns:
            bool: 重启是否成功
        """
        try:
            reboot_command = "AT+REBOOT=1\r\n"
            self.ser.write(reboot_command.encode())
            logger.info(f"发送设备重启指令: {reboot_command.strip()}")
            
            # 读取第一行响应（OK）
            response1 = self._read_response()
            if response1 is None:
                logger.error(f"设备重启超时（{self.response_timeout}秒内未收到第一行响应）")
                return False
            logger.info(f"重启指令第一行响应: {response1}")
            
            # 读取第二行响应（+READY）
            response2 = self._read_response()
            if response2 is None:
                logger.error(f"设备重启超时（{self.response_timeout}秒内未收到第二行响应）")
                return False
            logger.info(f"重启指令第二行响应: {response2}")
            
            if response1 == "OK" and response2 == "+READY":
                logger.info("设备重启成功")
                return True
            else:
                logger.error(f"设备重启响应异常: 第一行='{response1}', 第二行='{response2}'")
                return False
        except Exception as e:
            logger.error(f"设备重启失败: {str(e)}")
            return False
    
    def close(self):
        """
        关闭设备连接
        """
        if self.ser and self.ser.is_open:
            self.ser.close()
            logger.info("串口已关闭")

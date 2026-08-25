"""
蓝牙设备模块
提供BLE设备的实际串口通信功能
"""

import logging
import time

import serial

logger = logging.getLogger(__name__)


class BLEDevice:
    """
    BLE设备类，用于实际硬件通信
    基于MB026A_BLE模块的实际串口通信实现
    支持蓝牙设备的初始化和数据发送
    """

    def __init__(
        self,
        port,
        baudrate=9600,
        uuidw=None,
        uuidn=None,
        uuids=None,
        ble_name=None,
        adv_data=None,
        response_timeout=5,
        serial_factory=None,
    ):
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
            serial_factory: 串口工厂函数 (可选, 测试注入), 默认 None 时用 serial.Serial
        """
        if not port:
            raise ValueError("必须提供串口端口号")

        self.port = port
        self.baudrate = baudrate
        self.ser = None
        self.is_initialized = False
        self.response_timeout = response_timeout
        # 串口工厂: 默认用 serial.Serial, 测试可注入 fake
        self._serial_factory = serial_factory
        # UUID参数，初始为None，需要通过AT指令设置
        self.uuidw = uuidw  # 写服务UUID
        self.uuidn = uuidn  # 读服务UUID
        self.uuids = uuids  # 主服务UUID
        # 蓝牙名称和广播数据参数
        self.ble_name = ble_name  # 蓝牙设备名称
        self.adv_data = adv_data  # 自定义广播数据
        logger.info(f"初始化蓝牙设备，端口: {port}，超时设置: {response_timeout}秒")

    def _write_at(self, command: str) -> None:
        """写 AT 指令 (加 \\r\\n 后缀如未含, encode, log)"""
        if not command.endswith("\r\n"):
            command = command + "\r\n"
        self.ser.write(command.encode())
        logger.info(f"发送AT指令: {command.strip()}")

    def _read_n_lines(self, n: int):
        """读 n 行响应, 每行独立 response_timeout 预算, 任一超时返 None

        Args:
            n: 读取行数

        Returns:
            list[str] | None: n 行响应列表, 任一行超时返 None
        """
        lines = []
        for _ in range(n):
            start_time = time.time()
            line = None
            while time.time() - start_time < self.response_timeout:
                raw = self.ser.readline()
                if raw:
                    decoded = raw.decode().strip()
                    if decoded:
                        line = decoded
                        break
                time.sleep(0.1)
            if line is None:
                return None
            lines.append(line)
        return lines

    def _transaction(self, command: str, read_lines: int = 1, parse_prefix=None):
        """AT 事务: _write_at + _read_n_lines 编排

        Args:
            command: AT 命令字符串 (不含 \\r\\n)
            read_lines: 读取响应行数 (1=ok模式, 2=ready模式)
            parse_prefix: 非 None 时为 query 模式, 解析前缀返回值

        Returns:
            tuple[bool, str | None]:
            - ok 模式: (首行=="OK", None)
            - ready 模式: (lines[0]=="OK" and lines[1]=="+READY", None)
            - query 模式: (首行 startswith prefix, 去前缀值或 None)
            - 超时/异常: (False, None)
        """
        try:
            self._write_at(command)
            lines = self._read_n_lines(read_lines)
            if lines is None:
                logger.error(f"AT 事务超时 (命令: {command.strip()})")
                return (False, None)

            if parse_prefix is not None:
                # query 模式
                first = lines[0]
                if first.startswith(parse_prefix):
                    value = first[len(parse_prefix) :]
                    logger.info(f"响应: {first}")
                    return (True, value)
                logger.error(f"响应不含前缀 {parse_prefix}: {first}")
                return (False, None)

            # ok / ready 模式
            if read_lines == 2:
                success = lines[0] == "OK" and lines[1] == "+READY"
                if not success:
                    logger.error(f"响应异常: {lines}")
                return (success, None)

            # read_lines == 1 (ok)
            logger.info(f"响应: {lines[0]}")
            return (lines[0] == "OK", None)
        except Exception as e:
            logger.error(f"AT 事务异常 (命令: {command.strip()}): {e}")
            return (False, None)

    def initialize(self):
        """
        初始化设备，设置蓝牙参数

        Returns:
            bool: 初始化是否成功
        """
        try:
            # 打开串口 (用 serial_factory, 默认 serial.Serial, 测试可注入)
            factory = self._serial_factory or (lambda: serial.Serial(self.port, self.baudrate, timeout=1))
            self.ser = factory()
            logger.info(f"成功打开串口: {self.port}")

            # 检查串口是否成功打开
            if not self.ser or not self.ser.is_open:
                logger.error("串口打开失败")
                self.close()
                return False
                # 通过AT指令设置蓝牙名称，并检查响应
            if self.ble_name:
                if not self.set_ble_name(self.ble_name):
                    logger.error("蓝牙名称设置失败")
                    self.close()
                    return False

            # 通过AT指令设置自定义广播数据，并检查响应
            if self.adv_data:
                if not self.set_adv_data(self.adv_data):
                    logger.error("广播数据设置失败")
                    self.close()
                    return False

            # 如果有UUID参数，则通过AT指令设置，并检查响应
            if self.uuids:
                if not self.set_uuid("UUIDS", self.uuids):
                    logger.error("主服务UUID设置失败")
                    self.close()
                    return False
            if self.uuidn:
                if not self.set_uuid("UUIDN", self.uuidn):
                    logger.error("读服务UUID设置失败")
                    self.close()
                    return False
            if self.uuidw:
                if not self.set_uuid("UUIDW", self.uuidw):
                    logger.error("写服务UUID设置失败")
                    self.close()
                    return False

            # 设置完毕后重启设备，确保配置生效
            if not self.reboot_device():
                logger.error("设备重启失败")
                self.close()
                return False

            # 开启广播
            if not self.enable_advertising():
                logger.error("广播开启失败")
                self.close()
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
        """通过AT指令设置蓝牙设备名称, 成功时更新 self.ble_name"""
        success, _ = self._transaction(f"AT+NAME={ble_name}")
        if success:
            self.ble_name = ble_name
        return success

    def set_adv_data(self, adv_data):
        """通过AT指令设置自定义广播数据, 成功时更新 self.adv_data"""
        success, _ = self._transaction(f"AT+AMDATA={adv_data}")
        if success:
            self.adv_data = adv_data
        return success

    def set_uuid(self, uuid_type, uuid_value):
        """通过AT指令设置UUID (UUIDS/UUIDN/UUIDW), 成功时更新对应字段"""
        valid_types = ["UUIDS", "UUIDN", "UUIDW"]
        if uuid_type not in valid_types:
            logger.error(f"无效的UUID类型: {uuid_type}，支持的类型: {valid_types}")
            return False
        success, _ = self._transaction(f"AT+{uuid_type}={uuid_value}")
        if success:
            if uuid_type == "UUIDS":
                self.uuids = uuid_value
            elif uuid_type == "UUIDN":
                self.uuidn = uuid_value
            elif uuid_type == "UUIDW":
                self.uuidw = uuid_value
        return success

    def get_uuid(self, uuid_type):
        """通过AT指令查询UUID, 返回值或 None"""
        valid_types = ["UUIDS", "UUIDN", "UUIDW"]
        if uuid_type not in valid_types:
            logger.error(f"无效的UUID类型: {uuid_type}，支持的类型: {valid_types}")
            return None
        success, value = self._transaction(f"AT+{uuid_type}?", parse_prefix=f"+{uuid_type}:")
        return value if success else None

    def send_hex_data(self, hex_data):
        """发送16进制数据 (清洗非hex字符 + bytes 写, 不读响应)"""
        try:
            clean_data = "".join(c for c in hex_data if c in "0123456789ABCDEFabcdef")
            if not clean_data:
                logger.error(f"无效的16进制数据: {hex_data}")
                return False
            byte_data = bytes.fromhex(clean_data)
            self.ser.write(byte_data)
            logger.info(f"发送数据: {hex_data}")
            return True
        except Exception as e:
            logger.error(f"发送数据失败: {str(e)}")
            return False

    def enable_advertising(self):
        """开启蓝牙广播"""
        return self._transaction("AT+ADV=1")[0]

    def reboot_device(self):
        """重启设备, 响应 [OK, +READY] 视为成功"""
        return self._transaction("AT+REBOOT=1", read_lines=2)[0]

    def close(self):
        """
        关闭设备连接
        """
        if self.ser and self.ser.is_open:
            self.ser.close()
            logger.info("串口已关闭")

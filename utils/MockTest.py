import serial
import time
import re


class MB026A_BLE:
    def __init__(self, port, baudrate=9600, timeout=1):
        self.ser = serial.Serial(port, baudrate, timeout=timeout)
        self._init_module()

    def _init_module(self):
        """初始化模块：重启并等待READY"""
        print("初始化模块...")

        # 先清空输入缓冲区
        self.ser.reset_input_buffer()

        # 发送重启命令
        self.ser.write(b"AT+REBOOT=1\r\n")
        time.sleep(0.1)

        # 等待重启完成和READY信号
        self._wait_for_ready()

    def _send_at_command(self, command, wait_for_response=True):
        """发送 AT 指令并返回响应"""
        # 清空输入缓冲区，避免读取到之前的响应
        self.ser.reset_input_buffer()

        self.ser.write((command + '\r\n').encode())
        if not wait_for_response:
            return None

        # 等待响应
        time.sleep(0.2)
        response = self.ser.read_all().decode().strip()
        print(f"发送: {command} -> 收到: {response}")  # 调试信息
        return response

    def _wait_for_ready(self):
        """等待模块返回 +READY"""
        print("等待模块启动...")
        start_time = time.time()
        while time.time() - start_time < 10:  # 最多等待10秒
            if self.ser.in_waiting:
                line = self.ser.readline().decode().strip()
                print(f"启动过程收到: {line}")  # 调试信息
                if line == "+READY":
                    print("模块已就绪")
                    return
                elif "OK" in line:
                    # 重启命令的响应
                    continue
            time.sleep(0.1)
        print("警告: 未在超时时间内收到 +READY，但继续执行...")

    def _parse_response(self, response, prefix):
        """从响应中提取值"""
        if not response:
            return None
        # 转义前缀中的特殊字符
        escaped_prefix = re.escape(prefix)
        match = re.search(rf"{escaped_prefix}:(.+)", response)
        return match.group(1) if match else None

    def _check_ok(self, response):
        """检查响应是否为OK"""
        return "OK" in response if response else False

    # ========== GET 方法 ==========

    def get_mac(self):
        """查询 MAC 地址"""
        resp = self._send_at_command("AT+MAC?")
        return self._parse_response(resp, "+MAC")

    def get_name(self):
        """查询设备名称"""
        resp = self._send_at_command("AT+NAME?")
        return self._parse_response(resp, "+NAME")

    def get_adv_status(self):
        """查询广播状态"""
        resp = self._send_at_command("AT+ADV?")
        return self._parse_response(resp, "+ADV")

    def get_uart_baudrate(self):
        """查询串口波特率"""
        resp = self._send_at_command("AT+UART?")
        return self._parse_response(resp, "+UART")

    def get_connected_devices(self):
        """查询已连接设备"""
        resp = self._send_at_command("AT+DEV?")
        # 返回所有包含+DEV的行
        if resp:
            return [line for line in resp.split('\r\n') if line.startswith('+DEV')]
        return []

    def get_adv_interval(self):
        """查询广播间隔"""
        resp = self._send_at_command("AT+AINTVL?")
        return self._parse_response(resp, "+AINTVL")

    def get_version(self):
        """查询软件版本"""
        resp = self._send_at_command("AT+VER?")
        return self._parse_response(resp, "+VER")

    def get_tx_power(self):
        """查询发射功率"""
        resp = self._send_at_command("AT+TXPOWER?")
        return self._parse_response(resp, "+TXPOWER")

    def get_main_service_uuid(self):
        """查询主服务 UUID"""
        resp = self._send_at_command("AT+UUIDS?")
        return self._parse_response(resp, "+UUIDS")

    def get_read_service_uuid(self):
        """查询读服务 UUID"""
        resp = self._send_at_command("AT+UUIDN?")
        return self._parse_response(resp, "+UUIDN")

    def get_write_service_uuid(self):
        """查询写服务 UUID"""
        resp = self._send_at_command("AT+UUIDW?")
        return self._parse_response(resp, "+UUIDW")

    def get_custom_adv_data(self):
        """查询自定义广播数据"""
        resp = self._send_at_command("AT+AMDATA?")
        return self._parse_response(resp, "+AMDATA")

    # ========== SET 方法 ==========

    def set_mac(self, mac):
        """设置 MAC 地址（重启生效）"""
        resp = self._send_at_command(f"AT+MAC={mac}")
        return self._check_ok(resp)

    def set_name(self, name):
        """设置设备名称（立即生效）"""
        resp = self._send_at_command(f"AT+NAME={name}")
        return self._check_ok(resp)

    def set_adv_status(self, status):
        """设置广播状态（0=关闭，1=开启）"""
        resp = self._send_at_command(f"AT+ADV={status}")
        return self._check_ok(resp)

    def set_uart_baudrate(self, baud_index):
        """设置串口波特率（0=9600, 1=14400, ...）"""
        resp = self._send_at_command(f"AT+UART={baud_index}")
        return self._check_ok(resp)

    def disconnect(self, mode):
        """断开蓝牙连接（0=断开所有从设备，1=断开主设备）"""
        resp = self._send_at_command(f"AT+DISCONN={mode}")
        return self._check_ok(resp)

    def set_adv_interval(self, interval_ms):
        """设置广播间隔（20-10000ms，重启生效）"""
        resp = self._send_at_command(f"AT+AINTVL={interval_ms}")
        return self._check_ok(resp)

    def reset_to_factory(self):
        """恢复出厂设置（重启生效）"""
        resp = self._send_at_command("AT+RESET=1")
        if self._check_ok(resp):
            # 恢复出厂设置后需要重启
            time.sleep(1)
            self._init_module()
            return True
        return False

    def reboot(self):
        """重启模块"""
        resp = self._send_at_command("AT+REBOOT=1")
        if self._check_ok(resp):
            # 等待重启完成
            time.sleep(2)
            self._wait_for_ready()
            return True
        return False

    def set_tx_power(self, power_level):
        """设置发射功率（0-9）"""
        resp = self._send_at_command(f"AT+TXPOWER={power_level}")
        return self._check_ok(resp)

    def set_main_service_uuid(self, uuid):
        """设置主服务 UUID（重启生效）"""
        resp = self._send_at_command(f"AT+UUIDS={uuid}")
        return self._check_ok(resp)

    def set_read_service_uuid(self, uuid):
        """设置读服务 UUID（重启生效）"""
        resp = self._send_at_command(f"AT+UUIDN={uuid}")
        return self._check_ok(resp)

    def set_write_service_uuid(self, uuid):
        """设置写服务 UUID（重启生效）"""
        resp = self._send_at_command(f"AT+UUIDW={uuid}")
        return self._check_ok(resp)

    def set_custom_adv_data(self, hex_data):
        """设置自定义广播数据"""
        resp = self._send_at_command(f"AT+AMDATA={hex_data}")
        return self._check_ok(resp)

    def close(self):
        """关闭串口"""
        if self.ser and self.ser.is_open:
            self.ser.close()


# ========== 使用示例 ==========
if __name__ == "__main__":
    try:
        # 请替换为实际串口号，如 "COM3" 或 "/dev/ttyUSB0"
        ble = MB026A_BLE("COM7", 9600)

        # 获取模块信息
        print("MAC:", ble.get_mac())
        print("设备名称:", ble.get_name())
        print("广播状态:", ble.get_adv_status())
        print("广播间隔:", ble.get_adv_interval())
        print("发射功率:", ble.get_tx_power())
        print("软件版本:", ble.get_version())

    except serial.SerialException as e:
        print(f"串口错误: {e}")
    except Exception as e:
        print(f"其他错误: {e}")
    finally:
        if 'ble' in locals():
            ble.close()
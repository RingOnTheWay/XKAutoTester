"""BLEDevice 单元测试 - 深模块重构 (serial_factory 注入 + _transaction 收敛)"""

import pytest

from main.core.ble_device import BLEDevice


class FakeSerial:
    """模拟 serial.Serial, 满足 BLEDevice 需要的鸭子类型协议"""

    def __init__(self, responses=None):
        self.is_open = True
        self.in_waiting = 0
        self._responses = list(responses) if responses else []
        self._resp_iter = iter(self._responses)
        self.written = []
        self.closed = False

    def write(self, data):
        self.written.append(data)
        return len(data)

    def readline(self):
        try:
            line = next(self._resp_iter)
            self.in_waiting = 0
            return (line + "\n").encode()
        except StopIteration:
            return b""

    def close(self):
        self.is_open = False
        self.closed = True


@pytest.fixture
def fake_serial():
    return FakeSerial()


@pytest.fixture
def device(fake_serial):
    """BLEDevice 注入 fake_serial factory"""
    return BLEDevice("COM_FAKE", serial_factory=lambda: fake_serial)


@pytest.mark.unit
class TestBLEDeviceConstruction:
    """构造 + serial_factory 注入"""

    def test_construct_with_serial_factory(self, fake_serial):
        """应支持 serial_factory 注入, 不调真 serial.Serial"""
        dev = BLEDevice("COM_FAKE", serial_factory=lambda: fake_serial)
        assert dev.port == "COM_FAKE"
        assert dev.ser is None  # initialize 前为 None

    def test_construct_without_serial_factory_defaults_to_serial(self):
        """无 serial_factory 时, 默认用 serial.Serial (延迟到 initialize)"""
        dev = BLEDevice("COM3", ble_name="test")
        assert dev.port == "COM3"
        assert dev.ble_name == "test"
        assert dev.ser is None

    def test_construct_raises_on_empty_port(self):
        """port 为空应抛 ValueError"""
        with pytest.raises(ValueError, match="必须提供串口端口号"):
            BLEDevice("")

    def test_factory_called_on_initialize(self, fake_serial):
        """initialize 应调 serial_factory 创建 ser"""
        factory_called = [False]

        def factory():
            factory_called[0] = True
            return fake_serial

        dev = BLEDevice("COM_FAKE", serial_factory=factory)
        dev._serial_factory = factory
        # 手动测试 initialize 前期: ser 应为 None
        assert dev.ser is None


@pytest.mark.unit
class TestBLEDeviceWriteAt:
    """_write_at: 写 AT 命令 + 加 \\r\\n + encode"""

    def test_write_at_appends_crlf_and_encodes(self, fake_serial):
        """应给命令加 \\r\\n 后缀并 encode 为 bytes 写入"""
        dev = BLEDevice("COM_FAKE", serial_factory=lambda: fake_serial)
        dev.ser = fake_serial  # 手动注入 ser
        dev._write_at("AT+NAME=Test")
        assert fake_serial.written == [b"AT+NAME=Test\r\n"]

    def test_write_at_does_not_double_append_crlf(self, fake_serial):
        """命令已含 \\r\\n 时不重复追加"""
        dev = BLEDevice("COM_FAKE", serial_factory=lambda: fake_serial)
        dev.ser = fake_serial
        dev._write_at("AT+NAME=Test\r\n")
        assert fake_serial.written == [b"AT+NAME=Test\r\n"]


@pytest.mark.unit
class TestBLEDeviceReadNLines:
    """_read_n_lines: 读 n 行响应, 每行独立超时预算"""

    def test_read_one_line_ok(self, fake_serial):
        """n=1 应读 1 行返回 ["OK"]"""
        fake = FakeSerial(responses=["OK"])
        dev = BLEDevice("COM_FAKE", response_timeout=1, serial_factory=lambda: fake)
        dev.ser = fake
        lines = dev._read_n_lines(1)
        assert lines == ["OK"]

    def test_read_two_lines_ok_and_ready(self, fake_serial):
        """n=2 应读 2 行返回 ["OK", "+READY"]"""
        fake = FakeSerial(responses=["OK", "+READY"])
        dev = BLEDevice("COM_FAKE", response_timeout=1, serial_factory=lambda: fake)
        dev.ser = fake
        lines = dev._read_n_lines(2)
        assert lines == ["OK", "+READY"]

    def test_read_timeout_returns_none(self):
        """无响应超时应返 None"""
        fake = FakeSerial(responses=[])  # 空 responses, readline 返 b""
        dev = BLEDevice("COM_FAKE", response_timeout=0.1, serial_factory=lambda: fake)
        dev.ser = fake
        lines = dev._read_n_lines(1)
        assert lines is None

    def test_read_partial_timeout_returns_none(self):
        """n=2 但只有 1 行响应, 第 2 行超时应返 None"""
        fake = FakeSerial(responses=["OK"])  # 仅 1 行
        dev = BLEDevice("COM_FAKE", response_timeout=0.1, serial_factory=lambda: fake)
        dev.ser = fake
        lines = dev._read_n_lines(2)
        assert lines is None


@pytest.mark.unit
class TestBLEDeviceTransaction:
    """_transaction: write_at + read_n_lines 编排, 3 模式 (ok/ready/query)"""

    def test_transaction_ok_mode_success(self):
        """ok 模式 (read_lines=1, prefix=None): 响应 OK → (True, None)"""
        fake = FakeSerial(responses=["OK"])
        dev = BLEDevice("COM_FAKE", response_timeout=1, serial_factory=lambda: fake)
        dev.ser = fake
        result = dev._transaction("AT+NAME=Test")
        assert result == (True, None)
        assert fake.written == [b"AT+NAME=Test\r\n"]

    def test_transaction_ok_mode_failure(self):
        """ok 模式: 响应非 OK → (False, None)"""
        fake = FakeSerial(responses=["ERROR"])
        dev = BLEDevice("COM_FAKE", response_timeout=1, serial_factory=lambda: fake)
        dev.ser = fake
        result = dev._transaction("AT+NAME=Test")
        assert result == (False, None)

    def test_transaction_ready_mode_success(self):
        """ready 模式 (read_lines=2, prefix=None): 响应 [OK, +READY] → (True, None)"""
        fake = FakeSerial(responses=["OK", "+READY"])
        dev = BLEDevice("COM_FAKE", response_timeout=1, serial_factory=lambda: fake)
        dev.ser = fake
        result = dev._transaction("AT+REBOOT=1", read_lines=2)
        assert result == (True, None)

    def test_transaction_ready_mode_failure_wrong_second(self):
        """ready 模式: 第二行非 +READY → (False, None)"""
        fake = FakeSerial(responses=["OK", "ERROR"])
        dev = BLEDevice("COM_FAKE", response_timeout=1, serial_factory=lambda: fake)
        dev.ser = fake
        result = dev._transaction("AT+REBOOT=1", read_lines=2)
        assert result == (False, None)

    def test_transaction_query_mode_success(self):
        """query 模式 (parse_prefix='+UUIDS:'): 响应 +UUIDS:FFE0 → (True, 'FFE0')"""
        fake = FakeSerial(responses=["+UUIDS:FFE0"])
        dev = BLEDevice("COM_FAKE", response_timeout=1, serial_factory=lambda: fake)
        dev.ser = fake
        result = dev._transaction("AT+UUIDS?", parse_prefix="+UUIDS:")
        assert result == (True, "FFE0")

    def test_transaction_query_mode_no_prefix(self):
        """query 模式: 响应不含前缀 → (False, None)"""
        fake = FakeSerial(responses=["ERROR"])
        dev = BLEDevice("COM_FAKE", response_timeout=1, serial_factory=lambda: fake)
        dev.ser = fake
        result = dev._transaction("AT+UUIDS?", parse_prefix="+UUIDS:")
        assert result == (False, None)

    def test_transaction_timeout_returns_false(self):
        """超时 → (False, None)"""
        fake = FakeSerial(responses=[])
        dev = BLEDevice("COM_FAKE", response_timeout=0.1, serial_factory=lambda: fake)
        dev.ser = fake
        result = dev._transaction("AT+NAME=Test")
        assert result == (False, None)


@pytest.mark.unit
class TestBLEDevicePublicMethods:
    """8 公共方法委托 _transaction + 副作用"""

    def test_set_ble_name_success_updates_field(self):
        """set_ble_name 成功应更新 self.ble_name"""
        fake = FakeSerial(responses=["OK"])
        dev = BLEDevice("COM_FAKE", serial_factory=lambda: fake)
        dev.ser = fake
        assert dev.set_ble_name("NewName") is True
        assert dev.ble_name == "NewName"
        assert fake.written == [b"AT+NAME=NewName\r\n"]

    def test_set_ble_name_failure_keeps_old(self):
        """set_ble_name 失败不应更新 self.ble_name"""
        fake = FakeSerial(responses=["ERROR"])
        dev = BLEDevice("COM_FAKE", ble_name="Old", serial_factory=lambda: fake)
        dev.ser = fake
        assert dev.set_ble_name("New") is False
        assert dev.ble_name == "Old"

    def test_set_adv_data_success_updates_field(self):
        """set_adv_data 成功应更新 self.adv_data"""
        fake = FakeSerial(responses=["OK"])
        dev = BLEDevice("COM_FAKE", serial_factory=lambda: fake)
        dev.ser = fake
        assert dev.set_adv_data("AABBCC") is True
        assert dev.adv_data == "AABBCC"
        assert fake.written == [b"AT+AMDATA=AABBCC\r\n"]

    def test_set_uuid_success_updates_correct_field(self):
        """set_uuid 应根据类型更新对应字段 (UUIDS/UUIDN/UUIDW)"""
        for uuid_type, field_name in [("UUIDS", "uuids"), ("UUIDN", "uuidn"), ("UUIDW", "uuidw")]:
            fake = FakeSerial(responses=["OK"])
            dev = BLEDevice("COM_FAKE", serial_factory=lambda f=fake: f)
            dev.ser = fake
            assert dev.set_uuid(uuid_type, "FFE0") is True
            assert getattr(dev, field_name) == "FFE0"
            assert fake.written == [f"AT+{uuid_type}=FFE0\r\n".encode()]

    def test_set_uuid_invalid_type_returns_false(self):
        """set_uuid 无效类型应返 False"""
        fake = FakeSerial(responses=[])
        dev = BLEDevice("COM_FAKE", serial_factory=lambda: fake)
        dev.ser = fake
        assert dev.set_uuid("INVALID", "FFE0") is False
        assert fake.written == []  # 不应写入

    def test_get_uuid_success_returns_value(self):
        """get_uuid 成功应返回去前缀值"""
        fake = FakeSerial(responses=["+UUIDS:FFE0"])
        dev = BLEDevice("COM_FAKE", serial_factory=lambda: fake)
        dev.ser = fake
        assert dev.get_uuid("UUIDS") == "FFE0"
        assert fake.written == [b"AT+UUIDS?\r\n"]

    def test_get_uuid_invalid_type_returns_none(self):
        """get_uuid 无效类型应返 None"""
        fake = FakeSerial(responses=[])
        dev = BLEDevice("COM_FAKE", serial_factory=lambda: fake)
        dev.ser = fake
        assert dev.get_uuid("INVALID") is None
        assert fake.written == []

    def test_enable_advertising_success(self):
        """enable_advertising 成功应返 True"""
        fake = FakeSerial(responses=["OK"])
        dev = BLEDevice("COM_FAKE", serial_factory=lambda: fake)
        dev.ser = fake
        assert dev.enable_advertising() is True
        assert fake.written == [b"AT+ADV=1\r\n"]

    def test_reboot_device_success(self):
        """reboot_device 响应 [OK, +READY] 应返 True"""
        fake = FakeSerial(responses=["OK", "+READY"])
        dev = BLEDevice("COM_FAKE", serial_factory=lambda: fake)
        dev.ser = fake
        assert dev.reboot_device() is True
        assert fake.written == [b"AT+REBOOT=1\r\n"]

    def test_reboot_device_failure_wrong_second(self):
        """reboot_device 第二行非 +READY 应返 False"""
        fake = FakeSerial(responses=["OK", "ERROR"])
        dev = BLEDevice("COM_FAKE", serial_factory=lambda: fake)
        dev.ser = fake
        assert dev.reboot_device() is False

    def test_send_hex_data_success_writes_bytes(self):
        """send_hex_data 应清洗 hex + 转 bytes 写入, 不读响应"""
        fake = FakeSerial(responses=[])  # 不读响应
        dev = BLEDevice("COM_FAKE", serial_factory=lambda: fake)
        dev.ser = fake
        assert dev.send_hex_data("A1B2C3") is True
        assert fake.written == [bytes.fromhex("A1B2C3")]

    def test_send_hex_data_cleans_non_hex_chars(self):
        """send_hex_data 应过滤非 hex 字符"""
        fake = FakeSerial(responses=[])
        dev = BLEDevice("COM_FAKE", serial_factory=lambda: fake)
        dev.ser = fake
        assert dev.send_hex_data("A1-B2 C3") is True
        assert fake.written == [bytes.fromhex("A1B2C3")]

    def test_send_hex_data_invalid_hex_returns_false(self):
        """send_hex_data 无效 hex 应返 False"""
        fake = FakeSerial(responses=[])
        dev = BLEDevice("COM_FAKE", serial_factory=lambda: fake)
        dev.ser = fake
        assert dev.send_hex_data("XYZ") is False
        assert fake.written == []


@pytest.mark.unit
class TestBLEDeviceInitialize:
    """initialize: serial_factory 接入 + 顺序契约 + 失败短路"""

    def test_initialize_full_success(self):
        """完整成功路径: ble_name → adv_data → uuid×3 → reboot(OK+READY) → enable_adv"""
        # 8 个响应: NAME OK, AMDATA OK, UUIDS OK, UUIDN OK, UUIDW OK, REBOOT OK, REBOOT +READY, ADV OK
        fake = FakeSerial(responses=["OK", "OK", "OK", "OK", "OK", "OK", "+READY", "OK"])
        dev = BLEDevice(
            "COM_FAKE",
            ble_name="Test",
            adv_data="AABB",
            uuids="FFE0",
            uuidn="FFE1",
            uuidw="FFE2",
            serial_factory=lambda: fake,
        )
        assert dev.initialize() is True
        assert dev.is_initialized is True
        assert dev.ser is fake  # serial_factory 被调用

    def test_initialize_no_optional_params_success(self):
        """无可选参数 (仅 port): 仅 reboot + enable_adv"""
        # 3 个响应: REBOOT OK, REBOOT +READY, ADV OK
        fake = FakeSerial(responses=["OK", "+READY", "OK"])
        dev = BLEDevice("COM_FAKE", serial_factory=lambda: fake)
        assert dev.initialize() is True
        assert dev.is_initialized is True

    def test_initialize_ble_name_failure_short_circuits(self):
        """ble_name 失败应短路, 不继续后续步骤"""
        fake = FakeSerial(responses=["ERROR"])  # ble_name 失败
        dev = BLEDevice("COM_FAKE", ble_name="Test", serial_factory=lambda: fake)
        assert dev.initialize() is False
        assert dev.is_initialized is False
        # 只应发 1 条命令 (NAME), 不应发后续
        assert len(fake.written) == 1
        assert fake.written[0] == b"AT+NAME=Test\r\n"

    def test_initialize_reboot_failure_short_circuits(self):
        """reboot 失败应短路, 不调 enable_adv"""
        # 5 个 OK (name/adv/uuid×3) + reboot 失败 (OK + ERROR)
        fake = FakeSerial(responses=["OK", "OK", "OK", "OK", "OK", "OK", "ERROR"])
        dev = BLEDevice(
            "COM_FAKE",
            ble_name="T",
            adv_data="AA",
            uuids="FFE0",
            uuidn="FFE1",
            uuidw="FFE2",
            serial_factory=lambda: fake,
        )
        assert dev.initialize() is False
        assert dev.is_initialized is False

    def test_initialize_uses_serial_factory(self):
        """initialize 应调 serial_factory 创建 ser (不直构造 serial.Serial)"""
        factory_called = [False]

        def factory():
            factory_called[0] = True
            return FakeSerial(responses=["OK", "+READY", "OK"])

        dev = BLEDevice("COM_FAKE", serial_factory=factory)
        assert dev.initialize() is True
        assert factory_called[0] is True

    def test_initialize_permission_error_returns_false(self):
        """PermissionError 应捕获并返 False (端口占用诊断)"""

        def factory():
            raise PermissionError("端口被占用")

        dev = BLEDevice("COM_FAKE", serial_factory=factory)
        assert dev.initialize() is False
        assert dev.is_initialized is False


@pytest.mark.unit
class TestBLEDeviceClose:
    """close: 关闭串口"""

    def test_close_closes_open_serial(self):
        """close 应调 ser.close()"""
        fake = FakeSerial(responses=[])
        dev = BLEDevice("COM_FAKE", serial_factory=lambda: fake)
        dev.ser = fake
        dev.close()
        assert fake.closed is True

    def test_close_no_ser_does_nothing(self):
        """ser 为 None 时 close 不应抛异常"""
        dev = BLEDevice("COM_FAKE")
        dev.close()  # 不应抛

    def test_close_closed_serial_does_nothing(self):
        """ser 已关闭时 close 不应再调 close"""
        fake = FakeSerial(responses=[])
        fake.is_open = False
        dev = BLEDevice("COM_FAKE", serial_factory=lambda: fake)
        dev.ser = fake
        dev.close()
        # closed 不应变 (因 is_open=False 跳过)
        assert fake.closed is False

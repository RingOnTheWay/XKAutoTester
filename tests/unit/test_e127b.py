"""Bioland E127B 体温数据帧生成器测试 (P3-11 补覆盖缺口)"""

import pytest

from main.device.bioland.E127B import temperature_bioland_gen


def _parse_frame(hex_str: str) -> list[int]:
    assert len(hex_str) % 2 == 0
    return [int(hex_str[i : i + 2], 16) for i in range(0, len(hex_str), 2)]


@pytest.mark.unit
class TestE127BFrame:
    def test_returns_temperature_and_hex_string(self):
        temp, hex_str = temperature_bioland_gen(temperature=36.5)
        assert temp == 36.5
        assert isinstance(hex_str, str)
        assert len(hex_str) % 2 == 0

    def test_frame_header_and_command(self):
        """帧头 0x55 / 帧长 0x0C / 体温命令 0x03"""
        _, hex_str = temperature_bioland_gen(temperature=36.5)
        frame = _parse_frame(hex_str)
        assert frame[0] == 0x55  # 帧头
        assert frame[1] == 0x0C  # 帧长度
        assert frame[2] == 0x03  # 体温命令

    def test_temperature_encoded_with_factor_100(self):
        """36.5 → int(36.5*100)=3650 → little-endian 0x42 0x0E"""
        _, hex_str = temperature_bioland_gen(temperature=36.5)
        frame = _parse_frame(hex_str)
        temp_lo = frame[9]  # 帧: 头/长/命令/标志/状态/通道/载荷3字节 后为温度 2 字节
        temp_hi = frame[10]
        assert temp_lo == (3650 & 0xFF)  # 0x42
        assert temp_hi == ((3650 >> 8) & 0xFF)  # 0x0E

    def test_checksum_is_sum_and_0xff(self):
        """末字节 = 前 10 字节和 & 0xFF"""
        _, hex_str = temperature_bioland_gen(temperature=37.0)
        frame = _parse_frame(hex_str)
        assert frame[-1] == (sum(frame[:-1]) & 0xFF)

    def test_none_temperature_generates_within_range(self):
        """未指定体温时, 随机值落在 [min_value, max_value] 且按 precision 取整"""
        temp, hex_str = temperature_bioland_gen(min_value=36.0, max_value=37.5, precision=1)
        assert 36.0 <= temp <= 37.5
        assert round(temp, 1) == temp
        assert len(hex_str) == 24  # 12 字节帧 = 24 个 hex 字符

    def test_specified_temperature_out_of_range_still_encoded(self):
        """显式指定温度不做范围钳制 (生成器语义: 用户指定即信任)"""
        temp, _ = temperature_bioland_gen(temperature=40.0)
        assert temp == 40.0

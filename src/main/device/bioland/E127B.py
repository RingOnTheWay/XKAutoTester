# ruff: noqa: N999  # E127B 为设备型号名, 非 PEP8 模块命名
"""
Bioland E127B 体温计设备数据生成器
"""

import random

# ── P3-2: E127B 数据帧协议常量 (原 8 字节魔数无命名, 协议变更难维护) ──
# 帧头/命令/载荷固定段 (来自设备协议文档)
_FRAME_HEADER = 0x55
_FRAME_LENGTH = 0x0C  # 帧长度
_CMD_BODY_TEMP = 0x03  # 体温数据命令
_CMD_FLAG = 0x12  # 命令标志
_STATUS = 0x01
_CHANNEL = 0x01
_TEMP_PAYLOAD_PREFIX = [0x00, 0x00, 0x00]  # 载荷前缀 (含 1 字节温度高位预留)
_TEMP_INT_FACTOR = 100  # 温度 → 整数放大系数 (如 36.5 → 3650)


def temperature_bioland_gen(
    temperature: float | None = None, min_value: float = 36.0, max_value: float = 37.5, precision: int = 1
) -> tuple[float, str]:
    """
    生成Bioland体温计的16进制数据字符串

    Args:
        temperature: 指定的体温值，如果为None则根据范围生成随机体温
        min_value: 随机生成时的最小体温值
        max_value: 随机生成时的最大体温值
        precision: 温度值的小数位数

    Returns:
        tuple: (体温值, 16进制字符串)
    """
    if temperature is None:
        temperature = round(random.uniform(min_value, max_value), precision)

    temp_int = int(temperature * _TEMP_INT_FACTOR)
    temp_bytes = temp_int.to_bytes(2, byteorder="little")

    packet = [
        _FRAME_HEADER,
        _FRAME_LENGTH,
        _CMD_BODY_TEMP,
        _CMD_FLAG,
        _STATUS,
        _CHANNEL,
        *_TEMP_PAYLOAD_PREFIX,
        temp_bytes[0],
        temp_bytes[1],
    ]

    checksum = sum(packet) & 0xFF
    packet.append(checksum)

    hex_str = "".join([f"{byte:02X}" for byte in packet])
    return temperature, hex_str

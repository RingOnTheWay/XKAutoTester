"""
Bioland E127B 体温计设备数据生成器
"""

import random


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

    temp_int = int(temperature * 100)
    temp_bytes = temp_int.to_bytes(2, byteorder="little")

    packet = [0x55, 0x0C, 0x03, 0x12, 0x01, 0x01, 0x00, 0x00, 0x00, temp_bytes[0], temp_bytes[1]]

    checksum = sum(packet) & 0xFF
    packet.append(checksum)

    hex_str = "".join([f"{byte:02X}" for byte in packet])
    return temperature, hex_str

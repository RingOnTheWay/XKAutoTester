import random

def generate_temperature_hex(temperature=None):
    """
    生成体温数据的16进制字符串
    
    Args:
        temperature: 体温值（浮点数），如果为None则生成随机体温
        
    Returns:
        tuple: (体温值, 16进制字符串)
    """
    # 如果未提供温度值，则生成随机体温
    if temperature is None:
        temperature = round(random.uniform(36.0, 37.5), 2)
    
    # 温度值乘以100，转换为整数
    temp_int = int(temperature * 100)
    # 转换为小端序字节
    temp_bytes = temp_int.to_bytes(2, byteorder='little')
    
    # 构建完整数据包
    packet = [
        0x55, 0x0C, 0x03,           # 包头、长度、数据类型
        0x12, 0x01, 0x01, 0x00, 0x00, 0x00,  # 固定数据
        temp_bytes[0], temp_bytes[1] # 温度值字节
    ]
    
    # 计算校验和
    checksum = sum(packet) & 0xFF
    packet.append(checksum)
    
    # 转换为16进制字符串（不带括号和前缀）
    hex_str = "".join([f"{byte:02X}" for byte in packet])
    return temperature, hex_str

# 生成不同范围的体温数据
temperatures = []

# 低温范围 (35.0-36.0°C)
for _ in range(3):
    temp = round(random.uniform(35.0, 36.0), 2)
    temperatures.append(temp)

# 正常范围 (36.1-37.2°C)
for _ in range(4):
    temp = round(random.uniform(36.1, 37.2), 2)
    temperatures.append(temp)

# 发热范围 (37.3-39.0°C)
for _ in range(3):
    temp = round(random.uniform(37.3, 39.0), 2)
    temperatures.append(temp)

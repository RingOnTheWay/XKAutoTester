"""ADB 子包 — 深模块 collaborator 集合。

包含:
- adb_port: AdbResult 值对象 + AdbCommandPort Protocol
- subprocess_adb_adapter: SubprocessAdbAdapter (生产实现)
- device_connection: DeviceConnectionService (USB/TCP/授权)
- app_lifecycle: AppLifecycleService (APP 状态/停止/PID)
- bluetooth_control: BluetoothService (蓝牙状态/开启)
"""

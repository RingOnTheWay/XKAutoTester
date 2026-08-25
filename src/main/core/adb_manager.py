"""ADB 设备管理器 (聚合根) — 持有 3 collaborator + LogcatMonitor lazy 持有。

设计:
- ADBManager(device_name, app_package) 公共签名保持后向兼容
- collaborators kwarg 注入 (测试可注 FakeAdapter)
- 聚合属性化: 调用方通过 .connection / .app / .bluetooth 直接访问 collaborator,
  消除 11 个 pass-through 方法 (Middle Man)
- 保留 LogcatMonitor lazy 持有 + check_crash_logs 双路径 (monitor 优先 + logcat -d 回退)
- 模块级 get_connected_devices() + create_adb_manager() 保持
"""
from __future__ import annotations

import logging

from main.core.adb.adb_port import AdbCommandPort
from main.core.adb.app_lifecycle import AppLifecycleService
from main.core.adb.bluetooth_control import BluetoothService
from main.core.adb.device_connection import DeviceConnectionService
from main.core.adb.subprocess_adb_adapter import SubprocessAdbAdapter
from main.core.logcat.crash_detector import is_crash_line
from main.utils.i18n import t

logger = logging.getLogger(__name__)


class ADBManager:
    """ADB 设备管理器 (聚合根)。

    聚合 3 collaborator (connection/app/bluetooth) + LogcatMonitor lazy 持有。
    调用方通过属性访问 collaborator, 不再经由 pass-through 方法。
    """

    def __init__(
        self,
        device_name: str,
        app_package: str,
        *,
        adapter: AdbCommandPort | None = None,
        collaborators: dict | None = None,
    ) -> None:
        """
        Args:
            device_name: 设备名 (USB 序列号或 IP:端口)
            app_package: APP 包名
            adapter: AdbCommandPort 实现 (默认 SubprocessAdbAdapter)
            collaborators: 注入自定义 collaborator (测试用),键: connection/app/bluetooth
        """
        self.device_name = device_name
        self.app_package = app_package
        self._logcat_monitor = None  # lazy 持有 LogcatMonitor

        self._adb: AdbCommandPort = adapter or SubprocessAdbAdapter()
        c = collaborators or {}
        self._connection: DeviceConnectionService = c.get("connection") or DeviceConnectionService(
            self._adb, device_name
        )
        self._app: AppLifecycleService = c.get("app") or AppLifecycleService(
            self._adb, device_name, app_package
        )
        self._bluetooth: BluetoothService = c.get("bluetooth") or BluetoothService(
            self._adb, device_name
        )

    # === 聚合属性 (调用方直接访问 collaborator, 消除 pass-through) ===

    @property
    def connection(self) -> DeviceConnectionService:
        """设备连接服务 (ADB 服务检查 / 设备连接 / 设备列表)。"""
        return self._connection

    @property
    def app(self) -> AppLifecycleService:
        """APP 生命周期服务 (状态/强停/PID/dumpsys/确保关闭)。"""
        return self._app

    @property
    def bluetooth(self) -> BluetoothService:
        """蓝牙服务 (状态/开启/确保开启)。"""
        return self._bluetooth

    # === Logcat 监控 (lazy 持有 LogcatMonitor, 真实 deep 逻辑) ===

    def check_crash_logs(self, pid: int | None = None) -> list:
        """检查崩溃日志 (兼容旧接口: monitor 优先 + logcat -d 回退)。

        Args:
            pid: 应用 PID (可选,为 None 时按包名过滤)

        Returns:
            list: 崩溃日志行
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
            logger.info(t("python.adbManager.crashLogsFound", count=len(crash_logs)))
            return crash_logs

        # 回退到一次性 dump
        try:
            result = self._adb.execute(
                ["-s", self.device_name, "shell", "logcat -d"],
                timeout=15,
            )
            crash_logs: list[str] = []
            if result.success:
                for line in result.stdout.strip().split("\n"):
                    if not line.strip():
                        continue
                    # 崩溃判定 SSOT: is_crash_line 覆盖 FATAL EXCEPTION/PROCESS_DIED/NATIVE_SIGNAL/ANR
                    if is_crash_line(line):
                        crash_logs.append(line.strip())
                    # 补充上下文捕获: pid/package 过滤的 AndroidRuntime 相关行 (非崩溃模式但有调试价值)
                    elif pid and f"{pid}" in line and "E" in line and "AndroidRuntime" in line:
                        crash_logs.append(line.strip())
                    elif not pid and self.app_package in line and "AndroidRuntime" in line:
                        crash_logs.append(line.strip())
            logger.info(t("python.adbManager.crashLogsFound", count=len(crash_logs)))
            return crash_logs
        except Exception as e:
            logger.warning(t("python.adbManager.checkCrashLogsError", error=e))
            return []

    def start_logcat_monitor(self, pid: int | None = None, on_crash=None) -> bool:
        """启动 logcat 实时监控。

        Args:
            pid: 应用 PID (可选)
            on_crash: 崩溃回调 (crash_type, crash_line, full_log)

        Returns:
            bool: 启动是否成功
        """
        from main.core.logcat_monitor import LogcatMonitor

        if self._logcat_monitor is not None:
            logger.warning(t("python.adbManager.logcatMonitorAlreadyRunning"))
            self.stop_logcat_monitor()

        self._logcat_monitor = LogcatMonitor(
            device_name=self.device_name,
            app_package=self.app_package,
            app_pid=pid,
            on_crash=on_crash,
        )

        success = self._logcat_monitor.start()
        if success:
            logger.info(t("python.adbManager.logcatMonitorStarted", pid=pid))
        else:
            logger.error(t("python.adbManager.logcatMonitorStartFailed"))
            self._logcat_monitor = None
        return success

    def stop_logcat_monitor(self) -> None:
        """停止 logcat 实时监控。"""
        if self._logcat_monitor is not None:
            self._logcat_monitor.stop()
            self._logcat_monitor = None
            logger.info(t("python.adbManager.logcatMonitorStopped"))

    def get_logcat_full_log(self) -> str:
        """获取 logcat 监控的完整日志 (未启动返回空字符串)。"""
        if self._logcat_monitor is not None:
            return self._logcat_monitor.get_full_log()
        return ""

    def is_crash_detected(self) -> bool:
        """是否检测到崩溃。"""
        if self._logcat_monitor is not None:
            return self._logcat_monitor.crash_detected
        return False

    def update_logcat_pid(self, pid: int | None) -> None:
        """更新 logcat 监控的 PID (None 时静默跳过)。"""
        if self._logcat_monitor is None:
            logger.warning(t("python.adbManager.logcatMonitorNotStarted"))
            return
        if pid is None:
            return
        self._logcat_monitor.update_pid(pid)


def create_adb_manager(device_name: str, app_package: str) -> ADBManager:
    """创建 ADBManager 实例的便捷工厂函数。"""
    return ADBManager(device_name, app_package)


def get_connected_devices() -> list:
    """获取所有 'device' 状态的设备 ID 列表 (模块级便捷函数)。"""
    svc = DeviceConnectionService(SubprocessAdbAdapter(), "")
    return svc.list_devices()

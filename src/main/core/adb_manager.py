"""ADB 设备管理器 (facade) — 委托 3 collaborator + LogcatMonitor lazy 持有。

职责:
- 委托 DeviceConnectionService: 设备连接 + ADB 服务检查 + 设备列表
- 委托 AppLifecycleService: APP 状态/强停/PID/dumpsys/确保关闭
- 委托 BluetoothService: 蓝牙状态/开启/确保开启
- 保留 LogcatMonitor lazy 持有 + check_crash_logs 双路径 (monitor 优先 + logcat -d 回退)

设计:
- ADBManager(device_name, app_package) 公共签名保持后向兼容
- collaborators kwarg 注入 (测试可注 FakeAdapter)
- 16+ 公共方法名 + 返回类型保持
- 模块级 get_connected_devices() + create_adb_manager() 保持
- ADB_CMD 模块级常量保持 (从 SubprocessAdbAdapter re-export)
"""
from __future__ import annotations

import logging

from main.core.adb.adb_port import AdbCommandPort
from main.core.adb.app_lifecycle import AppLifecycleService
from main.core.adb.bluetooth_control import BluetoothService
from main.core.adb.device_connection import DeviceConnectionService
from main.core.adb.subprocess_adb_adapter import ADB_CMD, SubprocessAdbAdapter
from main.core.logcat.crash_detector import is_crash_line
from main.utils.i18n import t

logger = logging.getLogger(__name__)


class ADBManager:
    """ADB 设备管理器 (facade)。"""

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

    # === ADB 服务 ===

    def check_adb_service(self) -> bool:
        """检查 ADB 服务是否正常运行。"""
        return self._connection.check_adb_service()

    # === 设备连接 ===

    def connect_device(self) -> tuple[bool, str]:
        """连接 ADB 设备 (USB/TCP 自动路由)。"""
        return self._connection.connect()

    # === APP 生命周期 ===

    def check_app_status(self) -> tuple[bool, str | None]:
        """检查 APP 是否在前台运行。"""
        return self._app.check_status()

    def force_stop_app(self) -> bool:
        """强制停止 APP (打日志)。"""
        return self._app.force_stop(silent=False)

    def force_stop_app_silent(self) -> bool:
        """静默强制停止 APP (不打日志,供 test_initializer 清场)。"""
        return self._app.force_stop(silent=True)

    def get_dumpsys_window(self) -> str:
        """获取 dumpsys window windows 输出。"""
        return self._app.get_dumpsys_window()

    def ensure_app_closed(self, wait_time: int = 2) -> bool:
        """确保 APP 关闭 (在前台则强停 + 等待)。"""
        return self._app.ensure_closed(wait_time)

    def get_app_pid(self) -> int | None:
        """获取 APP PID (未运行返回 None)。"""
        return self._app.get_pid()

    # === 蓝牙 ===

    def check_bluetooth_status(self) -> tuple[bool, str | None]:
        """检查蓝牙是否开启。"""
        return self._bluetooth.check_status()

    def enable_bluetooth(self) -> bool:
        """开启蓝牙。"""
        return self._bluetooth.enable()

    def ensure_bluetooth_enabled(self) -> bool:
        """确保蓝牙已开启 (未开启则尝试开启并复查)。"""
        return self._bluetooth.ensure_enabled()

    # === Logcat 监控 (lazy 持有 LogcatMonitor) ===

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

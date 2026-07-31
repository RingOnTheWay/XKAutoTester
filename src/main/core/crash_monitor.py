"""
崩溃监控独立组件
从 TestInitializer 提取的 logcat 监控关注点，封装崩溃检测、日志附加、生命周期管理
"""

import logging
import time
from typing import TYPE_CHECKING

from main.utils.i18n import t

if TYPE_CHECKING:
    from main.core.adb_manager import ADBManager
    from main.utils.test_reporter import TestReporter


class CrashMonitor:
    """崩溃监控独立组件

    封装 ADBManager 的 logcat 监控启动/停止/崩溃检测逻辑，
    替代 TestInitializer 直接访问 ADBManager._logcat_monitor 私有属性
    """

    def __init__(self, adb_manager: "ADBManager", reporter: "TestReporter", logger: logging.Logger):
        """
        Args:
            adb_manager: ADB 管理器实例
            reporter: 测试报告桥接器
            logger: 日志记录器
        """
        self._adb = adb_manager
        self._reporter = reporter
        self._logger = logger

    def start(self, pid: int | None = None) -> bool:
        """启动 logcat 实时监控

        Args:
            pid: 应用进程 ID（可选，为 None 时按包名过滤）

        Returns:
            bool: 启动是否成功
        """
        try:
            success = self._adb.start_logcat_monitor(
                pid=pid,
                on_crash=self.on_crash_detected,
            )
            if success:
                self._logger.info(t("python.testInitializer.logcatMonitorStarted"))
            else:
                self._logger.warning(t("python.testInitializer.logcatMonitorStartFailed"))
            return success
        except Exception as e:
            self._logger.warning(t("python.testInitializer.logcatMonitorStartError", error=e))
            return False

    def check_and_attach_on_init_error(self, app_pid: str | None = None) -> None:
        """Appium 初始化失败时，检查 logcat 是否捕获到崩溃日志并附加到 Allure

        Args:
            app_pid: 应用进程 ID，用于回退到 logcat -d 检查
        """
        try:
            # 先检查 logcat monitor
            if self._adb.is_crash_detected():
                full_log = self._adb.get_logcat_full_log()
                if full_log:
                    self._logger.error(t("python.testInitializer.initErrorWithCrash"))
                    self._reporter.attach(full_log, name=t("python.testInitializer.crashLogAttachName"))
                return

            # logcat monitor 未检测到崩溃，回退到 logcat -d 检查
            if app_pid:
                crash_logs = self._adb.check_crash_logs(app_pid)
                if crash_logs:
                    crash_text = "\n".join(str(log) for log in crash_logs)
                    self._logger.error(t("python.testInitializer.initErrorWithCrash"))
                    self._reporter.attach(crash_text, name=t("python.testInitializer.crashLogAttachName"))
        except Exception as e:
            self._logger.warning(t("python.testInitializer.logcatMonitorStopError", error=e))

    def stop_and_attach_log(self) -> None:
        """停止 logcat 监控并附加日志到 Allure 报告"""
        try:
            crash_detected = self._adb.is_crash_detected()

            # 崩溃检测后等待堆栈续行
            if crash_detected:
                time.sleep(3)

            full_log = self._adb.get_logcat_full_log()

            if crash_detected:
                self._logger.error(t("python.testInitializer.crashLogCaptured"))
                if full_log:
                    self._reporter.attach(full_log, name=t("python.testInitializer.crashLogAttachName"))
            else:
                if full_log:
                    self._logger.info(t("python.testInitializer.appLogCaptured", count=len(full_log.split("\n"))))
                    self._reporter.attach(full_log, name=t("python.testInitializer.appLogAttachName"))
                else:
                    self._logger.info(t("python.testInitializer.noAppLog"))

            self._adb.stop_logcat_monitor()
        except Exception as e:
            self._logger.warning(t("python.testInitializer.logcatMonitorStopError", error=e))

    def on_crash_detected(self, crash_type: str, crash_line: str, full_log: str) -> None:
        """崩溃检测回调：记录崩溃信息，不阻塞 read_loop

        注意：此回调在 logcat_monitor 的 read_loop 线程中执行，
        不能 sleep 或执行耗时操作，否则会阻塞日志读取。

        Args:
            crash_type: 崩溃类型
            crash_line: 崩溃行
            full_log: 完整日志（此时可能不完整，堆栈续行尚未读取）
        """
        self._logger.error(t("python.testInitializer.fatalCrashDetected", type=crash_type, line=crash_line))

        # 不在此处附加日志或 sleep，避免阻塞 read_loop
        # 日志附加在 stop_and_attach_log 中进行（停止前等待堆栈续行）

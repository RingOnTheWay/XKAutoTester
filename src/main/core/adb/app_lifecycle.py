"""AppLifecycleService — APP 生命周期管理。

职责:
- check_status: 检查 APP 是否在前台 (dumpsys window + 包名匹配)
- force_stop: 强制停止 APP (silent 控制日志)
- get_pid: 获取 APP PID (pidof + int 转换)
- get_dumpsys_window: 获取 dumpsys window 输出
- ensure_closed: 编排 check + stop + sleep

设计:
- 委托 AdbCommandPort 执行 adb 命令
- 全部 i18n 键保留 python.adbManager.*
- 注入 executor,测试可注 FakeAdbAdapter
"""

from __future__ import annotations

import logging
import time

from main.core.adb.adb_port import AdbCommandPort
from main.utils.i18n import t

logger = logging.getLogger(__name__)


class AppLifecycleService:
    """APP 生命周期服务: 状态/停止/PID/dumpsys/确保关闭。"""

    def __init__(
        self,
        executor: AdbCommandPort,
        device_name: str,
        app_package: str,
    ) -> None:
        """
        Args:
            executor: AdbCommandPort 实现 (SubprocessAdbAdapter 或 FakeAdbAdapter)
            device_name: 设备名 (如 '192.168.1.100:5555' 或 USB 序列号)
            app_package: APP 包名 (如 'com.x.app')
        """
        self._executor = executor
        self._device_name = device_name
        self._app_package = app_package

    def check_status(self) -> tuple[bool, str | None]:
        """检查 APP 是否在前台运行。

        Returns:
            (在前台, 错误信息): 前台时 err=None, 命令失败时 err=i18n 消息
        """
        try:
            result = self._executor.execute(
                ["-s", self._device_name, "shell", "dumpsys", "window", "windows"],
            )
            if result.success:
                if self._app_package in result.stdout:
                    logger.info(t("python.adbManager.appRunningInForeground"))
                    return True, None
                logger.info(t("python.adbManager.appNotInForeground"))
                return False, None
            logger.warning(t("python.adbManager.cannotCheckAppStatus"))
            return False, t("python.adbManager.cannotCheckAppStatus")
        except Exception as e:
            logger.warning(t("python.adbManager.checkAppStatusError", error=e))
            return False, t("python.adbManager.checkAppStatusError", error=e)

    def force_stop(self, *, silent: bool = False) -> bool:
        """强制停止 APP。

        Args:
            silent: True 时不打日志 (供 test_initializer 清场用)

        Returns:
            bool: 停止操作是否成功
        """
        try:
            result = self._executor.execute(
                ["-s", self._device_name, "shell", "am", "force-stop", self._app_package],
            )
            if silent:
                return result.success
            if result.success:
                logger.info(t("python.adbManager.appForceStopped"))
                return True
            logger.warning(t("python.adbManager.appForceStopFailed"))
            return False
        except Exception as e:
            if not silent:
                logger.warning(t("python.adbManager.appForceStopError", error=e))
            return False

    def get_pid(self) -> int | None:
        """获取 APP PID。

        Returns:
            int | None: PID, 应用未运行或失败时返回 None
        """
        try:
            result = self._executor.execute(
                ["-s", self._device_name, "shell", "pidof", self._app_package],
            )
            if result.success and result.stdout.strip():
                try:
                    # R27 P3-11: pidof 多进程输出 "123 456" — 取首个 token (主进程 PID),
                    # 原 int(整串) 抛 ValueError → 多进程 app 拿不到 PID
                    pid = int(result.stdout.strip().split()[0])
                    logger.info(t("python.adbManager.gotAppPid", pid=pid))
                    return pid
                except ValueError:
                    logger.warning(t("python.adbManager.appNotRunningOrNoPid", package=self._app_package))
                    return None
            logger.warning(t("python.adbManager.appNotRunningOrNoPid", package=self._app_package))
            return None
        except Exception as e:
            logger.warning(t("python.adbManager.getAppPidError", error=e))
            return None

    def get_dumpsys_window(self) -> str:
        """获取 dumpsys window windows 输出。

        Returns:
            str: stdout; 命令失败时返回空字符串
        """
        try:
            result = self._executor.execute(
                ["-s", self._device_name, "shell", "dumpsys", "window", "windows"],
            )
            return result.stdout or ""
        except Exception as e:
            logger.warning(t("python.adbManager.checkAppStatusError", error=e))
            return ""

    def ensure_closed(self, wait_time: int = 2) -> bool:
        """确保 APP 关闭: 在前台则强停 + 等待。

        Args:
            wait_time: 强停后等待秒数

        Returns:
            bool: 操作是否成功 (不在前台也算成功)
        """
        try:
            is_running, error_msg = self.check_status()
            if is_running:
                logger.info(t("python.adbManager.appRunningForceStop"))
                if self.force_stop():
                    time.sleep(wait_time)
                    return True
                return False
            if error_msg:
                logger.warning(t("python.adbManager.checkAppStatusError", error=error_msg))
            else:
                logger.info(t("python.adbManager.appNotRunningNoNeedToClose"))
            return True
        except Exception as e:
            logger.warning(t("python.adbManager.ensureAppClosedError", error=e))
            return False

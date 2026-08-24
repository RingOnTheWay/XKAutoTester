"""BluetoothService — 蓝牙状态管理。

职责:
- check_status: 查询 settings get global bluetooth_on (1=开启)
- enable: svc bluetooth enable + sleep(3) 等待生效
- ensure_enabled: 编排 check + enable + re-check

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

# 等待生效时长 (秒): svc bluetooth enable 命令发出后需等待系统蓝牙真正开启
_SLEEP_BLE_ENABLE = 3
# 等待生效时长 (秒): 复查蓝牙状态前等待状态同步
_SLEEP_BLE_RECHECK = 2


class BluetoothService:
    """蓝牙服务: 状态查询 + 开启 + 确保开启。"""

    def __init__(
        self,
        executor: AdbCommandPort,
        device_name: str,
    ) -> None:
        """
        Args:
            executor: AdbCommandPort 实现 (SubprocessAdbAdapter 或 FakeAdbAdapter)
            device_name: 设备名 (如 '192.168.1.100:5555' 或 USB 序列号)
        """
        self._executor = executor
        self._device_name = device_name

    def check_status(self) -> tuple[bool, str | None]:
        """检查蓝牙是否开启。

        Returns:
            (是否开启, 错误信息): 开启时 err=None, 未开启或失败时 err=i18n 消息
        """
        try:
            result = self._executor.execute(
                ["-s", self._device_name, "shell", "settings", "get", "global", "bluetooth_on"],
            )
            if result.success:
                if result.stdout.strip() == "1":
                    logger.info(t("python.adbManager.bluetoothEnabled"))
                    return True, None
                logger.warning(t("python.adbManager.bluetoothNotEnabled"))
                return False, t("python.adbManager.bluetoothNotEnabled")
            logger.warning(t("python.adbManager.cannotCheckBluetooth"))
            return False, t("python.adbManager.cannotCheckBluetooth")
        except Exception as e:
            logger.warning(t("python.adbManager.checkBluetoothError", error=e))
            return False, t("python.adbManager.checkBluetoothError", error=e)

    def enable(self) -> bool:
        """开启蓝牙。

        Returns:
            bool: 命令执行是否成功 (returncode=0)
        """
        try:
            result = self._executor.execute(
                ["-s", self._device_name, "shell", "svc", "bluetooth", "enable"],
            )
            if result.success:
                logger.info(t("python.adbManager.bluetoothEnableCommandSuccess"))
                time.sleep(_SLEEP_BLE_ENABLE)
                return True
            logger.warning(t("python.adbManager.bluetoothEnableCommandFailed"))
            return False
        except Exception as e:
            logger.warning(t("python.adbManager.enableBluetoothError", error=e))
            return False

    def ensure_enabled(self) -> bool:
        """确保蓝牙已开启: 未开启则尝试开启并复查。

        Returns:
            bool: 蓝牙最终是否处于开启状态
        """
        try:
            bluetooth_enabled, _ = self.check_status()
            if bluetooth_enabled:
                logger.info(t("python.adbManager.bluetoothAlreadyEnabled"))
                return True
            logger.warning(t("python.adbManager.bluetoothNotEnabledTrying"))
            if not self.enable():
                logger.warning(t("python.adbManager.bluetoothEnableFailed"))
                return False
            # 复查
            time.sleep(_SLEEP_BLE_RECHECK)
            bluetooth_enabled, _ = self.check_status()
            if bluetooth_enabled:
                logger.info(t("python.adbManager.bluetoothEnableSuccess"))
                return True
            logger.warning(t("python.adbManager.bluetoothEnableCheckFailed"))
            return False
        except Exception as e:
            logger.warning(t("python.adbManager.ensureBluetoothError", error=e))
            return False

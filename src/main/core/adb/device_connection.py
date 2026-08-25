"""DeviceConnectionService — 设备连接服务。

职责:
- check_adb_service: adb version 检查
- list_devices: adb devices + 正则解析
- connect: USB/TCP 路由 + 授权等待 + 弹窗触发

设计:
- 委托 AdbCommandPort 执行 adb 命令
- 全部 i18n 键保留 python.adbManager.*
- 注入 executor,测试可注 FakeAdbAdapter
- _show_unauthorized_dialog 写文件副作用留本服务内 (抽了反增复杂度)
"""
from __future__ import annotations

import json
import logging
import re
import time

from main.core.adb.adb_port import AdbCommandPort
from main.utils.i18n import t

logger = logging.getLogger(__name__)

# 设备行匹配: "设备ID    device" (仅 device 状态,跳过 unauthorized/offline)
_DEVICE_LINE_RE = re.compile(r"^([^\s]+)\s+device$")

# 默认 TCP 连接端口 (device_name 不含 ':' 时使用)
_DEFAULT_TCP_PORT = 5555

# adb connect 输出判定用稳定子串/错误码:
# - adb 对连接成功/重复连接/认证失败输出为英文前缀, 非本地化, 可稳定匹配 (兼容中英文系统)
# - 连接被拒时 adb 代理 OS 错误, 错误码 10061 与本地化描述 (如中文 '目标计算机积极拒绝')
#   可能引起子串探测失效, 故集中为常量并仅作兜底
_CONNECTED_PREFIX = "connected to"
_ALREADY_PREFIX = "already connected"
_AUTH_FAILED_SUBSTR = "failed to authenticate"
_CANNOT_CONNECT_PREFIX = "cannot connect"
_ECONNREFUSED_WIN_CODE = "10061"
_CONN_REFUSED_LOCALIZED = "目标计算机积极拒绝"


class DeviceConnectionService:
    """设备连接服务: ADB 服务检查 + 设备列表 + USB/TCP 路由连接。"""

    def __init__(
        self,
        executor: AdbCommandPort,
        device_name: str,
    ) -> None:
        """
        Args:
            executor: AdbCommandPort 实现 (SubprocessAdbAdapter 或 FakeAdbAdapter)
            device_name: 设备名 (USB 序列号或 IP:端口)
        """
        self._executor = executor
        self._device_name = device_name

    # === ADB 服务 ===

    def check_adb_service(self) -> bool:
        """检查 ADB 服务是否正常运行 (adb version)。

        Returns:
            bool: ADB 服务是否正常
        """
        try:
            result = self._executor.execute(["version"], timeout=5)
            return result.success
        except Exception as e:
            logger.warning(t("python.adbManager.adbServiceCheckError", error=e))
            return False

    # === 设备列表 ===

    def list_devices(self) -> list[str]:
        """获取所有 'device' 状态的设备 ID 列表。

        Returns:
            list[str]: 设备 ID 列表 (跳过 unauthorized/offline)
        """
        try:
            logger.info(t("python.adbManager.gettingConnectedDevices"))
            result = self._executor.execute(["devices"])
            logger.info(t("python.adbManager.adbDeviceListStdout", output=result.stdout))
            if result.stderr:
                logger.info(t("python.adbManager.adbDeviceListStderr", output=result.stderr))
            logger.info(t("python.adbManager.adbDeviceListReturnCode", code=result.returncode))

            devices: list[str] = []
            for line in result.stdout.split("\n"):
                match = _DEVICE_LINE_RE.match(line.strip())
                if match:
                    devices.append(match.group(1))

            logger.info(t("python.adbManager.parsedDeviceList", devices=devices))
            return devices
        except Exception as e:
            logger.error(t("python.adbManager.getDeviceListFailed", error=e))
            return []

    # === 连接 ===

    def connect(self) -> tuple[bool, str]:
        """连接设备: 根据 device_name 自动路由 USB/TCP。

        Returns:
            (是否成功, 状态信息)
        """
        try:
            logger.info(t("python.adbManager.tryingConnectDevice", device=self._device_name))
            if self._is_tcp_device():
                return self._connect_tcp_device()
            return self._connect_usb_device()
        except Exception as e:
            logger.warning(t("python.adbManager.adbConnectError", error=e))
            return False, t("python.adbManager.adbConnectError", error=e)

    # === 私有: 设备类型判定 ===

    def _is_tcp_device(self) -> bool:
        """判断是否为 TCP/IP 设备 (device_name 含 ':')。

        USB: 纯序列号 (如 70665345151351)
        TCP: IP:端口 (如 192.168.1.100:5555)
        """
        return ":" in self._device_name

    # === 私有: 设备列表查询 ===

    def _check_device_in_list(self, device_identifier: str | None = None) -> tuple[bool, str]:
        """检查设备是否在 adb devices 列表中。

        Returns:
            (是否找到, 状态): 状态 ∈ {'device', 'unauthorized', 'offline', 'not_found', error_msg}
        """
        if device_identifier is None:
            device_identifier = self._device_name

        try:
            result = self._executor.execute(["devices"], timeout=5)
            logger.info(t("python.adbManager.adbDeviceListStdout", output=result.stdout))
            if result.stderr:
                logger.info(t("python.adbManager.adbDeviceListStderr", output=result.stderr))

            for line in result.stdout.split("\n"):
                line = line.strip()
                if line.startswith(device_identifier):
                    if "unauthorized" in line:
                        return False, "unauthorized"
                    if "device" in line:
                        return True, "device"
                    if "offline" in line:
                        return False, "offline"
            return False, "not_found"
        except Exception as e:
            logger.warning(t("python.adbManager.checkDeviceListError", error=e))
            return False, str(e)

    # === 私有: USB 连接 ===

    def _connect_usb_device(self) -> tuple[bool, str]:
        """USB 设备连接: 直接查列表 (USB 设备物理连接已识别)。"""
        logger.info(t("python.adbManager.usbDeviceDetected"))

        found, status = self._check_device_in_list()

        if found and status == "device":
            logger.info(t("python.adbManager.usbDeviceAuthorized", device=self._device_name))
            return True, t("python.adbManager.deviceConnectedAndAuthorized")
        if status == "unauthorized":
            logger.warning(t("python.adbManager.usbDeviceUnauthorized", device=self._device_name))
            return self._wait_for_usb_authorization()
        if status == "offline":
            logger.warning(t("python.adbManager.usbDeviceOffline", device=self._device_name))
            return False, t("python.adbManager.usbDeviceOfflineReplug")
        logger.warning(t("python.adbManager.usbDeviceNotInList", device=self._device_name))
        logger.info(t("python.adbManager.checkUsbConnection"))
        return False, t("python.adbManager.usbDeviceNotInListCheck")

    # === 私有: TCP 连接 ===

    def _connect_tcp_device(self) -> tuple[bool, str]:
        """TCP/IP 设备连接: adb connect + 重新认证流程。"""
        device_address = (
            self._device_name if ":" in self._device_name else f"{self._device_name}:{_DEFAULT_TCP_PORT}"
        )

        connect_result = self._executor.execute(
            ["connect", device_address]
        )
        stdout = connect_result.stdout
        stderr = connect_result.stderr
        logger.info(t("python.adbManager.adbConnectStdout", output=stdout))
        if stderr:
            logger.info(t("python.adbManager.adbConnectStderr", output=stderr))
        logger.info(t("python.adbManager.adbConnectReturnCode", code=connect_result.returncode))

        # 稳定前缀判定 (非本地化): 连接成功 / 重复连接(已连接) / 认证失败
        # 优先用稳定前缀, 避免依赖本地化 OS 错误描述
        connected = _CONNECTED_PREFIX in stdout or _ALREADY_PREFIX in stdout
        auth_failed = _AUTH_FAILED_SUBSTR in stdout
        if connected or auth_failed:
            logger.info(t("python.adbManager.deviceConnectResult", output=stdout.strip()))

            # 第一次查列表
            self._executor.execute(["devices"], timeout=5)

            logger.info(t("python.adbManager.disconnectForReauth"))
            disconnect_result = self._executor.execute(
                ["disconnect", device_address], timeout=5
            )
            logger.info(t("python.adbManager.disconnectResult", output=disconnect_result.stdout))

            time.sleep(1)

            logger.info(t("python.adbManager.reconnectForAuth"))
            reconnect_result = self._executor.execute(
                ["connect", device_address]
            )
            logger.info(t("python.adbManager.reconnectResult", output=reconnect_result.stdout))

            # 第二次查列表
            devices_result = self._executor.execute(["devices"], timeout=5)
            logger.info(
                t("python.adbManager.reconnectDeviceListStdout", output=devices_result.stdout)
            )

            if device_address in devices_result.stdout:
                if "unauthorized" in devices_result.stdout or auth_failed:
                    logger.warning(t("python.adbManager.deviceUnauthorized", device=self._device_name))
                    return self._wait_for_usb_authorization()
                logger.info(t("python.adbManager.deviceAuthorized", device=self._device_name))
                return True, t("python.adbManager.deviceConnectedAndAuthorized")
            logger.warning(t("python.adbManager.deviceNotInList", device=self._device_name))
            return False, t("python.adbManager.deviceNotInListShort")

        if (
            _CANNOT_CONNECT_PREFIX in stdout
            or _CONN_REFUSED_LOCALIZED in stdout
            or _ECONNREFUSED_WIN_CODE in stdout
        ):
            logger.warning(t("python.adbManager.deviceConnectionRefused", device=self._device_name))
            return False, t("python.adbManager.deviceConnectionRefusedShort")
        logger.warning(t("python.adbManager.deviceConnectionFailed", device=self._device_name))
        return False, t("python.adbManager.deviceConnectionFailedShort")

    # === 私有: 授权等待 ===

    def _wait_for_usb_authorization(self) -> tuple[bool, str]:
        """等待 USB 设备授权 (60s 超时, 2s 轮询)。"""
        logger.info(t("python.adbManager.pleaseAuthorizeDevice"))
        self._show_unauthorized_dialog()

        max_wait_time = 60
        check_interval = 2
        waited_time = 0

        while waited_time < max_wait_time:
            logger.info(t("python.adbManager.waitingForAuth", seconds=waited_time))
            time.sleep(check_interval)
            waited_time += check_interval

            found, status = self._check_device_in_list()
            logger.info(t("python.adbManager.authCheckResult", status=status))

            if found and status == "device":
                logger.info(t("python.adbManager.deviceAuthorized", device=self._device_name))
                return True, t("python.adbManager.deviceConnectedAndAuthorized")
            if status == "unauthorized":
                logger.info(t("python.adbManager.deviceStillUnauthorized"))
            else:
                logger.warning(t("python.adbManager.deviceNotInList", device=self._device_name))

        logger.error(t("python.adbManager.deviceAuthTimeout", seconds=max_wait_time))
        return False, t("python.adbManager.deviceAuthTimeoutShort")

    # === 私有: 弹窗触发 ===

    def _show_unauthorized_dialog(self) -> None:
        """写 unauthorized_dialog.json 触发 Electron 前端弹窗提醒。"""
        try:
            # lazy import 避免循环依赖
            from main.utils.paths import get_logs_path

            dialog_trigger_file = get_logs_path("unauthorized_dialog.json")
            dialog_trigger_file.parent.mkdir(parents=True, exist_ok=True)

            dialog_data = {
                "device_name": self._device_name,
                "timestamp": time.time(),
                "message": t("python.adbManager.deviceUnauthorizedDialog", device=self._device_name),
            }

            with open(dialog_trigger_file, "w", encoding="utf-8") as f:
                json.dump(dialog_data, f, ensure_ascii=False, indent=2)

            logger.info(
                t("python.adbManager.unauthorizedDialogFileCreated", path=dialog_trigger_file)
            )
        except Exception as e:
            logger.warning(t("python.adbManager.showUnauthorizedDialogFailed", error=e))
            # 弹窗失败不影响主流程,继续等待授权

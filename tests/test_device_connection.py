"""DeviceConnectionService 单元测试。

验证 3 公共方法 + 关键私有:
- check_adb_service: adb version + returncode=0
- list_devices: adb devices + 正则解析
- connect: USB/TCP 路由 + 授权等待
- _is_tcp_device: ":" 判定
- _check_device_in_list: device/unauthorized/offline/not_found
- _show_unauthorized_dialog: 文件副作用
"""
from __future__ import annotations

import json
from unittest.mock import patch

from main.core.adb.adb_port import AdbResult
from main.core.adb.device_connection import DeviceConnectionService
from tests.unit.helpers.fake_adb_adapter import FakeAdbAdapter


class TestDeviceConnectionService:
    """DeviceConnectionService 测试。"""

    def _make_service(self, device="dev:5555"):
        adapter = FakeAdbAdapter()
        svc = DeviceConnectionService(adapter, device)
        return svc, adapter

    # ── check_adb_service ────────────────────────────────────

    def test_check_adb_service_success(self):
        """adb version returncode=0 → True。"""
        svc, adapter = self._make_service()
        adapter.when(["version"], AdbResult(0, "Android Debug Bridge version 1.0.41", ""))

        assert svc.check_adb_service() is True

    def test_check_adb_service_failure(self):
        """adb version returncode≠0 → False。"""
        svc, adapter = self._make_service()
        adapter.when(["version"], AdbResult(1, "", "err"))

        assert svc.check_adb_service() is False

    # ── list_devices ─────────────────────────────────────────

    def test_list_devices_parses_device_lines(self):
        """adb devices 输出 → 解析出设备 ID 列表。"""
        svc, adapter = self._make_service()
        adapter.when(
            ["devices"],
            AdbResult(
                0,
                "List of devices attached\n"
                "192.168.1.100:5555\tdevice\n"
                "emulator-5554\tdevice\n"
                "\n",
                "",
            ),
        )

        devices = svc.list_devices()

        assert devices == ["192.168.1.100:5555", "emulator-5554"]

    def test_list_devices_empty_when_no_devices(self):
        """adb devices 无设备行 → []。"""
        svc, adapter = self._make_service()
        adapter.when(["devices"], AdbResult(0, "List of devices attached\n\n", ""))

        assert svc.list_devices() == []

    def test_list_devices_skips_unauthorized_and_offline(self):
        """只匹配 'device' 状态,跳过 unauthorized/offline。"""
        svc, adapter = self._make_service()
        adapter.when(
            ["devices"],
            AdbResult(
                0,
                "List of devices attached\n"
                "good_device\tdevice\n"
                "bad_device\tunauthorized\n"
                "offline_dev\toffline\n",
                "",
            ),
        )

        assert svc.list_devices() == ["good_device"]

    def test_list_devices_empty_on_failure(self):
        """命令失败 → []。"""
        svc, adapter = self._make_service()
        adapter.when(["devices"], AdbResult(1, "", "err"))

        assert svc.list_devices() == []

    # ── _is_tcp_device ───────────────────────────────────────

    def test_is_tcp_device_with_colon(self):
        """device_name 含 ':' → True。"""
        svc, _ = self._make_service(device="192.168.1.100:5555")
        assert svc._is_tcp_device() is True

    def test_is_tcp_device_without_colon(self):
        """device_name 无 ':' → False (USB)。"""
        svc, _ = self._make_service(device="70665345151351")
        assert svc._is_tcp_device() is False

    # ── _check_device_in_list ────────────────────────────────

    def test_check_device_in_list_device_ready(self):
        """设备在列表 + 'device' 状态 → (True, 'device')。"""
        svc, adapter = self._make_service(device="dev:5555")
        adapter.when(
            ["devices"],
            AdbResult(0, "List of devices attached\ndev:5555\tdevice\n", ""),
        )

        found, status = svc._check_device_in_list()

        assert found is True
        assert status == "device"

    def test_check_device_in_list_unauthorized(self):
        """设备在列表 + 'unauthorized' → (False, 'unauthorized')。"""
        svc, adapter = self._make_service(device="dev:5555")
        adapter.when(
            ["devices"],
            AdbResult(0, "List of devices attached\ndev:5555\tunauthorized\n", ""),
        )

        found, status = svc._check_device_in_list()

        assert found is False
        assert status == "unauthorized"

    def test_check_device_in_list_offline(self):
        """设备在列表 + 'offline' → (False, 'offline')。"""
        svc, adapter = self._make_service(device="dev:5555")
        adapter.when(
            ["devices"],
            AdbResult(0, "List of devices attached\ndev:5555\toffline\n", ""),
        )

        found, status = svc._check_device_in_list()

        assert found is False
        assert status == "offline"

    def test_check_device_in_list_not_found(self):
        """设备不在列表 → (False, 'not_found')。"""
        svc, adapter = self._make_service(device="dev:5555")
        adapter.when(
            ["devices"],
            AdbResult(0, "List of devices attached\nother:5555\tdevice\n", ""),
        )

        found, status = svc._check_device_in_list()

        assert found is False
        assert status == "not_found"

    # ── connect USB ──────────────────────────────────────────

    def test_connect_usb_device_ready(self):
        """USB 设备 + 'device' 状态 → (True, msg)。"""
        svc, adapter = self._make_service(device="70665345151351")
        adapter.when(
            ["devices"],
            AdbResult(0, "List of devices attached\n70665345151351\tdevice\n", ""),
        )

        ok, msg = svc.connect()

        assert ok is True
        assert msg is not None

    def test_connect_usb_device_offline(self):
        """USB 设备 + 'offline' 状态 → (False, msg)。"""
        svc, adapter = self._make_service(device="70665345151351")
        adapter.when(
            ["devices"],
            AdbResult(0, "List of devices attached\n70665345151351\toffline\n", ""),
        )

        ok, _ = svc.connect()

        assert ok is False

    def test_connect_usb_device_not_in_list(self):
        """USB 设备不在列表 → (False, msg)。"""
        svc, adapter = self._make_service(device="70665345151351")
        adapter.when(
            ["devices"],
            AdbResult(0, "List of devices attached\nother\tdevice\n", ""),
        )

        ok, _ = svc.connect()

        assert ok is False

    def test_connect_usb_unauthorized_calls_wait(self):
        """USB 设备 'unauthorized' → 调用 _wait_for_usb_authorization。"""
        svc, adapter = self._make_service(device="70665345151351")
        adapter.when(
            ["devices"],
            AdbResult(0, "List of devices attached\n70665345151351\tunauthorized\n", ""),
        )

        with patch.object(svc, "_wait_for_usb_authorization", return_value=(True, "ok")) as mock_wait:
            ok, _ = svc.connect()
            mock_wait.assert_called_once()
            assert ok is True

    # ── connect TCP ──────────────────────────────────────────

    def test_connect_tcp_success(self):
        """TCP 设备 connect 成功 + devices 列表含目标 + 'device' → (True, msg)。"""
        svc, adapter = self._make_service(device="192.168.1.100:5555")
        # adb connect dev
        adapter.when(
            ["connect", "192.168.1.100:5555"],
            AdbResult(0, "connected to 192.168.1.100:5555", ""),
        )
        # adb devices (第一次, after connect)
        adapter.when(
            ["devices"],
            AdbResult(0, "List of devices attached\n192.168.1.100:5555\tdevice\n", ""),
        )
        # adb disconnect
        adapter.when(
            ["disconnect", "192.168.1.100:5555"],
            AdbResult(0, "disconnected", ""),
        )
        # adb connect (reconnect)
        adapter.when(
            ["connect", "192.168.1.100:5555"],
            AdbResult(0, "already connected", ""),
        )
        # adb devices (第二次, after reconnect)
        adapter.when(
            ["devices"],
            AdbResult(0, "List of devices attached\n192.168.1.100:5555\tdevice\n", ""),
        )

        with patch("main.core.adb.device_connection.time.sleep"):
            ok, _ = svc.connect()

        assert ok is True

    def test_connect_tcp_refused(self):
        """TCP connect 拒绝 (cannot connect) → (False, msg)。"""
        svc, adapter = self._make_service(device="192.168.1.100:5555")
        adapter.when(
            ["connect", "192.168.1.100:5555"],
            AdbResult(0, "cannot connect to 192.168.1.100:5555: cannot connect", ""),
        )

        ok, _ = svc.connect()

        assert ok is False

    # ── _show_unauthorized_dialog ───────────────────────────

    def test_show_unauthorized_dialog_writes_file(self, tmp_path, monkeypatch):
        """_show_unauthorized_dialog 写入 unauthorized_dialog.json。"""
        svc, _ = self._make_service(device="dev:5555")

        def fake_get_logs_path(name):
            return tmp_path / name

        monkeypatch.setattr(
            "main.utils.paths.get_logs_path", fake_get_logs_path
        )

        svc._show_unauthorized_dialog()

        dialog_file = tmp_path / "unauthorized_dialog.json"
        assert dialog_file.exists()
        data = json.loads(dialog_file.read_text(encoding="utf-8"))
        assert data["device_name"] == "dev:5555"
        assert "timestamp" in data
        assert "message" in data

    # ── _wait_for_usb_authorization ──────────────────────────

    def test_wait_for_usb_authorization_timeout(self):
        """无设备授权 → 60s 超时 → (False, msg)。"""
        svc, adapter = self._make_service(device="dev:5555")
        # 每次查询都返回 not_found
        adapter.when(
            ["devices"],
            AdbResult(0, "List of devices attached\nother\tdevice\n", ""),
        )

        # mock: time.sleep 不阻塞 + _show_unauthorized_dialog 不写文件
        with patch("main.core.adb.device_connection.time.sleep"), \
             patch.object(svc, "_show_unauthorized_dialog"):
            ok, msg = svc._wait_for_usb_authorization()

        assert ok is False
        assert msg is not None  # 超时消息

    def test_wait_for_usb_authorization_success_on_second_check(self):
        """第二次查询发现 device 已授权 → (True, msg)。"""
        svc, adapter = self._make_service(device="dev:5555")
        # 第一次 not_found, 第二次 device
        adapter.when(
            ["devices"],
            AdbResult(0, "List of devices attached\nother\tdevice\n", ""),
        )
        adapter.when(
            ["devices"],
            AdbResult(0, "List of devices attached\ndev:5555\tdevice\n", ""),
        )

        with patch("main.core.adb.device_connection.time.sleep"), \
             patch.object(svc, "_show_unauthorized_dialog"):
            ok, _ = svc._wait_for_usb_authorization()

        assert ok is True

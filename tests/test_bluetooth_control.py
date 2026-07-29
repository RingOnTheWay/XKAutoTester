"""BluetoothService 单元测试。

验证 3 方法:
- check_status: settings get global bluetooth_on + "1" 判定
- enable: svc bluetooth enable + sleep(3)
- ensure_enabled: check + enable + re-check 编排
"""
from __future__ import annotations

from unittest.mock import patch

from main.core.adb.adb_port import AdbResult
from main.core.adb.bluetooth_control import BluetoothService
from tests.unit.helpers.fake_adb_adapter import FakeAdbAdapter


class TestBluetoothService:
    """BluetoothService 测试。"""

    def _make_service(self, device="dev:5555"):
        adapter = FakeAdbAdapter()
        svc = BluetoothService(adapter, device)
        return svc, adapter

    # ── check_status ─────────────────────────────────────────

    def test_check_status_enabled(self):
        """bluetooth_on=1 → (True, None)。"""
        svc, adapter = self._make_service()
        adapter.when(
            ["-s", "dev:5555", "shell", "settings", "get", "global", "bluetooth_on"],
            AdbResult(0, "1\n", ""),
        )

        ok, err = svc.check_status()

        assert ok is True
        assert err is None

    def test_check_status_disabled(self):
        """bluetooth_on=0 → (False, error_msg)。"""
        svc, adapter = self._make_service()
        adapter.when(
            ["-s", "dev:5555", "shell", "settings", "get", "global", "bluetooth_on"],
            AdbResult(0, "0\n", ""),
        )

        ok, err = svc.check_status()

        assert ok is False
        assert err is not None

    def test_check_status_command_failure(self):
        """returncode≠0 → (False, error_msg)。"""
        svc, adapter = self._make_service()
        adapter.when(
            ["-s", "dev:5555", "shell", "settings", "get", "global", "bluetooth_on"],
            AdbResult(1, "", "device not found"),
        )

        ok, err = svc.check_status()

        assert ok is False
        assert err is not None

    # ── enable ───────────────────────────────────────────────

    def test_enable_success(self):
        """svc bluetooth enable returncode=0 → True + sleep(3)。"""
        svc, adapter = self._make_service()
        adapter.when(
            ["-s", "dev:5555", "shell", "svc", "bluetooth", "enable"],
            AdbResult(0, "", ""),
        )

        with patch("main.core.adb.bluetooth_control.time.sleep") as mock_sleep:
            assert svc.enable() is True
            mock_sleep.assert_called_once_with(3)

    def test_enable_failure(self):
        """returncode≠0 → False。"""
        svc, adapter = self._make_service()
        adapter.when(
            ["-s", "dev:5555", "shell", "svc", "bluetooth", "enable"],
            AdbResult(1, "", "err"),
        )

        with patch("main.core.adb.bluetooth_control.time.sleep"):
            assert svc.enable() is False

    # ── ensure_enabled ───────────────────────────────────────

    def test_ensure_enabled_already_enabled(self):
        """check_status=True → 直接返回 True,不调 enable。"""
        svc, adapter = self._make_service()
        adapter.when(
            ["-s", "dev:5555", "shell", "settings", "get", "global", "bluetooth_on"],
            AdbResult(0, "1\n", ""),
        )

        assert svc.ensure_enabled() is True
        # 不应调 svc bluetooth enable
        enable_calls = [c for c in adapter.calls if "svc" in c]
        assert len(enable_calls) == 0

    def test_ensure_enabled_enables_then_rechecks(self):
        """check=False → enable → re-check=True → True。"""
        svc, adapter = self._make_service()
        # 第一次 check: 未开启
        # 第二次 check (recheck): 已开启
        adapter.when(
            ["-s", "dev:5555", "shell", "settings", "get", "global", "bluetooth_on"],
            AdbResult(0, "0\n", ""),
        )
        adapter.when(
            ["-s", "dev:5555", "shell", "settings", "get", "global", "bluetooth_on"],
            AdbResult(0, "1\n", ""),
        )
        adapter.when(
            ["-s", "dev:5555", "shell", "svc", "bluetooth", "enable"],
            AdbResult(0, "", ""),
        )

        with patch("main.core.adb.bluetooth_control.time.sleep"):
            assert svc.ensure_enabled() is True

    def test_ensure_enabled_enable_failed(self):
        """check=False → enable 失败 → False。"""
        svc, adapter = self._make_service()
        adapter.when(
            ["-s", "dev:5555", "shell", "settings", "get", "global", "bluetooth_on"],
            AdbResult(0, "0\n", ""),
        )
        adapter.when(
            ["-s", "dev:5555", "shell", "svc", "bluetooth", "enable"],
            AdbResult(1, "", "err"),
        )

        with patch("main.core.adb.bluetooth_control.time.sleep"):
            assert svc.ensure_enabled() is False

    def test_ensure_enabled_recheck_still_disabled(self):
        """check=False → enable 成功 → re-check=False → False。"""
        svc, adapter = self._make_service()
        # 两次 check 都返回 0
        adapter.when(
            ["-s", "dev:5555", "shell", "settings", "get", "global", "bluetooth_on"],
            AdbResult(0, "0\n", ""),
        )
        adapter.when(
            ["-s", "dev:5555", "shell", "settings", "get", "global", "bluetooth_on"],
            AdbResult(0, "0\n", ""),
        )
        adapter.when(
            ["-s", "dev:5555", "shell", "svc", "bluetooth", "enable"],
            AdbResult(0, "", ""),
        )

        with patch("main.core.adb.bluetooth_control.time.sleep"):
            assert svc.ensure_enabled() is False

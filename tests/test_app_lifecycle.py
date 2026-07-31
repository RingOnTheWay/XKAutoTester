"""AppLifecycleService 单元测试。

验证 5 方法:
- check_status: dumpsys window + 包名匹配
- force_stop(silent=False/True): am force-stop + 日志差异
- get_pid: pidof + int 转换
- get_dumpsys_window: dumpsys window windows + 失败空字符串
- ensure_closed: 编排 check_status + force_stop + sleep
"""
from __future__ import annotations

from unittest.mock import patch

from main.core.adb.adb_port import AdbResult
from main.core.adb.app_lifecycle import AppLifecycleService
from tests.unit.helpers.fake_adb_adapter import FakeAdbAdapter


class TestAppLifecycleService:
    """AppLifecycleService 测试。"""

    def _make_service(self, device="dev:5555", pkg="com.x.app"):
        adapter = FakeAdbAdapter()
        svc = AppLifecycleService(adapter, device, pkg)
        return svc, adapter

    # ── check_status ──────────────────────────────────────────

    def test_check_status_app_in_foreground(self):
        """包名在 dumpsys 输出中 → (True, None)。"""
        svc, adapter = self._make_service()
        adapter.when(
            ["-s", "dev:5555", "shell", "dumpsys", "window", "windows"],
            AdbResult(0, "mCurrentFocus=Window{... com.x.app/MainActivity}", ""),
        )

        ok, err = svc.check_status()

        assert ok is True
        assert err is None

    def test_check_status_app_not_in_foreground(self):
        """包名不在 dumpsys 输出中 → (False, None)。"""
        svc, adapter = self._make_service()
        adapter.when(
            ["-s", "dev:5555", "shell", "dumpsys", "window", "windows"],
            AdbResult(0, "mCurrentFocus=Window{... com.other.app/MainActivity}", ""),
        )

        ok, err = svc.check_status()

        assert ok is False
        assert err is None

    def test_check_status_command_failure(self):
        """returncode≠0 → (False, error_msg)。"""
        svc, adapter = self._make_service()
        adapter.when(
            ["-s", "dev:5555", "shell", "dumpsys", "window", "windows"],
            AdbResult(1, "", "device not found"),
        )

        ok, err = svc.check_status()

        assert ok is False
        assert err is not None  # i18n key 或消息

    # ── force_stop ────────────────────────────────────────────

    def test_force_stop_success(self):
        """am force-stop returncode=0 → True。"""
        svc, adapter = self._make_service()
        adapter.when(
            ["-s", "dev:5555", "shell", "am", "force-stop", "com.x.app"],
            AdbResult(0, "", ""),
        )

        assert svc.force_stop() is True

    def test_force_stop_failure(self):
        """am force-stop returncode≠0 → False。"""
        svc, adapter = self._make_service()
        adapter.when(
            ["-s", "dev:5555", "shell", "am", "force-stop", "com.x.app"],
            AdbResult(1, "", "error"),
        )

        assert svc.force_stop() is False

    def test_force_stop_silent_success(self):
        """silent=True 也走 am force-stop,returncode=0 → True。"""
        svc, adapter = self._make_service()
        adapter.when(
            ["-s", "dev:5555", "shell", "am", "force-stop", "com.x.app"],
            AdbResult(0, "", ""),
        )

        assert svc.force_stop(silent=True) is True
        # 命令相同 (silent 仅控制日志,不影响命令)
        assert adapter.calls[0] == [
            "-s", "dev:5555", "shell", "am", "force-stop", "com.x.app"
        ]

    def test_force_stop_silent_failure(self):
        """silent=True 失败 → False。"""
        svc, adapter = self._make_service()
        adapter.when(
            ["-s", "dev:5555", "shell", "am", "force-stop", "com.x.app"],
            AdbResult(1, "", "err"),
        )

        assert svc.force_stop(silent=True) is False

    # ── get_pid ───────────────────────────────────────────────

    def test_get_pid_returns_int(self):
        """pidof 返回数字 → int。"""
        svc, adapter = self._make_service()
        adapter.when(
            ["-s", "dev:5555", "shell", "pidof", "com.x.app"],
            AdbResult(0, "12345\n", ""),
        )

        assert svc.get_pid() == 12345

    def test_get_pid_returns_none_when_empty(self):
        """pidof 返回空 → None。"""
        svc, adapter = self._make_service()
        adapter.when(
            ["-s", "dev:5555", "shell", "pidof", "com.x.app"],
            AdbResult(0, "", ""),
        )

        assert svc.get_pid() is None

    def test_get_pid_returns_none_on_failure(self):
        """pidof 失败 → None。"""
        svc, adapter = self._make_service()
        adapter.when(
            ["-s", "dev:5555", "shell", "pidof", "com.x.app"],
            AdbResult(1, "", "err"),
        )

        assert svc.get_pid() is None

    def test_get_pid_returns_none_on_non_numeric(self):
        """pidof 返回非数字 → None。"""
        svc, adapter = self._make_service()
        adapter.when(
            ["-s", "dev:5555", "shell", "pidof", "com.x.app"],
            AdbResult(0, "not a number\n", ""),
        )

        assert svc.get_pid() is None

    # ── get_dumpsys_window ────────────────────────────────────

    def test_get_dumpsys_window_success(self):
        """成功返回 stdout。"""
        svc, adapter = self._make_service()
        adapter.when(
            ["-s", "dev:5555", "shell", "dumpsys", "window", "windows"],
            AdbResult(0, "window output here", ""),
        )

        assert svc.get_dumpsys_window() == "window output here"

    def test_get_dumpsys_window_failure_returns_empty(self):
        """失败返回空字符串。"""
        svc, adapter = self._make_service()
        adapter.when(
            ["-s", "dev:5555", "shell", "dumpsys", "window", "windows"],
            AdbResult(1, "", "err"),
        )

        assert svc.get_dumpsys_window() == ""

    # ── ensure_closed ─────────────────────────────────────────

    def test_ensure_closed_app_running_stops_it(self):
        """app 在前台 → force_stop + sleep → True。"""
        svc, adapter = self._make_service()
        # check_status 调用: app 在前台
        adapter.when(
            ["-s", "dev:5555", "shell", "dumpsys", "window", "windows"],
            AdbResult(0, "com.x.app", ""),
        )
        # force_stop 调用
        adapter.when(
            ["-s", "dev:5555", "shell", "am", "force-stop", "com.x.app"],
            AdbResult(0, "", ""),
        )

        with patch("main.core.adb.app_lifecycle.time.sleep") as mock_sleep:
            assert svc.ensure_closed(wait_time=2) is True
            mock_sleep.assert_called_once_with(2)

    def test_ensure_closed_app_not_running_no_stop(self):
        """app 不在前台 → 不调 force_stop → True。"""
        svc, adapter = self._make_service()
        adapter.when(
            ["-s", "dev:5555", "shell", "dumpsys", "window", "windows"],
            AdbResult(0, "com.other.app", ""),
        )

        with patch("main.core.adb.app_lifecycle.time.sleep") as mock_sleep:
            assert svc.ensure_closed(wait_time=2) is True
            mock_sleep.assert_not_called()
        # 不应调 force_stop
        force_stop_calls = [c for c in adapter.calls if "force-stop" in c]
        assert len(force_stop_calls) == 0

    def test_ensure_closed_force_stop_failure_returns_false(self):
        """app 在前台但 force_stop 失败 → False。"""
        svc, adapter = self._make_service()
        adapter.when(
            ["-s", "dev:5555", "shell", "dumpsys", "window", "windows"],
            AdbResult(0, "com.x.app", ""),
        )
        adapter.when(
            ["-s", "dev:5555", "shell", "am", "force-stop", "com.x.app"],
            AdbResult(1, "", "err"),
        )

        with patch("main.core.adb.app_lifecycle.time.sleep"):
            assert svc.ensure_closed(wait_time=2) is False

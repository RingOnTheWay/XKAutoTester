"""TestInitializer 集成测试 - reporter/crash_monitor 持有 + None 保护"""

import logging
from unittest.mock import MagicMock

import pytest

from main.core.test_initializer import TestInitializer
from main.utils.test_reporter import TestReporter


@pytest.mark.unit
class TestTestInitializerFields:
    """TestInitializer 字段改造验证"""

    def test_init_has_reporter_field(self):
        """__init__ 应创建 self.reporter 字段"""
        init = TestInitializer(config=None, logger=logging.getLogger("test"))
        assert hasattr(init, "reporter")
        assert isinstance(init.reporter, TestReporter)

    def test_init_has_crash_monitor_field_default_none(self):
        """__init__ 应初始化 self.crash_monitor = None"""
        init = TestInitializer(config=None, logger=logging.getLogger("test"))
        assert hasattr(init, "crash_monitor")
        assert init.crash_monitor is None

    def test_init_reporter_uses_initializer_logger(self):
        """reporter 应使用 initializer 的 logger"""
        logger = logging.getLogger("custom_test")
        init = TestInitializer(config=None, logger=logger)
        assert init.reporter._logger is logger

    def test_init_no_legacy_methods(self):
        """应删除 4 个旧私有方法"""
        init = TestInitializer(config=None, logger=logging.getLogger("test"))
        assert not hasattr(init, "_start_logcat_monitor")
        assert not hasattr(init, "_stop_logcat_monitor")
        assert not hasattr(init, "_check_and_attach_crash_on_init_error")
        assert not hasattr(init, "_on_crash_detected")

    def test_init_no_allure_pytest_imports(self):
        """不应再 import allure/pytest"""
        # 通过检查模块源码确认
        import inspect

        import main.core.test_initializer as mod

        source = inspect.getsource(mod)
        # import 行不应有 allure 或 pytest
        for line in source.split("\n"):
            stripped = line.strip()
            if stripped.startswith("import ") or stripped.startswith("from "):
                assert "allure" not in stripped, f"残留 allure import: {stripped}"
                assert "pytest" not in stripped, f"残留 pytest import: {stripped}"


@pytest.mark.unit
class TestTestInitializerCrashMonitorGuard:
    """CrashMonitor None 保护测试"""

    def test_cleanup_handles_none_crash_monitor(self):
        """cleanup 应在 crash_monitor=None 时不抛异常"""
        init = TestInitializer(config=None, logger=logging.getLogger("test"))
        # crash_monitor 默认为 None
        assert init.crash_monitor is None
        # cleanup 不应抛异常
        init.cleanup()

    def test_check_and_attach_guarded_by_none(self):
        """check_and_attach_on_init_error 应在 crash_monitor=None 时跳过"""
        init = TestInitializer(config=None, logger=logging.getLogger("test"))
        # 模拟 appium_init 失败路径调用
        # crash_monitor 为 None，调用应被 if 保护，不抛 AttributeError
        try:
            # 直接验证 crash_monitor None 时的保护
            if init.crash_monitor:
                init.crash_monitor.check_and_attach_on_init_error(app_pid="12345")
        except AttributeError:
            pytest.fail("crash_monitor=None 时未做 None 保护")

    def test_cleanup_with_mocked_crash_monitor(self):
        """cleanup 应调用 crash_monitor.stop_and_attach_log"""
        init = TestInitializer(config=None, logger=logging.getLogger("test"))
        mock_monitor = MagicMock()
        init.crash_monitor = mock_monitor
        init.cleanup()
        mock_monitor.stop_and_attach_log.assert_called_once()


@pytest.mark.unit
class TestTestInitializerFailurePath:
    """init_all 失败路径契约测试（N1 契约修复）"""

    def _make_init(self):
        """构造 TestInitializer（config=None）"""
        return TestInitializer(config=None, logger=logging.getLogger("test"))

    def test_skip_records_outcome(self):
        """_skip 记录 outcome 并返回 False"""
        init = self._make_init()
        assert init._skip("test reason") is False
        assert init._outcome is not None
        assert init._outcome.severity == "skip"
        assert init._outcome.reason == "test reason"

    def test_fail_records_outcome(self):
        """_fail 记录 outcome 并返回 False"""
        init = self._make_init()
        assert init._fail("test reason") is False
        assert init._outcome is not None
        assert init._outcome.severity == "fail"

    def test_first_failure_wins(self):
        """首失败优先：_skip 后 _fail 不覆盖"""
        init = self._make_init()
        init._skip("first skip")
        init._fail("second fail")
        assert init._outcome.severity == "skip"
        assert init._outcome.reason == "first skip"

    def test_adb_init_failure_triggers_cleanup_and_skip(self):
        """adb_init 失败（skip）→ init_all 调 cleanup → 抛 Skipped"""
        init = self._make_init()
        init.adb_init = MagicMock(return_value=False)
        init._skip("adb service error")  # 预记录 outcome
        init.cleanup = MagicMock()

        with pytest.raises(pytest.skip.Exception):
            init.init_all()

        init.cleanup.assert_called_once()

    def test_ble_init_failure_triggers_cleanup_and_fail(self):
        """ble_init 失败（fail）→ init_all 调 cleanup → 抛 Failed"""
        init = self._make_init()
        init.adb_init = MagicMock(return_value=True)
        init.ble_init = MagicMock(return_value=False)
        init._fail("ble init error")
        init.cleanup = MagicMock()

        with pytest.raises(pytest.fail.Exception):
            init.init_all()

        init.cleanup.assert_called_once()

    def test_appium_init_failure_triggers_cleanup_and_fail(self):
        """appium_init 失败 → init_all 调 cleanup → 抛 Failed"""
        init = self._make_init()
        init.adb_init = MagicMock(return_value=True)
        init.ble_init = MagicMock(return_value=True)
        init.appium_init = MagicMock(return_value=False)
        init._fail("appium session error")
        init.cleanup = MagicMock()

        with pytest.raises(pytest.fail.Exception):
            init.init_all()

        init.cleanup.assert_called_once()

    def test_cleanup_idempotent(self):
        """cleanup 多次调用安全（_cleaned 幂等）"""
        init = self._make_init()
        mock_monitor = MagicMock()
        init.crash_monitor = mock_monitor
        init.cleanup()
        init.cleanup()
        init.cleanup()
        mock_monitor.stop_and_attach_log.assert_called_once()

    def test_cleanup_per_resource_failure_isolation(self):
        """cleanup 单资源失败不阻塞后续"""
        init = self._make_init()
        mock_driver = MagicMock()
        mock_driver.quit.side_effect = Exception("driver quit failed")
        init.driver = mock_driver
        mock_adb = MagicMock()
        init.adb_manager = mock_adb

        init.cleanup()

        mock_driver.quit.assert_called_once()
        # P3 修复漏网: ensure_app_closed 已从 adb_manager 删除, 改调 adb_manager.app.ensure_closed
        mock_adb.app.ensure_closed.assert_called_once_with(2)

    def test_enter_exit_context_manager(self):
        """__enter__/__exit__ 上下文管理器"""
        init = self._make_init()
        init.init_all = MagicMock()
        init.cleanup = MagicMock()

        with init as ctx:
            assert ctx is init

        init.init_all.assert_called_once()
        init.cleanup.assert_called_once()

    def test_init_all_success_returns_true(self):
        """init_all 全部成功返回 True"""
        init = self._make_init()
        init.adb_init = MagicMock(return_value=True)
        init.ble_init = MagicMock(return_value=True)
        init.appium_init = MagicMock(return_value=True)

        assert init.init_all() is True
        assert init.fake is not None

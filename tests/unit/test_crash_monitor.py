"""CrashMonitor 单元测试 - 4 方法 + mock 依赖"""

import logging
from unittest.mock import MagicMock, patch

import pytest

from main.core.adb_manager import ADBManager
from main.core.crash_monitor import CrashMonitor
from main.utils.test_reporter import TestReporter


@pytest.fixture
def mock_adb():
    """Mock ADBManager (P2: spec=ADBManager, 阻止调用漂移)"""
    adb = MagicMock(spec=ADBManager)
    adb.start_logcat_monitor.return_value = True
    adb.is_crash_detected.return_value = False
    adb.get_logcat_full_log.return_value = ""
    adb.stop_logcat_monitor.return_value = None
    adb.check_crash_logs.return_value = []
    return adb


@pytest.fixture
def mock_reporter():
    """Mock TestReporter (P2: spec=TestReporter, 阻止调用漂移)"""
    return MagicMock(spec=TestReporter)


@pytest.fixture
def crash_monitor(mock_adb, mock_reporter):
    """构造 CrashMonitor 实例"""
    logger = logging.getLogger("test_crash_monitor")
    return CrashMonitor(mock_adb, mock_reporter, logger)


@pytest.mark.unit
class TestCrashMonitorInit:
    """CrashMonitor 构造测试"""

    def test_init_stores_dependencies(self, mock_adb, mock_reporter):
        """构造时应存储 adb/reporter/logger 引用"""
        logger = logging.getLogger("test")
        monitor = CrashMonitor(mock_adb, mock_reporter, logger)
        assert monitor._adb is mock_adb
        assert monitor._reporter is mock_reporter
        assert monitor._logger is logger


@pytest.mark.unit
class TestCrashMonitorStart:
    """start 方法测试"""

    def test_start_calls_adb_start_logcat_monitor(self, crash_monitor, mock_adb):
        """start 应调用 adb.start_logcat_monitor"""
        crash_monitor.start(pid=12345)
        mock_adb.start_logcat_monitor.assert_called_once()
        _, kwargs = mock_adb.start_logcat_monitor.call_args
        assert kwargs["pid"] == 12345

    def test_start_passes_on_crash_callback(self, crash_monitor, mock_adb):
        """start 应将 on_crash_detected 作为回调传入"""
        crash_monitor.start(pid=None)
        _, kwargs = mock_adb.start_logcat_monitor.call_args
        # bound method 比较：通过 __func__ 验证指向同一函数
        assert callable(kwargs["on_crash"])
        assert kwargs["on_crash"].__func__ is CrashMonitor.on_crash_detected

    def test_start_returns_true_on_success(self, crash_monitor, mock_adb):
        """adb 返回 True 时 start 应返回 True"""
        mock_adb.start_logcat_monitor.return_value = True
        assert crash_monitor.start(pid=None) is True

    def test_start_returns_false_on_failure(self, crash_monitor, mock_adb):
        """adb 返回 False 时 start 应返回 False"""
        mock_adb.start_logcat_monitor.return_value = False
        assert crash_monitor.start(pid=None) is False

    def test_start_catches_exception_returns_false(self, crash_monitor, mock_adb):
        """adb 抛异常时 start 应捕获并返回 False"""
        mock_adb.start_logcat_monitor.side_effect = RuntimeError("adb error")
        assert crash_monitor.start(pid=None) is False


@pytest.mark.unit
class TestCrashMonitorCheckAndAttachOnInitError:
    """check_and_attach_on_init_error 方法测试"""

    def test_no_crash_no_app_pid_does_nothing(self, crash_monitor, mock_adb, mock_reporter):
        """无崩溃且无 app_pid 时不应附加"""
        mock_adb.is_crash_detected.return_value = False
        crash_monitor.check_and_attach_on_init_error(app_pid=None)
        mock_reporter.attach.assert_not_called()

    def test_crash_detected_attaches_full_log(self, crash_monitor, mock_adb, mock_reporter):
        """检测到崩溃时应附加 full_log"""
        mock_adb.is_crash_detected.return_value = True
        mock_adb.get_logcat_full_log.return_value = "FATAL EXCEPTION\nstack trace"
        crash_monitor.check_and_attach_on_init_error(app_pid=None)
        mock_reporter.attach.assert_called_once()
        args, kwargs = mock_reporter.attach.call_args
        # content 是位置参数
        assert "FATAL EXCEPTION" in args[0]

    def test_crash_detected_empty_log_no_attach(self, crash_monitor, mock_adb, mock_reporter):
        """崩溃但 full_log 为空时不附加"""
        mock_adb.is_crash_detected.return_value = True
        mock_adb.get_logcat_full_log.return_value = ""
        crash_monitor.check_and_attach_on_init_error(app_pid=None)
        mock_reporter.attach.assert_not_called()

    def test_fallback_to_check_crash_logs(self, crash_monitor, mock_adb, mock_reporter):
        """logcat 未检测到崩溃时，应回退到 check_crash_logs"""
        mock_adb.is_crash_detected.return_value = False
        mock_adb.check_crash_logs.return_value = ["crash line 1", "crash line 2"]
        crash_monitor.check_and_attach_on_init_error(app_pid="12345")
        mock_adb.check_crash_logs.assert_called_once_with("12345")
        mock_reporter.attach.assert_called_once()

    def test_fallback_no_crash_logs_no_attach(self, crash_monitor, mock_adb, mock_reporter):
        """回退检查无崩溃日志时不附加"""
        mock_adb.is_crash_detected.return_value = False
        mock_adb.check_crash_logs.return_value = []
        crash_monitor.check_and_attach_on_init_error(app_pid="12345")
        mock_reporter.attach.assert_not_called()

    def test_exception_swallowed(self, crash_monitor, mock_adb, mock_reporter):
        """异常应被捕获，不应向外抛出"""
        mock_adb.is_crash_detected.side_effect = RuntimeError("boom")
        # 不应抛异常
        crash_monitor.check_and_attach_on_init_error(app_pid=None)


@pytest.mark.unit
class TestCrashMonitorStopAndAttachLog:
    """stop_and_attach_log 方法测试"""

    def test_no_crash_attaches_app_log(self, crash_monitor, mock_adb, mock_reporter):
        """无崩溃但有日志时附加为 app log"""
        mock_adb.is_crash_detected.return_value = False
        mock_adb.get_logcat_full_log.return_value = "app log line1\napp log line2"
        crash_monitor.stop_and_attach_log()
        mock_reporter.attach.assert_called_once()
        mock_adb.stop_logcat_monitor.assert_called_once()

    def test_no_crash_empty_log_no_attach(self, crash_monitor, mock_adb, mock_reporter):
        """无崩溃且无日志时不附加"""
        mock_adb.is_crash_detected.return_value = False
        mock_adb.get_logcat_full_log.return_value = ""
        crash_monitor.stop_and_attach_log()
        mock_reporter.attach.assert_not_called()
        mock_adb.stop_logcat_monitor.assert_called_once()

    def test_crash_attaches_crash_log(self, crash_monitor, mock_adb, mock_reporter):
        """检测到崩溃时附加为 crash log"""
        mock_adb.is_crash_detected.return_value = True
        mock_adb.get_logcat_full_log.return_value = "crash trace"
        crash_monitor.stop_and_attach_log()
        mock_reporter.attach.assert_called_once()
        mock_adb.stop_logcat_monitor.assert_called_once()

    @patch("main.core.crash_monitor.time.sleep")
    def test_crash_waits_for_stack_continuation(self, mock_sleep, crash_monitor, mock_adb):
        """崩溃检测后应 sleep 等待堆栈续行"""
        mock_adb.is_crash_detected.return_value = True
        mock_adb.get_logcat_full_log.return_value = "crash"
        crash_monitor.stop_and_attach_log()
        mock_sleep.assert_called_once_with(3)

    @patch("main.core.crash_monitor.time.sleep")
    def test_no_crash_no_sleep(self, mock_sleep, crash_monitor, mock_adb):
        """无崩溃时不应 sleep"""
        mock_adb.is_crash_detected.return_value = False
        mock_adb.get_logcat_full_log.return_value = "log"
        crash_monitor.stop_and_attach_log()
        mock_sleep.assert_not_called()

    def test_exception_swallowed(self, crash_monitor, mock_adb):
        """异常应被捕获"""
        mock_adb.is_crash_detected.side_effect = RuntimeError("boom")
        # 不应抛异常
        crash_monitor.stop_and_attach_log()


@pytest.mark.unit
class TestCrashMonitorOnCrashDetected:
    """on_crash_detected 回调测试"""

    def test_logs_crash_info(self, crash_monitor):
        """应记录崩溃信息到 logger"""
        # 不应抛异常
        crash_monitor.on_crash_detected(crash_type="FATAL", crash_line="signal 11 (SIGSEGV)", full_log="partial log")

    def test_does_not_call_attach(self, crash_monitor, mock_reporter):
        """回调中不应调用 attach（避免阻塞 read_loop）"""
        crash_monitor.on_crash_detected("FATAL", "line", "log")
        mock_reporter.attach.assert_not_called()

    @patch("main.core.crash_monitor.time.sleep")
    def test_does_not_sleep(self, mock_sleep, crash_monitor):
        """回调中不应 sleep（避免阻塞 read_loop）"""
        crash_monitor.on_crash_detected("FATAL", "line", "log")
        mock_sleep.assert_not_called()

"""LogcatMonitor facade 集成测试。

验证 8 公共接口行为:
- start: 成功路径 + 重复启动返回 False
- stop: 幂等
- update_pid: 有值 + None 跳过
- crash_detected / crash_info: 属性形状
- get_full_log / get_crash_log: 委托 buffer
- on_crash 回调: 注入含崩溃行的 FakeAdbAdapter,Event.wait 同步

注入 FakeAdbAdapter,无真 subprocess,无真 adb。
"""
from __future__ import annotations

import threading

from main.core.adb.adb_port import AdbResult
from main.core.logcat_monitor import LogcatMonitor
from tests.unit.helpers.fake_adb_adapter import FakeAdbAdapter


def _make_fake_with_stream(lines: list[bytes]) -> FakeAdbAdapter:
    """构造 FakeAdbAdapter: clear_buffer 返回成功 + popen_stream 返回预注册行。"""
    fake = FakeAdbAdapter()
    fake.when(["-s", "dev:5555", "logcat", "-c"], AdbResult(0, "", ""))
    fake.when_stream(["-s", "dev:5555", "logcat"], lines)
    return fake


class TestStart:
    """start: 启动 logcat 监听。"""

    def test_start_success_returns_true_and_invokes_clear_then_stream(self):
        """start 调 clear_buffer + start_stream + 启动 daemon 线程,返回 True。"""
        fake = _make_fake_with_stream([b"06-03 14:41:33.183  123  456  I Test: hello\n"])
        monitor = LogcatMonitor(
            device_name="dev:5555",
            app_package="com.x.app",
            app_pid=123,
            adapter=fake,
        )

        try:
            result = monitor.start()

            assert result is True
            # clear_buffer 调用
            assert fake.calls[0] == ["-s", "dev:5555", "logcat", "-c"]
            # start_stream 调用
            assert fake.popen_calls[0] == [
                "-s", "dev:5555", "logcat", "-v", "threadtime",
            ]
        finally:
            monitor.stop()

    def test_start_idempotent_returns_false_on_second_call(self):
        """已运行时再次 start 返回 False (不重复启动)。"""
        fake = _make_fake_with_stream([b"line\n"])
        monitor = LogcatMonitor(
            device_name="dev:5555",
            app_package="com.x.app",
            adapter=fake,
        )

        try:
            assert monitor.start() is True
            # 第二次 start 应返回 False
            assert monitor.start() is False
        finally:
            monitor.stop()


class TestStopAndUpdatePid:
    """stop 幂等 + update_pid 行为。"""

    def test_stop_idempotent_multiple_calls_safe(self):
        """stop 多次调用不抛异常 (幂等)。"""
        fake = _make_fake_with_stream([b"line\n"])
        monitor = LogcatMonitor(
            device_name="dev:5555",
            app_package="com.x.app",
            adapter=fake,
        )
        monitor.start()

        # 多次 stop 不抛异常
        monitor.stop()
        monitor.stop()
        monitor.stop()

    def test_update_pid_with_value_updates_app_pid(self):
        """update_pid(int) 更新 app_pid 为字符串。"""
        fake = _make_fake_with_stream([b"line\n"])
        monitor = LogcatMonitor(
            device_name="dev:5555",
            app_package="com.x.app",
            adapter=fake,
        )
        assert monitor.app_pid is None

        monitor.update_pid(456)

        assert monitor.app_pid == "456"

    def test_update_pid_with_none_is_noop(self):
        """update_pid(None) 静默跳过,不修改 app_pid。"""
        fake = _make_fake_with_stream([b"line\n"])
        monitor = LogcatMonitor(
            device_name="dev:5555",
            app_package="com.x.app",
            app_pid=123,
            adapter=fake,
        )
        assert monitor.app_pid == "123"

        monitor.update_pid(None)

        # app_pid 不变
        assert monitor.app_pid == "123"


class TestCrashProperties:
    """crash_detected / crash_info / get_full_log / get_crash_log 行为。"""

    def test_initial_crash_detected_is_false(self):
        """未启动时 crash_detected 为 False。"""
        fake = _make_fake_with_stream([b"line\n"])
        monitor = LogcatMonitor(
            device_name="dev:5555",
            app_package="com.x.app",
            adapter=fake,
        )

        assert monitor.crash_detected is False

    def test_initial_crash_info_returns_falsey_dict(self):
        """未启动时 crash_info 返回 dict 形状 {crash_detected: False, crash_type: None, crash_line: None}。"""
        fake = _make_fake_with_stream([b"line\n"])
        monitor = LogcatMonitor(
            device_name="dev:5555",
            app_package="com.x.app",
            adapter=fake,
        )

        info = monitor.crash_info

        assert info == {
            "crash_detected": False,
            "crash_type": None,
            "crash_line": None,
        }

    def test_get_full_log_returns_empty_string_before_start(self):
        """未启动时 get_full_log 返回空字符串。"""
        fake = _make_fake_with_stream([b"line\n"])
        monitor = LogcatMonitor(
            device_name="dev:5555",
            app_package="com.x.app",
            adapter=fake,
        )

        assert monitor.get_full_log() == ""

    def test_get_crash_log_returns_empty_string_before_start(self):
        """未启动时 get_crash_log 返回空字符串。"""
        fake = _make_fake_with_stream([b"line\n"])
        monitor = LogcatMonitor(
            device_name="dev:5555",
            app_package="com.x.app",
            adapter=fake,
        )

        assert monitor.get_crash_log() == ""


class TestOnCrashCallback:
    """on_crash 回调集成测试 — 注入含崩溃行的 FakeAdbAdapter,Event.wait 同步。"""

    def test_on_crash_invoked_with_correct_args(self):
        """读取到 FATAL EXCEPTION 行 → on_crash(crash_type, crash_line, full_log) 被调用。"""
        # 构造日志: 普通行 + 崩溃行
        crash_lines = [
            b"06-03 14:41:33.183  123  456  I Test: normal log\n",
            b"06-03 14:41:34.000  123  456  E AndroidRuntime: FATAL EXCEPTION: main\n",
        ]
        fake = _make_fake_with_stream(crash_lines)

        callback_event = threading.Event()
        callback_args: dict = {}

        def on_crash(crash_type: str, crash_line: str, full_log: str) -> None:
            callback_args["crash_type"] = crash_type
            callback_args["crash_line"] = crash_line
            callback_args["full_log"] = full_log
            callback_event.set()

        monitor = LogcatMonitor(
            device_name="dev:5555",
            app_package="com.x.app",
            app_pid=123,
            on_crash=on_crash,
            adapter=fake,
        )

        try:
            assert monitor.start() is True
            # 等待回调触发 (最多 2 秒)
            assert callback_event.wait(timeout=2.0), "on_crash 回调未在 2 秒内触发"

            # 验证回调参数
            assert callback_args["crash_type"] == "FATAL_EXCEPTION"
            assert "FATAL EXCEPTION" in callback_args["crash_line"]
            assert "com.x.app" in callback_args["crash_line"]
            assert "FATAL EXCEPTION" in callback_args["full_log"]

            # 验证 crash 状态已更新
            assert monitor.crash_detected is True
            assert monitor.crash_info["crash_type"] == "FATAL_EXCEPTION"
        finally:
            monitor.stop()

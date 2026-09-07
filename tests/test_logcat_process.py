"""LogcatProcess 单元测试 — subprocess 边界封装。

验证:
- clear_buffer: 调 adapter.execute 传 logcat -c,返回 AdbResult
- start_stream: 调 adapter.popen_stream 传 threadtime 参数
- readline: 返回 bytes 行,EOF 返回 None
- is_alive: 反映 Popen.poll() 状态
- stop: terminate→wait→kill 幂等

注入 FakeAdbAdapter,无真 subprocess。
"""

from __future__ import annotations

from main.core.adb.adb_port import AdbResult
from main.core.logcat.logcat_process import LogcatProcess
from tests.unit.helpers.fake_adb_adapter import FakeAdbAdapter


class TestClearBuffer:
    """clear_buffer: 调 adapter.execute 传 logcat -c,返回 AdbResult。"""

    def test_clear_buffer_calls_adapter_execute_with_correct_args(self):
        """clear_buffer 调 adapter.execute,参数为 ['-s', device, 'logcat', '-c']。"""
        fake = FakeAdbAdapter()
        fake.when(["-s", "dev:5555", "logcat", "-c"], AdbResult(0, "", ""))
        proc = LogcatProcess(fake, "dev:5555")

        result = proc.clear_buffer()

        assert result.success is True
        assert fake.calls[0] == ["-s", "dev:5555", "logcat", "-c"]

    def test_clear_buffer_returns_failed_result_when_adapter_fails(self):
        """adapter 返回 returncode≠0 → result.success 为 False (不抛异常)。"""
        fake = FakeAdbAdapter()
        fake.when(["-s", "dev:5555", "logcat", "-c"], AdbResult(1, "", "device offline"))
        proc = LogcatProcess(fake, "dev:5555")

        result = proc.clear_buffer()

        assert result.success is False
        assert result.returncode == 1
        assert result.stderr == "device offline"


class TestStartStreamAndReadline:
    """start_stream + readline: 调 popen_stream 启动,readline 逐行返回 bytes。"""

    def test_start_stream_invokes_popen_stream_with_threadtime_args(self):
        """start_stream 调 adapter.popen_stream,参数含 -v threadtime,stdout/stderr=PIPE。"""
        fake = FakeAdbAdapter()
        fake.when_stream(
            ["-s", "dev:5555", "logcat"],
            [b"06-03 14:41:33.183  123  456  I Test: hello\n"],
        )
        proc = LogcatProcess(fake, "dev:5555")

        proc.start_stream()

        assert fake.popen_calls[0] == [
            "-s",
            "dev:5555",
            "logcat",
            "-v",
            "threadtime",
        ]

    def test_readline_returns_bytes_line_and_none_on_eof(self):
        """readline 返回 bytes 行 (含 \\n),读完返回 None 表示 EOF。"""
        fake = FakeAdbAdapter()
        fake.when_stream(
            ["-s", "dev:5555", "logcat"],
            [b"line1\n", b"line2\n"],
        )
        proc = LogcatProcess(fake, "dev:5555")
        proc.start_stream()

        assert proc.readline() == b"line1\n"
        assert proc.readline() == b"line2\n"
        assert proc.readline() is None  # EOF


class TestIsAliveAndStop:
    """is_alive + stop: 反映 Popen 状态,stop 幂等 + terminate→kill 分支。"""

    def test_is_alive_reflects_process_state(self):
        """is_alive: 未启动=False,运行中=True,terminated=False。"""
        fake = FakeAdbAdapter()
        fake.when_stream(["-s", "dev:5555", "logcat"], [b"line\n"])
        proc = LogcatProcess(fake, "dev:5555")

        # 未启动
        assert proc.is_alive() is False

        # 启动后运行中 (FakePopen.poll 默认返回 None)
        proc.start_stream()
        assert proc.is_alive() is True

        # terminate 后 poll 返回 0 → 不再 alive
        proc.stop()
        assert proc.is_alive() is False

    def test_stop_terminates_process_and_idempotent(self):
        """stop 调 terminate,多次调用幂等 (不抛异常)。"""
        fake = FakeAdbAdapter()
        fake.when_stream(["-s", "dev:5555", "logcat"], [b"line\n"])
        proc = LogcatProcess(fake, "dev:5555")
        proc.start_stream()

        # 第一次 stop: terminate + 置 None
        proc.stop()
        assert proc.is_alive() is False

        # 第二次 stop: 幂等,_process 已 None,直接返回
        proc.stop()
        proc.stop()  # 第三次亦然

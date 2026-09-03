"""SubprocessHandle._stop_process 单元测试 — R26 P3-12 补测试缺口

覆盖: 幂等 (process=None 直接返) / terminate 成功 / terminate 超时 → kill /
terminate 异常吞掉 (warning 不抛) / kill 异常吞掉 / finally 置 None
"""

import subprocess
from unittest.mock import MagicMock

import pytest

from main.core.subprocess_handle import SubprocessHandle


class _DummyHandle(SubprocessHandle):
    """测试子类: 简化 LABEL"""

    _LABEL = "Dummy"


@pytest.mark.unit
class TestSubprocessHandleStop:
    def test_stop_process_none_is_idempotent(self):
        """_process 为 None → 直接返回, 不抛"""
        h = _DummyHandle()
        h._process = None
        h._stop_process()
        assert h._process is None

    def test_terminate_success_sets_none(self):
        """terminate → wait 成功 → _process 置 None"""
        proc = MagicMock()
        h = _DummyHandle()
        h._process = proc

        h._stop_process()

        proc.terminate.assert_called_once()
        proc.wait.assert_called_once_with(timeout=2.0)
        proc.kill.assert_not_called()
        assert h._process is None

    def test_terminate_timeout_triggers_kill(self):
        """terminate 超时 → kill → wait(kill_timeout)"""
        proc = MagicMock()
        proc.wait.side_effect = [subprocess.TimeoutExpired("cmd", 2.0), None]
        h = _DummyHandle()
        h._process = proc

        h._stop_process()

        proc.terminate.assert_called_once()
        proc.kill.assert_called_once()
        assert proc.wait.call_count == 2
        assert h._process is None

    def test_kill_timeout_non_fatal(self):
        """kill 后 wait 也超时 → warning 不抛 (进程可能孤儿)"""
        proc = MagicMock()
        proc.wait.side_effect = subprocess.TimeoutExpired("cmd", 2.0)
        h = _DummyHandle()
        h._process = proc

        # 不应抛异常
        h._stop_process()
        assert h._process is None

    def test_terminate_exception_non_fatal(self):
        """terminate 抛异常 → 吞掉 (warning), finally 仍置 None"""
        proc = MagicMock()
        proc.terminate.side_effect = OSError("already dead")
        h = _DummyHandle()
        h._process = proc

        h._stop_process()
        assert h._process is None

    def test_custom_timeouts(self):
        """显式 terminate_timeout/kill_timeout 覆写类属性"""
        proc = MagicMock()
        proc.wait.side_effect = [subprocess.TimeoutExpired("cmd", 1.0), None]
        h = _DummyHandle()
        h._process = proc

        h._stop_process(terminate_timeout=1.5, kill_timeout=0.5)

        assert proc.wait.call_args_list[0].kwargs["timeout"] == 1.5
        assert proc.wait.call_args_list[1].kwargs["timeout"] == 0.5

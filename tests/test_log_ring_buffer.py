"""log_ring_buffer 纯数据结构单元测试。

验证:
- append + snapshot: 追加 + 完整快照
- eviction: maxlen 驱逐最旧
- crash_context: 崩溃行 ± context_lines 窗口
- crash_context 无崩溃: 返回最后 N 行
- crash_context 空 buffer: 空字符串

纯数据结构,无 IO/线程。
"""

from __future__ import annotations

from main.core.logcat.crash_detector import is_crash_line
from main.core.logcat.log_ring_buffer import LogRingBuffer


class TestAppendAndSnapshot:
    """追加 + 完整快照。"""

    def test_empty_buffer_returns_empty_string(self):
        buf = LogRingBuffer(maxlen=10)
        assert buf.snapshot() == ""

    def test_append_single_line(self):
        buf = LogRingBuffer(maxlen=10)
        buf.append("line1")
        assert buf.snapshot() == "line1"

    def test_append_multiple_lines_joined_by_newline(self):
        buf = LogRingBuffer(maxlen=10)
        buf.append("line1")
        buf.append("line2")
        buf.append("line3")
        assert buf.snapshot() == "line1\nline2\nline3"


class TestEviction:
    """maxlen 驱逐最旧。"""

    def test_evicts_oldest_when_full(self):
        buf = LogRingBuffer(maxlen=2)
        buf.append("a")
        buf.append("b")
        buf.append("c")  # a 被驱逐
        assert buf.snapshot() == "b\nc"

    def test_maxlen_one_keeps_last_only(self):
        buf = LogRingBuffer(maxlen=1)
        buf.append("first")
        buf.append("second")
        assert buf.snapshot() == "second"


class TestCrashContext:
    """崩溃行 ± context_lines 窗口提取。"""

    def test_returns_window_around_crash_line(self):
        """崩溃行前 5 行 + 崩溃行 + 后 5 行。"""
        buf = LogRingBuffer(maxlen=100)
        for i in range(20):
            buf.append(f"normal {i}")
        buf.append("E AndroidRuntime: FATAL EXCEPTION: main")
        for i in range(20):
            buf.append(f"stack {i}")

        result = buf.crash_context(is_crash_line, context_lines=5)

        assert "FATAL EXCEPTION" in result
        assert "normal 15" in result  # 前 5 行 (normal 15..19)
        assert "normal 14" not in result  # 之前的不在窗口
        assert "stack 4" in result  # 后 5 行 (stack 0..4)
        assert "stack 5" not in result  # 之后的不在窗口

    def test_returns_last_n_lines_when_no_crash(self):
        """无崩溃行 → 返回最后 context_lines 行。"""
        buf = LogRingBuffer(maxlen=100)
        for i in range(30):
            buf.append(f"normal {i}")

        result = buf.crash_context(is_crash_line, context_lines=10)

        assert "normal 20" in result
        assert "normal 29" in result
        assert "normal 19" not in result  # 之前的不在窗口

    def test_empty_buffer_returns_empty_string(self):
        buf = LogRingBuffer(maxlen=10)
        assert buf.crash_context(is_crash_line) == ""

    def test_crash_at_start_returns_crash_plus_context(self):
        """崩溃行在 buffer 开头 → 返回崩溃行 + 后 context_lines 行。"""
        buf = LogRingBuffer(maxlen=100)
        buf.append("E AndroidRuntime: FATAL EXCEPTION: main")
        for i in range(10):
            buf.append(f"stack {i}")

        result = buf.crash_context(is_crash_line, context_lines=3)

        assert "FATAL EXCEPTION" in result
        assert "stack 0" in result
        assert "stack 2" in result
        assert "stack 3" not in result  # 超出窗口

    def test_default_context_lines_is_50(self):
        """默认 context_lines=50。"""
        buf = LogRingBuffer(maxlen=200)
        for i in range(60):
            buf.append(f"normal {i}")
        buf.append("E AndroidRuntime: FATAL EXCEPTION: main")
        for i in range(60):
            buf.append(f"stack {i}")

        result = buf.crash_context(is_crash_line)

        # 默认 50 行上下文
        assert "FATAL EXCEPTION" in result
        assert "normal 10" in result  # 前 50 行 (normal 10..59)
        assert "normal 9" not in result
        assert "stack 49" in result  # 后 50 行 (stack 0..49)
        assert "stack 50" not in result

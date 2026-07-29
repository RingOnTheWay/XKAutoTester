"""logcat_parser 纯函数单元测试。

验证:
- parse_threadtime_line: -v threadtime 格式解析
- parse_time_line: -v time 回退格式解析
- should_capture: PID/包名/崩溃 tag 过滤
- format_line: 完整格式化 + 过滤
- LOG_LEVEL_MAP: 级别映射

纯函数,无 mock,无 IO。
"""
from __future__ import annotations

from main.core.logcat.logcat_parser import (
    LOG_LEVEL_MAP,
    format_line,
    parse_threadtime_line,
    parse_time_line,
    should_capture,
)


class TestParseThreadtimeLine:
    """-v threadtime 格式解析。

    格式: MM-DD HH:MM:SS.mmm  PID  TID LEVEL TAG: MESSAGE
    """

    def test_parse_typical_threadtime_line(self):
        """典型 threadtime 行解析为 6 元组。"""
        raw = "06-03 14:41:33.183  123  456  E AndroidRuntime: FATAL EXCEPTION: main"
        parsed = parse_threadtime_line(raw)

        assert parsed is not None
        ts, pid, tid, level, tag, msg = parsed
        assert ts == "06-03 14:41:33.183"
        assert pid == "123"
        assert tid == "456"
        assert level == "E"
        assert tag == "AndroidRuntime"
        assert msg == "FATAL EXCEPTION: main"

    def test_parse_returns_none_on_non_matching_line(self):
        """非 threadtime 格式返回 None。"""
        assert parse_threadtime_line("random text not a logcat line") is None
        assert parse_threadtime_line("") is None
        # -v time 格式 (回退) 不应被 threadtime 解析器匹配
        assert parse_threadtime_line("06-03 14:41:33.183 E/AndroidRuntime( 123): msg") is None


class TestParseTimeLine:
    """-v time 回退格式解析。

    格式: MM-DD HH:MM:SS.mmm LEVEL/TAG(PID): MESSAGE
    """

    def test_parse_typical_time_line(self):
        """典型 time 格式行解析为 5 元组。"""
        raw = "06-03 14:41:33.183 E/AndroidRuntime( 123): FATAL EXCEPTION: main"
        parsed = parse_time_line(raw)

        assert parsed is not None
        ts, level, tag, pid, msg = parsed
        assert ts == "06-03 14:41:33.183"
        assert level == "E"
        assert tag == "AndroidRuntime"
        assert pid == "123"
        assert msg == "FATAL EXCEPTION: main"

    def test_parse_time_line_returns_none_on_non_matching(self):
        """非 time 格式返回 None。"""
        assert parse_time_line("random text") is None
        # threadtime 格式不应被 time 解析器匹配
        assert parse_time_line("06-03 14:41:33.183  123  456  E AndroidRuntime: msg") is None


class TestShouldCapture:
    """PID/包名/崩溃 tag 过滤逻辑。

    优先级 (从高到低):
    1. crash_capture_remaining > 0 → True (崩溃后续捕获)
    2. PID 匹配 → True
    3. 消息含包名 → True
    4. 崩溃相关 tag + E级别 + 关键词 → True
    5. 默认 → False
    """

    def test_crash_capture_mode_always_captures(self):
        """crash_capture_remaining > 0 时无条件捕获。"""
        assert should_capture(
            "999", "UnknownTag", "I", "no package here",
            app_pid="123", app_package="com.x.app",
            crash_capture_remaining=100,
        ) is True

    def test_pid_match_captures(self):
        """PID 匹配 app_pid 时捕获。"""
        assert should_capture(
            "123", "AnyTag", "I", "any msg",
            app_pid="123", app_package="com.x.app",
            crash_capture_remaining=0,
        ) is True

    def test_package_in_message_captures(self):
        """消息中包含包名时捕获 (系统对 app 的操作)。"""
        assert should_capture(
            "999", "ActivityManager", "I", "Force stopping com.x.app",
            app_pid="123", app_package="com.x.app",
            crash_capture_remaining=0,
        ) is True

    def test_crash_related_tag_with_keyword_captures(self):
        """崩溃相关 tag + E级别 + 关键词 → 捕获。"""
        assert should_capture(
            "999", "AndroidRuntime", "E", "FATAL EXCEPTION: main",
            app_pid="123", app_package="com.x.app",
            crash_capture_remaining=0,
        ) is True

    def test_crash_related_tag_without_keyword_skipped(self):
        """崩溃相关 tag + E级别 但无关键词 → 不捕获。"""
        assert should_capture(
            "999", "AndroidRuntime", "E", "normal message",
            app_pid="123", app_package="com.x.app",
            crash_capture_remaining=0,
        ) is False

    def test_default_no_match_returns_false(self):
        """默认情况 (PID 不匹配 + 无包名 + 非崩溃 tag) → 不捕获。"""
        assert should_capture(
            "999", "SomeApp", "I", "unrelated message",
            app_pid="123", app_package="com.x.app",
            crash_capture_remaining=0,
        ) is False

    def test_no_app_pid_skips_pid_branch(self):
        """app_pid=None 时 PID 匹配分支跳过 (不报错)。"""
        assert should_capture(
            "123", "AnyTag", "I", "msg",
            app_pid=None, app_package="com.x.app",
            crash_capture_remaining=0,
        ) is False


class TestFormatLine:
    """完整格式化 + 过滤。

    输出格式: YYYY-MM-DD HH:MM:SS.mmm  PACKAGE  LEVEL  MESSAGE
    """

    def test_threadtime_happy_path(self):
        """threadtime 行格式化为精简风格。"""
        raw = "06-03 14:41:33.183  123  456  E AndroidRuntime: FATAL EXCEPTION: main"
        result = format_line(
            raw,
            app_package="com.x.app",
            app_pid="123",
            min_log_level=LOG_LEVEL_MAP["I"],
            crash_capture_remaining=0,
            current_year="2026",
        )
        assert result is not None
        assert result == "2026-06-03 14:41:33.183  com.x.app  E  FATAL EXCEPTION: main"

    def test_filters_low_log_level(self):
        """V 级别 < I 最低级别 → 过滤返回 None。"""
        raw = "06-03 14:41:33.183  123  456  V SomeTag: debug noise"
        result = format_line(
            raw,
            app_package="com.x.app",
            app_pid="123",
            min_log_level=LOG_LEVEL_MAP["I"],
            crash_capture_remaining=0,
            current_year="2026",
        )
        assert result is None

    def test_time_format_fallback(self):
        """-v time 格式回退解析 + 格式化。"""
        raw = "06-03 14:41:33.183 E/AndroidRuntime( 123): FATAL EXCEPTION: main"
        result = format_line(
            raw,
            app_package="com.x.app",
            app_pid="123",
            min_log_level=LOG_LEVEL_MAP["I"],
            crash_capture_remaining=0,
            current_year="2026",
        )
        assert result is not None
        assert result == "2026-06-03 14:41:33.183  com.x.app  E  FATAL EXCEPTION: main"

    def test_unmatched_line_in_crash_capture_mode_kept(self):
        """不匹配的行 + 崩溃捕获模式 → 保留原始 (精简格式)。"""
        raw = "    at com.x.app.MainActivity.onCreate(MainActivity.java:42)"
        result = format_line(
            raw,
            app_package="com.x.app",
            app_pid="123",
            min_log_level=LOG_LEVEL_MAP["I"],
            crash_capture_remaining=50,
            current_year="2026",
        )
        assert result is not None
        assert "com.x.app" in result
        assert raw in result

    def test_unmatched_line_without_crash_capture_returns_none(self):
        """不匹配的行 + 无崩溃捕获 → None。"""
        raw = "    at com.x.app.MainActivity.onCreate(MainActivity.java:42)"
        result = format_line(
            raw,
            app_package="com.x.app",
            app_pid="123",
            min_log_level=LOG_LEVEL_MAP["I"],
            crash_capture_remaining=0,
            current_year="2026",
        )
        assert result is None

    def test_filters_non_matching_pid(self):
        """PID 不匹配 + 无包名 + 非崩溃 tag → None。"""
        raw = "06-03 14:41:33.183  999  999  I OtherApp: unrelated message"
        result = format_line(
            raw,
            app_package="com.x.app",
            app_pid="123",
            min_log_level=LOG_LEVEL_MAP["I"],
            crash_capture_remaining=0,
            current_year="2026",
        )
        assert result is None


class TestLogLevelMap:
    """日志级别映射。"""

    def test_level_ordering(self):
        """V < D < I < W < E < F"""
        assert LOG_LEVEL_MAP["V"] < LOG_LEVEL_MAP["D"]
        assert LOG_LEVEL_MAP["D"] < LOG_LEVEL_MAP["I"]
        assert LOG_LEVEL_MAP["I"] < LOG_LEVEL_MAP["W"]
        assert LOG_LEVEL_MAP["W"] < LOG_LEVEL_MAP["E"]
        assert LOG_LEVEL_MAP["E"] < LOG_LEVEL_MAP["F"]

    def test_level_indices(self):
        """级别对应索引。"""
        assert LOG_LEVEL_MAP["V"] == 0
        assert LOG_LEVEL_MAP["I"] == 2
        assert LOG_LEVEL_MAP["F"] == 5

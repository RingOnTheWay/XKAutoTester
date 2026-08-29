"""crash_detector 纯函数单元测试。

验证:
- is_crash_line: 5 崩溃模式检测 (FATAL/PROCESS_DIED/NATIVE/ANR/负例)
- detect_crash_type: 4 类型分类 + UNKNOWN 兜底
- has_crash_keyword: 关键词匹配 (大小写不敏感)

纯函数,无 mock,无 IO。
"""

from __future__ import annotations

from main.core.logcat.crash_detector import (
    detect_crash_type,
    has_crash_keyword,
    is_crash_line,
)


class TestIsCrashLine:
    """5 崩溃模式检测。"""

    def test_fatal_exception_pattern(self):
        assert is_crash_line("E AndroidRuntime: FATAL EXCEPTION: main") is True

    def test_process_died_pattern(self):
        assert is_crash_line("Process com.x.app (pid 123) has died") is True

    def test_native_signal_pattern(self):
        assert is_crash_line("signal 11 (SIGSEGV)") is True

    def test_anr_pattern(self):
        assert is_crash_line("ANR in com.x.app") is True
        assert is_crash_line("Application Not Responding") is True

    def test_non_crash_line_returns_false(self):
        assert is_crash_line("I ActivityManager: normal log") is False
        assert is_crash_line("") is False
        assert is_crash_line("random text") is False


class TestDetectCrashType:
    """4 类型分类 + UNKNOWN 兜底。"""

    def test_fatal_exception_type(self):
        assert detect_crash_type("FATAL EXCEPTION: main") == "FATAL_EXCEPTION"

    def test_native_crash_type(self):
        assert detect_crash_type("signal 11 (SIGSEGV)") == "NATIVE_CRASH"

    def test_process_died_type(self):
        assert detect_crash_type("Process com.x (pid 1) has died") == "PROCESS_DIED"

    def test_anr_type(self):
        assert detect_crash_type("ANR in com.x") == "ANR"

    def test_unknown_crash_type_for_unmatched(self):
        # is_crash_line=True 但 detect_crash_type 无匹配 → UNKNOWN
        # 注意: 实际所有 is_crash_line=True 的行都应被某个 pattern 匹配
        # 此测试验证兜底逻辑
        assert detect_crash_type("totally unrelated text") == "UNKNOWN_CRASH"


class TestHasCrashKeyword:
    """关键词匹配 (大小写不敏感)。"""

    def test_has_died_keyword(self):
        assert has_crash_keyword("Process has died") is True

    def test_has_fatal_keyword(self):
        assert has_crash_keyword("FATAL EXCEPTION") is True

    def test_has_anr_keyword_case_insensitive(self):
        assert has_crash_keyword("anr in com.x") is True

    def test_no_keyword(self):
        assert has_crash_keyword("normal log message") is False
        assert has_crash_keyword("") is False

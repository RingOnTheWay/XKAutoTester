"""text.py 单元测试 - clean_ansi_escape"""

import pytest

from main.utils.text import clean_ansi_escape


@pytest.mark.unit
class TestCleanAnsiEscape:
    """clean_ansi_escape 函数测试"""

    def test_plain_text_unchanged(self):
        """普通文本应保持不变"""
        assert clean_ansi_escape("hello world") == "hello world"

    def test_empty_string(self):
        """空字符串应返回空"""
        assert clean_ansi_escape("") == ""

    def test_basic_color_codes(self):
        """基础 ANSI 颜色码应被移除"""
        text = "\x1b[31mred text\x1b[0m"
        assert clean_ansi_escape(text) == "red text"

    def test_bold_codes(self):
        """粗体 ANSI 码应被移除"""
        text = "\x1b[1mbold\x1b[0m"
        assert clean_ansi_escape(text) == "bold"

    def test_multiple_codes(self):
        """多个 ANSI 码混合应全部移除"""
        text = "\x1b[32;1msuccess\x1b[0m \x1b[33mwarning\x1b[0m"
        assert clean_ansi_escape(text) == "success warning"

    def test_256_color_codes(self):
        """256 色 ANSI 码应被移除"""
        text = "\x1b[38;5;196mred256\x1b[0m"
        assert clean_ansi_escape(text) == "red256"

    def test_rgb_color_codes(self):
        """RGB 真彩色 ANSI 码应被移除"""
        text = "\x1b[38;2;255;0;0mrgb red\x1b[0m"
        assert clean_ansi_escape(text) == "rgb red"

    def test_pytest_colored_output(self):
        """pytest 着色输出应被清理"""
        text = "\x1b[32m.\x1b[0m\x1b[32m.\x1b[0m\x1b[31mF\x1b[0m"
        assert clean_ansi_escape(text) == "..F"

    def test_cursor_movement(self):
        """光标移动 ANSI 码应被移除"""
        text = "\x1b[2Khello\x1b[1G"
        result = clean_ansi_escape(text)
        assert "hello" in result
        assert "\x1b" not in result

    def test_no_side_effects_on_clean_input(self):
        """对无 ANSI 的输入，输出应等于输入"""
        text = "100% pure text"
        assert clean_ansi_escape(text) == text

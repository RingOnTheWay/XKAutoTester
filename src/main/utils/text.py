"""
文本处理工具模块
"""

import re

# ANSI 转义序列正则（编译一次复用）
_ANSI_ESCAPE_RE = re.compile(r"\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])")


def clean_ansi_escape(text: str) -> str:
    """
    清理 ANSI 转义字符

    Args:
        text: 可能包含 ANSI 转义序列的文本

    Returns:
        清理后的纯文本
    """
    return _ANSI_ESCAPE_RE.sub("", text)

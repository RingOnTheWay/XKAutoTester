"""LogRingBuffer — 日志环形缓冲区 (纯数据结构)。

提供:
- append(line): 追加一行
- snapshot(): 返回完整日志 (join by \\n)
- crash_context(is_crash, context_lines=50): 返回崩溃上下文窗口

设计:
- 内部 deque(maxlen=N),自动驱逐最旧
- 锁由调用方持有 (避免双锁,LogcatMonitor 持 _lock)
- 无 IO/线程/i18n,完全可测
"""

from __future__ import annotations

from collections import deque
from collections.abc import Callable


class LogRingBuffer:
    """日志环形缓冲区。

    Attributes:
        maxlen: 最大容量,超出驱逐最旧
    """

    def __init__(self, maxlen: int = 500) -> None:
        """
        Args:
            maxlen: 最大行数 (默认 500,与原 LogcatMonitor 一致)
        """
        self._buffer: deque = deque(maxlen=maxlen)

    def append(self, line: str) -> None:
        """追加一行到缓冲区。超出 maxlen 自动驱逐最旧。"""
        self._buffer.append(line)

    def snapshot(self) -> str:
        """返回完整日志 (join by \\n)。空 buffer 返回空字符串。"""
        return "\n".join(self._buffer)

    def crash_context(
        self,
        is_crash: Callable[[str], bool],
        context_lines: int = 50,
    ) -> str:
        """返回崩溃上下文窗口。

        找到第一个崩溃行,返回 [crash_index - context_lines, crash_index + context_lines] 窗口。
        无崩溃行 → 返回最后 context_lines 行。
        空 buffer → 空字符串。

        Args:
            is_crash: 判断行是否为崩溃行的函数 (纯函数)
            context_lines: 上下文行数 (默认 50)

        Returns:
            崩溃上下文窗口 (join by \\n)
        """
        log_list = list(self._buffer)
        if not log_list:
            return ""

        crash_index = -1
        for i, line in enumerate(log_list):
            if is_crash(line):
                crash_index = i
                break

        if crash_index == -1:
            # 无崩溃行: 返回最后 context_lines 行
            start = max(0, len(log_list) - context_lines)
            return "\n".join(log_list[start:])

        # 崩溃行 ± context_lines
        start = max(0, crash_index - context_lines)
        end = min(len(log_list), crash_index + context_lines + 1)
        return "\n".join(log_list[start:end])

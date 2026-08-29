"""crash 检测纯函数。

提供:
- is_crash_line: 判断是否为致命闪退日志行
- detect_crash_type: 检测崩溃类型 (FATAL_EXCEPTION/NATIVE_CRASH/PROCESS_DIED/ANR/UNKNOWN)
- has_crash_keyword: 检查消息是否含崩溃关键词 (大小写不敏感)

5 崩溃模式:
- FATAL EXCEPTION (Java 异常)
- Process ... has died (进程死亡)
- Killing ... (进程被杀)
- signal N (SIGxxx) (Native 崩溃)
- ANR in ... / Application Not Responding (ANR)

纯函数,无 IO/线程/i18n,完全可测。
"""

from __future__ import annotations

import re

FATAL_EXCEPTION_PATTERN = re.compile(r"FATAL\s+EXCEPTION")
PROCESS_DIED_PATTERN = re.compile(r"Process\s+.+\(pid\s+\d+\)\s+has\s+died")
PROCESS_KILL_PATTERN = re.compile(r"Killing\s+\d+:.+?:\s+")
NATIVE_SIGNAL_PATTERN = re.compile(r"signal\s+\d+\s+\(SIG\w+\)")
ANR_PATTERN = re.compile(r"ANR\s+in\s+.+|Application\s+Not\s+Responding|anr\s+in", re.IGNORECASE)

_CRASH_KEYWORDS = ("has died", "Killing", "FATAL", "crash", "ANR", "not responding")


def is_crash_line(line: str) -> bool:
    """判断是否为致命闪退日志行。

    Args:
        line: 原始 logcat 行 (或格式化后的行)

    Returns:
        True 若匹配任一崩溃模式
    """
    return bool(
        FATAL_EXCEPTION_PATTERN.search(line)
        or PROCESS_DIED_PATTERN.search(line)
        or PROCESS_KILL_PATTERN.search(line)
        or NATIVE_SIGNAL_PATTERN.search(line)
        or ANR_PATTERN.search(line)
    )


def detect_crash_type(line: str) -> str:
    """检测崩溃类型。

    Args:
        line: 原始 logcat 行 (或格式化后的行)

    Returns:
        'FATAL_EXCEPTION' | 'NATIVE_CRASH' | 'PROCESS_DIED' | 'ANR' | 'UNKNOWN_CRASH'
    """
    if FATAL_EXCEPTION_PATTERN.search(line):
        return "FATAL_EXCEPTION"
    if NATIVE_SIGNAL_PATTERN.search(line):
        return "NATIVE_CRASH"
    if PROCESS_DIED_PATTERN.search(line):
        return "PROCESS_DIED"
    if ANR_PATTERN.search(line):
        return "ANR"
    return "UNKNOWN_CRASH"


def has_crash_keyword(message: str) -> bool:
    """检查消息是否包含崩溃相关关键词 (大小写不敏感)。

    用于 should_capture 的崩溃 tag 分支: 即使 PID 不匹配,
    崩溃相关 tag (AndroidRuntime/DEBUG 等) + 关键词 也应捕获。

    Args:
        message: logcat 消息部分

    Returns:
        True 若含任一崩溃关键词
    """
    msg_lower = message.lower()
    return any(kw.lower() in msg_lower for kw in _CRASH_KEYWORDS)

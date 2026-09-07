"""logcat 行解析纯函数。

提供:
- parse_threadtime_line: -v threadtime 格式解析
- parse_time_line: -v time 回退格式解析
- should_capture: PID/包名/崩溃 tag 过滤
- format_line: 完整格式化 + 过滤

格式:
- threadtime: MM-DD HH:MM:SS.mmm  PID  TID LEVEL TAG: MESSAGE
- time:       MM-DD HH:MM:SS.mmm LEVEL/TAG(PID): MESSAGE

输出格式 (精简):
    YYYY-MM-DD HH:MM:SS.mmm  PACKAGE  LEVEL  MESSAGE

纯函数,无 IO/线程/i18n,完全可测。
"""

from __future__ import annotations

import re

from main.core.logcat.crash_detector import has_crash_keyword

# logcat 时间戳行格式 (-v threadtime)
# 格式: MM-DD HH:MM:SS.mmm  PID  TID LEVEL TAG: MESSAGE
# 注意: PID 和 TID 之间是空格 (可能多个),不是连字符
# 注意: LEVEL 和 TAG 之间可能是 / 或空格 (不同 Android 版本格式不同)
TIMESTAMP_LINE_PATTERN = re.compile(
    r"^(\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3})\s+(\d+)\s+(\d+)\s+([VDIWEF])[/\s]+(.+?):\s+(.*?)$"
)

# logcat 行格式正则 (-v time 回退)
# 格式: MM-DD HH:MM:SS.mmm LEVEL/TAG(PID): MESSAGE
TIME_LINE_PATTERN = re.compile(r"^(\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3})\s+([VDIWEF])/(.+?)\(\s*(\d+)\):\s+(.*?)$")

# 日志级别映射 (V<D<I<W<E<F)
LOG_LEVELS = "VDIWEF"
LOG_LEVEL_MAP = {c: i for i, c in enumerate(LOG_LEVELS)}

# 崩溃相关的系统 tag: 即使 PID 不匹配也需要捕获
CRASH_RELATED_TAGS = {
    "AndroidRuntime",
    "System.err",
    "DEBUG",
    "ActivityManager",
    "Process",
    "ActivityThread",
    "AndroidRuntimeUtils",
}


def parse_threadtime_line(raw: str) -> tuple[str, str, str, str, str, str] | None:
    """匹配 -v threadtime 格式。

    Args:
        raw: 原始 logcat 行

    Returns:
        (timestamp, pid, tid, level, tag, message) 或 None (不匹配)
        tag 已 strip 去空白
    """
    match = TIMESTAMP_LINE_PATTERN.match(raw)
    if not match:
        return None
    ts, pid, tid, level, tag, msg = match.groups()
    return ts, pid, tid, level, tag.strip(), msg


def parse_time_line(raw: str) -> tuple[str, str, str, str, str] | None:
    """匹配 -v time 回退格式。

    Args:
        raw: 原始 logcat 行

    Returns:
        (timestamp, level, tag, pid, message) 或 None (不匹配)
        tag 已 strip 去空白
    """
    match = TIME_LINE_PATTERN.match(raw)
    if not match:
        return None
    ts, level, tag, pid, msg = match.groups()
    return ts, level, tag.strip(), pid, msg


def should_capture(
    pid: str,
    tag: str,
    level: str,
    message: str,
    *,
    app_pid: str | None,
    app_package: str,
    crash_capture_remaining: int,
) -> bool:
    """判断是否捕获该日志行 (纯函数)。

    核心原则: 只保留与所测试包名相关的日志行。

    优先级 (从高到低):
    1. crash_capture_remaining > 0 → True (崩溃后续捕获堆栈)
    2. PID 匹配 → True (该进程的所有日志)
    3. 消息中包含包名 → True (系统对 app 的操作记录)
    4. 崩溃相关 tag + E级别 + 关键词 → True
    5. 默认 → False
    """
    # 1. 崩溃捕获模式
    if crash_capture_remaining > 0:
        return True

    # 2. PID 匹配: 该进程的所有日志都保留
    if app_pid and pid == app_pid:
        return True

    # 3. 消息中包含包名: 系统对 app 的操作 (Force stopping / Start proc / has died 等)
    if app_package in message:
        return True

    # 4. 崩溃相关 tag + E级别 + 关键词
    level_idx = LOG_LEVEL_MAP.get(level, 0)
    if tag in CRASH_RELATED_TAGS and level_idx >= LOG_LEVEL_MAP.get("E", 4):
        if has_crash_keyword(message):
            return True

    return False


def format_line(
    raw: str,
    *,
    app_package: str,
    app_pid: str | None,
    min_log_level: int,
    crash_capture_remaining: int,
    current_year: str,
) -> str | None:
    """格式化 logcat 行为精简风格 (纯函数)。

    输出格式: YYYY-MM-DD HH:MM:SS.mmm  PACKAGE  LEVEL  MESSAGE

    Args:
        raw: 原始 logcat 行
        app_package: 应用包名 (用于过滤 + 输出)
        app_pid: 应用 PID (用于过滤,None 表示未知)
        min_log_level: 最低日志级别 (LOG_LEVEL_MAP 索引)
        crash_capture_remaining: 崩溃后续捕获计数器 (>0 时保留所有行)
        current_year: 当前年份 (避免每行 time.strftime 调用)

    Returns:
        格式化后的字符串,或 None (被过滤)
    """
    # 优先匹配 -v threadtime 格式
    parsed = parse_threadtime_line(raw)
    if parsed:
        ts, pid, _tid, level, tag, msg = parsed
        if LOG_LEVEL_MAP.get(level, 0) < min_log_level:
            return None
        if not should_capture(
            pid,
            tag,
            level,
            msg,
            app_pid=app_pid,
            app_package=app_package,
            crash_capture_remaining=crash_capture_remaining,
        ):
            return None
        return f"{current_year}-{ts}  {app_package}  {level}  {msg}"

    # 回退匹配 -v time 格式
    parsed_t = parse_time_line(raw)
    if parsed_t:
        ts, level, tag, pid, msg = parsed_t
        if LOG_LEVEL_MAP.get(level, 0) < min_log_level:
            return None
        if not should_capture(
            pid,
            tag,
            level,
            msg,
            app_pid=app_pid,
            app_package=app_package,
            crash_capture_remaining=crash_capture_remaining,
        ):
            return None
        return f"{current_year}-{ts}  {app_package}  {level}  {msg}"

    # 不匹配的行: 崩溃捕获模式下保留 (精简格式,固定时间戳占位)
    if crash_capture_remaining > 0:
        return f"{current_year}-01-01 00:00:00.000  {app_package}  {raw}"

    return None

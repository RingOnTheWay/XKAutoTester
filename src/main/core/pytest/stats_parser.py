"""stats_parser: pytest 输出统计解析纯函数。

剥离自 PytestRunner._parse_test_stats, 消除局部 import re 副作用。

解析规则:
- 逆序查找含 "N passed|failed|skipped|broken" 的汇总行
- 4 正则提取各状态计数
- total = passed + failed + skipped + broken
"""

from __future__ import annotations

import re

_SUMMARY_LINE_PATTERN = re.compile(r"\d+\s+(passed|failed|skipped|broken)")
_PASSED_PATTERN = re.compile(r"(\d+)\s+passed")
_FAILED_PATTERN = re.compile(r"(\d+)\s+failed")
_SKIPPED_PATTERN = re.compile(r"(\d+)\s+skipped")
_BROKEN_PATTERN = re.compile(r"(\d+)\s+broken")


def parse_test_stats(stdout: str) -> dict[str, int]:
    """从 pytest -v 输出末尾解析用例统计 (纯函数)。

    pytest -v 输出的最后一行格式示例:
    - "5 passed, 2 failed, 3 skipped, 1 broken in 10.5s"
    - "3 passed in 1.2s"
    - "2 skipped in 0.5s"
    - "1 failed, 1 passed in 2.0s"
    - "no tests ran in 0.0s"

    Args:
        stdout: pytest stdout 全文 (ANSI 已清理)

    Returns:
        {"passed", "failed", "skipped", "broken", "total"} 计数字典。
        无汇总行时全 0。
    """
    stats = {"passed": 0, "failed": 0, "skipped": 0, "broken": 0, "total": 0}

    if not stdout:
        return stats

    lines = stdout.strip().split("\n")
    summary_line: str | None = None
    for line in reversed(lines):
        if _SUMMARY_LINE_PATTERN.search(line.strip()):
            summary_line = line.strip()
            break

    if not summary_line:
        return stats

    passed_match = _PASSED_PATTERN.search(summary_line)
    failed_match = _FAILED_PATTERN.search(summary_line)
    skipped_match = _SKIPPED_PATTERN.search(summary_line)
    broken_match = _BROKEN_PATTERN.search(summary_line)

    stats["passed"] = int(passed_match.group(1)) if passed_match else 0
    stats["failed"] = int(failed_match.group(1)) if failed_match else 0
    stats["skipped"] = int(skipped_match.group(1)) if skipped_match else 0
    stats["broken"] = int(broken_match.group(1)) if broken_match else 0
    stats["total"] = stats["passed"] + stats["failed"] + stats["skipped"] + stats["broken"]

    return stats

"""stats_parser 纯函数单元测试。

验证 parse_test_stats: 从 pytest -v 输出末尾解析用例统计
- 混合统计 (passed+failed+skipped+broken)
- 单状态汇总
- 无用例 (no tests ran)
- 空输入 / 无汇总行
- 多汇总行取末尾

纯函数, 无 mock, 无 IO。
"""
from __future__ import annotations

from main.core.pytest.stats_parser import parse_test_stats


class TestParseTestStats:
    """parse_test_stats 纯函数测试。"""

    def test_mixed_stats(self) -> None:
        """混合统计: 5 passed, 2 failed, 3 skipped, 1 broken → total=11。"""
        stdout = """
tests/test_a.py::test_1 PASSED
tests/test_a.py::test_2 PASSED
tests/test_b.py::test_3 FAILED
===== 5 passed, 2 failed, 3 skipped, 1 broken in 10.5s =====
"""
        stats = parse_test_stats(stdout)

        assert stats["passed"] == 5
        assert stats["failed"] == 2
        assert stats["skipped"] == 3
        assert stats["broken"] == 1
        assert stats["total"] == 11

    def test_single_passed_only(self) -> None:
        """单状态汇总: "3 passed in 1.2s" → passed=3, 其余 0, total=3。"""
        stats = parse_test_stats("=== 3 passed in 1.2s ===")

        assert stats["passed"] == 3
        assert stats["failed"] == 0
        assert stats["skipped"] == 0
        assert stats["broken"] == 0
        assert stats["total"] == 3

    def test_no_tests_ran(self) -> None:
        """无用例: "no tests ran in 0.0s" → 全 0 (无 N + 状态匹配)。"""
        stats = parse_test_stats("no tests ran in 0.0s")

        assert stats["passed"] == 0
        assert stats["failed"] == 0
        assert stats["skipped"] == 0
        assert stats["broken"] == 0
        assert stats["total"] == 0

    def test_empty_string(self) -> None:
        """空字符串输入 → 全 0。"""
        stats = parse_test_stats("")

        assert stats == {"passed": 0, "failed": 0, "skipped": 0, "broken": 0, "total": 0}

    def test_no_summary_line(self) -> None:
        """无汇总行 (无 N + passed/failed/...) → 全 0。"""
        stats = parse_test_stats("random text\nno stats here\njust output")

        assert stats["total"] == 0

    def test_multiple_summary_lines_takes_last(self) -> None:
        """多汇总行: 逆序找第一个匹配, 即最后一行汇总。"""
        stdout = """1 passed in 1.0s
some middle text
3 failed, 2 passed in 5.0s"""
        stats = parse_test_stats(stdout)

        assert stats["passed"] == 2
        assert stats["failed"] == 3
        assert stats["total"] == 5

    def test_failed_and_passed_only(self) -> None:
        """仅 passed+failed: "1 failed, 1 passed in 2.0s"。"""
        stats = parse_test_stats("1 failed, 1 passed in 2.0s")

        assert stats["passed"] == 1
        assert stats["failed"] == 1
        assert stats["skipped"] == 0
        assert stats["broken"] == 0
        assert stats["total"] == 2

    def test_skipped_only(self) -> None:
        """仅 skipped: "2 skipped in 0.5s"。"""
        stats = parse_test_stats("2 skipped in 0.5s")

        assert stats["skipped"] == 2
        assert stats["total"] == 2

    def test_broken_state(self) -> None:
        """broken 状态: "1 broken in 3.0s"。"""
        stats = parse_test_stats("1 broken in 3.0s")

        assert stats["broken"] == 1
        assert stats["total"] == 1

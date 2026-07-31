"""summary_formatter 纯函数单元测试。

验证 format_test_summary: 测试结果 dict → i18n 摘要字符串
- exit_code 0/1/2/3/4/5/unknown 各状态映射
- test_stats 拼接 (caseStatsLine + passRateLine)
- effective_total=0 时 pass_rate=0.0
- allure_results_dir / markers / test_paths 各段条件拼接

纯函数, 通过 monkeypatch t() 隔离 i18n 单例。
"""
from __future__ import annotations

from typing import Any

import pytest

from main.core.pytest import summary_formatter as fmt_module
from main.core.pytest.summary_formatter import format_test_summary


def _fake_t(key: str, **kwargs: Any) -> str:
    """伪 t(): 返回 [key:sorted(kwargs)], 便于断言 i18n key + 参数。"""
    if not kwargs:
        return f"[{key}]"
    parts = [f"{k}={v}" for k, v in sorted(kwargs.items())]
    return f"[{key}:{','.join(parts)}]"


@pytest.fixture
def patch_t(monkeypatch: pytest.MonkeyPatch) -> None:
    """替换 summary_formatter.t 为 _fake_t, 隔离真实 i18n。"""
    monkeypatch.setattr(fmt_module, "t", _fake_t)


class TestFormatTestSummary:
    """format_test_summary 纯函数测试。"""

    def test_success_with_full_stats(self, patch_t: None) -> None:
        """exit_code=0 + 全 stats + allure + markers + paths → 全段拼接。"""
        result = {
            "exit_code": 0,
            "test_stats": {"passed": 5, "failed": 2, "skipped": 1, "broken": 0, "total": 8},
            "allure_results_dir": "/tmp/allure-results",
            "markers": ["smoke", "unit"],
            "test_paths": ["tests/test_a.py", "tests/test_b.py"],
        }

        summary = format_test_summary(result)

        # 状态行 (exit_code=0 → statusPassed)
        assert "[python.pytestRunner.statusPassed]" in summary
        # testStatusLine 包含 status
        assert "[python.pytestRunner.testStatusLine:status=[python.pytestRunner.statusPassed]]" in summary
        # caseStatsLine 含各计数
        assert "[python.pytestRunner.caseStatsLine:" in summary
        assert "passed=5" in summary
        assert "failed=2" in summary
        assert "skipped=1" in summary
        assert "broken=0" in summary
        assert "total=8" in summary
        # passRateLine: effective_total = 5+2+0 = 7, pass_rate = 5/7*100 ≈ 71.43
        assert "[python.pytestRunner.passRateLine:pass_rate=71.43]" in summary
        # allureResultsLine
        assert "[python.pytestRunner.allureResultsLine:path=/tmp/allure-results]" in summary
        # testMarkersLine (markers 用 ", " join)
        assert "[python.pytestRunner.testMarkersLine:markers=smoke, unit]" in summary
        # testPathsLine (test_paths 用 ", " join)
        assert "[python.pytestRunner.testPathsLine:paths=tests/test_a.py, tests/test_b.py]" in summary

    @pytest.mark.parametrize(
        "exit_code,expected_status_key",
        [
            (0, "python.pytestRunner.statusPassed"),
            (1, "python.pytestRunner.statusFailed"),
            (2, "python.pytestRunner.statusInterrupted"),
            (3, "python.pytestRunner.statusInternalError"),
            (4, "python.pytestRunner.statusUsageError"),
            (5, "python.pytestRunner.statusNoTestsCollected"),
        ],
    )
    def test_exit_code_status_mapping(
        self, patch_t: None, exit_code: int, expected_status_key: str
    ) -> None:
        """exit_code 0-5 各映射到对应 status i18n key。"""
        result = {"exit_code": exit_code, "markers": [], "test_paths": []}

        summary = format_test_summary(result)

        assert f"[{expected_status_key}]" in summary

    def test_unknown_exit_code_includes_exit_code(self, patch_t: None) -> None:
        """exit_code=99 (unknown) → statusUnknown 含 exit_code=99 参数。"""
        result = {"exit_code": 99, "markers": [], "test_paths": []}

        summary = format_test_summary(result)

        assert "[python.pytestRunner.statusUnknown:exit_code=99]" in summary

    def test_no_test_stats_skips_stats_lines(self, patch_t: None) -> None:
        """无 test_stats 字段 → 不拼接 caseStatsLine / passRateLine。"""
        result = {"exit_code": 5, "markers": [], "test_paths": []}

        summary = format_test_summary(result)

        assert "caseStatsLine" not in summary
        assert "passRateLine" not in summary

    def test_zero_total_skips_stats_lines(self, patch_t: None) -> None:
        """test_stats.total=0 → 不拼接 caseStatsLine / passRateLine (无用例)。"""
        result = {
            "exit_code": 5,
            "test_stats": {"passed": 0, "failed": 0, "skipped": 0, "broken": 0, "total": 0},
            "markers": [],
            "test_paths": [],
        }

        summary = format_test_summary(result)

        assert "caseStatsLine" not in summary
        assert "passRateLine" not in summary

    def test_all_skipped_pass_rate_zero(self, patch_t: None) -> None:
        """全 skipped (effective_total=0) → pass_rate=0.00。"""
        result = {
            "exit_code": 0,
            "test_stats": {"passed": 0, "failed": 0, "skipped": 5, "broken": 0, "total": 5},
            "markers": [],
            "test_paths": [],
        }

        summary = format_test_summary(result)

        assert "[python.pytestRunner.passRateLine:pass_rate=0.00]" in summary

    def test_no_allure_dir_skips_allure_line(self, patch_t: None) -> None:
        """allure_results_dir 缺失/None → 不拼接 allureResultsLine。"""
        result = {
            "exit_code": 0,
            "allure_results_dir": None,
            "markers": [],
            "test_paths": [],
        }

        summary = format_test_summary(result)

        assert "allureResultsLine" not in summary

    def test_empty_markers_skips_markers_line(self, patch_t: None) -> None:
        """markers=[] → 不拼接 testMarkersLine。"""
        result = {"exit_code": 0, "markers": [], "test_paths": []}

        summary = format_test_summary(result)

        assert "testMarkersLine" not in summary

    def test_empty_test_paths_skips_paths_line(self, patch_t: None) -> None:
        """test_paths=[] → 不拼接 testPathsLine。"""
        result = {"exit_code": 0, "markers": [], "test_paths": []}

        summary = format_test_summary(result)

        assert "testPathsLine" not in summary

    def test_pass_rate_calculation(self, patch_t: None) -> None:
        """pass_rate = passed / (passed+failed+broken) * 100, 保留 2 位小数。

        10 passed, 5 failed, 5 broken → effective=20, rate=50.00
        """
        result = {
            "exit_code": 1,
            "test_stats": {"passed": 10, "failed": 5, "skipped": 0, "broken": 5, "total": 20},
            "markers": [],
            "test_paths": [],
        }

        summary = format_test_summary(result)

        assert "[python.pytestRunner.passRateLine:pass_rate=50.00]" in summary

    def test_single_marker(self, patch_t: None) -> None:
        """单 marker: markers=["smoke"] → testMarkersLine:markers=smoke。"""
        result = {"exit_code": 0, "markers": ["smoke"], "test_paths": []}

        summary = format_test_summary(result)

        assert "[python.pytestRunner.testMarkersLine:markers=smoke]" in summary

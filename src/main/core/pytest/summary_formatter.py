"""summary_formatter: 测试结果摘要 i18n 拼接纯函数。

剥离自 PytestRunner.get_test_summary, 消除 self 隐式依赖。

拼接规则:
- exit_code → status (6 状态 + unknown)
- test_stats.total>0 → caseStatsLine + passRateLine
- effective_total = passed+failed+broken (skipped 不计入通过率分母)
- allure_results_dir / markers / test_paths 条件追加
"""

from __future__ import annotations

from typing import Any

from main.utils.i18n import t


def format_test_summary(result: dict[str, Any]) -> str:
    """格式化测试结果摘要为 i18n 字符串 (纯函数)。

    Args:
        result: run_tests 返回 dict, 必含 exit_code/markers/test_paths 键,
                可选 test_stats/allure_results_dir。

    Returns:
        i18n 拼接的摘要字符串 (多段相连, 无分隔符, 由 i18n 模板决定换行)
    """
    exit_code = result["exit_code"]
    test_stats = result.get("test_stats", {})

    if exit_code == 0:
        status = t("python.pytestRunner.statusPassed")
    elif exit_code == 1:
        status = t("python.pytestRunner.statusFailed")
    elif exit_code == 2:
        status = t("python.pytestRunner.statusInterrupted")
    elif exit_code == 3:
        status = t("python.pytestRunner.statusInternalError")
    elif exit_code == 4:
        status = t("python.pytestRunner.statusUsageError")
    elif exit_code == 5:
        status = t("python.pytestRunner.statusNoTestsCollected")
    else:
        status = t("python.pytestRunner.statusUnknown", exit_code=exit_code)

    summary = t("python.pytestRunner.testStatusLine", status=status)

    if test_stats and test_stats.get("total", 0) > 0:
        passed = test_stats.get("passed", 0)
        failed = test_stats.get("failed", 0)
        skipped = test_stats.get("skipped", 0)
        broken = test_stats.get("broken", 0)
        total = test_stats.get("total", 0)
        effective_total = passed + failed + broken
        if effective_total > 0:
            pass_rate = (passed / effective_total) * 100
        else:
            pass_rate = 0.0
        summary += t(
            "python.pytestRunner.caseStatsLine",
            passed=passed,
            failed=failed,
            skipped=skipped,
            broken=broken,
            total=total,
        )
        summary += t("python.pytestRunner.passRateLine", pass_rate=f"{pass_rate:.2f}")

    if result.get("allure_results_dir"):
        summary += t("python.pytestRunner.allureResultsLine", path=result["allure_results_dir"])

    if result["markers"]:
        summary += t("python.pytestRunner.testMarkersLine", markers=", ".join(result["markers"]))

    if result["test_paths"]:
        summary += t("python.pytestRunner.testPathsLine", paths=", ".join(result["test_paths"]))

    return summary

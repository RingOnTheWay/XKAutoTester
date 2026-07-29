"""args_builder: pytest 命令行参数构建纯函数。

剥离自 PytestRunner._build_pytest_args, 消除 self.allure_results_dir /
self.project_root 隐式依赖, 改为显式参数。

拼接规则:
- markers: OR 拼接 (-m "a or b")
- keywords: AND 拼接 (-k "a and b")
"""
from __future__ import annotations

from pathlib import Path


def build_pytest_args(
    test_paths: list[str],
    markers: list[str] | None = None,
    keywords: list[str] | None = None,
    allure_results_dir: Path | None = None,
    pytest_ini_path: Path | None = None,
) -> list[str]:
    """构建 pytest 命令行参数 (纯函数, 无副作用)。

    Args:
        test_paths: 测试路径列表 (首位, 原样 extend)
        markers: 标记列表, OR 拼接为 -m 参数 (None/空跳过)
        keywords: 关键字列表, AND 拼接为 -k 参数 (None/空跳过)
        allure_results_dir: --alluredir 路径 (None 跳过)
        pytest_ini_path: -c 配置文件路径 (None 跳过)

    Returns:
        pytest 命令行参数列表 (不含 `python -m pytest` 前缀)
    """
    args: list[str] = []
    args.extend(test_paths)
    args.extend(["-v"])
    args.extend(["--color", "yes"])
    # --capture=no: 禁用 pytest fd 捕获, 避免 'Captured stderr setup' 末尾重发
    # 与 log_cli=true (pytest.ini) 重复。捕获禁用后输出实时流到父进程 stderr。
    args.extend(["--capture=no"])
    # -p no:logging: 禁用 pytest logging 插件, 避免 'Captured log setup/call/teardown' 段
    # (测试结束时重发, 与 root logger console_handler 实时输出重复)。
    # 测试代码 logger 走 root logger console_handler, 不受此插件影响。
    # 副作用: 丢失 caplog fixture (项目测试代码未使用)。
    args.extend(["-p", "no:logging"])

    if markers:
        marker_expr = " or ".join(markers)
        args.extend(["-m", marker_expr])

    if keywords:
        keyword_expr = " and ".join(keywords)
        args.extend(["-k", keyword_expr])

    if allure_results_dir is not None:
        args.extend(["--alluredir", str(allure_results_dir)])

    if pytest_ini_path is not None:
        args.extend(["-c", str(pytest_ini_path)])

    return args

"""path_resolver: 测试路径解析纯函数。

剥离自 PytestRunner.run_custom_tests 内联 4 策略回退, 消除 logger 副作用。

4 策略顺序 (与原行为一致):
1. 直接路径 (os.path.exists, cwd 相对/绝对)
2. project_root / path.rstrip("/")  (相对项目根)
3. project_root / "tests" / path.rstrip("/")
4. project_root / "tests" / path  (文件名查找)

返回路径相对 project_root (越界用绝对路径)。
"""
from __future__ import annotations

import os
from pathlib import Path


def resolve_test_paths(test_paths: list[str], project_root: Path) -> list[str]:
    """解析测试路径, 4 策略回退 (纯函数, 无日志副作用)。

    Args:
        test_paths: 原始测试路径列表 (相对/绝对/文件名)
        project_root: 项目根目录

    Returns:
        有效路径列表 (相对 project_root 的 str; 越界用绝对路径)。
        无效路径跳过, 不在结果中。
    """
    valid_paths: list[str] = []

    for path in test_paths:
        full_path: Path | None = None

        # 1. 尝试直接使用路径 (cwd 相对/绝对)
        if os.path.exists(path):
            full_path = Path(path)
        else:
            # 2. 相对 project_root
            relative_path = project_root / path.rstrip("/")
            if relative_path.exists():
                full_path = relative_path
            else:
                # 3. project_root / tests / path (rstrip)
                tests_path = project_root / "tests" / path.rstrip("/")
                if tests_path.exists():
                    full_path = tests_path
                else:
                    # 4. project_root / tests / path (文件名, 不 rstrip)
                    filename_path = project_root / "tests" / path
                    if filename_path.exists():
                        full_path = filename_path

        if full_path and full_path.exists():
            try:
                relative = full_path.relative_to(project_root)
                valid_paths.append(str(relative))
            except ValueError:
                # 路径不在 project_root 子树内 → 用绝对路径
                valid_paths.append(str(full_path))

    return valid_paths

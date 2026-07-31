"""path_resolver 纯函数单元测试。

验证 resolve_test_paths: 4 策略回退解析测试路径
- 策略 1: 直接路径 (os.path.exists, cwd 相对/绝对)
- 策略 2: project_root / path (相对项目根)
- 策略 3: project_root / tests / path.rstrip("/")
- 策略 4: project_root / tests / path (文件名查找)
- 路径在 project_root 内 → 返回相对路径
- 路径在 project_root 外 → 返回绝对路径
- 无效路径 → 不在结果中

纯函数, 无 mock, 无 logger 副作用, 使用 tmp_path 隔离 fs。
"""
from __future__ import annotations

from pathlib import Path

from main.core.pytest.path_resolver import resolve_test_paths


class TestResolveTestPaths:
    """resolve_test_paths 纯函数测试。"""

    def test_strategy2_relative_to_project_root(self, tmp_path: Path) -> None:
        """策略 2: path 相对 project_root 存在 → 返回相对路径。

        创建 tmp_path/tests/test_a.py, 传入 "tests/test_a.py"。
        - 策略 1 os.path.exists("tests/test_a.py") 依赖 cwd, 通常 False
        - 策略 2 tmp_path / "tests/test_a.py" 存在 ✓
        - relative_to(tmp_path) → "tests/test_a.py"
        """
        tests_dir = tmp_path / "tests"
        tests_dir.mkdir()
        test_file = tests_dir / "test_a.py"
        test_file.touch()

        result = resolve_test_paths(["tests/test_a.py"], tmp_path)

        assert len(result) == 1
        assert Path(result[0]) == Path("tests") / "test_a.py"

    def test_strategy3_under_tests_subdir(self, tmp_path: Path) -> None:
        """策略 3: path 不在 project_root 下, 但在 project_root/tests/ 下。

        创建 tmp_path/tests/sub/test_b.py, 传入 "sub/test_b.py"。
        - 策略 1 cwd 相对, 通常 False
        - 策略 2 tmp_path / "sub/test_b.py" 不存在
        - 策略 3 tmp_path / "tests" / "sub/test_b.py" 存在 ✓
        """
        tests_sub = tmp_path / "tests" / "sub"
        tests_sub.mkdir(parents=True)
        (tests_sub / "test_b.py").touch()

        result = resolve_test_paths(["sub/test_b.py"], tmp_path)

        assert len(result) == 1
        assert Path(result[0]) == Path("tests") / "sub" / "test_b.py"

    def test_strategy4_filename_in_tests(self, tmp_path: Path) -> None:
        """策略 4: 纯文件名在 tests/ 下查找。

        创建 tmp_path/tests/test_c.py, 传入 "test_c.py"。
        - 策略 1 cwd 相对, 通常 False
        - 策略 2 tmp_path / "test_c.py" 不存在
        - 策略 3 tmp_path / "tests" / "test_c.py" 存在 ✓ (rstrip 无变化)
        """
        tests_dir = tmp_path / "tests"
        tests_dir.mkdir()
        (tests_dir / "test_c.py").touch()

        result = resolve_test_paths(["test_c.py"], tmp_path)

        assert len(result) == 1
        assert Path(result[0]) == Path("tests") / "test_c.py"

    def test_strategy1_absolute_path_under_project_root(self, tmp_path: Path) -> None:
        """策略 1: 绝对路径存在 + 在 project_root 内 → 相对路径。"""
        test_file = tmp_path / "tests" / "test_d.py"
        test_file.parent.mkdir(parents=True)
        test_file.touch()

        result = resolve_test_paths([str(test_file)], tmp_path)

        assert len(result) == 1
        assert Path(result[0]) == Path("tests") / "test_d.py"

    def test_absolute_path_outside_project_root(self, tmp_path: Path) -> None:
        """策略 1: 绝对路径存在 + 在 project_root 外 → 绝对路径 (relative_to 抛 ValueError)。"""
        # tmp_path 自身是 project_root; 用其父目录中其他路径模拟"外部"
        outside_file = tmp_path.parent / "outside_test.py"
        outside_file.touch()

        try:
            result = resolve_test_paths([str(outside_file)], tmp_path)

            assert len(result) == 1
            assert Path(result[0]) == outside_file
        finally:
            outside_file.unlink()

    def test_invalid_path_skipped(self, tmp_path: Path) -> None:
        """无效路径 → 不在结果中。"""
        result = resolve_test_paths(["nonexistent/path.py"], tmp_path)

        assert result == []

    def test_mixed_valid_and_invalid(self, tmp_path: Path) -> None:
        """混合: 有效 + 无效 → 仅有效路径返回。"""
        tests_dir = tmp_path / "tests"
        tests_dir.mkdir()
        (tests_dir / "valid.py").touch()

        result = resolve_test_paths(["tests/valid.py", "invalid.py"], tmp_path)

        assert len(result) == 1
        assert Path(result[0]) == Path("tests") / "valid.py"

    def test_trailing_slash_stripped_in_strategy2(self, tmp_path: Path) -> None:
        """策略 2: path 末尾 / 被 rstrip 处理 (目录路径)。"""
        sub_dir = tmp_path / "tests"
        sub_dir.mkdir()

        result = resolve_test_paths(["tests/"], tmp_path)

        assert len(result) == 1
        assert Path(result[0]) == Path("tests")

    def test_empty_input_returns_empty(self, tmp_path: Path) -> None:
        """空 test_paths → 空列表。"""
        result = resolve_test_paths([], tmp_path)

        assert result == []

    def test_directory_path_returns_relative(self, tmp_path: Path) -> None:
        """目录路径: tests/ 整目录 → 相对路径。"""
        tests_dir = tmp_path / "tests"
        tests_dir.mkdir()

        result = resolve_test_paths(["tests"], tmp_path)

        assert len(result) == 1
        assert Path(result[0]) == Path("tests")

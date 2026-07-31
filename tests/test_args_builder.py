"""args_builder 纯函数单元测试。

验证 build_pytest_args: pytest 命令行参数构建
- 全路径基础参数 (test_paths + -v + --color yes + --alluredir + -c pytest.ini)
- markers OR 拼接
- keywords AND 拼接
- None 参数兜底

纯函数, 无 mock, 无 IO。
"""
from __future__ import annotations

from pathlib import Path

from main.core.pytest.args_builder import build_pytest_args


class TestBuildPytestArgs:
    """build_pytest_args 纯函数测试。"""

    def test_full_path_basic_args(self, tmp_path: Path) -> None:
        """全路径基础参数: test_paths + -v + --color yes + --alluredir + -c pytest.ini。

        markers/keywords=None 跳过过滤参数。
        """
        allure_dir = tmp_path / "allure-results"
        ini_path = tmp_path / "pytest.ini"

        args = build_pytest_args(
            test_paths=["tests/"],
            allure_results_dir=allure_dir,
            pytest_ini_path=ini_path,
        )

        # test_paths 首位
        assert args[0] == "tests/"
        # -v 详细输出
        assert "-v" in args
        # --color yes
        assert "--color" in args
        color_idx = args.index("--color")
        assert args[color_idx + 1] == "yes"
        # --alluredir <path>
        assert "--alluredir" in args
        allure_idx = args.index("--alluredir")
        assert args[allure_idx + 1] == str(allure_dir)
        # -c <path>
        assert "-c" in args
        c_idx = args.index("-c")
        assert args[c_idx + 1] == str(ini_path)
        # markers/keywords=None 不应出现 -m / -k
        assert "-m" not in args
        assert "-k" not in args

    def test_markers_or_joined(self, tmp_path: Path) -> None:
        """markers 列表 OR 拼接为 -m "a or b or c"。"""
        args = build_pytest_args(
            test_paths=["tests/"],
            markers=["smoke", "unit", "fast"],
            allure_results_dir=tmp_path / "allure-results",
            pytest_ini_path=tmp_path / "pytest.ini",
        )

        assert "-m" in args
        m_idx = args.index("-m")
        assert args[m_idx + 1] == "smoke or unit or fast"

    def test_single_marker(self, tmp_path: Path) -> None:
        """单 marker 不拼接, 直接传字符串。"""
        args = build_pytest_args(
            test_paths=["tests/"],
            markers=["smoke"],
            allure_results_dir=tmp_path / "allure-results",
            pytest_ini_path=tmp_path / "pytest.ini",
        )

        m_idx = args.index("-m")
        assert args[m_idx + 1] == "smoke"

    def test_keywords_and_joined(self, tmp_path: Path) -> None:
        """keywords 列表 AND 拼接为 -k "a and b and c"。"""
        args = build_pytest_args(
            test_paths=["tests/"],
            keywords=["test_login", "test_logout"],
            allure_results_dir=tmp_path / "allure-results",
            pytest_ini_path=tmp_path / "pytest.ini",
        )

        assert "-k" in args
        k_idx = args.index("-k")
        assert args[k_idx + 1] == "test_login and test_logout"

    def test_markers_and_keywords_coexist(self, tmp_path: Path) -> None:
        """markers 和 keywords 同时出现: -m 在 -k 之前 (按代码顺序)。"""
        args = build_pytest_args(
            test_paths=["tests/"],
            markers=["smoke"],
            keywords=["test_login"],
            allure_results_dir=tmp_path / "allure-results",
            pytest_ini_path=tmp_path / "pytest.ini",
        )

        m_idx = args.index("-m")
        k_idx = args.index("-k")
        assert m_idx < k_idx
        assert args[m_idx + 1] == "smoke"
        assert args[k_idx + 1] == "test_login"

    def test_empty_markers_skipped(self, tmp_path: Path) -> None:
        """空 markers 列表跳过 -m 参数 (falsy 短路)。"""
        args = build_pytest_args(
            test_paths=["tests/"],
            markers=[],
            allure_results_dir=tmp_path / "allure-results",
            pytest_ini_path=tmp_path / "pytest.ini",
        )

        assert "-m" not in args

    def test_none_allure_and_ini_skipped(self) -> None:
        """allure_results_dir 和 pytest_ini_path 为 None 时跳过对应参数。"""
        args = build_pytest_args(test_paths=["tests/"])

        assert "--alluredir" not in args
        assert "-c" not in args
        assert "-v" in args
        assert "--color" in args

    def test_multiple_test_paths_extended(self, tmp_path: Path) -> None:
        """多 test_paths 原序 extend 到 args 头部。"""
        args = build_pytest_args(
            test_paths=["tests/test_a.py", "tests/test_b.py", "tests/sub/"],
            allure_results_dir=tmp_path / "allure-results",
            pytest_ini_path=tmp_path / "pytest.ini",
        )

        assert args[0] == "tests/test_a.py"
        assert args[1] == "tests/test_b.py"
        assert args[2] == "tests/sub/"

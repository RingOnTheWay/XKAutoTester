"""paths 模块单元测试 (R24 P2-9 补测试缺口)。

覆盖:
- PROJECT_ROOT / get_project_root
- XKAUTOTESTER_USER_DATA 环境变量注入 (打包模式) 与回退
- XKAUTOTESTER_LOCALES_PATH 注入与回退
- get_config_root / get_config_file / get_logs_path 组合路径
"""

from pathlib import Path

from main.utils import paths


def test_project_root_static_and_function() -> None:
    # src/main/utils/ 上溯 4 层 = 项目根
    expected = Path(__file__).parent.parent
    assert paths.PROJECT_ROOT == expected
    assert paths.get_project_root() == expected


def test_user_data_root_fallback_to_project_root(monkeypatch) -> None:
    monkeypatch.delenv("XKAUTOTESTER_USER_DATA", raising=False)
    assert paths.get_user_data_root() == paths.PROJECT_ROOT


def test_user_data_root_env_injection(monkeypatch) -> None:
    monkeypatch.setenv("XKAUTOTESTER_USER_DATA", "C:/Users/test/xkat-data")
    assert paths.get_user_data_root() == Path("C:/Users/test/xkat-data")


def test_locales_root_fallback_to_source_path() -> None:
    assert paths.get_locales_root() == paths.PROJECT_ROOT / "electron" / "locales"


def test_locales_root_env_injection(monkeypatch) -> None:
    monkeypatch.setenv("XKAUTOTESTER_LOCALES_PATH", "D:/res/locales")
    assert paths.get_locales_root() == Path("D:/res/locales")


def test_config_root_and_file_compose_from_user_data(monkeypatch) -> None:
    monkeypatch.setenv("XKAUTOTESTER_USER_DATA", "/tmp/xkat-data")
    assert paths.get_config_root() == Path("/tmp/xkat-data/config")
    assert paths.get_config_file() == Path("/tmp/xkat-data/config/config.json")


def test_logs_path_compose(monkeypatch) -> None:
    monkeypatch.setenv("XKAUTOTESTER_USER_DATA", "/tmp/xkat-data")
    assert paths.get_logs_path() == Path("/tmp/xkat-data/logs")
    assert paths.get_logs_path("pytest", "2026-08-29.log") == Path("/tmp/xkat-data/logs/pytest/2026-08-29.log")

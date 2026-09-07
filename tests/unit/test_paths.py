"""main/utils/paths.py 单元测试 — R25 补 R24 遗留测试缺口

路径模块集中抽象 project_root / user_data_root / locales_root / config / logs。
覆盖:
1. get_project_root / PROJECT_ROOT 常量 (源码上溯 4 层)
2. get_user_data_root: env 优先, 回退 PROJECT_ROOT
3. get_locales_root: env 优先, 回退 electron/locales
4. get_config_root / get_config_file: 基于 user_data_root
5. get_logs_path: 无参 / 带 subdirs
"""

from pathlib import Path

import pytest

from main.utils.paths import (
    PROJECT_ROOT,
    get_config_file,
    get_config_root,
    get_locales_root,
    get_logs_path,
    get_project_root,
    get_user_data_root,
)


@pytest.mark.unit
class TestPaths:
    def test_project_root_constant_upwalks_4_levels(self):
        """PROJECT_ROOT = src/main/utils → 上溯 4 层 = 项目根"""
        expected = Path(__file__).resolve().parents[2]  # tests/unit/test_paths.py → 项目根
        assert PROJECT_ROOT == expected
        assert (PROJECT_ROOT / "src" / "main").is_dir(), "项目根含 src/main"
        assert (PROJECT_ROOT / "electron").is_dir(), "项目根含 electron"

    def test_get_project_root_returns_constant(self):
        assert get_project_root() == PROJECT_ROOT

    def test_get_user_data_root_env_priority(self, monkeypatch):
        monkeypatch.setenv("XKAUTOTESTER_USER_DATA", "/tmp/xkat-userdata")
        assert get_user_data_root() == Path("/tmp/xkat-userdata")

    def test_get_user_data_root_fallback_project_root(self, monkeypatch):
        monkeypatch.delenv("XKAUTOTESTER_USER_DATA", raising=False)
        assert get_user_data_root() == PROJECT_ROOT

    def test_get_locales_root_env_priority(self, monkeypatch):
        monkeypatch.setenv("XKAUTOTESTER_LOCALES_PATH", "/tmp/xkat-locales")
        assert get_locales_root() == Path("/tmp/xkat-locales")

    def test_get_locales_root_fallback_electron_locales(self, monkeypatch):
        monkeypatch.delenv("XKAUTOTESTER_LOCALES_PATH", raising=False)
        assert get_locales_root() == PROJECT_ROOT / "electron" / "locales"
        assert (PROJECT_ROOT / "electron" / "locales").is_dir(), "开发模式 locales 目录存在"

    def test_get_config_root_based_on_user_data(self, monkeypatch):
        monkeypatch.setenv("XKAUTOTESTER_USER_DATA", "/tmp/xkat-userdata")
        assert get_config_root() == Path("/tmp/xkat-userdata") / "config"

    def test_get_config_file(self, monkeypatch):
        monkeypatch.setenv("XKAUTOTESTER_USER_DATA", "/tmp/xkat-userdata")
        assert get_config_file() == Path("/tmp/xkat-userdata") / "config" / "config.json"

    def test_get_logs_path_no_subdirs(self, monkeypatch):
        monkeypatch.setenv("XKAUTOTESTER_USER_DATA", "/tmp/xkat-userdata")
        assert get_logs_path() == Path("/tmp/xkat-userdata") / "logs"

    def test_get_logs_path_with_subdirs(self, monkeypatch):
        monkeypatch.setenv("XKAUTOTESTER_USER_DATA", "/tmp/xkat-userdata")
        assert get_logs_path("XKAT") == Path("/tmp/xkat-userdata") / "logs" / "XKAT"
        assert get_logs_path("Appium", "sub") == Path("/tmp/xkat-userdata") / "logs" / "Appium" / "sub"

"""ConfigManager 单元测试 - 验证默认配置单源策略

测试覆盖:
1. _load_config 文件存在时正确读取
2. _load_config 文件不存在时抛 FileNotFoundError (不再写默认配置)
3. _load_config JSON 损坏时抛 json.JSONDecodeError (不再自动恢复)
4. _detect_config_path 支持 XKAUTOTESTER_USER_DATA 环境变量
5. 模块不再导出 DEFAULT_CONFIG
6. 不存在 _save_default_config 方法
"""

import json
import os
from unittest import mock

import pytest

from main.utils import config as config_module
from main.utils.config import ConfigManager


@pytest.mark.unit
class TestConfigManagerFallback:
    """ConfigManager fallback 行为测试"""

    def test_load_config_file_exists(self, tmp_path):
        """文件存在时正确读取"""
        config_file = tmp_path / "config.json"
        config_data = {"APP_SETTINGS": {"autoCheckUpdate": True, "language": "zh-CN"}}
        config_file.write_text(json.dumps(config_data), encoding="utf-8")

        manager = ConfigManager(config_path=str(config_file))
        assert manager.config == config_data
        assert manager.get("APP_SETTINGS.autoCheckUpdate") is True

    def test_load_config_file_not_found_raises(self, tmp_path):
        """文件不存在时抛 FileNotFoundError, 不再写默认配置"""
        missing_file = tmp_path / "nonexistent.json"
        with pytest.raises(FileNotFoundError, match="Config file not found"):
            ConfigManager(config_path=str(missing_file))

        # 验证未创建文件
        assert not missing_file.exists()

    def test_load_config_invalid_json_raises(self, tmp_path):
        """JSON 损坏时抛 json.JSONDecodeError, 不再自动恢复"""
        bad_file = tmp_path / "config.json"
        bad_file.write_text("{ invalid json !!!", encoding="utf-8")

        with pytest.raises(json.JSONDecodeError):
            ConfigManager(config_path=str(bad_file))

        # 验证未覆盖文件
        assert "invalid json" in bad_file.read_text(encoding="utf-8")

    def test_detect_config_path_uses_env_var(self):
        """_detect_config_path 优先使用 XKAUTOTESTER_USER_DATA"""
        with mock.patch.dict(os.environ, {"XKAUTOTESTER_USER_DATA": "/tmp/fake_user_data"}):
            manager = ConfigManager.__new__(ConfigManager)  # 不触发 __init__
            path = manager._detect_config_path()
            # 跨平台兼容: 用 PurePath 比较部分
            assert "fake_user_data" in path.parts
            assert path.name == "config.json"

    def test_detect_config_path_fallback_to_project_root(self):
        """无环境变量时回退到项目根目录 config/config.json"""
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("XKAUTOTESTER_USER_DATA", None)
            manager = ConfigManager.__new__(ConfigManager)
            path = manager._detect_config_path()
            # 路径应包含 config/config.json
            assert path.parts[-2] == "config"
            assert path.parts[-1] == "config.json"


@pytest.mark.unit
class TestConfigManagerSingleSource:
    """验证 config.py 不再硬编码 DEFAULT_CONFIG"""

    def test_module_has_no_default_config_constant(self):
        """模块不应再有 DEFAULT_CONFIG 常量"""
        assert not hasattr(config_module, "DEFAULT_CONFIG"), (
            "config.py 不应再导出 DEFAULT_CONFIG (应从 config.json 文件读取)"
        )

    def test_config_manager_has_no_save_default_config(self):
        """ConfigManager 不应再有 _save_default_config 方法"""
        assert not hasattr(ConfigManager, "_save_default_config"), (
            "ConfigManager 不应再有 _save_default_config 方法 (Python 不写模板文件)"
        )

    def test_config_manager_has_no_ensure_config_dir(self):
        """ConfigManager 不应再有 _ensure_config_dir 方法 (load 时不创建目录)"""
        assert not hasattr(ConfigManager, "_ensure_config_dir"), "ConfigManager 不应再有 _ensure_config_dir 方法"


@pytest.mark.unit
class TestConfigManagerGet:
    """ConfigManager.get() 行为测试"""

    def _make_config(self, tmp_path, data):
        """构造带数据的 ConfigManager"""
        config_file = tmp_path / "config.json"
        config_file.write_text(json.dumps(data), encoding="utf-8")
        return ConfigManager(config_path=str(config_file))

    def test_get_returns_top_level_value(self, tmp_path):
        """顶层键正常返回"""
        mgr = self._make_config(tmp_path, {"LOG_CONFIG": {"level": "DEBUG"}})
        assert mgr.get("LOG_CONFIG") == {"level": "DEBUG"}

    def test_get_traverses_nested_keys(self, tmp_path):
        """点分隔符访问嵌套值"""
        mgr = self._make_config(tmp_path, {"APP_SETTINGS": {"notification": {"platform": "dingtalk"}}})
        assert mgr.get("APP_SETTINGS.notification.platform") == "dingtalk"

    def test_get_returns_default_when_key_missing(self, tmp_path):
        """键不存在时返回 default"""
        mgr = self._make_config(tmp_path, {"APP_SETTINGS": {}})
        assert mgr.get("APP_SETTINGS.missing") is None
        assert mgr.get("APP_SETTINGS.missing", "fallback") == "fallback"

    def test_get_returns_default_when_intermediate_not_dict(self, tmp_path):
        """中间路径非 dict 时返回 default (不抛 TypeError)"""
        mgr = self._make_config(tmp_path, {"APP_SETTINGS": "not_a_dict"})
        assert mgr.get("APP_SETTINGS.language") is None
        assert mgr.get("APP_SETTINGS.language", "zh-CN") == "zh-CN"


@pytest.mark.unit
class TestConfigManagerSaveReload:
    """ConfigManager save / reload 测试"""

    def test_save_writes_file_with_indent(self, tmp_path):
        """save() 写入文件 (indent=4, ensure_ascii=False)"""
        config_file = tmp_path / "config.json"
        # 先写一个空 dict 让构造通过
        config_file.write_text("{}", encoding="utf-8")
        mgr = ConfigManager(config_path=str(config_file))
        mgr.config = {"APP_SETTINGS": {"language": "zh-CN"}}
        mgr.save()

        # 验证文件写入且格式正确
        content = config_file.read_text(encoding="utf-8")
        assert '"language": "zh-CN"' in content
        # indent=4 应有缩进
        assert '    "APP_SETTINGS"' in content

    def test_save_creates_parent_dir(self, tmp_path):
        """save() 自动创建父目录"""
        nested_dir = tmp_path / "deep" / "nested"
        nested_path = nested_dir / "config.json"
        # 先创建父目录 + 空文件让构造通过
        nested_dir.mkdir(parents=True)
        nested_path.write_text("{}", encoding="utf-8")
        mgr = ConfigManager(config_path=str(nested_path))
        mgr.config = {"key": "value"}
        # 删除父目录后再 save,验证自动重建
        import shutil

        shutil.rmtree(nested_dir)
        mgr.save()
        assert nested_path.exists()

    def test_reload_re_reads_file(self, tmp_path):
        """reload() 重新读文件,反映外部修改"""
        config_file = tmp_path / "config.json"
        config_file.write_text(json.dumps({"level": "INFO"}), encoding="utf-8")
        mgr = ConfigManager(config_path=str(config_file))
        assert mgr.get("level") == "INFO"

        # 外部修改文件
        config_file.write_text(json.dumps({"level": "DEBUG"}), encoding="utf-8")
        mgr.reload()
        assert mgr.get("level") == "DEBUG"


@pytest.mark.unit
class TestGetConfigManagerSingleton:
    """get_config_manager() 懒加载单例测试"""

    def test_returns_singleton_instance(self):
        """两次调用返回同一实例"""
        # 重置模块级单例
        config_module._config_manager_instance = None
        try:
            # 构造需要配置文件存在,用当前项目 config.json
            a = config_module.get_config_manager()
            b = config_module.get_config_manager()
            assert a is b
        finally:
            config_module._config_manager_instance = None

    def test_singleton_constructed_lazily(self):
        """模块 import 时不构造,首次调用才构造"""
        config_module._config_manager_instance = None
        try:
            assert config_module._config_manager_instance is None
            # 首次调用构造
            config_module.get_config_manager()
            assert config_module._config_manager_instance is not None
        finally:
            config_module._config_manager_instance = None

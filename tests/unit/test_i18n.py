"""I18n 国际化模块单元测试

测试覆盖:
1. 单例守护 (_initialized 防止 __init__ 重复执行)
2. env 路径解析 (XKAUTOTESTER_LOCALES_PATH 打包模式注入)
3. 开发模式 fallback 路径
4. t() 行为 (key 找不到 / 嵌套 / kwargs 模板 / 非 str value)
5. reload() 重新加载
6. language 属性
7. 加载失败容错 (logger.warning,不抛异常)
"""

import json

import pytest

from main.utils import i18n as i18n_module
from main.utils.i18n import I18n


@pytest.fixture
def reset_i18n_singleton(monkeypatch, tmp_path):
    """重置 I18n 单例 + 临时 user data 目录

    每个测试都得到干净的单例状态:
    - 清除 I18n._instance 类属性
    - 设 XKAUTOTESTER_USER_DATA 到临时目录 (避免污染项目 logs)
    - 清除 XKAUTOTESTER_LANG / XKAUTOTESTER_LOCALES_PATH env
    """
    # 清除单例
    I18n._instance = None

    # 临时 user data (避免 logger 创建项目 logs 目录)
    monkeypatch.setenv("XKAUTOTESTER_USER_DATA", str(tmp_path))

    # 清除 i18n 相关 env
    monkeypatch.delenv("XKAUTOTESTER_LANG", raising=False)
    monkeypatch.delenv("XKAUTOTESTER_LOCALES_PATH", raising=False)

    yield

    # 测试后重置 (防止跨测试污染)
    I18n._instance = None


@pytest.fixture
def make_locale_file(tmp_path):
    """创建翻译文件工厂

    用法:
        path = make_locale_file("zh-CN", {"hello": "你好"})
    """

    def _make(lang: str, data: dict):
        locale_dir = tmp_path / "locales" / lang
        locale_dir.mkdir(parents=True, exist_ok=True)
        file_path = locale_dir / "translation.json"
        file_path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        return file_path

    return _make


@pytest.mark.unit
class TestI18nSingleton:
    """单例守护测试"""

    def test_singleton_returns_same_instance(self, reset_i18n_singleton):
        """两次构造返回同一实例"""
        a = I18n()
        b = I18n()
        assert a is b
        assert a._initialized is True

    def test_init_guard_prevents_repeated_init(self, reset_i18n_singleton, monkeypatch):
        """已初始化实例 __init__ 不重置 _language"""
        inst = I18n()
        original_lang = inst._language

        # 改 env 后再构造,单例应保持原 _language
        monkeypatch.setenv("XKAUTOTESTER_LANG", "en-US")
        inst2 = I18n()
        assert inst2 is inst
        assert inst._language == original_lang


@pytest.mark.unit
class TestI18nPathResolution:
    """路径解析测试"""

    def test_get_locales_root_uses_env_path(self, reset_i18n_singleton, monkeypatch, tmp_path):
        """XKAUTOTESTER_LOCALES_PATH 优先使用"""
        custom_path = tmp_path / "custom_locales"
        custom_path.mkdir()
        monkeypatch.setenv("XKAUTOTESTER_LOCALES_PATH", str(custom_path))

        inst = I18n()
        root = inst._get_locales_root()
        assert root == custom_path

    def test_get_locales_root_fallback_to_dev_path(self, reset_i18n_singleton, monkeypatch):
        """无 env 时回退到项目根 electron/locales"""
        monkeypatch.delenv("XKAUTOTESTER_LOCALES_PATH", raising=False)

        inst = I18n()
        root = inst._get_locales_root()
        # 路径以 electron/locales 结尾
        assert root.parts[-2] == "electron"
        assert root.parts[-1] == "locales"

    def test_get_locale_path_combines_root_and_lang(self, reset_i18n_singleton, monkeypatch, tmp_path):
        """_get_locale_path 拼接 root / lang / translation.json"""
        monkeypatch.setenv("XKAUTOTESTER_LOCALES_PATH", str(tmp_path / "locales"))

        inst = I18n()
        path = inst._get_locale_path("en-US")
        assert path == tmp_path / "locales" / "en-US" / "translation.json"


@pytest.mark.unit
class TestI18nLoadTranslations:
    """翻译文件加载测试"""

    def test_load_translations_from_env_path(self, reset_i18n_singleton, monkeypatch, tmp_path, make_locale_file):
        """从 XKAUTOTESTER_LOCALES_PATH 指定目录加载翻译"""
        make_locale_file("zh-CN", {"hello": "你好", "nested": {"key": "嵌套值"}})
        monkeypatch.setenv("XKAUTOTESTER_LOCALES_PATH", str(tmp_path / "locales"))

        inst = I18n()
        assert inst.t("hello") == "你好"
        assert inst.t("nested.key") == "嵌套值"

    def test_load_translations_fallback_to_zh_cn(self, reset_i18n_singleton, monkeypatch, tmp_path, make_locale_file):
        """当前语言文件不存在时回退 zh-CN"""
        # 只创建 zh-CN,当前语言设为 en-US
        make_locale_file("zh-CN", {"hello": "你好"})
        monkeypatch.setenv("XKAUTOTESTER_LANG", "en-US")
        monkeypatch.setenv("XKAUTOTESTER_LOCALES_PATH", str(tmp_path / "locales"))

        inst = I18n()
        assert inst.language == "en-US"
        assert inst.t("hello") == "你好"

    def test_load_translations_missing_file_logs_warning(self, reset_i18n_singleton, monkeypatch, tmp_path, caplog):
        """两个文件都不存在时记 warning,不抛异常,translations 保持空"""
        monkeypatch.setenv("XKAUTOTESTER_LOCALES_PATH", str(tmp_path / "locales"))

        with caplog.at_level("WARNING", logger="main.utils.i18n"):
            inst = I18n()

        assert inst._translations == {}
        assert any("翻译文件未找到" in r.message for r in caplog.records)

    def test_load_translations_invalid_json_logs_warning(self, reset_i18n_singleton, monkeypatch, tmp_path, caplog):
        """JSON 损坏时记 warning,不抛异常"""
        locale_dir = tmp_path / "locales" / "zh-CN"
        locale_dir.mkdir(parents=True)
        (locale_dir / "translation.json").write_text("{ invalid json !!!", encoding="utf-8")
        monkeypatch.setenv("XKAUTOTESTER_LOCALES_PATH", str(tmp_path / "locales"))

        with caplog.at_level("WARNING", logger="main.utils.i18n"):
            inst = I18n()

        assert inst._translations == {}
        assert any("加载翻译文件失败" in r.message for r in caplog.records)


@pytest.mark.unit
class TestI18nTranslate:
    """t() 翻译行为测试"""

    @pytest.fixture
    def i18n_with_data(self, reset_i18n_singleton, monkeypatch, tmp_path, make_locale_file):
        """构造带测试数据的 I18n 实例"""
        make_locale_file(
            "zh-CN",
            {
                "hello": "你好",
                "greeting": "你好,{name}!",
                "nested": {"deep": "深层值", "template": "用户 {uid} 的积分: {score}"},
                "empty": "",
            },
        )
        monkeypatch.setenv("XKAUTOTESTER_LOCALES_PATH", str(tmp_path / "locales"))
        return I18n()

    def test_t_returns_translation_when_key_found(self, i18n_with_data):
        assert i18n_with_data.t("hello") == "你好"

    def test_t_returns_key_when_missing(self, i18n_with_data):
        assert i18n_with_data.t("nonexistent.key") == "nonexistent.key"

    def test_t_handles_nested_keys(self, i18n_with_data):
        assert i18n_with_data.t("nested.deep") == "深层值"

    def test_t_formats_with_kwargs(self, i18n_with_data):
        assert i18n_with_data.t("greeting", name="小明") == "你好,小明!"
        assert i18n_with_data.t("nested.template", uid="1001", score="85") == "用户 1001 的积分: 85"

    def test_t_ignores_keyerror_in_format(self, i18n_with_data):
        """kwargs 缺失占位符时不抛异常,返回未格式化原文"""
        # greeting 需要 name,但未提供
        result = i18n_with_data.t("greeting")
        assert "你好,{name}!" == result

    def test_t_returns_key_when_value_not_str(self, i18n_with_data):
        """value 是 dict/list 时返回 key (不返回非 str)"""
        # nested 本身是 dict,不是 str
        assert i18n_with_data.t("nested") == "nested"

    def test_t_returns_empty_string_when_value_is_empty(self, i18n_with_data):
        """空字符串是合法 str,正常返回"""
        assert i18n_with_data.t("empty") == ""


@pytest.mark.unit
class TestI18nReload:
    """reload() 测试"""

    def test_reload_reloads_translations(self, reset_i18n_singleton, monkeypatch, tmp_path, make_locale_file):
        """reload 重新读 env + 翻译文件"""
        # 初始: zh-CN
        make_locale_file("zh-CN", {"hello": "你好"})
        monkeypatch.setenv("XKAUTOTESTER_LOCALES_PATH", str(tmp_path / "locales"))

        inst = I18n()
        assert inst.t("hello") == "你好"

        # 切换到 en-US
        make_locale_file("en-US", {"hello": "Hello"})
        monkeypatch.setenv("XKAUTOTESTER_LANG", "en-US")

        inst.reload()
        assert inst.language == "en-US"
        assert inst.t("hello") == "Hello"


@pytest.mark.unit
class TestI18nLanguageProperty:
    """language 属性测试"""

    def test_language_defaults_to_zh_cn(self, reset_i18n_singleton):
        """无 env 时默认 zh-CN"""
        inst = I18n()
        assert inst.language == "zh-CN"

    def test_language_reads_env(self, reset_i18n_singleton, monkeypatch, tmp_path, make_locale_file):
        """XKAUTOTESTER_LANG 设置语言"""
        make_locale_file("en-US", {"hello": "Hello"})
        monkeypatch.setenv("XKAUTOTESTER_LANG", "en-US")
        monkeypatch.setenv("XKAUTOTESTER_LOCALES_PATH", str(tmp_path / "locales"))

        inst = I18n()
        assert inst.language == "en-US"


@pytest.mark.unit
class TestI18nModuleFunctions:
    """模块级函数 (t / get_language / reload_i18n) 测试"""

    def test_module_t_uses_singleton(self, reset_i18n_singleton, monkeypatch, tmp_path, make_locale_file):
        """模块级 t() 委托到 _i18n 单例"""
        make_locale_file("zh-CN", {"hello": "你好"})
        monkeypatch.setenv("XKAUTOTESTER_LOCALES_PATH", str(tmp_path / "locales"))

        # 触发模块级 _i18n 重新构造 (清单例后访问模块属性)
        i18n_module._i18n = I18n()

        assert i18n_module.t("hello") == "你好"
        assert i18n_module.get_language() == "zh-CN"

    def test_module_reload_i18n_refreshes_singleton(
        self, reset_i18n_singleton, monkeypatch, tmp_path, make_locale_file
    ):
        """reload_i18n() 刷新模块单例"""
        make_locale_file("zh-CN", {"hello": "你好"})
        monkeypatch.setenv("XKAUTOTESTER_LOCALES_PATH", str(tmp_path / "locales"))

        i18n_module._i18n = I18n()
        assert i18n_module.t("hello") == "你好"

        # 切换语言后 reload
        make_locale_file("en-US", {"hello": "Hello"})
        monkeypatch.setenv("XKAUTOTESTER_LANG", "en-US")
        i18n_module.reload_i18n()

        assert i18n_module.get_language() == "en-US"
        assert i18n_module.t("hello") == "Hello"

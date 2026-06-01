"""
Python 国际化模块
通过 XKAUTOTESTER_LANG 环境变量获取语言设置，加载对应翻译文件。
默认语言: zh-CN
翻译文件位置: electron/locales/{lang}/translation.json (相对于项目根目录)
"""
import json
import os
from pathlib import Path
from typing import Any, Optional


class I18n:
    _instance = None
    _translations: dict = {}
    _language: str = "zh-CN"

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        self._language = os.environ.get("XKAUTOTESTER_LANG", "zh-CN")
        self._translations = {}
        self._load_translations()

    def _get_project_root(self) -> Path:
        return Path(__file__).parent.parent.parent.parent

    def _get_locale_path(self, language: str) -> Path:
        project_root = self._get_project_root()
        return project_root / "electron" / "locales" / language / "translation.json"

    def _load_translations(self):
        locale_path = self._get_locale_path(self._language)
        fallback_path = self._get_locale_path("zh-CN")
        
        try:
            if locale_path.exists():
                with open(locale_path, "r", encoding="utf-8") as f:
                    self._translations = json.load(f)
            elif fallback_path.exists():
                with open(fallback_path, "r", encoding="utf-8") as f:
                    self._translations = json.load(f)
        except Exception:
            pass

    @property
    def language(self) -> str:
        return self._language

    def t(self, key: str, **kwargs: Any) -> str:
        keys = key.split(".")
        value = self._translations
        for k in keys:
            if isinstance(value, dict) and k in value:
                value = value[k]
            else:
                return key
        
        if isinstance(value, str) and kwargs:
            try:
                value = value.format(**kwargs)
            except KeyError:
                pass
        
        return value if isinstance(value, str) else key

    def reload(self):
        self._language = os.environ.get("XKAUTOTESTER_LANG", "zh-CN")
        self._load_translations()


_i18n = I18n()


def t(key: str, **kwargs: Any) -> str:
    return _i18n.t(key, **kwargs)


def get_language() -> str:
    return _i18n.language


def reload_i18n():
    _i18n.reload()

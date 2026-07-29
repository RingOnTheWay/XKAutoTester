"""
Python 国际化模块
通过 XKAUTOTESTER_LANG 环境变量获取语言设置，加载对应翻译文件。
默认语言: zh-CN
翻译文件位置: XKAUTOTESTER_LOCALES_PATH 环境变量指定（打包模式由 Electron 注入），
              开发模式回退到 electron/locales/{lang}/translation.json
"""

import json
import os
from pathlib import Path
from typing import Any

from main.utils.logger import get_logger
from main.utils.paths import get_locales_root

logger = get_logger(__name__)


class I18n:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        # _initialized 守护：防止 __init__ 在单例已存在时重复执行
        if getattr(self, "_initialized", False):
            return
        self._language = os.environ.get("XKAUTOTESTER_LANG", "zh-CN")
        self._translations = {}
        self._load_translations()
        self._initialized = True

    def _get_locales_root(self) -> Path:
        """获取 locales 根目录。通过 paths.get_locales_root() 统一解析。"""
        return get_locales_root()

    def _get_locale_path(self, language: str) -> Path:
        return self._get_locales_root() / language / "translation.json"

    def _load_translations(self):
        locale_path = self._get_locale_path(self._language)
        fallback_path = self._get_locale_path("zh-CN")

        try:
            if locale_path.exists():
                with open(locale_path, encoding="utf-8") as f:
                    self._translations = json.load(f)
            elif fallback_path.exists():
                with open(fallback_path, encoding="utf-8") as f:
                    self._translations = json.load(f)
            else:
                logger.warning("翻译文件未找到: %s 及 fallback %s", locale_path, fallback_path)
        except Exception as e:
            logger.warning("加载翻译文件失败 (lang=%s): %s", self._language, e)

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

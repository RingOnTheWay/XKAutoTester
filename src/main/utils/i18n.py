"""
Python 国际化模块
通过 XKAUTOTESTER_LANG 环境变量获取语言设置，加载对应翻译文件。
默认语言: zh-CN
翻译文件位置: XKAUTOTESTER_LOCALES_PATH 环境变量指定（打包模式由 Electron 注入），
              开发模式回退到 electron/locales/{lang}/translation.json

设计:
- I18n 为普通类 (可多实例), 消除 __new__ 单例 + _initialized 守护
- 模块级 t()/get_language()/reload_i18n() 通过懒加载实例 (首次调用时构造, 非 import 时)
- set_i18n_instance() 注入点: Cli 入口/测试可注入, 消除 Service Locator 不可测问题
- 导入零副作用 (不再 _i18n = I18n() 在 import 时触发文件 IO)
"""

import json
import logging
import os
from pathlib import Path
from typing import Any

from main.utils.paths import get_locales_root

# S4: 改用 logging.getLogger (与 adb_manager/appium_server 等一致), 不在 import 时触发 root logger 配置.
# root 配置由 Cli 入口 (logger_factory=get_logger) 首次创建 logger 时显式触发, 消除"导入即 IO"副作用.
logger = logging.getLogger(__name__)


class I18n:
    """国际化实例 (普通类, 可多实例)。"""

    def __init__(self, language: str | None = None):
        """构造 I18n 实例。

        Args:
            language: 语言代码 (None 则读 XKAUTOTESTER_LANG 环境变量, 默认 zh-CN)
        """
        self._language = language or os.environ.get("XKAUTOTESTER_LANG", "zh-CN")
        self._translations = {}
        self._load_translations()

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


# 模块级懒加载实例 (首次 t() 调用时构造, 非 import 时 — 消除导入副作用)
_i18n_instance: I18n | None = None


def _get_i18n() -> I18n:
    """获取模块级 I18n 实例 (懒加载)。"""
    global _i18n_instance
    if _i18n_instance is None:
        _i18n_instance = I18n()
    return _i18n_instance


def set_i18n_instance(instance: I18n) -> None:
    """注入 I18n 实例 (Cli 入口/测试用, 消除模块级单例不可测问题)。

    注入后 _get_i18n() 返回此实例, 不再懒加载构造。
    """
    global _i18n_instance
    _i18n_instance = instance


def t(key: str, **kwargs: Any) -> str:
    return _get_i18n().t(key, **kwargs)


def get_language() -> str:
    return _get_i18n().language


def reload_i18n():
    _get_i18n().reload()

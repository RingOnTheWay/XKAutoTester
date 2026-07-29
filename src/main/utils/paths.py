"""
路径管理模块
集中抽象项目根、用户数据根、locales 根、配置目录等路径。

设计：
- project_root 为模块级常量（纯静态，不依赖 env），导入即定
- user_data_root / locales_root 依赖环境变量，通过函数暴露（不缓存，便于测试 mock env）
- config_root / config_file 依赖 user_data_root，亦通过函数暴露

环境变量：
- XKAUTOTESTER_USER_DATA: 用户数据目录（打包模式由 Electron 注入）
- XKAUTOTESTER_LOCALES_PATH: locales 目录（打包模式由 Electron 注入）
"""

import os
from pathlib import Path

# 项目根目录：src/main/utils/ → 上溯 4 层
# 开发模式 = 项目根；打包模式 = resourcesPath（Python 源码被打包到 resourcesPath/src/）
PROJECT_ROOT: Path = Path(__file__).parent.parent.parent.parent


def get_project_root() -> Path:
    """获取项目根目录（等同于 PROJECT_ROOT 常量，函数形式便于一致性）"""
    return PROJECT_ROOT


def get_user_data_root() -> Path:
    """获取用户数据根目录。

    优先读 XKAUTOTESTER_USER_DATA 环境变量（打包模式由 Electron 注入），
    回退到项目根目录（开发模式）。
    """
    user_data = os.environ.get("XKAUTOTESTER_USER_DATA")
    if user_data:
        return Path(user_data)
    return PROJECT_ROOT


def get_locales_root() -> Path:
    """获取 locales 根目录。

    优先读 XKAUTOTESTER_LOCALES_PATH 环境变量（打包模式由 Electron 注入），
    回退到项目根目录下的 electron/locales（开发模式源码路径）。
    """
    env_path = os.environ.get("XKAUTOTESTER_LOCALES_PATH")
    if env_path:
        return Path(env_path)
    return PROJECT_ROOT / "electron" / "locales"


def get_config_root() -> Path:
    """获取配置目录（user_data_root / config）"""
    return get_user_data_root() / "config"


def get_config_file() -> Path:
    """获取主配置文件路径（user_data_root / config / config.json）"""
    return get_config_root() / "config.json"


def get_logs_path(*subdirs) -> Path:
    """获取日志目录（user_data_root / logs / *subdirs）"""
    base = get_user_data_root() / "logs"
    if subdirs:
        return base.joinpath(*subdirs)
    return base

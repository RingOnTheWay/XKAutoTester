"""
配置管理模块
负责加载和管理JSON配置文件

配置权威源: config/config.json (项目根目录)
其他消费方 (JS UserDataService / Python ConfigManager) 均从此文件读取,
不再维护硬编码副本。读取失败时抛 FileNotFoundError, 由调用方处理。
"""

import json
from pathlib import Path

from main.utils.paths import get_config_file


class ConfigManager:
    """配置管理器类"""

    def __init__(self, config_path: str = None):
        """初始化配置管理器

        Args:
            config_path: 配置文件路径，如果为None则自动检测
        """
        self.config_path = Path(config_path) if config_path else self._detect_config_path()
        self.config = self._load_config()

    def _detect_config_path(self) -> Path:
        """自动检测配置文件路径

        通过 paths.get_config_file() 统一解析：
        优先 XKAUTOTESTER_USER_DATA 环境变量指定的用户数据目录，
        回退到项目根目录下的 config 目录（开发模式）

        Returns:
            配置文件路径
        """
        return get_config_file()

    def _load_config(self) -> dict:
        """加载JSON配置文件

        配置文件不存在或损坏时抛 FileNotFoundError, 不再写默认配置。
        Electron 启动 Python 子进程前已通过 UserDataService seed AppData,
        正常情况下配置文件必然存在。

        Returns:
            配置字典

        Raises:
            FileNotFoundError: 配置文件不存在
            json.JSONDecodeError: 配置文件 JSON 解析失败
        """
        if not self.config_path.exists():
            raise FileNotFoundError(f"Config file not found: {self.config_path}")
        with open(self.config_path, encoding="utf-8") as f:
            return json.load(f)

    def get(self, key: str, default=None):
        """获取配置值

        Args:
            key: 配置键，可以使用点分隔符访问嵌套值
            default: 默认值，如果键不存在则返回

        Returns:
            配置值
        """
        keys = key.split(".")
        value = self.config

        for k in keys:
            if isinstance(value, dict) and k in value:
                value = value[k]
            else:
                return default

        return value

    def reload(self):
        """重新加载配置文件"""
        self.config = self._load_config()

    def save(self):
        """保存配置文件"""
        self.config_path.parent.mkdir(parents=True, exist_ok=True)
        with open(self.config_path, "w", encoding="utf-8") as f:
            json.dump(self.config, f, indent=4, ensure_ascii=False)


# 模块级懒加载实例（避免导入时触发文件 I/O）
_config_manager_instance = None


def get_config_manager() -> "ConfigManager":
    """获取 ConfigManager 单例（首次调用时构造）"""
    global _config_manager_instance
    if _config_manager_instance is None:
        _config_manager_instance = ConfigManager()
    return _config_manager_instance

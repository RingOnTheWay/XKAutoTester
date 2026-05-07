"""
配置管理模块
负责加载和管理JSON配置文件
"""
import json
import os
from pathlib import Path

DEFAULT_CONFIG = {
    "LOG_CONFIG": {
        "level": "INFO",
        "format": "%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        "file_path": ".",
        "max_bytes": 10485760,
        "backup_count": 5
    },
    "SCRCPY_PARAMS": {
        "max_size": "1920",
        "video_bit_rate": "8",
        "max_fps": "60",
        "video_codec": "h264",
        "always_on_top": True
    },
    "APP_SETTINGS": {
        "default_download_directory": "",
        "dark_mode": False,
        "theme_color": "#4CAF50",
        "language": "zh-CN",
        "notification": {
            "platform": "none",
            "dingtalk": {
                "access_token": "",
                "secret": ""
            }
        },
        "autoCheckUpdate": True
    }
}


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

        优先使用环境变量 XKAUTOTESTER_USER_DATA 指定的用户数据目录，
        回退到项目根目录下的 config 目录（开发模式）

        Returns:
            配置文件路径
        """
        user_data = os.environ.get('XKAUTOTESTER_USER_DATA')
        if user_data:
            return Path(user_data) / 'config' / 'config.json'
        return Path(__file__).parent.parent.parent.parent / "config" / "config.json"

    def _load_config(self) -> dict:
        """加载JSON配置文件，文件不存在时自动创建默认配置

        Returns:
            配置字典
        """
        if not self.config_path.exists():
            self._ensure_config_dir()
            self._save_default_config()
            return DEFAULT_CONFIG.copy()

        try:
            with open(self.config_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            self._save_default_config()
            return DEFAULT_CONFIG.copy()

    def _ensure_config_dir(self):
        """确保配置文件所在目录存在"""
        self.config_path.parent.mkdir(parents=True, exist_ok=True)

    def _save_default_config(self):
        """保存默认配置到文件"""
        self._ensure_config_dir()
        with open(self.config_path, 'w', encoding='utf-8') as f:
            json.dump(DEFAULT_CONFIG, f, indent=2, ensure_ascii=False)

    def get(self, key: str, default=None):
        """获取配置值

        Args:
            key: 配置键，可以使用点分隔符访问嵌套值
            default: 默认值，如果键不存在则返回

        Returns:
            配置值
        """
        keys = key.split('.')
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
        self._ensure_config_dir()
        with open(self.config_path, 'w', encoding='utf-8') as f:
            json.dump(self.config, f, indent=4, ensure_ascii=False)


config_manager = ConfigManager()

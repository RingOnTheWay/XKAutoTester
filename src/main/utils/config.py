"""
配置管理模块
负责加载和管理JSON配置文件
"""
import json
from pathlib import Path


class ConfigManager:
    """配置管理器类"""
    
    def __init__(self, config_path: str = None):
        """初始化配置管理器
        
        Args:
            config_path: 配置文件路径，如果为None则使用默认路径
        """
        self.config_path = config_path or self._get_default_config_path()
        self.config = self._load_config()
    
    def _get_default_config_path(self) -> Path:
        """获取默认配置文件路径
        
        Returns:
            默认配置文件路径
        """
        return Path(__file__).parent.parent.parent.parent / "config" / "config.json"
    
    def _load_config(self) -> dict:
        """加载JSON配置文件
        
        Returns:
            配置字典
        """
        with open(self.config_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    
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
        with open(self.config_path, 'w', encoding='utf-8') as f:
            json.dump(self.config, f, indent=4, ensure_ascii=False)


# 创建全局配置管理器实例
config_manager = ConfigManager()

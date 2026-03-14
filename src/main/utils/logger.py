"""
日志管理模块
提供统一的日志记录功能
"""
import logging
import logging.handlers
from pathlib import Path
import datetime
from main.utils.config import config_manager

PROJECT_ROOT = Path(__file__).parent.parent.parent.parent


class Logger:
    """日志管理类"""
    
    def __init__(self, name=None):
        self.name = name or __name__
        self.logger = logging.getLogger(self.name)
        self._setup_logger()
    
    def _setup_logger(self):
        """配置日志记录器"""
        # 从配置管理器获取日志配置
        log_config = config_manager.get("LOG_CONFIG", {})
        
        # 设置日志级别
        log_level = log_config.get("level", "INFO")
        self.logger.setLevel(getattr(logging, log_level))
        
        # 清除已有的处理器
        self.logger.handlers.clear()
        
        # 创建UTF-8格式化器
        log_format = log_config.get("format", "%(asctime)s - %(name)s - %(levelname)s - %(message)s")
        formatter = logging.Formatter(log_format)
        
        # 日志文件路径固定为项目根目录下的logs/XKAT
        logs_dir = PROJECT_ROOT / "logs" / "XKAT"
        
        # 确保logs/XKAT文件夹存在
        logs_dir.mkdir(parents=True, exist_ok=True)
        
        # 生成当前时间格式化的日志文件名（前缀加上XKAT-，时间单位之间加上"-"）
        current_time = datetime.datetime.now().strftime("%Y-%m-%d-%H-%M-%S")
        log_file_path = logs_dir / f"XKAT-{current_time}.log"
        
        # 文件处理器 - 按文件大小轮转，设置UTF-8编码
        file_handler = logging.handlers.RotatingFileHandler(
            log_file_path,
            maxBytes=log_config.get("max_bytes", 10485760),  # 默认10MB
            backupCount=log_config.get("backup_count", 5),  # 默认保留5个备份
            encoding='utf-8'  # 设置UTF-8编码
        )
        file_handler.setFormatter(formatter)
        
        # 控制台处理器 - 设置UTF-8编码
        console_handler = logging.StreamHandler()
        console_handler.setFormatter(formatter)
        
        # 设置控制台输出编码为UTF-8
        try:
            import sys
            if sys.stdout.encoding != 'utf-8':
                import codecs
                sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer)
        except:
            pass
        
        # 添加处理器
        self.logger.addHandler(file_handler)
        self.logger.addHandler(console_handler)
    
    def debug(self, msg, *args, **kwargs):
        """记录调试信息"""
        self.logger.debug(msg, *args, **kwargs)
    
    def info(self, msg, *args, **kwargs):
        """记录一般信息"""
        self.logger.info(msg, *args, **kwargs)
    
    def warning(self, msg, *args, **kwargs):
        """记录警告信息"""
        self.logger.warning(msg, *args, **kwargs)
    
    def error(self, msg, *args, **kwargs):
        """记录错误信息"""
        self.logger.error(msg, *args, **kwargs)
    
    def critical(self, msg, *args, **kwargs):
        """记录严重错误信息"""
        self.logger.critical(msg, *args, **kwargs)
    
    def exception(self, msg, *args, **kwargs):
        """记录异常信息（包含堆栈跟踪）"""
        self.logger.exception(msg, *args, **kwargs)


# 创建全局日志实例
def get_logger(name=None):
    """获取日志记录器实例"""
    return Logger(name)


# 测试日志功能
if __name__ == "__main__":
    logger = get_logger("test_logger")
    logger.info("日志模块初始化成功")
    logger.debug("这是一条调试信息")
    logger.warning("这是一条警告信息")
    logger.error("这是一条错误信息")

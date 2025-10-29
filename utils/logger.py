"""
日志管理模块
提供统一的日志记录功能
"""
import logging
import logging.handlers
from pathlib import Path
from config.config import LOG_CONFIG


class Logger:
    """日志管理类"""
    
    def __init__(self, name=None):
        self.name = name or __name__
        self.logger = logging.getLogger(self.name)
        self._setup_logger()
    
    def _setup_logger(self):
        """配置日志记录器"""
        # 设置日志级别
        self.logger.setLevel(getattr(logging, LOG_CONFIG["level"]))
        
        # 清除已有的处理器
        self.logger.handlers.clear()
        
        # 创建UTF-8格式化器
        formatter = logging.Formatter(LOG_CONFIG["format"])
        
        # 文件处理器 - 按文件大小轮转，设置UTF-8编码
        file_handler = logging.handlers.RotatingFileHandler(
            LOG_CONFIG["file_path"],
            maxBytes=LOG_CONFIG["max_bytes"],
            backupCount=LOG_CONFIG["backup_count"],
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
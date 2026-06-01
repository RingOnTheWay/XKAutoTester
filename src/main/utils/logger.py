"""
日志管理模块
提供统一的日志记录功能
"""
import logging
import logging.handlers
import os
from pathlib import Path
import datetime
from main.utils.config import config_manager


def _get_data_root():
    user_data = os.environ.get('XKAUTOTESTER_USER_DATA')
    if user_data:
        return Path(user_data)
    return Path(__file__).parent.parent.parent.parent


_shared_file_handler = None
_shared_log_dir = None
_shared_formatter = None


def _get_shared_file_handler():
    global _shared_file_handler, _shared_log_dir, _shared_formatter

    if _shared_file_handler is not None:
        return _shared_file_handler

    log_config = config_manager.get("LOG_CONFIG", {})
    log_format = log_config.get("format", "%(asctime)s - %(name)s - %(levelname)s - %(message)s")
    _shared_formatter = logging.Formatter(log_format)

    _shared_log_dir = _get_data_root() / "logs" / "XKAT"
    _shared_log_dir.mkdir(parents=True, exist_ok=True)

    current_time = datetime.datetime.now().strftime("%Y-%m-%d-%H-%M-%S")
    log_file_path = _shared_log_dir / f"XKAT-{current_time}.log"

    _shared_file_handler = logging.handlers.RotatingFileHandler(
        log_file_path,
        maxBytes=log_config.get("max_bytes", 10485760),
        backupCount=log_config.get("backup_count", 5),
        encoding='utf-8'
    )
    _shared_file_handler.setFormatter(_shared_formatter)

    return _shared_file_handler


class Logger:
    """日志管理类"""

    def __init__(self, name=None):
        self.name = name or __name__
        self.logger = logging.getLogger(self.name)
        self._setup_logger()

    def _setup_logger(self):
        """配置日志记录器"""
        log_config = config_manager.get("LOG_CONFIG", {})
        log_level = log_config.get("level", "INFO")
        self.logger.setLevel(getattr(logging, log_level))

        self.logger.handlers.clear()

        log_format = log_config.get("format", "%(asctime)s - %(name)s - %(levelname)s - %(message)s")
        formatter = logging.Formatter(log_format)

        file_handler = _get_shared_file_handler()
        self.logger.addHandler(file_handler)

        console_handler = logging.StreamHandler()
        console_handler.setFormatter(formatter)
        self.logger.addHandler(console_handler)

        try:
            import sys
            if sys.stdout.encoding != 'utf-8':
                import codecs
                sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer)
        except:
            pass

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


def get_logger(name=None):
    """获取日志记录器实例"""
    return Logger(name)


if __name__ == "__main__":
    logger = get_logger("test_logger")
    logger.info("日志模块初始化成功")
    logger.debug("这是一条调试信息")
    logger.warning("这是一条警告信息")
    logger.error("这是一条错误信息")

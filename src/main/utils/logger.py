"""
日志管理模块
提供统一的日志记录功能

设计：
- 消除自定义 Logger 包装类，统一用标准 logging.Logger
- get_logger(name) 首次调用时配置 root logger 一次，子 logger 通过 propagate 继承
- 配置依赖 ConfigManager，通过 get_config_manager() 懒加载避免导入副作用
"""

import codecs
import datetime
import logging
import logging.handlers
import sys

from main.utils.config import get_config_manager
from main.utils.paths import get_logs_path
from main.utils.text import DATETIME_FORMAT

# 模块级缓存（首次配置后复用）
_shared_file_handler = None
_shared_log_dir = None
_shared_formatter = None
_root_configured = False

# 内置默认配置 (配置缺失/损坏时回退, 保证首次 get_logger 不因配置崩而抛异常)
_DEFAULT_LOG_FORMAT = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
_DEFAULT_LOG_LEVEL = "INFO"
_DEFAULT_MAX_BYTES = 10485760
_DEFAULT_BACKUP_COUNT = 5


def _get_shared_file_handler():
    """获取共享文件 handler（首次调用时创建）。

    配置读取失败回退内置默认; 文件 handler 创建失败时返回 None (仅控制台输出)。
    """
    global _shared_file_handler, _shared_log_dir, _shared_formatter

    if _shared_file_handler is not None:
        return _shared_file_handler

    log_format = _DEFAULT_LOG_FORMAT
    max_bytes = _DEFAULT_MAX_BYTES
    backup_count = _DEFAULT_BACKUP_COUNT
    try:
        log_config = get_config_manager().get("LOG_CONFIG", {})
        log_format = log_config.get("format", _DEFAULT_LOG_FORMAT)
        max_bytes = log_config.get("max_bytes", _DEFAULT_MAX_BYTES)
        backup_count = log_config.get("backup_count", _DEFAULT_BACKUP_COUNT)
    except Exception as e:
        logging.warning(f"读取日志配置失败, 使用默认值: {e}")
    _shared_formatter = logging.Formatter(log_format)

    _shared_log_dir = get_logs_path("XKAT")
    _shared_log_dir.mkdir(parents=True, exist_ok=True)

    current_time = datetime.datetime.now().strftime(DATETIME_FORMAT)
    log_file_path = _shared_log_dir / f"XKAT-{current_time}.log"

    try:
        _shared_file_handler = logging.handlers.RotatingFileHandler(
            log_file_path,
            maxBytes=max_bytes,
            backupCount=backup_count,
            encoding="utf-8",
        )
        _shared_file_handler.setFormatter(_shared_formatter)
    except Exception as e:
        logging.warning(f"创建文件日志 handler 失败, 仅保留控制台输出: {e}")
        _shared_file_handler = None

    return _shared_file_handler


def _setup_root_logger():
    """配置 root logger（仅执行一次）。

    配置读取/级别解析失败时回退默认值, 不抛异常。
    """
    global _root_configured
    if _root_configured:
        return

    log_level = _DEFAULT_LOG_LEVEL
    log_format = _DEFAULT_LOG_FORMAT
    try:
        log_config = get_config_manager().get("LOG_CONFIG", {})
        log_level = log_config.get("level", _DEFAULT_LOG_LEVEL)
        log_format = log_config.get("format", _DEFAULT_LOG_FORMAT)
    except Exception as e:
        logging.warning(f"读取日志级别/格式失败, 使用默认值: {e}")

    root_logger = logging.getLogger()
    try:
        root_logger.setLevel(getattr(logging, log_level))
    except (AttributeError, ValueError):
        logging.warning(f"无效的日志级别: {log_level}, 回退 {_DEFAULT_LOG_LEVEL}")
        root_logger.setLevel(logging.getLevelName(_DEFAULT_LOG_LEVEL))
    # 清除已有 handler（避免重复）
    root_logger.handlers.clear()

    # 文件 handler (创建失败时 _get_shared_file_handler 返回 None, 跳过)
    file_handler = _get_shared_file_handler()
    if file_handler is not None:
        root_logger.addHandler(file_handler)

    # 控制台 handler (写 sys.stderr, 实时输出。
    # StreamHandler() 默认捕获 sys.stderr。cli.py _wrap_stdio 包装 stderr 为 utf-8 TextIOWrapper
    # (line_buffering=True), 写入无延迟。PytestProcess 用 logger.info/error 实时转发 pytest 输出。)
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(logging.Formatter(log_format))
    root_logger.addHandler(console_handler)

    # 确保 stdout 用 utf-8
    try:
        if sys.stdout.encoding != "utf-8":
            sys.stdout = codecs.getwriter("utf-8")(sys.stdout.buffer)
    except Exception:
        pass

    _root_configured = True


def get_logger(name=None):
    """
    获取标准 logging.Logger 实例

    首次调用时配置 root logger，后续调用直接返回 logging.getLogger(name)。
    子 logger 通过 propagate 继承 root 的 handler。

    Args:
        name: logger 名称，通常传 __name__

    Returns:
        logging.Logger 实例
    """
    _setup_root_logger()
    return logging.getLogger(name or __name__)


if __name__ == "__main__":
    logger = get_logger("test_logger")
    logger.info("日志模块初始化成功")
    logger.debug("这是一条调试信息")
    logger.warning("这是一条警告信息")
    logger.error("这是一条错误信息")

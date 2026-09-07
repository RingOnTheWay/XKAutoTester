"""logger.py 日志目录配置 (LOG_CONFIG.file_path) 回归测试 - R25 P2-11

背景: LOG_CONFIG.file_path 键漂移 — logger.py 只读 format/max_bytes/backup_count,
日志目录被硬编码为 get_logs_path("XKAT"), 用户改 file_path 期望改日志目录完全无效。

修复: logger.py 真正消费 file_path — 空串/"."/"./" 视为未配置回退默认;
其他值视为日志目录 (相对路径基于 cwd, ~ 展开), 目录自动创建。

测试覆盖:
1. file_path="." → 回退默认日志目录
2. file_path 缺失 → 回退默认日志目录
3. file_path=绝对目录 → 日志文件写入该目录
4. file_path=相对目录 → 基于 cwd 解析并写入
"""

import logging
import logging.handlers
from unittest import mock

import pytest

from main.utils import logger as logger_module


def _reset_module_state():
    """清空模块级缓存, 让每次测试独立重建文件 handler"""
    logger_module._shared_file_handler = None
    logger_module._shared_log_dir = None
    logger_module._shared_formatter = None
    logger_module._root_configured = False


def _fake_config_manager(log_config):
    cm = mock.MagicMock()
    cm.get.return_value = log_config
    return cm


def _make_log_config(file_path):
    return {
        "level": "INFO",
        "format": "%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        "file_path": file_path,
        "max_bytes": 1048576,
        "backup_count": 1,
    }


@pytest.mark.unit
class TestLoggerFilePath:
    def setup_method(self):
        _reset_module_state()

    def test_file_path_dot_falls_back_to_default_dir(self, tmp_path, monkeypatch):
        """file_path='.' (默认占位值) → 回退默认日志目录 (行为与修复前一致)"""
        default_logs = tmp_path / "default-logs" / "XKAT"
        monkeypatch.setattr(logger_module, "get_logs_path", lambda *a: default_logs)
        fake_cm = _fake_config_manager(_make_log_config("."))
        monkeypatch.setattr(logger_module, "get_config_manager", lambda: fake_cm)

        handler = logger_module._get_shared_file_handler()

        assert handler is not None, "应创建文件 handler"
        assert logger_module._shared_log_dir == default_logs, "file_path='.' 应回退默认目录"
        assert default_logs.exists(), "默认日志目录应被创建"

    def test_file_path_missing_falls_back_to_default_dir(self, tmp_path, monkeypatch):
        """LOG_CONFIG 无 file_path 键 → 回退默认目录"""
        default_logs = tmp_path / "default-logs" / "XKAT"
        monkeypatch.setattr(logger_module, "get_logs_path", lambda *a: default_logs)
        log_config = {k: v for k, v in _make_log_config(".").items() if k != "file_path"}
        fake_cm = _fake_config_manager(log_config)
        monkeypatch.setattr(logger_module, "get_config_manager", lambda: fake_cm)

        logger_module._get_shared_file_handler()

        assert logger_module._shared_log_dir == default_logs, "缺失 file_path 应回退默认目录"

    def test_file_path_absolute_dir_used(self, tmp_path, monkeypatch):
        """file_path=绝对目录 → 日志文件写入该目录 (P2-11 核心回归)"""
        target_dir = tmp_path / "custom-logs"
        fake_cm = _fake_config_manager(_make_log_config(str(target_dir)))
        monkeypatch.setattr(logger_module, "get_config_manager", lambda: fake_cm)

        handler = logger_module._get_shared_file_handler()

        assert handler is not None, "应创建文件 handler"
        assert logger_module._shared_log_dir == target_dir, "应使用用户配置的目录"
        assert target_dir.exists(), "用户目录应被自动创建"
        log_files = list(target_dir.iterdir())
        assert len(log_files) == 1, f"目录下应有 1 个日志文件, 实际: {log_files}"
        assert log_files[0].suffix == ".log"
        assert isinstance(handler, logging.handlers.RotatingFileHandler)
        assert "custom-logs" in handler.baseFilename, "handler 应写入用户目录"

    def test_file_path_relative_dir_based_on_cwd(self, tmp_path, monkeypatch):
        """file_path=相对目录 → 基于 cwd 解析"""
        monkeypatch.chdir(tmp_path)
        fake_cm = _fake_config_manager(_make_log_config("rel-logs"))
        monkeypatch.setattr(logger_module, "get_config_manager", lambda: fake_cm)

        handler = logger_module._get_shared_file_handler()

        assert handler is not None
        expected_dir = (tmp_path / "rel-logs").resolve()
        assert logger_module._shared_log_dir.resolve() == expected_dir, "相对路径应基于 cwd 解析"
        assert expected_dir.exists(), "相对目录应被自动创建"
        assert "rel-logs" in handler.baseFilename

"""tests/unit/helpers/fixtures.py - 共享 pytest fixture

提供 ADB / subprocess / config 等通用 mock，供所有 unit test 使用。
"""

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# ── 路径 fixture ───────────────────────────────────────────────


@pytest.fixture
def tmp_config_dir(tmp_path):
    """临时 config 目录，模拟 XKAUTOTESTER_USER_DATA/config"""
    config_dir = tmp_path / "config"
    config_dir.mkdir()
    return config_dir


@pytest.fixture
def tmp_user_data(tmp_path, monkeypatch):
    """临时用户数据目录，设置 XKAUTOTESTER_USER_DATA 环境变量"""
    user_data = tmp_path / "userdata"
    user_data.mkdir()
    monkeypatch.setenv("XKAUTOTESTER_USER_DATA", str(user_data))
    return user_data


@pytest.fixture
def tmp_project_root(tmp_path):
    """临时项目根目录，含 src/ config/ 结构"""
    (tmp_path / "src" / "main").mkdir(parents=True)
    (tmp_path / "config").mkdir()
    return tmp_path


# ── ADB mock ──────────────────────────────────────────────────


@pytest.fixture
def mock_adb():
    """Mock ADBManager 实例

    提供:
    - start_logcat_monitor / stop_logcat_monitor
    - get_connected_devices (返回 [])
    - execute_command (返回 "")
    """
    adb = MagicMock()
    adb.start_logcat_monitor = MagicMock()
    adb.stop_logcat_monitor = MagicMock()
    adb.get_connected_devices = MagicMock(return_value=[])
    adb.execute_command = MagicMock(return_value="")
    adb.push_file = MagicMock(return_value=True)
    adb.pull_file = MagicMock(return_value=True)
    return adb


# ── subprocess mock ───────────────────────────────────────────


@pytest.fixture
def mock_subprocess(monkeypatch):
    """Mock subprocess.run / Popen

    返回 dict: { run: MagicMock, Popen: MagicMock }
    默认 run 返回 returncode=0, Popen 返回可 communicate/wait 的 mock
    """
    run_result = MagicMock(returncode=0, stdout=b"", stderr=b"")
    run_mock = MagicMock(return_value=run_result)

    popen_instance = MagicMock()
    popen_instance.wait = MagicMock(return_value=0)
    popen_instance.communicate = MagicMock(return_value=(b"", b""))
    popen_instance.poll = MagicMock(return_value=0)
    popen_instance.returncode = 0
    popen_mock = MagicMock(return_value=popen_instance)

    monkeypatch.setattr("subprocess.run", run_mock)
    monkeypatch.setattr("subprocess.Popen", popen_mock)
    return {"run": run_mock, "Popen": popen_mock, "instance": popen_instance}


# ── Python 模块导入辅助 ──────────────────────────────────────


@pytest.fixture
def ensure_src_on_path():
    """确保 src 目录在 sys.path 上 (兼容 tests/conftest.py 的设置)"""
    src_dir = Path(__file__).parent.parent.parent.parent / "src"
    if str(src_dir) not in sys.path:
        sys.path.insert(0, str(src_dir))
    return src_dir


# ── 配置 fixture ─────────────────────────────────────────────


@pytest.fixture
def mock_config_manager(monkeypatch):
    """Mock ConfigManager 单例

    用法:
        def test_xxx(mock_config_manager):
            mock_config_manager.get.return_value = "custom_value"
    """
    manager = MagicMock()
    manager.get = MagicMock(return_value=None)
    manager.set = MagicMock()
    manager.config = {
        "LOG_CONFIG": {"level": "INFO", "format": "%(asctime)s - %(name)s - %(levelname)s - %(message)s"},
        "APP_SETTINGS": {"language": "zh-CN"},
    }
    # patch 单例工厂
    with patch("main.utils.config.get_config_manager", return_value=manager):
        yield manager


# ── 日志 fixture ──────────────────────────────────────────────


@pytest.fixture
def capture_logs(caplog):
    """捕获日志输出 (pytest 内置 caplog 的薄封装)"""
    import logging

    caplog.set_level(logging.DEBUG)
    return caplog

"""tests/unit/helpers/fixtures.py - 共享 pytest fixture

提供 ADB / subprocess / config 等通用 mock，供所有 unit test 使用。

P2 修复: 所有 mock 加 spec= (对齐真实类接口), 阻止调用漂移 (typo 方法名 / 不存在方法)。
spec= (非 spec_set=) 允许 set 新 attr 但访问不存在 attr 触发 AttributeError。
"""

import subprocess
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# P2: spec 用的真实类 (conftest 已将 src/ 加入 sys.path, 可直接 import)
from main.core.adb_manager import ADBManager
from main.utils.config import ConfigManager

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
    """Mock ADBManager 实例 (P2: spec=ADBManager, 对齐聚合根真实接口)

    提供 (对齐 ADBManager 实际方法, 不再用不存在的方法名):
    - start_logcat_monitor / stop_logcat_monitor / update_logcat_pid
    - check_crash_logs (返回 [])
    - is_crash_detected (返回 False)
    - get_logcat_full_log (返回 "")
    - connection / app / bluetooth (聚合属性, auto-MagicMock)
    """
    # P2: spec=ADBManager 阻止访问不存在方法 (调用漂移检测)
    adb = MagicMock(spec=ADBManager)
    adb.start_logcat_monitor = MagicMock(return_value=True)
    adb.stop_logcat_monitor = MagicMock(return_value=None)
    adb.update_logcat_pid = MagicMock(return_value=None)
    adb.check_crash_logs = MagicMock(return_value=[])
    adb.is_crash_detected = MagicMock(return_value=False)
    adb.get_logcat_full_log = MagicMock(return_value="")
    return adb


# ── subprocess mock ───────────────────────────────────────────


@pytest.fixture
def mock_subprocess(monkeypatch):
    """Mock subprocess.run / Popen (P2: spec= 对齐真实接口)

    返回 dict: { run: MagicMock, Popen: MagicMock, instance: MagicMock }
    默认 run 返回 returncode=0, Popen 返回可 communicate/wait 的 mock
    """
    # P2: spec=subprocess.CompletedProcess 对齐 run() 返回值真实接口
    run_result = MagicMock(spec=subprocess.CompletedProcess)
    run_result.returncode = 0
    run_result.stdout = b""
    run_result.stderr = b""
    run_mock = MagicMock(return_value=run_result)

    # P2: spec=subprocess.Popen 对齐 Popen 实例真实接口 (wait/communicate/poll/pid/returncode)
    popen_instance = MagicMock(spec=subprocess.Popen)
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
    """Mock ConfigManager 单例 (P2: spec=ConfigManager, 对齐真实接口)

    用法:
        def test_xxx(mock_config_manager):
            mock_config_manager.get.return_value = "custom_value"

    注: ConfigManager 实际接口为 get/reload/_load_config/_detect_config_path + config 属性,
    不含 set 方法 (原 fixture 误设已删)。
    """
    # P2: spec=ConfigManager 阻止调用不存在方法 (如 set)
    manager = MagicMock(spec=ConfigManager)
    manager.get = MagicMock(return_value=None)
    manager.reload = MagicMock(return_value=None)
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

"""示例 Python fixture 使用 - 验证 fixtures.py 可用

覆盖 mock_adb / mock_subprocess / tmp_config_dir 等共享 fixture。
"""


class TestSharedFixtures:
    """验证 tests/unit/helpers/fixtures.py 的共享 fixture"""

    def test_mock_adb_returns_empty_devices(self, mock_adb):
        """mock_adb 默认返回空设备列表"""
        assert mock_adb.get_connected_devices() == []

    def test_mock_adb_records_calls(self, mock_adb):
        """mock_adb 记录方法调用"""
        mock_adb.execute_command("devices")
        mock_adb.execute_command.assert_called_once_with("devices")

    def test_mock_adb_push_pull(self, mock_adb):
        """mock_adb push/pull 默认返回 True"""
        assert mock_adb.push_file("src", "dst") is True
        assert mock_adb.pull_file("src", "dst") is True

    def test_mock_subprocess_run(self, mock_subprocess):
        """mock_subprocess.run 默认 returncode=0"""
        import subprocess

        result = subprocess.run(["adb", "devices"])
        assert result.returncode == 0
        mock_subprocess["run"].assert_called_once()

    def test_mock_subprocess_popen(self, mock_subprocess):
        """mock_subprocess.Popen 返回可 communicate 的实例"""
        import subprocess

        proc = subprocess.Popen(["adb", "logcat"])
        stdout, stderr = proc.communicate()
        assert stdout == b""
        assert stderr == b""
        assert proc.returncode == 0

    def test_tmp_config_dir_exists(self, tmp_config_dir):
        """tmp_config_dir 创建并存在"""
        assert tmp_config_dir.exists()
        assert tmp_config_dir.name == "config"

    def test_tmp_user_data_env(self, tmp_user_data, monkeypatch):
        """tmp_user_data 设置环境变量"""
        import os

        assert os.environ.get("XKAUTOTESTER_USER_DATA") == str(tmp_user_data)
        assert tmp_user_data.exists()

    def test_tmp_project_root_structure(self, tmp_project_root):
        """tmp_project_root 包含 src/main 和 config"""
        assert (tmp_project_root / "src" / "main").exists()
        assert (tmp_project_root / "config").exists()

    def test_mock_config_manager(self, mock_config_manager):
        """mock_config_manager 提供默认 config 字典"""
        assert mock_config_manager.config["APP_SETTINGS"]["language"] == "zh-CN"

    def test_capture_logs(self, capture_logs):
        """capture_logs 捕获日志"""
        import logging

        logger = logging.getLogger("test")
        logger.info("test message")
        assert "test message" in capture_logs.text

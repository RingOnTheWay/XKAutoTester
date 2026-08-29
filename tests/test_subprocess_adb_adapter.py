"""SubprocessAdbAdapter 单元测试。

验证:
- success 路径: returncode=0, stdout/stderr 透传
- timeout 异常 → AdbResult(-1, "", "timeout: ...")
- 通用异常 → AdbResult(-1, "", "err msg")
- stdout/stderr None 防御 → ""
- args 透传 (含 adb_path 前缀)
- 注入 fake runner
"""

from __future__ import annotations

import subprocess
from dataclasses import dataclass

from main.core.adb.subprocess_adb_adapter import ADB_CMD, SubprocessAdbAdapter


@dataclass
class FakeCompletedProcess:
    """模拟 subprocess.CompletedProcess。"""

    returncode: int
    stdout: str | None = None
    stderr: str | None = None


def make_runner(result_or_exc):
    """构造 fake runner: 返回 result 或抛异常。"""
    calls = []

    def runner(cmd, **kwargs):
        calls.append({"cmd": list(cmd), "kwargs": dict(kwargs)})
        if isinstance(result_or_exc, Exception):
            raise result_or_exc
        return result_or_exc

    runner.calls = calls
    return runner


class TestSubprocessAdbAdapter:
    """SubprocessAdbAdapter 测试。"""

    def test_success_path(self):
        """returncode=0, stdout/stderr 透传。"""
        runner = make_runner(FakeCompletedProcess(0, "version 1.0", ""))
        adapter = SubprocessAdbAdapter(adb_path="/fake/adb", runner=runner)

        result = adapter.execute(["version"])

        assert result.success is True
        assert result.returncode == 0
        assert result.stdout == "version 1.0"
        assert result.stderr == ""
        # cmd 含 adb_path 前缀 + args
        assert runner.calls[0]["cmd"] == ["/fake/adb", "version"]
        # 默认参数透传
        assert runner.calls[0]["kwargs"]["capture_output"] is True
        assert runner.calls[0]["kwargs"]["text"] is True
        assert runner.calls[0]["kwargs"]["timeout"] == 10.0

    def test_failure_path_nonzero_returncode(self):
        """returncode≠0 → success=False, 仍返回结果。"""
        runner = make_runner(FakeCompletedProcess(1, "", "device not found"))
        adapter = SubprocessAdbAdapter(runner=runner)

        result = adapter.execute(["devices"])

        assert result.success is False
        assert result.returncode == 1
        assert result.stderr == "device not found"

    def test_timeout_exception_returns_negative_code(self):
        """TimeoutExpired → AdbResult(-1, '', 'timeout: ...')。"""
        exc = subprocess.TimeoutExpired(cmd=["adb"], timeout=5)
        runner = make_runner(exc)
        adapter = SubprocessAdbAdapter(runner=runner)

        result = adapter.execute(["version"], timeout=5)

        assert result.success is False
        assert result.returncode == -1
        assert result.stdout == ""
        assert "timeout" in result.stderr

    def test_generic_exception_returns_negative_code(self):
        """通用异常 → AdbResult(-1, '', str(exc))。"""
        exc = FileNotFoundError("adb not found")
        runner = make_runner(exc)
        adapter = SubprocessAdbAdapter(runner=runner)

        result = adapter.execute(["version"])

        assert result.success is False
        assert result.returncode == -1
        assert "adb not found" in result.stderr

    def test_stdout_none_defended_to_empty(self):
        """stdout=None → ""。"""
        runner = make_runner(FakeCompletedProcess(0, None, None))
        adapter = SubprocessAdbAdapter(runner=runner)

        result = adapter.execute(["version"])

        assert result.stdout == ""
        assert result.stderr == ""

    def test_custom_timeout_passed_to_runner(self):
        """自定义 timeout 透传给 runner。"""
        runner = make_runner(FakeCompletedProcess(0, "", ""))
        adapter = SubprocessAdbAdapter(runner=runner)

        adapter.execute(["devices"], timeout=30)

        assert runner.calls[0]["kwargs"]["timeout"] == 30

    def test_capture_output_disabled(self):
        """capture_output=False 透传。"""
        runner = make_runner(FakeCompletedProcess(0, "", ""))
        adapter = SubprocessAdbAdapter(runner=runner)

        adapter.execute(["version"], capture_output=False)

        assert runner.calls[0]["kwargs"]["capture_output"] is False

    def test_args_list_passed_through(self):
        """多参数透传。"""
        runner = make_runner(FakeCompletedProcess(0, "", ""))
        adapter = SubprocessAdbAdapter(adb_path="/fake/adb", runner=runner)

        adapter.execute(["-s", "192.168.1.100:5555", "shell", "pidof", "com.x.app"])

        assert runner.calls[0]["cmd"] == [
            "/fake/adb",
            "-s",
            "192.168.1.100:5555",
            "shell",
            "pidof",
            "com.x.app",
        ]

    def test_default_adb_cmd_from_env(self):
        """ADB_CMD 默认从环境变量解析。"""
        # ADB_CMD 在模块加载时已解析,这里仅验证常量存在且为 str
        assert isinstance(ADB_CMD, str)
        assert ADB_CMD  # 非空

    def test_default_runner_is_subprocess_run(self):
        """无 runner 注入时默认 subprocess.run (不实际调用,仅验证属性)。"""
        adapter = SubprocessAdbAdapter()
        # 默认 runner 应为 subprocess.run (或等价)
        assert adapter._runner is subprocess.run


class TestSubprocessAdbAdapterPopenStream:
    """popen_stream 方法测试 — 流式启动 adb 命令。

    区别于 execute:
    - 长生命周期 (readline 循环)
    - 不捕获 stdout (PIPE 用于流式读取)
    - 不超时 (持续到 stop)
    - 修复原 logcat_monitor.py L155 硬编码 "adb" bug — adb 路径走 adapter
    """

    def test_popen_stream_returns_popen_with_correct_cmd(self):
        """popen_stream 返回 factory 的结果, cmd 含 adb_path 前缀 + args。"""
        fake_popen = object()  # 任意非 None 标记
        factory_calls = []

        def fake_factory(cmd, **kwargs):
            factory_calls.append({"cmd": list(cmd), "kwargs": dict(kwargs)})
            return fake_popen

        adapter = SubprocessAdbAdapter(
            adb_path="/custom/adb",
            popen_factory=fake_factory,
        )

        result = adapter.popen_stream(["-s", "dev:5555", "logcat", "-v", "threadtime"])

        assert result is fake_popen
        assert factory_calls[0]["cmd"] == [
            "/custom/adb",
            "-s",
            "dev:5555",
            "logcat",
            "-v",
            "threadtime",
        ]

    def test_popen_stream_uses_adb_path_not_hardcoded(self):
        """L155 bug 回归: cmd[0] 必须来自 adb_path,不是硬编码 'adb'。

        原始 logcat_monitor.py L155 直接 ['adb', ...] 绕过 ADB_CMD 环境变量,
        导致 XKAUTOTESTER_ADB_PATH 设置失效。popen_stream 必须修复此 bug。
        """
        factory_calls = []

        def fake_factory(cmd, **kwargs):
            factory_calls.append(list(cmd))
            return object()

        # 用环境变量指定 adb 路径 (模拟 XKAUTOTESTER_ADB_PATH)
        adapter = SubprocessAdbAdapter(
            adb_path="/env/bin/adb",
            popen_factory=fake_factory,
        )

        adapter.popen_stream(["logcat"])

        # cmd[0] 必须是注入的 adb_path,不是 'adb' 字面量
        assert factory_calls[0][0] == "/env/bin/adb"
        assert factory_calls[0][0] != "adb"

    def test_popen_stream_invokes_injected_popen_factory(self):
        """注入 popen_factory 必须被调用,且仅调用一次 (不调默认 subprocess.Popen)。"""
        call_count = 0

        def fake_factory(cmd, **kwargs):
            nonlocal call_count
            call_count += 1
            return object()

        adapter = SubprocessAdbAdapter(popen_factory=fake_factory)

        adapter.popen_stream(["logcat"])

        assert call_count == 1

    def test_popen_stream_passes_through_kwargs(self):
        """kwargs 透传: 默认 stdout=PIPE/stderr=PIPE,调用方可覆盖。"""
        captured: list[dict] = []

        def fake_factory(cmd, **kwargs):
            captured.append(dict(kwargs))
            return object()

        adapter = SubprocessAdbAdapter(popen_factory=fake_factory)

        # 默认: stdout=PIPE + stderr=PIPE
        adapter.popen_stream(["logcat"])
        assert captured[0]["stdout"] == subprocess.PIPE
        assert captured[0]["stderr"] == subprocess.PIPE

        # 调用方覆盖: stdout=DEVNULL
        adapter.popen_stream(["logcat"], stdout=subprocess.DEVNULL)
        assert captured[1]["stdout"] == subprocess.DEVNULL
        # stderr 仍为默认 PIPE
        assert captured[1]["stderr"] == subprocess.PIPE

        # 调用方追加: text=True, bufsize=1
        adapter.popen_stream(["logcat"], text=True, bufsize=1)
        assert captured[2]["text"] is True
        assert captured[2]["bufsize"] == 1

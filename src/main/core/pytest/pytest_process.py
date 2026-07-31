"""PytestProcess — pytest 子进程边界封装。

职责:
- subprocess.Popen 启动 pytest
- 双线程并行捕获 stdout/stderr (避免 stderr 缓冲区死锁)
- ANSI 转义清理 (clean_ansi_escape)
- 日志分流 (stdout→info, stderr→error) 实时转发到父进程 stderr (Electron TEST_ERROR 红字)
- 阻塞至子进程结束, 返回 PytestRunResult

设计 (mirror LogcatProcess):
- 不 catch 异常, 冒泡到 facade
- 不持锁, 管道 EOF 自然同步
- run() 阻塞至子进程结束
- popen_factory kwarg 注入 (测试用 FakePopen, 生产用 subprocess.Popen)
"""
from __future__ import annotations

import logging
import subprocess
import sys
from collections.abc import Callable
from threading import Thread

from main.core.pytest.pytest_process_port import PytestRunResult
from main.utils.text import clean_ansi_escape

logger = logging.getLogger(__name__)


def _default_popen(command: list[str]) -> subprocess.Popen:
    """默认 popen 工厂: subprocess.Popen + text + 行缓冲。"""
    return subprocess.Popen(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
        universal_newlines=True,
    )


class PytestProcess:
    """pytest 子进程边界封装。"""

    def __init__(
        self,
        *,
        popen_factory: Callable[[list[str]], subprocess.Popen] | None = None,
    ) -> None:
        """
        Args:
            popen_factory: Popen 工厂 (默认 subprocess.Popen, 测试用 FakePopen)
        """
        self._popen_factory = popen_factory or _default_popen

    def run(self, command: list[str]) -> PytestRunResult:
        """执行 pytest 命令, 阻塞至结束, 返回 PytestRunResult。

        stdout 行直接写父进程 sys.stdout (Electron TEST_OUTPUT 黑字),
        stderr 行直接写父进程 sys.stderr (Electron TEST_ERROR 红字), 实时无缓冲。
        cli.py _wrap_stdio 已包装 sys.stdout/stderr 为 utf-8 TextIOWrapper(line_buffering=True)。

        不用 logger 转发: 避免 stdout/stderr 都汇入 console_handler (父 stderr) 导致全红字重复。
        PytestProcess 自身日志 (如 Execute 命令) 仍用 logger, 记录到文件 + 父 stderr。

        Args:
            command: 完整命令 (如 [sys.executable, '-m', 'pytest', '-v', ...])

        Returns:
            PytestRunResult (exit_code + stdout + stderr, ANSI 已清理)
        """
        logger.info(f"Execute: {' '.join(command)}")

        process = self._popen_factory(command)

        # 后台线程并行读取 stderr, 避免 stderr 缓冲区填满导致死锁
        stderr_lines: list[str] = []

        def _read_stderr() -> None:
            assert process.stderr is not None
            while True:
                line = process.stderr.readline()
                if not line and process.poll() is not None:
                    break
                if line:
                    clean = clean_ansi_escape(line).rstrip()
                    stderr_lines.append(clean)
                    if clean.strip():
                        # 直接写父进程 stderr (红字), 实时转发 pytest stderr (测试代码日志)
                        sys.stderr.write(clean + "\n")
                        sys.stderr.flush()

        stderr_thread = Thread(target=_read_stderr, daemon=True)
        stderr_thread.start()

        # 主线程读取 stdout
        stdout_lines: list[str] = []
        assert process.stdout is not None
        while True:
            line = process.stdout.readline()
            if not line and process.poll() is not None:
                break
            if line:
                clean = clean_ansi_escape(line).rstrip()
                stdout_lines.append(clean)
                if clean.strip():
                    # 直接写父进程 stdout (黑字), 实时转发 pytest stdout (banner/PASSED/FAILED)
                    sys.stdout.write(clean + "\n")
                    sys.stdout.flush()

        # 获取退出码 + 等 stderr 线程结束 (管道关闭后线程自然退出, 加 5s 超时保险)
        exit_code = process.wait()
        stderr_thread.join(timeout=5)

        return PytestRunResult(
            exit_code=exit_code,
            stdout="\n".join(stdout_lines),
            stderr="\n".join(stderr_lines),
        )

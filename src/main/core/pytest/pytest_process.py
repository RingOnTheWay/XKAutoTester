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
import time
from collections.abc import Callable
from threading import Thread

from main.core.pytest.pytest_process_port import PytestRunResult
from main.core.subprocess_handle import SubprocessHandle
from main.utils.text import clean_ansi_escape

logger = logging.getLogger(__name__)


def _default_popen(command: list[str], cwd: str | None = None) -> subprocess.Popen:
    """默认 popen 工厂: subprocess.Popen + text + 行缓冲。

    Args:
        command: 待执行命令
        cwd: 子进程工作目录 (None 时继承父进程 CWD)
    """
    return subprocess.Popen(
        command,
        cwd=cwd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
        universal_newlines=True,
    )


class PytestProcess(SubprocessHandle):
    """pytest 子进程边界封装。"""

    _TERMINATE_TIMEOUT = 2.0
    _KILL_TIMEOUT = 2.0
    _LABEL = "PytestProcess"

    def __init__(
        self,
        *,
        cwd: str | None = None,
        popen_factory: Callable[[list[str]], subprocess.Popen] | None = None,
    ) -> None:
        """
        Args:
            cwd: pytest 子进程工作目录。传 project_root 可避免 Windows 相对路径
                在错误 CWD 下执行 (测试路径按 project_root 相对解析后须以
                project_root 为基准执行)。
            popen_factory: Popen 工厂 (默认 subprocess.Popen, 测试用 FakePopen)。
                Pop 工厂签名保持 [command] -> Popen; 默认工厂通过 self._cwd 捕获 cwd。
        """
        self._cwd = cwd
        if popen_factory is None:
            self._popen_factory = lambda command: _default_popen(command, cwd=self._cwd)
        else:
            self._popen_factory = popen_factory
        # 持有 process 引用供 stop() 终止 (mirror LogcatProcess.stop 幂等模式)
        self._process: subprocess.Popen | None = None

    def stop(self) -> None:
        """终止 pytest 子进程 (幂等, 委托 SubprocessHandle._stop_process).

        由 cli KeyboardInterrupt 处理或外部中断调用.
        terminate→wait(2s)→kill→wait(2s) 兜底, 不抛异常.
        """
        self._stop_process()

    def run(self, command: list[str], timeout: float | None = None) -> PytestRunResult:
        """执行 pytest 命令, 阻塞至结束, 返回 PytestRunResult。

        stdout 行直接写父进程 sys.stdout (Electron TEST_OUTPUT 黑字),
        stderr 行直接写父进程 sys.stderr (Electron TEST_ERROR 红字), 实时无缓冲。

        P1-9: 支持 timeout 看门狗 — 超过 timeout 秒未结束则强制终止子进程并返回
        exit_code=-1 的超时结果, 防止被测用例死锁时整条链路永久阻塞。

        设计 (mirror LogcatProcess):
        - 不 catch 异常, 冒泡到 facade
        - 不持锁, 管道 EOF 自然同步
        - run() 阻塞至子进程结束 (timeout 非 None 时受看门狗约束)
        - popen_factory kwarg 注入 (测试用 FakePopen, 生产用 subprocess.Popen)

        日志分流说明:
        - stdout 行直接写父进程 sys.stdout (Electron TEST_OUTPUT 黑字)
        - stderr 行直接写父进程 sys.stderr (Electron TEST_ERROR 红字), 实时无缓冲
        - 不用 logger 转发: 避免 stdout/stderr 都汇入 console_handler (父 stderr) 导致全红字重复
        - PytestProcess 自身日志 (如 Execute 命令) 仍用 logger, 记录到文件 + 父 stderr

        Args:
            command: 完整命令 (如 [sys.executable, '-m', 'pytest', '-v', ...])
            timeout: 看门狗秒数 (None=不超时)

        Returns:
            PytestRunResult (exit_code + stdout + stderr, ANSI 已清理)
        """
        logger.info(f"Execute: {' '.join(command)}")

        # 存 self._process 供 stop() 终止
        self._process = self._popen_factory(command)
        process = self._process

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
        # R24 P1-4: 看门狗移入读循环 — 原实现先 readline() 阻塞 (子进程存活且无新输出时
        # 永不返回), 导致下方 process.wait(timeout=timeout) 永远执行不到, 死锁用例让
        # 整链路永久挂起 (P1-9 声称已修复实则失效)。现改为循环内按耗时检查, 超时即终止。
        start_time = time.monotonic() if timeout is not None else None
        while True:
            if timeout is not None and time.monotonic() - start_time > timeout:
                self.stop()
                stderr_thread.join(timeout=5)
                self._process = None
                return PytestRunResult(
                    exit_code=-1,
                    stdout="\n".join(stdout_lines),
                    stderr="\n".join(stderr_lines) + f"\n[pytest 执行超时 ({timeout}s), 已强制终止]",
                )
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
        # KeyboardInterrupt 显式 stop() 终止子进程, 避免孤儿
        # R24 P1-4: 超时已在读循环内拦截并 return, 此处 wait() 无需再带 timeout —
        # 读循环 break 时子进程已退出 (poll() is not None), wait() 立即返回。
        try:
            exit_code = process.wait()
        except KeyboardInterrupt:
            self.stop()
            raise
        finally:
            stderr_thread.join(timeout=5)
            self._process = None

        return PytestRunResult(
            exit_code=exit_code,
            stdout="\n".join(stdout_lines),
            stderr="\n".join(stderr_lines),
        )

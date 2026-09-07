"""pytest_process_port: pytest 子进程边界 Port + 值对象。

定义:
- PytestRunResult: 不可变值对象 (exit_code/stdout/stderr + success 属性)
- PytestProcessPort: 单方法 run Protocol

生产: PytestProcess (subprocess.Popen + 双线程)
测试: FakePytestProcess (鸭子类型, 不起子进程)
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class PytestRunResult:
    """pytest 子进程执行结果 (不可变值对象)。

    Attributes:
        exit_code: 进程退出码 (0=成功, 1=测试失败, 2=中断, 5=无用例)
        stdout: ANSI 清理后的 stdout 全文 (\\n join, 行已 rstrip)
        stderr: ANSI 清理后的 stderr 全文
    """

    exit_code: int
    stdout: str
    stderr: str

    @property
    def success(self) -> bool:
        """exit_code == 0 时为 True。"""
        return self.exit_code == 0


class PytestProcessPort(Protocol):
    """pytest 子进程边界 Port。

    单方法 run: 启动 pytest 子进程 + 双线程捕获 stdout/stderr + 阻塞至结束。

    生产: PytestProcess (subprocess.Popen + Thread)
    测试: FakePytestProcess (鸭子类型, 不起子进程)
    """

    def run(self, command: list[str], timeout: float | None = None) -> PytestRunResult:
        """执行 pytest 命令, 阻塞至结束, 返回 PytestRunResult。

        Args:
            command: 完整命令 (如 [sys.executable, '-m', 'pytest', '-v', ...])
            timeout: 可选看门狗秒数 (P1-9)。超时强制终止子进程并返回
                exit_code=-1 的超时结果; None 表示不超时。

        Returns:
            PytestRunResult (exit_code/stdout/stderr)
        """
        ...

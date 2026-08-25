"""SubprocessHandle — 子进程终止通用基类。

抽取 PytestProcess / LogcatProcess / AppiumServer 三处重复的 stop 模板:
- 守卫: _process is None 直接返回 (幂等)
- terminate → wait(terminate_timeout)
- 超时 → kill → wait(kill_timeout)
- 异常吞掉记 warning (stop 路径不抛, 调用方期望幂等)
- finally 置 _process = None

差异 (子类用类属性覆写):
- _TERMINATE_TIMEOUT: terminate 后 wait 超时 (Pytest 2s, Logcat 3s, Appium 10s)
- _KILL_TIMEOUT: kill 后 wait 超时 (统一 2s; 修复 AppiumServer 原 kill 后不 wait 的潜在孤儿)
- _LABEL: 日志标识 (可观测性)

子类契约:
- __init__ 中初始化 self._process = None
- stop() 委托 self._stop_process()
- 如需在 stop 前后做额外清理 (如 AppiumServer 的 _LogPump + 端口清理), 在 stop() 中组合调用

不持锁, 锁由 facade 持有 (对称 LogcatProcess 设计)。
"""
from __future__ import annotations

import logging
import subprocess

logger = logging.getLogger(__name__)


class SubprocessHandle:
    """子进程终止通用基类。

    子类持 self._process: subprocess.Popen | None, 调 self._stop_process() 终止。
    """

    # 子类覆写 (默认值匹配最常见用法)
    _TERMINATE_TIMEOUT: float = 2.0
    _KILL_TIMEOUT: float = 2.0
    _LABEL: str = "Subprocess"

    def _stop_process(
        self,
        *,
        terminate_timeout: float | None = None,
        kill_timeout: float | None = None,
        label: str | None = None,
    ) -> None:
        """幂等终止 self._process: terminate → wait → kill → wait → 置 None。

        Args:
            terminate_timeout: 覆写 self._TERMINATE_TIMEOUT
            kill_timeout: 覆写 self._KILL_TIMEOUT
            label: 覆写 self._LABEL (日志标识)
        """
        process = getattr(self, "_process", None)
        if process is None:
            return
        term_to = terminate_timeout if terminate_timeout is not None else self._TERMINATE_TIMEOUT
        kill_to = kill_timeout if kill_timeout is not None else self._KILL_TIMEOUT
        lbl = label or self._LABEL
        try:
            process.terminate()
            process.wait(timeout=term_to)
        except subprocess.TimeoutExpired:
            try:
                process.kill()
                process.wait(timeout=kill_to)
            except Exception as e:  # noqa: BLE001
                logger.warning(f"{lbl} stop kill failed (non-fatal, process may be orphaned): {e}")
        except Exception as e:  # noqa: BLE001
            logger.warning(f"{lbl} stop terminate failed (non-fatal): {e}")
        finally:
            self._process = None

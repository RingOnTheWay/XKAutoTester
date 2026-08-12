"""JSON line stdio 协议层。

stdin 读 loop + 帧路由 + stdout 写。业务层用 @command 注册,用 notify() 推通知。
替代 __main__.py InspectorRunner 的 _dispatch if/elif + _notify_progress 直写 stdout。

S6: exit_command 由构造方注入 (解耦 inspector_constants),通用协议层不再硬编码业务命令。
"""

import json
import logging
import sys
from collections.abc import Callable
from typing import Any, TextIO

logger = logging.getLogger(__name__)


class StdioProtocol:
    """JSON line stdio 协议。stdin 读 loop + 帧路由 + stdout 写。

    业务层用 @command 注册命令处理函数,用 notify() 推通知。
    """

    def __init__(
        self,
        exit_command: str,
        *,
        stdin: TextIO | None = None,
        stdout: TextIO | None = None,
    ) -> None:
        """Args:
            exit_command: 收到此命令后退出 run() 循环 (S6: 解耦 inspector_constants,
                由调用方从 inspector_constants.STOP_SESSION 注入).
            stdin/stdout: 默认 sys.stdin/sys.stdout. 测试传 io.StringIO.
        """
        self._exit_command = exit_command
        self._stdin = stdin if stdin is not None else sys.stdin
        self._stdout = stdout if stdout is not None else sys.stdout
        self._handlers: dict[str, Callable[..., dict]] = {}
        self._stopped = False

    def command(self, name: str) -> Callable[[Callable[..., dict]], Callable[..., dict]]:
        """装饰器:注册命令处理函数。函数签名 (**params) -> dict。"""

        def decorator(func: Callable[..., dict]) -> Callable[..., dict]:
            self._handlers[name] = func
            return func

        return decorator

    def notify(self, notification_type: str, payload: dict | None = None) -> None:
        """发 Notification 帧。藏 JSON 编码 + flush + 异常吞。

        例: self._proto.notify('progress', {'stage': 'appium-starting'})

        R10 协议契约收紧 (inspector-protocol.json additionalProperties: false):
        - ``stage`` 提升到帧顶层 (schema 显式允许, JS handler 直读 frame.stage)
        - 其他 payload 字段统一塞进 ``payload`` 子对象 (schema 显式允许, 避免每次扩 schema)
        - 调用方传 ``kind``/``type`` 会被丢弃 (防覆盖帧头)
        """
        frame: dict[str, Any] = {"kind": "notification", "type": notification_type}
        if payload:
            extra: dict[str, Any] = {}
            for k, v in payload.items():
                if k in ("kind", "type"):
                    continue
                if k == "stage":
                    frame["stage"] = v
                else:
                    extra[k] = v
            if extra:
                frame["payload"] = extra
        self._write_frame(frame)

    def run(self) -> None:
        """阻塞读 stdin -> 路由 -> 写 Response。

        1. 发 'ready' notification (替代 JS 500ms 盲等)
        2. readline -> parse -> 按 command 路由到 handler -> 写 response
        3. EOF / stop-session -> 退出
        parse error 写 error response,不退出。
        """
        # 1. 发 ready 握手
        self.notify("ready")

        # 2. 读 loop
        while not self._stopped:
            line = self._stdin.readline()
            if not line:
                break  # EOF

            line = line.strip()
            if not line:
                continue

            try:
                request = json.loads(line)
            except json.JSONDecodeError as e:
                self._write_frame({"kind": "response", "id": None, "success": False, "error": f"Invalid JSON: {e}"})
                continue

            command = request.get("command", "")
            params = request.get("params", {})
            request_id = request.get("id")

            response = self._dispatch(command, params)
            if request_id is not None:
                response["id"] = request_id
            response["kind"] = "response"
            self._write_frame(response)

            if command == self._exit_command:
                break

    def stop(self) -> None:
        """从外部线程请求停止 run() 循环。"""
        self._stopped = True

    # ---- 内部实现 ----

    def _dispatch(self, command: str, params: dict) -> dict:
        handler = self._handlers.get(command)
        if handler is None:
            return {"success": False, "error": f"Unknown command: {command}"}
        try:
            return handler(**params)
        except Exception as e:
            return {"success": False, "error": str(e)}

    def _write_frame(self, frame: dict) -> None:
        try:
            self._stdout.write(json.dumps(frame, ensure_ascii=False) + "\n")
            self._stdout.flush()
        except Exception as e:
            # stdout 写失败 (如 pipe 断) 不崩, 但加可观测性 (调试时可知 frame 未送达)
            logger.warning(f"Failed to write stdio frame: {e}")

"""StdioProtocol 单元测试 - JSON line stdio 协议层

验证: 1) run 发 ready + 路由命令 + 写 response 2) @command 注册
      3) notify 发通知帧 4) EOF 退出 5) stop-session 退出 6) 非法 JSON 写 error response
"""

import io
import json

import pytest

from main.core.stdio_protocol import StdioProtocol


@pytest.mark.unit
class TestStdioProtocolRun:
    """run 方法测试"""

    def test_run_sends_ready_and_processes_command(self):
        """run 入口发 ready notification,路由命令,写 response,EOF 退出"""
        stdin = io.StringIO(json.dumps({"kind": "request", "id": 1, "command": "get-screenshot", "params": {}}) + "\n")
        stdout = io.StringIO()
        proto = StdioProtocol(stdin=stdin, stdout=stdout)

        @proto.command("get-screenshot")
        def _handler(**params):
            return {"success": True, "screenshot": "base64data"}

        proto.run()

        out_lines = stdout.getvalue().strip().split("\n")
        # 第 1 行: ready notification
        ready = json.loads(out_lines[0])
        assert ready["kind"] == "notification"
        assert ready["type"] == "ready"
        # 第 2 行: response
        resp = json.loads(out_lines[1])
        assert resp["kind"] == "response"
        assert resp["id"] == 1
        assert resp["success"] is True
        assert resp["screenshot"] == "base64data"

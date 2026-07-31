"""Inspector 协议常量镜像。SSOT: electron/src/shared/inspector-protocol.json

改命令名/帧类型/notification 类型时,同步改此文件 + inspector-protocol.json + JS inspectorConstants.js
"""

from typing import Literal

InspectorCommand = Literal[
    "start-session",
    "get-screenshot",
    "get-source",
    "find-locators",
    "refresh",
    "stop-session",
]

# 具名常量:消除字面量重复,供 stdio_protocol/Cli/InspectorService 引用
START_SESSION = "start-session"
GET_SCREENSHOT = "get-screenshot"
GET_SOURCE = "get-source"
FIND_LOCATORS = "find-locators"
REFRESH = "refresh"
STOP_SESSION = "stop-session"

INSPECTOR_COMMANDS = (
    START_SESSION,
    GET_SCREENSHOT,
    GET_SOURCE,
    FIND_LOCATORS,
    REFRESH,
    STOP_SESSION,
)

NOTIFICATION_TYPES = ("ready", "progress")

FRAME_KINDS = ("request", "response", "notification")

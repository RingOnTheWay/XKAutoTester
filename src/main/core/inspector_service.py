from __future__ import annotations

import functools
import logging
import re
import socket
import xml.etree.ElementTree as ET
from collections.abc import Callable
from typing import TYPE_CHECKING

from appium import webdriver
from appium.options.android import UiAutomator2Options

from main.core.adb.adb_port import AdbCommandPort
from main.core.adb.subprocess_adb_adapter import SubprocessAdbAdapter
from main.core.appium_server import AppiumServer
from main.utils.i18n import t

if TYPE_CHECKING:
    from main.core.stdio_protocol import StdioProtocol

logger = logging.getLogger(__name__)

# 工厂类型别名 (与 SubprocessAdbAdapter.runner/popen_factory 风格一致)
DriverFactory = Callable[[str, UiAutomator2Options], webdriver.Remote]
ServerFactory = Callable[[str, int], AppiumServer]

# Inspector 专用端口 (与 AppiumServer.DEFAULT_PORT=4723 不同, 避免与主 Appium 实例端口冲突)
INSPECTOR_PORT = 4725

_APPIUM_ERROR_PATTERNS = [
    (re.compile(r"doesn't exist or cannot be launched", re.IGNORECASE), "inspector.errorActivityNotFound"),
    (re.compile(r"device.*(?:not found|offline|unreachable)", re.IGNORECASE), "inspector.errorDeviceNotFound"),
    (re.compile(r"package.*(?:not found|not installed)", re.IGNORECASE), "inspector.errorAppNotInstalled"),
    (re.compile(r"(?:timeout|timed out)", re.IGNORECASE), "inspector.errorTimeout"),
    (re.compile(r"permission.*denied", re.IGNORECASE), "inspector.errorPermissionDenied"),
    (re.compile(r"(?:connection refused|econnrefused)", re.IGNORECASE), "inspector.errorConnectionRefused"),
    (re.compile(r"(?:port.*(?:in use|already)|eaddrinuse)", re.IGNORECASE), "inspector.errorPortInUse"),
    (re.compile(r"session.*(?:not created|cannot create)", re.IGNORECASE), "inspector.errorSessionNotCreated"),
]


def _map_appium_error(raw_error: str) -> str:
    if not raw_error:
        return t("inspector.errorUnknown")
    for pattern, i18n_key in _APPIUM_ERROR_PATTERNS:
        if pattern.search(raw_error):
            return t(i18n_key)
    return t("inspector.errorUnknown")


def _check_port_in_use(port: int) -> bool:
    """检查端口是否被占用（socket connect_ex 检测 LISTENING 状态，跨平台无 shell 注入）"""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(2)
            return s.connect_ex((AppiumServer.DEFAULT_HOST, port)) == 0
    except Exception as e:
        # 加可观测性, 区分"端口未占用"与"检查失败" (socket 异常被当作未占用会触发端口冲突)
        logger.warning(f"端口 {port} 占用检查失败 (视为未占用): {e}")
        return False


def _parse_xml_to_tree(element: ET.Element, path: str = "0") -> dict:
    node = {
        "tagName": element.tag,
        "attributes": dict(element.attrib),
        "children": [],
        "path": path,
    }
    for i, child in enumerate(element):
        child_path = f"{path}.{i}"
        node["children"].append(_parse_xml_to_tree(child, child_path))
    return node


def _generate_locators(attrs: dict) -> list[dict]:
    """7 策略生成 locators (纯函数, 无副作用)。

    策略顺序:
    1. click (bounds 中心坐标)
    2. id (resource-id)
    3. accessibility_id (content-desc)
    4. xpath by resource-id
    5. xpath by text
    6. xpath by content-desc
    7. class_name
    """
    locators: list[dict] = []

    bounds_str = attrs.get("bounds", "")
    if bounds_str:
        bounds_match = re.match(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", bounds_str)
        if bounds_match:
            x1, y1, x2, y2 = (
                int(bounds_match.group(1)),
                int(bounds_match.group(2)),
                int(bounds_match.group(3)),
                int(bounds_match.group(4)),
            )
            center_x = (x1 + x2) // 2
            center_y = (y1 + y2) // 2
            locators.append(
                {
                    "type": "click",
                    "value": f"{center_x},{center_y}",
                    "description": f"Click at coordinates: ({center_x}, {center_y})",
                }
            )

    resource_id = attrs.get("resource-id", "")
    if resource_id:
        locators.append(
            {
                "type": "id",
                "value": resource_id,
                "description": f"Resource ID: {resource_id}",
            }
        )

    content_desc = attrs.get("content-desc", "")
    if content_desc:
        locators.append(
            {
                "type": "accessibility_id",
                "value": content_desc,
                "description": f"Accessibility ID from content-desc: {content_desc}",
            }
        )

    class_attr = attrs.get("class", "")

    if class_attr and resource_id:
        locators.append(
            {
                "type": "xpath",
                "value": f'//{class_attr}[@resource-id="{resource_id}"]',
                "description": f"XPath by resource-id: {resource_id}",
            }
        )

    text = attrs.get("text", "")
    if text and class_attr:
        locators.append(
            {
                "type": "xpath",
                "value": f'//{class_attr}[@text="{text}"]',
                "description": f"XPath by text: {text}",
            }
        )

    if content_desc and class_attr:
        locators.append(
            {
                "type": "xpath",
                "value": f'//{class_attr}[@content-desc="{content_desc}"]',
                "description": f"XPath by content-desc: {content_desc}",
            }
        )

    if class_attr:
        locators.append(
            {
                "type": "class_name",
                "value": class_attr,
                "description": f"Class name: {class_attr}",
            }
        )

    return locators


def _find_element_by_path(tree: dict, path: str) -> dict | None:
    """按 '0.1.2' 路径找节点, 返回 attributes (纯函数)。

    首段必须 0 (根节点), 越界返回 None。
    """
    parts = path.split(".")
    current = tree
    for i, idx_str in enumerate(parts):
        idx = int(idx_str)
        if i == 0:
            if idx != 0:
                return None
            continue
        children = current.get("children", [])
        if idx < len(children):
            current = children[idx]
        else:
            return None
    return current.get("attributes")


def _with_session(fn: Callable) -> Callable:
    """装饰 InspectorService 方法: 统一 driver None 检查 + Exception 兜底 → _map_appium_error。

    消除 get_screenshot/find_locators/refresh 3 处重复的 try/except + error map 模板。
    start_session/stop_session (driver None 语义不同) / get_page_source (ET.ParseError 特殊处理) 不装饰。
    """

    @functools.wraps(fn)
    def wrapper(self, *args, **kwargs):
        if self.driver is None:
            return {"success": False, "error": t("inspector.errorNoSession")}
        try:
            return fn(self, *args, **kwargs)
        except Exception as e:
            logger.error(f"Failed in {fn.__name__}: {e}")
            return {"success": False, "error": _map_appium_error(str(e))}

    return wrapper


class InspectorService:
    def __init__(
        self,
        proto: StdioProtocol | None = None,
        *,
        driver_factory: DriverFactory | None = None,
        server_factory: ServerFactory | None = None,
        adapter: AdbCommandPort | None = None,
    ) -> None:
        """
        Args:
            proto: stdio 协议层 (进度通知, None 静默)
            driver_factory: webdriver.Remote 工厂 (默认 webdriver.Remote)
            server_factory: AppiumServer 工厂 (默认 lambda host,port: AppiumServer(host,port))
            adapter: AdbCommandPort (默认 SubprocessAdbAdapter, 唤醒设备用)
        """
        self._proto = proto
        self._driver_factory = driver_factory or webdriver.Remote
        self._server_factory = server_factory or (
            lambda host, port: AppiumServer(host=host, port=port)
        )
        self._adb: AdbCommandPort = adapter or SubprocessAdbAdapter()
        self.driver: webdriver.Remote | None = None
        self.appium_server: AppiumServer | None = None
        self._cached_source: str | None = None
        self._cached_tree: dict | None = None
        self._device_name: str = ""

    def start_session(
        self, device_name: str, app_package: str, app_activity: str, platform_version: str = "", no_reset: bool = True
    ) -> dict:
        try:
            if self.driver is not None:
                return {"success": False, "error": t("inspector.errorSessionExists")}

            self._device_name = device_name
            port_warning = ""
            if _check_port_in_use(AppiumServer.DEFAULT_PORT):
                port_warning = f"Port {AppiumServer.DEFAULT_PORT} is in use by another Appium instance. Inspector will use port {INSPECTOR_PORT}."
                logger.warning(port_warning)

            self._notify_progress("appium-starting")
            self.appium_server = self._server_factory(AppiumServer.DEFAULT_HOST, INSPECTOR_PORT)
            if not self.appium_server.start():
                # 失败分支清理残留实例, 与下方异常分支保持状态一致 (避免实例残留泄漏)
                self.appium_server.stop()
                self.appium_server = None
                return {"success": False, "error": t("inspector.errorAppiumStartFailed")}

            self._notify_progress("appium-started")

            self._notify_progress("session-creating")
            options = UiAutomator2Options()
            options.platform_name = "Android"
            if platform_version:
                options.platform_version = platform_version
            options.device_name = device_name
            options.app_package = app_package
            options.app_activity = app_activity
            options.no_reset = no_reset
            options.set_capability("dontStopAppOnReset", no_reset)
            AppiumServer.apply_default_capabilities(options)

            server_url = self.appium_server.server_url
            self.driver = self._driver_factory(server_url, options=options)
            # 设置HTTP请求超时，防止息屏后请求挂起
            try:
                self.driver.command_executor.set_timeout(15)
            except Exception as e:
                # 加可观测性 (与 stdio_protocol._write_frame 的 logger.warning 模式一致)
                logger.warning(f"set HTTP timeout 15s failed (non-fatal, will use default): {e}")

            self._notify_progress("session-created")

            self._cached_source = None
            self._cached_tree = None

            session_id = self.driver.session_id
            logger.info(f"Inspector session created: {session_id}")
            result = {"success": True, "session_id": session_id}
            if port_warning:
                result["warning"] = port_warning
            return result

        except Exception as e:
            logger.error(f"Failed to start inspector session: {e}")
            if self.driver:
                try:
                    self.driver.quit()
                except Exception as quit_err:
                    # 加可观测性 (driver.quit 失败已知, 但记录原因便于排查 session 泄漏)
                    logger.warning(f"driver.quit on start_session failure failed: {quit_err}")
                self.driver = None
            if self.appium_server:
                self.appium_server.stop()
                self.appium_server = None
            return {"success": False, "error": _map_appium_error(str(e))}

    @_with_session
    def get_screenshot(self) -> dict:
        screenshot_b64 = self.driver.get_screenshot_as_base64()
        data_uri = f"data:image/png;base64,{screenshot_b64}"
        return {"success": True, "screenshot": data_uri}

    def get_page_source(self) -> dict:
        try:
            if self.driver is None:
                return {"success": False, "error": t("inspector.errorNoSession")}

            source = self.driver.page_source
            self._cached_source = source

            root = ET.fromstring(source)
            tree = _parse_xml_to_tree(root, "0")
            self._cached_tree = tree

            return {"success": True, "source": source, "elements": tree}

        except ET.ParseError as e:
            logger.error(f"Failed to parse XML source: {e}")
            if self._cached_source:
                return {"success": True, "source": self._cached_source, "elements": self._cached_tree or {}}
            return {"success": False, "error": t("inspector.errorXmlParse")}
        except Exception as e:
            logger.error(f"Failed to get page source: {e}")
            return {"success": False, "error": _map_appium_error(str(e))}

    @_with_session
    def find_locators(self, element_path: str) -> dict:
        if self._cached_tree is None:
            result = self.get_page_source()
            if not result.get("success"):
                return result

        element_attrs = _find_element_by_path(self._cached_tree, element_path)
        if element_attrs is None:
            return {"success": False, "error": t("inspector.errorElementNotFound")}

        locators = _generate_locators(element_attrs)

        return {"success": True, "locators": locators}

    @_with_session
    def refresh(self) -> dict:
        # 先唤醒设备屏幕，防止息屏后无法截图
        self._wake_device()

        screenshot_result = self.get_screenshot()
        if not screenshot_result.get("success"):
            return screenshot_result

        source_result = self.get_page_source()
        if not source_result.get("success"):
            return source_result

        return {
            "success": True,
            "screenshot": screenshot_result["screenshot"],
            "source": source_result["source"],
            "elements": source_result["elements"],
        }

    def stop_session(self) -> dict:
        try:
            if self.driver is not None:
                try:
                    self.driver.quit()
                    logger.info("Inspector driver closed")
                except Exception as e:
                    logger.warning(f"Error closing driver: {e}")
                self.driver = None

            if self.appium_server is not None:
                self.appium_server.stop()
                self.appium_server = None

            self._cached_source = None
            self._cached_tree = None

            logger.info("Inspector session stopped")
            return {"success": True}

        except Exception as e:
            logger.error(f"Error stopping inspector session: {e}")
            self.driver = None
            self.appium_server = None
            return {"success": False, "error": _map_appium_error(str(e))}

    def _wake_device(self):
        """通过ADB唤醒设备屏幕，防止息屏后Appium会话失效。

        走 AdbCommandPort.execute, 不再直 subprocess.run (修复 L341 破口)。
        adapter 内部吞异常 -> AdbResult(-1, ...), 与原 except: pass 等价。
        """
        if not self._device_name:
            return
        self._adb.execute(
            ["-s", self._device_name, "shell", "input", "keyevent", "224"],
            timeout=5,
        )

    def _notify_progress(self, stage: str) -> None:
        """发 progress notification。委托协议层,不再直写 stdout。"""
        if self._proto is not None:
            self._proto.notify("progress", {"stage": stage})

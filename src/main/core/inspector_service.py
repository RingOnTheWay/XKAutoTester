import json
import logging
import re
import subprocess
import sys
import xml.etree.ElementTree as ET

from appium import webdriver
from appium.options.android import UiAutomator2Options

from main.core.appium_server import AppiumServer

logger = logging.getLogger(__name__)

INSPECTOR_PORT = 4725
DEFAULT_PORT = 4723


def _check_port_in_use(port: int) -> bool:
    try:
        result = subprocess.run(f'netstat -ano | findstr ":{port}"', shell=True, capture_output=True, text=True, timeout=10)
        return bool(result.stdout and f':{port}' in result.stdout and 'LISTENING' in result.stdout)
    except Exception:
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



class InspectorService:
    def __init__(self):
        self.driver: webdriver.Remote | None = None
        self.appium_server: AppiumServer | None = None
        self._cached_source: str | None = None
        self._cached_tree: dict | None = None

    def start_session(self, device_name: str, app_package: str, app_activity: str, platform_version: str = "") -> dict:
        try:
            if self.driver is not None:
                return {"success": False, "error": "Session already exists. Stop the current session first."}

            port_warning = ""
            if _check_port_in_use(DEFAULT_PORT):
                port_warning = f"Port {DEFAULT_PORT} is in use by another Appium instance. Inspector will use port {INSPECTOR_PORT}."
                logger.warning(port_warning)

            self._notify_progress("appium-starting")
            self.appium_server = AppiumServer(host=AppiumServer.DEFAULT_HOST, port=INSPECTOR_PORT)
            if not self.appium_server.start():
                self.appium_server.force_cleanup()
                return {"success": False, "error": f"Failed to start Appium server on port {INSPECTOR_PORT}"}

            self._notify_progress("appium-started")

            self._notify_progress("session-creating")
            options = UiAutomator2Options()
            options.platform_name = "Android"
            if platform_version:
                options.platform_version = platform_version
            options.device_name = device_name
            options.app_package = app_package
            options.app_activity = app_activity
            options.no_reset = True
            options.set_capability("dontStopAppOnReset", True)
            AppiumServer.apply_default_capabilities(options)

            server_url = f"http://{AppiumServer.DEFAULT_HOST}:{INSPECTOR_PORT}"
            self.driver = webdriver.Remote(command_executor=server_url, options=options)

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
                except Exception:
                    pass
                self.driver = None
            if self.appium_server:
                self.appium_server.force_cleanup()
                self.appium_server = None
            return {"success": False, "error": str(e)}

    def get_screenshot(self) -> dict:
        try:
            if self.driver is None:
                return {"success": False, "error": "No active session"}

            screenshot_b64 = self.driver.get_screenshot_as_base64()
            data_uri = f"data:image/png;base64,{screenshot_b64}"
            return {"success": True, "screenshot": data_uri}

        except Exception as e:
            logger.error(f"Failed to get screenshot: {e}")
            return {"success": False, "error": str(e)}

    def get_page_source(self) -> dict:
        try:
            if self.driver is None:
                return {"success": False, "error": "No active session"}

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
            return {"success": False, "error": f"XML parse error: {e}"}
        except Exception as e:
            logger.error(f"Failed to get page source: {e}")
            return {"success": False, "error": str(e)}

    def find_locators(self, element_path: str) -> dict:
        try:
            if self.driver is None:
                return {"success": False, "error": "No active session"}

            if self._cached_tree is None:
                result = self.get_page_source()
                if not result.get("success"):
                    return result

            element_attrs = self._find_element_by_path(self._cached_tree, element_path)
            if element_attrs is None:
                return {"success": False, "error": f"Element not found at path: {element_path}"}

            locators = []

            bounds_str = element_attrs.get("bounds", "")
            if bounds_str:
                bounds_match = re.match(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", bounds_str)
                if bounds_match:
                    x1, y1, x2, y2 = int(bounds_match.group(1)), int(bounds_match.group(2)), int(bounds_match.group(3)), int(bounds_match.group(4))
                    center_x = (x1 + x2) // 2
                    center_y = (y1 + y2) // 2
                    locators.append({
                        "type": "click",
                        "value": f"{center_x},{center_y}",
                        "description": f"Click at coordinates: ({center_x}, {center_y})",
                    })

            resource_id = element_attrs.get("resource-id", "")
            if resource_id:
                locators.append({
                    "type": "id",
                    "value": resource_id,
                    "description": f"Resource ID: {resource_id}",
                })

            content_desc = element_attrs.get("content-desc", "")
            if content_desc:
                locators.append({
                    "type": "accessibility_id",
                    "value": content_desc,
                    "description": f"Accessibility ID from content-desc: {content_desc}",
                })

            class_attr = element_attrs.get("class", "")

            if class_attr and resource_id:
                locators.append({
                    "type": "xpath",
                    "value": f'//{class_attr}[@resource-id="{resource_id}"]',
                    "description": f"XPath by resource-id: {resource_id}",
                })

            text = element_attrs.get("text", "")
            if text and class_attr:
                locators.append({
                    "type": "xpath",
                    "value": f'//{class_attr}[@text="{text}"]',
                    "description": f"XPath by text: {text}",
                })

            content_desc = element_attrs.get("content-desc", "")
            if content_desc and class_attr:
                locators.append({
                    "type": "xpath",
                    "value": f'//{class_attr}[@content-desc="{content_desc}"]',
                    "description": f"XPath by content-desc: {content_desc}",
                })

            if class_attr:
                locators.append({
                    "type": "class_name",
                    "value": class_attr,
                    "description": f"Class name: {class_attr}",
                })

            return {"success": True, "locators": locators}

        except Exception as e:
            logger.error(f"Failed to find locators: {e}")
            return {"success": False, "error": str(e)}

    def refresh(self) -> dict:
        try:
            if self.driver is None:
                return {"success": False, "error": "No active session"}

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

        except Exception as e:
            logger.error(f"Failed to refresh: {e}")
            return {"success": False, "error": str(e)}

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
                self.appium_server.force_cleanup()
                self.appium_server = None

            self._cached_source = None
            self._cached_tree = None

            logger.info("Inspector session stopped")
            return {"success": True}

        except Exception as e:
            logger.error(f"Error stopping inspector session: {e}")
            self.driver = None
            self.appium_server = None
            return {"success": False, "error": str(e)}

    def _find_element_by_path(self, tree: dict, path: str) -> dict | None:
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

    @staticmethod
    def _notify_progress(stage: str):
        try:
            sys.stdout.write(json.dumps({"notification": "progress", "stage": stage}, ensure_ascii=False) + "\n")
            sys.stdout.flush()
        except Exception:
            pass

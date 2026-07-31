"""InspectorService facade 集成测试。

验证:
- start_session: 成功 + 重复 + AppiumStartFailed
- get_screenshot: 成功
- get_page_source: 成功 + XML 解析
- find_locators: 成功 (7 策略输出)
- refresh: 调 wake + screenshot + source
- stop_session: 幂等
- _wake_device: 走 adapter (L341 破口回归)

注入 FakeDriver/FakeAppiumServer/FakeAdbAdapter,无真 Appium/webdriver/adb。
"""
from __future__ import annotations

from main.core.inspector_service import InspectorService
from tests.unit.helpers.fake_adb_adapter import FakeAdbAdapter

# ============ Fakes ============

class _FakeCommandExecutor:
    """Fake webdriver command_executor — set_timeout 静默吞。"""
    def set_timeout(self, seconds: int) -> None:
        self.timeout = seconds


class FakeDriver:
    """Fake webdriver.Remote — 鸭子类型满足 InspectorService 调用契约。

    提供: session_id, get_screenshot_as_base64, page_source, quit, command_executor
    """
    def __init__(self, url: str, options) -> None:
        self._url = url
        self._options = options
        self.session_id = "fake-session-id-123"
        self.command_executor = _FakeCommandExecutor()
        self.quit_called = False
        self._screenshot_b64 = "ZmFrZSBzY3JlZW5zaG90"  # "fake screenshot"
        self._page_source = (
            '<hierarchy>'
            '<node bounds="[0,0][100,100]" resource-id="com.x:id/btn" '
            'class="android.widget.Button" text="OK" content-desc="submit"/>'
            '</hierarchy>'
        )

    def get_screenshot_as_base64(self) -> str:
        return self._screenshot_b64

    @property
    def page_source(self) -> str:
        return self._page_source

    def quit(self) -> None:
        self.quit_called = True


class FakeAppiumServer:
    """Fake AppiumServer — start/stop/server_url。

    apply_default_capabilities 仍走 AppiumServer 类方法 (facade 直调,不经实例)。
    """
    def __init__(self, host: str, port: int) -> None:
        self.host = host
        self.port = port
        self.start_called = False
        self.stop_called = False
        self._start_result = True

    def set_start_result(self, success: bool) -> None:
        self._start_result = success

    def start(self) -> bool:
        self.start_called = True
        return self._start_result

    def stop(self) -> None:
        self.stop_called = True

    @property
    def server_url(self) -> str:
        return f"http://{self.host}:{self.port}/wd/hub"


def _make_service(
    fake_adb: FakeAdbAdapter | None = None,
    fake_server: FakeAppiumServer | None = None,
) -> tuple[InspectorService, FakeAdbAdapter, FakeAppiumServer]:
    """构造 InspectorService + 注入 adb/server fake。

    driver_factory 在 start_session 时构造 FakeDriver, 通过 service.driver 访问。
    """
    adb = fake_adb or FakeAdbAdapter()
    server = fake_server or FakeAppiumServer("127.0.0.1", 4725)

    def driver_factory(url, options):
        return FakeDriver(url, options)

    service = InspectorService(
        proto=None,
        driver_factory=driver_factory,
        server_factory=lambda host, port: server,
        adapter=adb,
    )
    return service, adb, server


# ============ Tests ============

class TestStartSession:
    """start_session: 成功 + 重复 + AppiumStartFailed。"""

    def test_start_session_success_returns_session_id(self):
        """成功路径: 返回 {success: True, session_id: str}。"""
        service, adb, server = _make_service()

        result = service.start_session("dev:5555", "com.x.app", ".MainActivity")

        assert result["success"] is True
        assert result["session_id"] == "fake-session-id-123"
        assert server.start_called is True
        assert service.driver is not None

    def test_start_session_idempotent_returns_error(self):
        """已运行时再次 start → {success: False, error: 已存在}。"""
        service, _, _ = _make_service()
        service.start_session("dev:5555", "com.x.app", ".Main")

        result = service.start_session("dev:5555", "com.x.app", ".Main")

        assert result["success"] is False
        # i18n 中文 "会话已存在" 或英文 fallback
        assert "已存在" in result["error"] or "exists" in result["error"].lower()

    def test_start_session_appium_start_failed(self):
        """AppiumServer.start() 返回 False → {success: False}。"""
        server = FakeAppiumServer("127.0.0.1", 4725)
        server.set_start_result(False)
        service, _, _ = _make_service(fake_server=server)

        result = service.start_session("dev:5555", "com.x.app", ".Main")

        assert result["success"] is False


class TestGetScreenshot:
    """get_screenshot: 成功路径。"""

    def test_get_screenshot_returns_data_uri(self):
        """成功 → {success: True, screenshot: 'data:image/png;base64,...'}。"""
        service, _, _ = _make_service()
        service.start_session("dev:5555", "com.x.app", ".Main")

        result = service.get_screenshot()

        assert result["success"] is True
        assert result["screenshot"].startswith("data:image/png;base64,")
        assert "ZmFrZSBzY3JlZW5zaG90" in result["screenshot"]

    def test_get_screenshot_without_session_returns_error(self):
        """未启动 session → {success: False, error: NoSession}。"""
        service, _, _ = _make_service()

        result = service.get_screenshot()

        assert result["success"] is False


class TestGetPageSource:
    """get_page_source: 成功 + XML 解析为 tree。"""

    def test_get_page_source_returns_source_and_elements(self):
        """成功 → {success: True, source: xml, elements: tree dict}。"""
        service, _, _ = _make_service()
        service.start_session("dev:5555", "com.x.app", ".Main")

        result = service.get_page_source()

        assert result["success"] is True
        assert "<hierarchy>" in result["source"]
        assert isinstance(result["elements"], dict)
        assert result["elements"]["tagName"] == "hierarchy"
        # 子节点解析
        assert len(result["elements"]["children"]) == 1
        child = result["elements"]["children"][0]
        assert child["attributes"]["resource-id"] == "com.x:id/btn"

    def test_get_page_source_without_session_returns_error(self):
        """未启动 → {success: False}。"""
        service, _, _ = _make_service()

        result = service.get_page_source()

        assert result["success"] is False


class TestFindLocators:
    """find_locators: 成功 (7 策略输出)。"""

    def test_find_locators_returns_all_strategies(self):
        """全属性齐全 → 7 locator (click/id/accessibility_id/3 xpath/class_name)。"""
        service, _, _ = _make_service()
        service.start_session("dev:5555", "com.x.app", ".Main")
        service.get_page_source()  # 填充 _cached_tree

        result = service.find_locators("0.0")

        assert result["success"] is True
        locators = result["locators"]
        types = [loc["type"] for loc in locators]
        # 7 策略全到齐 (bounds + resource-id + content-desc + class + text)
        assert "click" in types
        assert "id" in types
        assert "accessibility_id" in types
        assert "xpath" in types  # 3 个 xpath
        assert "class_name" in types
        assert types.count("xpath") == 3

    def test_find_locators_without_session_returns_error(self):
        """未启动 → {success: False}。"""
        service, _, _ = _make_service()

        result = service.find_locators("0.0")

        assert result["success"] is False

    def test_find_locators_invalid_path_returns_error(self):
        """路径越界 → {success: False, error: ElementNotFound}。"""
        service, _, _ = _make_service()
        service.start_session("dev:5555", "com.x.app", ".Main")
        service.get_page_source()

        result = service.find_locators("0.99")

        assert result["success"] is False


class TestRefresh:
    """refresh: 调 wake + screenshot + source。"""

    def test_refresh_invokes_wake_then_screenshot_then_source(self):
        """refresh → _wake_device + get_screenshot + get_page_source。"""
        service, adb, _ = _make_service()
        service.start_session("dev:5555", "com.x.app", ".Main")

        result = service.refresh()

        assert result["success"] is True
        assert "screenshot" in result
        assert "source" in result
        assert "elements" in result
        # _wake_device 走 adapter.execute
        assert adb.call_count >= 1
        assert adb.calls[0][:3] == ["-s", "dev:5555", "shell"]
        assert "keyevent" in adb.calls[0]
        assert "224" in adb.calls[0]


class TestStopSession:
    """stop_session: 幂等。"""

    def test_stop_session_closes_driver_and_server(self):
        """stop → driver.quit + server.stop。"""
        service, _, server = _make_service()
        service.start_session("dev:5555", "com.x.app", ".Main")
        driver = service.driver  # FakeDriver 实例 (start_session 后存在)

        result = service.stop_session()

        assert result["success"] is True
        assert driver.quit_called is True
        assert server.stop_called is True
        assert service.driver is None
        assert service.appium_server is None

    def test_stop_session_idempotent(self):
        """多次 stop 不抛异常。"""
        service, _, _ = _make_service()
        service.start_session("dev:5555", "com.x.app", ".Main")

        service.stop_session()
        service.stop_session()
        result = service.stop_session()

        assert result["success"] is True


class TestWakeDeviceUsesAdapter:
    """L341 破口回归: _wake_device 走 AdbCommandPort, 不直 subprocess.run。"""

    def test_wake_device_uses_adapter_not_subprocess(self):
        """_wake_device 调 adapter.execute, 不 import subprocess。"""
        service, adb, _ = _make_service()
        service._device_name = "dev:5555"

        service._wake_device()

        # adapter 被调用
        assert adb.call_count == 1
        assert adb.calls[0] == [
            "-s", "dev:5555", "shell", "input", "keyevent", "224",
        ]

    def test_wake_device_without_device_name_is_noop(self):
        """_device_name 为空 → 静默跳过,不调 adapter。"""
        service, adb, _ = _make_service()
        service._device_name = ""

        service._wake_device()

        assert adb.call_count == 0

    def test_no_subprocess_import_in_module(self):
        """模块不 import subprocess (破口根除)。

        检查模块属性无 subprocess (import 已删)。
        docstring 仍含 'subprocess.run' 字符串说明,故不检查源码字符串。
        """
        import main.core.inspector_service as mod

        # 模块不应有 subprocess 属性 (import 已删)
        assert not hasattr(mod, "subprocess")

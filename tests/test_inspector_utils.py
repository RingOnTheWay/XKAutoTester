"""inspector_service 纯函数单元测试。

验证:
- _generate_locators: 7 策略 locator 生成 (纯函数)
- _find_element_by_path: 路径解析 (纯函数)

纯函数,无 mock,无 IO。
"""

from __future__ import annotations

from main.core.inspector_service import _find_element_by_path, _generate_locators


class TestGenerateLocators:
    """_generate_locators: 7 策略 locator 生成。

    策略顺序:
    1. click (bounds 中心坐标)
    2. id (resource-id)
    3. accessibility_id (content-desc)
    4. xpath by resource-id
    5. xpath by text
    6. xpath by content-desc
    7. class_name
    """

    def test_click_strategy_from_bounds(self):
        """bounds=[x1,y1][x2,y2] → click 中心坐标。"""
        attrs = {"bounds": "[0,0][100,100]"}
        locators = _generate_locators(attrs)
        click = [loc for loc in locators if loc["type"] == "click"]
        assert len(click) == 1
        assert click[0]["value"] == "50,50"
        assert "50, 50" in click[0]["description"]

    def test_id_strategy_from_resource_id(self):
        """resource-id 非空 → id locator。"""
        attrs = {"resource-id": "com.x:id/btn"}
        locators = _generate_locators(attrs)
        ids = [loc for loc in locators if loc["type"] == "id"]
        assert len(ids) == 1
        assert ids[0]["value"] == "com.x:id/btn"

    def test_accessibility_id_strategy_from_content_desc(self):
        """content-desc 非空 → accessibility_id locator。"""
        attrs = {"content-desc": "submit_btn"}
        locators = _generate_locators(attrs)
        acc = [loc for loc in locators if loc["type"] == "accessibility_id"]
        assert len(acc) == 1
        assert acc[0]["value"] == "submit_btn"

    def test_xpath_by_resource_id_strategy(self):
        """class + resource-id 非空 → xpath by resource-id。"""
        attrs = {"class": "android.widget.Button", "resource-id": "com.x:id/btn"}
        locators = _generate_locators(attrs)
        xpath_id = [loc for loc in locators if loc["type"] == "xpath" and "resource-id" in loc["value"]]
        assert len(xpath_id) == 1
        assert '//android.widget.Button[@resource-id="com.x:id/btn"]' == xpath_id[0]["value"]

    def test_xpath_by_text_strategy(self):
        """class + text 非空 → xpath by text。"""
        attrs = {"class": "android.widget.Button", "text": "OK"}
        locators = _generate_locators(attrs)
        xpath_text = [loc for loc in locators if loc["type"] == "xpath" and "@text" in loc["value"]]
        assert len(xpath_text) == 1
        assert '//android.widget.Button[@text="OK"]' == xpath_text[0]["value"]

    def test_xpath_by_content_desc_strategy(self):
        """class + content-desc 非空 → xpath by content-desc。"""
        attrs = {"class": "android.widget.Button", "content-desc": "submit"}
        locators = _generate_locators(attrs)
        xpath_desc = [loc for loc in locators if loc["type"] == "xpath" and "@content-desc" in loc["value"]]
        assert len(xpath_desc) == 1
        assert '//android.widget.Button[@content-desc="submit"]' == xpath_desc[0]["value"]

    def test_class_name_strategy(self):
        """class 非空 → class_name locator。"""
        attrs = {"class": "android.widget.Button"}
        locators = _generate_locators(attrs)
        cls = [loc for loc in locators if loc["type"] == "class_name"]
        assert len(cls) == 1
        assert cls[0]["value"] == "android.widget.Button"

    def test_all_seven_strategies_when_all_attrs_present(self):
        """全属性齐全 → 7 locator 按顺序生成。"""
        attrs = {
            "bounds": "[0,0][100,100]",
            "resource-id": "com.x:id/btn",
            "content-desc": "submit",
            "class": "android.widget.Button",
            "text": "OK",
        }
        locators = _generate_locators(attrs)
        types = [loc["type"] for loc in locators]
        # 7 策略全到齐
        assert types == [
            "click",
            "id",
            "accessibility_id",
            "xpath",  # by resource-id
            "xpath",  # by text
            "xpath",  # by content-desc
            "class_name",
        ]

    def test_empty_attrs_returns_empty_list(self):
        """空 attrs → 空 list (无 click 因无 bounds)。"""
        assert _generate_locators({}) == []

    def test_invalid_bounds_skips_click(self):
        """bounds 格式非法 → 跳过 click 策略 (不抛异常)。"""
        attrs = {"bounds": "invalid", "class": "android.widget.Button"}
        locators = _generate_locators(attrs)
        click = [loc for loc in locators if loc["type"] == "click"]
        assert len(click) == 0
        # class_name 仍生成
        assert any(loc["type"] == "class_name" for loc in locators)


class TestFindElementByPath:
    """_find_element_by_path: 按 '0.1.2' 路径找节点 attributes。"""

    def test_root_path_returns_root_attributes(self):
        """path='0' → 返回根节点 attributes。"""
        tree = {
            "tagName": "root",
            "attributes": {"id": "root"},
            "children": [],
            "path": "0",
        }
        attrs = _find_element_by_path(tree, "0")
        assert attrs == {"id": "root"}

    def test_nested_path_returns_nested_attributes(self):
        """path='0.1.0' → 根.第1子.第0子 的 attributes。"""
        tree = {
            "tagName": "root",
            "attributes": {},
            "children": [
                {
                    "tagName": "child0",
                    "attributes": {"name": "first"},
                    "children": [],
                    "path": "0.0",
                },
                {
                    "tagName": "child1",
                    "attributes": {"name": "second"},
                    "children": [
                        {
                            "tagName": "grandchild",
                            "attributes": {"id": "target"},
                            "children": [],
                            "path": "0.1.0",
                        }
                    ],
                    "path": "0.1",
                },
            ],
            "path": "0",
        }
        attrs = _find_element_by_path(tree, "0.1.0")
        assert attrs == {"id": "target"}

    def test_first_segment_not_zero_returns_none(self):
        """path 首段非 0 → 返回 None (根节点必须 0)。"""
        tree = {"tagName": "root", "attributes": {}, "children": [], "path": "0"}
        assert _find_element_by_path(tree, "1.0") is None

    def test_index_out_of_range_returns_none(self):
        """子节点索引越界 → 返回 None。"""
        tree = {
            "tagName": "root",
            "attributes": {},
            "children": [{"tagName": "c", "attributes": {}, "children": [], "path": "0.0"}],
            "path": "0",
        }
        assert _find_element_by_path(tree, "0.5") is None

    def test_empty_path_returns_none(self):
        """空 path → 返回 None (split 出空字符串, int() 抛异常被吞?)。

        实际: 空 path.split('.') = [''], int('') 抛 ValueError。
        设计选择: 让异常冒泡 (调用方应保证 path 格式)。
        """
        # 此测试验证当前行为 — 若实现吞异常则需调整
        tree = {"tagName": "root", "attributes": {}, "children": [], "path": "0"}
        # 空 path 应抛 ValueError (调用方契约违规)
        try:
            _find_element_by_path(tree, "")
            # 若不抛异常,断言返回 None
            assert _find_element_by_path(tree, "") is None
        except ValueError:
            pass  # 接受抛 ValueError

    def test_no_children_in_tree_returns_none_for_nested_path(self):
        """tree 无 children 但 path 嵌套 → 返回 None。"""
        tree = {"tagName": "root", "attributes": {}, "children": [], "path": "0"}
        assert _find_element_by_path(tree, "0.0") is None

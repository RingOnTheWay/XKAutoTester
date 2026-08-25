// R15: 渲染层 components/mixins XSS 转义回归测试
// 覆盖: TreeMixin.createTreeNode (Appium page source 属性转义)
//      deviceModalRenderMixin.createDeviceItemElement (deviceId 转义)
// 需用 --require tests/electron/_setup.js 预加载 electron mock
// 断言模式: DOM 结构断言（jsdom/parse5 序列化属性不转义 <>，innerHTML 字符串匹配会误报）

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const { JSDOM } = require(path.join(__dirname, '..', '..', 'electron', 'node_modules', 'jsdom'));

let dom;
let savedGlobals = {};

function setupJsdom() {
  dom = new JSDOM('<!DOCTYPE html><html><body><div id="tree-container"></div></body></html>', { pretendToBeVisual: true });
  const { window } = dom;
  savedGlobals.document = global.document;
  savedGlobals.window = global.window;
  savedGlobals.getComputedStyle = global.getComputedStyle;

  global.document = window.document;
  global.window = window;
  global.window.i18n = { t: (k) => k };
  global.window.electronAPI = {};
}

function teardownJsdom() {
  Object.keys(savedGlobals).forEach(k => {
    if (savedGlobals[k] === undefined) delete global[k];
    else global[k] = savedGlobals[k];
  });
  savedGlobals = {};
  dom = null;
}

// TreeMixin.createTreeNode 所需最小 this 上下文（事件回调引用的方法不立即执行）
function createTreeHost() {
  return {
    _treeContainer: global.document.getElementById('tree-container'),
    selectElement() {},
    toggleNode() {},
    _updateHighlighterHover() {},
  };
}

// deviceModalRenderMixin.createDeviceItemElement 所需最小 this 上下文
function createDeviceModalHost() {
  return {
    modalSelectedDeviceId: null,
    confirmBtn: null,
    openPortBtn: null,
    getDeviceInfo() {},
  };
}

describe('TreeMixin XSS 转义（Appium page source 属性）', () => {
  before(async () => {
    setupJsdom();
  });
  after(teardownJsdom);

  test('恶意 text/content-desc/class 属性不注入原始 HTML', async () => {
    const { TreeMixin } = await import('../../electron/renderer/components/mixins/TreeMixin.js');
    const host = createTreeHost();
    const node = TreeMixin.createTreeNode.call(host, {
      path: '0',
      attributes: {
        class: 'android.widget.TextView<img src=x onerror=alert(1)>',
        text: '<script>evil()</script>',
        'content-desc': '"><svg onload=alert(1)>',
      },
    });

    // DOM 结构断言：不产生 script/img/svg 元素
    assert.strictEqual(node.querySelectorAll('script').length, 0, '不应产生 script 元素');
    assert.strictEqual(node.querySelectorAll('img').length, 0, '不应产生 img 元素');
    assert.strictEqual(node.querySelectorAll('svg').length, 0, '不应产生 svg 元素');
    // 文本断言：属性值作为纯文本保留原文
    const label = node.querySelector('.inspector-tree-label');
    assert.ok(label, '应有 label 节点');
    assert.ok(label.textContent.includes('<script>evil()</script>'), 'text 属性应作为纯文本保留原文');
    assert.ok(label.textContent.includes('"><svg onload=alert(1)>'), 'content-desc 应作为纯文本保留原文');
    // label 内 span 数量 = class + text + desc 共 3 个（属性未逃逸产生额外节点）
    assert.strictEqual(label.querySelectorAll('span').length, 3, '不应因属性逃逸产生额外 span');
  });

  test('正常属性渲染不受影响', async () => {
    const { TreeMixin } = await import('../../electron/renderer/components/mixins/TreeMixin.js');
    const host = createTreeHost();
    const node = TreeMixin.createTreeNode.call(host, {
      path: '1',
      attributes: { class: 'android.widget.Button', text: '登录', 'content-desc': '登录按钮' },
    });
    const label = node.querySelector('.inspector-tree-label');
    assert.ok(label.textContent.includes('android.widget.Button'.split('.').pop()), '短类名应正常渲染');
    assert.ok(label.textContent.includes('text="登录"'), '中文 text 应正常渲染');
    assert.ok(label.textContent.includes('desc="登录按钮"'), '中文 desc 应正常渲染');
  });

  test('renderElementTree 空列表显示占位文案', async () => {
    const { TreeMixin } = await import('../../electron/renderer/components/mixins/TreeMixin.js');
    const host = createTreeHost();
    TreeMixin.renderElementTree.call(host, []);
    assert.strictEqual(host._treeContainer.children.length, 1, '应有占位节点');
  });
});

describe('deviceModalRenderMixin XSS 转义（deviceId）', () => {
  before(async () => {
    setupJsdom();
  });
  after(teardownJsdom);

  test('恶意 deviceId 不注入原始 HTML', async () => {
    const { deviceModalRenderMixin } = await import('../../electron/renderer/components/mixins/deviceModalRenderMixin.js');
    const host = createDeviceModalHost();
    const el = deviceModalRenderMixin.createDeviceItemElement.call(host, {
      id: '"><img src=x onerror=alert(1)><script>evil()</script>',
    });

    assert.strictEqual(el.querySelectorAll('img').length, 0, '不应产生 img 元素');
    assert.strictEqual(el.querySelectorAll('script').length, 0, '不应产生 script 元素');
    // data-device-id 属性完整保留原值（setAttribute 路径不经 HTML 解析）
    assert.strictEqual(el.getAttribute('data-device-id'), '"><img src=x onerror=alert(1)><script>evil()</script>', 'data-device-id 应完整保留原值');
    // 文本断言
    assert.ok(el.textContent.includes('<script>evil()</script>'), 'deviceId 应作为纯文本保留原文');
  });

  test('正常 deviceId 渲染不受影响（usb/wifi 图标判定）', async () => {
    const { deviceModalRenderMixin } = await import('../../electron/renderer/components/mixins/deviceModalRenderMixin.js');
    const host = createDeviceModalHost();

    const usbEl = deviceModalRenderMixin.createDeviceItemElement.call(host, 'emulator-5554');
    assert.ok(usbEl.textContent.includes('emulator-5554'), 'usb 设备名应正常渲染');

    const wifiEl = deviceModalRenderMixin.createDeviceItemElement.call(host, '192.168.1.5:5555');
    assert.ok(wifiEl.textContent.includes('192.168.1.5:5555'), 'wifi 设备名应正常渲染');
  });

  test('旧字符串调用形态兼容', async () => {
    const { deviceModalRenderMixin } = await import('../../electron/renderer/components/mixins/deviceModalRenderMixin.js');
    const host = createDeviceModalHost();
    const el = deviceModalRenderMixin.createDeviceItemElement.call(host, 'device-abc');
    assert.strictEqual(el.getAttribute('data-device-id'), 'device-abc', '字符串形态应取原值');
  });
});

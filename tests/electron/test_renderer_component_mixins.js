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

// R15: DeviceCascadeSelect 三级选项渲染转义（BLE 设备数据）+ showJsonMissingWarning fileName 转义
describe('DeviceCascadeSelect XSS 转义（BLE 设备数据）', () => {
  let DeviceCascadeSelectClass;

  function createCascadeHost() {
    return {
      manufacturerOptionsEl: global.document.createElement('div'),
      typeOptionsEl: global.document.createElement('div'),
      modelOptionsEl: global.document.createElement('div'),
      selectedManufacturer: 'm1',
      selectedType: 't1',
      selectedDevice: null,
      labelKey: 'name',
      valueKey: 'deviceId',
      devices: [],
      // _renderXxx 渲染后会对 option 绑 click，绑定用到的字段
      _renderManufacturerOptions() {},
      _renderTypeOptions() {},
      _renderModelOptions() {},
      _updateLevelVisibility() {},
    };
  }

  before(async () => {
    setupJsdom();
    const mod = await import('../../electron/renderer/components/device-cascade-select.js');
    DeviceCascadeSelectClass = mod.DeviceCascadeSelect;
  });
  after(teardownJsdom);

  test('_renderManufacturerOptions 恶意厂商名/ID不注入原始 HTML', () => {
    const host = createCascadeHost();
    host.groupedDevices = {
      '"><img src=x onerror=alert(1)>': {
        manufacturerId: '"><img src=x onerror=alert(1)>',
        manufacturer: '<script>evil()</script>',
        types: { t1: { type: 't1', category: '体温计', devices: [{ deviceId: 'd1', name: 'n1' }] } },
      },
    };
    DeviceCascadeSelectClass.prototype._renderManufacturerOptions.call(host);

    const container = host.manufacturerOptionsEl;
    assert.strictEqual(container.querySelectorAll('script').length, 0, '不应产生 script 元素');
    assert.strictEqual(container.querySelectorAll('img').length, 0, '不应产生 img 元素');
    const opts = container.querySelectorAll('.device-cascade-select__option');
    assert.strictEqual(opts.length, 1, '属性不应逃逸产生额外节点');
    assert.ok(opts[0].textContent.includes('<script>evil()</script>'), '厂商名应作为纯文本保留原文');
  });

  test('_renderTypeOptions 恶意类型/分类不注入原始 HTML', () => {
    const host = createCascadeHost();
    host.groupedDevices = {
      m1: {
        manufacturerId: 'm1',
        manufacturer: 'M',
        types: {
          '"><svg onload=e()>': { type: '"><svg onload=e()>', category: '<img src=x onerror=alert(1)>', devices: [{ deviceId: 'd1', name: 'n1' }] },
        },
      },
    };
    DeviceCascadeSelectClass.prototype._renderTypeOptions.call(host);

    const container = host.typeOptionsEl;
    assert.strictEqual(container.querySelectorAll('svg').length, 0, '不应产生 svg 元素');
    assert.strictEqual(container.querySelectorAll('img').length, 0, '不应产生 img 元素');
    const opts = container.querySelectorAll('.device-cascade-select__option');
    assert.strictEqual(opts.length, 1, '属性不应逃逸产生额外节点');
    assert.ok(opts[0].textContent.includes('<img src=x onerror=alert(1)>'), '分类名应作为纯文本保留原文');
  });

  test('_renderModelOptions 恶意设备名/ID不注入原始 HTML', () => {
    const host = createCascadeHost();
    host.groupedDevices = {
      m1: {
        manufacturerId: 'm1',
        manufacturer: 'M',
        types: { t1: { type: 't1', category: '体温计', devices: [
          { deviceId: '"><img src=x onerror=alert(1)>', name: '<script>evil()</script>' },
        ] } },
      },
    };
    DeviceCascadeSelectClass.prototype._renderModelOptions.call(host);

    const container = host.modelOptionsEl;
    assert.strictEqual(container.querySelectorAll('img').length, 0, '不应产生 img 元素');
    assert.strictEqual(container.querySelectorAll('script').length, 0, '不应产生 script 元素');
    const opts = container.querySelectorAll('.device-cascade-select__option');
    assert.strictEqual(opts.length, 1, '属性不应逃逸产生额外节点');
    assert.ok(opts[0].textContent.includes('<script>evil()</script>'), '设备名应作为纯文本保留原文');
    assert.strictEqual(opts[0].getAttribute('data-id'), '"><img src=x onerror=alert(1)>', 'data-id 属性应完整保留原值');
  });

  test('正常 BLE 设备三级选项渲染不受影响', () => {
    const host = createCascadeHost();
    host.selectedManufacturer = 'bioland';
    host.selectedType = 'thermometer';
    host.groupedDevices = {
      bioland: {
        manufacturerId: 'bioland',
        manufacturer: 'Bioland',
        types: { thermometer: { type: 'thermometer', category: '体温计', devices: [{ deviceId: 'MB026A-01', name: '体温计 01' }] } },
      },
    };
    DeviceCascadeSelectClass.prototype._renderManufacturerOptions.call(host);
    assert.ok(host.manufacturerOptionsEl.textContent.includes('Bioland'), '厂商名应正常渲染');
    DeviceCascadeSelectClass.prototype._renderTypeOptions.call(host);
    assert.ok(host.typeOptionsEl.textContent.includes('体温计'), '分类应正常渲染');
    DeviceCascadeSelectClass.prototype._renderModelOptions.call(host);
    assert.ok(host.modelOptionsEl.textContent.includes('体温计 01'), '设备名应正常渲染');
  });
});

describe('TestCaseView showJsonMissingWarning 转义（i18next 插值）', () => {
  let ViewClass;

  before(async () => {
    setupJsdom();
    // 动态插入 showJsonMissingWarning 所需容器
    const editorContent = global.document.createElement('div');
    editorContent.className = 'tc-editor-content';
    global.document.body.appendChild(editorContent);
    // i18n mock: 模拟 i18next v25 escapeValue=false 行为（插值原样输出不转义）
    global.window.i18n = { t: (key, opts) => {
      if (key === 'testCase.jsonMissingWarning' && opts) return `JSON 文件缺失: ${opts.fileName}`;
      return key;
    } };
    const mod = await import('../../electron/renderer/tabs/test-case/view.js');
    ViewClass = mod.TestCaseView;
  });
  after(teardownJsdom);

  test('恶意文件名经 i18n 插值后不注入原始 HTML', () => {
    const v = new ViewClass();
    v.showJsonMissingWarning('<img src=x onerror=alert(1)>.py');
    const warning = global.document.getElementById('tc-json-missing-warning');
    assert.ok(warning, '应有警告节点');
    assert.strictEqual(warning.querySelectorAll('img').length, 0, '不应产生 img 元素');
    assert.ok(warning.textContent.includes('<img src=x onerror=alert(1)>.py'), '文件名应作为纯文本保留原文');
  });

  test('正常文件名警告显示不受影响', () => {
    const v = new ViewClass();
    v.showJsonMissingWarning('test_login.py');
    const warning = global.document.getElementById('tc-json-missing-warning');
    assert.ok(warning.textContent.includes('test_login.py'), '正常文件名应显示');
    assert.ok(warning.textContent.includes('JSON'), '警告文案应显示');
  });
});

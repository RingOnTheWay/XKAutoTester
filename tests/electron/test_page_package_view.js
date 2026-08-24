// PagePackageView 关键路径单元测试
// 需用 --require tests/electron/_setup.js 预加载 electron mock

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const { JSDOM } = require(path.join(__dirname, '..', '..', 'electron', 'node_modules', 'jsdom'));

const PP_HTML = `<!DOCTYPE html><html><body>
  <div class="pp-card" id="pp-app-card">
    <div id="pp-app-select-wrapper">
      <div class="cascade-select" id="pp-app-select">
        <div class="cascade-select__selected">选择应用</div>
        <div class="cascade-select__options"></div>
      </div>
    </div>
  </div>
  <div class="pp-card" id="pp-page-card">
    <div id="pp-page-select-wrapper">
      <div class="cascade-select open" id="pp-page-select">
        <div class="cascade-select__selected">选择页面</div>
        <div class="cascade-select__options"></div>
      </div>
    </div>
  </div>
  <div class="pp-card" id="pp-element-card">
    <div id="pp-element-select-wrapper">
      <div class="cascade-select" id="pp-element-select">
        <div class="cascade-select__selected">选择元素</div>
        <div class="cascade-select__options"></div>
      </div>
    </div>
  </div>
  <span id="pp-app-badge"></span>
  <span id="pp-app-count">0</span>
  <span id="pp-page-badge"></span>
  <span id="pp-page-count">0</span>
  <span id="pp-element-badge"></span>
  <span id="pp-element-count">0</span>
  <div class="pp-tab" data-tab="app">应用</div>
  <div class="pp-tab" data-tab="page">页面</div>
  <div class="pp-content" id="pp-app-content">App Content</div>
  <div class="pp-content" id="pp-page-content">Page Content</div>
  <div class="pp-content" id="pp-element-content">Element Content</div>
  <div id="pp-app-modal-overlay" class="hidden"></div>
  <h3 id="pp-app-modal-title"></h3>
  <input id="pp-app-input" type="text">
  <div id="pp-platform-wrapper"></div>
  <input id="pp-package-input" type="text">
  <input id="pp-activity-input" type="text">
  <button id="pp-app-save-btn"></button>
  <div id="apk-drop-zone"></div>
  <div id="apk-drop-loading" class="hidden"></div>
  <div id="apk-drop-success" class="hidden"></div>
  <div id="apk-drop-error" class="hidden"></div>
  <div id="apk-error-message"></div>
  <div id="pp-page-modal-overlay" class="hidden"></div>
  <h3 id="pp-page-modal-title"></h3>
  <input id="pp-page-input" type="text">
  <button id="pp-page-save-btn"></button>
  <div id="pp-element-modal-overlay" class="hidden"></div>
  <h3 id="pp-element-modal-title"></h3>
  <input id="pp-element-name-input" type="text">
  <div id="pp-element-locator-wrapper"></div>
  <input id="pp-element-value-input" type="text">
  <button id="pp-element-save-btn"></button>
  <button id="pp-inspector-btn"></button>
</body></html>`;

let dom;
let savedGlobals = {};

function setupJsdm() {
  dom = new JSDOM(PP_HTML, { pretendToBeVisual: true });
  const { window } = dom;
  savedGlobals.document = global.document;
  savedGlobals.window = global.window;

  global.document = window.document;
  global.window = window;
  global.window.i18n = { t: (k) => k };
  global.window.electronAPI = {};
  // icons.js 依赖全局 lucide（生产环境由 UMD bundle 注入），测试环境用空 stub
  global.window.lucide = { icons: {} };
  global.lucide = global.window.lucide;
}

function teardownJsdm() {
  Object.keys(savedGlobals).forEach(k => {
    if (savedGlobals[k] === undefined) delete global[k];
    else global[k] = savedGlobals[k];
  });
  savedGlobals = {};
  dom = null;
}

let ViewClass;
async function loadView() {
  if (!ViewClass) {
    const mod = await import('../../electron/renderer/tabs/page-package/view.js');
    ViewClass = mod.PagePackageView;
  }
  return ViewClass;
}

describe('PagePackageView 构造 + els 缓存', () => {
  before(async () => {
    setupJsdm();
    await loadView();
  });
  after(teardownJsdm);

  test('构造器应缓存所有静态 DOM 引用', () => {
    const v = new ViewClass();
    assert.ok(v.els.appCard);
    assert.ok(v.els.appSelectWrapper);
    assert.ok(v.els.pageSelectWrapper);
    assert.ok(v.els.elementSelectWrapper);
    assert.ok(v.els.ppTabs);
    assert.ok(v.els.ppContents);
    assert.ok(v.els.appModalOverlay);
  });
});

describe('PagePackageView 级联选择器访问桥', () => {
  before(async () => {
    setupJsdm();
    await loadView();
  });
  after(teardownJsdm);

  test('getCascadeSelectWrapper 应按 type 返回对应 wrapper', () => {
    const v = new ViewClass();
    assert.strictEqual(v.getCascadeSelectWrapper('app'), v.els.appSelectWrapper);
    assert.strictEqual(v.getCascadeSelectWrapper('page'), v.els.pageSelectWrapper);
    assert.strictEqual(v.getCascadeSelectWrapper('element'), v.els.elementSelectWrapper);
  });

  test('getCascadeSelectWrapper 未知 type 应返回 null', () => {
    const v = new ViewClass();
    assert.strictEqual(v.getCascadeSelectWrapper('unknown'), null);
  });

  test('closeOtherCascadeSelects 应关闭除 except 外所有打开的下拉', () => {
    const v = new ViewClass();
    // 初始状态：page 下拉是 open
    const pageSelect = v.els.pageSelectWrapper.querySelector('.cascade-select');
    const pageCard = v.els.pageCard;
    pageCard.classList.add('dropdown-open');
    assert.ok(pageSelect.classList.contains('open'));
    // 关闭除 page select 外所有
    v.closeOtherCascadeSelects(pageSelect);
    // page 仍开
    assert.ok(pageSelect.classList.contains('open'));
    assert.ok(pageCard.classList.contains('dropdown-open'));
    // 关闭所有
    v.closeOtherCascadeSelects(null);
    assert.ok(!pageSelect.classList.contains('open'));
    assert.ok(!pageCard.classList.contains('dropdown-open'));
  });
});

describe('PagePackageView 子 Tab 访问', () => {
  before(async () => {
    setupJsdm();
    await loadView();
  });
  after(teardownJsdm);

  test('getTabContent 应按 tab id 返回对应 content 元素', () => {
    const v = new ViewClass();
    assert.strictEqual(v.getTabContent('app').id, 'pp-app-content');
    assert.strictEqual(v.getTabContent('page').id, 'pp-page-content');
    assert.strictEqual(v.getTabContent('element').id, 'pp-element-content');
  });

  test('getTabContent 不存在的 tab id 应返回 null', () => {
    const v = new ViewClass();
    assert.strictEqual(v.getTabContent('nonexistent'), null);
  });
});

describe('PagePackageView 表单数据收集', () => {
  before(async () => {
    setupJsdm();
    await loadView();
  });
  after(teardownJsdm);

  test('collectAppFormData 应返回 package/activity 等输入值', () => {
    const v = new ViewClass();
    if (typeof v.collectAppFormData === 'function') {
      v.els.appInput.value = 'TestApp';
      v.els.packageInput.value = 'com.example.test';
      v.els.activityInput.value = 'MainActivity';
      const data = v.collectAppFormData();
      assert.strictEqual(data.name, 'TestApp');
      assert.strictEqual(data.packageName, 'com.example.test');
      assert.strictEqual(data.activityName, 'MainActivity');
    }
  });

  test('collectPageFormData 应返回 page 输入值', () => {
    const v = new ViewClass();
    if (typeof v.collectPageFormData === 'function') {
      v.els.pageInput.value = 'LoginPage';
      assert.strictEqual(v.collectPageFormData(), 'LoginPage');
    }
  });

  test('collectElementFormData 应返回 name/locator/value', () => {
    const v = new ViewClass();
    v.els.elementNameInput.value = 'username_input';
    v.els.elementValueInput.value = 'user_input_id';
    // locator wrapper 不支持 getCustomSelectValue 时返回 'id' 默认值
    const data = v.collectElementFormData();
    assert.strictEqual(data.name, 'username_input');
    assert.strictEqual(data.locator, 'id');
    assert.strictEqual(data.value, 'user_input_id');
  });
});

describe('PagePackageView HTML 转义 (防 XSS)', () => {
  before(async () => {
    setupJsdm();
    await loadView();
  });
  after(teardownJsdm);

  test('escapeHtml null/undefined 返空串', () => {
    const v = new ViewClass();
    assert.strictEqual(v.escapeHtml(null), '');
    assert.strictEqual(v.escapeHtml(undefined), '');
  });

  test('escapeHtml 转义 & < > " \'', () => {
    const v = new ViewClass();
    assert.strictEqual(v.escapeHtml('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
    assert.strictEqual(v.escapeHtml('a&b'), 'a&amp;b');
    assert.strictEqual(v.escapeHtml('say "hi"'), 'say &quot;hi&quot;');
    assert.strictEqual(v.escapeHtml("it's"), 'it&#39;s');
  });

  test('renderAppOptions 渲染时转义应用名 (不注入原始 HTML)', () => {
    const v = new ViewClass();
    v.renderAppOptions([{ id: 'a1', name: '<b>App</b>' }], '');
    const html = v.els.appSelectWrapper.querySelector('.cascade-select__options').innerHTML;
    assert.ok(!html.includes('<b>'), '不应渲染原始标签');
    assert.ok(html.includes('&lt;b&gt;'), '名称被转义');
  });

  test('renderPageOptions 渲染时转义页面名', () => {
    const v = new ViewClass();
    v.renderPageOptions([{ id: 'p1', name: '<img src=x onerror=alert(1)>' }], true, '');
    const html = v.els.pageSelectWrapper.querySelector('.cascade-select__options').innerHTML;
    assert.ok(!html.includes('<img'), '不应渲染原始标签');
    assert.ok(html.includes('&lt;img'), '名称被转义');
  });

  test('renderElementOptions 渲染时转义元素名', () => {
    const v = new ViewClass();
    v.renderElementOptions([{ id: 'e1', name: '"><script>alert(1)</script>' }], true, '');
    const html = v.els.elementSelectWrapper.querySelector('.cascade-select__options').innerHTML;
    assert.ok(!html.includes('<script>'), '不应渲染原始标签');
    assert.ok(html.includes('&lt;script&gt;'), '名称被转义');
  });

  test('renderFilteredOptions 渲染时转义 id 与名称', () => {
    const v = new ViewClass();
    v.renderFilteredOptions('element', [{ id: 'e"2', name: '<i>F</i>' }], '');
    const html = v.els.elementSelectWrapper.querySelector('.cascade-select__options').innerHTML;
    assert.ok(!html.includes('<i>'), '不应渲染原始标签');
    assert.ok(html.includes('&lt;i&gt;'), '名称被转义');
    assert.ok(html.includes('&quot;'), 'id 被转义');
  });
});

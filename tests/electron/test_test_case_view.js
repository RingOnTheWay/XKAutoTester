// TestCaseView 关键路径单元测试
// 需用 --require tests/electron/_setup.js 预加载 electron mock
// 使用 jsdom 模拟 DOM，动态 import 加载 ESM View 模块

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

// jsdom 安装在 electron/node_modules 下，tests/ 目录无法直接 require，用绝对路径
const { JSDOM } = require(path.join(__dirname, '..', '..', 'electron', 'node_modules', 'jsdom'));

// ── 最小 test-case tab DOM 结构 ──
const TESTCASE_HTML = `<!DOCTYPE html><html><body>
  <div id="tc-steps-list">
    <div class="tc-step-card" data-step-id="step-1">
      <div class="tc-step-number">1</div>
      <button class="tc-step-move-up-btn"></button>
      <button class="tc-step-move-down-btn"></button>
      <div class="tc-drag-grip" data-drag-grip="true"></div>
      <div class="tc-step-select-wrapper" data-index="0">
        <div class="custom-select" id="tc-page-select-step-1" data-select-id="page">
          <div class="custom-select__selected"><span class="custom-select__text">页面A</span></div>
        </div>
      </div>
    </div>
    <div class="tc-step-card" data-step-id="step-2">
      <div class="tc-step-number">2</div>
      <button class="tc-step-move-up-btn"></button>
      <button class="tc-step-move-down-btn"></button>
      <div class="tc-drag-grip" data-drag-grip="true"></div>
    </div>
    <div class="tc-step-card" data-step-id="step-3">
      <div class="tc-step-number">3</div>
      <button class="tc-step-move-up-btn"></button>
      <button class="tc-step-move-down-btn"></button>
      <div class="tc-drag-grip" data-drag-grip="true"></div>
    </div>
  </div>
  <input id="tc-search-input" type="text">
  <button id="tc-search-clear"></button>
  <div id="tc-test-files-list">
    <div class="test-case-file-item" data-file-name="test_a.py" data-py-file-path="/path/a.py">test_a.py</div>
    <div class="test-case-file-item" data-file-name="test_b.py" data-py-file-path="/path/b.py">test_b.py</div>
  </div>
  <div id="tc-app-selected">
    <span class="custom-select__text">默认应用</span>
  </div>
  <div id="tc-platform-selected">
    <span class="custom-select__text">默认平台</span>
  </div>
  <div id="tc-select-directory-btn"></div>
  <div id="tc-search-spinner"></div>
  <div id="tc-add-new-btn"></div>
  <div id="tc-add-step-btn"></div>
  <div id="tc-add-step-bottom-btn"></div>
  <div id="tc-cancel-btn"></div>
  <div id="tc-save-btn"></div>
  <div id="tc-delete-btn"></div>
  <div id="tc-selected-directory"></div>
  <div id="tc-editor-empty"></div>
  <div id="tc-editor-form"></div>
  <input id="tc-file-name" type="text">
  <div id="tc-file-name-error"></div>
  <div id="tc-json-missing-warning"></div>
  <input id="tc-case-name" type="text">
  <textarea id="tc-description"></textarea>
  <input id="tc-allure-epic" type="text">
  <input id="tc-allure-feature" type="text">
  <input id="tc-allure-story" type="text">
  <input id="tc-app-load-wait-time" type="text">
  <input id="tc-element-wait-timeout" type="text">
  <input id="tc-step-interval" type="text">
  <input id="tc-app-close-wait-time" type="text">
  <div id="tc-markers-select"></div>
  <div id="tc-markers-options"></div>
  <div id="tc-markers-selected"></div>
  <div id="tc-app-select"></div>
  <div id="tc-app-options"></div>
  <div id="tc-platform-select-wrapper-select"></div>
  <div id="tc-platform-select-wrapper-options"></div>
  <div id="tc-platform-options"></div>
  <div id="tc-steps-section"></div>
  <div id="tc-steps-container"></div>
  <div id="tc-steps-empty" class="hidden"></div>
  <div id="tc-case-form"></div>
  <div id="save-confirm-modal-overlay" class="hidden"></div>
  <h3 id="save-confirm-modal-title"></h3>
  <p id="save-confirm-modal-message"></p>
  <button id="save-confirm-cancel-btn">取消</button>
  <button id="save-confirm-discard-btn">放弃</button>
  <button id="save-confirm-save-btn">保存</button>
</body></html>`;

let dom;
let savedGlobals = {};

function setupJsdm() {
  dom = new JSDOM(TESTCASE_HTML, { pretendToBeVisual: true });
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
  if (!window.HTMLElement.prototype.getBoundingClientRect) {
    window.HTMLElement.prototype.getBoundingClientRect = () => ({ width: 100, height: 30, top: 100, bottom: 130, left: 10 });
  }
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
    const mod = await import('../../electron/renderer/tabs/test-case/view.js');
    ViewClass = mod.TestCaseView;
  }
  return ViewClass;
}

// ── 测试用例 ────────────────────────────────────────────────

describe('TestCaseView 步骤卡片查询', () => {
  before(async () => {
    setupJsdm();
    await loadView();
  });
  after(teardownJsdm);

  test('getStepCards 应返回所有 .tc-step-card 元素', () => {
    const v = new ViewClass();
    const cards = v.getStepCards();
    assert.strictEqual(cards.length, 3);
    assert.ok(Array.isArray(cards));
  });

  test('getStepCards 在无 stepsList 时返回空数组', () => {
    const v = new ViewClass();
    v.els.stepsList = null;
    assert.deepStrictEqual(v.getStepCards(), []);
  });

  test('findStepCard 应按 stepId 查找对应卡片', () => {
    const v = new ViewClass();
    const card = v.findStepCard('step-2');
    assert.ok(card);
    assert.strictEqual(card.dataset.stepId, 'step-2');
  });

  test('findStepCard 不存在的 stepId 应返回 null', () => {
    const v = new ViewClass();
    assert.strictEqual(v.findStepCard('non-existent'), null);
  });
});

describe('TestCaseView 步骤卡片操作', () => {
  before(async () => {
    setupJsdm();
    await loadView();
  });
  after(teardownJsdm);

  test('replaceStepCard 应用新卡片替换旧卡片', () => {
    const v = new ViewClass();
    // 新卡片需包含与其他测试兼容的结构（.tc-step-number + move 按钮）
    const newCard = document.createElement('div');
    newCard.className = 'tc-step-card';
    newCard.dataset.stepId = 'step-1';
    newCard.innerHTML = `
      <div class="tc-step-number">1</div>
      <button class="tc-step-move-up-btn"></button>
      <button class="tc-step-move-down-btn"></button>
      <div class="tc-drag-grip" data-drag-grip="true"></div>
      <span class="card-marker">replaced</span>
    `;
    const result = v.replaceStepCard('step-1', newCard);
    assert.strictEqual(result, true);
    const replaced = document.querySelector('[data-step-id="step-1"]');
    assert.ok(replaced.querySelector('.card-marker'));
    assert.strictEqual(replaced.querySelector('.card-marker').textContent, 'replaced');
  });

  test('replaceStepCard stepId 不存在应返回 false 不抛错', () => {
    const v = new ViewClass();
    const newCard = document.createElement('div');
    assert.strictEqual(v.replaceStepCard('non-existent', newCard), false);
  });

  test('renumberStepCards 应按 DOM 顺序重排序号并返回 order 映射', () => {
    const v = new ViewClass();
    // 故意打乱序号显示
    const cards = document.querySelectorAll('.tc-step-card');
    cards.forEach((c, i) => {
      c.querySelector('.tc-step-number').textContent = 99;
    });
    const result = v.renumberStepCards();
    assert.strictEqual(result.length, 3);
    assert.strictEqual(result[0].stepId, 'step-1');
    assert.strictEqual(result[0].order, 1);
    assert.strictEqual(result[1].stepId, 'step-2');
    assert.strictEqual(result[1].order, 2);
    assert.strictEqual(result[2].stepId, 'step-3');
    assert.strictEqual(result[2].order, 3);
    // 验证 DOM 序号已更新
    assert.strictEqual(cards[0].querySelector('.tc-step-number').textContent, '1');
    assert.strictEqual(cards[2].querySelector('.tc-step-number').textContent, '3');
  });

  test('updateMoveButtonsState 应正确禁用首尾移动按钮', () => {
    const v = new ViewClass();
    v.updateMoveButtonsState();
    const cards = document.querySelectorAll('.tc-step-card');
    // 第 1 张：up 禁用，down 启用
    const firstUp = cards[0].querySelector('.tc-step-move-up-btn');
    const firstDown = cards[0].querySelector('.tc-step-move-down-btn');
    assert.strictEqual(firstUp.disabled, true);
    assert.ok(firstUp.classList.contains('tc-step-move-btn-disabled'));
    assert.strictEqual(firstDown.disabled, false);
    // 中间张：两个都启用
    const midUp = cards[1].querySelector('.tc-step-move-up-btn');
    const midDown = cards[1].querySelector('.tc-step-move-down-btn');
    assert.strictEqual(midUp.disabled, false);
    assert.strictEqual(midDown.disabled, false);
    // 最后一张：down 禁用
    const lastDown = cards[2].querySelector('.tc-step-move-down-btn');
    assert.strictEqual(lastDown.disabled, true);
    assert.ok(lastDown.classList.contains('tc-step-move-btn-disabled'));
  });
});

describe('TestCaseView select options 查找', () => {
  before(async () => {
    setupJsdm();
    await loadView();
  });
  after(teardownJsdm);

  test('findOptionsForSelect select 内有 options 时应返回', () => {
    const v = new ViewClass();
    const select = document.getElementById('tc-page-select-step-1');
    // select 内当前没有 .custom-select__options，需手动添加
    const options = document.createElement('div');
    options.className = 'custom-select__options';
    select.appendChild(options);
    const result = v.findOptionsForSelect(select);
    assert.strictEqual(result, options);
  });

  test('findOptionsForSelect options 已移到 body 时应通过 ID 查找', () => {
    const v = new ViewClass();
    const select = document.createElement('div');
    select.className = 'custom-select';
    select.id = 'tc-test-select-xyz';
    // options 在 body 下
    const options = document.createElement('div');
    options.className = 'custom-select__options';
    options.id = 'tc-test-select-xyz-options';
    document.body.appendChild(options);
    const result = v.findOptionsForSelect(select);
    assert.strictEqual(result, options);
  });

  test('findOptionsForSelect select 为 null 应返回 null', () => {
    const v = new ViewClass();
    assert.strictEqual(v.findOptionsForSelect(null), null);
  });
});

describe('TestCaseView 搜索/文件列表事件', () => {
  before(async () => {
    setupJsdm();
    await loadView();
  });
  after(teardownJsdm);

  test('bindSearchInput 应在 input 时回传 trimmed 值', () => {
    const v = new ViewClass();
    let received = null;
    const unbind = v.bindSearchInput((q) => { received = q; });
    v.els.searchInput.value = '  hello  ';
    v.els.searchInput.dispatchEvent(new window.Event('input'));
    assert.strictEqual(received, 'hello');
    unbind();
    v.els.searchInput.value = 'world';
    v.els.searchInput.dispatchEvent(new window.Event('input'));
    assert.strictEqual(received, 'hello', '解绑后不应再触发');
  });

  test('clearSearchInput 应清空输入框值', () => {
    const v = new ViewClass();
    v.els.searchInput.value = 'some query';
    v.clearSearchInput();
    assert.strictEqual(v.els.searchInput.value, '');
  });

  test('bindFileListClick 应通过事件委托分发 file 项点击', () => {
    const v = new ViewClass();
    let receivedFile = null;
    let receivedEl = null;
    const unbind = v.bindFileListClick((file, el) => {
      receivedFile = file;
      receivedEl = el;
    });
    const firstItem = document.querySelector('.test-case-file-item');
    firstItem.click();
    assert.deepStrictEqual(receivedFile, { name: 'test_a.py', pyFilePath: '/path/a.py' });
    assert.strictEqual(receivedEl, firstItem);
    unbind();
  });

  test('bindFileListClick 点击非 file 项不应触发 handler', () => {
    const v = new ViewClass();
    let calls = 0;
    const unbind = v.bindFileListClick(() => { calls++; });
    // 点击容器但不在 file 项上
    const container = document.getElementById('tc-test-files-list');
    const evt = new window.MouseEvent('click', { bubbles: true });
    container.dispatchEvent(evt);
    assert.strictEqual(calls, 0);
    unbind();
  });
});

describe('TestCaseView App/Platform 选中显示', () => {
  before(async () => {
    setupJsdm();
    await loadView();
  });
  after(teardownJsdm);

  test('setAppSelectedText 应更新 #tc-app-selected 的 .custom-select__text', () => {
    const v = new ViewClass();
    v.setAppSelectedText('新应用名');
    const text = v.els.appSelected.querySelector('.custom-select__text').textContent;
    assert.strictEqual(text, '新应用名');
  });

  test('setPlatformSelectedText 应更新 #tc-platform-selected 的 .custom-select__text', () => {
    const v = new ViewClass();
    v.setPlatformSelectedText('Android');
    const text = v.els.platformSelected.querySelector('.custom-select__text').textContent;
    assert.strictEqual(text, 'Android');
  });
});

describe('TestCaseView 保存确认弹窗', () => {
  before(async () => {
    setupJsdm();
    await loadView();
  });
  after(teardownJsdm);

  // P2-3: showSaveConfirmModal 已收敛为委托 app.js 全局机制 (window.__XKAT_APP__.showSaveConfirmModal)

  test('P2-3 showSaveConfirmModal 委托 app 全局 (透传 title/message/onSave/onDiscard)', () => {
    const calls = [];
    window.__XKAT_APP__ = {
      showSaveConfirmModal: (title, message, onSave, onDiscard) => {
        calls.push({ title, message, onSave, onDiscard });
      },
    };
    try {
      const v = new ViewClass();
      const onSave = () => {};
      const onDiscard = () => {};
      v.showSaveConfirmModal({ title: '未保存的更改', message: '是否保存当前编辑？', onSave, onDiscard });
      assert.strictEqual(calls.length, 1, '应委托 app 全局一次');
      assert.strictEqual(calls[0].title, '未保存的更改');
      assert.strictEqual(calls[0].message, '是否保存当前编辑？');
      assert.strictEqual(calls[0].onSave, onSave);
      assert.strictEqual(calls[0].onDiscard, onDiscard);
    } finally {
      window.__XKAT_APP__ = null;
    }
  });

  test('P2-3 app 未初始化时降级原生 confirm', () => {
    window.__XKAT_APP__ = null;
    // jsdom window.confirm 默认返回 false → onDiscard 分支
    const v = new ViewClass();
    let discarded = false;
    v.showSaveConfirmModal({ title: 'T', message: 'M', onSave: () => {}, onDiscard: () => { discarded = true; } });
    assert.strictEqual(discarded, true, 'confirm(false) → onDiscard');
  });
});

describe('TestCaseView 步骤拖拽', () => {
  before(async () => {
    setupJsdm();
    await loadView();
  });
  after(teardownJsdm);

  test('bindStepDragDrop 应返回 unbind 函数', () => {
    const v = new ViewClass();
    const unbind = v.bindStepDragDrop(() => {});
    assert.strictEqual(typeof unbind, 'function');
    unbind();
  });

  test('bindStepDragDrop 应把 grip 标记为 draggable', () => {
    const v = new ViewClass();
    const unbind = v.bindStepDragDrop(() => {});
    const grips = document.querySelectorAll('.tc-drag-grip');
    assert.ok(grids => grids.length > 0, '应有 grip 元素');
    grips.forEach(g => assert.strictEqual(g.draggable, true));
    unbind();
  });
});

// R14: HTML 转义（防 XSS）回归测试
describe('TestCaseView HTML 转义（防 XSS）', () => {
  before(async () => {
    setupJsdm();
    await loadView();
  });
  after(teardownJsdm);

  test('escapeHtml null/undefined 应返回空串', () => {
    const v = new ViewClass();
    assert.strictEqual(v.escapeHtml(null), '');
    assert.strictEqual(v.escapeHtml(undefined), '');
  });

  test('renderTestFiles 恶意文件名不注入原始 HTML', () => {
    const v = new ViewClass();
    const malicious = '<img src=x onerror=alert(1)>.py';
    v.renderTestFiles([{ name: malicious, path: '/tmp/a.py' }], {}, '');
    const container = document.getElementById('tc-test-files-list');
    // DOM 结构断言：不应产生任何 img/script 元素（属性序列化回显原文属 parse5 正常行为，非注入）
    assert.strictEqual(container.querySelectorAll('img').length, 0, '不应产生 img 元素');
    assert.strictEqual(container.querySelectorAll('script').length, 0, '不应产生 script 元素');
    // 文本节点断言：恶意名应作为纯文本呈现
    assert.ok(container.textContent.includes('<img src=x onerror=alert(1)>.py'), '文件名应作为纯文本保留原文');
  });

  test('renderAppOptions 恶意应用名/ID不注入原始 HTML', () => {
    const v = new ViewClass();
    v.renderAppOptions([{ id: 'a" onclick="evil()', name: '<script>evil()</script>' }], null);
    const container = document.getElementById('tc-app-options');
    assert.strictEqual(container.querySelectorAll('script').length, 0, '不应产生 script 元素');
    assert.strictEqual(container.querySelectorAll('img').length, 0, '不应产生 img 元素');
    const options = container.querySelectorAll('.custom-select__option');
    assert.strictEqual(options.length, 1, '双引号不应逃逸 data-value 属性产生多余节点');
    assert.strictEqual(options[0].textContent.trim(), '<script>evil()</script>', '应用名应作为纯文本保留原文');
    assert.strictEqual(options[0].getAttribute('data-name'), '<script>evil()</script>', 'data-name 属性应完整保留原值');
  });

  test('renderMarkersOptions 恶意 marker 名/描述不注入原始 HTML', () => {
    const v = new ViewClass();
    v.renderMarkersOptions([{ name: '<img src=x>', description: '"><svg onload=alert(1)>' }], []);
    const container = document.getElementById('tc-markers-options');
    assert.strictEqual(container.querySelectorAll('img').length, 0, '不应产生 img 元素');
    assert.strictEqual(container.querySelectorAll('svg').length, 0, '不应产生 svg 元素');
    const options = container.querySelectorAll('.custom-select__option');
    assert.strictEqual(options.length, 1, '属性不应逃逸产生多余节点');
    assert.strictEqual(options[0].textContent.trim(), '<img src=x>', 'marker 名应作为纯文本保留原文');
    assert.strictEqual(options[0].getAttribute('data-description'), '"><svg onload=alert(1)>', 'data-description 应完整保留原值');
  });

  test('generateCustomSelect 恶意选项值/标签/选中文本不注入原始 HTML', () => {
    const v = new ViewClass();
    const html = v.generateCustomSelect('tc-xss-select', [
      { value: '"><img src=x onerror=alert(1)>', label: '<script>evil()</script>', selected: true }
    ], 'placeholder');
    assert.ok(!html.includes('<script'), '不应含原始 <script 标签');
    assert.ok(!html.includes('<img'), '不应含原始 <img 标签');
    assert.ok(!html.includes('" onerror='), '属性值中的双引号应转义');
    assert.ok(html.includes('&lt;script&gt;'), '应转义 script 标签');
  });

  test('generateStepCard 恶意步骤名不逃逸 value 属性', () => {
    const v = new ViewClass();
    const malicious = '"><img src=x onerror=alert(1)>';
    const card = v.generateStepCard({ id: 's1', order: 1, name: malicious, type: 'unknown' }, 1);
    const input = card.querySelector('.tc-step-name-input');
    assert.ok(input, '应有步骤名输入框');
    assert.strictEqual(input.getAttribute('value'), malicious, 'value 属性应保留原文（实体转义后解码一致）');
    assert.strictEqual(card.querySelectorAll('img').length, 0, '不应产生 img 元素（属性未逃逸）');
    assert.strictEqual(card.querySelectorAll('.tc-step-name-input').length, 1, '不应因属性逃逸产生多余输入框');
  });

  test('renderDeviceParams 恶意参数标签/值/占位符不注入原始 HTML', () => {
    const v = new ViewClass();
    const html = v.renderDeviceParams([
      { key: 'k1', type: 'text', label: '<script>l()</script>', placeholder: '"><svg onload=e()>' }
    ], { k1: '"><img src=x onerror=e()>' }, 's1');
    assert.ok(!html.includes('<script'), '不应含原始 <script 标签');
    assert.ok(!html.includes('<svg'), '不应含原始 <svg 标签');
    assert.ok(!html.includes('<img'), '不应含原始 <img 标签');
  });
});

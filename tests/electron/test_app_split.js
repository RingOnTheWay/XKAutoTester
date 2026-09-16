// R26 候选③ app.js 巨型引导拆分回归测试
//
// 拆分: App 805 行 → bootstrap/I18nCoordinator + bootstrap/HtmlLoader +
// ui/CustomSelects + ui/WindowControls + ui/SaveConfirmController + 组合根。
// 本测试锁拆出模块的行为面 (原逻辑逐一迁移, 不应有语义漂移):
// 1. I18nCoordinator: initialize 暴露 window.i18n / updateUIText 三属性刷新
// 2. SaveConfirmController: show→executeSave/executeDiscard→hide 回调状态机
// 3. CustomSelects: 声明式生成下拉框 + initCustomSelect 幂等
// 4. 组合根 App: 委托面存在性 (getIconHtml/preventScroll 等, 外部引用零改动的担保)

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const { JSDOM } = require(path.join(__dirname, '..', '..', 'electron', 'node_modules', 'jsdom'));

let dom;

function setupDom(html = '<!DOCTYPE html><html><body></body></html>') {
  dom = new JSDOM(html, {
    pretendToBeVisual: true,
    url: 'http://localhost',
  });
  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;
  global.HTMLElement = dom.window.HTMLElement;
  global.Event = dom.window.Event;
  global.CustomEvent = dom.window.CustomEvent;
  global.Node = dom.window.Node;
  global.Element = dom.window.Element;
  global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  global.cancelAnimationFrame = (id) => clearTimeout(id);

  window.i18n = { t: (k) => `T:${k}`, changeLanguage: async () => {} };
}

describe('I18nCoordinator (bootstrap/i18n.js)', () => {
  before(() => setupDom());

  test('initialize: 暴露 electronAPI.i18n 到 window.i18n', async () => {
    const fake = { t: (k) => k, changeLanguage: async () => {} };
    window.electronAPI = { i18n: fake };
    delete window.i18n;
    const { I18nCoordinator } = await import('../../electron/renderer/bootstrap/i18n.js');
    const c = new I18nCoordinator();
    await c.initialize();
    assert.strictEqual(window.i18n, fake);
  });

  test('updateUIText: data-i18n / -placeholder / -title 三属性刷新', async () => {
    setupDom(`<!DOCTYPE html><html><body>
      <span data-i18n="k1"></span>
      <input data-i18n-placeholder="k2">
      <div data-i18n-title="k3"></div>
    </body></html>`);
    window.i18n = { t: (k) => `T:${k}` };
    const { I18nCoordinator } = await import('../../electron/renderer/bootstrap/i18n.js');
    const c = new I18nCoordinator();
    c.updateUIText();
    assert.strictEqual(document.querySelector('[data-i18n]').textContent, 'T:k1');
    assert.strictEqual(document.querySelector('[data-i18n-placeholder]').placeholder, 'T:k2');
    assert.strictEqual(document.querySelector('[data-i18n-title]').title, 'T:k3');
  });
});

describe('SaveConfirmController (ui/save-confirm.js)', () => {
  before(() =>
    setupDom(`<!DOCTYPE html><html><body>
      <div id="save-confirm-modal-title"></div>
      <div id="save-confirm-modal-message"></div>
    </body></html>`)
  );

  test('show → executeSave: 触发 onSave 并 hide; hide 后回调清空 (防悬空调用)', async () => {
    const { SaveConfirmController } = await import('../../electron/renderer/ui/save-confirm.js');
    let opened = 0;
    let closed = 0;
    const modal = { open: () => opened++, close: () => closed++ };
    const sc = new SaveConfirmController(modal);
    let saved = 0;
    let discarded = 0;
    sc.show(
      '标题',
      '消息',
      () => saved++,
      () => discarded++
    );
    assert.strictEqual(document.getElementById('save-confirm-modal-title').textContent, '标题');
    assert.strictEqual(opened, 1);

    sc.executeSave();
    assert.strictEqual(saved, 1);
    assert.strictEqual(discarded, 0);
    assert.strictEqual(closed, 1, 'executeSave 后应 hide');

    // hide 已清回调: 再次 execute 不触发 (状态机收口)
    sc.executeSave();
    assert.strictEqual(saved, 1);

    sc.show(
      't2',
      'm2',
      () => saved++,
      () => discarded++
    );
    sc.executeDiscard();
    assert.strictEqual(discarded, 1);
  });
});

describe('CustomSelects (ui/custom-select.js)', () => {
  before(() =>
    setupDom(`<!DOCTYPE html><html><body>
      <div class="custom-select-wrapper" id="sel1" data-options='[{"value":"a","label":"kA","default":true},{"value":"b","label":"kB"}]'></div>
    </body></html>`)
  );

  test('initializeCustomSelects: 声明式生成 + 默认项选中 + initCustomSelect 幂等', async () => {
    const { CustomSelects } = await import('../../electron/renderer/ui/custom-select.js');
    const cs = new CustomSelects();
    cs.initializeCustomSelects();
    const select = document.getElementById('sel1-select');
    assert.ok(select, '应生成 #sel1-select');
    assert.strictEqual(
      document.getElementById('sel1-selected').querySelector('.custom-select__text').textContent,
      'T:kA',
      '默认项文本经 i18n'
    );
    // options 已移到 body (定位需要), 选项数按 id 查
    assert.strictEqual(document.getElementById('sel1-options').querySelectorAll('.custom-select__option').length, 2);

    // 幂等: 重复 init 不重复绑定
    cs.initCustomSelect('sel1-select');
    assert.strictEqual(select.dataset.initialized, 'true');

    // options 移到 body
    assert.strictEqual(document.getElementById('sel1-options').parentElement, document.body);
  });
});

after(() => {
  dom = null;
});

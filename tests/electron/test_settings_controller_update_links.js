// 更新弹窗 changelog 外链链路集成测试
//
// 背景: release body 里的 Markdown 链接此前只是纯文本; 改为渲染成
// `<a data-external>` 后, 必须由 controller 的事件委托接管点击并走
// openExternal (系统浏览器), 而不是在 Electron 窗口内导航。
// 本测试真实启动 SettingsController (jsdom), 验证这条链路不是纸面接线。

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

// jsdom 装在 electron/node_modules 下, tests/ 目录无法直接 require, 用绝对路径
const { JSDOM } = require(path.join(__dirname, '..', '..', 'electron', 'node_modules', 'jsdom'));

// ── 最小 settings DOM (覆盖 controller #bindDomEvents 用到的 id) ──
const SETTINGS_HTML = `<!DOCTYPE html><html><body>
  <div class="main-content"></div>
  <input id="dark-mode-toggle" type="checkbox">
  <div id="theme-color-preview"></div>
  <div id="theme-color-options"></div>
  <input id="theme-color-hex" type="text">
  <input id="default-test-directory" type="text">
  <span id="default-directory-tooltip"></span>
  <button id="browse-default-directory"></button>
  <button id="clear-default-directory"></button>
  <input id="config-storage-path" type="text">
  <span id="config-storage-tooltip"></span>
  <button id="browse-config-storage"></button>
  <button id="reset-config-storage"></button>
  <div id="custom-language-select">
    <div class="custom-select__selected" id="custom-language-selected"><span class="custom-select__text"></span></div>
  </div>
  <div class="custom-select__options" id="custom-language-options"></div>
  <div id="custom-notification-platform-select">
    <div class="custom-select__selected" id="custom-notification-platform-selected"><span class="custom-select__text"></span></div>
  </div>
  <div class="custom-select__options" id="custom-notification-platform-options"></div>
  <input id="notification-access-token" type="text">
  <input id="notification-secret" type="text">
  <div id="notification-access-token-item"></div>
  <div id="notification-secret-item"></div>
  <button id="export-config-btn"></button>
  <button id="export-logs-btn"></button>
  <button id="import-config-btn"></button>
  <button id="clear-allure-reports-btn"></button>
  <button id="clear-all-logs-btn"></button>
  <input id="auto-check-update-toggle" type="checkbox">
  <input id="prevent-sleep-toggle" type="checkbox">
  <button id="check-update-btn"></button>
  <span id="app-version-info">v0.1.6</span>
  <span id="app-build-date">-</span>
  <a id="github-repo-link"></a>
  <div id="update-modal-overlay" class="hidden"></div>
  <div id="update-current-version"></div>
  <div id="update-new-version"></div>
  <div id="update-changelog"></div>
  <div id="update-progress-container" class="hidden"></div>
  <div id="update-progress-fill"></div>
  <div id="update-progress-text"></div>
  <div id="update-progress-speed"></div>
  <button id="update-download-btn"></button>
  <button id="update-modal-close-btn"></button>
  <button id="update-cancel-btn"></button>
</body></html>`;

let dom;
const externalCalls = [];

function setupDom() {
  dom = new JSDOM(SETTINGS_HTML, {
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

  window.i18n = {
    t: (k) => k,
    getLanguage: () => 'zh-CN',
    changeLanguage: async () => {},
  };
  window.__XKAT_MODALS__ = { confirm: { open: () => {}, close: () => {} } };
  window.Toast = {
    success: () => {},
    error: () => {},
    warning: () => {},
    info: () => {},
  };
  window.__XKAT_APP__ = undefined;

  // electronAPI mock: on* 返回解绑函数, 其余返回 { success: true } 并记录调用
  window.electronAPI = new Proxy(
    {},
    {
      get: (target, prop) => {
        if (typeof prop !== 'string') return undefined;
        if (prop.startsWith('on')) {
          target[`h_${prop}`] = () => {};
          return () => () => {};
        }
        return async (...args) => {
          if (prop === 'openExternal') externalCalls.push(args[0]);
          return target[`__r_${prop}`] || { success: true, data: [] };
        };
      },
    }
  );
}

async function bootController() {
  const { SettingsModel } = await import('../../electron/renderer/tabs/settings/model.js');
  const { SettingsView } = await import('../../electron/renderer/tabs/settings/view.js');
  const { SettingsController } = await import('../../electron/renderer/tabs/settings/controller.js');
  const model = new SettingsModel();
  const view = new SettingsView();
  const controller = new SettingsController(model, view);
  await controller.init();
  return { controller, view };
}

function click(el) {
  const ev = new window.Event('click', { bubbles: true, cancelable: true });
  el.dispatchEvent(ev);
  return ev;
}

describe('更新弹窗 changelog 外链链路 (controller 事件委托 → openExternal)', () => {
  let controller;
  let view;

  before(async () => {
    setupDom();
    const booted = await bootController();
    controller = booted.controller;
    view = booted.view;
  });

  after(() => {
    if (controller) controller.destroy();
    dom = null;
  });

  test('点击 markdown 渲染出的白名单链接 → 调用 openExternal 且阻止窗口内导航', () => {
    externalCalls.length = 0;
    const container = document.getElementById('update-changelog');
    container.innerHTML =
      '<div class="md-body"><a class="md-link" href="https://github.com/RingOnTheWay/XKAutoTester/pull/12" data-external="1">#12</a></div>';
    const ev = click(container.querySelector('a'));
    assert.deepStrictEqual(externalCalls, ['https://github.com/RingOnTheWay/XKAutoTester/pull/12']);
    assert.strictEqual(ev.defaultPrevented, true);
  });

  test('端到端: showUpdateModal 渲染 release body 后点其中的链接仍可打开', () => {
    externalCalls.length = 0;
    view.showUpdateModal({
      version: 'v0.1.7',
      changelog: "## What's Changed\n\n- **feat** by [#12](https://github.com/RingOnTheWay/XKAutoTester/pull/12)",
      secure: true,
    });
    const container = document.getElementById('update-changelog');
    const anchor = container.querySelector('a[data-external]');
    assert.ok(anchor, 'changelog 中的链接应渲染为锚点');
    click(anchor);
    assert.deepStrictEqual(externalCalls, ['https://github.com/RingOnTheWay/XKAutoTester/pull/12']);
  });

  test('非 data-external 锚点不触发 openExternal', () => {
    externalCalls.length = 0;
    const container = document.getElementById('update-changelog');
    container.innerHTML = '<a href="https://github.com/x/y">plain</a>';
    const ev = click(container.querySelector('a'));
    assert.deepStrictEqual(externalCalls, []);
    assert.strictEqual(ev.defaultPrevented, false);
  });

  test('changelog 中非白名单 URL 根本不产出锚点 (无点击面)', () => {
    externalCalls.length = 0;
    view.showUpdateModal({
      version: 'v0.1.7',
      changelog: '[evil](javascript:alert(1)) [plain](http://example.com/x)',
      secure: true,
    });
    const container = document.getElementById('update-changelog');
    assert.strictEqual(container.querySelectorAll('a').length, 0);
    assert.ok(container.querySelectorAll('.md-url').length > 0, '降级为不可点文本');
  });
});

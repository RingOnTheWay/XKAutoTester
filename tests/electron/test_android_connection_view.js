// AndroidConnectionView XSS 单元测试 (R12)
// renderEllipsis 省略路径下拉的 displayName 为设备侧可控内容, 必须转义,
// 防止经 innerHTML 注入 script / img onerror。

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const { JSDOM } = require(path.join(__dirname, '..', '..', 'electron', 'node_modules', 'jsdom'));

const HTML = `<!DOCTYPE html><html><body>
  <div id="ellipsis-dropdown"></div>
</body></html>`;

let dom;
let savedGlobals = {};

function setupJsdm() {
  dom = new JSDOM(HTML, { pretendToBeVisual: true });
  savedGlobals.document = global.document;
  savedGlobals.window = global.window;
  global.document = dom.window.document;
  global.window = dom.window;
  global.window.i18n = { t: (k) => k };
  global.window.__XKAT_APP__ = { getIconHtml: () => '' };
}

function teardownJsdm() {
  Object.keys(savedGlobals).forEach((k) => {
    if (savedGlobals[k] === undefined) delete global[k];
    else global[k] = savedGlobals[k];
  });
  savedGlobals = {};
  dom = null;
}

let ViewClass;
async function loadView() {
  if (!ViewClass) {
    const mod = await import('../../electron/renderer/tabs/android-connection/view.js');
    ViewClass = mod.AndroidConnectionView;
  }
  return ViewClass;
}

describe('AndroidConnectionView renderEllipsis HTML 转义 (防 XSS)', () => {
  before(async () => {
    setupJsdm();
    await loadView();
  });
  after(teardownJsdm);

  test('escapeHtml 转义 & < > " \'', () => {
    const v = new ViewClass();
    assert.strictEqual(v.escapeHtml('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
    assert.strictEqual(v.escapeHtml('a&b'), 'a&amp;b');
    assert.strictEqual(v.escapeHtml('say "hi"'), 'say &quot;hi&quot;');
    assert.strictEqual(v.escapeHtml("it's"), 'it&#39;s');
  });

  test('renderEllipsis 恶意 displayName 渲染时被转义 (不注入原始 HTML)', () => {
    const v = new ViewClass();
    const container = global.document.createElement('div');
    const dropdown = v.els.ellipsisDropdown;
    assert.ok(dropdown, 'ellipsis-dropdown 元素应存在');

    v.renderEllipsis(
      container,
      [{ displayName: '<img src=x onerror=alert(1)>', path: '/sdcard/x' }],
      () => {}
    );

    const html = dropdown.innerHTML;
    assert.ok(!html.includes('<img'), '不应渲染原始标签');
    assert.ok(html.includes('&lt;img'), 'displayName 被转义');
  });

  test('renderEllipsis 正常 displayName 保留原文本', () => {
    const v = new ViewClass();
    const container = global.document.createElement('div');

    v.renderEllipsis(
      container,
      [{ displayName: 'folder/子目录', path: '/sdcard/sub' }],
      () => {}
    );

    const html = v.els.ellipsisDropdown.innerHTML;
    assert.ok(html.includes('folder/子目录'), '正常文本不被破坏');
  });
});
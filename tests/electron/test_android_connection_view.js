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

  test('R25 P1-4: view 无 showConfirmDialog (confirm 全仓唯一实现 = core/confirmModal.js)', async () => {
    // 防回潮: 第三套 confirm 实现 (写全局 __XKAT_CONFIRM_CALLBACK__ 且确认路径不
    // close 弹窗, 需二次点击) 已删除, controller 改调 core/utils/confirmModal.js。
    assert.strictEqual(
      typeof ViewClass.prototype.showConfirmDialog,
      'undefined',
      'android-connection view 不得再实现 confirm 弹窗 (统一走 core 版)'
    );
  });
});
// ── P3-7/P3-8: modifiedTime/createdAt 转义 + CSS.escape ─────

describe('P3-7/P3-8 文件行 XSS + 属性选择器安全', () => {
  before(async () => {
    setupJsdm();
    // jsdom 无 CSS.escape (真实 Chromium 有), 测试用等价 polyfill
    global.CSS = {
      escape: (s) => String(s).replace(/[^a-zA-Z0-9_-]/g, (c) => '\\' + c),
    };
    await loadView();
  });
  after(() => {
    teardownJsdm();
    delete global.CSS;
  });

  test('P3-7 displayFileList 渲染时 modifiedTime/createdAt 转义', () => {
    // 构造文件列表容器 (displayFileList 需要 DOM 容器)
    const listContainer = document.createElement('div');
    listContainer.id = 'file-list';
    document.body.appendChild(listContainer);
    const v = new ViewClass();
    v.els = { fileList: listContainer };

    const evil = '<img src=x onerror=alert(1)>';
    const files = [
      {
        name: 'a.txt',
        path: '/sdcard/a.txt',
        isDirectory: false,
        size: '10',
        modifiedTime: evil,
        createdAt: evil,
      },
    ];

    v.displayFileList(files, [], () => {}, () => {}, () => {});

    const html = listContainer.innerHTML;
    assert.ok(!html.includes('<img src=x onerror'), '不得直插未转义的 img onerror');
    assert.ok(html.includes('&lt;img'), '应转义为实体');
    assert.ok(html.includes('&gt;'), '应转义闭合尖括号');
    assert.strictEqual(listContainer.querySelectorAll('img[onerror]').length, 0, 'DOM 中无注入元素');
  });

  test('P3-8 toggleFileSelection 含引号路径不抛异常', () => {
    const listContainer = document.createElement('div');
    listContainer.id = 'file-list';
    document.body.appendChild(listContainer);
    const v = new ViewClass();
    v.els = { fileList: listContainer };

    // 构造含引号路径的 DOM 行 (与 displayFileList 生成的结构一致)
    const evilPath = '/sdcard/it"s "weird.txt';
    const row = document.createElement('div');
    row.className = 'file-item';
    row.setAttribute('data-path', evilPath);
    listContainer.appendChild(row);

    // 修复前: querySelector(`[data-path="${evilPath}"]`) 语法错误抛异常
    assert.doesNotThrow(() => v.toggleFileSelection({ path: evilPath }, true), '含引号路径不得抛异常');
    assert.ok(row.classList.contains('selected'), '选中态应正确切换');
  });
});

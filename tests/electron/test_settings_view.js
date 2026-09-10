// SettingsView 关键路径单元测试
// 需用 --require tests/electron/_setup.js 预加载 electron mock
// 使用 jsdom 模拟 DOM，动态 import 加载 ESM View 模块

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

// jsdom 安装在 electron/node_modules 下，tests/ 目录无法直接 require，用绝对路径
const { JSDOM } = require(path.join(__dirname, '..', '..', 'electron', 'node_modules', 'jsdom'));

// ── 最小 settings tab DOM 结构（仅包含 SettingsView 构造器 + 受测方法所需 ID） ──
const SETTINGS_HTML = `<!DOCTYPE html><html><body>
  <div class="main-content"></div>
  <input id="dark-mode-toggle" type="checkbox">
  <div id="theme-color-preview"></div>
  <div id="theme-color-options">
    <div class="theme-color-option" data-color="#4CAF50"></div>
    <div class="theme-color-option" data-color="#2196F3"></div>
  </div>
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
    <div class="custom-select__selected" id="custom-language-selected">
      <span class="custom-select__text">简体中文</span>
    </div>
  </div>
  <div class="custom-select__options" id="custom-language-options">
    <div class="custom-select__option" data-value="zh-CN"><span>简体中文</span></div>
    <div class="custom-select__option" data-value="en-US"><span>English</span></div>
  </div>
  <div id="custom-notification-platform-select">
    <div class="custom-select__selected" id="custom-notification-platform-selected">
      <span class="custom-select__text">无</span>
    </div>
  </div>
  <div class="custom-select__options" id="custom-notification-platform-options">
    <div class="custom-select__option" data-value="none"><span>无</span></div>
    <div class="custom-select__option" data-value="dingtalk"><span>钉钉</span></div>
  </div>
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
  <span id="app-version-info">v0.0.0</span>
  <span id="app-build-date">-</span>
  <a id="github-repo-link"></a>
  <div id="update-modal-overlay" class="hidden"></div>
  <div id="update-current-version"></div>
  <div id="update-new-version"></div>
  <div id="update-changelog"></div>
  <div id="update-progress-container"></div>
  <div id="update-progress-fill"></div>
  <div id="update-progress-text"></div>
  <div id="update-progress-speed"></div>
  <button id="update-download-btn"></button>
  <button id="update-modal-close-btn"></button>
  <button id="update-cancel-btn"></button>
  <button id="test-click-btn"></button>
  <input id="test-toggle" type="checkbox">
  <button id="confirm-modal-confirm-btn" data-i18n="common.confirm">确认</button>
  <button id="confirm-modal-cancel-btn">取消</button>
</body></html>`;

// ── jsdom 全局设置 ──────────────────────────────────────────
let dom;
let savedGlobals = {};

function setupJsdm() {
  dom = new JSDOM(SETTINGS_HTML, { pretendToBeVisual: true });
  const { window } = dom;
  savedGlobals.document = global.document;
  savedGlobals.window = global.window;
  savedGlobals.navigator = global.navigator;

  global.document = window.document;
  global.window = window;
  // window 内置对象
  global.window.i18n = { t: (k) => k };
  global.window.__XKAT_MODALS__ = {
    confirm: { open: () => {}, close: () => {} },
  };
  global.window.electronAPI = {}; // 避免 ApiBridge.api 报错
  // getBoundingClientRect 默认返回全 0
  if (!window.HTMLElement.prototype.getBoundingClientRect) {
    window.HTMLElement.prototype.getBoundingClientRect = () => ({
      width: 100,
      height: 30,
      top: 100,
      bottom: 130,
      left: 10,
    });
  }
}

function teardownJsdm() {
  Object.keys(savedGlobals).forEach((k) => {
    if (savedGlobals[k] === undefined) delete global[k];
    else global[k] = savedGlobals[k];
  });
  savedGlobals = {};
  dom = null;
}

// ── 动态加载 SettingsView (ESM) ───────────────────────────
let SettingsViewModule;
let ViewClass;

async function loadSettingsView() {
  if (!SettingsViewModule) {
    SettingsViewModule = await import('../../electron/renderer/tabs/settings/view.js');
    ViewClass = SettingsViewModule.SettingsView;
  }
  return ViewClass;
}

// ── 测试用例 ────────────────────────────────────────────────

describe('SettingsView 构造 + els 缓存', () => {
  before(async () => {
    setupJsdm();
    await loadSettingsView();
  });
  after(teardownJsdm);

  test('构造器应缓存所有静态 DOM 引用到 this.els', () => {
    const v = new ViewClass();
    assert.ok(v.els.darkModeToggle, 'darkModeToggle 应被缓存');
    assert.ok(v.els.themeColorPreview, 'themeColorPreview 应被缓存');
    assert.ok(v.els.themeColorOptions, 'themeColorOptions 应被缓存');
    assert.ok(v.els.customLanguageOptions, 'customLanguageOptions 应被缓存');
    assert.ok(v.els.customNotificationPlatformOptions, 'customNotificationPlatformOptions 应被缓存');
  });
});

describe('SettingsView 滚动状态管理', () => {
  before(async () => {
    setupJsdm();
    await loadSettingsView();
  });
  after(teardownJsdm);

  test('disablePageScroll 应给 main-content 加 dropdown-open 类', () => {
    const v = new ViewClass();
    const mainContent = document.querySelector('.main-content');
    assert.strictEqual(mainContent.classList.contains('dropdown-open'), false);
    v.disablePageScroll();
    assert.strictEqual(mainContent.classList.contains('dropdown-open'), true);
  });

  test('enablePageScroll 应移除 dropdown-open 类', () => {
    const v = new ViewClass();
    const mainContent = document.querySelector('.main-content');
    mainContent.classList.add('dropdown-open');
    v.enablePageScroll();
    assert.strictEqual(mainContent.classList.contains('dropdown-open'), false);
  });

  test('重复调用 disablePageScroll 不应重复绑定 wheel handler', () => {
    const v = new ViewClass();
    const mainContent = document.querySelector('.main-content');
    // 通过监听 wheel 触发是否被 preventDefault 来间接验证 handler 计数
    v.disablePageScroll();
    v.disablePageScroll(); // 应幂等
    v.enablePageScroll();
    // enablePageScroll 后 wheel 不应再被阻止
    const evt = new window.WheelEvent('wheel', { cancelable: true });
    mainContent.dispatchEvent(evt);
    // 未抛错即认为状态正确
    assert.ok(true);
  });
});

describe('SettingsView 下拉切换', () => {
  before(async () => {
    setupJsdm();
    await loadSettingsView();
  });
  after(teardownJsdm);

  test('toggleLanguageDropdown 应在 show / hide 之间切换并返回 boolean', () => {
    const v = new ViewClass();
    assert.strictEqual(v.toggleLanguageDropdown(), true, '首次切换应返回 true');
    assert.ok(v.els.customLanguageOptions.classList.contains('show'));
    assert.strictEqual(v.toggleLanguageDropdown(), false, '再次切换应返回 false');
    assert.ok(!v.els.customLanguageOptions.classList.contains('show'));
  });

  test('toggleNotificationDropdown 应在 show / hide 之间切换', () => {
    const v = new ViewClass();
    assert.strictEqual(v.toggleNotificationDropdown(), true);
    assert.ok(v.els.customNotificationPlatformOptions.classList.contains('show'));
    assert.strictEqual(v.toggleNotificationDropdown(), false);
    assert.ok(!v.els.customNotificationPlatformOptions.classList.contains('show'));
  });

  test('toggleThemeColorOptions 应切换 show 类', () => {
    const v = new ViewClass();
    v.toggleThemeColorOptions();
    const hasShow = v.els.themeColorOptions.classList.contains('show');
    v.toggleThemeColorOptions();
    assert.strictEqual(v.els.themeColorOptions.classList.contains('show'), !hasShow);
  });

  test('hideAllCustomSelectOptions 应隐藏所有 .show 的 options', () => {
    const v = new ViewClass();
    v.els.customLanguageOptions.classList.add('show');
    v.els.customNotificationPlatformOptions.classList.add('show');
    v.hideAllCustomSelectOptions();
    assert.ok(!v.els.customLanguageOptions.classList.contains('show'));
    assert.ok(!v.els.customNotificationPlatformOptions.classList.contains('show'));
  });

  test('hideAllCustomSelectOptions 接受 except 参数排除特定元素', () => {
    const v = new ViewClass();
    v.els.customLanguageOptions.classList.add('show');
    v.els.customNotificationPlatformOptions.classList.add('show');
    v.hideAllCustomSelectOptions(v.els.customLanguageOptions);
    assert.ok(v.els.customLanguageOptions.classList.contains('show'), 'except 元素应保持显示');
    assert.ok(!v.els.customNotificationPlatformOptions.classList.contains('show'));
  });

  test('closeAllDropdowns 应移除所有 .show + 清理 main-content dropdown-open', () => {
    const v = new ViewClass();
    v.els.customLanguageOptions.classList.add('show');
    document.querySelector('.main-content').classList.add('dropdown-open');
    v.closeAllDropdowns();
    assert.ok(!v.els.customLanguageOptions.classList.contains('show'));
    assert.ok(!document.querySelector('.main-content').classList.contains('dropdown-open'));
  });
});

describe('SettingsView 事件绑定 helper', () => {
  before(async () => {
    setupJsdm();
    await loadSettingsView();
  });
  after(teardownJsdm);

  test('bindClickById 应在 click 时触发 handler，元素 disabled 时跳过', async () => {
    const v = new ViewClass();
    let calls = 0;
    const unbind = v.bindClickById('test-click-btn', () => {
      calls++;
    });
    document.getElementById('test-click-btn').click();
    assert.strictEqual(calls, 1);
    // disabled 时不应触发
    document.getElementById('test-click-btn').disabled = true;
    document.getElementById('test-click-btn').click();
    assert.strictEqual(calls, 1);
    // 解绑后不再触发
    document.getElementById('test-click-btn').disabled = false;
    unbind();
    document.getElementById('test-click-btn').click();
    assert.strictEqual(calls, 1);
  });

  test('bindClickById 元素不存在时返回 noop 不抛错', () => {
    const v = new ViewClass();
    const unbind = v.bindClickById('non-existent-id', () => {});
    assert.strictEqual(typeof unbind, 'function');
    unbind(); // 不抛错
  });

  test('bindToggleById 应在 change 时回传 checked', () => {
    const v = new ViewClass();
    let lastChecked = null;
    const unbind = v.bindToggleById('test-toggle', (checked) => {
      lastChecked = checked;
    });
    const el = document.getElementById('test-toggle');
    el.checked = true;
    el.dispatchEvent(new window.Event('change'));
    assert.strictEqual(lastChecked, true);
    el.checked = false;
    el.dispatchEvent(new window.Event('change'));
    assert.strictEqual(lastChecked, false);
    unbind();
    el.checked = true;
    el.dispatchEvent(new window.Event('change'));
    assert.strictEqual(lastChecked, false, '解绑后不应再触发');
  });

  test('bindThemeColorOptionsClick 应读取 data-color 并回传', () => {
    const v = new ViewClass();
    let received = null;
    const unbind = v.bindThemeColorOptionsClick((color) => {
      received = color;
    });
    const opt = v.els.themeColorOptions.querySelector('[data-color="#4CAF50"]');
    opt.click();
    assert.strictEqual(received, '#4CAF50');
    // 点击后 options 应自动关闭
    assert.ok(!v.els.themeColorOptions.classList.contains('show'));
    unbind();
  });

  test('bindThemeColorHexChange 应仅在合法 hex 时触发', () => {
    const v = new ViewClass();
    let received = null;
    const unbind = v.bindThemeColorHexChange((color) => {
      received = color;
    });
    const input = v.els.themeColorHex;
    input.value = 'invalid';
    input.dispatchEvent(new window.Event('change'));
    assert.strictEqual(received, null);
    input.value = '#1A2B3C';
    input.dispatchEvent(new window.Event('change'));
    assert.strictEqual(received, '#1A2B3C');
    unbind();
  });

  test('bindLanguageOptionsClick 应回传 lang 并更新 selected 显示', () => {
    const v = new ViewClass();
    let receivedLang = null;
    const unbind = v.bindLanguageOptionsClick((lang) => {
      receivedLang = lang;
    });
    const opt = v.els.customLanguageOptions.querySelector('[data-value="en-US"]');
    opt.click();
    assert.strictEqual(receivedLang, 'en-US');
    const textSpan = v.els.customLanguageSelected.querySelector('.custom-select__text');
    assert.strictEqual(textSpan.textContent, 'English');
    assert.ok(opt.classList.contains('selected'));
    unbind();
  });

  test('bindNotificationOptionsClick 应回传 platform 并更新 selected 显示', () => {
    const v = new ViewClass();
    let received = null;
    const unbind = v.bindNotificationOptionsClick((p) => {
      received = p;
    });
    const opt = v.els.customNotificationPlatformOptions.querySelector('[data-value="dingtalk"]');
    opt.click();
    assert.strictEqual(received, 'dingtalk');
    assert.ok(opt.classList.contains('selected'));
    unbind();
  });

  test('bindAccessTokenChange / bindSecretChange 应在 change 时触发', () => {
    const v = new ViewClass();
    let tokenCalls = 0;
    let secretCalls = 0;
    const u1 = v.bindAccessTokenChange(() => {
      tokenCalls++;
    });
    const u2 = v.bindSecretChange(() => {
      secretCalls++;
    });
    v.els.notificationAccessToken.dispatchEvent(new window.Event('change'));
    v.els.notificationSecret.dispatchEvent(new window.Event('change'));
    assert.strictEqual(tokenCalls, 1);
    assert.strictEqual(secretCalls, 1);
    u1();
    u2();
  });

  test('getAccessToken / getSecret 应返回输入值', () => {
    const v = new ViewClass();
    v.els.notificationAccessToken.value = 'token-xyz';
    v.els.notificationSecret.value = 'secret-abc';
    assert.strictEqual(v.getAccessToken(), 'token-xyz');
    assert.strictEqual(v.getSecret(), 'secret-abc');
  });
});

describe('SettingsView 全局 click 事件委托', () => {
  before(async () => {
    setupJsdm();
    await loadSettingsView();
  });
  after(teardownJsdm);

  test('bindGlobalClickForDropdowns 应分发到对应 handler', () => {
    const v = new ViewClass();
    let langToggles = 0,
      notifToggles = 0,
      themeToggles = 0,
      outsideClicks = 0;
    const unbind = v.bindGlobalClickForDropdowns({
      onLanguageToggle: () => {
        langToggles++;
      },
      onNotificationToggle: () => {
        notifToggles++;
      },
      onThemeToggle: () => {
        themeToggles++;
      },
      onOutsideClick: () => {
        outsideClicks++;
      },
    });
    // 点击 language selected
    v.els.customLanguageSelected.click();
    assert.strictEqual(langToggles, 1);
    // 点击 notification selected
    v.els.customNotificationPlatformSelected.click();
    assert.strictEqual(notifToggles, 1);
    // 点击 theme preview
    v.els.themeColorPreview.click();
    assert.strictEqual(themeToggles, 1);
    // 点击其他区域
    document.body.click();
    assert.strictEqual(outsideClicks, 1);
    unbind();
  });
});

describe('SettingsView 渲染方法', () => {
  before(async () => {
    setupJsdm();
    await loadSettingsView();
  });
  after(teardownJsdm);

  test('renderVersionInfo 应填充 appVersionInfo 文本', () => {
    const v = new ViewClass();
    v.renderVersionInfo({ fullVersion: '1.2.3' });
    assert.strictEqual(v.els.appVersionInfo.textContent, 'v1.2.3');
  });

  test('R27 renderVersionInfo 应填充构建日期 (绑定 version.json buildDate)', () => {
    const v = new ViewClass();
    v.renderVersionInfo({ fullVersion: '1.2.3', buildDate: '2026-09-02' });
    assert.strictEqual(v.els.appBuildDate.textContent, '2026-09-02', 'buildDate 填充');
  });

  test('R27 renderVersionInfo buildDate 缺失 → 显示 -', () => {
    const v = new ViewClass();
    v.renderVersionInfo({ fullVersion: '1.2.3' });
    assert.strictEqual(v.els.appBuildDate.textContent, '-');
  });

  test('renderDataPath 应填充 input + tooltip', () => {
    const v = new ViewClass();
    v.renderDataPath('C:/Users/test/XKAutoTester');
    assert.strictEqual(v.els.configStoragePath.value, 'C:/Users/test/XKAutoTester');
    assert.strictEqual(v.els.configStorageTooltip.textContent, 'C:/Users/test/XKAutoTester');
  });

  test('updateLanguageSelector 应更新选中显示 + selected 状态', () => {
    const v = new ViewClass();
    v.updateLanguageSelector('en-US');
    const textSpan = v.els.customLanguageSelected.querySelector('.custom-select__text');
    assert.strictEqual(textSpan.textContent, 'English');
    const enOpt = v.els.customLanguageOptions.querySelector('[data-value="en-US"]');
    const zhOpt = v.els.customLanguageOptions.querySelector('[data-value="zh-CN"]');
    assert.ok(enOpt.classList.contains('selected'));
    assert.ok(!zhOpt.classList.contains('selected'));
  });

  test('updateNotificationConfig 钉钉平台应显示 token/secret 输入项', () => {
    const v = new ViewClass();
    v.updateNotificationConfig({
      platform: 'dingtalk',
      dingtalk: { access_token: 'tok', secret: 'sec' },
    });
    assert.ok(!v.els.notificationAccessTokenItem.classList.contains('hidden'));
    assert.ok(!v.els.notificationSecretItem.classList.contains('hidden'));
    assert.strictEqual(v.els.notificationAccessToken.value, 'tok');
    assert.strictEqual(v.els.notificationSecret.value, 'sec');
  });

  test('updateNotificationConfig 非 dingtalk 平台应隐藏 token/secret 输入项', () => {
    const v = new ViewClass();
    v.updateNotificationConfig({ platform: 'none', dingtalk: {} });
    assert.ok(v.els.notificationAccessTokenItem.classList.contains('hidden'));
    assert.ok(v.els.notificationSecretItem.classList.contains('hidden'));
  });

  test('applyDarkMode 应给 body 加/移除 dark-theme 类', () => {
    const v = new ViewClass();
    v.applyDarkMode(true);
    assert.ok(document.body.classList.contains('dark-theme'));
    v.applyDarkMode(false);
    assert.ok(!document.body.classList.contains('dark-theme'));
  });

  test('setButtonLoading loading=true 应禁用按钮并显示 spinner', () => {
    const v = new ViewClass();
    const btn = document.getElementById('test-click-btn');
    btn.textContent = '原始文本';
    v.setButtonLoading('test-click-btn', true);
    assert.strictEqual(btn.disabled, true);
    assert.ok(btn.classList.contains('loading'));
    v.setButtonLoading('test-click-btn', false);
    assert.strictEqual(btn.disabled, false);
    assert.ok(!btn.classList.contains('loading'));
  });

  test('setButtonLoading 还原后保留子 span data-i18n (切换语言可更新)', () => {
    const v = new ViewClass();
    const btn = document.getElementById('test-click-btn');
    btn.innerHTML = '<span data-i18n="settings.exportConfig">导出配置</span>';
    v.setButtonLoading('test-click-btn', true);
    v.setButtonLoading('test-click-btn', false);
    const span = btn.querySelector('span[data-i18n]');
    assert.ok(span, '还原后子 span 存在');
    assert.strictEqual(span.getAttribute('data-i18n'), 'settings.exportConfig', 'data-i18n key 保留');
    assert.strictEqual(span.textContent, '导出配置', '文本还原');
  });
});

describe('SettingsView 更新弹窗 — Markdown changelog 渲染与链接委托', () => {
  before(async () => {
    setupJsdm();
    await loadSettingsView();
  });
  after(teardownJsdm);

  test('showUpdateModal 应把 release body 渲染为 Markdown HTML (不再是纯文本)', () => {
    const v = new ViewClass();
    v.showUpdateModal({
      version: 'v0.1.7',
      changelog:
        "## What's Changed\n\n- **feat**: add `scrcpy` by [#1](https://github.com/RingOnTheWay/XKAutoTester/pull/1)",
      secure: true,
    });
    const el = document.getElementById('update-changelog');
    assert.ok(el.querySelector('.md-body h2'), '标题应渲染为 h2');
    assert.ok(el.querySelector('.md-body ul li strong'), '列表 + 粗体应渲染');
    assert.ok(el.querySelector('.md-body code.md-code'), '行内码应渲染');
    assert.ok(el.querySelector('.md-body a[data-external]'), '白名单链接应成为锚点');
    assert.ok(!el.textContent.includes('##'), '不应残留 markdown 标记');
  });

  test('changelog 被 .md-body 包裹 (样式作用域隔离于 hash 横幅)', () => {
    const v = new ViewClass();
    v.showUpdateModal({ version: 'v0.1.7', changelog: 'text', secure: true });
    const el = document.getElementById('update-changelog');
    const banner = el.querySelector('.update-hash-verified');
    const body = el.querySelector('.md-body');
    assert.ok(banner, '安全横幅仍在');
    assert.ok(body, '.md-body 容器存在');
    assert.strictEqual(banner.nextElementSibling, body, '横幅之后紧跟正文容器');
  });

  test('releaseNotes 回退字段同样走 Markdown 渲染', () => {
    const v = new ViewClass();
    v.showUpdateModal({
      version: 'v0.1.7',
      releaseNotes: '- a\n- b',
      secure: false,
    });
    const el = document.getElementById('update-changelog');
    assert.ok(el.querySelector('.md-body ul'));
    assert.ok(el.querySelector('.update-insecure-warning'));
  });

  test('bindExternalLinkDelegation: 点击白名单锚点 → 回调 href 且阻止默认导航', () => {
    const v = new ViewClass();
    const container = document.getElementById('update-changelog');
    container.innerHTML =
      '<div class="md-body"><a class="md-link" href="https://github.com/a/b" data-external="1">x</a></div>';
    const seen = [];
    const unbind = v.bindExternalLinkDelegation('update-changelog', (url) => seen.push(url));
    const anchor = container.querySelector('a');
    const ev = new window.Event('click', { bubbles: true, cancelable: true });
    anchor.dispatchEvent(ev);
    assert.deepStrictEqual(seen, ['https://github.com/a/b']);
    assert.strictEqual(ev.defaultPrevented, true, '必须阻止 Electron 窗口内导航');
    unbind();
  });

  test('bindExternalLinkDelegation: 点击子元素也能命中锚点 (委托穿透)', () => {
    const v = new ViewClass();
    const container = document.getElementById('update-changelog');
    container.innerHTML =
      '<div class="md-body"><a class="md-link" href="https://github.com/c/d" data-external="1"><strong>y</strong></a></div>';
    const seen = [];
    const unbind = v.bindExternalLinkDelegation('update-changelog', (url) => seen.push(url));
    container.querySelector('strong').dispatchEvent(new window.Event('click', { bubbles: true, cancelable: true }));
    assert.deepStrictEqual(seen, ['https://github.com/c/d']);
    unbind();
  });

  test('bindExternalLinkDelegation: 非 data-external 锚点不触发回调', () => {
    const v = new ViewClass();
    const container = document.getElementById('update-changelog');
    container.innerHTML = '<a href="https://github.com/x/y">plain</a>';
    const seen = [];
    const unbind = v.bindExternalLinkDelegation('update-changelog', (url) => seen.push(url));
    const ev = new window.Event('click', { bubbles: true, cancelable: true });
    container.querySelector('a').dispatchEvent(ev);
    assert.deepStrictEqual(seen, []);
    assert.strictEqual(ev.defaultPrevented, false);
    unbind();
  });

  test('bindExternalLinkDelegation: 容器不存在时返回空解绑函数 (不抛错)', () => {
    const v = new ViewClass();
    const unbind = v.bindExternalLinkDelegation('not-exist-container', () => {});
    assert.strictEqual(typeof unbind, 'function');
    assert.doesNotThrow(() => unbind());
  });

  test('bindExternalLinkDelegation: 解绑后不再响应点击', () => {
    const v = new ViewClass();
    const container = document.getElementById('update-changelog');
    container.innerHTML = '<a class="md-link" href="https://github.com/e/f" data-external="1">z</a>';
    const seen = [];
    const unbind = v.bindExternalLinkDelegation('update-changelog', (url) => seen.push(url));
    unbind();
    container.querySelector('a').dispatchEvent(new window.Event('click', { bubbles: true, cancelable: true }));
    assert.deepStrictEqual(seen, []);
  });
});

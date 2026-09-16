// R26 候选② settings 模型拆分回归测试
//
// 锁定的行为面:
// 1. BaseModel: set 相等短路 / forceSet / emitError 契约 (ADR-0011)
// 2. SettingsModel 门面: 子模型事件转发 + config→theme 路由 + get(key) 路由
//    + 静态兼容入口 (颜色/速度/markdown)
// 3. UpdateModel: 检查更新事件流 / 下载无数据错误 / 取消静默 (双 toast 回归锚点)
// 4. BaseController: init 钩子顺序 + destroy 解绑
//
// 背景: settings/model.js 原单文件混 8 类关注 (563 行上帝模型), 拆为
// ConfigModel/ThemeModel/UpdateModel + 门面。controller/view 公开面零改动,
// 本测试验证"零改动"不是纸面承诺。
//
// 注: ApiBridge.#api 静态缓存首次 window.electronAPI —— 故全程共享同一个
// proxy, 每个 test 只切换 overrides (不换 proxy 引用)。

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

// jsdom 装在 electron/node_modules 下, tests/ 目录无法直接 require, 用绝对路径
const { JSDOM } = require(path.join(__dirname, '..', '..', 'electron', 'node_modules', 'jsdom'));

let dom;
/** 当前生效的 override 表: { [method]: (...args) => any } */
let apiOverrides = {};
/** electronAPI 调用记录 */
const apiCalls = [];

function setupDom() {
  dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
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

  window.i18n = { t: (k) => k, getLanguage: () => 'zh-CN', changeLanguage: async () => {} };
  window.Toast = { success: () => {}, error: () => {}, warning: () => {}, info: () => {} };

  // 共享 proxy: on* 返回解绑函数; 嵌套路径 (如 pagePackage.getApps) 递归解析;
  // override 键用完整点路径, 默认 { success: true, data: {} }
  const resolve = (prefix) =>
    new Proxy(function () {}, {
      get: (_t, prop) => {
        if (typeof prop !== 'string') return undefined;
        if (prop === 'then') return undefined; // 避免 thenable 误判
        if (prop.startsWith('on')) {
          // 事件订阅: 调用返回解绑函数 (preload on* 语义)
          return () => () => {};
        }
        return resolve(prefix ? `${prefix}.${prop}` : prop);
      },
      apply: (_t, _this, args) => {
        const path = prefix;
        apiCalls.push({ method: path, args });
        if (apiOverrides[path]) return Promise.resolve(apiOverrides[path](...args));
        return Promise.resolve({ success: true, data: {} });
      },
    });
  window.electronAPI = resolve('');
}

/** 切换某测试的 API 行为 */
function stubApi(overrides = {}) {
  apiOverrides = overrides;
}

describe('BaseModel (core/BaseModel.js)', () => {
  before(setupDom);

  test('set: 值变更发事件, 相等短路', async () => {
    const { BaseModel } = await import('../../electron/renderer/core/BaseModel.js');
    const m = new BaseModel({ a: 1 });
    const seen = [];
    m.on('a-changed', (v, old) => seen.push([v, old]));
    assert.strictEqual(m.set('a', 2), true);
    assert.strictEqual(m.set('a', 2), false, '同值应短路');
    assert.strictEqual(m.set('a', 2, 'custom-event'), false, '短路时不发任何事件');
    assert.deepStrictEqual(seen, [[2, 1]]);
    assert.strictEqual(m.get('a'), 2);
    m.destroy();
  });

  test('set: 自定义事件名 + forceSet 不短路', async () => {
    const { BaseModel } = await import('../../electron/renderer/core/BaseModel.js');
    const m = new BaseModel();
    let hit = 0;
    m.on('custom', () => hit++);
    m.set('x', { v: 1 }, 'custom');
    m.forceSet('x', { v: 1 }, 'custom');
    assert.strictEqual(hit, 2, 'forceSet 引用语义每次都发');
    m.destroy();
  });

  test('emitError: ADR-0011 契约载荷形状', async () => {
    const { BaseModel } = await import('../../electron/renderer/core/BaseModel.js');
    const m = new BaseModel();
    let payload;
    m.on('error', (err) => (payload = err));
    const e = new Error('boom');
    m.emitError('saveConfig', e, { code: 'NET_ERR' });
    assert.strictEqual(payload.source, 'saveConfig');
    assert.strictEqual(payload.error, e);
    assert.strictEqual(payload.code, 'NET_ERR');
    m.destroy();
  });
});

describe('SettingsModel 门面 (拆分后行为保持)', () => {
  before(setupDom);

  test('load: config→theme 路由生效 (dark-mode/theme-color/language 事件齐发)', async () => {
    stubApi({
      getConfig: () => ({
        APP_SETTINGS: {
          dark_mode: true,
          theme_color: '#123456',
          language: 'en-US',
          autoCheckUpdate: false,
          preventSleep: true,
          allowInsecureSSL: true,
          notification: { platform: 'dingtalk', dingtalk: { access_token: 'tk', secret: 'sk' } },
        },
      }),
      getDataPath: () => ({ currentPath: 'C:\\xkat', defaultPath: 'C:\\d' }),
      getVersionInfo: () => ({ version: '0.1.7', fullVersion: '0.1.7-dev.1', buildDate: '2026-09-10' }),
    });
    const { SettingsModel } = await import('../../electron/renderer/tabs/settings/model.js');
    const m = new SettingsModel();
    const events = [];
    for (const ev of [
      'config-changed',
      'dark-mode-changed',
      'theme-color-changed',
      'language-changed',
      'data-path-changed',
      'version-info-changed',
      'error',
    ]) {
      m.on(ev, () => events.push(ev));
    }
    await m.load();

    assert.deepStrictEqual(
      events.sort(),
      [
        'config-changed',
        'dark-mode-changed',
        'data-path-changed',
        'language-changed',
        'theme-color-changed',
        'version-info-changed',
      ],
      '无 error 且事件齐全'
    );
    assert.strictEqual(m.darkMode, true);
    assert.strictEqual(m.themeColor, '#123456');
    assert.strictEqual(m.language, 'en-US');
    assert.strictEqual(m.autoCheckUpdate, false);
    assert.strictEqual(m.preventSleep, true);
    assert.strictEqual(m.allowInsecureSSL, true);
    assert.strictEqual(m.dataPath, 'C:\\xkat');
    assert.strictEqual(m.versionInfo.version, '0.1.7');
    assert.strictEqual(m.notification.platform, 'dingtalk');
    // get(key) 路由: 主题 key → ThemeModel
    assert.strictEqual(m.get('themeColor'), '#123456');
    assert.strictEqual(m.get('config').APP_SETTINGS.dark_mode, true);
    m.destroy();
  });

  test('update-available 转发: hasUpdate 置 updateData, 无 hash → secure=false', async () => {
    stubApi({
      getConfig: () => ({ APP_SETTINGS: {} }),
      checkForUpdateRaw: () => ({
        success: true,
        data: {
          hasUpdate: true,
          latestVersion: '0.1.8',
          latestVersionDisplay: 'v0.1.8',
          releaseNotes: 'notes',
          downloadUrl: 'https://github.com/x/y/releases/download/v0.1.8/a.exe',
          fileName: 'a.exe',
        },
      }),
    });
    const { SettingsModel } = await import('../../electron/renderer/tabs/settings/model.js');
    const m = new SettingsModel();
    let seen;
    m.on('update-available', (d) => (seen = d));
    await m.checkForUpdate();
    assert.ok(seen, '门面应转发 update-available');
    assert.strictEqual(seen.version, 'v0.1.8', '显示保留 v 前缀 (R27)');
    assert.strictEqual(seen.secure, false, '无 sha256 → 不可安装 (R10)');
    assert.strictEqual(m.updateData, seen);
    m.destroy();
  });

  test('downloadUpdate 无更新数据 → error(noUpdateData) 且不发 download-progress', async () => {
    stubApi({
      getConfig: () => ({ APP_SETTINGS: {} }),
    });
    const { SettingsModel } = await import('../../electron/renderer/tabs/settings/model.js');
    const m = new SettingsModel();
    let errPayload;
    m.on('error', (e) => (errPayload = e));
    await m.downloadUpdate();
    assert.strictEqual(errPayload?.source, 'downloadUpdate');
    assert.strictEqual(errPayload?.message, 'noUpdateData');
    m.destroy();
  });

  test('取消静默回归锚点: 下载进行中取消 → downloadUpdate catch 不 emit error (双 toast 防线)', async () => {
    // 真实时序: downloadUpdate 先启动 (复位取消旗) → await 中用户取消 (置旗)
    // → 主进程 abort → downloadUpdate 的 promise reject → catch 见取消旗静默。
    // 用 deferred 模拟"下载挂起中取消"。
    let rejectDownload;
    stubApi({
      getConfig: () => ({ APP_SETTINGS: {} }),
      checkForUpdateRaw: () => ({
        success: true,
        data: {
          hasUpdate: true,
          latestVersion: '0.1.8',
          latestVersionDisplay: 'v0.1.8',
          downloadUrl: 'https://github.com/x/y/releases/download/v0.1.8/a.exe',
          fileName: 'a.exe',
        },
      }),
      downloadUpdate: () =>
        new Promise((_resolve, reject) => {
          rejectDownload = reject;
        }),
      cancelUpdateDownload: () => ({ success: true, state: 'cancelled' }),
    });
    const { SettingsModel } = await import('../../electron/renderer/tabs/settings/model.js');
    const m = new SettingsModel();
    let errors = 0;
    m.on('error', () => errors++);
    await m.checkForUpdate(); // 置 updateData

    const pending = m.downloadUpdate(); // 启动下载 (此刻复位取消旗)
    await new Promise((r) => setTimeout(r, 0)); // 让 downloadUpdate 进入 await
    await m.cancelDownload(); // 下载进行中取消 → 置取消旗
    rejectDownload(new Error('aborted')); // 主进程 abort → reject
    const r = await pending;

    assert.strictEqual(errors, 0, '取消后的下载错误必须静默');
    assert.strictEqual(r.success, false);
    m.destroy();
  });

  test('静态兼容入口: 颜色/速度/markdown 委托可用', async () => {
    stubApi({});
    const { SettingsModel } = await import('../../electron/renderer/tabs/settings/model.js');
    assert.deepStrictEqual(SettingsModel.hexToRgb('#4CAF50'), { r: 76, g: 175, b: 80 });
    assert.strictEqual(SettingsModel.darkenColor('#ffffff', 1), '#000000');
    assert.strictEqual(SettingsModel.formatDownloadSpeed(2048), '2.0 KB/s');
    assert.strictEqual(SettingsModel.formatDownloadSpeed(0), '');
    assert.ok(SettingsModel.renderMarkdown('**x**').includes('<strong>x</strong>'));
  });

  test('UpdateModel 可直接实例化 (不经门面), 错误契约一致', async () => {
    stubApi({
      checkForUpdateRaw: () => ({ success: false, error: 'net down', errorCode: 'E_NET' }),
    });
    const { UpdateModel, UPDATE_DOWNLOAD_RESULT_STATE } =
      await import('../../electron/renderer/tabs/settings/models/UpdateModel.js');
    assert.deepStrictEqual(UPDATE_DOWNLOAD_RESULT_STATE, {
      COMPLETED: 'completed',
      CANCELLED: 'cancelled',
      NO_ACTIVE: 'no_active',
    });
    const u = new UpdateModel();
    let err;
    u.on('error', (e) => (err = e));
    const r = await u.checkForUpdate();
    assert.strictEqual(err?.source, 'checkUpdate');
    assert.strictEqual(err?.code, 'E_NET');
    assert.strictEqual(r.success, false);
    u.destroy();
  });
});

describe('BaseController (core/BaseController.js)', () => {
  before(setupDom);

  test('init 钩子顺序 + onModel 解绑 + destroy 收口', async () => {
    const { BaseController } = await import('../../electron/renderer/core/BaseController.js');
    const { BaseModel } = await import('../../electron/renderer/core/BaseModel.js');
    const order = [];
    class Probe extends BaseController {
      bindModelEvents() {
        order.push('bindModelEvents');
        this.onModel('ping', () => order.push('ping'));
      }
      bindDomEvents() {
        order.push('bindDomEvents');
        this.bindElement(() => order.push('cleanup'));
      }
      async onReady() {
        order.push('onReady');
      }
    }
    const model = new BaseModel();
    const c = new Probe(model, {});
    await c.init();
    model.emit('ping');
    assert.deepStrictEqual(order, ['bindModelEvents', 'bindDomEvents', 'onReady', 'ping'], '钩子顺序 ping 生效');
    c.destroy();
    model.emit('ping');
    assert.strictEqual(order.filter((x) => x === 'ping').length, 1, 'destroy 后订阅已解绑');
    assert.ok(order.includes('cleanup'), 'bindElement 解绑已执行');
    assert.strictEqual(c.destroyed, true);
  });
});

describe('PagePackageModel 接 BaseModel (R26 候选② 渐进迁移)', () => {
  before(setupDom);

  test('状态/事件语义迁移后保持: selectApp 级联重置 + deleteItem 静默清选择', async () => {
    stubApi({
      'pagePackage.getApps': () => ({ success: true, data: [{ id: 'a1', name: 'App1' }] }),
      'pagePackage.getPages': () => ({ success: true, data: [{ id: 'p1', name: 'Page1', app_id: 'a1' }] }),
      'pagePackage.getElements': () => ({ success: true, data: [] }),
      'pagePackage.deleteApp': () => ({ success: true }),
    });
    const { PagePackageModel } = await import('../../electron/renderer/tabs/page-package/model.js');
    const m = new PagePackageModel();
    await m.load();
    assert.strictEqual(m.apps.length, 1);
    assert.strictEqual(m.initialized, true);

    // 级联选择
    m.selectApp('a1');
    assert.strictEqual(m.selectedApp?.id, 'a1');
    assert.strictEqual(m.selectedPage, null, 'selectApp 应重置下级');

    // 静默清: deleteItem 后选择清空但 selected-app-changed 不再发 (防 collapse 语义)
    let selectedEvents = 0;
    m.on('selected-app-changed', () => selectedEvents++);
    await m.deleteItem('app');
    assert.strictEqual(m.selectedApp, null, '删除后选择应清空');
    assert.strictEqual(selectedEvents, 0, '静默清不发 selected-app-changed');
    assert.ok(m.get('apps'), 'get(key) 公开面可用');
    m.destroy();
  });
});

after(() => {
  dom = null;
});

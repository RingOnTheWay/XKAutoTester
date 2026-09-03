// ElectronApp before-quit 合并 + stopPreventSleep 回归 (R25 P3-3)
// 回归覆盖:
// - initialize() 只注册 1 个 before-quit 监听器 (原两处: allureWindow destroy + 服务清理)
// - 触发 before-quit: 服务清理 (schedulerService.destroy 等) + allureWindow destroy + stopPreventSleep
// 需 --require tests/electron/_setup.js; 本文件再包一层 Module._load 覆盖 electron mock
// (提供可收集事件的 app.on + 计数 powerSaveBlocker)。

const Module = require('module');
const os = require('node:os');
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const ELECTRON_APP_PATH = path.join(__dirname, '..', '..', 'electron', 'src', 'main', 'ElectronApp.js');

// ── electron mock 覆盖 (事件收集 + 计数) ────────────────────

const appListeners = {};
const powerCalls = { start: 0, stop: 0 };

const electronMock = {
  app: {
    isPackaged: false,
    on: (evt, fn) => {
      (appListeners[evt] = appListeners[evt] || []).push(fn);
    },
    // 永不 resolve: 避免 whenReady().then 触发窗口创建/服务初始化副作用
    whenReady: () => new Promise(() => {}),
    // 对齐 _setup.js 修复: os.tmpdir() 隔离 (原 /tmp 在 Windows 解析到盘根, 测试残留污染 D:\tmp)
    getPath: (name) => path.join(os.tmpdir(), 'xkat-test', name),
  },
  BrowserWindow: class {
    constructor() {
      this._destroyed = false;
      this.webContents = { send: () => {} };
    }
    loadFile() {}
    once() {}
    on() {}
    destroy() {
      this._destroyed = true;
    }
    isDestroyed() {
      return this._destroyed;
    }
    static getAllWindows() {
      return [];
    }
  },
  powerSaveBlocker: {
    start: () => {
      powerCalls.start++;
      return 1;
    },
    stop: () => {
      powerCalls.stop++;
    },
    isStarted: () => false,
  },
  ipcMain: { handle: () => {}, on: () => {} },
  dialog: { showMessageBox: async () => ({ response: 0 }) },
  shell: { openExternal: async () => true },
  Menu: { buildFromTemplate: () => ({}), setApplicationMenu: () => {} },
};

const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'electron') return electronMock;
  return origLoad.call(this, request, parent, isMain);
};

let ElectronApp;
function loadElectronApp() {
  if (!ElectronApp) {
    delete require.cache[ELECTRON_APP_PATH];
    ElectronApp = require(ELECTRON_APP_PATH);
  }
  return ElectronApp;
}

function clearListeners() {
  for (const k of Object.keys(appListeners)) delete appListeners[k];
  powerCalls.start = 0;
  powerCalls.stop = 0;
}

test('P3-3 before-quit 只注册一个监听器 (两处合并为一)', () => {
  const AppClass = loadElectronApp();
  clearListeners();
  const electronApp = new AppClass();
  electronApp.initialize();

  assert.strictEqual(
    (appListeners['before-quit'] || []).length,
    1,
    'before-quit 应只有 1 个监听器 (原 L282 allureWindow 与 L348 服务清理合并)'
  );
});

test('P3-3 before-quit 触发: 服务清理 + allureWindow destroy + stopPreventSleep', () => {
  const AppClass = loadElectronApp();
  clearListeners();
  const electronApp = new AppClass();

  // 注入服务: schedulerService.destroy 计数; allureWindow 未销毁
  const destroyed = [];
  electronApp.setServices({
    schedulerService: { destroy: () => destroyed.push('scheduler') },
    scrcpyService: { stopScrcpy: () => destroyed.push('scrcpy') },
    pythonTestService: { stop: () => destroyed.push('python') },
    inspectorService: { dispose: () => destroyed.push('inspector') },
  });
  electronApp.allureWindow = new electronMock.BrowserWindow();

  // 先启动防睡眠 (模拟 restorePreventSleepSetting 已开启), 使 stopPreventSleep 真正调 powerSaveBlocker.stop
  const powerHandlers = require(path.join(
    __dirname, '..', '..', 'electron', 'src', 'main', 'handlers', 'powerHandlers.js'
  ));
  powerHandlers.startPreventSleep();
  assert.strictEqual(powerCalls.start, 1, 'startPreventSleep 已启动');

  electronApp.initialize();
  // 触发 before-quit 监听器
  appListeners['before-quit'].forEach((fn) => fn());

  assert.deepStrictEqual(destroyed.sort(), ['inspector', 'python', 'scheduler', 'scrcpy'], '四个服务应全部清理');
  assert.strictEqual(electronApp.allureWindow, null, 'allureWindow 应被 destroy 并置 null');
  assert.strictEqual(powerCalls.stop, 1, 'stopPreventSleep 应被调用 (释放 powerSaveBlocker)');
});

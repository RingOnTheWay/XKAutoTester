// 测试 setup：mock electron 模块 + 引入 helpers
// 用 Module._load hook 拦截 require('electron')

const Module = require('module');
const os = require('os');
const path = require('path');

// ── helpers 全局导出 (供测试文件直接 require) ──────────────
// 不污染全局对象，测试文件显式 require 使用
module.exports.helpersPath = path.join(__dirname, 'helpers');

// ── electron mock ──────────────────────────────────────────
// 全局共享的 dialog mock 状态
global.__dialogMock = {
  lastOptions: null,
  showMessageBox: async (win, options) => {
    global.__dialogMock.lastOptions = options;
    return { response: 0 };
  }
};

const electronMock = {
  dialog: global.__dialogMock,
  // 扩展: BrowserWindow mock (handler 测试需要)
  BrowserWindow: class {
    constructor() { this.webContents = { send: () => {} }; }
  },
  // 扩展: app mock
  app: {
    // R27 修复: 原 getPath 返 `/tmp/xkat-test-${name}` — Windows 上 `/tmp` 解析到当前盘根
    // (如 D:\tmp), UserDataService 构造即 _ensureUserDataDir 创建真实目录且永不清理,
    // 测试跑一次就在用户盘根拉一坨 Xkautotester/config/test_cases。改用 os.tmpdir() 隔离。
    getPath: (name) => path.join(os.tmpdir(), 'xkat-test', name),
    setPath: () => {},
  },
  // 扩展: powerSaveBlocker mock
  powerSaveBlocker: {
    start: () => 1,
    stop: () => {},
    isStarted: () => false,
  },
  // 扩展: shell mock
  shell: {
    openExternal: async () => true,
    openPath: async () => '',
  },
  // 扩展: Menu mock
  Menu: { buildFromTemplate: () => ({}), setApplicationMenu: () => {} },
};

const origLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'electron') return electronMock;
  return origLoad.call(this, request, parent, isMain);
};

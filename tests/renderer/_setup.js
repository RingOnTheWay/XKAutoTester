// Renderer 测试 setup - jsdom 环境 + i18n/electronAPI mock
// 供 renderer Model/View 单测使用 (零新依赖，复用 node:test)
//
// 使用前需在根目录执行: npm install --save-dev jsdom
// 测试文件需: require('../tests/renderer/_setup.js') 在 import 之前

const { JSDOM } = require('jsdom');

// ── jsdom 全局化 ──────────────────────────────────────────────
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://localhost',
  pretendToBeVisual: true,
});

global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.HTMLElement = dom.window.HTMLElement;
global.Event = dom.window.Event;
global.CustomEvent = dom.window.CustomEvent;
global.Node = dom.window.Node;
global.Element = dom.window.Element;

// requestAnimationFrame / cancelAnimationFrame (jsdom 不提供)
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.cancelAnimationFrame = (id) => clearTimeout(id);

// ── i18n mock ─────────────────────────────────────────────────
// 返回 key 本身 (便于断言)，支持 {{var}} 插值
global.window.i18n = {
  t: (key, opts) => {
    if (!opts) return key;
    let s = key;
    for (const [k, v] of Object.entries(opts)) {
      s = s.replace(new RegExp(`{{${k}}}`, 'g'), String(v));
    }
    return s;
  },
  getLanguage: () => 'zh-CN',
  changeLanguage: async () => {},
};

// ── electronAPI mock (ApiBridge 依赖) ─────────────────────────
// 默认返回 { success: true, data: [] }，测试可覆盖具体方法
const electronAPICalls = [];
const defaultResponse = { success: true, data: [] };

global.window.electronAPI = new Proxy({}, {
  get: (target, prop) => {
    // 元方法: 查询调用记录
    if (prop === '__calls') return electronAPICalls;
    if (prop === '__reset') return () => electronAPICalls.length = 0;

    // on* 方法: 返回 unsubscribe 函数 (模拟 IPC 事件监听)
    if (prop.startsWith('on')) {
      return (callback) => {
        // 存储 callback 供测试 trigger
        target[`__handler_${prop}`] = callback;
        return () => { delete target[`__handler_${prop}`]; };
      };
    }

    // 普通 invoke 方法
    return async (...args) => {
      electronAPICalls.push({ method: prop, args });
      return target[`__response_${prop}`] || defaultResponse;
    };
  },
  set: (target, prop, value) => {
    // 允许测试预设响应: window.electronAPI.__response_getTestPlans = {...}
    if (prop.startsWith('__response_')) {
      target[prop] = value;
      return true;
    }
    target[prop] = value;
    return true;
  },
});

// ── Toast mock (renderer 组件依赖) ────────────────────────────
global.window.Toast = {
  success: () => {},
  error: () => {},
  warning: () => {},
  info: () => {},
};

// ── __XKAT_MODALS__ mock (confirm-modal 等) ───────────────────
global.window.__XKAT_MODALS__ = {
  confirm: {
    open: () => {},
    close: () => {},
  },
};

// ── AppState mock (可选，测试可覆盖) ─────────────────────────
if (!global.window.__XKAT_APP_STATE__) {
  global.window.__XKAT_APP_STATE__ = {
    get: () => null,
    set: () => {},
    on: () => () => {},  // 返回 unsubscribe
  };
}

module.exports = { dom };

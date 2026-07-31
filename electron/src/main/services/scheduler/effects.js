// effects — 默认 factory 实现 (副作用包装)。
//
// 抽自 SmartScheduler.js fs.watch (L307) + mainWindow.webContents.send (L282, L373) + 全局 timer。
// 5 类副作用经 factory-or-default 注入 SmartScheduler。对称 adb/device_connection.py (副作用 collaborator)。

const fs = require('fs');

const globalTimerProvider = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearTimeout: (h) => clearTimeout(h),
  clearInterval: (h) => clearInterval(h),
  setImmediate: (fn) => setImmediate(fn),
};

function defaultWatcherFactory(plansPath, cb) {
  try {
    if (!fs.existsSync(plansPath)) return null;
    return fs.watch(plansPath, (eventType) => cb(eventType));
  } catch {
    return null;
  }
}

function defaultNotifierFactory(window) {
  return {
    send(channel, payload) {
      if (window) window.webContents.send(channel, payload);
    },
  };
}

module.exports = { globalTimerProvider, defaultWatcherFactory, defaultNotifierFactory };

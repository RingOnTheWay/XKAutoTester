// scheduler/effects.js 单元测试 (R24 P2-9 补测试缺口)
// 覆盖 defaultWatcherFactory / defaultNotifierFactory / globalTimerProvider 委托

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const {
  globalTimerProvider,
  defaultWatcherFactory,
  defaultNotifierFactory,
} = require('../../electron/src/main/services/scheduler/effects.js');

test('globalTimerProvider 委托全局 timer 且透传参数', () => {
  const original = {
    setTimeout: global.setTimeout,
    setInterval: global.setInterval,
    clearTimeout: global.clearTimeout,
    clearInterval: global.clearInterval,
    setImmediate: global.setImmediate,
  };
  const seen = {};
  global.setTimeout = (fn, ms) => { seen.setTimeout = { fn, ms }; return 101; };
  global.setInterval = (fn, ms) => { seen.setInterval = { fn, ms }; return 202; };
  global.clearTimeout = (h) => { seen.clearTimeout = h; };
  global.clearInterval = (h) => { seen.clearInterval = h; };
  global.setImmediate = (fn) => { seen.setImmediate = { fn }; return 303; };
  try {
    const fn = () => {};
    assert.strictEqual(globalTimerProvider.setTimeout(fn, 500), 101);
    assert.strictEqual(seen.setTimeout.ms, 500);
    assert.strictEqual(globalTimerProvider.setInterval(fn, 1000), 202);
    assert.strictEqual(seen.setInterval.ms, 1000);
    globalTimerProvider.clearTimeout(101);
    assert.strictEqual(seen.clearTimeout, 101);
    globalTimerProvider.clearInterval(202);
    assert.strictEqual(seen.clearInterval, 202);
    assert.strictEqual(globalTimerProvider.setImmediate(fn), 303);
    assert.ok(seen.setImmediate.fn);
  } finally {
    Object.assign(global, original);
  }
});

test('defaultWatcherFactory 路径不存在/异常返回 null', () => {
  assert.strictEqual(defaultWatcherFactory('/nonexistent/plans.json', () => {}), null);
});

test('defaultWatcherFactory 路径存在返回 fs.watch 句柄且回调透传', async () => {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'xkat-effects-'));
  const plansPath = path.join(dir, 'plans.json');
  await fs.promises.writeFile(plansPath, '[]');
  let fired = null;
  const watcher = defaultWatcherFactory(plansPath, (eventType) => { fired = eventType; });
  assert.ok(watcher, '应返回 watcher');
  assert.strictEqual(typeof watcher.close, 'function');
  // 触发文件变更 → 回调收到事件
  await new Promise((resolve) => {
    fs.promises.writeFile(plansPath, '[1]').then(() => setTimeout(resolve, 80));
  });
  assert.ok(fired !== null, '文件变更应触发回调');
  watcher.close();
  await fs.promises.rm(dir, { recursive: true, force: true });
});

test('defaultNotifierFactory window 存在时 send 委托 webContents', () => {
  let sent = null;
  const window = { webContents: { send: (ch, payload) => { sent = { ch, payload }; } } };
  const notifier = defaultNotifierFactory(window);
  notifier.send('CHANNEL', { a: 1 });
  assert.deepStrictEqual(sent, { ch: 'CHANNEL', payload: { a: 1 } });
});

test('defaultNotifierFactory 无 window 时不抛', () => {
  const notifier = defaultNotifierFactory(null);
  assert.doesNotThrow(() => notifier.send('CHANNEL', {}));
});

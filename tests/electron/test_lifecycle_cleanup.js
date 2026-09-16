// R26 候选⑤ LifecycleCleanup 独立单测 (自 ElectronApp 拆出的退出清理链)
//
// 锁定: 声明式注册 / 单步失败不阻断 / 两阶段 (before-quit / will-quit) 独立执行。
// P3-3 语义 (单一 before-quit 监听 + 服务全清理) 由 test_electron_app.js 集成覆盖。

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const { LifecycleCleanup } = require(
  path.join(__dirname, '..', '..', 'electron', 'src', 'main', 'lifecycle', 'LifecycleCleanup.js')
);

test('onBeforeQuit/runBeforeQuit: 按注册序执行', () => {
  const c = new LifecycleCleanup();
  const order = [];
  c.onBeforeQuit('a', () => order.push('a'));
  c.onBeforeQuit('b', () => order.push('b'));
  c.runBeforeQuit();
  assert.deepStrictEqual(order, ['a', 'b']);
});

test('单步抛错不阻断后续清理 (console.error 可观测)', () => {
  const c = new LifecycleCleanup();
  const errs = [];
  const orig = console.error;
  console.error = (...a) => errs.push(a.join(' '));
  try {
    c.onBeforeQuit('boom', () => {
      throw new Error('boom');
    });
    c.onBeforeQuit('after', () => errs.push('after-ran'));
    c.runBeforeQuit();
  } finally {
    console.error = orig;
  }
  assert.ok(
    errs.some((e) => e.includes('boom') && e.includes('failed')),
    '错误应带步骤名'
  );
  assert.ok(errs.includes('after-ran'), '后续步骤应继续执行');
});

test('before-quit 与 will-quit 两阶段独立 (互不触发)', () => {
  const c = new LifecycleCleanup();
  const ran = [];
  c.onBeforeQuit('bq', () => ran.push('bq'));
  c.onWillQuit('wq', () => ran.push('wq'));
  c.runBeforeQuit();
  assert.deepStrictEqual(ran, ['bq'], 'runBeforeQuit 不应触发 will-quit 步');
  c.runWillQuit();
  assert.deepStrictEqual(ran, ['bq', 'wq']);
});

test('registerStandardChain: 标准链覆盖全部持有子进程/会话的 service + 防睡眠锁', () => {
  const c = new LifecycleCleanup();
  const destroyed = [];
  const fakeWindow = { isDestroyed: () => false, destroy: () => destroyed.push('allureWindow') };
  c.registerStandardChain({
    getAllureWindow: () => fakeWindow,
    clearAllureWindow: () => {},
    services: {
      schedulerService: { destroy: () => destroyed.push('scheduler') },
      scrcpyService: { stopScrcpy: () => destroyed.push('scrcpy') },
      pythonTestService: { stop: () => destroyed.push('python') },
      inspectorService: { dispose: () => destroyed.push('inspector') },
      allureService: {
        cleanupSync: () => destroyed.push('allureCleanup'),
        logger: { close: () => destroyed.push('allureLogger') },
      },
    },
  });
  // powerHandlers 惰性 require — 测试环境 powerSaveBlocker 未启动时 stop 幂等
  c.runBeforeQuit();
  c.runWillQuit();
  assert.ok(destroyed.includes('allureWindow'));
  assert.ok(destroyed.includes('scheduler'));
  assert.ok(destroyed.includes('scrcpy'));
  assert.ok(destroyed.includes('python'));
  assert.ok(destroyed.includes('inspector'));
  assert.ok(destroyed.includes('allureCleanup'));
  assert.ok(destroyed.includes('allureLogger'));
});

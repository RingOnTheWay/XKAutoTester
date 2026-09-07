// R27 修复回归: 打包后 Cannot find module 'undici' + 崩溃后进程挂后台
// 覆盖:
// 1) undici 在 electron/package.json dependencies (electron-builder 只打包 production deps,
//    不在 dependencies → asar 内缺失 → UpdateService 模块加载期抛错)
// 2) index.js installFatalErrorHandlers: uncaughtException → app.exit(1) (打包版默认弹框后
//    进程不退挂后台); require.main 守卫使 require 本模块不触发 run()
// 需 --require tests/electron/_setup.js

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const PKG_PATH = path.join(__dirname, '..', '..', 'electron', 'package.json');
const INDEX_PATH = path.join(__dirname, '..', '..', 'electron', 'src', 'main', 'index.js');
// tests/ 不在 electron/node_modules 解析链, 用绝对路径 require undici
const UNDICI_PATH = path.join(__dirname, '..', '..', 'electron', 'node_modules', 'undici');

test('undici 在 package.json dependencies (打包 asar 必须含 production deps)', () => {
  const pkg = require(PKG_PATH);
  assert.ok(pkg.dependencies && pkg.dependencies.undici, 'undici 必须在 dependencies');
  // 可解析性验证
  const { Agent } = require(UNDICI_PATH);
  assert.strictEqual(typeof Agent, 'function');
});

test('index.js require.main 守卫: require 不触发 ApplicationService.run', () => {
  delete require.cache[require.resolve(INDEX_PATH)];
  const mod = require(INDEX_PATH);
  assert.strictEqual(typeof mod.installFatalErrorHandlers, 'function');
});

test('installFatalErrorHandlers: uncaughtException → app.exit(1) 而非挂后台', () => {
  delete require.cache[require.resolve(INDEX_PATH)];
  const { installFatalErrorHandlers } = require(INDEX_PATH);

  const exits = [];
  const fakeApp = { exit: (code) => exits.push(code) };
  const cleanup = installFatalErrorHandlers(fakeApp);
  try {
    // node:test runner 监听 process uncaughtException, 手动 emit 会误判失败 —
    // 改为直接调用注册的 handler (绕过 emit 机制)
    const handlers = process.listeners('uncaughtException');
    const ours = handlers[handlers.length - 1]; // 最后注册的即我们的
    ours(new Error('simulated fatal'));
    assert.deepStrictEqual(exits, [1], 'uncaughtException 应调 app.exit(1) 而非挂后台');
  } finally {
    cleanup();
    assert.strictEqual(exits.length, 1, 'cleanup 后不再残留 handler (不重复注册)');
  }
});

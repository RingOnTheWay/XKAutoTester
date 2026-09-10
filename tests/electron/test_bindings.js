// core/utils/bindings.js 单元测试 — controller 生命周期绑定薄工厂
// 覆盖:
// - push 注册解绑函数 (兼容原数组调用形态)
// - listen DOM 事件自动配对解绑 (addEventListener/removeEventListener)
// - run 执行全部并清空 (幂等, 二次 run 无副作用)
// - 单个解绑回调异常不阻断其余清理

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const { JSDOM } = require(path.join(__dirname, '..', '..', 'electron', 'node_modules', 'jsdom'));

let dom;
const savedGlobals = {};

function setupJsdm() {
  dom = new JSDOM('<!DOCTYPE html><html><body><button id="btn"></button></body></html>', {
    url: 'http://localhost',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  for (const k of ['document', 'window', 'navigator', 'HTMLElement', 'Event']) {
    savedGlobals[k] = global[k];
    global[k] = window[k];
  }
}

function teardownJsdm() {
  for (const k of Object.keys(savedGlobals)) {
    if (savedGlobals[k] === undefined) delete global[k];
    else global[k] = savedGlobals[k];
  }
  if (dom) dom.window.close();
  dom = null;
}

describe('createBindings (controller 生命周期薄工厂)', () => {
  beforeEach(() => {
    if (!dom) setupJsdm();
  });
  teardownJsdm;

  test('push 注册 + run 执行并清空 (幂等)', async () => {
    const { createBindings } = await import('../../electron/renderer/core/utils/bindings.js');
    const b = createBindings();
    const calls = [];
    b.push(() => calls.push(1));
    b.push(() => calls.push(2));
    b.run();
    assert.deepStrictEqual(calls, [1, 2]);
    b.run(); // 二次 run 无副作用
    assert.deepStrictEqual(calls, [1, 2]);
  });

  test('listen DOM 事件: 绑定后触发, run 后不再触发', async () => {
    const { createBindings } = await import('../../electron/renderer/core/utils/bindings.js');
    const b = createBindings();
    const btn = document.getElementById('btn');
    let count = 0;
    b.listen(btn, 'click', () => count++);
    btn.click();
    btn.click();
    assert.strictEqual(count, 2, 'run 前事件正常触发');
    b.run();
    btn.click();
    assert.strictEqual(count, 2, 'run 后解绑, 不再触发');
  });

  test('单个解绑回调异常不阻断其余清理', async () => {
    const { createBindings } = await import('../../electron/renderer/core/utils/bindings.js');
    const b = createBindings();
    const calls = [];
    b.push(() => {
      throw new Error('boom');
    });
    b.push(() => calls.push('ok'));
    b.run();
    assert.deepStrictEqual(calls, ['ok'], '异常回调后其余仍执行');
  });

  test('push 返回原函数 (链式传递形态兼容)', async () => {
    const { createBindings } = await import('../../electron/renderer/core/utils/bindings.js');
    const b = createBindings();
    const fn = () => {};
    assert.strictEqual(b.push(fn), fn);
  });
});

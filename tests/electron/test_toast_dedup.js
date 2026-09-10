// ADR-0011 通知去重 (Toast 文本即 key) 单元测试
// 回归覆盖:
// - 同文本同类型连发 → 复用单条 toast (双 toast 根治)
// - 异文本 / 同文本异类型 → 各自独立 toast
// - 复用后计时重置 (不为旧计时误杀)
// - toast 移除后 key 索引清理 (不移复用 ghost)
// - clearAll 清空 key 索引
// 使用 jsdom 模拟 DOM, 短 duration 真实计时。

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const { JSDOM } = require(path.join(__dirname, '..', '..', 'electron', 'node_modules', 'jsdom'));

let dom;
const savedGlobals = {};

function setupJsdm() {
  dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>', {
    url: 'http://localhost',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  for (const k of ['document', 'window', 'navigator', 'HTMLElement', 'Event', 'Node', 'Element']) {
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

async function loadToastManager() {
  const mod = await import('../../electron/renderer/components/toast.js');
  return mod.ToastManager;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('ADR-0011 Toast 通知去重 (文本即 key)', () => {
  before(setupJsdm);
  after(teardownJsdm);
  beforeEach(() => {
    // 隔离: 清空共享 DOM (toast-container 挂在 #app 下)
    const app = document.getElementById('app');
    if (app) app.innerHTML = '';
  });

  test('同文本同类型连发两次 → 只显示一条', async () => {
    const ToastManager = await loadToastManager();
    const tm = new ToastManager();
    const t1 = tm.error('导出失败');
    const t2 = tm.error('导出失败');
    assert.strictEqual(t1, t2, '同文本同类型应复用同一 toast 元素');
    const container = document.getElementById('toast-container');
    assert.strictEqual(container.children.length, 1, '容器内应只有 1 条 toast');
  });

  test('异文本 → 两条独立 toast 共存', async () => {
    const ToastManager = await loadToastManager();
    const tm = new ToastManager();
    tm.error('错误A');
    tm.error('错误B');
    const container = document.getElementById('toast-container');
    assert.strictEqual(container.children.length, 2, '异文本不应合并');
  });

  test('同文本不同类型 → 独立 toast (key 含 type)', async () => {
    const ToastManager = await loadToastManager();
    const tm = new ToastManager();
    tm.info('消息');
    tm.error('消息');
    const container = document.getElementById('toast-container');
    assert.strictEqual(container.children.length, 2, '同文本异类型不应合并');
  });

  test('复用后计时重置: 复用时刷新计时, 不被旧计时误杀', async () => {
    const ToastManager = await loadToastManager();
    const tm = new ToastManager();
    tm.show('进行中', 'info', { duration: 100 });
    await sleep(60); // 距首次 show 已过 60ms (若未重置, 剩 40ms)
    tm.show('进行中', 'info', { duration: 200 }); // 复用 + 重置为 200ms
    await sleep(120); // 距复用 120ms, 距首次 180ms (若未重置早该消失)
    const container = document.getElementById('toast-container');
    assert.strictEqual(container.children.length, 1, '复用后应按新计时存活');
    await sleep(500); // 超过复用后的 200ms + fade-out 300ms → 完全移除
    assert.strictEqual(container.children.length, 0, '到期后应移除');
  });

  test('toast 移除后 key 索引清理: 再次 show 同文本走新建', async () => {
    const ToastManager = await loadToastManager();
    const tm = new ToastManager();
    const first = tm.show('同一条', 'info', { duration: 80 });
    await sleep(80 + 400); // duration + fade-out 300ms 缓冲
    const container = document.getElementById('toast-container');
    assert.strictEqual(container.children.length, 0, '原 toast 应已完全移除');
    const second = tm.show('同一条', 'info');
    assert.notStrictEqual(first, second, '移除后同文本应新建, 不复用 ghost');
  });

  test('clearAll 清空 key 索引: 之后同文本走新建', async () => {
    const ToastManager = await loadToastManager();
    const tm = new ToastManager();
    const first = tm.success('完成');
    tm.clearAll();
    const second = tm.show('完成', 'success');
    assert.notStrictEqual(first, second, 'clearAll 后同文本应新建');
    const container = document.getElementById('toast-container');
    assert.strictEqual(container.children.length, 1);
  });
});

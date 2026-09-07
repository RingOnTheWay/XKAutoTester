// core/utils/confirmModal.js 单元测试 (R24 P1-6 confirm 收敛)
// 回归覆盖:
// - 确认/取消/遮罩/Esc 均 resolve 且关闭弹窗 (Esc 此前只 resolve 不 close → DOM 残留)
// - 单弹窗串行化: 前一次未关闭时再次调用, 旧 Promise resolve(false), 防监听器泄漏 + 永久挂起
// 需用 --require tests/electron/_setup.js 预加载 electron mock; 使用 jsdom 模拟 DOM。

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const { JSDOM } = require(path.join(__dirname, '..', '..', 'electron', 'node_modules', 'jsdom'));

const CONFIRM_HTML = `<!DOCTYPE html><html><body>
  <div id="confirm-modal-overlay">
    <h2 id="confirm-modal-title"></h2>
    <p id="confirm-modal-message"></p>
    <button id="confirm-modal-confirm-btn">确认</button>
    <button id="confirm-modal-cancel-btn">取消</button>
  </div>
</body></html>`;

let dom;
const savedGlobals = {};
let modalOpenCalls = 0;
let modalCloseCalls = 0;

function setupJsdm() {
  dom = new JSDOM(CONFIRM_HTML, { pretendToBeVisual: true });
  const { window } = dom;
  for (const k of ['document', 'window', 'navigator']) {
    savedGlobals[k] = global[k];
    global[k] = window[k];
  }
  modalOpenCalls = 0;
  modalCloseCalls = 0;
  global.window.__XKAT_MODALS__ = {
    confirm: {
      open: () => { modalOpenCalls++; },
      close: () => { modalCloseCalls++; },
    },
  };
  global.window.i18n = { t: (k) => k };
}

function teardownJsdm() {
  for (const k of Object.keys(savedGlobals)) {
    if (savedGlobals[k] === undefined) delete global[k];
    else global[k] = savedGlobals[k];
  }
  if (dom) dom.window.close();
  dom = null;
}

async function loadConfirmModal() {
  const mod = await import('../../electron/renderer/core/utils/confirmModal.js');
  return mod;
}

describe('R24 P1-6 confirmModal 单弹窗行为', () => {
  before(setupJsdm);
  after(teardownJsdm);

  test('确认按钮 → resolve(true) + close + 全局回调清理', async () => {
    const { showConfirmModal } = await loadConfirmModal();
    const p = showConfirmModal('t', 'm');
    assert.strictEqual(modalOpenCalls, 1);
    document.getElementById('confirm-modal-confirm-btn').click();
    assert.strictEqual(await p, true);
    assert.strictEqual(modalCloseCalls, 1);
    assert.strictEqual(global.window.__XKAT_CONFIRM_CALLBACK__, null);
  });

  test('取消按钮 → resolve(false)', async () => {
    const { showConfirmModal } = await loadConfirmModal();
    const p = showConfirmModal('t', 'm');
    document.getElementById('confirm-modal-cancel-btn').click();
    assert.strictEqual(await p, false);
  });

  test('遮罩点击 → resolve(false)', async () => {
    const { showConfirmModal } = await loadConfirmModal();
    const p = showConfirmModal('t', 'm');
    document.getElementById('confirm-modal-overlay').click();
    assert.strictEqual(await p, false);
  });

  test('R24 P1-6 Esc → resolve(false) + 弹窗关闭 (回归: 此前只 resolve 不 close → DOM 残留)', async () => {
    const { showConfirmModal } = await loadConfirmModal();
    const p = showConfirmModal('t', 'm');
    const closeBefore = modalCloseCalls;
    const evt = new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    document.dispatchEvent(evt);
    assert.strictEqual(await p, false);
    assert.strictEqual(modalCloseCalls, closeBefore + 1, 'Esc 必须关闭弹窗');
  });

  test('R24 P1-6 串行化: 前一次未关闭再次调用 → 旧 Promise resolve(false) 不挂起', async () => {
    const { showConfirmModal } = await loadConfirmModal();
    const first = showConfirmModal('first', 'm1');
    // 第二次调用时第一个弹窗尚未关闭 → first 立即被顶替 resolve(false)
    const second = showConfirmModal('second', 'm2');
    assert.strictEqual(await first, false, '前一次弹窗被新调用顶替时 resolve(false)');
    // second 仍待决, 交互正常
    document.getElementById('confirm-modal-confirm-btn').click();
    assert.strictEqual(await second, true);
  });
});

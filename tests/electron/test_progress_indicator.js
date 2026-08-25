// ProgressIndicator 定时器回收单元测试
// 回归: hide() 在 100% 倒计时期间被调用时必须清空 countdownUpdateTimer / downloadProgressTimer，
// 避免隐藏后 interval/timeout 残留持续回调。
// 需用 --require tests/electron/_setup.js 预加载 electron mock

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const { JSDOM } = require(path.join(__dirname, '..', '..', 'electron', 'node_modules', 'jsdom'));

const HTML = `<!DOCTYPE html><html><body>
  <div id="download-progress-container"></div>
  <div id="download-progress-bar"></div>
  <div id="download-percentage"></div>
  <div id="download-filename"></div>
  <div id="download-file-count"></div>
  <div id="download-countdown"></div>
  <div id="download-error" class="hidden"></div>
  <div id="download-error-message"></div>
  <div id="download-error-tooltip"></div>
  <button id="download-progress-close"></button>
</body></html>`;

let dom;
let savedGlobals = {};
const timers = { scheduled: 0, clearedInterval: 0, clearedTimeout: 0 };

function setupJsdm() {
  dom = new JSDOM(HTML, { pretendToBeVisual: true });
  const { window } = dom;
  savedGlobals.document = global.document;
  savedGlobals.window = global.window;
  savedGlobals.setInterval = global.setInterval;
  savedGlobals.setTimeout = global.setTimeout;
  savedGlobals.clearInterval = global.clearInterval;
  savedGlobals.clearTimeout = global.clearTimeout;

  global.document = window.document;
  global.window = window;
  global.window.i18n = { t: (k) => k };

  // 桩桩定时器：记录 set 次数、返回假 id，拦截真实调度；清空时计数
  global.setInterval = () => { timers.scheduled += 1; return 777; };
  global.setTimeout = () => { timers.scheduled += 1; return 888; };
  global.clearInterval = () => { timers.clearedInterval += 1; };
  global.clearTimeout = () => { timers.clearedTimeout += 1; };
}

function teardownJsdm() {
  Object.keys(savedGlobals).forEach(k => {
    if (savedGlobals[k] === undefined) delete global[k];
    else global[k] = savedGlobals[k];
  });
  savedGlobals = {};
  dom = null;
}

let IndicatorClass;
async function loadIndicator() {
  if (!IndicatorClass) {
    const mod = await import('../../electron/renderer/components/progress-indicator.js');
    IndicatorClass = mod.ProgressIndicator;
  }
  return IndicatorClass;
}

describe('ProgressIndicator 定时器回收', () => {
  before(async () => {
    setupJsdm();
    await loadIndicator();
  });
  after(teardownJsdm);

  beforeEach(() => {
    timers.scheduled = 0;
    timers.clearedInterval = 0;
    timers.clearedTimeout = 0;
  });

  test('100% 阶段应启动倒计时 interval + 兜底 timeout', () => {
    const pi = new IndicatorClass();
    pi.totalFiles = 1;
    pi.show('', 'download');
    pi.update({ percentage: 100 });

    assert.strictEqual(pi.countdownUpdateTimer, 777, 'countdown interval 应已记录（桩 id 777）');
    assert.strictEqual(pi.downloadProgressTimer, 888, '兜底 timeout 应已记录（桩 id 888）');
    assert.strictEqual(timers.scheduled, 2, '应恰好调度 2 个定时器（interval + timeout）');
  });

  test('倒计时期间 hide() 应清空 interval 与 timeout', () => {
    const pi = new IndicatorClass();
    pi.totalFiles = 1;
    pi.update({ percentage: 100 });
    assert.ok(pi.countdownUpdateTimer && pi.downloadProgressTimer, '前置：倒计时定时器已启动');

    pi.hide();

    assert.strictEqual(pi.countdownUpdateTimer, null, 'hide() 后 countdown interval 应清空');
    assert.strictEqual(pi.downloadProgressTimer, null, 'hide() 后兜底 timeout 应清空');
    assert.strictEqual(timers.clearedInterval, 1, '应 clear 1 个 interval');
    assert.strictEqual(timers.clearedTimeout, 1, '应 clear 1 个 timeout');
  });

  test('未启动定时器时 hide() 幂等且无副作用', () => {
    const pi = new IndicatorClass();
    pi.totalFiles = 1;
    pi.update({ percentage: 50 });

    assert.strictEqual(pi.countdownUpdateTimer, null, '非 100% 不应启动倒计时 interval');
    assert.strictEqual(pi.downloadProgressTimer, null, '非 100% 不应启动兜底 timeout');

    pi.hide();
    assert.strictEqual(pi.countdownUpdateTimer, null);
    assert.strictEqual(pi.downloadProgressTimer, null);
  });
});
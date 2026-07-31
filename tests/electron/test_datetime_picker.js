// DateTimePicker 单元测试
// 覆盖 4 行为: parseDateTimeString 静态方法 + constructor 绑定 + show 显示 + hide 隐藏
// 需用 --require tests/electron/_setup.js 预加载 electron mock

const { test, describe, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const { JSDOM } = require(path.join(__dirname, '..', '..', 'electron', 'node_modules', 'jsdom'));

// ── jsdom 环境 ─────────────────────────────────────────────
let savedGlobals = {};
let dom;

function setupJsdom() {
  dom = new JSDOM('<!DOCTYPE html><html><body><div id="mount"></div></body></html>', {
    url: 'http://localhost/',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  savedGlobals.document = global.document;
  savedGlobals.window = global.window;
  savedGlobals.HTMLElement = global.HTMLElement;

  global.document = window.document;
  global.window = window;
  global.HTMLElement = window.HTMLElement;
  // datetime-picker 内部调用 window.i18n.t (i18n)
  global.window.i18n = { t: (k) => k };
  global.i18n = global.window.i18n;
  if (!window.HTMLElement.prototype.getBoundingClientRect) {
    window.HTMLElement.prototype.getBoundingClientRect = () => ({
      width: 200, height: 30, top: 100, bottom: 130, left: 10, right: 210,
    });
  }
}

function teardownJsdm() {
  Object.keys(savedGlobals).forEach(k => {
    if (savedGlobals[k] === undefined) delete global[k];
    else global[k] = savedGlobals[k];
  });
  savedGlobals = {};
  dom = null;
}

// 清理全局 overlay (createOverlay 用 document.getElementById 复用,测试间需清理避免状态泄漏)
function cleanupOverlay() {
  const existing = document.getElementById('datetime-picker-overlay');
  if (existing) existing.remove();
}

let PickerClass;
async function loadPicker() {
  if (!PickerClass) {
    const mod = await import('../../electron/renderer/components/datetime-picker.js');
    PickerClass = mod.DateTimePicker;
  }
  return PickerClass;
}

// ── 测试用例 ────────────────────────────────────────────────

describe('DateTimePicker.parseDateTimeString 静态方法', () => {
  before(async () => {
    await loadPicker();
  });

  test('有效完整格式 "2026-07-24 15:30" 应正确解析', () => {
    const r = PickerClass.parseDateTimeString('2026-07-24 15:30');
    assert.deepStrictEqual(r, { year: 2026, month: 7, day: 24, hour: 15, minute: 30 });
  });

  test('单位数月日时分 "2026-7-5 9:5" 应正确解析', () => {
    const r = PickerClass.parseDateTimeString('2026-7-5 9:5');
    assert.deepStrictEqual(r, { year: 2026, month: 7, day: 5, hour: 9, minute: 5 });
  });

  test('边界值 "2026-12-31 23:59" 应正确解析', () => {
    const r = PickerClass.parseDateTimeString('2026-12-31 23:59');
    assert.deepStrictEqual(r, { year: 2026, month: 12, day: 31, hour: 23, minute: 59 });
  });

  test('空字符串应返回 null', () => {
    assert.strictEqual(PickerClass.parseDateTimeString(''), null);
  });

  test('null 应返回 null', () => {
    assert.strictEqual(PickerClass.parseDateTimeString(null), null);
  });

  test('undefined 应返回 null', () => {
    assert.strictEqual(PickerClass.parseDateTimeString(undefined), null);
  });

  test('纯文本 "invalid" 应返回 null', () => {
    assert.strictEqual(PickerClass.parseDateTimeString('invalid'), null);
  });

  test('斜杠分隔符 "2026/07/24 15:30" 应返回 null (仅支持 -)', () => {
    assert.strictEqual(PickerClass.parseDateTimeString('2026/07/24 15:30'), null);
  });

  test('缺时间部分 "2026-07-24" 应返回 null', () => {
    assert.strictEqual(PickerClass.parseDateTimeString('2026-07-24'), null);
  });

  test('缺日期部分 "15:30" 应返回 null', () => {
    assert.strictEqual(PickerClass.parseDateTimeString('15:30'), null);
  });

  test('越界月 "2026-13-01 00:00" 应仍解析 (regex 不验证范围)', () => {
    const r = PickerClass.parseDateTimeString('2026-13-01 00:00');
    assert.deepStrictEqual(r, { year: 2026, month: 13, day: 1, hour: 0, minute: 0 });
  });

  test('越界时 "2026-07-24 25:30" 应仍解析 (regex 不验证范围)', () => {
    const r = PickerClass.parseDateTimeString('2026-07-24 25:30');
    assert.deepStrictEqual(r, { year: 2026, month: 7, day: 24, hour: 25, minute: 30 });
  });
});

describe('DateTimePicker constructor 绑定', () => {
  before(async () => {
    setupJsdom();
    await loadPicker();
  });
  after(teardownJsdm);

  test('无 inputElement 应早返回,不抛错', () => {
    assert.doesNotThrow(() => new PickerClass(null));
    assert.doesNotThrow(() => new PickerClass(undefined));
  });

  test('正常 input 应设 readonly + dataset.pickerInitialized', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    new PickerClass(input);
    assert.strictEqual(input.getAttribute('readonly'), 'true');
    assert.strictEqual(input.dataset.pickerInitialized, 'true');
  });

  test('重复绑定同一 input 应早返回 (dataset 已设)', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    const p1 = new PickerClass(input);
    const p2 = new PickerClass(input);
    // 第二次构造应早返回,p2 不应重新绑定 (p1 与 p2 不同实例但 input 状态一致)
    assert.ok(p1);
    assert.ok(p2);
    // readonly 不应被重复设置 (仍为 'true')
    assert.strictEqual(input.getAttribute('readonly'), 'true');
  });

  test('options.mountContainer 应指定挂载点', () => {
    const input = document.createElement('input');
    const mount = document.createElement('div');
    document.body.appendChild(input);
    document.body.appendChild(mount);
    assert.doesNotThrow(() => new PickerClass(input, { mountContainer: mount }));
  });
});

describe('DateTimePicker show 显示', () => {
  before(async () => {
    setupJsdom();
    await loadPicker();
  });
  after(teardownJsdm);
  afterEach(cleanupOverlay);

  test('无 inputElement 应早返回,不创建 overlay', () => {
    const p = new PickerClass(null);
    assert.doesNotThrow(() => p.show());
  });

  test('正常 show 应创建 overlay 并移除 hidden class', () => {
    const input = document.createElement('input');
    const mount = document.createElement('div');
    document.body.appendChild(input);
    document.body.appendChild(mount);
    const p = new PickerClass(input, { mountContainer: mount });
    p.show();
    // overlay 应挂载到 mountContainer
    const overlay = mount.querySelector('.datetime-picker-overlay');
    assert.ok(overlay, 'overlay 应被创建并挂载');
    assert.ok(!overlay.classList.contains('hidden'), 'overlay 应移除 hidden class');
  });

  test('input 有值时应解析已有值 (不抛错)', () => {
    const input = document.createElement('input');
    input.value = '2026-07-24 15:30';
    const mount = document.createElement('div');
    document.body.appendChild(input);
    document.body.appendChild(mount);
    const p = new PickerClass(input, { mountContainer: mount });
    assert.doesNotThrow(() => p.show());
    const overlay = mount.querySelector('.datetime-picker-overlay');
    assert.ok(overlay);
  });

  test('input 无值时应使用当前时间 (不抛错)', () => {
    const input = document.createElement('input');
    const mount = document.createElement('div');
    document.body.appendChild(input);
    document.body.appendChild(mount);
    const p = new PickerClass(input, { mountContainer: mount });
    assert.doesNotThrow(() => p.show());
  });

  test('重复 show 应创建新 overlay (旧 overlay 被替换或保留)', () => {
    const input = document.createElement('input');
    const mount = document.createElement('div');
    document.body.appendChild(input);
    document.body.appendChild(mount);
    const p = new PickerClass(input, { mountContainer: mount });
    p.show();
    p.show();
    // 不抛错即通过 (实现可能复用或重建)
    const overlays = mount.querySelectorAll('.datetime-picker-overlay');
    assert.ok(overlays.length >= 1);
  });
});

describe('DateTimePicker hide 隐藏', () => {
  before(async () => {
    setupJsdom();
    await loadPicker();
  });
  after(teardownJsdm);
  afterEach(cleanupOverlay);

  test('无 overlay 时 hide 应无操作 (不抛错)', () => {
    const p = new PickerClass(null);
    assert.doesNotThrow(() => p.hide());
  });

  test('show 后 hide 应给 overlay 加 hidden class', () => {
    const input = document.createElement('input');
    const mount = document.createElement('div');
    document.body.appendChild(input);
    document.body.appendChild(mount);
    const p = new PickerClass(input, { mountContainer: mount });
    p.show();
    const overlay = mount.querySelector('.datetime-picker-overlay');
    assert.ok(!overlay.classList.contains('hidden'), 'show 后应无 hidden');
    p.hide();
    assert.ok(overlay.classList.contains('hidden'), 'hide 后应加 hidden class');
  });
});

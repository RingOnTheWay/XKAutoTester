// R26 候选④ MVC 事件契约静态测试
//
// 背景/controller 事件订阅此前是裸字符串散落, 改名/拼错靠全局搜索碰运气
// (运行时静默失联)。本测试静态锁定: 每个 tab controller 订阅的事件名,
// 必须以字面量出现在该 tab 的 model 源码内 (emit / set 第三参 / 门面转发表)。
// 拼写漂移 → 测试期红, 而非运行时静默丢事件。
//
// 'error' 为全局 ADR-0011 契约事件 (BaseModel.emitError), 免查。

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const TABS_DIR = path.join(__dirname, '..', '..', 'electron', 'renderer', 'tabs');
const TAB_NAMES = ['test-execution', 'test-case', 'page-package', 'android-connection', 'settings'];
const GLOBAL_EVENTS = new Set(['error']);

function read(p) {
  return fs.readFileSync(p, 'utf8');
}

/** 提取 controller 的事件订阅名 (onModel('x') / #on(model, 'x')) */
function extractSubscriptions(ctrlSrc) {
  const names = new Set();
  const re = /(?:onModel|#on)\(\s*(?:model\s*,\s*)?'([a-z0-9-]+)'/g;
  let m;
  while ((m = re.exec(ctrlSrc))) {
    names.add(m[1]);
  }
  return names;
}

/** model 源码内出现的全部 kebab-case 字符量 (emit/转发面) */
function extractEmittedLiterals(modelSrc) {
  const names = new Set();
  const re = /'([a-z][a-z0-9-]+)'/g;
  let m;
  while ((m = re.exec(modelSrc))) {
    names.add(m[1]);
  }
  return names;
}

test('MVC 事件契约: controller 订阅的事件必须存在于对应 model 发射面', () => {
  for (const tab of TAB_NAMES) {
    const ctrlSrc = read(path.join(TABS_DIR, tab, 'controller.js'));
    // settings 已拆分: 门面 model.js + models/ 子模型, 全量拼入
    const modelPaths = [path.join(TABS_DIR, tab, 'model.js')];
    const modelsDir = path.join(TABS_DIR, tab, 'models');
    if (fs.existsSync(modelsDir)) {
      for (const f of fs.readdirSync(modelsDir)) {
        if (f.endsWith('.js')) modelPaths.push(path.join(modelsDir, f));
      }
    }
    const modelSrc = modelPaths.map(read).join('\n');

    const subscriptions = extractSubscriptions(ctrlSrc);
    const emitted = extractEmittedLiterals(modelSrc);

    for (const name of subscriptions) {
      if (GLOBAL_EVENTS.has(name)) continue;
      assert.ok(
        emitted.has(name),
        `[${tab}] controller 订阅 '${name}' 但 model 源面无此字面量 — 拼写漂移或 model 未发射`
      );
    }
  }
});

test('MVC 事件契约: controller 无 view→model 反向依赖 (import 检查)', () => {
  // R26 候选④: view 不得 import 同 tab model (MVC 方向: model → controller → view)
  for (const tab of TAB_NAMES) {
    const viewPath = path.join(TABS_DIR, tab, 'view.js');
    const src = read(viewPath);
    assert.ok(
      !/from\s+'\.\/model(\.js)?'/.test(src) && !/from\s+'\.\/models\//.test(src),
      `[${tab}] view.js 不得 import model (MVC 方向违规)`
    );
  }
});

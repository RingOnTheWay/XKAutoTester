// test-case TestCaseController unbinds 无界增长回归 (R25 P2-8)
// 回归覆盖:
// - bindStepCardEvents 重复调用: 拖拽监听 unbind 进入 stepCardUnbinds (随 renderSteps 每次
//   重渲染前被 unbindStepCardEvents 清理), 不再 push 到 this.unbinds (无界增长根源)
// - unbindStepCardEvents 清理后 stepCardUnbinds 归零
// - bindFileListEvents 重复调用: controller 层只 push 一次 unbind (容器级一次绑定)

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const CONTROLLER_PATH = path.join(
  __dirname, '..', '..', 'electron', 'renderer', 'tabs', 'test-case', 'controller.js'
);

let TestCaseController;

async function loadController() {
  if (!TestCaseController) {
    const mod = await import('file:///' + CONTROLLER_PATH.replace(/\\/g, '/'));
    TestCaseController = mod.TestCaseController;
  }
  return TestCaseController;
}

function makeFakeView() {
  const calls = {
    bindStepDragDrop: 0,
    bindFileListClick: 0,
  };
  return {
    calls,
    getStepCards: () => [],
    bindStepDragDrop: (cb) => {
      calls.bindStepDragDrop++;
      return () => {};
    },
    bindFileListClick: (handler) => {
      calls.bindFileListClick++;
      return () => {};
    },
    updateMoveButtonsState: () => {},
  };
}

test('P2-8 bindStepCardEvents 拖拽 unbind 进 stepCardUnbinds 而非 unbinds', async () => {
  const Controller = await loadController();
  const view = makeFakeView();
  const controller = new Controller({}, view);

  assert.strictEqual(controller.unbinds.length, 0, '初始 unbinds 为空');
  assert.strictEqual(controller.stepCardUnbinds.length, 0, '初始 stepCardUnbinds 为空');

  // 模拟 3 次 renderSteps → bindStepCardEvents
  controller.bindStepCardEvents();
  controller.bindStepCardEvents();
  controller.bindStepCardEvents();

  assert.strictEqual(
    controller.unbinds.length,
    0,
    '拖拽 unbind 不应再进入 unbinds (旧行为每次 render 都 push, 无界增长)'
  );
  assert.strictEqual(controller.stepCardUnbinds.length, 3, '每次 render 的拖拽 unbind 进入 stepCardUnbinds');
  assert.strictEqual(view.calls.bindStepDragDrop, 3, 'bindStepDragDrop 被调用 3 次');
});

test('P2-8 unbindStepCardEvents 清理后 stepCardUnbinds 归零 (旧卡片闭包被释放)', async () => {
  const Controller = await loadController();
  const view = makeFakeView();
  const controller = new Controller({}, view);

  controller.bindStepCardEvents();
  controller.bindStepCardEvents();
  assert.strictEqual(controller.stepCardUnbinds.length, 2);

  // renderSteps 重渲染前会调用 unbindStepCardEvents
  controller.unbindStepCardEvents();
  assert.strictEqual(controller.stepCardUnbinds.length, 0, '上一轮 unbind 全部执行并清空');

  controller.bindStepCardEvents();
  assert.strictEqual(controller.stepCardUnbinds.length, 1, '新一轮只保留当前一轮的 unbind');
});

test('P2-8 bindFileListEvents 重复调用只 push 一次 unbind', async () => {
  const Controller = await loadController();
  const view = makeFakeView();
  const controller = new Controller({}, view);

  // 模拟: 初始化绑定 1 次 + 搜索 loading 重渲染后再次调用 (旧行为每次都 push)
  controller.bindFileListEvents();
  controller.bindFileListEvents();
  controller.bindFileListEvents();

  assert.strictEqual(controller.unbinds.length, 1, '文件列表 unbind 只应 push 一次');
  assert.strictEqual(view.calls.bindFileListClick, 1, 'bindFileListClick 只应调用一次 (view 层 __tcClickBound 同样防重)');
});

// ── P3-12: handleSave 保存中防重入 ─────────────────────────

test('P3-12 handleSave 并发调用只执行一次 saveCase', async () => {
  const Controller = await loadController();
  const view = {
    getStepCards: () => [],
    bindStepDragDrop: () => () => {},
    bindFileListClick: () => () => {},
    updateMoveButtonsState: () => {},
    collectFormInputs: () => ({}),
    collectStepCardsData: () => [],
  };
  // model 是 getter-only, 必须构造时注入
  let saveCalls = 0;
  let resolveSave = null;
  const controller = new Controller(
    {
      get: () => [],
      collectFormData: () => ({}),
      saveCase: async () => {
        saveCalls++;
        return new Promise((r) => { resolveSave = r; });
      },
    },
    view
  );

  // 第一次保存挂起中
  const p1 = controller.handleSave();
  assert.strictEqual(controller.isSaving, true, '保存中 isSaving=true');
  assert.strictEqual(saveCalls, 1);

  // 双击触发第二次 → 守卫拦截
  await controller.handleSave();
  assert.strictEqual(saveCalls, 1, '第二次调用不应重复 saveCase');

  // 完成第一次保存 → 状态复位
  resolveSave({ success: true });
  await p1;
  assert.strictEqual(controller.isSaving, false, '保存完成后 isSaving 复位');
});

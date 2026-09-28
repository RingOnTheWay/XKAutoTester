// ADR-0012 TestExecutionModel 拆分子模型单测
// 覆盖:
// - ExecutionModel 构造注入 fake precheck (跨域契约: files 参数传入, 不触真实 IPC)
// - runTests(testPlan, info) 计划数据参数传入 (不持有计划域状态)
// - TestPlanModel 列表重载同步 currentTestPlan (删除清空/引用更新)
// - ScheduledPlanModel CRUD 后 currentScheduledPlan 清空
// - ReportModel deleteReportRun 双模式源计划名
// - 门面 get(key) 路由 + 子模型事件转发
// 需用 --require tests/electron/_setup.js 预加载 electron mock; 使用 jsdom 模拟 window。

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const { JSDOM } = require(path.join(__dirname, '..', '..', 'electron', 'node_modules', 'jsdom'));

let dom;
const savedGlobals = {};

function setupJsdom() {
  dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { pretendToBeVisual: true });
  const { window } = dom;
  for (const k of ['document', 'window', 'navigator']) {
    savedGlobals[k] = globalThis[k];
    if (k === 'navigator') {
      Object.defineProperty(globalThis, 'navigator', {
        value: window.navigator,
        configurable: true,
        writable: true,
      });
    } else {
      global[k] = window[k];
    }
  }
  global.window.electronAPI = {};
  global.window.i18n = { t: (k) => k };
  global.requestAnimationFrame = window.requestAnimationFrame.bind(window);
  global.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
  savedGlobals.requestAnimationFrame = undefined;
  savedGlobals.cancelAnimationFrame = undefined;
}

function teardownJsdom() {
  for (const k of Object.keys(savedGlobals)) {
    if (savedGlobals[k] === undefined) {
      delete globalThis[k];
    } else if (k === 'navigator') {
      Object.defineProperty(globalThis, 'navigator', {
        value: savedGlobals[k],
        configurable: true,
        writable: true,
      });
    } else {
      global[k] = savedGlobals[k];
    }
  }
  if (dom) dom.window.close();
  dom = null;
}

before(setupJsdom);
after(teardownJsdom);

let facadeCtor, submodelCtors;

async function loadModules() {
  if (!facadeCtor) {
    const facade = await import('../../electron/renderer/tabs/test-execution/model.js');
    facadeCtor = facade.TestExecutionModel;
    const precheck = await import('../../electron/renderer/tabs/test-execution/models/DevicePrecheckModel.js');
    const report = await import('../../electron/renderer/tabs/test-execution/models/ReportModel.js');
    const testPlan = await import('../../electron/renderer/tabs/test-execution/models/TestPlanModel.js');
    const scheduled = await import('../../electron/renderer/tabs/test-execution/models/ScheduledPlanModel.js');
    const execution = await import('../../electron/renderer/tabs/test-execution/models/ExecutionModel.js');
    submodelCtors = {
      DevicePrecheckModel: precheck.DevicePrecheckModel,
      ReportModel: report.ReportModel,
      TestPlanModel: testPlan.TestPlanModel,
      ScheduledPlanModel: scheduled.ScheduledPlanModel,
      ExecutionModel: execution.ExecutionModel,
    };
  }
  return submodelCtors;
}

// fake precheck: 构造注入契约 (Execution → Precheck 单向, files 参数传入)
function fakePrecheck({ android = { valid: true, message: '' }, ble = { valid: true, message: '' } } = {}) {
  const calls = { android: [], ble: [] };
  return {
    calls,
    async checkAndroidDeviceConfig(files) {
      calls.android.push(files);
      return android;
    },
    async checkBlePortConfig(files) {
      calls.ble.push(files);
      return ble;
    },
  };
}

test('ExecutionModel.runTests 注入 fake precheck — files 参数传入, 校验失败即早退', async () => {
  const { ExecutionModel } = await loadModules();
  const precheck = fakePrecheck({ android: { valid: false, message: 'no device' } });
  const api = {
    runPythonTests: async () => {
      throw new Error('should not run');
    },
  };
  const model = new ExecutionModel(api, { precheck });
  model.setSelectedTestFiles(['tests/a_test.py']);
  const warnings = [];
  model.on('run-warning', (e) => warnings.push(e));

  const status = await model.runTests({ name: 'P1', loopCount: 1 }, null);

  assert.strictEqual(status, undefined, '校验早退无结束状态');
  assert.strictEqual(warnings.length, 1);
  assert.strictEqual(warnings[0].message, 'no device');
  assert.deepStrictEqual(precheck.calls.android, [['tests/a_test.py']], 'files 应作参数传入 precheck');
  assert.strictEqual(model.isRunning, false, '早退后 isRunning 复位');
});

test('ExecutionModel.runTests(testPlan, info) 计划数据参数传入 — 不依赖计划域状态', async () => {
  const { ExecutionModel } = await loadModules();
  const precheck = fakePrecheck();
  let runPayload = null;
  const api = {
    runPythonTests: async (config) => {
      runPayload = config;
      return { success: true, testStats: { passed: 1, failed: 0, skipped: 0, broken: 0, total: 1 } };
    },
  };
  const model = new ExecutionModel(api, { precheck });
  const plan = { name: 'ParamPlan', loopCount: 1 };
  model.setSelectedTestFiles([{ path: 'tests/x_test.py' }]);

  const status = await model.runTests(plan, { id: 'sp1', name: 'SP' });

  assert.strictEqual(status, 'completed');
  assert.strictEqual(runPayload.testPlanName, 'ParamPlan', 'plan 数据来自参数而非内部状态');
  assert.strictEqual(model.runningTestPlanName, null, '结束后清空');
});

test('TestPlanModel 列表重载: 选中计划被删 → currentTestPlan 清空; 仍在 → 引用刷新', async () => {
  const { TestPlanModel } = await loadModules();
  const v1 = { id: 'p1', name: 'P1' };
  const api = {
    getTestPlans: async () => ({ data: [v1] }),
  };
  const model = new TestPlanModel(api);
  await model.loadTestPlans();
  model.selectTestPlan(v1);

  // 重载后 p1 被删
  api.getTestPlans = async () => ({ data: [{ id: 'p2', name: 'P2' }] });
  await model.loadTestPlans();
  assert.strictEqual(model.currentTestPlan, null, '计划被删应清空选中');

  // 重新选中后, 重载返回新引用应刷新
  model.selectTestPlan({ id: 'p2', name: 'P2-old' });
  const p2new = { id: 'p2', name: 'P2-new' };
  api.getTestPlans = async () => ({ data: [p2new] });
  await model.loadTestPlans();
  assert.strictEqual(model.currentTestPlan, p2new, '引用应刷新为列表新对象');
});

test('ScheduledPlanModel 删除选中计划 → currentScheduledPlan 清空', async () => {
  const { ScheduledPlanModel } = await loadModules();
  const api = {
    getScheduledPlans: async () => ({ data: [{ id: 's1', name: 'S1' }] }),
    deleteScheduledPlan: async () => ({ success: true }),
  };
  const model = new ScheduledPlanModel(api);
  await model.loadScheduledPlans();
  model.selectScheduledPlan({ id: 's1', name: 'S1' });

  api.getScheduledPlans = async () => ({ data: [] });
  await model.deleteScheduledPlan('s1');

  assert.strictEqual(model.currentScheduledPlan, null);
});

test('ReportModel.deleteReportRun 双模式: testPlan 模式用传入计划名, scheduled 模式用 run.sourcePlanName', async () => {
  const { ReportModel } = await loadModules();
  const deleted = [];
  const api = {
    deleteReportRun: async (planName, identifier) => {
      deleted.push({ planName, identifier });
      return { success: true };
    },
    getTestPlanRuns: async () => ({ runs: [] }),
    getScheduledPlanRuns: async () => ({ success: true, groups: [] }),
  };
  const model = new ReportModel(api);

  // testPlan 模式
  await model.showReportModal({ name: 'TP1' });
  await model.deleteReportRun({ timestamp: 111 }, 'TP1');
  assert.strictEqual(deleted[0].planName, 'TP1');

  // scheduledPlan 模式: 源计划名来自 run.sourcePlanName
  await model.showScheduledReportModal({ id: 'sp1', name: 'SP' });
  await model.deleteReportRun({ timestamp: 222, sourcePlanName: 'TP2' }, undefined);
  assert.strictEqual(deleted[1].planName, 'TP2');
});

test('门面 get(key) 路由到对应子模型', async () => {
  await loadModules();
  const model = new facadeCtor();
  model.testPlanModel.selectTestPlan({ id: 'x' });
  model.scheduledPlanModel.selectScheduledPlan({ id: 's' });
  model.executionModel.setSelectedTestFiles(['f.py']);
  model.reportModel.silentSet('reportMode', 'scheduledPlan');

  assert.deepStrictEqual(model.get('currentTestPlan'), { id: 'x' });
  assert.deepStrictEqual(model.get('currentScheduledPlan'), { id: 's' });
  assert.deepStrictEqual(model.get('selectedTestFiles'), ['f.py']);
  assert.strictEqual(model.get('reportMode'), 'scheduledPlan');
  assert.strictEqual(model.get('isRunning'), false);
});

test('门面事件转发: 子模型 emit → 门面上抛 (词汇不变)', async () => {
  await loadModules();
  const model = new facadeCtor();
  const got = [];
  model.on('currentTestPlan-changed', (plan) => got.push(['plan', plan]));
  model.on('run-complete', (payload) => got.push(['run', payload]));
  model.on('report-opened', () => got.push(['report']));

  model.testPlanModel.selectTestPlan({ id: 'x' });
  model.executionModel.emit('run-complete', { testStatus: 'passed' });
  model.reportModel.emit('report-opened');

  assert.strictEqual(got.length, 3);
  assert.deepStrictEqual(got[0][1], { id: 'x' });
  assert.strictEqual(got[1][1].testStatus, 'passed');
});

test('门面 runTests: 从 TestPlanModel 取计划作参数传入 ExecutionModel', async () => {
  await loadModules();
  const model = new facadeCtor();
  model.testPlanModel.selectTestPlan({ name: 'FPlan', loopCount: 1 });
  model.executionModel._api.runPythonTests = async (config) => {
    assert.strictEqual(config.testPlanName, 'FPlan', '计划名应来自 TestPlanModel 经参数传入');
    return { success: true, testStats: { passed: 1, failed: 0, skipped: 0, broken: 0, total: 1 } };
  };
  // 覆写共享 precheck 公开方法 (前置检查恒过, 不触 IPC)
  model.precheckModel.checkAndroidDeviceConfig = async () => ({ valid: true, message: '' });
  model.precheckModel.checkBlePortConfig = async () => ({ valid: true, message: '' });

  const status = await model.runTests();

  assert.strictEqual(status, 'completed');
});

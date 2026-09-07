// test-execution TestExecutionModel.runTests 防重入守卫 (R25 P2-7)
// 回归覆盖:
// - isRunning=true 期间再次 runTests 被守卫拦截: 不二次调用 runPythonTests + emit run-warning
// - isRunning 在 await 校验 (checkAndroidDeviceConfig/checkBlePortConfig) 前置位: 堵死双击窗口
// - 校验失败路径 isRunning 复位为 false: 不残留运行态 (按钮不误禁用)
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
  // 注意: Node 21+ 的 global.navigator 是只读 getter, 用 defineProperty 覆盖
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
  // model.js 的 _scheduleOutputFlush 调用裸 requestAnimationFrame (非 window.requestAnimationFrame)
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

let TestExecutionModel;

async function loadModel() {
  if (!TestExecutionModel) {
    const mod = await import('../../electron/renderer/tabs/test-execution/model.js');
    TestExecutionModel = mod.TestExecutionModel;
  }
  return TestExecutionModel;
}

function createModel() {
  return new TestExecutionModel();
}

// 可手动结束的 runPythonTests: 让首次 runTests 停在执行循环内且测试可正常收尾
function controllableRunPythonTests(model) {
  let calls = 0;
  let resolveRun = null;
  model._api.runPythonTests = async () => {
    calls++;
    return new Promise((r) => {
      resolveRun = r;
    });
  };
  const finish = () => resolveRun && resolveRun({ success: true, testStats: { passed: 1, failed: 0, skipped: 0, broken: 0, total: 1 } });
  return { getCalls: () => calls, finish };
}

test('P2-7 isRunning 期间再次 runTests 被守卫拦截, 不二次启动 pytest', async () => {
  const Model = await loadModel();
  const model = createModel();
  model._state.currentTestPlan = { name: 'P1', loopCount: 1 };
  const { getCalls, finish } = controllableRunPythonTests(model);
  const warnings = [];
  model.on('run-warning', (e) => warnings.push(e));

  const p1 = model.runTests();
  // 守卫 + 提前置位均在第一个 await (checkAndroidDeviceConfig) 之前同步执行
  assert.strictEqual(model.isRunning, true, '首次调用应同步置位 isRunning (await 校验前置位)');

  const p2 = model.runTests();
  assert.strictEqual(model.isRunning, true, '守卫拦截后 isRunning 保持 true');
  assert.strictEqual(warnings.length, 1, '应 emit run-warning');
  assert.strictEqual(await p2, undefined, '第二次调用应立即返回');

  // 推进微任务让首次 runTests 到达 runPythonTests;
  // 若守卫失效, 第二次调用会再触发一次 → 计数应为 2
  await new Promise((r) => setTimeout(r, 0));
  assert.strictEqual(getCalls(), 1, '全程只应调用一次 runPythonTests');

  // 结束首次 runTests, 避免遗留异步活动
  finish();
  await p1;
  assert.strictEqual(model.isRunning, false, 'runTests 走完后 isRunning 复位');
});

test('P2-7 首次 runPythonTests 被调用时 isRunning 已为 true (窗口已堵死)', async () => {
  const Model = await loadModel();
  const model = createModel();
  model._state.currentTestPlan = { name: 'P1', loopCount: 1 };
  let isRunningWhenRunCalled = null;
  let resolveRun = null;
  model._api.runPythonTests = async () => {
    isRunningWhenRunCalled = model.isRunning;
    return new Promise((r) => {
      resolveRun = r;
    });
  };

  const p1 = model.runTests();
  await new Promise((r) => setTimeout(r, 0));

  assert.strictEqual(isRunningWhenRunCalled, true, 'runPythonTests 被调用时 isRunning 应为 true');

  resolveRun({ success: true, testStats: { passed: 1, failed: 0, skipped: 0, broken: 0, total: 1 } });
  await p1;
});

test('P2-7 设备校验失败时 isRunning 复位为 false', async () => {
  const Model = await loadModel();
  const model = createModel();
  model._state.currentTestPlan = { name: 'P1', loopCount: 1 };
  // 选中测试文件后 checkAndroidDeviceConfig 走 testCaseGet: android 平台但 deviceName 为空 → valid:false
  model._state.selectedTestFiles = [{ name: 'demo_test.py', path: '/x/demo_test.py' }];
  model._api.testCaseGet = async () => ({ data: { platform: 'android', deviceConfig: { deviceName: '' } } });
  let runCalls = 0;
  model._api.runPythonTests = async () => { runCalls++; return { success: true }; };
  const warnings = [];
  model.on('run-warning', (e) => warnings.push(e));

  await model.runTests();

  assert.strictEqual(model.isRunning, false, '校验失败后 isRunning 应复位为 false');
  assert.strictEqual(warnings.length, 1, '应 emit run-warning');
  assert.strictEqual(runCalls, 0, '校验失败不应走到 runPythonTests');
});

test('P2-7 蓝牙端口校验失败时 isRunning 复位为 false', async () => {
  const Model = await loadModel();
  const model = createModel();
  model._state.currentTestPlan = { name: 'P1', loopCount: 1 };
  // android 设备配置通过, 但用例含 ble 步骤且未填端口 → ble 校验失败
  model._state.selectedTestFiles = [{ name: 'ble_test.py', path: '/x/ble_test.py' }];
  model._api.testCaseGet = async () => ({
    data: {
      platform: 'android',
      deviceConfig: { deviceName: 'DEVICE' },
      steps: [{ type: 'ble' }],
      bleDevice: { port: '' },
    },
  });
  const warnings = [];
  model.on('run-warning', (e) => warnings.push(e));

  await model.runTests();

  assert.strictEqual(model.isRunning, false, '蓝牙校验失败后 isRunning 应复位为 false');
  assert.strictEqual(warnings.length, 1, '应 emit run-warning');
});

test('P1-3 字符串条目 (scanTestFiles 返回字符串数组) 不抛 TypeError 不卡死', async () => {
  const Model = await loadModel();
  const model = createModel();
  model._state.currentTestPlan = { name: 'P1', loopCount: 1 };
  // 纯字符串条目: 原 file.name||file.path 得 undefined → endsWith TypeError 逃逸 → isRunning 卡死
  model._state.selectedTestFiles = ['tests/demo_test.py'];
  const requestedNames = [];
  model._api.testCaseGet = async (name) => {
    requestedNames.push(name);
    return { data: { platform: 'android', deviceConfig: { deviceName: 'DEVICE' } } };
  };
  let runCalls = 0;
  model._api.runPythonTests = async () => { runCalls++; return { success: true }; };

  await model.runTests();

  assert.strictEqual(model.isRunning, false, '字符串条目不卡死: isRunning 复位');
  assert.strictEqual(runCalls, 1, '校验通过应执行 runPythonTests');
  assert.strictEqual(requestedNames[0], 'demo_test', '字符串条目应正确解析文件名 (去 .py/路径)');
});

// ── R27: 手动中途停止 (stoppedEarly) 不发聚合通知 (钉钉等平台) ──

function prepareRun(model, loopCount, { keepRunning = true } = {}) {
  model._state.currentTestPlan = { name: 'P1', loopCount };
  model._state.selectedTestFiles = [{ path: 'tests/demo_test.py', name: 'demo_test.py' }];
  const notifyCalls = [];
  // 覆盖实例 sendTestNotification 为 spy (不触真实 IPC)
  model.sendTestNotification = async (info) => {
    notifyCalls.push(info);
  };
  let resolveRun = null;
  model._api.runPythonTests = async () => {
    return new Promise((r) => {
      resolveRun = r;
    });
  };
  const finish = () => {
    const r = resolveRun;
    resolveRun = null;
    r && r({ success: true, testStats: { passed: 1, failed: 0, skipped: 0, broken: 0, total: 1 } });
  };
  return { notifyCalls, finish };
}

test('R27 手动停止 (stoppedEarly) → 不发聚合通知', async () => {
  const Model = await loadModel();
  const model = createModel();
  const { notifyCalls, finish } = prepareRun(model, 3);

  const p = model.runTests();
  // 第一轮完成 → 进入第二轮前模拟用户停止 (isRunning 置 false)
  await new Promise((r) => setTimeout(r, 0));
  finish();
  await new Promise((r) => setTimeout(r, 0));
  model._state.isRunning = false;
  finish();
  await new Promise((r) => setTimeout(r, 0));
  finish(); // 第三轮不会启动 (循环已 break)
  await p;

  assert.strictEqual(notifyCalls.length, 0, 'stoppedEarly 不得发送聚合通知');
});

test('R27 正常跑完 → 发送聚合通知 (基线)', async () => {
  const Model = await loadModel();
  const model = createModel();
  const { notifyCalls, finish } = prepareRun(model, 1);

  const p = model.runTests();
  await new Promise((r) => setTimeout(r, 0));
  finish();
  await p;

  assert.strictEqual(notifyCalls.length, 1, '正常完成应发送聚合通知');
  assert.strictEqual(notifyCalls[0].stoppedEarly, false);
});

// ── R27: 手动暂停结果 (stopped:true) → 提示暂停而非失败, 不输出聚合信息 ──

test('R27 stopped 结果 → 输出手动暂停提示, 不报循环失败, 无聚合/通知', async () => {
  const Model = await loadModel();
  const model = createModel();
  model._state.currentTestPlan = { name: 'P1', loopCount: 1 };
  model._state.selectedTestFiles = [{ path: 'tests/demo_test.py', name: 'demo_test.py' }];
  const outputs = [];
  const notifyCalls = [];
  model.appendOutput = (text) => outputs.push(String(text));
  model.sendTestNotification = async (info) => {
    notifyCalls.push(info);
  };
  let runCalls = 0;
  model._api.runPythonTests = async () => {
    runCalls++;
    return { success: false, stopped: true, testStats: null };
  };

  await model.runTests();

  assert.strictEqual(runCalls, 1, '停止后不应再启动后续循环');
  assert.strictEqual(notifyCalls.length, 0, '手动暂停不发聚合通知');
  const all = outputs.join('\n');
  // i18n mock 返回 key 原文 — 断言 key 而非译文
  assert.ok(all.includes('testManuallyStopped'), `应提示手动停止, 实际: ${all}`);
  assert.ok(!all.includes('loopStopped') && !all.includes('loopFailed'), '不得提示"循环失败"');
  assert.ok(!all.includes('summaryInfo'), '手动暂停不输出聚合信息块');
  assert.strictEqual(model.isRunning, false, 'runTests 结束后 isRunning 复位');
});

// ── R27: 选中定时计划点"开始执行" → runScheduledPlanNow 立即执行 (不改计划状态) ──

test('R27 runScheduledPlanNow 执行绑定测试计划且不调 scheduledTestComplete', async () => {
  const Model = await loadModel();
  const model = createModel();
  const plan = { id: 'sp_1', name: 'SP', testPlans: [{ id: 'tp_1' }, 'tp_2'] };
  const plansData = [
    { id: 'tp_1', name: 'TP1', loopCount: 1, testFiles: [{ path: 'a_test.py' }] },
    { id: 'tp_2', name: 'TP2', loopCount: 1, testFiles: [{ path: 'b_test.py' }] },
  ];
  model._api.getTestPlans = async () => ({ data: plansData });
  let runTestsCalls = 0;
  model.runTests = async () => {
    runTestsCalls++;
  };
  let completeCalls = 0;
  model._api.scheduledTestComplete = async () => {
    completeCalls++;
    return { success: true };
  };
  const outputs = [];
  model.appendOutput = (t) => outputs.push(String(t));
  model.appendError = (t) => outputs.push(String(t));
  model.loadScheduledPlans = async () => {};

  await model.runScheduledPlanNow(plan);

  assert.strictEqual(runTestsCalls, 2, '应逐个执行绑定的 2 个测试计划');
  assert.strictEqual(completeCalls, 0, '手动立即执行不得调 scheduledTestComplete (不改计划状态)');
  assert.ok(outputs.some((l) => l.includes('executingTestPlan')), '应输出执行测试计划提示');
});

test('R27 runScheduledPlanNow 首个 plan 手动停止 → 终止序列 (不跑后续)', async () => {
  const Model = await loadModel();
  const model = createModel();
  const plan = { id: 'sp_1', name: 'SP', testPlans: [{ id: 'tp_1' }, { id: 'tp_2' }] };
  model._api.getTestPlans = async () => ({
    data: [
      { id: 'tp_1', name: 'TP1', loopCount: 1, testFiles: [{ path: 'a_test.py' }] },
      { id: 'tp_2', name: 'TP2', loopCount: 1, testFiles: [{ path: 'b_test.py' }] },
    ],
  });
  let runTestsCalls = 0;
  model.runTests = async () => {
    runTestsCalls++;
    return runTestsCalls === 1 ? 'stopped' : 'completed';
  };
  model.appendOutput = () => {};
  model.appendError = () => {};
  model.loadScheduledPlans = async () => {};

  await model.runScheduledPlanNow(plan);

  assert.strictEqual(runTestsCalls, 1, '手动停止后不得启动后续测试计划');
});

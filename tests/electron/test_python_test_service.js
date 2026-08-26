// PythonTestService 单元测试
// 需用 --require tests/electron/_setup.js 预加载 electron mock
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const PythonTestService = require('../../electron/src/main/services/PythonTestService');

/**
 * 构造 mock child_process.spawn
 * 返回 EventEmitter 模拟子进程，可手动 emit stdout/stderr/close 事件
 */
function createMockSpawn() {
  const calls = [];
  const spawn = (cmd, args, opts) => {
    calls.push({ cmd, args, opts });
    const proc = new EventEmitter();
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    proc.kill = () => {};
    spawn._lastProc = proc;
    return proc;
  };
  spawn._calls = calls;
  return spawn;
}

/**
 * 构造 mock 依赖
 */
function createMockDeps(spawn, overrides = {}) {
  return {
    projectRoot: '/fake/project',
    i18nService: {
      t: (key, opts) => key + (opts ? JSON.stringify(opts) : ''),
      getLanguage: () => 'zh-CN'
    },
    userDataPath: overrides.userDataPath || '/fake/userdata',
    mainWindow: { webContents: { send: () => {} } },
    allureService: { generateAllureReport: async () => ({ success: true, reportPath: '/fake/report' }) },
    testPlanService: { updateRunReportPath: async () => {} },
    spawn,
    // 默认注入 mock dialogMonitor: 防止 run() 触发真实 FileBasedDialogMonitor.start(),
    // 在 Windows 上把 Unix 桩路径 /fake/userdata 解析为当前盘根目录并真实创建 D:\fake\userdata\logs
    dialogMonitor: { start: () => {}, stop: () => {} },
    ...overrides
  };
}

describe('PythonTestService 构造', () => {
  test('应存储 deps 字段', () => {
    const spawn = createMockSpawn();
    const deps = createMockDeps(spawn);
    const svc = new PythonTestService(deps);
    assert.strictEqual(svc.projectRoot, '/fake/project');
    assert.strictEqual(svc.i18nService, deps.i18nService);
    assert.strictEqual(svc.userDataPath, '/fake/userdata');
    assert.strictEqual(svc.mainWindow, deps.mainWindow);
    assert.strictEqual(svc.allureService, deps.allureService);
    assert.strictEqual(svc.testPlanService, deps.testPlanService);
  });

  test('应使用注入的 spawn 函数', () => {
    const spawn = createMockSpawn();
    const svc = new PythonTestService(createMockDeps(spawn));
    assert.strictEqual(svc._spawn, spawn);
  });

  test('应创建 FileBasedDialogMonitor 默认实例', () => {
    const spawn = createMockSpawn();
    // dialogMonitor: null 显式触发 deps.dialogMonitor || new FileBasedDialogMonitor(...) 默认分支
    const svc = new PythonTestService(createMockDeps(spawn, { dialogMonitor: null }));
    assert.ok(svc._dialogMonitor);
    assert.strictEqual(typeof svc._dialogMonitor.start, 'function');
    assert.strictEqual(typeof svc._dialogMonitor.stop, 'function');
  });

  test('应接受注入的 dialogMonitor', () => {
    const spawn = createMockSpawn();
    const customMonitor = { start: () => {}, stop: () => {} };
    const svc = new PythonTestService(createMockDeps(spawn, { dialogMonitor: customMonitor }));
    assert.strictEqual(svc._dialogMonitor, customMonitor);
  });

  test('currentPythonProcess 初始化为 null', () => {
    const svc = new PythonTestService(createMockDeps(createMockSpawn()));
    assert.strictEqual(svc.currentPythonProcess, null);
  });

  test('不应有 setMainWindow 方法（消除时序耦合）', () => {
    const svc = new PythonTestService(createMockDeps(createMockSpawn()));
    assert.strictEqual(typeof svc.setMainWindow, 'undefined');
  });
});

describe('PythonTestService.run', () => {
  test('无 pythonCmd 时应返回失败结果', async () => {
    const spawn = createMockSpawn();
    const deps = createMockDeps(spawn);
    // mock pathHelper.getPythonConfig 返回 null
    const pathHelper = require('../../electron/src/main/utils/pathHelper');
    const origGetPythonConfig = pathHelper.getPythonConfig;
    pathHelper.getPythonConfig = () => null;
    try {
      const svc = new PythonTestService(deps);
      const result = await svc.run({ testPaths: ['tests/'], testPlanName: 'plan1' });
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.exitCode, -1);
      assert.strictEqual(result.testPlanName, 'plan1');
      assert.strictEqual(result.allureReportPath, null);
      assert.deepStrictEqual(result.sideEffectFailures, []);
      assert.strictEqual(spawn._calls.length, 0); // 不应调用 spawn
    } finally {
      pathHelper.getPythonConfig = origGetPythonConfig;
    }
  });

  test('应调用 spawn 启动子进程', async () => {
    const spawn = createMockSpawn();
    const pathHelper = require('../../electron/src/main/utils/pathHelper');
    const orig = pathHelper.getPythonConfig;
    pathHelper.getPythonConfig = () => ({
      pythonPath: '/fake/python',
      isEmbedded: false,
      isSystem: false
    });
    try {
      const svc = new PythonTestService(createMockDeps(spawn));
      const runPromise = svc.run({ testPaths: ['tests/test_a.py'], testPlanName: 'plan1' });
      // 触发子进程 close 事件
      setImmediate(() => {
        spawn._lastProc.emit('close', 0);
      });
      await runPromise;
      assert.strictEqual(spawn._calls.length, 1);
      assert.strictEqual(spawn._calls[0].cmd, '/fake/python');
      assert.ok(spawn._calls[0].args.includes('-m'));
      assert.ok(spawn._calls[0].args.includes('main'));
    } finally {
      pathHelper.getPythonConfig = orig;
    }
  });

  test('exitCode=0 时 success=true', async () => {
    const spawn = createMockSpawn();
    const pathHelper = require('../../electron/src/main/utils/pathHelper');
    const orig = pathHelper.getPythonConfig;
    pathHelper.getPythonConfig = () => ({ pythonPath: '/fake/python', isEmbedded: false, isSystem: false });
    try {
      const svc = new PythonTestService(createMockDeps(spawn));
      const runPromise = svc.run({ testPaths: ['tests/'] });
      setImmediate(() => spawn._lastProc.emit('close', 0));
      const result = await runPromise;
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.exitCode, 0);
    } finally {
      pathHelper.getPythonConfig = orig;
    }
  });

  test('exitCode=1 时 success=false', async () => {
    const spawn = createMockSpawn();
    const pathHelper = require('../../electron/src/main/utils/pathHelper');
    const orig = pathHelper.getPythonConfig;
    pathHelper.getPythonConfig = () => ({ pythonPath: '/fake/python', isEmbedded: false, isSystem: false });
    try {
      const svc = new PythonTestService(createMockDeps(spawn));
      const runPromise = svc.run({ testPaths: ['tests/'] });
      setImmediate(() => spawn._lastProc.emit('close', 1));
      const result = await runPromise;
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.exitCode, 1);
    } finally {
      pathHelper.getPythonConfig = orig;
    }
  });

  test('stdout 应累积到 output 字段', async () => {
    const spawn = createMockSpawn();
    const pathHelper = require('../../electron/src/main/utils/pathHelper');
    const orig = pathHelper.getPythonConfig;
    pathHelper.getPythonConfig = () => ({ pythonPath: '/fake/python', isEmbedded: false, isSystem: false });
    try {
      const svc = new PythonTestService(createMockDeps(spawn));
      const runPromise = svc.run({ testPaths: ['tests/'] });
      setImmediate(() => {
        spawn._lastProc.stdout.emit('data', Buffer.from('line1\n', 'utf8'));
        spawn._lastProc.stdout.emit('data', Buffer.from('line2\n', 'utf8'));
        spawn._lastProc.emit('close', 0);
      });
      const result = await runPromise;
      assert.ok(result.output.includes('line1'));
      assert.ok(result.output.includes('line2'));
    } finally {
      pathHelper.getPythonConfig = orig;
    }
  });

  test('stderr 转发到 TEST_ERROR + error 字段为简短消息 (非整段 stderr)', async () => {
    const spawn = createMockSpawn();
    const pathHelper = require('../../electron/src/main/utils/pathHelper');
    const orig = pathHelper.getPythonConfig;
    pathHelper.getPythonConfig = () => ({ pythonPath: '/fake/python', isEmbedded: false, isSystem: false });
    // spy mainWindow.webContents.send 验证 stderr 转发
    const sentMessages = [];
    const spyMainWindow = { webContents: { send: (channel, data) => sentMessages.push({ channel, data }) } };
    try {
      const svc = new PythonTestService(createMockDeps(spawn, { mainWindow: spyMainWindow }));
      const runPromise = svc.run({ testPaths: ['tests/'] });
      setImmediate(() => {
        spawn._lastProc.stderr.emit('data', Buffer.from('error line\n', 'utf8'));
        spawn._lastProc.emit('close', 1);
      });
      const result = await runPromise;
      // error 字段为简短消息, 不含整段 stderr (避免渲染层重复显示)
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.exitCode, 1);
      assert.ok(result.error.includes('Tests failed'), 'error 字段含简短失败消息');
      assert.ok(!result.error.includes('error line'), 'error 字段不含整段 stderr');
      // stderr 已通过 TEST_ERROR channel 实时转发
      const testErrorMessages = sentMessages.filter(m => m.channel === 'test-error');
      assert.ok(testErrorMessages.length > 0, 'stderr 转发到 test-error channel');
      assert.ok(testErrorMessages.some(m => String(m.data).includes('error line')), '转发内容含 error line');
    } finally {
      pathHelper.getPythonConfig = orig;
    }
  });

  test('Allure 生成失败应记入 sideEffectFailures', async () => {
    const spawn = createMockSpawn();
    const pathHelper = require('../../electron/src/main/utils/pathHelper');
    const orig = pathHelper.getPythonConfig;
    pathHelper.getPythonConfig = () => ({ pythonPath: '/fake/python', isEmbedded: false, isSystem: false });
    try {
      const deps = createMockDeps(spawn, {
        allureService: {
          generateAllureReport: async () => { throw new Error('allure generation failed'); }
        }
      });
      const svc = new PythonTestService(deps);
      const runPromise = svc.run({ testPaths: ['tests/'], testPlanName: 'plan1' });
      // 输出包含 allure-results-dir 标记
      setImmediate(() => {
        spawn._lastProc.stdout.emit('data', Buffer.from('XKAT_ALLURE_RESULTS_DIR:/fake/results\n', 'utf8'));
        spawn._lastProc.emit('close', 0);
      });
      const result = await runPromise;
      assert.strictEqual(result.allureReportPath, null);
      assert.ok(result.sideEffectFailures.some(f => f.step === 'generateReport'));
      assert.ok(result.sideEffectFailures[0].error.includes('allure generation failed'));
    } finally {
      pathHelper.getPythonConfig = orig;
    }
  });

  test('updateRunReportPath 失败应记入 sideEffectFailures', async () => {
    const spawn = createMockSpawn();
    const pathHelper = require('../../electron/src/main/utils/pathHelper');
    const orig = pathHelper.getPythonConfig;
    pathHelper.getPythonConfig = () => ({ pythonPath: '/fake/python', isEmbedded: false, isSystem: false });
    try {
      const deps = createMockDeps(spawn, {
        testPlanService: {
          updateRunReportPath: async () => { throw new Error('update failed'); }
        }
      });
      const svc = new PythonTestService(deps);
      const runPromise = svc.run({ testPaths: ['tests/'], testPlanName: 'plan1' });
      setImmediate(() => {
        spawn._lastProc.stdout.emit('data', Buffer.from('XKAT_ALLURE_RESULTS_DIR:/fake/results\n', 'utf8'));
        spawn._lastProc.emit('close', 0);
      });
      const result = await runPromise;
      assert.ok(result.sideEffectFailures.some(f => f.step === 'updatePlanPath'));
    } finally {
      pathHelper.getPythonConfig = orig;
    }
  });

  test('应解析 testStats 统计信息', async () => {
    const spawn = createMockSpawn();
    const pathHelper = require('../../electron/src/main/utils/pathHelper');
    const orig = pathHelper.getPythonConfig;
    pathHelper.getPythonConfig = () => ({ pythonPath: '/fake/python', isEmbedded: false, isSystem: false });
    try {
      const svc = new PythonTestService(createMockDeps(spawn));
      const runPromise = svc.run({ testPaths: ['tests/'] });
      setImmediate(() => {
        spawn._lastProc.stdout.emit('data', Buffer.from('5 passed, 2 failed, 1 skipped in 10.5s\n', 'utf8'));
        spawn._lastProc.emit('close', 1);
      });
      const result = await runPromise;
      assert.strictEqual(result.testStats.passed, 5);
      assert.strictEqual(result.testStats.failed, 2);
      assert.strictEqual(result.testStats.skipped, 1);
      assert.strictEqual(result.testStats.total, 8);
    } finally {
      pathHelper.getPythonConfig = orig;
    }
  });

  test('应调用 dialogMonitor.start/stop', async () => {
    const spawn = createMockSpawn();
    const pathHelper = require('../../electron/src/main/utils/pathHelper');
    const orig = pathHelper.getPythonConfig;
    pathHelper.getPythonConfig = () => ({ pythonPath: '/fake/python', isEmbedded: false, isSystem: false });
    try {
      const monitor = { start: () => {}, stop: () => {} };
      let started = false, stopped = false;
      monitor.start = () => { started = true; };
      monitor.stop = () => { stopped = true; };
      const svc = new PythonTestService(createMockDeps(spawn, { dialogMonitor: monitor }));
      const runPromise = svc.run({ testPaths: ['tests/'] });
      setImmediate(() => spawn._lastProc.emit('close', 0));
      await runPromise;
      assert.strictEqual(started, true);
      assert.strictEqual(stopped, true);
    } finally {
      pathHelper.getPythonConfig = orig;
    }
  });

  test('spawn error 事件应 reject', async () => {
    const spawn = createMockSpawn();
    const pathHelper = require('../../electron/src/main/utils/pathHelper');
    const orig = pathHelper.getPythonConfig;
    pathHelper.getPythonConfig = () => ({ pythonPath: '/fake/python', isEmbedded: false, isSystem: false });
    try {
      const svc = new PythonTestService(createMockDeps(spawn));
      const runPromise = svc.run({ testPaths: ['tests/'] });
      setImmediate(() => spawn._lastProc.emit('error', new Error('spawn failed')));
      await assert.rejects(runPromise, /spawn failed/);
    } finally {
      pathHelper.getPythonConfig = orig;
    }
  });
});

describe('PythonTestService.stop', () => {
  test('无进程时应返回失败', () => {
    const svc = new PythonTestService(createMockDeps(createMockSpawn()));
    const result = svc.stop();
    assert.strictEqual(result.success, false);
  });

  test('有进程时应 kill 并返回成功', async () => {
    const spawn = createMockSpawn();
    const pathHelper = require('../../electron/src/main/utils/pathHelper');
    const orig = pathHelper.getPythonConfig;
    pathHelper.getPythonConfig = () => ({ pythonPath: '/fake/python', isEmbedded: false, isSystem: false });
    try {
      const svc = new PythonTestService(createMockDeps(spawn));
      const monitor = { start: () => {}, stop: () => {} };
      svc._dialogMonitor = monitor;
      let killed = false;
      // 启动一个子进程
      const runPromise = svc.run({ testPaths: ['tests/'] });
      // run() 内含 async 语法校验步骤 (P0-1), spawn 发生在下一个 macrotask
      await new Promise((r) => setImmediate(r));
      const proc = spawn._lastProc;
      proc.kill = () => { killed = true; };
      // 立即 stop
      const result = svc.stop();
      assert.strictEqual(result.success, true);
      assert.strictEqual(killed, true);
      assert.strictEqual(svc.currentPythonProcess, null);
      // 清理未完成的 promise
      setImmediate(() => proc.emit('close', 0));
      return runPromise;
    } finally {
      pathHelper.getPythonConfig = orig;
    }
  });

  test('stop 应调用 dialogMonitor.stop', async () => {
    const spawn = createMockSpawn();
    const pathHelper = require('../../electron/src/main/utils/pathHelper');
    const orig = pathHelper.getPythonConfig;
    pathHelper.getPythonConfig = () => ({ pythonPath: '/fake/python', isEmbedded: false, isSystem: false });
    try {
      const monitor = { start: () => {}, stop: () => {} };
      let monitorStopped = false;
      monitor.stop = () => { monitorStopped = true; };
      const svc = new PythonTestService(createMockDeps(spawn, { dialogMonitor: monitor }));
      svc.run({ testPaths: ['tests/'] });
      // run() 内含 async 语法校验步骤 (P0-1), spawn 发生在下一个 macrotask
      await new Promise((r) => setImmediate(r));
      svc.stop();
      assert.strictEqual(monitorStopped, true);
      // 清理
      setImmediate(() => spawn._lastProc.emit('close', 0));
    } finally {
      pathHelper.getPythonConfig = orig;
    }
  });
});

describe('PythonTestService._parseTestStats', () => {
  const svc = new PythonTestService(createMockDeps(createMockSpawn()));

  test('应解析 passed/failed/skipped/broken', () => {
    const stats = svc._parseTestStats('5 passed, 2 failed, 3 skipped, 1 broken in 10.5s');
    assert.strictEqual(stats.passed, 5);
    assert.strictEqual(stats.failed, 2);
    assert.strictEqual(stats.skipped, 3);
    assert.strictEqual(stats.broken, 1);
    assert.strictEqual(stats.total, 11);
  });

  test('仅 passed 时其他为 0', () => {
    const stats = svc._parseTestStats('3 passed in 1.2s');
    assert.strictEqual(stats.passed, 3);
    assert.strictEqual(stats.failed, 0);
    assert.strictEqual(stats.total, 3);
  });

  test('空输出应返回全 0', () => {
    const stats = svc._parseTestStats('');
    assert.deepStrictEqual(stats, { passed: 0, failed: 0, skipped: 0, broken: 0, total: 0 });
  });

  test('无统计行应返回全 0', () => {
    const stats = svc._parseTestStats('some random output\nno stats here');
    assert.deepStrictEqual(stats, { passed: 0, failed: 0, skipped: 0, broken: 0, total: 0 });
  });
});

describe('PythonTestService._findAllureResultsDir', () => {
  test('应从 XKAT_ALLURE_RESULTS_DIR 标记解析', () => {
    const spawn = createMockSpawn();
    const svc = new PythonTestService(createMockDeps(spawn));
    const result = svc._findAllureResultsDir('output\nXKAT_ALLURE_RESULTS_DIR:/path/to/results\nmore');
    assert.strictEqual(result, '/path/to/results');
  });

  test('无标记且默认路径不存在应返回 null', () => {
    const spawn = createMockSpawn();
    const svc = new PythonTestService(createMockDeps(spawn, { userDataPath: '/nonexistent/path' }));
    const result = svc._findAllureResultsDir('output without marker');
    assert.strictEqual(result, null);
  });
});


// ── P1-5 回归: 并发守卫 + 输出缓冲上限 ─────────────────────────

test('P1-5 run 并发守卫: 运行中再次 run 返回失败 (不产生孤儿进程)', async () => {
  const spawn = createMockSpawn();
  const pathHelper = require('../../electron/src/main/utils/pathHelper');
  const orig = pathHelper.getPythonConfig;
  pathHelper.getPythonConfig = () => ({ pythonPath: '/fake/python', isEmbedded: false, isSystem: false });
  try {
    const svc = new PythonTestService(createMockDeps(spawn));
    const firstRun = svc.run({ testPaths: ['tests/'] });
    // 第一次 run 尚未结束 (未 emit close) 时, 第二次必须被拒绝
    const secondResult = await svc.run({ testPaths: ['tests/'] });
    assert.strictEqual(secondResult.success, false, '并发 run 应被拒绝');
    assert.ok(secondResult.error.includes('执行中'), '错误信息应说明已有测试在执行');
    // 只 spawn 一次
    assert.strictEqual(spawn._calls.length, 1, '只应启动一个子进程');
    // 清理第一次
    setImmediate(() => spawn._lastProc.emit('close', 0));
    await firstRun;
  } finally {
    pathHelper.getPythonConfig = orig;
  }
});

test('P1-5 输出缓冲上限: 超限截断保留尾部 + 标记', async () => {
  const spawn = createMockSpawn();
  const pathHelper = require('../../electron/src/main/utils/pathHelper');
  const orig = pathHelper.getPythonConfig;
  pathHelper.getPythonConfig = () => ({ pythonPath: '/fake/python', isEmbedded: false, isSystem: false });
  try {
    const svc = new PythonTestService(createMockDeps(spawn));
    const runPromise = svc.run({ testPaths: ['tests/'] });
    // 注入 6MB 输出 (超 5MB 上限)
    const big = Buffer.alloc(6 * 1024 * 1024, 'x');
    setImmediate(() => {
      spawn._lastProc.stdout.emit('data', big);
      spawn._lastProc.stdout.emit('data', Buffer.from('TAIL-LINE\n', 'utf8'));
      spawn._lastProc.emit('close', 0);
    });
    const result = await runPromise;
    assert.ok(result.output.includes('[输出过长已截断]'), '应含截断标记');
    assert.ok(result.output.endsWith('TAIL-LINE\n'), '应保留尾部最新输出');
    assert.ok(result.output.length <= 5 * 1024 * 1024 + 64, '缓冲应受上限约束');
  } finally {
    pathHelper.getPythonConfig = orig;
  }
});

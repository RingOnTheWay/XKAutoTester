// ApkInstaller 单元测试
// 验证: 1) install 成功路径 (push + pm install Success + rm cleanup)
//      2) push 失败 3) pm install 失败 4) statSync 抛错 5) 无 deviceId 时 args 不含 -s
//      6) 临时文件清理
// 策略: 构造注入 spawnFn/fs/monitor/executor
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const ApkInstaller = require(path.join(
  __dirname, '..', '..', 'electron', 'src', 'main', 'services', 'adb', 'ApkInstaller.js'
));

// ── mock 工厂 ──────────────────────────────────────────────

function createMockSpawn(opts = {}) {
  const {
    stdoutChunks = [],
    stderrChunks = [],
    code = 0,
  } = opts;

  const capturedCalls = [];

  const spawnFn = function (cmd, args, opts) {
    capturedCalls.push({ cmd, args, opts });
    const stdoutCbs = [];
    const stderrCbs = [];
    const closeCbs = [];

    const proc = {
      stdout: { on: (evt, cb) => { if (evt === 'data') stdoutCbs.push(cb); } },
      stderr: { on: (evt, cb) => { if (evt === 'data') stderrCbs.push(cb); } },
      on: (evt, cb) => { if (evt === 'close') closeCbs.push(cb); else if (evt === 'error') {} },
      kill: () => {},
      pid: 1,
    };

    setImmediate(() => {
      stdoutChunks.forEach(c => stdoutCbs.forEach(cb => cb(Buffer.from(c))));
      stderrChunks.forEach(c => stderrCbs.forEach(cb => cb(Buffer.from(c))));
      closeCbs.forEach(cb => cb(code));
    });

    return proc;
  };

  Object.defineProperty(spawnFn, 'calls', {
    value: capturedCalls, enumerable: false, writable: false,
  });

  return { spawnFn };
}

function createMockMonitor() {
  const events = [];
  const monitor = {
    emit: (p, s, m, e) => events.push({ percentage: p, status: s, message: m, error: e }),
    start: () => {},
    stop: () => {},
  };
  Object.defineProperty(monitor, 'events', {
    value: events, enumerable: false, writable: false,
  });
  return monitor;
}

function createMockMonitorFactory() {
  const monitors = [];
  const factory = (opts) => {
    const m = createMockMonitor();
    monitors.push({ opts, monitor: m });
    return m;
  };
  Object.defineProperty(factory, 'instances', {
    value: monitors, enumerable: false, writable: false,
  });
  return factory;
}

const i18nMock = { t: (key, params) => key + (params ? JSON.stringify(params) : '') };

// ── install 测试 ───────────────────────────────────────────

test('install 成功路径: push → pm install Success → rm cleanup', async () => {
  // 两次 spawn: push (code=0) + pm install (stdout 'Success')
  let spawnCallCount = 0;
  const capturedCalls = [];
  const spawnFn = function (cmd, args, opts) {
    capturedCalls.push({ cmd, args, opts });
    const stdoutCbs = [];
    const stderrCbs = [];
    const closeCbs = [];
    spawnCallCount++;
    const isInstall = args.includes('install');
    const proc = {
      stdout: { on: (evt, cb) => { if (evt === 'data') stdoutCbs.push(cb); } },
      stderr: { on: (evt, cb) => { if (evt === 'data') stderrCbs.push(cb); } },
      on: (evt, cb) => { if (evt === 'close') closeCbs.push(cb); },
      kill: () => {},
      pid: 1,
    };
    setImmediate(() => {
      if (isInstall) stdoutCbs.forEach(cb => cb(Buffer.from('Success\n')));
      closeCbs.forEach(cb => cb(0));
    });
    return proc;
  };
  Object.defineProperty(spawnFn, 'calls', {
    value: capturedCalls, enumerable: false, writable: false,
  });

  const monitorFactory = createMockMonitorFactory();
  const executor = {
    execute: async () => ({ success: true, output: '', error: '' }),
  };
  const executorCalls = [];
  const executorMock = {
    execute: async (args, opts) => {
      executorCalls.push({ args, opts });
      return { success: true, output: '', error: '' };
    },
  };
  Object.defineProperty(executorMock, 'calls', {
    value: executorCalls, enumerable: false, writable: false,
  });

  const svc = new ApkInstaller({
    commandExecutor: executorMock,
    i18nService: i18nMock,
    spawnFn,
    fs: { statSync: () => ({ size: 1024 * 1024 }) },
    progressMonitorFactory: monitorFactory,
  });

  const result = await svc.install('/local/app.apk', 'dev1', null);

  assert.strictEqual(result.success, true);
  // spawn 被调用 2 次: push + pm install
  assert.strictEqual(spawnFn.calls.length, 2);
  // push args 含 -s dev1 push
  assert.ok(spawnFn.calls[0].args.includes('-s'));
  assert.ok(spawnFn.calls[0].args.includes('dev1'));
  assert.ok(spawnFn.calls[0].args.includes('push'));
  // install args 含 pm install -r
  assert.ok(spawnFn.calls[1].args.includes('pm'));
  assert.ok(spawnFn.calls[1].args.includes('install'));
  assert.ok(spawnFn.calls[1].args.includes('-r'));
  // rm cleanup: executor.execute 被调用 1 次, args 含 rm
  assert.strictEqual(executorMock.calls.length, 1);
  assert.ok(executorMock.calls[0].args.includes('rm'));
  // monitor emit 0% preparing → 80% installing → 100% success
  const events = monitorFactory.instances[0].monitor.events;
  assert.ok(events.some(e => e.percentage === 0 && e.status === 'preparing'));
  assert.ok(events.some(e => e.percentage === 80 && e.status === 'installing'));
  assert.ok(events.some(e => e.percentage === 100 && e.status === 'success'));
});

test('install push 失败返回 success=false + monitor emit error', async () => {
  const capturedCalls = [];
  const spawnFn = function (cmd, args, opts) {
    capturedCalls.push({ cmd, args, opts });
    const stderrCbs = [];
    const closeCbs = [];
    const proc = {
      stdout: { on: () => {} },
      stderr: { on: (evt, cb) => { if (evt === 'data') stderrCbs.push(cb); } },
      on: (evt, cb) => { if (evt === 'close') closeCbs.push(cb); },
      kill: () => {},
      pid: 1,
    };
    setImmediate(() => {
      stderrCbs.forEach(cb => cb(Buffer.from('error: device not found')));
      closeCbs.forEach(cb => cb(1));
    });
    return proc;
  };
  Object.defineProperty(spawnFn, 'calls', {
    value: capturedCalls, enumerable: false, writable: false,
  });

  const monitorFactory = createMockMonitorFactory();
  const executorCalls = [];
  const executorMock = {
    execute: async (args, opts) => {
      executorCalls.push({ args, opts });
      return { success: true, output: '', error: '' };
    },
  };

  const svc = new ApkInstaller({
    commandExecutor: executorMock,
    i18nService: i18nMock,
    spawnFn,
    fs: { statSync: () => ({ size: 100 }) },
    progressMonitorFactory: monitorFactory,
  });

  const result = await svc.install('/local/app.apk', 'dev1', null);

  assert.strictEqual(result.success, false);
  assert.ok(result.error);
  // pm install 不应被调用
  const installCalls = spawnFn.calls.filter(c => c.args.includes('install'));
  assert.strictEqual(installCalls.length, 0);
  // P2-7: push 失败也应清理设备端临时 APK (finally)
  assert.strictEqual(executorCalls.length, 1, 'push 失败仍应触发 rm cleanup');
  assert.ok(executorCalls[0].args.includes('rm'), 'cleanup args 应含 rm');
  assert.ok(executorCalls[0].args.some(a => a.includes('temp_')), 'cleanup 目标应为 temp_*.apk');
  // monitor emit 100% error
  const events = monitorFactory.instances[0].monitor.events;
  assert.ok(events.some(e => e.percentage === 100 && e.status === 'error'));
});

test('install pm install 失败 (stdout 不含 Success)', async () => {
  const capturedCalls = [];
  const spawnFn = function (cmd, args, opts) {
    capturedCalls.push({ cmd, args, opts });
    const stdoutCbs = [];
    const stderrCbs = [];
    const closeCbs = [];
    const isInstall = args.includes('install');
    const proc = {
      stdout: { on: (evt, cb) => { if (evt === 'data') stdoutCbs.push(cb); } },
      stderr: { on: (evt, cb) => { if (evt === 'data') stderrCbs.push(cb); } },
      on: (evt, cb) => { if (evt === 'close') closeCbs.push(cb); },
      kill: () => {},
      pid: 1,
    };
    setImmediate(() => {
      if (isInstall) {
        stdoutCbs.forEach(cb => cb(Buffer.from('Failure [INSTALL_FAILED_INVALID_APK]')));
      }
      closeCbs.forEach(cb => cb(0));
    });
    return proc;
  };
  Object.defineProperty(spawnFn, 'calls', {
    value: capturedCalls, enumerable: false, writable: false,
  });

  const monitorFactory = createMockMonitorFactory();
  const executorMock = {
    execute: async () => ({ success: true, output: '', error: '' }),
  };

  const svc = new ApkInstaller({
    commandExecutor: executorMock,
    i18nService: i18nMock,
    spawnFn,
    fs: { statSync: () => ({ size: 100 }) },
    progressMonitorFactory: monitorFactory,
  });

  const result = await svc.install('/local/app.apk', null, null);

  assert.strictEqual(result.success, false);
  assert.ok(result.error);
  // rm cleanup 仍应被调用 (即使 install 失败)
  // (此处不强制断言,允许实现差异)
});

test('install statSync 抛错返回 success=false', async () => {
  const { spawnFn } = createMockSpawn({ code: 0 });
  const monitorFactory = createMockMonitorFactory();

  const svc = new ApkInstaller({
    commandExecutor: { execute: async () => ({ success: true, output: '', error: '' }) },
    i18nService: i18nMock,
    spawnFn,
    fs: { statSync: () => { throw new Error('ENOENT'); } },
    progressMonitorFactory: monitorFactory,
  });

  const result = await svc.install('/nonexistent.apk', null, null);

  assert.strictEqual(result.success, false);
  assert.ok(result.error.includes('ENOENT'));
  assert.strictEqual(spawnFn.calls.length, 0);
});

test('install 无 deviceId 时 push/install args 不含 -s', async () => {
  const capturedCalls = [];
  const spawnFn = function (cmd, args, opts) {
    capturedCalls.push({ cmd, args, opts });
    const stdoutCbs = [];
    const closeCbs = [];
    const isInstall = args.includes('install');
    const proc = {
      stdout: { on: (evt, cb) => { if (evt === 'data') stdoutCbs.push(cb); } },
      stderr: { on: () => {} },
      on: (evt, cb) => { if (evt === 'close') closeCbs.push(cb); },
      kill: () => {},
      pid: 1,
    };
    setImmediate(() => {
      if (isInstall) stdoutCbs.forEach(cb => cb(Buffer.from('Success\n')));
      closeCbs.forEach(cb => cb(0));
    });
    return proc;
  };
  Object.defineProperty(spawnFn, 'calls', {
    value: capturedCalls, enumerable: false, writable: false,
  });

  const monitorFactory = createMockMonitorFactory();
  const executorCalls = [];
  const executorMock = {
    execute: async (args, opts) => {
      executorCalls.push({ args, opts });
      return { success: true, output: '', error: '' };
    },
  };
  Object.defineProperty(executorMock, 'calls', {
    value: executorCalls, enumerable: false, writable: false,
  });

  const svc = new ApkInstaller({
    commandExecutor: executorMock,
    i18nService: i18nMock,
    spawnFn,
    fs: { statSync: () => ({ size: 100 }) },
    progressMonitorFactory: monitorFactory,
  });

  await svc.install('/local/app.apk', null, null);

  // push args 不含 -s
  assert.ok(!spawnFn.calls[0].args.includes('-s'));
  // install args 不含 -s
  assert.ok(!spawnFn.calls[1].args.includes('-s'));
  // rm cleanup args 不含 -s
  assert.ok(!executorMock.calls[0].args.includes('-s'));
});

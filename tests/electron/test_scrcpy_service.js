// ScrcpyService 单测 — 4 factory (processSpawner + pathResolver + logger + notifier) + buildScrcpyArgs 纯函数。
// H2: 加 crash 检测下沉测试 (child error/close + SCRCPY_CRASH_WINDOW_MS + notifier.notify).
// 验证: constructor 收 4 factory + buildScrcpyArgs (全参数/空) + startScrcpy (路径未找到/win32/非 win32/spawn 抛错/不返 process) +
//      setMainWindow + child error 触发 notifier + child close crash 触发 notifier + child close 正常退出不触发.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { EventEmitter } = require('node:events');

const SCRCPY_SERVICE_PATH = path.join(
  __dirname, '..', '..', 'electron', 'src', 'main', 'services', 'ScrcpyService.js'
);
const { ScrcpyService, buildScrcpyArgs, SCRCPY_CRASH_WINDOW_MS } = require(SCRCPY_SERVICE_PATH);

// ── Fakes ──────────────────────────────────────────────

function makeFakeSpawner(childOverride) {
  const calls = [];
  return {
    calls,
    spawn: (cmd, args, opts) => {
      calls.push({ cmd, args, opts });
      if (childOverride) return childOverride;
      // 默认返 EventEmitter 模拟 child process (支持 .on/error/close + stdout/stderr.resume)
      const child = new EventEmitter();
      child.stdout = { resume: () => {} };
      child.stderr = { resume: () => {} };
      return child;
    },
  };
}

function makeFakePathResolver(scrcpyPath) {
  return { findScrcpyPath: async () => scrcpyPath };
}

function makeFakeLogger() {
  const calls = [];
  return { calls, error: (msg) => calls.push(msg) };
}

function makeFakeI18n() {
  return { t: (key, opts) => `i18n:${key}:${JSON.stringify(opts)}` };
}

// H2: fake notifier (收集 notify 调用)
function makeFakeNotifier() {
  const calls = [];
  return {
    calls,
    notify: (errorInfo) => calls.push(errorInfo),
  };
}

// ── buildScrcpyArgs 纯函数 ─────────────────────────────

test('buildScrcpyArgs 全参数 — 验证 args 顺序 + bitRate M 单位处理', () => {
  const args = buildScrcpyArgs({
    max_size: '1920',
    video_bit_rate: '8',  // 数字字符串, 应加 M
    max_fps: '60',
    video_codec: 'h264',
    always_on_top: true,
  });

  assert.deepStrictEqual(args, [
    '--max-size', '1920',
    '--video-bit-rate', '8M',
    '--max-fps', '60',
    '--video-codec', 'h264',
    '--always-on-top',
  ]);
});

test('buildScrcpyArgs video_bit_rate 已带 M 单位不重复加', () => {
  const args = buildScrcpyArgs({ video_bit_rate: '8M' });
  assert.deepStrictEqual(args, ['--video-bit-rate', '8M']);
});

test('buildScrcpyArgs 空 params 返空数组', () => {
  assert.deepStrictEqual(buildScrcpyArgs(null), []);
  assert.deepStrictEqual(buildScrcpyArgs(undefined), []);
  assert.deepStrictEqual(buildScrcpyArgs({}), []);
});

test('buildScrcpyArgs always_on_top falsy 不加', () => {
  assert.deepStrictEqual(buildScrcpyArgs({ always_on_top: false }), []);
  assert.deepStrictEqual(buildScrcpyArgs({ always_on_top: 0 }), []);
});

// P1-2: 恶意载荷过滤 (命令注入面修复)
test('P1-2 buildScrcpyArgs 恶意数值参数被丢弃 (含 cmd 元字符)', () => {
  const args = buildScrcpyArgs({
    max_size: '1920" & calc.exe',
    video_bit_rate: '8M & calc.exe',
    max_fps: '60|calc',
    video_codec: 'h264" & whoami',
    always_on_top: true,
  });
  // 全部非法值被过滤, 仅剩合法 always_on_top
  assert.deepStrictEqual(args, ['--always-on-top']);
});

test('P1-2 buildScrcpyArgs 合法参数保留', () => {
  const args = buildScrcpyArgs({
    max_size: '1920',
    video_bit_rate: '8M',
    max_fps: '60',
    video_codec: 'H265',  // 大写归一化为小写枚举
    always_on_top: true,
  });
  assert.deepStrictEqual(args, [
    '--max-size', '1920',
    '--video-bit-rate', '8M',
    '--max-fps', '60',
    '--video-codec', 'h265',
    '--always-on-top',
  ]);
});

test('P1-2 buildScrcpyArgs 非法 video_codec 丢弃', () => {
  const args = buildScrcpyArgs({ video_codec: 'vp9; rm -rf /' });
  assert.deepStrictEqual(args, []);
});

// ── constructor ────────────────────────────────────────

test('constructor 收 4 factory + 4 实例建 + _mainWindow=null', () => {
  const spawner = makeFakeSpawner();
  const resolver = makeFakePathResolver('/scrcpy.exe');
  const logger = makeFakeLogger();
  const notifier = makeFakeNotifier();

  const svc = new ScrcpyService('/proj', makeFakeI18n(), {
    processSpawnerFactory: () => spawner,
    pathResolverFactory: () => resolver,
    loggerFactory: () => logger,
    notifierFactory: () => notifier,
  });

  assert.strictEqual(svc._spawner, spawner);
  assert.strictEqual(svc._pathResolver, resolver);
  assert.strictEqual(svc._logger, logger);
  assert.strictEqual(svc._notifier, notifier, 'H2: notifier 实例建');
  assert.strictEqual(svc._mainWindow, null, 'H2: _mainWindow 初始 null');
  assert.strictEqual(svc.projectRoot, '/proj');
});

// H2: setMainWindow
test('setMainWindow 设置 _mainWindow', () => {
  const svc = new ScrcpyService('/proj', makeFakeI18n(), {
    processSpawnerFactory: () => makeFakeSpawner(),
    pathResolverFactory: () => makeFakePathResolver('/scrcpy.exe'),
    loggerFactory: () => makeFakeLogger(),
    notifierFactory: () => makeFakeNotifier(),
  });

  assert.strictEqual(svc._mainWindow, null);
  const fakeWindow = { webContents: { send: () => {} } };
  svc.setMainWindow(fakeWindow);
  assert.strictEqual(svc._mainWindow, fakeWindow);
});

// ── startScrcpy ────────────────────────────────────────

test('P1-2 startScrcpy 恶意 deviceId 拒绝 (不 spawn)', async () => {
  const spawner = makeFakeSpawner();
  const svc = new ScrcpyService('/proj', makeFakeI18n(), {
    processSpawnerFactory: () => spawner,
    pathResolverFactory: () => makeFakePathResolver('/usr/bin/scrcpy'),
    loggerFactory: () => makeFakeLogger(),
  });

  const result = await svc.startScrcpy('dev" & calc.exe', {});
  assert.strictEqual(result.success, false);
  assert.strictEqual(result.error, 'invalid_device_id');
  assert.strictEqual(spawner.calls.length, 0, '恶意 deviceId 不应触发 spawn');
});

test('P1-2 startScrcpy 非字符串 deviceId 拒绝', async () => {
  const spawner = makeFakeSpawner();
  const svc = new ScrcpyService('/proj', makeFakeI18n(), {
    processSpawnerFactory: () => spawner,
    pathResolverFactory: () => makeFakePathResolver('/usr/bin/scrcpy'),
    loggerFactory: () => makeFakeLogger(),
  });

  const result = await svc.startScrcpy(null, {});
  assert.strictEqual(result.success, false);
  assert.strictEqual(result.error, 'invalid_device_id');
  assert.strictEqual(spawner.calls.length, 0);
});

test('startScrcpy 路径未找到返 {success:false, error:i18n.t}', async () => {
  const svc = new ScrcpyService('/proj', makeFakeI18n(), {
    processSpawnerFactory: () => makeFakeSpawner(),
    pathResolverFactory: () => makeFakePathResolver(null),
    loggerFactory: () => makeFakeLogger(),
  });

  const result = await svc.startScrcpy('dev:5555', { max_size: '1920' });

  assert.strictEqual(result.success, false);
  assert.match(result.error, /i18n:main\.scrcpyNotFound:/);
  assert.match(result.error, /env.*scrcpy.*scrcpy\.exe/);
});

test('P1-2 startScrcpy win32 直接 spawn scrcpyPath (不再经 cmd.exe)', async () => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });

  try {
    const spawner = makeFakeSpawner();
    const svc = new ScrcpyService('/proj', makeFakeI18n(), {
      processSpawnerFactory: () => spawner,
      pathResolverFactory: () => makeFakePathResolver('/proj/env/scrcpy/scrcpy.exe'),
      loggerFactory: () => makeFakeLogger(),
    });

    const result = await svc.startScrcpy('dev:5555', { max_size: '1920', max_fps: '60' });

    assert.strictEqual(result.success, true);
    assert.strictEqual(spawner.calls.length, 1);
    assert.strictEqual(spawner.calls[0].cmd, '/proj/env/scrcpy/scrcpy.exe');  // 不再是 cmd.exe
    assert.deepStrictEqual(spawner.calls[0].args, [
      '-s', 'dev:5555',
      '--max-size', '1920',
      '--max-fps', '60',
    ]);
    assert.strictEqual(spawner.calls[0].opts.windowsHide, true);
  } finally {
    Object.defineProperty(process, 'platform', originalPlatform);
  }
});

test('startScrcpy 非 win32 调 spawner.spawn(scrcpyPath, args)', async () => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

  try {
    const spawner = makeFakeSpawner();
    const svc = new ScrcpyService('/proj', makeFakeI18n(), {
      processSpawnerFactory: () => spawner,
      pathResolverFactory: () => makeFakePathResolver('/usr/bin/scrcpy'),
      loggerFactory: () => makeFakeLogger(),
    });

    const result = await svc.startScrcpy('dev:5555', { video_codec: 'h264' });

    assert.strictEqual(result.success, true);
    assert.strictEqual(spawner.calls[0].cmd, '/usr/bin/scrcpy');
    assert.deepStrictEqual(spawner.calls[0].args, [
      '-s', 'dev:5555',
      '--video-codec', 'h264',
    ]);
    assert.strictEqual(spawner.calls[0].opts.windowsHide, true);  // P1-2: 统一传, 非 win32 平台被 Node 忽略
  } finally {
    Object.defineProperty(process, 'platform', originalPlatform);
  }
});

test('startScrcpy spawn 抛错 catch 返 {success:false, error}', async () => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

  try {
    const spawner = {
      spawn: () => { throw new Error('spawn EACCES'); },
    };
    const svc = new ScrcpyService('/proj', makeFakeI18n(), {
      processSpawnerFactory: () => spawner,
      pathResolverFactory: () => makeFakePathResolver('/usr/bin/scrcpy'),
      loggerFactory: () => makeFakeLogger(),
    });

    const result = await svc.startScrcpy('dev:5555', {});

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error, 'spawn EACCES');
  } finally {
    Object.defineProperty(process, 'platform', originalPlatform);
  }
});

test('startScrcpy 成功返 {success:true} (不返 process) + child.stdout.resume 调用', async () => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

  try {
    let stdoutResumed = false;
    let stderrResumed = false;
    const fakeChild = new EventEmitter();
    fakeChild.stdout = { resume: () => { stdoutResumed = true; } };
    fakeChild.stderr = { resume: () => { stderrResumed = true; } };
    const spawner = { spawn: () => fakeChild };
    const svc = new ScrcpyService('/proj', makeFakeI18n(), {
      processSpawnerFactory: () => spawner,
      pathResolverFactory: () => makeFakePathResolver('/usr/bin/scrcpy'),
      loggerFactory: () => makeFakeLogger(),
      notifierFactory: () => makeFakeNotifier(),
    });

    const result = await svc.startScrcpy('dev:5555', {});

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.process, undefined, 'H2: 不再返回 process (消除句柄泄漏)');
    assert.strictEqual(stdoutResumed, true);
    assert.strictEqual(stderrResumed, true);
  } finally {
    Object.defineProperty(process, 'platform', originalPlatform);
  }
});

// H2: crash 检测下沉测试

test('H2: child error 事件触发 notifier.notify({error: msg})', async () => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

  try {
    const fakeChild = new EventEmitter();
    fakeChild.stdout = { resume: () => {} };
    fakeChild.stderr = { resume: () => {} };
    const spawner = { spawn: () => fakeChild };
    const notifier = makeFakeNotifier();
    const svc = new ScrcpyService('/proj', makeFakeI18n(), {
      processSpawnerFactory: () => spawner,
      pathResolverFactory: () => makeFakePathResolver('/usr/bin/scrcpy'),
      loggerFactory: () => makeFakeLogger(),
      notifierFactory: () => notifier,
    });

    await svc.startScrcpy('dev:5555', {});

    // 触发 child error 事件
    fakeChild.emit('error', new Error('spawn ENOENT'));

    assert.strictEqual(notifier.calls.length, 1, 'error 事件触发 1 次 notify');
    assert.strictEqual(notifier.calls[0].error, 'spawn ENOENT');
  } finally {
    Object.defineProperty(process, 'platform', originalPlatform);
  }
});

test('H2: child error 事件 (无 message) 触发 notifier.notify({error: "Unknown spawn error"})', async () => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

  try {
    const fakeChild = new EventEmitter();
    fakeChild.stdout = { resume: () => {} };
    fakeChild.stderr = { resume: () => {} };
    const spawner = { spawn: () => fakeChild };
    const notifier = makeFakeNotifier();
    const svc = new ScrcpyService('/proj', makeFakeI18n(), {
      processSpawnerFactory: () => spawner,
      pathResolverFactory: () => makeFakePathResolver('/usr/bin/scrcpy'),
      loggerFactory: () => makeFakeLogger(),
      notifierFactory: () => notifier,
    });

    await svc.startScrcpy('dev:5555', {});

    // 触发 child error 事件 (无 message 字段)
    fakeChild.emit('error', {});

    assert.strictEqual(notifier.calls.length, 1);
    assert.strictEqual(notifier.calls[0].error, 'Unknown spawn error');
  } finally {
    Object.defineProperty(process, 'platform', originalPlatform);
  }
});

test('H2: child close 在 CRASH_WINDOW 内非 0 退出触发 notifier.notify({error:"crash",code,signal})', async () => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

  try {
    const fakeChild = new EventEmitter();
    fakeChild.stdout = { resume: () => {} };
    fakeChild.stderr = { resume: () => {} };
    const spawner = { spawn: () => fakeChild };
    const notifier = makeFakeNotifier();
    const svc = new ScrcpyService('/proj', makeFakeI18n(), {
      processSpawnerFactory: () => spawner,
      pathResolverFactory: () => makeFakePathResolver('/usr/bin/scrcpy'),
      loggerFactory: () => makeFakeLogger(),
      notifierFactory: () => notifier,
    });

    await svc.startScrcpy('dev:5555', {});

    // 立即触发 close (elapsed < SCRCPY_CRASH_WINDOW_MS), code=1 非 0
    fakeChild.emit('close', 1, 'SIGTERM');

    assert.strictEqual(notifier.calls.length, 1, 'crash 触发 1 次 notify');
    assert.strictEqual(notifier.calls[0].error, 'crash');
    assert.strictEqual(notifier.calls[0].code, 1);
    assert.strictEqual(notifier.calls[0].signal, 'SIGTERM');
  } finally {
    Object.defineProperty(process, 'platform', originalPlatform);
  }
});

test('H2: child close 在 CRASH_WINDOW 外退出不触发 notifier', async () => {
  const { mock } = require('node:test');
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
  // P2-9: fake Date 推进时间 (原真实等待 2050ms, 拖慢全量)
  mock.timers.enable({ apis: ['Date'] });

  try {
    const fakeChild = new EventEmitter();
    fakeChild.stdout = { resume: () => {} };
    fakeChild.stderr = { resume: () => {} };
    const spawner = { spawn: () => fakeChild };
    const notifier = makeFakeNotifier();
    const svc = new ScrcpyService('/proj', makeFakeI18n(), {
      processSpawnerFactory: () => spawner,
      pathResolverFactory: () => makeFakePathResolver('/usr/bin/scrcpy'),
      loggerFactory: () => makeFakeLogger(),
      notifierFactory: () => notifier,
    });

    await svc.startScrcpy('dev:5555', {});

    // P2-9: 推进超过 SCRCPY_CRASH_WINDOW_MS 再触发 close (原 setTimeout 真实等待)
    mock.timers.tick(SCRCPY_CRASH_WINDOW_MS + 50);
    fakeChild.emit('close', 1, null);

    assert.strictEqual(notifier.calls.length, 0, '超时退出不视为 crash, 不触发 notify');
  } finally {
    mock.timers.reset();
    Object.defineProperty(process, 'platform', originalPlatform);
  }
});

test('H2: child close code=0 正常退出不触发 notifier', async () => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

  try {
    const fakeChild = new EventEmitter();
    fakeChild.stdout = { resume: () => {} };
    fakeChild.stderr = { resume: () => {} };
    const spawner = { spawn: () => fakeChild };
    const notifier = makeFakeNotifier();
    const svc = new ScrcpyService('/proj', makeFakeI18n(), {
      processSpawnerFactory: () => spawner,
      pathResolverFactory: () => makeFakePathResolver('/usr/bin/scrcpy'),
      loggerFactory: () => makeFakeLogger(),
      notifierFactory: () => notifier,
    });

    await svc.startScrcpy('dev:5555', {});

    // 立即触发 close, code=0 正常退出
    fakeChild.emit('close', 0, null);

    assert.strictEqual(notifier.calls.length, 0, 'code=0 正常退出不触发 notify');
  } finally {
    Object.defineProperty(process, 'platform', originalPlatform);
  }
});

test('H2: SCRCPY_CRASH_WINDOW_MS = 2000 (模块常量导出)', () => {
  assert.strictEqual(SCRCPY_CRASH_WINDOW_MS, 2000);
});

// M1: stopScrcpy 生命周期管理测试

test('M1: stopScrcpy 无 child 时安全 no-op', () => {
  const svc = new ScrcpyService('/proj', makeFakeI18n(), {
    processSpawnerFactory: () => makeFakeSpawner(),
    pathResolverFactory: () => makeFakePathResolver('/scrcpy.exe'),
    loggerFactory: () => makeFakeLogger(),
  });
  assert.strictEqual(svc._child, null);
  svc.stopScrcpy();  // 不抛错
  assert.strictEqual(svc._child, null);
});

test('M1: startScrcpy 持有 child 引用 (svc._child 非 null)', async () => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
  try {
    const fakeChild = new EventEmitter();
    fakeChild.kill = () => {};
    fakeChild.stdout = { resume: () => {} };
    fakeChild.stderr = { resume: () => {} };
    const spawner = { spawn: () => fakeChild };
    const svc = new ScrcpyService('/proj', makeFakeI18n(), {
      processSpawnerFactory: () => spawner,
      pathResolverFactory: () => makeFakePathResolver('/usr/bin/scrcpy'),
      loggerFactory: () => makeFakeLogger(),
    });
    await svc.startScrcpy('dev:5555', {});
    assert.strictEqual(svc._child, fakeChild, 'M1: _child 持有 spawn 返回的 child');
  } finally {
    Object.defineProperty(process, 'platform', originalPlatform);
  }
});

test('M1: stopScrcpy kill child + 置 null', async () => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
  try {
    let killCalled = 0;
    const fakeChild = new EventEmitter();
    fakeChild.kill = () => { killCalled++; };
    fakeChild.stdout = { resume: () => {} };
    fakeChild.stderr = { resume: () => {} };
    const spawner = { spawn: () => fakeChild };
    const svc = new ScrcpyService('/proj', makeFakeI18n(), {
      processSpawnerFactory: () => spawner,
      pathResolverFactory: () => makeFakePathResolver('/usr/bin/scrcpy'),
      loggerFactory: () => makeFakeLogger(),
    });
    await svc.startScrcpy('dev:5555', {});
    assert.strictEqual(svc._child, fakeChild);
    svc.stopScrcpy();
    assert.strictEqual(killCalled, 1, 'child.kill() 调 1 次');
    assert.strictEqual(svc._child, null, '_child 置 null');
  } finally {
    Object.defineProperty(process, 'platform', originalPlatform);
  }
});

test('M1: startScrcpy 先停旧进程 (多次调用不累积)', async () => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
  try {
    let killCalled = 0;
    const makeChild = () => {
      const c = new EventEmitter();
      c.kill = () => { killCalled++; };
      c.stdout = { resume: () => {} };
      c.stderr = { resume: () => {} };
      return c;
    };
    const spawner = { spawn: () => makeChild() };
    const svc = new ScrcpyService('/proj', makeFakeI18n(), {
      processSpawnerFactory: () => spawner,
      pathResolverFactory: () => makeFakePathResolver('/usr/bin/scrcpy'),
      loggerFactory: () => makeFakeLogger(),
    });
    await svc.startScrcpy('dev:5555', {});
    await svc.startScrcpy('dev:5555', {});
    assert.strictEqual(killCalled, 1, '第二次 startScrcpy 前停旧 child, kill 调 1 次');
  } finally {
    Object.defineProperty(process, 'platform', originalPlatform);
  }
});

test('M1: child close 后 _child 置 null (stopScrcpy 不重复 kill)', async () => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
  try {
    let killCalled = 0;
    const fakeChild = new EventEmitter();
    fakeChild.kill = () => { killCalled++; };
    fakeChild.stdout = { resume: () => {} };
    fakeChild.stderr = { resume: () => {} };
    const spawner = { spawn: () => fakeChild };
    const svc = new ScrcpyService('/proj', makeFakeI18n(), {
      processSpawnerFactory: () => spawner,
      pathResolverFactory: () => makeFakePathResolver('/usr/bin/scrcpy'),
      loggerFactory: () => makeFakeLogger(),
    });
    await svc.startScrcpy('dev:5555', {});
    fakeChild.emit('close', 0, null);  // 正常退出
    assert.strictEqual(svc._child, null, 'close 后 _child 置 null');
    svc.stopScrcpy();
    assert.strictEqual(killCalled, 0, 'close 后 stopScrcpy 不再 kill');
  } finally {
    Object.defineProperty(process, 'platform', originalPlatform);
  }
});

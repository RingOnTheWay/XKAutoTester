// ScrcpyService 单测 — 3 factory (processSpawner + pathResolver + logger) + buildScrcpyArgs 纯函数。
// 验证: constructor 收 3 factory + buildScrcpyArgs (全参数/空) + startScrcpy (路径未找到/win32/非 win32/spawn 抛错)。
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const SCRCPY_SERVICE_PATH = path.join(
  __dirname, '..', '..', 'electron', 'src', 'main', 'services', 'ScrcpyService.js'
);
const { ScrcpyService, buildScrcpyArgs } = require(SCRCPY_SERVICE_PATH);

// ── Fakes ──────────────────────────────────────────────

function makeFakeSpawner() {
  const calls = [];
  return {
    calls,
    spawn: (cmd, args, opts) => {
      calls.push({ cmd, args, opts });
      return {
        stdout: { resume: () => {} },
        stderr: { resume: () => {} },
      };
    },
  };
}

function makeFakePathResolver(scrcpyPath) {
  return { findScrcpyPath: () => scrcpyPath };
}

function makeFakeLogger() {
  const calls = [];
  return { calls, error: (msg) => calls.push(msg) };
}

function makeFakeI18n() {
  return { t: (key, opts) => `i18n:${key}:${JSON.stringify(opts)}` };
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

// ── constructor ────────────────────────────────────────

test('constructor 收 3 factory + 3 实例建', () => {
  const spawner = makeFakeSpawner();
  const resolver = makeFakePathResolver('/scrcpy.exe');
  const logger = makeFakeLogger();

  const svc = new ScrcpyService('/proj', makeFakeI18n(), {
    processSpawnerFactory: () => spawner,
    pathResolverFactory: () => resolver,
    loggerFactory: () => logger,
  });

  assert.strictEqual(svc._spawner, spawner);
  assert.strictEqual(svc._pathResolver, resolver);
  assert.strictEqual(svc._logger, logger);
  assert.strictEqual(svc.projectRoot, '/proj');
});

// ── startScrcpy ────────────────────────────────────────

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

test('startScrcpy win32 调 spawner.spawn("cmd.exe", ["/c", scrcpyPath, ...args])', async () => {
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
    assert.strictEqual(spawner.calls[0].cmd, 'cmd.exe');
    assert.deepStrictEqual(spawner.calls[0].args, [
      '/c', '/proj/env/scrcpy/scrcpy.exe',
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
    assert.strictEqual(spawner.calls[0].opts.windowsHide, undefined);
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

test('startScrcpy 成功返 {success:true, process:child} + child.stdout.resume 调用', async () => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

  try {
    let stdoutResumed = false;
    let stderrResumed = false;
    const fakeChild = {
      stdout: { resume: () => { stdoutResumed = true; } },
      stderr: { resume: () => { stderrResumed = true; } },
    };
    const spawner = { spawn: () => fakeChild };
    const svc = new ScrcpyService('/proj', makeFakeI18n(), {
      processSpawnerFactory: () => spawner,
      pathResolverFactory: () => makeFakePathResolver('/usr/bin/scrcpy'),
      loggerFactory: () => makeFakeLogger(),
    });

    const result = await svc.startScrcpy('dev:5555', {});

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.process, fakeChild);
    assert.strictEqual(stdoutResumed, true);
    assert.strictEqual(stderrResumed, true);
  } finally {
    Object.defineProperty(process, 'platform', originalPlatform);
  }
});

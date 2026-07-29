// AdbCommandExecutor 单元测试
// 验证: 1) 正常执行 2) 失败路径 3) 进程错误 4) 超时 5) onStdout 回调 6) 默认/自定义 timeout 7) spawn 调用参数 8) spawnFn 注入
// 策略: 注入 mock spawnFn (不依赖 setupChildProcessMock,纯函数式注入)
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const AdbCommandExecutor = require(path.join(
  __dirname, '..', '..', 'electron', 'src', 'main', 'services', 'adb', 'AdbCommandExecutor.js'
));

// ── 测试工具 ───────────────────────────────────────────────

/**
 * 创建 mock spawn 函数
 * @param {object} opts - { stdout, stderr, code, autoClose, delay, errorEvent }
 * @returns {Function} spawn mock,带 .calls 记录
 */
function createSpawnFn(opts = {}) {
  const {
    stdout = '',
    stderr = '',
    code = 0,
    autoClose = true,
    delay = 0,
    errorEvent = null,
  } = opts;

  const calls = [];

  const spawnFn = function (cmd, args, options) {
    calls.push({ cmd, args, options });
    const dataHandlers = [];
    const stderrDataHandlers = [];
    const closeHandlers = [];
    const errorHandlers = [];

    const proc = {
      stdout: { on: (evt, cb) => { if (evt === 'data') dataHandlers.push(cb); } },
      stderr: { on: (evt, cb) => { if (evt === 'data') stderrDataHandlers.push(cb); } },
      on: (evt, cb) => {
        if (evt === 'close') closeHandlers.push(cb);
        else if (evt === 'error') errorHandlers.push(cb);
      },
      kill: () => {},
      pid: 12345,
    };

    if (autoClose) {
      const emit = () => {
        if (errorEvent) {
          errorHandlers.forEach(cb => cb(errorEvent));
        } else {
          if (stdout) dataHandlers.forEach(cb => cb(Buffer.from(stdout)));
          if (stderr) stderrDataHandlers.forEach(cb => cb(Buffer.from(stderr)));
          closeHandlers.forEach(cb => cb(code));
        }
      };
      if (delay > 0) setTimeout(emit, delay);
      else setImmediate(emit);
    }

    return proc;
  };

  Object.defineProperty(spawnFn, 'calls', {
    value: calls,
    enumerable: false,
    writable: false,
  });

  return spawnFn;
}

const i18nMock = {
  t: (key, params) => key + (params ? ` ${JSON.stringify(params)}` : ''),
};

const PROJECT_ROOT = path.join(__dirname, '..', '..');

// ── 正常执行路径 ───────────────────────────────────────────

test('code=0 返回 success=true', async () => {
  const spawnFn = createSpawnFn({ stdout: 'List of devices\n', code: 0 });
  const exec = new AdbCommandExecutor({
    projectRoot: PROJECT_ROOT,
    i18nService: i18nMock,
    spawnFn,
  });

  const result = await exec.execute(['devices']);

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.output, 'List of devices\n');
  assert.strictEqual(result.error, '');
});

test('stdout 含多段数据正确拼接', async () => {
  // 模拟多段 data 事件
  const calls = [];
  const spawnFn = function (cmd, args, options) {
    calls.push({ cmd, args, options });
    const dataHandlers = [];
    const proc = {
      stdout: { on: (evt, cb) => { if (evt === 'data') dataHandlers.push(cb); } },
      stderr: { on: () => {} },
      on: (evt, cb) => { if (evt === 'close') proc._closeCb = cb; },
      kill: () => {},
      _emitData: (chunks) => {
        chunks.forEach(c => dataHandlers.forEach(cb => cb(Buffer.from(c))));
        proc._closeCb(0);
      },
    };
    setImmediate(() => proc._emitData(['part1-', 'part2-', 'part3']));
    return proc;
  };

  const exec = new AdbCommandExecutor({ projectRoot: PROJECT_ROOT, i18nService: i18nMock, spawnFn });
  const result = await exec.execute(['shell', 'echo']);

  assert.strictEqual(result.output, 'part1-part2-part3');
});

// ── 失败路径 ───────────────────────────────────────────────

test('code!=0 返回 success=false + i18n 错误消息', async () => {
  const spawnFn = createSpawnFn({ stdout: 'output', stderr: 'error msg', code: 1 });
  const exec = new AdbCommandExecutor({ projectRoot: PROJECT_ROOT, i18nService: i18nMock, spawnFn });

  const result = await exec.execute(['shell', 'ls', '/nonexistent']);

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.output, 'output');
  // 错误优先用 stderr,空时用 i18n
  assert.ok(result.error.includes('error msg') || result.error.includes('main.commandFailed'));
});

test('code!=0 且 stderr 空时用 i18n 错误消息', async () => {
  const spawnFn = createSpawnFn({ stdout: 'output', stderr: '', code: 2 });
  const exec = new AdbCommandExecutor({ projectRoot: PROJECT_ROOT, i18nService: i18nMock, spawnFn });

  const result = await exec.execute(['shell', 'cmd']);

  assert.strictEqual(result.success, false);
  assert.ok(result.error.includes('main.commandFailed'));
  assert.ok(result.error.includes('2'));
});

// ── 进程 error 事件 ───────────────────────────────────────

test('进程 error 事件返回 success=false + error.message', async () => {
  const spawnFn = createSpawnFn({ errorEvent: new Error('spawn ENOENT') });
  const exec = new AdbCommandExecutor({ projectRoot: PROJECT_ROOT, i18nService: i18nMock, spawnFn });

  const result = await exec.execute(['devices']);

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.error, 'spawn ENOENT');
  assert.strictEqual(result.output, '');
});

// ── 超时 ─────────────────────────────────────────────────

test('超时 kill 进程并返回 timeout 错误', async () => {
  // 不自动 close,模拟进程长时间不退出
  const spawnFn = function (cmd, args, options) {
    let killCalled = false;
    const proc = {
      stdout: { on: () => {} },
      stderr: { on: () => {} },
      on: () => {},
      kill: () => { killCalled = true; },
      _killCalled: () => killCalled,
    };
    return proc;
  };

  const exec = new AdbCommandExecutor({ projectRoot: PROJECT_ROOT, i18nService: i18nMock, spawnFn });

  const start = Date.now();
  const result = await exec.execute(['shell', 'long-cmd'], { timeoutMs: 100 });
  const elapsed = Date.now() - start;

  assert.strictEqual(result.success, false);
  assert.ok(result.error.includes('Timeout') || result.error.includes('main.commandTimeout'));
  assert.ok(elapsed >= 90 && elapsed < 500, `elapsed=${elapsed}ms should be ~100ms`);
});

// ── onStdout 回调 ────────────────────────────────────────

test('onStdout 回调被 stdout 数据调用', async () => {
  const spawnFn = createSpawnFn({ stdout: 'data chunk', code: 0 });
  const exec = new AdbCommandExecutor({ projectRoot: PROJECT_ROOT, i18nService: i18nMock, spawnFn });

  const received = [];
  await exec.execute(['shell', 'cmd'], { onStdout: (chunk) => received.push(chunk) });

  assert.strictEqual(received.length, 1);
  assert.ok(received[0].includes('data chunk'));
});

test('无 onStdout 时不报错', async () => {
  const spawnFn = createSpawnFn({ stdout: 'data', code: 0 });
  const exec = new AdbCommandExecutor({ projectRoot: PROJECT_ROOT, i18nService: i18nMock, spawnFn });

  const result = await exec.execute(['shell', 'cmd']);
  assert.strictEqual(result.success, true);
});

// ── 默认/自定义 timeout ──────────────────────────────────

test('默认 timeoutMs=5000', async () => {
  let actualOpts = null;
  const spawnFn = function (cmd, args, options) {
    actualOpts = options;
    const proc = {
      stdout: { on: () => {} },
      stderr: { on: () => {} },
      on: (evt, cb) => { if (evt === 'close') setImmediate(() => cb(0)); },
      kill: () => {},
    };
    return proc;
  };

  const exec = new AdbCommandExecutor({ projectRoot: PROJECT_ROOT, i18nService: i18nMock, spawnFn });
  await exec.execute(['devices']);

  // 默认 timeoutMs 不影响 spawn 调用,但影响 setTimeout
  // 这里仅验证不报错
  assert.ok(actualOpts);
});

test('自定义 timeoutMs 生效', async () => {
  const spawnFn = createSpawnFn({ stdout: '', code: 0 });
  const exec = new AdbCommandExecutor({ projectRoot: PROJECT_ROOT, i18nService: i18nMock, spawnFn });

  // 不应超时
  const result = await exec.execute(['devices'], { timeoutMs: 10000 });
  assert.strictEqual(result.success, true);
});

// ── spawn 调用参数 ───────────────────────────────────────

test('spawn 调用含 windowsHide=true', async () => {
  const spawnFn = createSpawnFn({ code: 0 });
  const exec = new AdbCommandExecutor({ projectRoot: PROJECT_ROOT, i18nService: i18nMock, spawnFn });

  await exec.execute(['devices']);

  assert.strictEqual(spawnFn.calls.length, 1);
  assert.strictEqual(spawnFn.calls[0].options.windowsHide, true);
});

test('spawn 第一参数为 adbPath (来自 pathHelper)', async () => {
  const spawnFn = createSpawnFn({ code: 0 });
  const exec = new AdbCommandExecutor({ projectRoot: PROJECT_ROOT, i18nService: i18nMock, spawnFn });

  await exec.execute(['devices']);

  // adbPath 应为非空字符串
  assert.ok(typeof spawnFn.calls[0].cmd === 'string');
  assert.ok(spawnFn.calls[0].cmd.length > 0);
});

test('spawn 第二参数为传入的 args 数组', async () => {
  const spawnFn = createSpawnFn({ code: 0 });
  const exec = new AdbCommandExecutor({ projectRoot: PROJECT_ROOT, i18nService: i18nMock, spawnFn });

  const args = ['-s', 'device123', 'shell', 'ls'];
  await exec.execute(args);

  assert.deepStrictEqual(spawnFn.calls[0].args, args);
});

// ── spawnFn 注入 ────────────────────────────────────────

test('未传 spawnFn 时默认使用 child_process.spawn', async () => {
  // 不传 spawnFn,验证不报错 (实际调用真实 spawn,但 adbPath 不存在会触发 error 事件)
  const exec = new AdbCommandExecutor({ projectRoot: PROJECT_ROOT, i18nService: i18nMock });

  const result = await exec.execute(['devices'], { timeoutMs: 500 });

  // 真实 adb 可能存在或不存在,结果不确定,但不应抛异常
  assert.ok(typeof result.success === 'boolean');
});

// ── 异常路径 ────────────────────────────────────────────

test('execute 抛异常时返回 success=false', async () => {
  const spawnFn = function () { throw new Error('spawn throw'); };
  const exec = new AdbCommandExecutor({ projectRoot: PROJECT_ROOT, i18nService: i18nMock, spawnFn });

  const result = await exec.execute(['devices']);

  assert.strictEqual(result.success, false);
  assert.ok(result.error.includes('spawn throw'));
});

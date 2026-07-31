// spawnHelper 单元测试
// 验证: 1) 收集 stdout/stderr 并返回 code 2) spawn error 时 reject 3) windowsHide 强制 true
//      4) env 合并 process.env + options.env 5) 默认参数 (args=[], options={})
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const Module = require('module');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const SPAWN_HELPER_PATH = path.join(
  PROJECT_ROOT, 'electron', 'src', 'main', 'services', 'spawnHelper.js'
);

const {
  setupChildProcessMock,
} = require(path.join(__dirname, 'helpers', 'serviceMock.js'));

function loadSpawnHelper() {
  delete require.cache[require.resolve(SPAWN_HELPER_PATH)];
  return require(SPAWN_HELPER_PATH);
}

// 构造可观察的 spawn mock: 记录传入参数 + 可控制输出
function createControllableSpawn(opts = {}) {
  const calls = [];
  const {
    stdout = '',
    stderr = '',
    code = 0,
    error = null,
    delay = 0,
  } = opts;

  const spawnMock = function (cmd, args, options) {
    calls.push({ cmd, args, options });
    const stdoutCbs = [];
    const stderrCbs = [];
    const closeCbs = [];
    const errorCbs = [];

    const proc = {
      stdout: { on: (evt, cb) => { if (evt === 'data') stdoutCbs.push(cb); } },
      stderr: { on: (evt, cb) => { if (evt === 'data') stderrCbs.push(cb); } },
      on: (evt, cb) => {
        if (evt === 'close') closeCbs.push(cb);
        else if (evt === 'error') errorCbs.push(cb);
      },
      kill: () => {},
    };

    const emit = () => {
      if (error) {
        errorCbs.forEach(cb => cb(error));
        return;
      }
      if (stdout) stdoutCbs.forEach(cb => cb(Buffer.from(stdout)));
      if (stderr) stderrCbs.forEach(cb => cb(Buffer.from(stderr)));
      closeCbs.forEach(cb => cb(code));
    };

    if (delay > 0) {
      setTimeout(emit, delay);
    } else {
      setImmediate(emit);
    }

    return proc;
  };

  spawnMock.calls = calls;
  return spawnMock;
}


// ─── 基本调用 ─────────────────────────────────────────────────

test('executeCommand 收集 stdout/stderr 并返回 code', async () => {
  const spawnMock = createControllableSpawn({
    stdout: 'hello world',
    stderr: 'warning msg',
    code: 0,
  });
  const restore = setupChildProcessMock({ spawn: spawnMock });

  try {
    const { executeCommand } = loadSpawnHelper();
    const result = await executeCommand('python', ['--version']);

    assert.strictEqual(result.code, 0);
    assert.strictEqual(result.stdout, 'hello world');
    assert.strictEqual(result.stderr, 'warning msg');
  } finally {
    restore();
  }
});

test('executeCommand 默认参数 (args=[], options={})', async () => {
  const spawnMock = createControllableSpawn({ stdout: 'ok', code: 0 });
  const restore = setupChildProcessMock({ spawn: spawnMock });

  try {
    const { executeCommand } = loadSpawnHelper();
    await executeCommand('cmd');

    assert.strictEqual(spawnMock.calls.length, 1);
    assert.deepStrictEqual(spawnMock.calls[0].args, []);
    assert.deepStrictEqual(spawnMock.calls[0].options.windowsHide, true);
  } finally {
    restore();
  }
});

test('executeCommand stdout/stderr 自动 trim', async () => {
  const spawnMock = createControllableSpawn({
    stdout: '  padded  \n',
    stderr: '  err  \n',
    code: 0,
  });
  const restore = setupChildProcessMock({ spawn: spawnMock });

  try {
    const { executeCommand } = loadSpawnHelper();
    const result = await executeCommand('cmd', []);

    assert.strictEqual(result.stdout, 'padded');
    assert.strictEqual(result.stderr, 'err');
  } finally {
    restore();
  }
});


// ─── 错误处理 ─────────────────────────────────────────────────

test('executeCommand spawn error 时 reject', async () => {
  const spawnMock = createControllableSpawn({ error: new Error('ENOENT') });
  const restore = setupChildProcessMock({ spawn: spawnMock });

  try {
    const { executeCommand } = loadSpawnHelper();
    await assert.rejects(
      executeCommand('nonexistent-cmd', []),
      /ENOENT/
    );
  } finally {
    restore();
  }
});


// ─── windowsHide 强制 ────────────────────────────────────────

test('executeCommand 强制 windowsHide: true (即使 options 指定 false)', async () => {
  const spawnMock = createControllableSpawn({ stdout: '', code: 0 });
  const restore = setupChildProcessMock({ spawn: spawnMock });

  try {
    const { executeCommand } = loadSpawnHelper();
    await executeCommand('cmd', [], { windowsHide: false });

    assert.strictEqual(
      spawnMock.calls[0].options.windowsHide, true,
      '应强制 windowsHide: true 避免弹出控制台窗口'
    );
  } finally {
    restore();
  }
});


// ─── env 合并 ──────────────────────────────────────────────────

test('executeCommand 合并 process.env + options.env', async () => {
  const spawnMock = createControllableSpawn({ stdout: '', code: 0 });
  const restore = setupChildProcessMock({ spawn: spawnMock });

  // 保存原始 process.env 字段
  const originalLang = process.env.LANG;
  process.env.LANG = 'en_US.UTF-8';

  try {
    const { executeCommand } = loadSpawnHelper();
    await executeCommand('cmd', [], { env: { CUSTOM_VAR: 'custom_value' } });

    const env = spawnMock.calls[0].options.env;
    assert.strictEqual(env.LANG, 'en_US.UTF-8', '应包含 process.env 字段');
    assert.strictEqual(env.CUSTOM_VAR, 'custom_value', '应合并 options.env 字段');
  } finally {
    if (originalLang === undefined) delete process.env.LANG;
    else process.env.LANG = originalLang;
    restore();
  }
});

test('executeCommand options.env 覆盖 process.env 同名字段', async () => {
  const spawnMock = createControllableSpawn({ stdout: '', code: 0 });
  const restore = setupChildProcessMock({ spawn: spawnMock });

  const originalPath = process.env.PATH;
  process.env.PATH = '/original/path';

  try {
    const { executeCommand } = loadSpawnHelper();
    await executeCommand('cmd', [], { env: { PATH: '/custom/path' } });

    assert.strictEqual(
      spawnMock.calls[0].options.env.PATH, '/custom/path',
      'options.env 应覆盖 process.env 同名字段'
    );
  } finally {
    process.env.PATH = originalPath;
    restore();
  }
});


// ─── 多次调用独立 ─────────────────────────────────────────────

test('executeCommand 多次调用互不干扰', async () => {
  let callCount = 0;
  const spawnMock = function (cmd, args, options) {
    const currentCount = ++callCount;
    const closeCbs = [];
    const stdoutCbs = [];
    const proc = {
      stdout: { on: (evt, cb) => { if (evt === 'data') stdoutCbs.push(cb); } },
      stderr: { on: () => {} },
      on: (evt, cb) => { if (evt === 'close') closeCbs.push(cb); },
      kill: () => {},
    };
    setImmediate(() => {
      stdoutCbs.forEach(cb => cb(Buffer.from(`out-${currentCount}`)));
      closeCbs.forEach(cb => cb(0));
    });
    return proc;
  };
  const restore = setupChildProcessMock({ spawn: spawnMock });

  try {
    const { executeCommand } = loadSpawnHelper();
    const [r1, r2, r3] = await Promise.all([
      executeCommand('a'),
      executeCommand('b'),
      executeCommand('c'),
    ]);

    assert.strictEqual(r1.stdout, 'out-1');
    assert.strictEqual(r2.stdout, 'out-2');
    assert.strictEqual(r3.stdout, 'out-3');
  } finally {
    restore();
  }
});

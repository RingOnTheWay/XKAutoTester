// Aapt2Invoker 单元测试
// 验证: 1) resolvePath 委托 pathHelper 2) dumpBadging spawn 成功 3) 错误分类 (ENOENT/EACCES/stderr ERROR/invalid APK/timeout/通用)
// 策略: 构造注入 spawnFn + mock pathHelper (Module._load override)
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const Module = require('module');

const AAPT2_INVOKER_PATH = path.join(
  __dirname, '..', '..', 'electron', 'src', 'main', 'services', 'apk', 'Aapt2Invoker.js'
);
const PATH_HELPER_PATH = path.join(
  __dirname, '..', '..', 'electron', 'src', 'main', 'utils', 'pathHelper.js'
);

// ── mock 工厂 ──────────────────────────────────────────────

function setupPathHelperMock(aapt2Path) {
  const origLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === '../../utils/pathHelper' || request === '../utils/pathHelper') {
      return { getAapt2Path: () => aapt2Path };
    }
    return origLoad.call(this, request, parent, isMain);
  };
  return () => { Module._load = origLoad; };
}

function createSpawnMock(opts = {}) {
  const {
    stdoutChunks = [],
    stderrChunks = [],
    code = 0,
    errorEvent = null,
    delay = 0,
  } = opts;

  const capturedCalls = [];

  const spawnFn = function (cmd, args, spawnOpts) {
    capturedCalls.push({ cmd, args, opts: spawnOpts });
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
      pid: 1,
    };

    const trigger = () => {
      if (errorEvent) {
        errorCbs.forEach(cb => cb(errorEvent));
        return;
      }
      stdoutChunks.forEach(c => stdoutCbs.forEach(cb => cb(Buffer.from(c))));
      stderrChunks.forEach(c => stderrCbs.forEach(cb => cb(Buffer.from(c))));
      closeCbs.forEach(cb => cb(code));
    };

    if (delay > 0) setTimeout(trigger, delay);
    else setImmediate(trigger);

    return proc;
  };

  Object.defineProperty(spawnFn, 'calls', {
    value: capturedCalls, enumerable: false, writable: false,
  });

  return spawnFn;
}

const i18nMock = {
  t: (key, params) => {
    if (params && Object.keys(params).length > 0) {
      return `${key}:${JSON.stringify(params)}`;
    }
    return key;
  },
};

function loadInvoker() {
  delete require.cache[require.resolve(AAPT2_INVOKER_PATH)];
  delete require.cache[require.resolve(PATH_HELPER_PATH)];
  return require(AAPT2_INVOKER_PATH);
}

const PROJECT_ROOT = path.join(__dirname, '..', '..');

// ── resolvePath 测试 ──────────────────────────────────────

test('resolvePath 委托 pathHelper.getAapt2Path 返回路径', async () => {
  const restore = setupPathHelperMock('/fake/aapt2.exe');
  try {
    const Aapt2Invoker = loadInvoker();
    const invoker = new Aapt2Invoker({
      projectRoot: PROJECT_ROOT,
      i18nService: i18nMock,
      spawnFn: createSpawnMock(),
    });

    const result = await invoker.resolvePath();

    assert.strictEqual(result, '/fake/aapt2.exe');
  } finally {
    restore();
  }
});

// ── dumpBadging 成功路径 ──────────────────────────────────

test('dumpBadging 成功返回 stdout', async () => {
  const restore = setupPathHelperMock('/fake/aapt2.exe');
  try {
    const Aapt2Invoker = loadInvoker();
    const spawnFn = createSpawnMock({
      stdoutChunks: ["package: name='com.example' versionCode='1'\n"],
    });
    const invoker = new Aapt2Invoker({
      projectRoot: PROJECT_ROOT,
      i18nService: i18nMock,
      spawnFn,
    });

    const result = await invoker.dumpBadging('/fake/aapt2.exe', '/path/app.apk');

    assert.strictEqual(result.success, true);
    assert.ok(result.output.includes("package: name='com.example'"));
    // 验证 spawn 参数: 无 shell, arg 数组
    assert.strictEqual(spawnFn.calls[0].args[0], 'dump');
    assert.strictEqual(spawnFn.calls[0].args[1], 'badging');
    assert.strictEqual(spawnFn.calls[0].args[2], '/path/app.apk');
    // 验证 env 含 LANG/LC_ALL
    assert.strictEqual(spawnFn.calls[0].opts.env.LANG, 'en_US.UTF-8');
    assert.strictEqual(spawnFn.calls[0].opts.env.LC_ALL, 'en_US.UTF-8');
    assert.strictEqual(spawnFn.calls[0].opts.windowsHide, true);
  } finally {
    restore();
  }
});

// ── dumpBadging 错误分类 ──────────────────────────────────

test('dumpBadging ENOENT 错误返回 aapt2NotFound', async () => {
  const restore = setupPathHelperMock('/fake/aapt2.exe');
  try {
    const Aapt2Invoker = loadInvoker();
    const spawnFn = createSpawnMock({
      errorEvent: Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }),
    });
    const invoker = new Aapt2Invoker({
      projectRoot: PROJECT_ROOT, i18nService: i18nMock, spawnFn,
    });

    const result = await invoker.dumpBadging('/fake/aapt2.exe', '/path/app.apk');

    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('aapt2NotFound'));
  } finally {
    restore();
  }
});

test('dumpBadging EACCES 错误返回 permissionDenied', async () => {
  const restore = setupPathHelperMock('/fake/aapt2.exe');
  try {
    const Aapt2Invoker = loadInvoker();
    const spawnFn = createSpawnMock({
      errorEvent: Object.assign(new Error('spawn EACCES'), { code: 'EACCES' }),
    });
    const invoker = new Aapt2Invoker({
      projectRoot: PROJECT_ROOT, i18nService: i18nMock, spawnFn,
    });

    const result = await invoker.dumpBadging('/fake/aapt2.exe', '/path/app.apk');

    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('permissionDenied'));
  } finally {
    restore();
  }
});

test('dumpBadging stderr 含 ERROR: 返回 fileCorrupted', async () => {
  const restore = setupPathHelperMock('/fake/aapt2.exe');
  try {
    const Aapt2Invoker = loadInvoker();
    const spawnFn = createSpawnMock({
      stderrChunks: ['ERROR: Invalid APK format\n'],
      code: 1,
    });
    const invoker = new Aapt2Invoker({
      projectRoot: PROJECT_ROOT, i18nService: i18nMock, spawnFn,
    });

    const result = await invoker.dumpBadging('/fake/aapt2.exe', '/path/app.apk');

    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('fileCorrupted'));
  } finally {
    restore();
  }
});

test('dumpBadging 退出码非 0 且 stderr 无 ERROR 返回 parseFailed', async () => {
  const restore = setupPathHelperMock('/fake/aapt2.exe');
  try {
    const Aapt2Invoker = loadInvoker();
    const spawnFn = createSpawnMock({
      stderrChunks: ['some unknown error\n'],
      code: 2,
    });
    const invoker = new Aapt2Invoker({
      projectRoot: PROJECT_ROOT, i18nService: i18nMock, spawnFn,
    });

    const result = await invoker.dumpBadging('/fake/aapt2.exe', '/path/app.apk');

    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('parseFailed'));
  } finally {
    restore();
  }
});

test('dumpBadging 超时返回 commandTimeout', async () => {
  const restore = setupPathHelperMock('/fake/aapt2.exe');
  try {
    const Aapt2Invoker = loadInvoker();
    // spawn 永不触发 close, 强制超时
    const spawnFn = function (cmd, args, opts) {
      return {
        stdout: { on: () => {} },
        stderr: { on: () => {} },
        on: () => {},
        kill: () => {},
        pid: 1,
      };
    };
    const invoker = new Aapt2Invoker({
      projectRoot: PROJECT_ROOT, i18nService: i18nMock, spawnFn,
      timeoutMs: 100,
    });

    const result = await invoker.dumpBadging('/fake/aapt2.exe', '/path/app.apk');

    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('commandTimeout'));
  } finally {
    restore();
  }
});

// ── maxBuffer 默认值 ─────────────────────────────────────

test('dumpBadging 默认 maxBuffer 为 10MB', async () => {
  const restore = setupPathHelperMock('/fake/aapt2.exe');
  try {
    const Aapt2Invoker = loadInvoker();
    const spawnFn = createSpawnMock({ stdoutChunks: ['ok'] });
    const invoker = new Aapt2Invoker({
      projectRoot: PROJECT_ROOT, i18nService: i18nMock, spawnFn,
    });

    await invoker.dumpBadging('/fake/aapt2.exe', '/path/app.apk');

    assert.strictEqual(spawnFn.calls[0].opts.maxBuffer, 10 * 1024 * 1024);
  } finally {
    restore();
  }
});

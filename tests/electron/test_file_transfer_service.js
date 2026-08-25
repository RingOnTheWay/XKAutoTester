// FileTransferService 单元测试
// 验证: 1) upload push 流程 + monitor 事件 2) upload 失败 3) download 单文件 pull
//      4) download 目录 tar + processTarAndCreateZip 5) _processTarAndCreateZip 调用 tarExtractor + admZip
// 策略: 构造注入所有依赖 (spawnFn/fs/monitor/admZip/tarExtractor/asyncFs), 不依赖 require 拦截
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const FileTransferService = require(path.join(
  __dirname, '..', '..', 'electron', 'src', 'main', 'services', 'adb', 'FileTransferService.js'
));

// ── mock 工厂 ──────────────────────────────────────────────

/**
 * 创建 mock spawn 进程
 * @param {object} opts - { stdoutChunks: string[], stderrChunks: string[], code: number, delay: number }
 * @returns {{proc: object, spawnFn: function}}
 */
function createMockSpawn(opts = {}) {
  const {
    stdoutChunks = [],
    stderrChunks = [],
    code = 0,
    delay = 0,
  } = opts;

  const capturedCalls = [];

  const spawnFn = function (cmd, args, opts) {
    capturedCalls.push({ cmd, args, opts });
    const stdoutCbs = [];
    const stderrCbs = [];
    const closeCbs = [];
    const errorCbs = [];

    const proc = {
      stdout: { on: (evt, cb) => { if (evt === 'data') stdoutCbs.push(cb); }, pipe: () => {} },
      stderr: { on: (evt, cb) => { if (evt === 'data') stderrCbs.push(cb); } },
      on: (evt, cb) => {
        if (evt === 'close') closeCbs.push(cb);
        else if (evt === 'error') errorCbs.push(cb);
      },
      kill: () => {},
      pid: 1,
    };

    const emitAll = () => {
      stdoutChunks.forEach(chunk => stdoutCbs.forEach(cb => cb(Buffer.from(chunk))));
      stderrChunks.forEach(chunk => stderrCbs.forEach(cb => cb(Buffer.from(chunk))));
      closeCbs.forEach(cb => cb(code));
    };

    if (delay > 0) setTimeout(emitAll, delay);
    else setImmediate(emitAll);

    return proc;
  };

  Object.defineProperty(spawnFn, 'calls', {
    value: capturedCalls,
    enumerable: false,
    writable: false,
  });

  return { spawnFn };
}

/**
 * 创建 mock AdbProgressMonitor
 */
function createMockMonitor() {
  const events = [];
  const monitor = {
    emit: (percentage, status, message, error) => {
      events.push({ percentage, status, message, error });
    },
    start: () => {},
    stop: () => {},
  };
  Object.defineProperty(monitor, 'events', {
    value: events,
    enumerable: false,
    writable: false,
  });
  return monitor;
}

/**
 * 创建 mock AdbProgressMonitor 工厂
 */
function createMockMonitorFactory() {
  const monitors = [];
  const factory = (opts) => {
    const m = createMockMonitor();
    monitors.push({ opts, monitor: m });
    return m;
  };
  Object.defineProperty(factory, 'instances', {
    value: monitors,
    enumerable: false,
    writable: false,
  });
  return factory;
}

const i18nMock = { t: (key, params) => key + (params ? JSON.stringify(params) : '') };

// ── upload 测试 ────────────────────────────────────────────

test('upload 成功路径: stat → push → monitor emit success', async () => {
  const { spawnFn } = createMockSpawn({ stdoutChunks: ['file pushed'], code: 0 });
  const monitorFactory = createMockMonitorFactory();
  const fsMock = {
    statSync: () => ({ size: 1024 }),
  };

  const svc = new FileTransferService({
    commandExecutor: { execute: async () => ({ success: true, output: '', error: '' }) },
    remoteStatService: { getFileSize: async () => 0, getDirSize: async () => 0 },
    i18nService: i18nMock,
    tarExtractor: { extract: async () => {} },
    spawnFn,
    fs: fsMock,
    progressMonitorFactory: monitorFactory,
    admZipFactory: () => ({ addFile: () => {}, writeZip: () => {} }),
    asyncFs: {},
  });

  const result = await svc.upload('/local/file.txt', '/sdcard/file.txt', 'dev1', null);

  assert.strictEqual(result.success, true);
  // spawn 被调用 1 次, args 含 -s dev1 push
  assert.strictEqual(spawnFn.calls.length, 1);
  assert.deepStrictEqual(spawnFn.calls[0].args, ['-s', 'dev1', 'push', '/local/file.txt', '/sdcard/file.txt']);
  // monitor 创建 1 个, emit 0% preparing + 100% success
  assert.strictEqual(monitorFactory.instances.length, 1);
  const events = monitorFactory.instances[0].monitor.events;
  assert.ok(events.some(e => e.percentage === 0 && e.status === 'preparing'));
  assert.ok(events.some(e => e.percentage === 100 && e.status === 'success'));
});

test('upload 无 deviceId 时 push args 不含 -s', async () => {
  const { spawnFn } = createMockSpawn({ code: 0 });
  const monitorFactory = createMockMonitorFactory();

  const svc = new FileTransferService({
    commandExecutor: { execute: async () => ({ success: true, output: '', error: '' }) },
    remoteStatService: { getFileSize: async () => 0, getDirSize: async () => 0 },
    i18nService: i18nMock,
    tarExtractor: { extract: async () => {} },
    spawnFn,
    fs: { statSync: () => ({ size: 100 }) },
    progressMonitorFactory: monitorFactory,
    admZipFactory: () => ({ addFile: () => {}, writeZip: () => {} }),
    asyncFs: {},
  });

  await svc.upload('/local/f', '/sdcard/f', null, null);

  assert.deepStrictEqual(spawnFn.calls[0].args, ['push', '/local/f', '/sdcard/f']);
});

test('upload push 失败返回 success=false + monitor emit error', async () => {
  const { spawnFn } = createMockSpawn({
    stderrChunks: ['error: device not found'],
    code: 1,
  });
  const monitorFactory = createMockMonitorFactory();

  const svc = new FileTransferService({
    commandExecutor: { execute: async () => ({ success: true, output: '', error: '' }) },
    remoteStatService: { getFileSize: async () => 0, getDirSize: async () => 0 },
    i18nService: i18nMock,
    tarExtractor: { extract: async () => {} },
    spawnFn,
    fs: { statSync: () => ({ size: 100 }) },
    progressMonitorFactory: monitorFactory,
    admZipFactory: () => ({ addFile: () => {}, writeZip: () => {} }),
    asyncFs: {},
  });

  const result = await svc.upload('/local/f', '/sdcard/f', 'dev1', null);

  assert.strictEqual(result.success, false);
  assert.ok(result.error);
  const events = monitorFactory.instances[0].monitor.events;
  assert.ok(events.some(e => e.percentage === 100 && e.status === 'error'));
});

test('upload statSync 抛错返回 success=false', async () => {
  const { spawnFn } = createMockSpawn({ code: 0 });
  const monitorFactory = createMockMonitorFactory();

  const svc = new FileTransferService({
    commandExecutor: { execute: async () => ({ success: true, output: '', error: '' }) },
    remoteStatService: { getFileSize: async () => 0, getDirSize: async () => 0 },
    i18nService: i18nMock,
    tarExtractor: { extract: async () => {} },
    spawnFn,
    fs: { statSync: () => { throw new Error('ENOENT'); } },
    progressMonitorFactory: monitorFactory,
    admZipFactory: () => ({ addFile: () => {}, writeZip: () => {} }),
    asyncFs: {},
  });

  const result = await svc.upload('/nonexistent', '/sdcard/f', null, null);

  assert.strictEqual(result.success, false);
  assert.ok(result.error.includes('ENOENT'));
  // spawn 不应被调用
  assert.strictEqual(spawnFn.calls.length, 0);
});

// ── download 单文件测试 ────────────────────────────────────

test('download 单文件 (isDir=false): pull -p + monitor 进度', async () => {
  // isDir 判断: commandExecutor.execute 返回不含 'total'
  const exec = {
    execute: async (args, opts) => {
      // ls -la 命令
      return { success: true, output: '-rw-r--r-- 1 root root 100 Jan 1 00:00 file.txt', error: '' };
    },
  };
  const remoteStat = { getFileSize: async () => 100, getDirSize: async () => 0 };
  const { spawnFn } = createMockSpawn({
    stdoutChunks: ['[100/100 (100%)]'],
    code: 0,
  });
  const monitorFactory = createMockMonitorFactory();

  const svc = new FileTransferService({
    commandExecutor: exec,
    remoteStatService: remoteStat,
    i18nService: i18nMock,
    tarExtractor: { extract: async () => {} },
    spawnFn,
    fs: { statSync: () => ({ size: 100 }) },
    progressMonitorFactory: monitorFactory,
    admZipFactory: () => ({ addFile: () => {}, writeZip: () => {} }),
    asyncFs: {},
  });

  const result = await svc.download('/sdcard/file.txt', '/local/file.txt', 'dev1', null);

  assert.strictEqual(result.success, true);
  // spawn 被调用, args 含 -s dev1 pull -p
  assert.strictEqual(spawnFn.calls.length, 1);
  assert.ok(spawnFn.calls[0].args.includes('pull'));
  assert.ok(spawnFn.calls[0].args.includes('-p'));
  // 返回 localPath
  assert.ok(result.localPath);
});

test('download 单文件 pull 失败返回 success=false', async () => {
  const exec = {
    execute: async () => ({ success: true, output: '-rw-r--r-- 1 root root 100 file', error: '' }),
  };
  const remoteStat = { getFileSize: async () => 100, getDirSize: async () => 0 };
  const { spawnFn } = createMockSpawn({
    stderrChunks: ['error: device not found'],
    code: 1,
  });
  const monitorFactory = createMockMonitorFactory();

  const svc = new FileTransferService({
    commandExecutor: exec,
    remoteStatService: remoteStat,
    i18nService: i18nMock,
    tarExtractor: { extract: async () => {} },
    spawnFn,
    fs: { statSync: () => ({ size: 100 }) },
    progressMonitorFactory: monitorFactory,
    admZipFactory: () => ({ addFile: () => {}, writeZip: () => {} }),
    asyncFs: {},
  });

  const result = await svc.download('/sdcard/file.txt', '/local/file.txt', null, null);

  assert.strictEqual(result.success, false);
  assert.ok(result.error);
});

// ── download 目录测试 ──────────────────────────────────────

test('download 目录 (isDir=true): tar exec-out + processTarAndCreateZip', async () => {
  // isDir 判断: ls -la 返回 'total 0\ndrwx...'
  const exec = {
    execute: async (args, opts) => {
      return { success: true, output: 'total 0\ndrwxr-xr-x 2 root root 4096 Jan 1 00:00 .', error: '' };
    },
  };
  const remoteStat = { getFileSize: async () => 0, getDirSize: async () => 4096 };
  const { spawnFn } = createMockSpawn({ code: 0 });
  const monitorFactory = createMockMonitorFactory();

  let extractCalls = [];
  const tarExtractor = {
    extract: async (tarPath, outDir) => {
      extractCalls.push({ tarPath, outDir });
      return [];
    },
  };
  Object.defineProperty(tarExtractor, 'calls', {
    value: extractCalls, enumerable: false, writable: false,
  });

  let zipFiles = [];
  const admZipInstance = {
    addFile: (p, content) => { zipFiles.push(p); },
    writeZip: (target) => {},
  };
  Object.defineProperty(admZipInstance, 'files', {
    value: zipFiles, enumerable: false, writable: false,
  });
  const admZipFactory = () => admZipInstance;

  const asyncFsMock = {
    ensureDir: async () => {},
    readdir: async () => [],
    stat: async () => ({ isDirectory: () => false }),
    unlink: async () => {},
    rm: async () => {},
    exists: async () => false,
    writeFile: async () => {},
    createWriteStream: () => ({ on: () => {}, write: () => {}, end: () => {} }),
  };

  const svc = new FileTransferService({
    commandExecutor: exec,
    remoteStatService: remoteStat,
    i18nService: i18nMock,
    tarExtractor,
    spawnFn,
    fs: { statSync: () => ({ size: 100 }), createWriteStream: () => ({ on: () => {}, write: () => {}, end: () => {} }) },
    progressMonitorFactory: monitorFactory,
    admZipFactory,
    asyncFs: asyncFsMock,
  });

  const result = await svc.download('/sdcard/dir', '/local/dir', 'dev1', null);

  assert.strictEqual(result.success, true);
  // spawn 被调用 tar 命令 (exec-out)
  assert.strictEqual(spawnFn.calls.length, 1);
  // tarExtractor.extract 被调用
  assert.strictEqual(tarExtractor.calls.length, 1);
  // monitor emit 100% success
  const events = monitorFactory.instances[0].monitor.events;
  assert.ok(events.some(e => e.percentage === 100 && e.status === 'success'));
});

// ── _processTarAndCreateZip 测试 ───────────────────────────

test('_processTarAndCreateZip 调用 tarExtractor.extract + admZip.writeZip', async () => {
  let extractCalled = false;
  let writeZipCalled = false;
  const tarExtractor = {
    extract: async () => { extractCalled = true; return []; },
  };
  const admZipInstance = {
    addFile: () => {},
    writeZip: () => { writeZipCalled = true; },
  };

  const svc = new FileTransferService({
    commandExecutor: { execute: async () => ({ success: true, output: '', error: '' }) },
    remoteStatService: { getFileSize: async () => 0, getDirSize: async () => 0 },
    i18nService: i18nMock,
    tarExtractor,
    spawnFn: () => ({}),
    fs: {},
    progressMonitorFactory: () => createMockMonitor(),
    admZipFactory: () => admZipInstance,
    asyncFs: {
      ensureDir: async () => {},
      readdir: async () => [],
      stat: async () => ({ isDirectory: () => false }),
    },
  });

  await svc._processTarAndCreateZip('/tmp/tar.tar', '/tmp/work', '/tmp/out.zip', null);

  assert.strictEqual(extractCalled, true);
  assert.strictEqual(writeZipCalled, true);
});

// ── download 目录 spawn error 回归测试 ─────────────────────
// R12: 移除 _downloadDir 中冗余的 tarProcess error 监听后, spawn error
//      应只 emit 一次 'error' 进度 (此前双监听会重复 emit)。

test('download 目录 spawn error: monitor emit error 恰一次 + success=false', async () => {
  const exec = {
    execute: async () => ({ success: true, output: 'total 0\ndrwxr-xr-x 2 root root 4096 Jan 1 00:00 .', error: '' }),
  };
  const remoteStat = { getFileSize: async () => 0, getDirSize: async () => 4096 };
  const monitorFactory = createMockMonitorFactory();

  let tarProc = null;
  const spawnFn = (cmd, args, opts) => {
    const errorCbs = [];
    const proc = {
      stdout: { on: () => {}, pipe: () => {} },
      stderr: { on: () => {} },
      on: (evt, cb) => { if (evt === 'error') errorCbs.push(cb); },
      pid: 3,
    };
    proc.fireError = () => errorCbs.forEach(cb => cb(new Error('ENOENT: adb not found')));
    tarProc = proc;
    return proc;
  };

  const asyncFsMock = {
    ensureDir: async () => {},
    readdir: async () => [],
    stat: async () => ({ isDirectory: () => false }),
    unlink: async () => {},
    rm: async () => {},
    exists: async () => false,
    writeFile: async () => {},
  };

  const svc = new FileTransferService({
    commandExecutor: exec,
    remoteStatService: remoteStat,
    i18nService: i18nMock,
    tarExtractor: { extract: async () => [] },
    spawnFn,
    fs: { statSync: () => ({ size: 100 }), createWriteStream: () => ({ on: () => {}, write: () => {}, end: () => {} }) },
    progressMonitorFactory: monitorFactory,
    admZipFactory: () => ({ addFile: () => {}, writeZip: () => {} }),
    asyncFs: asyncFsMock,
  });

  const promise = svc.download('/sdcard/dir', '/local/dir', 'dev1', null);
  // 等待 isDir 判断 + getDirSize 的 await 完成、tar spawn 已调用后触发 error
  await new Promise(r => setImmediate(r));
  await new Promise(r => setImmediate(r));
  assert.ok(tarProc, 'tar spawn 应已被调用');
  tarProc.fireError();

  const result = await promise;
  assert.strictEqual(result.success, false);
  assert.ok(result.error);
  const errorEvents = monitorFactory.instances[0].monitor.events.filter(e => e.status === 'error');
  assert.strictEqual(errorEvents.length, 1, 'spawn error 应只 emit 一次');
});

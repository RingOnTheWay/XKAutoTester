// AllureCliInvoker 单元测试
// 验证: 1) generate 成功返回 {code:0,stdout,stderr} 2) generate spawn error 返回 code:-1
//      3) _findSystemNode 返回 node 路径 4) _getAllureCliPath 找到/未找到 cli.js
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const Module = require('module');

const CLI_INVOKER_PATH = path.join(
  __dirname, '..', '..', 'electron', 'src', 'main', 'services', 'allure', 'AllureCliInvoker.js'
);

function mockLogger() {
  return {
    info: async () => {},
    error: async () => {},
    warning: async () => {},
    ensureLogDir: async () => {},
    resetLogPath: () => {}
  };
}

/**
 * mock child_process + fs 模块
 * @param {Object} opts { spawnCode, spawnError, execSyncReturn, existsReturn }
 */
function mockModules(opts = {}) {
  const origLoad = Module._load;
  const spawnCalls = [];
  const fakeChild = {
    stdout: { on: (event, cb) => { if (opts.spawnStdout) setTimeout(() => cb(opts.spawnStdout), 0); } },
    stderr: { on: (event, cb) => { if (opts.spawnStderr) setTimeout(() => cb(opts.spawnStderr), 0); } },
    on: (event, cb) => {
      // spawn error 时不触发 close（与真实 child_process 行为一致）
      if (event === 'close' && opts.spawnError) return;
      if (event === 'close') {
        setTimeout(() => cb(opts.spawnCode !== undefined ? opts.spawnCode : 0), 0);
      } else if (event === 'error' && opts.spawnError) {
        setTimeout(() => cb(new Error(opts.spawnError)), 0);
      }
    }
  };
  Module._load = function (request, parent, isMain) {
    if (request === 'child_process') {
      return {
        execSync: opts.execSyncReturn !== undefined
          ? () => opts.execSyncReturn
          : () => { throw new Error('execSync not mocked'); },
        spawn: (cmd, args, spOpts) => {
          spawnCalls.push({ cmd, args, spOpts });
          return fakeChild;
        }
      };
    }
    if (request === 'fs') {
      const realFs = origLoad.call(this, request, parent, isMain);
      return {
        ...realFs,
        existsSync: () => opts.existsReturn !== undefined ? opts.existsReturn : false
      };
    }
    return origLoad.call(this, request, parent, isMain);
  };
  return {
    spawnCalls,
    restore: () => { Module._load = origLoad; }
  };
}

function loadCliInvoker() {
  delete require.cache[require.resolve(CLI_INVOKER_PATH)];
  return require(CLI_INVOKER_PATH);
}


// ─── _findSystemNode ────────────────────────────────────────────

test('_findSystemNode 应返回 where node 的首个 .exe 路径', () => {
  const mock = mockModules({ execSyncReturn: 'C:\\Program Files\\nodejs\\node.exe\nC:\\other\\node.exe' });
  try {
    const AllureCliInvoker = loadCliInvoker();
    const invoker = new AllureCliInvoker('/fake/root', mockLogger());
    const nodePath = invoker._findSystemNode();
    assert.equal(nodePath, 'C:\\Program Files\\nodejs\\node.exe');
  } finally {
    mock.restore();
  }
});

test('_findSystemNode execSync 失败应返回 null', () => {
  const mock = mockModules({ execSyncReturn: undefined });
  // 覆盖 execSync 抛错
  const origLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'child_process') {
      return { execSync: () => { throw new Error('not found'); }, spawn: () => {} };
    }
    return origLoad.call(this, request, parent, isMain);
  };
  try {
    const AllureCliInvoker = loadCliInvoker();
    const invoker = new AllureCliInvoker('/fake/root', mockLogger());
    const nodePath = invoker._findSystemNode();
    assert.equal(nodePath, null);
  } finally {
    Module._load = origLoad;
  }
});


// ─── _getAllureCliPath ──────────────────────────────────────────

test('_getAllureCliPath existsSync=true 应返回 cli.js 路径', () => {
  const mock = mockModules({ existsReturn: true });
  try {
    const AllureCliInvoker = loadCliInvoker();
    const invoker = new AllureCliInvoker('/fake/root', mockLogger());
    const cliPath = invoker._getAllureCliPath();
    assert.ok(cliPath.endsWith('cli.js'));
  } finally {
    mock.restore();
  }
});

test('_getAllureCliPath existsSync=false 应返回 null', () => {
  const mock = mockModules({ existsReturn: false });
  try {
    const AllureCliInvoker = loadCliInvoker();
    const invoker = new AllureCliInvoker('/fake/root', mockLogger());
    const cliPath = invoker._getAllureCliPath();
    assert.equal(cliPath, null);
  } finally {
    mock.restore();
  }
});


// ─── generate ───────────────────────────────────────────────────

test('generate 成功应返回 {code:0, stdout, stderr}', async () => {
  const mock = mockModules({
    execSyncReturn: 'C:\\node.exe',
    existsReturn: true,
    spawnCode: 0,
    spawnStdout: 'report generated',
    spawnStderr: ''
  });
  try {
    const AllureCliInvoker = loadCliInvoker();
    const invoker = new AllureCliInvoker('/fake/root', mockLogger());
    const result = await invoker.generate('/fake/results', '/fake/output');
    assert.equal(result.code, 0);
    assert.equal(result.stdout, 'report generated');
    assert.equal(result.stderr, '');
    // spawn 应收到系统 node + allure cli.js
    assert.equal(mock.spawnCalls[0].cmd, 'C:\\node.exe');
    assert.ok(mock.spawnCalls[0].args[0].endsWith('cli.js'));
  } finally {
    mock.restore();
  }
});

test('generate spawn error 应返回 {code:-1}', async () => {
  const mock = mockModules({
    execSyncReturn: 'C:\\node.exe',
    existsReturn: true,
    spawnCode: -1,
    spawnError: 'spawn failed'
  });
  try {
    const AllureCliInvoker = loadCliInvoker();
    const invoker = new AllureCliInvoker('/fake/root', mockLogger());
    const result = await invoker.generate('/fake/results', '/fake/output');
    assert.equal(result.code, -1);
    assert.equal(result.stderr, 'spawn failed');
  } finally {
    mock.restore();
  }
});

test('generate 无 allure cli 应回退 npx', async () => {
  const mock = mockModules({
    existsReturn: false,
    spawnCode: 0
  });
  try {
    const AllureCliInvoker = loadCliInvoker();
    const invoker = new AllureCliInvoker('/fake/root', mockLogger());
    const result = await invoker.generate('/fake/results', '/fake/output');
    assert.equal(result.code, 0);
    assert.equal(mock.spawnCalls[0].cmd, 'npx');
    assert.deepEqual(mock.spawnCalls[0].args, ['allure', 'generate', '/fake/results', '-o', '/fake/output']);
  } finally {
    mock.restore();
  }
});

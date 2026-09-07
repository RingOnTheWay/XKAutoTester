// AllureCliInvoker 单元测试
// 验证: 1) generate 成功返回 {code:0,stdout,stderr} 2) generate spawn error 返回 code:-1
//      3) _findSystemNode 异步返回 node 路径 4) _getAllureCliPath 找到/未找到 cli.js
// R10: _findSystemNode 改异步 (原 execSync 阻塞主进程), 测试 mock spawn 处理 'where node' 调用
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
    warn: async () => {}, // R27: 对齐真实 Logger 方法名 (原 warning 不存在)
    ensureLogDir: async () => {},
    resetLogPath: () => {}
  };
}

/**
 * mock child_process + fs 模块
 * R10: _findSystemNode 用 spawn('where', ['node']) 替代 execSync, mock 需按 cmd 分发
 * @param {Object} opts {
 *   spawnCode, spawnError, spawnStdout, spawnStderr,  // allure generate spawn 行为
 *   whereStdout, whereCode,                            // 'where node' spawn 行为
 *   existsReturn
 * }
 */
function mockModules(opts = {}) {
  const origLoad = Module._load;
  const spawnCalls = [];

  function makeFakeChild(cmd, args) {
    // 'where node' 调用: 用 whereStdout/whereCode
    const isWhere = cmd === 'where' && args && args[0] === 'node';
    const stdout = isWhere ? (opts.whereStdout || '') : (opts.spawnStdout || '');
    const stderr = isWhere ? '' : (opts.spawnStderr || '');
    const code = isWhere ? (opts.whereCode !== undefined ? opts.whereCode : 0) : (opts.spawnCode !== undefined ? opts.spawnCode : 0);
    const error = isWhere ? null : opts.spawnError;
    return {
      stdout: { on: (event, cb) => { if (stdout) setTimeout(() => cb(stdout), 0); } },
      stderr: { on: (event, cb) => { if (stderr) setTimeout(() => cb(stderr), 0); } },
      on: (event, cb) => {
        if (event === 'close' && error) return;  // spawn error 时不触发 close
        if (event === 'close') {
          setTimeout(() => cb(code), 0);
        } else if (event === 'error' && error) {
          setTimeout(() => cb(new Error(error)), 0);
        }
      }
    };
  }

  Module._load = function (request, parent, isMain) {
    if (request === 'child_process') {
      return {
        spawn: (cmd, args, spOpts) => {
          spawnCalls.push({ cmd, args, spOpts });
          return makeFakeChild(cmd, args);
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

test('_findSystemNode 异步应返回 where node 的首个 .exe 路径', async () => {
  const mock = mockModules({
    whereStdout: 'C:\\Program Files\\nodejs\\node.exe\nC:\\other\\node.exe',
    whereCode: 0
  });
  try {
    const AllureCliInvoker = loadCliInvoker();
    const invoker = new AllureCliInvoker('/fake/root', mockLogger());
    const nodePath = await invoker._findSystemNode();
    assert.equal(nodePath, 'C:\\Program Files\\nodejs\\node.exe');
    // 应调 spawn('where', ['node'])
    assert.equal(mock.spawnCalls.length, 1);
    assert.equal(mock.spawnCalls[0].cmd, 'where');
    assert.deepEqual(mock.spawnCalls[0].args, ['node']);
  } finally {
    mock.restore();
  }
});

test('_findSystemNode where 失败 (非零退出码) 应返回 null', async () => {
  const mock = mockModules({
    whereStdout: '',
    whereCode: 1  // where 未找到 node 时退出码 1
  });
  try {
    const AllureCliInvoker = loadCliInvoker();
    const invoker = new AllureCliInvoker('/fake/root', mockLogger());
    const nodePath = await invoker._findSystemNode();
    assert.equal(nodePath, null);
  } finally {
    mock.restore();
  }
});

test('_findSystemNode where 输出无 .exe 应返回 null', async () => {
  const mock = mockModules({
    whereStdout: 'C:\\some\\path\\without-exe\n',  // 不以 .exe 结尾
    whereCode: 0
  });
  try {
    const AllureCliInvoker = loadCliInvoker();
    const invoker = new AllureCliInvoker('/fake/root', mockLogger());
    const nodePath = await invoker._findSystemNode();
    assert.equal(nodePath, null);
  } finally {
    mock.restore();
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
    whereStdout: 'C:\\node.exe',
    whereCode: 0,
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
    // 2 次 spawn: where node + allure generate
    assert.equal(mock.spawnCalls.length, 2, '应有 2 次 spawn (where + allure)');
    assert.equal(mock.spawnCalls[0].cmd, 'where', '首次 spawn 是 where node');
    assert.equal(mock.spawnCalls[1].cmd, 'C:\\node.exe', '第二次 spawn 是系统 node');
    assert.ok(mock.spawnCalls[1].args[0].endsWith('cli.js'));
  } finally {
    mock.restore();
  }
});

test('generate spawn error 应返回 {code:-1}', async () => {
  const mock = mockModules({
    whereStdout: 'C:\\node.exe',
    whereCode: 0,
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
    // 无 allure cli 时不调 where node, 直接 npx
    assert.equal(mock.spawnCalls.length, 1, '仅 npx 一次 spawn');
    assert.equal(mock.spawnCalls[0].cmd, 'npx');
    assert.deepEqual(mock.spawnCalls[0].args, ['allure', 'generate', '/fake/results', '-o', '/fake/output']);
  } finally {
    mock.restore();
  }
});

test('generate where 无 node.exe 应回退 process.execPath (Electron as Node)', async () => {
  const mock = mockModules({
    whereStdout: '',
    whereCode: 1,  // where 未找到 node
    existsReturn: true,
    spawnCode: 0,
    spawnStdout: 'report generated'
  });
  try {
    const AllureCliInvoker = loadCliInvoker();
    const invoker = new AllureCliInvoker('/fake/root', mockLogger());
    const result = await invoker.generate('/fake/results', '/fake/output');
    assert.equal(result.code, 0);
    // 应回退到 process.execPath
    assert.equal(mock.spawnCalls[1].cmd, process.execPath);
  } finally {
    mock.restore();
  }
});

// AllureHttpServer 单元测试
// 验证: 1) _patchIndexHtml 注入 theme/reportLanguage 2) getStatus 未启动状态
//      3) stop 未启动返回 success 4) cleanupSync 不抛 5) start 成功返回 url/port
//      6) start index.html 不存在返回失败
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const os = require('node:os');
const Module = require('module');

const HTTP_SERVER_PATH = path.join(
  __dirname, '..', '..', 'electron', 'src', 'main', 'services', 'allure', 'AllureHttpServer.js'
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
 * mock http + asyncFs 模块
 * @param {Object} opts { existsReturn, readFileReturn }
 */
function mockModules(opts = {}) {
  const origLoad = Module._load;
  const fakeServer = {
    listen: (port, host, cb) => { if (cb) cb(); },
    on: (event, handler) => {},
    close: (cb) => { if (cb) cb(); },
    address: () => ({ port: 99999 })
  };
  Module._load = function (request, parent, isMain) {
    if (request === 'http') {
      return { createServer: () => fakeServer };
    }
    if (request === '../../utils/asyncFs') {
      return {
        exists: async () => opts.existsReturn !== undefined ? opts.existsReturn : true,
        readFile: async () => opts.readFileReturn || '{"theme":"default","reportLanguage":"en"}'
      };
    }
    return origLoad.call(this, request, parent, isMain);
  };
  return {
    fakeServer,
    restore: () => { Module._load = origLoad; }
  };
}

function loadHttpServer() {
  delete require.cache[require.resolve(HTTP_SERVER_PATH)];
  return require(HTTP_SERVER_PATH);
}


// ─── _patchIndexHtml ────────────────────────────────────────────

test('_patchIndexHtml 应注入 dark 主题和 zh 语言', () => {
  const AllureHttpServer = loadHttpServer();
  const server = new AllureHttpServer(mockLogger());
  const input = '{"theme":"default","reportLanguage":"en"}';
  const result = server._patchIndexHtml(input, 'dark', 'zh');
  // theme/language 替换 + matchMedia polyfill 注入
  assert.ok(result.includes('"theme":"dark"'), '应包含 dark 主题');
  assert.ok(result.includes('"reportLanguage":"zh"'), '应包含 zh 语言');
  assert.ok(result.includes('prefers-color-scheme'), '应注入 matchMedia polyfill');
  assert.ok(result.includes('wantDark = true'), 'dark 主题应设 wantDark=true');
});

test('_patchIndexHtml 无匹配字段时保持原样', () => {
  const AllureHttpServer = loadHttpServer();
  const server = new AllureHttpServer(mockLogger());
  const input = '<html><body>no config</body></html>';
  const result = server._patchIndexHtml(input, 'dark', 'zh');
  // 无 theme/reportLanguage 字段时不替换，但仍注入 polyfill（无 head 则前置）
  assert.ok(result.includes('no config'), '应保留原内容');
  assert.ok(result.includes('prefers-color-scheme'), '应注入 matchMedia polyfill');
});


// ─── 状态方法 ───────────────────────────────────────────────────

test('getStatus 未启动应返回 running:false', () => {
  const AllureHttpServer = loadHttpServer();
  const server = new AllureHttpServer(mockLogger());
  const status = server.getStatus();
  assert.equal(status.running, false);
  assert.equal(status.port, null);
});

test('stop 未启动服务器应返回 success:true', async () => {
  const AllureHttpServer = loadHttpServer();
  const server = new AllureHttpServer(mockLogger());
  const result = await server.stop();
  assert.equal(result.success, true);
});

test('cleanupSync 未启动服务器不应抛错', () => {
  const AllureHttpServer = loadHttpServer();
  const server = new AllureHttpServer(mockLogger());
  assert.doesNotThrow(() => server.cleanupSync());
});


// ─── start ──────────────────────────────────────────────────────

test('start 成功应返回 {success, url, port}', async () => {
  const mock = mockModules({
    existsReturn: true,
    readFileReturn: '{"theme":"default","reportLanguage":"en"}'
  });
  try {
    const AllureHttpServer = loadHttpServer();
    const server = new AllureHttpServer(mockLogger());
    const result = await server.start('/fake/report', { language: 'zh', isDark: true });
    assert.equal(result.success, true);
    assert.equal(result.url, 'http://127.0.0.1:99999');
    assert.equal(result.port, 99999);
    // 启动后状态应更新
    assert.equal(server.getStatus().running, true);
  } finally {
    mock.restore();
  }
});

test('start index.html 不存在应返回 {success:false}', async () => {
  const mock = mockModules({ existsReturn: false });
  try {
    const AllureHttpServer = loadHttpServer();
    const server = new AllureHttpServer(mockLogger());
    const result = await server.start('/fake/report', {});
    assert.equal(result.success, false);
    assert.ok(result.error);
  } finally {
    mock.restore();
  }
});

test('cleanupSync 启动后应清空状态', async () => {
  const mock = mockModules({
    existsReturn: true,
    readFileReturn: '{"theme":"default"}'
  });
  try {
    const AllureHttpServer = loadHttpServer();
    const server = new AllureHttpServer(mockLogger());
    await server.start('/fake/report', {});
    assert.equal(server.getStatus().running, true);
    server.cleanupSync();
    assert.equal(server.getStatus().running, false);
    assert.equal(server.getStatus().port, null);
  } finally {
    mock.restore();
  }
});

// ─── P1-12 路径穿越防护 (startsWith 边界修复回归) ─────────────────────────

test('P1-12 请求 ../report1evil/x.js (前缀目录) 应返回 403', async () => {
  // 劫持 http.createServer 捕获请求 handler, 模拟真实请求路径
  const { Module } = require('node:module');
  const origLoad = Module._load;
  let capturedHandler = null;
  const fakeServer = {
    listen: (port, host, cb) => { if (cb) cb(); },
    on: (event, handler) => {},
    close: (cb) => { if (cb) cb(); },
    address: () => ({ port: 99999 })
  };
  Module._load = function (request, parent, isMain) {
    if (request === 'http') {
      return { createServer: (handler) => { capturedHandler = handler; return fakeServer; } };
    }
    if (request === '../../utils/asyncFs') {
      return { exists: async () => true, readFile: async () => '{"theme":"default"}' };
    }
    return origLoad.call(this, request, parent, isMain);
  };
  try {
    const AllureHttpServer = loadHttpServer();
    const server = new AllureHttpServer({ info: () => {}, error: () => {} });
    // 报告目录: /tmp/reports/plan1 (让 /tmp/reports/plan1evil 成为其前缀目录)
    await server.start(path.join(os.tmpdir(), 'reports', 'plan1'));

    const statuses = [];
    const fakeRes = {
      writeHead: (code) => statuses.push(code),
      end: () => {},
    };

    // 1) 前缀目录穿越: /../plan1evil/secret.js 必须 403 (修复前 startsWith 会放行)
    const evilUrl = '/../plan1evil/secret.js';
    capturedHandler({ url: evilUrl, split: (c) => evilUrl.split(c) }, fakeRes);
    assert.strictEqual(statuses[0], 403, `前缀目录穿越应 403 (URL: ${evilUrl})`);

    // 2) 标准穿越: /../../outside 必须 403
    statuses.length = 0;
    const evilUrl2 = '/../../outside.js';
    capturedHandler({ url: evilUrl2, split: (c) => evilUrl2.split(c) }, fakeRes);
    assert.strictEqual(statuses[0], 403, '标准穿越应 403');
  } finally {
    Module._load = origLoad;
  }
});

// AllureHttpServer 单元测试
// 验证: 1) _patchIndexHtml 注入 theme/reportLanguage 2) getStatus 未启动状态
//      3) stop 未启动返回 success 4) cleanupSync 不抛 5) start 成功返回 url/port
//      6) start index.html 不存在返回失败
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
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

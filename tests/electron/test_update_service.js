// UpdateService 单测 — 5 factory 注入 + 懒初始化 + 4 公共方法 + 错误分类透传。
// 验证: constructor 收 5 factory + 懒初始化 (constructor 不触发 fs, 首次 downloadUpdate 触发) +
//      懒初始化幂等 + checkForUpdate (有/无 release/错误透传) +
//      downloadUpdate (快路径/全量下载) + installUpdate (成功/文件不存在)。
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const UPDATE_SERVICE_PATH = path.join(
  __dirname, '..', '..', 'electron', 'src', 'main', 'services', 'UpdateService.js'
);
const { UpdateService, normalizeUpdateError } = require(UPDATE_SERVICE_PATH);

// ── Fakes ──────────────────────────────────────────────

function makeFakeVersionService(version = '1.0.0') {
  const calls = { getVersion: 0 };
  return {
    calls,
    getVersion() {
      calls.getVersion++;
      return version;
    }
  };
}

function makeFakeUserDataService(configPath = '/fake/config') {
  return {
    getUserConfigPath() { return configPath; }
  };
}

/**
 * @param {Object} opts
 * @param {Object} [opts.existsResults] - { [path]: boolean } 路径特定的 exists 返回值
 * @param {boolean} [opts.defaultExists=false] - 未匹配路径的默认 exists 返回值
 * @param {string[]} [opts.readdirResult=[]] - readdir 返回值
 */
function makeFakeFileSystem(opts = {}) {
  const calls = {
    ensureDir: [],
    exists: [],
    stat: [],
    unlink: [],
    readdir: [],
    createWriteStream: [],
  };
  const existsResults = opts.existsResults || {};
  const defaultExists = opts.defaultExists !== undefined ? opts.defaultExists : false;
  const readdirResult = opts.readdirResult || [];
  return {
    calls,
    ensureDir: (dir) => { calls.ensureDir.push(dir); },
    exists: (p) => {
      calls.exists.push(p);
      return existsResults[p] !== undefined ? existsResults[p] : defaultExists;
    },
    stat: (p) => { calls.stat.push(p); return { size: 1024 }; },
    unlink: (p) => { calls.unlink.push(p); },
    readdir: (dir) => { calls.readdir.push(dir); return readdirResult; },
    createWriteStream: (p) => { calls.createWriteStream.push(p); return {}; },
  };
}

function makeFakeUpdateSource(release = null, error = null) {
  const calls = { fetchLatestRelease: 0 };
  return {
    calls,
    async fetchLatestRelease() {
      calls.fetchLatestRelease++;
      if (error) throw error;
      return release;
    }
  };
}

function makeFakeDownloadStrategy(result = null, error = null) {
  const calls = { download: [] };
  return {
    calls,
    async download(downloadUrl, filePath, eventSender) {
      calls.download.push({ downloadUrl, filePath, eventSender });
      if (error) throw error;
      return result || { success: true, filePath, message: 'Download completed' };
    }
  };
}

function makeFakeInstallStrategy(result = null, error = null) {
  const calls = { install: [] };
  return {
    calls,
    async install(filePath) {
      calls.install.push(filePath);
      if (error) throw error;
      return result || { success: true };
    }
  };
}

function makeFakeApp(opts = {}) {
  const versionService = makeFakeVersionService(opts.version || '1.0.0');
  const userDataService = makeFakeUserDataService(opts.configPath || '/fake/config');
  const fileSystem = makeFakeFileSystem(opts.fileSystem || {});
  const updateSource = makeFakeUpdateSource(opts.release || null, opts.updateSourceError || null);
  const downloadStrategy = makeFakeDownloadStrategy(opts.downloadResult || null, opts.downloadError || null);
  const installStrategy = makeFakeInstallStrategy(opts.installResult || null, opts.installError || null);
  const versionComparatorCalls = { compare: [] };
  const versionComparator = opts.versionComparator || ((v1, v2) => {
    versionComparatorCalls.compare.push({ v1, v2 });
    // 默认: v1 < v2 返 -1 (有更新)
    if (v1 === '1.0.0' && v2 === '2.0.0') return -1;
    if (v1 === '2.0.0' && v2 === '1.0.0') return 1;
    return 0;
  });

  const svc = new UpdateService(versionService, userDataService, {
    updateSourceFactory: () => updateSource,
    downloadStrategyFactory: () => downloadStrategy,
    installStrategyFactory: () => installStrategy,
    fileSystemFactory: () => fileSystem,
    versionComparator,
  });

  return {
    svc,
    versionService,
    userDataService,
    fileSystem,
    updateSource,
    downloadStrategy,
    installStrategy,
    versionComparatorCalls,
  };
}

function makeRelease(opts = {}) {
  return {
    tag_name: opts.tag_name || 'v2.0.0',
    name: opts.name || 'Release 2.0.0',
    body: opts.body || 'Release notes',
    html_url: opts.html_url || 'https://github.com/ring/release-2.0.0',
    prerelease: false,
    draft: false,
    assets: opts.assets || [
      { name: 'XKAutoTester Setup v2.0.0.exe', browser_download_url: 'https://download/2.0.0.exe', size: 50000000 }
    ]
  };
}

// ── 测试 ────────────────────────────────────────────────

test('constructor 收 5 factory + 5 实例建 + _initialized=false', () => {
  const { svc, fileSystem, updateSource, downloadStrategy, installStrategy } = makeFakeApp();

  assert.strictEqual(svc._initialized, false, '懒初始化 flag 初始 false');
  assert.strictEqual(svc._updateSource, updateSource, 'updateSource 实例建');
  assert.strictEqual(svc._downloadStrategy, downloadStrategy, 'downloadStrategy 实例建');
  assert.strictEqual(svc._installStrategy, installStrategy, 'installStrategy 实例建');
  assert.strictEqual(svc._fileSystem, fileSystem, 'fileSystem 实例建');
  assert.strictEqual(typeof svc._versionComparator, 'function', 'versionComparator 注入');
  // 懒初始化: constructor 不触发 fs
  assert.strictEqual(fileSystem.calls.ensureDir.length, 0, 'constructor 不调 ensureDir');
  assert.strictEqual(fileSystem.calls.readdir.length, 0, 'constructor 不调 readdir');
});

test('懒初始化: constructor 不触发 fs, 首次 downloadUpdate 触发 ensureDir + cleanupOldUpdates', async () => {
  // defaultExists=true 让 cleanupOldUpdates 的 exists(updateDir) 返 true, 触发 readdir
  const { svc, fileSystem } = makeFakeApp({
    fileSystem: {
      defaultExists: true,
      readdirResult: ['old-installer.exe', 'readme.txt'],
    }
  });

  // constructor 不触发
  assert.strictEqual(fileSystem.calls.ensureDir.length, 0, 'constructor 后 ensureDir 未调');
  assert.strictEqual(fileSystem.calls.readdir.length, 0, 'constructor 后 readdir 未调');

  // 首次 downloadUpdate 触发
  await svc.downloadUpdate('https://download/2.0.0.exe', 'XKAutoTester Setup v2.0.0.exe', null);

  assert.strictEqual(fileSystem.calls.ensureDir.length, 1, '首次 downloadUpdate 调 ensureDir 1 次');
  assert.strictEqual(fileSystem.calls.ensureDir[0], svc.updateDir, 'ensureDir 收 updateDir');
  assert.ok(fileSystem.calls.readdir.length >= 1, '首次 downloadUpdate 触发 cleanupOldUpdates readdir');
  // cleanupOldUpdates 应删除 .exe 文件 (old-installer.exe, 可能还有 setup.exe 本身因 defaultExists=true)
  assert.ok(fileSystem.calls.unlink.length >= 1, 'cleanupOldUpdates 删除 old-installer.exe');
  assert.strictEqual(svc._initialized, true, '懒初始化后 _initialized=true');
});

test('懒初始化幂等: 重复 downloadUpdate 仅初始化一次', async () => {
  const { svc, fileSystem } = makeFakeApp({
    fileSystem: { defaultExists: false, readdirResult: [] }
  });

  await svc.downloadUpdate('https://download/2.0.0.exe', 'setup.exe', null);
  await svc.downloadUpdate('https://download/2.0.0.exe', 'setup.exe', null);
  await svc.downloadUpdate('https://download/2.0.0.exe', 'setup.exe', null);

  assert.strictEqual(fileSystem.calls.ensureDir.length, 1, '3 次 downloadUpdate 仅 ensureDir 1 次');
});

test('checkForUpdate 调 updateSource.fetchLatestRelease + versionComparator', async () => {
  const release = makeRelease({ tag_name: 'v2.0.0' });
  const { svc, updateSource, versionComparatorCalls } = makeFakeApp({
    version: '1.0.0',
    release,
  });

  const result = await svc.checkForUpdate();

  assert.strictEqual(updateSource.calls.fetchLatestRelease, 1, 'fetchLatestRelease 调 1 次');
  assert.strictEqual(versionComparatorCalls.compare.length, 1, 'versionComparator 调 1 次');
  assert.deepEqual(versionComparatorCalls.compare[0], { v1: '1.0.0', v2: '2.0.0' });
  assert.strictEqual(result.hasUpdate, true, '1.0.0 < 2.0.0 → hasUpdate=true');
  assert.strictEqual(result.currentVersion, '1.0.0');
  assert.strictEqual(result.latestVersion, '2.0.0');
  assert.strictEqual(result.downloadUrl, 'https://download/2.0.0.exe');
  assert.strictEqual(result.fileName, 'XKAutoTester Setup v2.0.0.exe');
  assert.strictEqual(result.fileSize, 50000000);
  assert.strictEqual(result.releaseNotes, 'Release notes');
  assert.strictEqual(result.releaseName, 'Release 2.0.0');
  assert.strictEqual(result.htmlUrl, 'https://github.com/ring/release-2.0.0');
});

test('checkForUpdate 无 release 返 hasUpdate=false + currentVersion=latestVersion', async () => {
  const { svc, updateSource } = makeFakeApp({
    version: '1.0.0',
    release: null,  // 无 release
  });

  const result = await svc.checkForUpdate();

  assert.strictEqual(updateSource.calls.fetchLatestRelease, 1, 'fetchLatestRelease 调 1 次');
  assert.strictEqual(result.hasUpdate, false);
  assert.strictEqual(result.currentVersion, '1.0.0');
  assert.strictEqual(result.latestVersion, '1.0.0', '无 release 时 latestVersion=currentVersion');
});

test('checkForUpdate 错误分类透传 (updateSource 抛 classified error)', async () => {
  const classifiedError = new Error('API rate limit exceeded');
  classifiedError.code = 'rate_limited';
  classifiedError.statusCode = 403;

  const { svc } = makeFakeApp({
    release: null,
    updateSourceError: classifiedError,
  });

  await assert.rejects(
    () => svc.checkForUpdate(),
    (err) => {
      assert.strictEqual(err.message, 'API rate limit exceeded');
      assert.strictEqual(err.code, 'rate_limited');
      assert.strictEqual(err.statusCode, 403);
      return true;
    }
  );
});

test('downloadUpdate 已存在文件返快路径 {success, filePath, message}', async () => {
  const { svc, fileSystem, downloadStrategy } = makeFakeApp({
    configPath: '/fake/config',
    fileSystem: {
      defaultExists: true,  // updateDir 和 filePath 都返 true
      readdirResult: [],
    }
  });

  const fileName = 'XKAutoTester Setup v2.0.0.exe';
  const expectedFilePath = path.join(svc.updateDir, fileName);

  const result = await svc.downloadUpdate('https://download/2.0.0.exe', fileName, null);

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.filePath, expectedFilePath);
  assert.strictEqual(result.message, 'File already downloaded');
  // downloadStrategy 不应被调
  assert.strictEqual(downloadStrategy.calls.download.length, 0, '快路径不调 downloadStrategy');
});

test('downloadUpdate 不存在调 downloadStrategy.download', async () => {
  const { svc, downloadStrategy } = makeFakeApp({
    configPath: '/fake/config',
    fileSystem: {
      defaultExists: false,  // 文件不存在
      readdirResult: [],
    }
  });

  const fileName = 'setup.exe';
  const expectedFilePath = path.join(svc.updateDir, fileName);
  const eventSender = { send: () => {} };

  const result = await svc.downloadUpdate('https://download/2.0.0.exe', fileName, eventSender);

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.filePath, expectedFilePath);
  assert.strictEqual(result.message, 'Download completed');
  assert.strictEqual(downloadStrategy.calls.download.length, 1, 'downloadStrategy.download 调 1 次');
  assert.deepEqual(downloadStrategy.calls.download[0], {
    downloadUrl: 'https://download/2.0.0.exe',
    filePath: expectedFilePath,
    eventSender,
  });
});

test('installUpdate 调 installStrategy.install (fileSystem.exists=true)', async () => {
  const filePath = '/fake/config/updates/setup.exe';
  const { svc, installStrategy, fileSystem } = makeFakeApp({
    fileSystem: {
      existsResults: { [filePath]: true },
      readdirResult: [],
    }
  });

  const result = await svc.installUpdate(filePath);

  assert.strictEqual(result.success, true);
  assert.strictEqual(installStrategy.calls.install.length, 1, 'installStrategy.install 调 1 次');
  assert.strictEqual(installStrategy.calls.install[0], filePath);
  assert.ok(fileSystem.calls.exists.includes(filePath), 'installUpdate 检查 existsSync');
});

test('installUpdate 文件不存在抛 Failed to install update: Update file not found', async () => {
  const filePath = '/fake/config/updates/missing.exe';
  const { svc, installStrategy } = makeFakeApp({
    fileSystem: {
      defaultExists: false,  // 文件不存在
      readdirResult: [],
    }
  });

  await assert.rejects(
    () => svc.installUpdate(filePath),
    (err) => {
      assert.strictEqual(err.message, 'Failed to install update: Update file not found');
      return true;
    }
  );
  // installStrategy 不应被调
  assert.strictEqual(installStrategy.calls.install.length, 0, '文件不存在不调 installStrategy');
});

// ── normalizeUpdateError 错误分类 ───────────────────────

test('normalizeUpdateError SSL 证书错误分类为 ssl_failed', () => {
  const sslCodes = [
    'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    'CERT_HAS_EXPIRED',
    'DEPTH_ZERO_SELF_SIGNED_CERT',
    'SELF_SIGNED_CERT_IN_CHAIN',
    'ERR_TLS_CERT_ALTNAME_INVALID',
    'ERR_TLS_PROTOCOL_VERSION',
  ];
  for (const code of sslCodes) {
    const raw = new Error(`SSL error: ${code}`);
    raw.code = code;
    const result = normalizeUpdateError(raw);
    assert.strictEqual(result.code, 'ssl_failed', `${code} → ssl_failed`);
    assert.strictEqual(result.message, 'SSL certificate verification failed', `${code} message`);
    assert.strictEqual(result.statusCode, null, `${code} statusCode=null`);
  }
});

test('normalizeUpdateError 保留已知网络错误分类', () => {
  const cases = [
    { code: 'ECONNREFUSED', expected: 'connection_refused' },
    { code: 'ECONNRESET', expected: 'connection_reset' },
    { code: 'ETIMEDOUT', expected: 'timeout' },
    { code: 'ECONNABORTED', expected: 'timeout' },
    { code: 'ENOTFOUND', expected: 'dns_failed' },
    { code: 'ENETUNREACH', expected: 'network_unreachable' },
  ];
  for (const { code, expected } of cases) {
    const raw = new Error(`Network error: ${code}`);
    raw.code = code;
    const result = normalizeUpdateError(raw);
    assert.strictEqual(result.code, expected, `${code} → ${expected}`);
    assert.strictEqual(result.statusCode, null, `${code} statusCode=null`);
  }
});

test('normalizeUpdateError 未知 error.code 走 default 分支生成 network_<code>', () => {
  const raw = new Error('Something weird');
  raw.code = 'EWEIRDSIGNAL';
  const result = normalizeUpdateError(raw);
  assert.strictEqual(result.code, 'network_EWEIRDSIGNAL', '未知 code 走 default');
  assert.strictEqual(result.message, 'Network error: EWEIRDSIGNAL');
  assert.strictEqual(result.statusCode, null);
});

test('normalizeUpdateError HTTP 响应错误分类', () => {
  // 403 非限流 → forbidden
  const forbidden = new Error('Forbidden');
  forbidden.response = { status: 403, headers: {} };
  const r1 = normalizeUpdateError(forbidden);
  assert.strictEqual(r1.code, 'forbidden');
  assert.strictEqual(r1.statusCode, 403);

  // 403 限流 → rate_limited
  const rateLimited = new Error('Rate limited');
  rateLimited.response = { status: 403, headers: { 'x-ratelimit-remaining': '0' } };
  const r2 = normalizeUpdateError(rateLimited);
  assert.strictEqual(r2.code, 'rate_limited');

  // 429 → rate_limited
  const tooMany = new Error('Too many');
  tooMany.response = { status: 429, headers: {} };
  const r3 = normalizeUpdateError(tooMany);
  assert.strictEqual(r3.code, 'rate_limited');
  assert.strictEqual(r3.statusCode, 429);

  // 404 → repo_not_found
  const notFound = new Error('Not found');
  notFound.response = { status: 404, headers: {} };
  const r4 = normalizeUpdateError(notFound);
  assert.strictEqual(r4.code, 'repo_not_found');

  // 其他 HTTP → http_<status>
  const serverErr = new Error('Server error');
  serverErr.response = { status: 500, headers: {} };
  const r5 = normalizeUpdateError(serverErr);
  assert.strictEqual(r5.code, 'http_500');
  assert.strictEqual(r5.statusCode, 500);
});

// ── allowInsecureSSL option + setAllowInsecureSSL setter ──

const https = require('https');

/** spy factory: 记录每次调用收到的 httpsAgent 参数 */
function makeSpyUpdateSourceFactory() {
  const calls = [];
  const factory = (httpsAgent) => {
    calls.push(httpsAgent);
    return { async fetchLatestRelease() { return null; } };
  };
  factory.calls = calls;
  return factory;
}

test('constructor allowInsecureSSL 默认 false: _httpsAgent=undefined, factory 收 undefined', () => {
  const spy = makeSpyUpdateSourceFactory();
  const svc = new UpdateService(makeFakeVersionService(), makeFakeUserDataService(), {
    updateSourceFactory: spy,
  });
  assert.strictEqual(svc._allowInsecureSSL, false, '默认 false');
  assert.strictEqual(svc._httpsAgent, undefined, '_httpsAgent undefined');
  assert.strictEqual(spy.calls.length, 1, 'factory 调 1 次');
  assert.strictEqual(spy.calls[0], undefined, 'factory 收 undefined');
});

test('constructor allowInsecureSSL=true: _httpsAgent 非 undefined + rejectUnauthorized=false, factory 收 agent', () => {
  const spy = makeSpyUpdateSourceFactory();
  const svc = new UpdateService(makeFakeVersionService(), makeFakeUserDataService(), {
    updateSourceFactory: spy,
    allowInsecureSSL: true,
  });
  assert.strictEqual(svc._allowInsecureSSL, true, 'option 接受');
  assert.ok(svc._httpsAgent instanceof https.Agent, '_httpsAgent 是 https.Agent 实例');
  assert.strictEqual(svc._httpsAgent.options.rejectUnauthorized, false, 'rejectUnauthorized=false');
  assert.strictEqual(spy.calls.length, 1, 'factory 调 1 次');
  assert.strictEqual(spy.calls[0], svc._httpsAgent, 'factory 收同一 agent');
});

test('setAllowInsecureSSL(true): 从 false 切到 true, 重建 httpsAgent + 重新调 factory', () => {
  const spy = makeSpyUpdateSourceFactory();
  const svc = new UpdateService(makeFakeVersionService(), makeFakeUserDataService(), {
    updateSourceFactory: spy,
  });
  assert.strictEqual(svc._httpsAgent, undefined, '初始 undefined');
  const initialAgent = svc._httpsAgent;

  svc.setAllowInsecureSSL(true);

  assert.strictEqual(svc._allowInsecureSSL, true, '切换后 true');
  assert.ok(svc._httpsAgent instanceof https.Agent, '重建为 https.Agent');
  assert.strictEqual(svc._httpsAgent.options.rejectUnauthorized, false, 'rejectUnauthorized=false');
  assert.notStrictEqual(svc._httpsAgent, initialAgent, 'agent 已变化');
  assert.strictEqual(spy.calls.length, 2, 'factory 重新调 1 次 (总 2 次)');
  assert.strictEqual(spy.calls[1], svc._httpsAgent, 'factory 收新 agent');
});

test('setAllowInsecureSSL(false): 从 true 切到 false, _httpsAgent=undefined, factory 收 undefined', () => {
  const spy = makeSpyUpdateSourceFactory();
  const svc = new UpdateService(makeFakeVersionService(), makeFakeUserDataService(), {
    updateSourceFactory: spy,
    allowInsecureSSL: true,
  });
  assert.ok(svc._httpsAgent instanceof https.Agent, '初始有 agent');

  svc.setAllowInsecureSSL(false);

  assert.strictEqual(svc._allowInsecureSSL, false, '切换后 false');
  assert.strictEqual(svc._httpsAgent, undefined, '_httpsAgent 重置 undefined');
  assert.strictEqual(spy.calls.length, 2, 'factory 重新调');
  assert.strictEqual(spy.calls[1], undefined, 'factory 收 undefined');
});

test('setAllowInsecureSSL 同值幂等: 不重复构建 factory', () => {
  const spy = makeSpyUpdateSourceFactory();
  const svc = new UpdateService(makeFakeVersionService(), makeFakeUserDataService(), {
    updateSourceFactory: spy,
    allowInsecureSSL: true,
  });
  const agentBefore = svc._httpsAgent;
  assert.strictEqual(spy.calls.length, 1, '初始 1 次');

  svc.setAllowInsecureSSL(true); // 同值

  assert.strictEqual(svc._httpsAgent, agentBefore, 'agent 不变');
  assert.strictEqual(spy.calls.length, 1, 'factory 不重新调');
});

test('setAllowInsecureSSL 同步重建 downloadStrategy factory', () => {
  const sourceSpy = makeSpyUpdateSourceFactory();
  const downloadCalls = [];
  const downloadSpy = (httpsAgent) => {
    downloadCalls.push(httpsAgent);
    return { async download() { return { success: true }; } };
  };
  const svc = new UpdateService(makeFakeVersionService(), makeFakeUserDataService(), {
    updateSourceFactory: sourceSpy,
    downloadStrategyFactory: downloadSpy,
  });
  assert.strictEqual(downloadCalls.length, 1, 'download factory 初始 1 次');

  svc.setAllowInsecureSSL(true);

  assert.strictEqual(downloadCalls.length, 2, 'download factory 重新调');
  assert.strictEqual(downloadCalls[1], svc._httpsAgent, 'download factory 收新 agent');
});

// ── defaultUpdateServiceFactory 启动期读 config.json ──

const os = require('os');
const fsReal = require('fs');
const { defaultUpdateServiceFactory } = require('../../electron/src/main/services/application/factories');

test('defaultUpdateServiceFactory 读 config.json allowInsecureSSL=true 传入构造', () => {
  const tmpDir = fsReal.mkdtempSync(path.join(os.tmpdir(), 'xkat-factory-'));
  try {
    fsReal.writeFileSync(path.join(tmpDir, 'config.json'), JSON.stringify({
      APP_SETTINGS: { allowInsecureSSL: true }
    }));
    const userDataService = { getUserConfigPath: () => tmpDir };
    const svc = defaultUpdateServiceFactory({ __tag: 'version' }, userDataService);
    assert.strictEqual(svc._allowInsecureSSL, true, '从 config 读 true');
    assert.ok(svc._httpsAgent instanceof https.Agent, '构建 agent');
  } finally {
    fsReal.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('defaultUpdateServiceFactory 无 config.json 时默认 false', () => {
  const tmpDir = fsReal.mkdtempSync(path.join(os.tmpdir(), 'xkat-factory-'));
  try {
    const userDataService = { getUserConfigPath: () => tmpDir };
    const svc = defaultUpdateServiceFactory({ __tag: 'version' }, userDataService);
    assert.strictEqual(svc._allowInsecureSSL, false, '无 config 默认 false');
    assert.strictEqual(svc._httpsAgent, undefined, '无 agent');
  } finally {
    fsReal.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('defaultUpdateServiceFactory config 无 allowInsecureSSL key 时默认 false', () => {
  const tmpDir = fsReal.mkdtempSync(path.join(os.tmpdir(), 'xkat-factory-'));
  try {
    fsReal.writeFileSync(path.join(tmpDir, 'config.json'), JSON.stringify({
      APP_SETTINGS: { autoCheckUpdate: true }
    }));
    const userDataService = { getUserConfigPath: () => tmpDir };
    const svc = defaultUpdateServiceFactory({ __tag: 'version' }, userDataService);
    assert.strictEqual(svc._allowInsecureSSL, false, '无 key 默认 false');
  } finally {
    fsReal.rmSync(tmpDir, { recursive: true, force: true });
  }
});

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
const { UpdateService, normalizeUpdateError, parseSha256FromBody, computeFileSha256 } = require(UPDATE_SERVICE_PATH);
const VERSION_COMPARE_PATH = path.join(
  __dirname, '..', '..', 'electron', 'src', 'main', 'utils', 'versionCompare.js'
);
const { compareVersions } = require(VERSION_COMPARE_PATH);

// ── Fakes ──────────────────────────────────────────────

function makeFakeVersionService(version = '1.0.0', fullVersion = null) {
  const calls = { getVersion: 0, getFullVersion: 0 };
  return {
    calls,
    getVersion() {
      calls.getVersion++;
      return version;
    },
    getFullVersion() {
      calls.getFullVersion++;
      return fullVersion !== null ? fullVersion : version;
    }
  };
}

// ⚠️ 防复发警示 (2026-08-26):
// UpdateService 默认 fileSystemFactory 使用真实 fs, 构造时 updateDir =
// getUserConfigPath()/updates。若测试未注入 fileSystemFactory 且调用
// downloadUpdate/installUpdate (触发 _ensureInitialized → ensureDir),
// 假路径 /fake/... 会在 Windows 被解析为真实盘符路径 (如 D://fake//user//config//updates)
// 并被真实创建。历史上 R16 初版测试曾因此留下 D://fake 残留目录。
// 规则: 一切触发 _ensureInitialized 的测试必须注入 fileSystemFactory (makeFakeFileSystem)
// 或使用真实 tmpDir (如 L660 起的用例), 禁止直接使用 /fake 假路径。
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
  const versionService = makeFakeVersionService(opts.version || '1.0.0', opts.fullVersion);
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

  // R10: 测试可注入 expectedSha256 + matching hashCalculator, 跳过 checkForUpdate 直接验证 download/install
  if (opts.expectedSha256) {
    svc._expectedSha256 = opts.expectedSha256;
    svc._hashCalculator = {
      compute: async () => opts.expectedSha256,
    };
  }

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
      { name: 'XKAutoTester Setup v2.0.0.exe', browser_download_url: 'https://github.com/RingOnTheWay/XKAutoTester/releases/download/v2.0.0/2.0.0.exe', size: 50000000 }
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
    expectedSha256: 'a'.repeat(64),  // R10: 注入 hash 避免 missing_hash 拒绝
    fileSystem: {
      defaultExists: true,
      readdirResult: ['old-installer.exe', 'readme.txt'],
    }
  });

  // constructor 不触发
  assert.strictEqual(fileSystem.calls.ensureDir.length, 0, 'constructor 后 ensureDir 未调');
  assert.strictEqual(fileSystem.calls.readdir.length, 0, 'constructor 后 readdir 未调');

  // 首次 downloadUpdate 触发
  await svc.downloadUpdate('https://github.com/RingOnTheWay/XKAutoTester/releases/download/v2.0.0/2.0.0.exe', 'XKAutoTester Setup v2.0.0.exe', null);

  assert.strictEqual(fileSystem.calls.ensureDir.length, 1, '首次 downloadUpdate 调 ensureDir 1 次');
  assert.strictEqual(fileSystem.calls.ensureDir[0], svc.updateDir, 'ensureDir 收 updateDir');
  assert.ok(fileSystem.calls.readdir.length >= 1, '首次 downloadUpdate 触发 cleanupOldUpdates readdir');
  // cleanupOldUpdates 应删除 .exe 文件 (old-installer.exe, 可能还有 setup.exe 本身因 defaultExists=true)
  assert.ok(fileSystem.calls.unlink.length >= 1, 'cleanupOldUpdates 删除 old-installer.exe');
  assert.strictEqual(svc._initialized, true, '懒初始化后 _initialized=true');
});

test('懒初始化幂等: 重复 downloadUpdate 仅初始化一次', async () => {
  const { svc, fileSystem } = makeFakeApp({
    expectedSha256: 'a'.repeat(64),  // R10: 注入 hash 避免 missing_hash 拒绝
    fileSystem: { defaultExists: false, readdirResult: [] }
  });

  await svc.downloadUpdate('https://github.com/RingOnTheWay/XKAutoTester/releases/download/v2.0.0/2.0.0.exe', 'setup.exe', null);
  await svc.downloadUpdate('https://github.com/RingOnTheWay/XKAutoTester/releases/download/v2.0.0/2.0.0.exe', 'setup.exe', null);
  await svc.downloadUpdate('https://github.com/RingOnTheWay/XKAutoTester/releases/download/v2.0.0/2.0.0.exe', 'setup.exe', null);

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
  assert.strictEqual(result.downloadUrl, 'https://github.com/RingOnTheWay/XKAutoTester/releases/download/v2.0.0/2.0.0.exe');
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

test('checkForUpdate 同版本不误报: 本地 fullVersion 与 tag 相同 → hasUpdate=false', async () => {
  const release = makeRelease({ tag_name: 'v1.0.5-dev.2' });
  const { svc } = makeFakeApp({
    version: '1.0.5',           // version.json 的 version 字段 (不含 prerelease)
    fullVersion: '1.0.5-dev.2', // fullVersion 含 prerelease
    release,
    versionComparator: compareVersions,
  });

  const result = await svc.checkForUpdate();

  assert.strictEqual(result.hasUpdate, false, '同版本 (fullVersion==tag) → hasUpdate=false');
  assert.strictEqual(result.currentVersion, '1.0.5-dev.2');
  assert.strictEqual(result.latestVersion, '1.0.5-dev.2');
});

test('checkForUpdate versionComparator 收到 fullVersion 而非 version', async () => {
  const release = makeRelease({ tag_name: 'v1.0.5-dev.2' });
  const { svc, versionComparatorCalls } = makeFakeApp({
    version: '1.0.5',
    fullVersion: '1.0.5-dev.2',
    release,
  });

  const result = await svc.checkForUpdate();

  assert.strictEqual(result.hasUpdate, false);
  assert.deepEqual(versionComparatorCalls.compare[0], { v1: '1.0.5-dev.2', v2: '1.0.5-dev.2' },
    'versionComparator 应收到 fullVersion 而非 version');
});

test('checkForUpdate 更高 pre-release 版本仍检测到更新', async () => {
  const release = makeRelease({ tag_name: 'v1.0.6-dev.1' });
  const { svc } = makeFakeApp({
    version: '1.0.5',
    fullVersion: '1.0.5-dev.2',
    release,
    versionComparator: compareVersions,
  });

  const result = await svc.checkForUpdate();

  assert.strictEqual(result.hasUpdate, true, '1.0.5-dev.2 < 1.0.6-dev.1 → hasUpdate=true');
});

test('downloadUpdate 已存在文件返快路径 {success, filePath, message}', async () => {
  const { svc, fileSystem, downloadStrategy } = makeFakeApp({
    configPath: '/fake/config',
    expectedSha256: 'a'.repeat(64),  // R10: 注入 hash 避免 missing_hash 拒绝
    fileSystem: {
      defaultExists: true,  // updateDir 和 filePath 都返 true
      readdirResult: [],
    }
  });

  const fileName = 'XKAutoTester Setup v2.0.0.exe';
  const expectedFilePath = path.join(svc.updateDir, fileName);

  const result = await svc.downloadUpdate('https://github.com/RingOnTheWay/XKAutoTester/releases/download/v2.0.0/2.0.0.exe', fileName, null);

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.filePath, expectedFilePath);
  assert.strictEqual(result.message, 'File already downloaded');
  // downloadStrategy 不应被调
  assert.strictEqual(downloadStrategy.calls.download.length, 0, '快路径不调 downloadStrategy');
});

test('downloadUpdate 不存在调 downloadStrategy.download', async () => {
  const { svc, downloadStrategy } = makeFakeApp({
    configPath: '/fake/config',
    expectedSha256: 'a'.repeat(64),  // R10: 注入 hash 避免 missing_hash 拒绝
    fileSystem: {
      defaultExists: false,  // 文件不存在
      readdirResult: [],
    }
  });

  const fileName = 'setup.exe';
  const expectedFilePath = path.join(svc.updateDir, fileName);
  const eventSender = { send: () => {} };

  const result = await svc.downloadUpdate('https://github.com/RingOnTheWay/XKAutoTester/releases/download/v2.0.0/2.0.0.exe', fileName, eventSender);

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.filePath, expectedFilePath);
  assert.strictEqual(result.message, 'Download completed');
  assert.strictEqual(downloadStrategy.calls.download.length, 1, 'downloadStrategy.download 调 1 次');
  assert.deepEqual(downloadStrategy.calls.download[0], {
    downloadUrl: 'https://github.com/RingOnTheWay/XKAutoTester/releases/download/v2.0.0/2.0.0.exe',
    filePath: expectedFilePath,
    eventSender,
  });
});

test('installUpdate 调 installStrategy.install (fileSystem.exists=true)', async () => {
  const filePath = '/fake/config/updates/setup.exe';
  const { svc, installStrategy, fileSystem } = makeFakeApp({
    expectedSha256: 'a'.repeat(64),  // R10: 注入 hash 避免 missing_hash 拒绝
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

// ── defaultUpdateServiceFactory 纯构造 (M4: 副作用外移至 updateServiceInitializer) ──

const os = require('os');
const fsReal = require('fs');
const { defaultUpdateServiceFactory } = require('../../electron/src/main/services/application/factories');

test('defaultUpdateServiceFactory 纯构造: 不读 config, allowInsecureSSL=false (M4)', () => {
  const userDataService = { getUserConfigPath: () => '/nonexistent/path' };
  const svc = defaultUpdateServiceFactory({ __tag: 'version' }, userDataService);
  assert.strictEqual(svc._allowInsecureSSL, false, '纯构造默认 false');
  assert.strictEqual(svc._httpsAgent, undefined, '无 agent');
});

// ── UpdateService.initialize(config) 二段构造 (M4) ──

test('initialize(config) allowInsecureSSL=true: 调 setAllowInsecureSSL 重建 agent', () => {
  const spy = makeSpyUpdateSourceFactory();
  const svc = new UpdateService(makeFakeVersionService(), makeFakeUserDataService(), {
    updateSourceFactory: spy,
  });
  assert.strictEqual(svc._allowInsecureSSL, false, '初始 false');

  svc.initialize({ APP_SETTINGS: { allowInsecureSSL: true } });

  assert.strictEqual(svc._allowInsecureSSL, true, 'config apply 后 true');
  assert.ok(svc._httpsAgent instanceof https.Agent, '构建 agent');
  assert.strictEqual(spy.calls.length, 2, 'factory 重新调');
});

test('initialize(config) allowInsecureSSL 缺失: 保持 false, 不重建 agent', () => {
  const spy = makeSpyUpdateSourceFactory();
  const svc = new UpdateService(makeFakeVersionService(), makeFakeUserDataService(), {
    updateSourceFactory: spy,
  });

  svc.initialize({ APP_SETTINGS: { autoCheckUpdate: true } });

  assert.strictEqual(svc._allowInsecureSSL, false, '无 key 保持 false');
  assert.strictEqual(svc._httpsAgent, undefined, '无 agent');
  assert.strictEqual(spy.calls.length, 1, 'factory 不重新调 (同值幂等)');
});

test('initialize(config) null config: 保持 false, 不抛', () => {
  const svc = new UpdateService(makeFakeVersionService(), makeFakeUserDataService());
  svc.initialize(null);
  assert.strictEqual(svc._allowInsecureSSL, false, 'null config 保持 false');
});

// ── defaultUpdateServiceInitializer 读 config.json (M4: 副作用外移) ──

const { defaultUpdateServiceInitializer } = require('../../electron/src/main/services/application/effects');

test('defaultUpdateServiceInitializer 读 config.json allowInsecureSSL=true → 调 initialize', async () => {
  const tmpDir = fsReal.mkdtempSync(path.join(os.tmpdir(), 'xkat-init-'));
  try {
    fsReal.writeFileSync(path.join(tmpDir, 'config.json'), JSON.stringify({
      APP_SETTINGS: { allowInsecureSSL: true }
    }));
    const spy = makeSpyUpdateSourceFactory();
    const svc = new UpdateService(makeFakeVersionService(), { getUserConfigPath: () => tmpDir }, {
      updateSourceFactory: spy,
    });
    assert.strictEqual(svc._allowInsecureSSL, false, 'initializer 前默认 false');

    await defaultUpdateServiceInitializer(svc, tmpDir);

    assert.strictEqual(svc._allowInsecureSSL, true, 'initializer 后 true');
    assert.ok(svc._httpsAgent instanceof https.Agent, '构建 agent');
  } finally {
    fsReal.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('defaultUpdateServiceInitializer 无 config.json → 不调 initialize (保持默认)', async () => {
  const tmpDir = fsReal.mkdtempSync(path.join(os.tmpdir(), 'xkat-init-'));
  try {
    const spy = makeSpyUpdateSourceFactory();
    const svc = new UpdateService(makeFakeVersionService(), { getUserConfigPath: () => tmpDir }, {
      updateSourceFactory: spy,
    });

    await defaultUpdateServiceInitializer(svc, tmpDir);

    assert.strictEqual(svc._allowInsecureSSL, false, '无 config 保持 false');
    assert.strictEqual(spy.calls.length, 1, 'factory 不重新调');
  } finally {
    fsReal.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('defaultUpdateServiceInitializer config 无 allowInsecureSSL key → 保持 false', async () => {
  const tmpDir = fsReal.mkdtempSync(path.join(os.tmpdir(), 'xkat-init-'));
  try {
    fsReal.writeFileSync(path.join(tmpDir, 'config.json'), JSON.stringify({
      APP_SETTINGS: { autoCheckUpdate: true }
    }));
    const svc = new UpdateService(makeFakeVersionService(), { getUserConfigPath: () => tmpDir });

    await defaultUpdateServiceInitializer(svc, tmpDir);

    assert.strictEqual(svc._allowInsecureSSL, false, '无 key 保持 false');
  } finally {
    fsReal.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ── P1 SHA256 校验 ───────────────────────────────────────

// fake hashCalculator: 返回可配置的 hash
function makeFakeHashCalculator(hashToReturn) {
  const calls = [];
  return {
    calls,
    compute: async (filePath) => {
      calls.push(filePath);
      return hashToReturn;
    },
  };
}

// 构造带 SHA256 校验的 service (checkForUpdate 已调, _expectedSha256 已设)
function makeAppWithSha256(opts = {}) {
  const expectedHash = opts.expectedHash || 'a'.repeat(64);
  const actualHash = opts.actualHash !== undefined ? opts.actualHash : expectedHash;
  const hashCalculator = makeFakeHashCalculator(actualHash);
  const release = makeRelease({
    body: opts.body !== undefined ? opts.body : `Release notes\nSHA256: ${expectedHash}\nMore notes`,
  });
  const app = makeFakeApp({
    release,
    fileSystem: { defaultExists: false, readdirResult: [], existsResults: opts.existsResults || {} },
  });
  // 注入 hashCalculator (makeFakeApp 不支持, 手动替换)
  app.svc._hashCalculator = hashCalculator;
  return { ...app, expectedHash, hashCalculator };
}

test('parseSha256FromBody 解析 SHA256 行 (64位 hex)', () => {
  const hash = 'a3f5b8c1d2e4f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1';
  const body = `# Release v2.0.0\n\nSHA256: ${hash}\n\n- feature A\n- feature B`;
  assert.strictEqual(parseSha256FromBody(body), hash);
});

test('parseSha256FromBody 大写 hex 转小写', () => {
  const hashUpper = 'A3F5B8C1D2E4F6A7B8C9D0E1F2A3B4C5D6E7F8A9B0C1D2E3F4A5B6C7D8E9F0A1';
  const hashLower = hashUpper.toLowerCase();
  assert.strictEqual(parseSha256FromBody(`SHA256: ${hashUpper}`), hashLower);
});

test('parseSha256FromBody 无 SHA256 行返 null', () => {
  assert.strictEqual(parseSha256FromBody('Release notes without hash'), null);
  assert.strictEqual(parseSha256FromBody(''), null);
  assert.strictEqual(parseSha256FromBody(null), null);
  assert.strictEqual(parseSha256FromBody(undefined), null);
});

test('parseSha256FromBody 短 hash 不匹配 (需 64 位)', () => {
  assert.strictEqual(parseSha256FromBody('SHA256: abc123'), null);
});

test('parseSha256FromBody 容忍前后空格 + 多种分隔', () => {
  const hash = 'b'.repeat(64);
  assert.strictEqual(parseSha256FromBody(`SHA256:  ${hash}`), hash);
  assert.strictEqual(parseSha256FromBody(`SHA256:${hash}`), hash);
  assert.strictEqual(parseSha256FromBody(`  SHA256:   ${hash}  `), hash);
});

// ── P1 扩展: parseSha256FromBody 按 fileName 匹配 asset 专属 hash ──

test('parseSha256FromBody 按 fileName 匹配 asset 专属 hash (完整包)', () => {
  const fullHash = 'a'.repeat(64);
  const liteHash = 'b'.repeat(64);
  const fullFileName = 'XKAutoTester Setup v2.0.0.exe';
  const liteFileName = 'XKAutoTester Setup v2.0.0 Lite.exe';
  const body = `## v2.0.0\n\n**${fullFileName}**\nSHA256: ${fullHash}\n\n**${liteFileName}**\nSHA256: ${liteHash}\n`;

  assert.strictEqual(parseSha256FromBody(body, fullFileName), fullHash, '完整包 fileName 匹配完整包 hash');
  assert.strictEqual(parseSha256FromBody(body, liteFileName), liteHash, 'Lite 包 fileName 匹配 Lite 包 hash');
});

test('parseSha256FromBody 按 fileName 匹配 Lite 包 hash (Lite 包)', () => {
  const fullHash = 'c'.repeat(64);
  const liteHash = 'd'.repeat(64);
  const fullFileName = 'XKAutoTester Setup v2.0.0.exe';
  const liteFileName = 'XKAutoTester Setup v2.0.0 Lite.exe';
  // Lite 在前, 完整在后, 验证按名匹配不取首个
  const body = `**${liteFileName}**\nSHA256: ${liteHash}\n\n**${fullFileName}**\nSHA256: ${fullHash}\n`;

  assert.strictEqual(parseSha256FromBody(body, liteFileName), liteHash, 'Lite 在前仍按名匹配');
  assert.strictEqual(parseSha256FromBody(body, fullFileName), fullHash, '完整在后仍按名匹配');
});

test('parseSha256FromBody fileName 不匹配回退首个 SHA256', () => {
  const hash = 'e'.repeat(64);
  const body = `Release notes\nSHA256: ${hash}\n`;
  // fileName 在 body 中无对应 **fileName** 块
  assert.strictEqual(parseSha256FromBody(body, 'nonexistent.exe'), hash, 'fileName 不匹配回退首个');
});

test('parseSha256FromBody fileName 含正则特殊字符 (.exe 的 .) 正确转义', () => {
  const hash = 'f'.repeat(64);
  // fileName 含 . 和空格, 需正确转义否则正则匹配失败
  const fileName = 'XKAutoTester Setup v2.0.0.exe';
  const body = `**${fileName}**\nSHA256: ${hash}\n`;
  assert.strictEqual(parseSha256FromBody(body, fileName), hash, '. 正确转义, 按名匹配');
});

test('parseSha256FromBody fileName 匹配但块内无 SHA256 回退首个', () => {
  const hash = '1'.repeat(64);
  const fileName = 'XKAutoTester Setup v2.0.0.exe';
  // fileName 块存在但块内无 SHA256 行, 应回退到 body 首个 SHA256
  const body = `**${fileName}**\nno hash here\n\nOther section\nSHA256: ${hash}\n`;
  assert.strictEqual(parseSha256FromBody(body, fileName), hash, '块内无 hash 回退首个');
});

test('parseSha256FromBody 无 fileName 回退首个 (向后兼容)', () => {
  const hash = '2'.repeat(64);
  const body = `SHA256: ${hash}\n`;
  assert.strictEqual(parseSha256FromBody(body), hash, '不传 fileName 取首个');
  assert.strictEqual(parseSha256FromBody(body, undefined), hash, 'fileName=undefined 取首个');
  assert.strictEqual(parseSha256FromBody(body, ''), hash, 'fileName=空串取首个');
});

test('checkForUpdate 解析 Release body 存 _expectedSha256 + 透出 sha256 字段', async () => {
  const expectedHash = 'c'.repeat(64);
  const release = makeRelease({ body: `Release notes\nSHA256: ${expectedHash}` });
  const { svc } = makeFakeApp({ release });

  const result = await svc.checkForUpdate();

  assert.strictEqual(result.sha256, expectedHash, '结果含 sha256 字段');
  assert.strictEqual(svc._expectedSha256, expectedHash, '_expectedSha256 已存');
});

test('checkForUpdate Release body 无 hash → sha256=null + _expectedSha256=null (R10: download/install 将拒绝)', async () => {
  const release = makeRelease({ body: 'Release notes without hash' });
  const { svc } = makeFakeApp({ release });

  const result = await svc.checkForUpdate();

  assert.strictEqual(result.sha256, null);
  assert.strictEqual(svc._expectedSha256, null);
  assert.strictEqual(result.secure, false, 'R10: 无 hash → secure=false');
});

test('downloadUpdate 下载后 SHA256 匹配 → 成功', async () => {
  const { svc, hashCalculator } = makeAppWithSha256({ expectedHash: 'd'.repeat(64) });
  await svc.checkForUpdate();  // 设置 _expectedSha256

  const result = await svc.downloadUpdate('https://github.com/RingOnTheWay/XKAutoTester/releases/download/v2.0.0/2.0.0.exe', 'setup.exe', null);

  assert.strictEqual(result.success, true);
  assert.strictEqual(hashCalculator.calls.length, 1, '下载后调 1 次 hash 计算');
});

test('downloadUpdate 下载后 SHA256 不匹配 → 删除文件 + 抛错', async () => {
  const { svc, fileSystem } = makeAppWithSha256({
    expectedHash: 'e'.repeat(64),
    actualHash: 'f'.repeat(64),  // 不匹配
  });
  await svc.checkForUpdate();

  await assert.rejects(
    svc.downloadUpdate('https://github.com/RingOnTheWay/XKAutoTester/releases/download/v2.0.0/2.0.0.exe', 'setup.exe', null),
    /SHA256 校验失败/
  );
  // 文件应被删除
  assert.ok(fileSystem.calls.unlink.length >= 1, '校验失败应删除文件');
});

test('downloadUpdate 快路径文件已存在 + SHA256 匹配 → 直接返回', async () => {
  const filePath = path.join('/fake/config', 'updates', 'setup.exe');
  const { svc, hashCalculator } = makeAppWithSha256({
    expectedHash: '1'.repeat(64),
    existsResults: { [filePath]: true },
  });
  await svc.checkForUpdate();

  const result = await svc.downloadUpdate('https://github.com/RingOnTheWay/XKAutoTester/releases/download/v2.0.0/2.0.0.exe', 'setup.exe', null);

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.message, 'File already downloaded');
  assert.strictEqual(hashCalculator.calls.length, 1, '快路径也调 hash 计算');
});

test('downloadUpdate 快路径文件已存在 + SHA256 不匹配 → 删除 + 重新下载', async () => {
  const filePath = path.join('/fake/config', 'updates', 'setup.exe');
  let currentHash = 'wrong-hash';
  const { svc, fileSystem, downloadStrategy } = makeAppWithSha256({
    expectedHash: '2'.repeat(64),
    existsResults: { [filePath]: true },
  });
  // 第一次 compute 返错 hash (快路径校验), 第二次返正确 hash (下载后校验)
  svc._hashCalculator = {
    compute: async () => {
      const r = currentHash;
      currentHash = '2'.repeat(64);  // 后续调用返正确 hash
      return r;
    },
  };
  await svc.checkForUpdate();

  const result = await svc.downloadUpdate('https://github.com/RingOnTheWay/XKAutoTester/releases/download/v2.0.0/2.0.0.exe', 'setup.exe', null);

  assert.strictEqual(result.success, true, '重下载后应成功');
  assert.ok(fileSystem.calls.unlink.length >= 1, '缓存文件应被删除');
  assert.strictEqual(downloadStrategy.calls.download.length, 1, '应触发重新下载');
});

test('installUpdate 安装前 SHA256 匹配 → 调 installStrategy', async () => {
  const filePath = '/fake/config/updates/setup.exe';
  const { svc, installStrategy } = makeAppWithSha256({
    expectedHash: '3'.repeat(64),
    existsResults: { [filePath]: true },
  });
  await svc.checkForUpdate();

  await svc.installUpdate(filePath);

  assert.strictEqual(installStrategy.calls.install.length, 1, '应调 install');
});

test('installUpdate 安装前 SHA256 不匹配 → 抛错 + 不调 installStrategy', async () => {
  const filePath = '/fake/config/updates/setup.exe';
  const { svc, installStrategy } = makeAppWithSha256({
    expectedHash: '4'.repeat(64),
    actualHash: '5'.repeat(64),
    existsResults: { [filePath]: true },
  });
  await svc.checkForUpdate();

  await assert.rejects(
    svc.installUpdate(filePath),
    /SHA256 校验失败/
  );
  assert.strictEqual(installStrategy.calls.install.length, 0, '不应调 install');
});

// R10: 严格拒绝无 hash 版本 (安全闭环) ─────────────────────────

test('R10 downloadUpdate 无 _expectedSha256 (checkForUpdate 未调) → 拒绝下载 + missing_hash code', async () => {
  const { svc, downloadStrategy } = makeFakeApp({
    fileSystem: { defaultExists: false, readdirResult: [] },
  });

  await assert.rejects(
    svc.downloadUpdate('https://github.com/RingOnTheWay/XKAutoTester/releases/download/v2.0.0/2.0.0.exe', 'setup.exe', null),
    (err) => {
      assert.match(err.message, /缺少 SHA256 hash/, '错误消息含"缺少 SHA256 hash"');
      assert.strictEqual(err.code, 'missing_hash', 'errorCode=missing_hash');
      return true;
    }
  );
  assert.strictEqual(downloadStrategy.calls.download.length, 0, '不应触发下载');
});

test('R10 downloadUpdate checkForUpdate 调了但 Release 无 hash → 拒绝下载 + missing_hash code', async () => {
  const release = makeRelease({ body: 'Release notes without hash' });
  const { svc, downloadStrategy } = makeFakeApp({
    release,
    fileSystem: { defaultExists: false, readdirResult: [] },
  });
  await svc.checkForUpdate();  // _expectedSha256=null (body 无 hash)

  await assert.rejects(
    svc.downloadUpdate('https://github.com/RingOnTheWay/XKAutoTester/releases/download/v2.0.0/2.0.0.exe', 'setup.exe', null),
    (err) => {
      assert.strictEqual(err.code, 'missing_hash');
      return true;
    }
  );
  assert.strictEqual(downloadStrategy.calls.download.length, 0, '不应触发下载');
});

test('R10 installUpdate 无 _expectedSha256 → 拒绝安装 + missing_hash code', async () => {
  const filePath = '/fake/config/updates/setup.exe';
  const { svc, installStrategy } = makeFakeApp({
    fileSystem: {
      existsResults: { [filePath]: true },
      readdirResult: [],
    }
  });
  // 不调 checkForUpdate, _expectedSha256=null

  await assert.rejects(
    svc.installUpdate(filePath),
    (err) => {
      assert.match(err.message, /缺少 SHA256 hash/);
      assert.strictEqual(err.code, 'missing_hash');
      return true;
    }
  );
  assert.strictEqual(installStrategy.calls.install.length, 0, '不应调 install');
});

test('R10 checkForUpdate Release 有 hash → result.secure=true', async () => {
  const expectedHash = 'a'.repeat(64);
  const release = makeRelease({ body: `Release notes\nSHA256: ${expectedHash}` });
  const { svc } = makeFakeApp({ release });

  const result = await svc.checkForUpdate();

  assert.strictEqual(result.secure, true, '有 hash → secure=true');
  assert.strictEqual(result.sha256, expectedHash);
});

test('R10 checkForUpdate Release 无 hash → result.secure=false (UI 可警告)', async () => {
  const release = makeRelease({ body: 'Release notes without hash' });
  const { svc } = makeFakeApp({ release });

  const result = await svc.checkForUpdate();

  assert.strictEqual(result.secure, false, '无 hash → secure=false');
  assert.strictEqual(result.sha256, null);
});

test('R10 checkForUpdate 无 release → result.secure=false (无更新场景)', async () => {
  const { svc } = makeFakeApp({ release: null });

  const result = await svc.checkForUpdate();

  assert.strictEqual(result.secure, false, '无 release 时 secure=false (无更新不安装)');
});

test('computeFileSha256 真实文件计算 (集成)', async () => {
  const os = require('os');
  const fsReal = require('fs');
  const tmpDir = fsReal.mkdtempSync(path.join(os.tmpdir(), 'xkat-sha-'));
  try {
    const filePath = path.join(tmpDir, 'test.bin');
    const content = 'hello world';
    fsReal.writeFileSync(filePath, content);
    const hash = await computeFileSha256(filePath);
    // 已知 'hello world' 的 SHA256
    const crypto = require('crypto');
    const expected = crypto.createHash('sha256').update(content).digest('hex');
    assert.strictEqual(hash, expected);
    assert.strictEqual(hash.length, 64);
  } finally {
    fsReal.rmSync(tmpDir, { recursive: true, force: true });
  }
});


// ── P0-4 安全回归: 文件名清洗 + 下载域名校验 ─────────────────────────

test('P0-4 sanitizeUpdateFileName: 剥离路径成分 + 扩展名白名单', () => {
  const { sanitizeUpdateFileName } = require(path.join(__dirname, '..', '..', 'electron', 'src', 'main', 'services', 'UpdateService.js'));
  assert.strictEqual(sanitizeUpdateFileName('XKAutoTester Setup v2.0.0.exe'), 'XKAutoTester Setup v2.0.0.exe');
  assert.strictEqual(sanitizeUpdateFileName('..\\..\\victim.exe'), 'victim.exe', '路径穿越必须被裁剪为 basename');
  assert.strictEqual(sanitizeUpdateFileName('..\\\\..\\\\evil.exe'), 'evil.exe');
  assert.strictEqual(sanitizeUpdateFileName('setup.zip'), 'setup.zip');
  assert.strictEqual(sanitizeUpdateFileName('setup.pdf'), null, '非白名单扩展名拒绝');
  assert.strictEqual(sanitizeUpdateFileName('setup'), null, '无扩展名拒绝');
  assert.strictEqual(sanitizeUpdateFileName(''), null);
  assert.strictEqual(sanitizeUpdateFileName(null), null);
  assert.strictEqual(sanitizeUpdateFileName('evil.exe\u0000.txt'), null, '控制字符拒绝');
});

test('P0-4 isTrustedDownloadUrl: 仅放行 GitHub release 域', () => {
  const { isTrustedDownloadUrl } = require(path.join(__dirname, '..', '..', 'electron', 'src', 'main', 'services', 'UpdateService.js'));
  assert.strictEqual(isTrustedDownloadUrl('https://github.com/RingOnTheWay/XKAutoTester/releases/download/v2.0.0/app.exe'), true);
  assert.strictEqual(isTrustedDownloadUrl('https://objects.githubusercontent.com/xxx/app.exe'), true);
  assert.strictEqual(isTrustedDownloadUrl('https://evil.com/app.exe'), false);
  assert.strictEqual(isTrustedDownloadUrl('file:///C:/app.exe'), false);
  assert.strictEqual(isTrustedDownloadUrl('javascript:alert(1)'), false);
  assert.strictEqual(isTrustedDownloadUrl('not-a-url'), false);
  assert.strictEqual(isTrustedDownloadUrl(null), false);
});

test('P0-4 downloadUpdate 路径穿越文件名被裁剪为 basename', async () => {
  const { svc, downloadStrategy } = makeFakeApp({
    expectedSha256: 'deadbeef',
    downloadResult: { success: true },
  });
  const result = await svc.downloadUpdate(
    'https://github.com/RingOnTheWay/XKAutoTester/releases/download/v2.0.0/app.exe',
    '..\\..\\victim.exe',
    null
  );
  assert.strictEqual(result.success, true, result.error || '');
  const call = downloadStrategy.calls.download[0];
  assert.ok(call, 'downloadStrategy 应被调用');
  // 关键安全断言: 下载目标路径必须位于 updateDir 内且不含 '..' 穿越
  assert.ok(!call.filePath.includes('..'), '下载路径不得包含路径穿越');
  assert.ok(call.filePath.endsWith('victim.exe'), '应使用裁剪后的文件名 (basename)');
});

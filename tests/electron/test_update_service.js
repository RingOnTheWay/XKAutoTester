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
const { UpdateService } = require(UPDATE_SERVICE_PATH);

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

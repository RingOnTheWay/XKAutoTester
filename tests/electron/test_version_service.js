// VersionService 单测 — 1 factory (fileSystemFactory) + 懒初始化 + 5 公共方法。
// 验证: constructor 不触发 fs + 首次 getVersionInfo 触发 exists + readFileSync + 重复幂等 + 文件不存在返默认 + clearCache。
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const VERSION_SERVICE_PATH = path.join(
  __dirname, '..', '..', 'electron', 'src', 'main', 'services', 'VersionService.js'
);
const { VersionService } = require(VERSION_SERVICE_PATH);

// ── Fakes ──────────────────────────────────────────────

function makeFakeFileSystem(opts = {}) {
  const calls = { exists: [], readFileSync: [] };
  return {
    calls,
    exists: (p) => {
      calls.exists.push(p);
      return opts.existsResult !== undefined ? opts.existsResult : false;
    },
    readFileSync: (p, encoding) => {
      calls.readFileSync.push({ p, encoding });
      if (opts.readFileSyncThrow) throw opts.readFileSyncThrow;
      return opts.readFileSyncResult || '{}';
    },
  };
}

// ── Tests ──────────────────────────────────────────────

test('constructor 收 fileSystemFactory + _initialized=false', () => {
  const fakeFs = makeFakeFileSystem();
  const svc = new VersionService('/proj', { fileSystemFactory: () => fakeFs });

  assert.strictEqual(svc.projectRoot, '/proj');
  assert.strictEqual(svc._initialized, false);
  assert.strictEqual(svc._versionData, null);
  assert.strictEqual(svc._fs, fakeFs);
  // 构造期不触发 fs
  assert.deepStrictEqual(fakeFs.calls.exists, []);
});

test('懒初始化: 首次 getVersionInfo 触发 exists + readFileSync', () => {
  const fakeFs = makeFakeFileSystem({
    existsResult: true,
    readFileSyncResult: JSON.stringify({ version: '1.2.3', fullVersion: '1.2.3-dev' }),
  });
  const svc = new VersionService('/proj', { fileSystemFactory: () => fakeFs });

  const info = svc.getVersionInfo();

  assert.deepStrictEqual(fakeFs.calls.exists, [path.join('/proj', 'version.json')]);
  assert.strictEqual(fakeFs.calls.readFileSync.length, 1);
  assert.strictEqual(info.version, '1.2.3');
  assert.strictEqual(info.fullVersion, '1.2.3-dev');
  assert.strictEqual(svc._initialized, true);
});

test('懒初始化幂等: 重复 getVersionInfo 仅读 1 次', () => {
  const fakeFs = makeFakeFileSystem({
    existsResult: true,
    readFileSyncResult: JSON.stringify({ version: '1.0.0' }),
  });
  const svc = new VersionService('/proj', { fileSystemFactory: () => fakeFs });

  svc.getVersionInfo();
  svc.getVersionInfo();
  svc.getVersionInfo();

  assert.strictEqual(fakeFs.calls.readFileSync.length, 1);
});

test('文件不存在返 DEFAULT_VERSION_INFO', () => {
  const fakeFs = makeFakeFileSystem({ existsResult: false });
  const svc = new VersionService('/proj', { fileSystemFactory: () => fakeFs });

  const info = svc.getVersionInfo();

  assert.deepStrictEqual(info, { version: '0.0.0', buildDate: '', prerelease: '', fullVersion: '0.0.0' });
});

test('clearCache 重置 _initialized + _versionData, 下次重新读', () => {
  const fakeFs = makeFakeFileSystem({
    existsResult: true,
    readFileSyncResult: JSON.stringify({ version: '2.0.0' }),
  });
  const svc = new VersionService('/proj', { fileSystemFactory: () => fakeFs });

  svc.getVersionInfo();
  assert.strictEqual(fakeFs.calls.readFileSync.length, 1);

  svc.clearCache();
  assert.strictEqual(svc._initialized, false);
  assert.strictEqual(svc._versionData, null);

  svc.getVersionInfo();
  assert.strictEqual(fakeFs.calls.readFileSync.length, 2);
});

test('getVersion / getFullVersion / getBuildDate / getDisplayVersion 委托', () => {
  const fakeFs = makeFakeFileSystem({
    existsResult: true,
    readFileSyncResult: JSON.stringify({
      version: '1.0.0', fullVersion: '1.0.0-rc.1', buildDate: '2026-07-28'
    }),
  });
  const svc = new VersionService('/proj', { fileSystemFactory: () => fakeFs });

  assert.strictEqual(svc.getVersion(), '1.0.0');
  assert.strictEqual(svc.getFullVersion(), '1.0.0-rc.1');
  assert.strictEqual(svc.getBuildDate(), '2026-07-28');
  assert.strictEqual(svc.getDisplayVersion(), 'v1.0.0-rc.1');
});

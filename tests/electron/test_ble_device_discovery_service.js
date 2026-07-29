// BleDeviceDiscoveryService 单测 — 1 factory (fileSystemFactory) + 懒初始化 + 3 公共方法。
// 验证: constructor 不触发 fs + 首次 getDevices 触发 scan + 重复幂等 + 目录不存在返空 + metadata 过滤 + getDeviceDetail。
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const BLE_SERVICE_PATH = path.join(
  __dirname, '..', '..', 'electron', 'src', 'main', 'services', 'BleDeviceDiscoveryService.js'
);
const { BleDeviceDiscoveryService } = require(BLE_SERVICE_PATH);

// ── Fakes ──────────────────────────────────────────────

function makeFakeFileSystem(opts = {}) {
  const calls = { exists: [], readdirSync: [], readFileSync: [] };
  const dirEntries = opts.dirEntries || [];
  const subDirEntries = opts.subDirEntries || {};
  const fileContents = opts.fileContents || {};

  return {
    calls,
    exists: (p) => {
      calls.exists.push(p);
      return opts.existsResult !== undefined ? opts.existsResult : true;
    },
    readdirSync: (dir, readdirOpts) => {
      calls.readdirSync.push({ dir, readdirOpts });
      if (readdirOpts && readdirOpts.withFileTypes) {
        return dirEntries.map(name => ({
          name, isDirectory: () => subDirEntries[name] !== undefined
        }));
      }
      // 找对应 subDir 的文件列表
      for (const [subDirName, files] of Object.entries(subDirEntries)) {
        if (dir.endsWith(subDirName)) return files;
      }
      return [];
    },
    readFileSync: (p, encoding) => {
      calls.readFileSync.push({ p, encoding });
      if (fileContents[p] === '__THROW__') throw new Error('parse fail');
      return fileContents[p] || '{}';
    },
  };
}

// ── Tests ──────────────────────────────────────────────

test('constructor 收 fileSystemFactory + _initialized=false', () => {
  const fakeFs = makeFakeFileSystem();
  const svc = new BleDeviceDiscoveryService('/proj', { fileSystemFactory: () => fakeFs });

  assert.strictEqual(svc.projectRoot, '/proj');
  assert.strictEqual(svc._initialized, false);
  assert.strictEqual(svc._deviceCache, null);
  assert.strictEqual(svc._fs, fakeFs);
  assert.deepStrictEqual(fakeFs.calls.exists, []);  // 构造期不触发
});

test('懒初始化: 首次 getDevices 触发 scan', async () => {
  const fakeFs = makeFakeFileSystem({
    dirEntries: ['bioland'],
    subDirEntries: { 'bioland': ['device.json'] },
    fileContents: {},
  });
  fakeFs.exists = async (p) => {  // 注意: 同步 exists 在 _scanDevices 中是同步的
    fakeFs.calls.exists.push(p);
    return true;
  };
  // 重写为同步 exists (scanDevices 用同步 fs)
  const syncFs = {
    calls: fakeFs.calls,
    exists: (p) => { fakeFs.calls.exists.push(p); return true; },
    readdirSync: fakeFs.readdirSync,
    readFileSync: fakeFs.readFileSync,
  };
  const svc = new BleDeviceDiscoveryService('/proj', { fileSystemFactory: () => syncFs });

  const result = await svc.getDevices();

  assert.strictEqual(svc._initialized, true);
  assert.ok(svc._deviceCache !== null);
  assert.deepStrictEqual(result, { success: true, data: svc._deviceCache });
});

test('懒初始化幂等: 重复 getDevices 仅 scan 1 次', async () => {
  let scanCount = 0;
  const syncFs = {
    exists: () => true,
    readdirSync: (dir, opts) => {
      scanCount++;
      if (opts && opts.withFileTypes) return [];
      return [];
    },
    readFileSync: () => '{}',
  };
  const svc = new BleDeviceDiscoveryService('/proj', { fileSystemFactory: () => syncFs });

  await svc.getDevices();
  await svc.getDevices();
  await svc.getDevices();

  assert.strictEqual(scanCount, 1);  // 只 scan 顶层目录 1 次
});

test('_scanDevices 目录不存在返空数组', async () => {
  const syncFs = {
    exists: () => false,
    readdirSync: () => [],
    readFileSync: () => '{}',
  };
  const svc = new BleDeviceDiscoveryService('/proj', { fileSystemFactory: () => syncFs });

  const result = await svc.getDevices();

  assert.deepStrictEqual(result, { success: true, data: [] });
});

test('_scanDevices 解析 metadata + 过滤无 deviceId/bleConfig', async () => {
  const syncFs = {
    exists: () => true,
    readdirSync: (dir, opts) => {
      if (opts && opts.withFileTypes) {
        return [
          { name: 'bioland', isDirectory: () => true },
          { name: 'empty', isDirectory: () => true },
        ];
      }
      // 第二层 readdirSync
      if (dir.endsWith('bioland')) return ['dev1.json', 'dev2.json', 'invalid.json'];
      if (dir.endsWith('empty')) return [];
      return [];
    },
    readFileSync: (p) => {
      if (p.endsWith('dev1.json')) {
        return JSON.stringify({ deviceId: 'bioland-001', bleConfig: { port: 'COM3' }, name: 'Bioland' });
      }
      if (p.endsWith('dev2.json')) {
        return JSON.stringify({ deviceId: 'bioland-002', bleConfig: { port: 'COM4' } });
      }
      if (p.endsWith('invalid.json')) {
        return JSON.stringify({ foo: 'bar' });  // 无 deviceId + bleConfig
      }
      return '{}';
    },
  };
  const svc = new BleDeviceDiscoveryService('/proj', { fileSystemFactory: () => syncFs });

  const result = await svc.getDevices();
  const devices = result.data;

  assert.strictEqual(devices.length, 2);
  assert.strictEqual(devices[0].deviceId, 'bioland-001');
  assert.strictEqual(devices[0].bleConfig.port, 'COM3');
  assert.strictEqual(devices[0]._sourceDir, 'bioland');
  assert.strictEqual(devices[0]._sourceFile, 'dev1.json');
  assert.strictEqual(devices[1].deviceId, 'bioland-002');
});

test('getDeviceDetail 找到/未找到', async () => {
  const syncFs = {
    exists: () => true,
    readdirSync: (dir, opts) => {
      if (opts && opts.withFileTypes) return [{ name: 'bioland', isDirectory: () => true }];
      return ['dev1.json'];
    },
    readFileSync: (p) => JSON.stringify({ deviceId: 'bioland-001', bleConfig: {} }),
  };
  const svc = new BleDeviceDiscoveryService('/proj', { fileSystemFactory: () => syncFs });

  const found = await svc.getDeviceDetail('bioland-001');
  assert.strictEqual(found.success, true);
  assert.strictEqual(found.data.deviceId, 'bioland-001');

  const notFound = await svc.getDeviceDetail('non-existent');
  assert.strictEqual(notFound.success, false);
  assert.match(notFound.error, /Device not found: non-existent/);
});

test('refreshCache 强制重扫 + _initialized=true', async () => {
  let scanCount = 0;
  const syncFs = {
    exists: () => true,
    readdirSync: (dir, opts) => {
      if (opts && opts.withFileTypes) {
        scanCount++;
        return [];
      }
      return [];
    },
    readFileSync: () => '{}',
  };
  const svc = new BleDeviceDiscoveryService('/proj', { fileSystemFactory: () => syncFs });

  await svc.getDevices();
  assert.strictEqual(scanCount, 1);

  svc.refreshCache();
  assert.strictEqual(scanCount, 2);
  assert.strictEqual(svc._initialized, true);

  await svc.getDevices();  // 不再触发 scan
  assert.strictEqual(scanCount, 2);
});

// WindowsRegistryBridge 单元测试
// 验证: 1) 默认 registry key 2) 自定义 registry key
//      3) writePath 调用 spawnSync 4) 非 Windows 平台 noop 5) spawnSync 失败时不抛
// R7: 改测 spawnSync (原 execSync 字符串拼接有命令注入风险, 已改 spawnSync 数组参数)
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const Module = require('module');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const REGISTRY_PATH = path.join(
  PROJECT_ROOT, 'electron', 'src', 'main', 'services', 'WindowsRegistryBridge.js'
);

/**
 * mock child_process.spawnSync
 * @returns {{ calls: Array, restore: Function }}
 */
function mockSpawnSync() {
  const calls = [];
  const fakeSpawnSync = (cmd, args, opts) => {
    calls.push({ cmd, args, opts });
    return { status: 0, stdout: '', stderr: '' };
  };
  const origLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'child_process') {
      return { spawnSync: fakeSpawnSync };
    }
    return origLoad.call(this, request, parent, isMain);
  };
  return {
    calls,
    restore: () => { Module._load = origLoad; }
  };
}

/**
 * mock child_process.spawnSync 抛异常
 */
function mockSpawnSyncThrow(errorMsg) {
  const fakeSpawnSync = () => {
    throw new Error(errorMsg);
  };
  const origLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'child_process') {
      return { spawnSync: fakeSpawnSync };
    }
    return origLoad.call(this, request, parent, isMain);
  };
  return () => { Module._load = origLoad; };
}

/**
 * mock child_process.spawnSync 返回非 0 退出码
 */
function mockSpawnSyncFailure() {
  const fakeSpawnSync = () => ({
    status: 1,
    stdout: '',
    stderr: 'reg add failed'
  });
  const origLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'child_process') {
      return { spawnSync: fakeSpawnSync };
    }
    return origLoad.call(this, request, parent, isMain);
  };
  return () => { Module._load = origLoad; };
}

/**
 * 强制设置 process.platform
 */
function setPlatform(platform) {
  const orig = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
  return () => {
    if (orig) {
      Object.defineProperty(process, 'platform', orig);
    } else {
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    }
  };
}

function loadBridge() {
  delete require.cache[require.resolve(REGISTRY_PATH)];
  return require(REGISTRY_PATH);
}


// ─── 构造函数 ───────────────────────────────────────────────────

test('默认 registry key 为 HKCU\\Software\\XKAutoTester', () => {
  const restore = setPlatform('win32');
  try {
    const WindowsRegistryBridge = loadBridge();
    const bridge = new WindowsRegistryBridge();
    assert.strictEqual(bridge.registryKey, 'HKCU\\Software\\XKAutoTester');
  } finally {
    restore();
  }
});

test('自定义 registry key', () => {
  const restore = setPlatform('win32');
  try {
    const WindowsRegistryBridge = loadBridge();
    const bridge = new WindowsRegistryBridge('HKCU\\Software\\MyApp');
    assert.strictEqual(bridge.registryKey, 'HKCU\\Software\\MyApp');
  } finally {
    restore();
  }
});


// ─── writePath (Windows) ──────────────────────────────────────

test('writePath 在 Windows 平台调用 spawnSync 执行 reg add', () => {
  const restorePlatform = setPlatform('win32');
  const spawnMock = mockSpawnSync();
  try {
    const WindowsRegistryBridge = loadBridge();
    const bridge = new WindowsRegistryBridge();
    bridge.writePath('UserDataPath', 'C:\\Users\\Test\\XKAutoTester');

    assert.strictEqual(spawnMock.calls.length, 1);
    assert.strictEqual(spawnMock.calls[0].cmd, 'reg');
    // R7: args 数组参数, 不经 shell 解析, 根除命令注入
    assert.deepStrictEqual(spawnMock.calls[0].args, [
      'add', 'HKCU\\Software\\XKAutoTester',
      '/v', 'UserDataPath',
      '/t', 'REG_SZ',
      '/d', 'C:\\Users\\Test\\XKAutoTester',
      '/f'
    ]);
    assert.strictEqual(spawnMock.calls[0].opts.windowsHide, true);
  } finally {
    spawnMock.restore();
    restorePlatform();
  }
});

test('writePath 路径含双引号/cmd 元字符时原样传递 (spawnSync 无需转义)', () => {
  const restorePlatform = setPlatform('win32');
  const spawnMock = mockSpawnSync();
  try {
    const WindowsRegistryBridge = loadBridge();
    const bridge = new WindowsRegistryBridge();
    // 路径含双引号和 & | 等 cmd 元字符 (原 execSync 需转义, spawnSync 数组参数原样传递)
    const maliciousPath = 'C:\\path"with"quotes" & | % ^';

    bridge.writePath('UserDataPath', maliciousPath);

    assert.strictEqual(spawnMock.calls.length, 1);
    // 验证 dataPath 原样出现在 args[7] (add/key//v/name//t/type//d/data//f), 未经 shell 解释
    assert.strictEqual(spawnMock.calls[0].args[7], maliciousPath);
    // 验证 cmd 不是字符串拼接 (无注入点)
    assert.strictEqual(spawnMock.calls[0].cmd, 'reg');
  } finally {
    spawnMock.restore();
    restorePlatform();
  }
});


// ─── writePath (非 Windows) ────────────────────────────────────

test('writePath 在非 Windows 平台 noop (不调用 spawnSync)', () => {
  const restorePlatform = setPlatform('linux');
  const spawnMock = mockSpawnSync();
  try {
    const WindowsRegistryBridge = loadBridge();
    const bridge = new WindowsRegistryBridge();
    bridge.writePath('UserDataPath', '/home/user/data');

    assert.strictEqual(spawnMock.calls.length, 0, '非 Windows 平台不应调用 spawnSync');
  } finally {
    spawnMock.restore();
    restorePlatform();
  }
});

test('writePath 在 darwin 平台 noop', () => {
  const restorePlatform = setPlatform('darwin');
  const spawnMock = mockSpawnSync();
  try {
    const WindowsRegistryBridge = loadBridge();
    const bridge = new WindowsRegistryBridge();
    bridge.writePath('UserDataPath', '/Users/test/data');

    assert.strictEqual(spawnMock.calls.length, 0);
  } finally {
    spawnMock.restore();
    restorePlatform();
  }
});


// ─── spawnSync 失败容错 ─────────────────────────────────────────

test('writePath spawnSync 抛异常时不传播', () => {
  const restorePlatform = setPlatform('win32');
  const restoreSpawn = mockSpawnSyncThrow('reg command failed');
  try {
    const WindowsRegistryBridge = loadBridge();
    const bridge = new WindowsRegistryBridge();
    // 不应抛异常
    assert.doesNotThrow(() => {
      bridge.writePath('UserDataPath', 'C:\\test');
    });
  } finally {
    restoreSpawn();
    restorePlatform();
  }
});

test('writePath spawnSync 返回非 0 退出码时不抛 (仅记日志)', () => {
  const restorePlatform = setPlatform('win32');
  const restoreSpawn = mockSpawnSyncFailure();
  try {
    const WindowsRegistryBridge = loadBridge();
    const bridge = new WindowsRegistryBridge();
    // 不应抛异常 (R7: status !== 0 时 console.error 但不抛)
    assert.doesNotThrow(() => {
      bridge.writePath('UserDataPath', 'C:\\test');
    });
  } finally {
    restoreSpawn();
    restorePlatform();
  }
});

// WindowsRegistryBridge 单元测试
// 验证: 1) 默认 registry key 2) 自定义 registry key
//      3) writePath 调用 execSync 4) 非 Windows 平台 noop 5) execSync 失败时不抛
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const Module = require('module');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const REGISTRY_PATH = path.join(
  PROJECT_ROOT, 'electron', 'src', 'main', 'services', 'WindowsRegistryBridge.js'
);

/**
 * mock child_process.execSync
 * @returns {{ calls: Array, restore: Function, execSync: Function }}
 */
function mockExecSync() {
  const calls = [];
  const fakeExecSync = (cmd, opts) => {
    calls.push({ cmd, opts });
  };
  const origLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'child_process') {
      return { execSync: fakeExecSync };
    }
    return origLoad.call(this, request, parent, isMain);
  };
  return {
    calls,
    restore: () => { Module._load = origLoad; }
  };
}

/**
 * mock child_process.execSync 抛异常
 */
function mockExecSyncThrow(errorMsg) {
  const fakeExecSync = () => {
    throw new Error(errorMsg);
  };
  const origLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'child_process') {
      return { execSync: fakeExecSync };
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

test('writePath 在 Windows 平台调用 execSync 执行 reg add', () => {
  const restorePlatform = setPlatform('win32');
  const execMock = mockExecSync();
  try {
    const WindowsRegistryBridge = loadBridge();
    const bridge = new WindowsRegistryBridge();
    bridge.writePath('UserDataPath', 'C:\\Users\\Test\\XKAutoTester');

    assert.strictEqual(execMock.calls.length, 1);
    assert.ok(execMock.calls[0].cmd.includes('reg add'));
    assert.ok(execMock.calls[0].cmd.includes('"HKCU\\Software\\XKAutoTester"'));
    assert.ok(execMock.calls[0].cmd.includes('/v UserDataPath'));
    assert.ok(execMock.calls[0].cmd.includes('/t REG_SZ'));
    assert.ok(execMock.calls[0].cmd.includes('/d "C:\\Users\\Test\\XKAutoTester"'));
    assert.ok(execMock.calls[0].cmd.includes('/f'));
    assert.strictEqual(execMock.calls[0].opts.windowsHide, true);
  } finally {
    execMock.restore();
    restorePlatform();
  }
});

test('writePath 路径含双引号时正确转义', () => {
  const restorePlatform = setPlatform('win32');
  const execMock = mockExecSync();
  try {
    const WindowsRegistryBridge = loadBridge();
    const bridge = new WindowsRegistryBridge();
    // 路径含 3 个双引号
    bridge.writePath('UserDataPath', 'C:\\path"with"quotes"');

    assert.strictEqual(execMock.calls.length, 1);
    const cmd = execMock.calls[0].cmd;
    // 验证: 每个 " 应被转义为 \" (即 cmd 中 \\" 出现 3 次, 排除 /d 开头/结尾的 2 个)
    // 简化: 验证 cmd 中包含 \\\"path\\\"with\\\"quotes\\\" 序列
    assert.ok(
      cmd.includes('C:\\path\\"with\\"quotes\\"'),
      `路径中的双引号应转义为 \\", 实际 cmd: ${cmd}`
    );
  } finally {
    execMock.restore();
    restorePlatform();
  }
});


// ─── writePath (非 Windows) ────────────────────────────────────

test('writePath 在非 Windows 平台 noop (不调用 execSync)', () => {
  const restorePlatform = setPlatform('linux');
  const execMock = mockExecSync();
  try {
    const WindowsRegistryBridge = loadBridge();
    const bridge = new WindowsRegistryBridge();
    bridge.writePath('UserDataPath', '/home/user/data');

    assert.strictEqual(execMock.calls.length, 0, '非 Windows 平台不应调用 execSync');
  } finally {
    execMock.restore();
    restorePlatform();
  }
});

test('writePath 在 darwin 平台 noop', () => {
  const restorePlatform = setPlatform('darwin');
  const execMock = mockExecSync();
  try {
    const WindowsRegistryBridge = loadBridge();
    const bridge = new WindowsRegistryBridge();
    bridge.writePath('UserDataPath', '/Users/test/data');

    assert.strictEqual(execMock.calls.length, 0);
  } finally {
    execMock.restore();
    restorePlatform();
  }
});


// ─── execSync 失败容错 ─────────────────────────────────────────

test('writePath execSync 抛异常时不传播', () => {
  const restorePlatform = setPlatform('win32');
  const restoreExec = mockExecSyncThrow('reg command failed');
  try {
    const WindowsRegistryBridge = loadBridge();
    const bridge = new WindowsRegistryBridge();
    // 不应抛异常
    assert.doesNotThrow(() => {
      bridge.writePath('UserDataPath', 'C:\\test');
    });
  } finally {
    restoreExec();
    restorePlatform();
  }
});

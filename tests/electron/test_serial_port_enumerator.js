// SerialPortEnumerator 单元测试
// 验证: 1) pythonConfig 为 null 时返回 venvNotFound
//      2) executeCommand 返回 code=0 + JSON → 解析后返回 data
//      3) executeCommand 返回 code!=0 → 返回 stderr
//      4) executeCommand 抛异常 → 返回 error.message
//      5) JSON 解析失败 → 抛异常返回 error.message
// 策略: 注入 mock spawnHelper + Module._load 拦截 pathHelper 返回 mock pythonConfig
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const Module = require('module');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const SERIAL_PORT_ENUMERATOR_PATH = path.join(
  PROJECT_ROOT, 'electron', 'src', 'main', 'services', 'SerialPortEnumerator.js'
);

const i18nMock = {
  t: (key, params) => key + (params ? ` ${JSON.stringify(params)}` : ''),
};

/**
 * 拦截 pathHelper 模块, 返回 mock pythonConfig
 * @param {Object|null} pythonConfig - mock pythonConfig 对象, null 表示未配置
 * @returns {Function} restore 函数
 */
function mockPathHelper(pythonConfig) {
  const origLoad = Module._load;
  const pathHelperMock = {
    getPythonConfig: () => pythonConfig,
  };
  Module._load = function (request, parent, isMain) {
    if (request === '../utils/pathHelper' || request === './pathHelper') return pathHelperMock;
    return origLoad.call(this, request, parent, isMain);
  };
  return () => { Module._load = origLoad; };
}

function loadSerialPortEnumerator() {
  delete require.cache[require.resolve(SERIAL_PORT_ENUMERATOR_PATH)];
  return require(SERIAL_PORT_ENUMERATOR_PATH);
}

/**
 * 构造 mock spawnHelper
 */
function createSpawnHelperMock(impl) {
  const calls = [];
  const executeCommand = async (cmd, args, options) => {
    calls.push({ cmd, args, options });
    return impl ? impl(cmd, args, options) : { code: 0, stdout: '', stderr: '' };
  };
  return { executeCommand, calls };
}


// ─── getSerialPorts ───────────────────────────────────────────

test('getSerialPorts pythonConfig 为 null → 返回 venvNotFound', async () => {
  const restorePathHelper = mockPathHelper(null);
  try {
    const SerialPortEnumerator = loadSerialPortEnumerator();
    const spawnHelper = createSpawnHelperMock();
    const enumerator = new SerialPortEnumerator(i18nMock, spawnHelper);

    const result = await enumerator.getSerialPorts();

    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('venvNotFound'));
    assert.strictEqual(spawnHelper.calls.length, 0, 'pythonConfig=null 不应调用 executeCommand');
  } finally {
    restorePathHelper();
  }
});

test('getSerialPorts executeCommand 返回 code=0 + 有效 JSON → success + data', async () => {
  const pythonConfig = {
    pythonPath: '/fake/python.exe',
    isEmbedded: true,
    sourceLabel: '(内置)',
  };
  const restorePathHelper = mockPathHelper(pythonConfig);
  try {
    const SerialPortEnumerator = loadSerialPortEnumerator();
    const portsData = [
      { deviceId: 'COM3', name: 'USB Serial Port', manufacturer: 'Silicon Labs', serial_number: '0001', hwid: 'USB VID:PID=10C4:EA60', vid: 4292, pid: 60000 },
      { deviceId: 'COM5', name: 'Arduino', manufacturer: 'Arduino', serial_number: '', hwid: 'USB VID:PID=2341:0043', vid: 9025, pid: 67 },
    ];
    const spawnHelper = createSpawnHelperMock(async () => ({
      code: 0,
      stdout: JSON.stringify(portsData),
      stderr: '',
    }));
    const enumerator = new SerialPortEnumerator(i18nMock, spawnHelper);

    const result = await enumerator.getSerialPorts();

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data.length, 2);
    assert.strictEqual(result.data[0].deviceId, 'COM3');
    assert.strictEqual(result.data[1].deviceId, 'COM5');
    assert.strictEqual(spawnHelper.calls.length, 1);
    assert.strictEqual(spawnHelper.calls[0].cmd, '/fake/python.exe');
  } finally {
    restorePathHelper();
  }
});

test('getSerialPorts executeCommand 返回 code!=0 → 返回 stderr 作为 error', async () => {
  const pythonConfig = { pythonPath: '/fake/python.exe' };
  const restorePathHelper = mockPathHelper(pythonConfig);
  try {
    const SerialPortEnumerator = loadSerialPortEnumerator();
    const spawnHelper = createSpawnHelperMock(async () => ({
      code: 1,
      stdout: '',
      stderr: 'ModuleNotFoundError: No module named serial',
    }));
    const enumerator = new SerialPortEnumerator(i18nMock, spawnHelper);

    const result = await enumerator.getSerialPorts();

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error, 'ModuleNotFoundError: No module named serial');
  } finally {
    restorePathHelper();
  }
});

test('getSerialPorts executeCommand 返回 code=0 但 stderr 无 stdout → fallback error', async () => {
  const pythonConfig = { pythonPath: '/fake/python.exe' };
  const restorePathHelper = mockPathHelper(pythonConfig);
  try {
    const SerialPortEnumerator = loadSerialPortEnumerator();
    const spawnHelper = createSpawnHelperMock(async () => ({
      code: 1,
      stdout: '',
      stderr: '',
    }));
    const enumerator = new SerialPortEnumerator(i18nMock, spawnHelper);

    const result = await enumerator.getSerialPorts();

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error, 'Failed to list serial ports', 'stderr 为空时应用 fallback 文案');
  } finally {
    restorePathHelper();
  }
});

test('getSerialPorts executeCommand 抛异常 → 返回 error.message', async () => {
  const pythonConfig = { pythonPath: '/fake/python.exe' };
  const restorePathHelper = mockPathHelper(pythonConfig);
  try {
    const SerialPortEnumerator = loadSerialPortEnumerator();
    const spawnHelper = createSpawnHelperMock(async () => {
      throw new Error('spawn ENOENT');
    });
    const enumerator = new SerialPortEnumerator(i18nMock, spawnHelper);

    const result = await enumerator.getSerialPorts();

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error, 'spawn ENOENT');
  } finally {
    restorePathHelper();
  }
});

test('getSerialPorts stdout 为空数组 → success + data=[]', async () => {
  const pythonConfig = { pythonPath: '/fake/python.exe' };
  const restorePathHelper = mockPathHelper(pythonConfig);
  try {
    const SerialPortEnumerator = loadSerialPortEnumerator();
    const spawnHelper = createSpawnHelperMock(async () => ({
      code: 0,
      stdout: '[]',
      stderr: '',
    }));
    const enumerator = new SerialPortEnumerator(i18nMock, spawnHelper);

    const result = await enumerator.getSerialPorts();

    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.data, []);
  } finally {
    restorePathHelper();
  }
});

test('getSerialPorts stdout 为空字符串 → 解析为 []', async () => {
  const pythonConfig = { pythonPath: '/fake/python.exe' };
  const restorePathHelper = mockPathHelper(pythonConfig);
  try {
    const SerialPortEnumerator = loadSerialPortEnumerator();
    const spawnHelper = createSpawnHelperMock(async () => ({
      code: 0,
      stdout: '',
      stderr: '',
    }));
    const enumerator = new SerialPortEnumerator(i18nMock, spawnHelper);

    const result = await enumerator.getSerialPorts();

    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.data, []);
  } finally {
    restorePathHelper();
  }
});

test('getSerialPorts stdout 非法 JSON → JSON.parse 抛异常 → 返回 error.message', async () => {
  const pythonConfig = { pythonPath: '/fake/python.exe' };
  const restorePathHelper = mockPathHelper(pythonConfig);
  try {
    const SerialPortEnumerator = loadSerialPortEnumerator();
    const spawnHelper = createSpawnHelperMock(async () => ({
      code: 0,
      stdout: 'not json {',
      stderr: '',
    }));
    const enumerator = new SerialPortEnumerator(i18nMock, spawnHelper);

    const result = await enumerator.getSerialPorts();

    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('JSON'), `应包含 JSON 错误信息, 实际: ${result.error}`);
  } finally {
    restorePathHelper();
  }
});

test('getSerialPorts 传递 -c listScript 参数', async () => {
  const pythonConfig = { pythonPath: '/fake/python.exe' };
  const restorePathHelper = mockPathHelper(pythonConfig);
  try {
    const SerialPortEnumerator = loadSerialPortEnumerator();
    const spawnHelper = createSpawnHelperMock(async () => ({ code: 0, stdout: '[]', stderr: '' }));
    const enumerator = new SerialPortEnumerator(i18nMock, spawnHelper);

    await enumerator.getSerialPorts();

    assert.strictEqual(spawnHelper.calls.length, 1);
    assert.strictEqual(spawnHelper.calls[0].cmd, '/fake/python.exe');
    assert.strictEqual(spawnHelper.calls[0].args[0], '-c', '应传递 -c 标志');
    assert.strictEqual(typeof spawnHelper.calls[0].args[1], 'string', '应传递脚本字符串');
    assert.ok(
      spawnHelper.calls[0].args[1].includes('serial.tools.list_ports'),
      '脚本应包含 serial.tools.list_ports 调用'
    );
  } finally {
    restorePathHelper();
  }
});

// ADBService facade 集成测试
// 验证: 1) getConnectedDevices 解析 2) executeAdbCommand 命令路由 (connect/tcpip/devices)
//      3) uploadFile/downloadFile/installApk 委托 collaborator 4) pathHelper 委托
// 策略: 构造注入 mock collaborator + spawn mock
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const Module = require('module');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const ADB_SERVICE_PATH = path.join(PROJECT_ROOT, 'electron', 'src', 'main', 'services', 'ADBService.js');
const PATH_HELPER_PATH = path.join(PROJECT_ROOT, 'electron', 'src', 'main', 'utils', 'pathHelper.js');

const {
  createSpawnMock,
  createExecMock,
  setupChildProcessMock,
} = require(path.join(__dirname, 'helpers', 'serviceMock.js'));

// pathHelper 需 mock electron (isPackaged/resourcesPath)
function setupElectronMock() {
  const electronMock = {
    app: { getPath: () => '/tmp/fake', isPackaged: false },
    process: { resourcesPath: '' },
  };
  const origLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'electron') return electronMock;
    return origLoad.call(this, request, parent, isMain);
  };
  return () => { Module._load = origLoad; };
}

function loadAdbService() {
  delete require.cache[require.resolve(ADB_SERVICE_PATH)];
  delete require.cache[require.resolve(PATH_HELPER_PATH)];
  return require(ADB_SERVICE_PATH);
}

const i18nMock = {
  t: (key, params) => key + (params ? ` ${JSON.stringify(params)}` : ''),
};

// ── getConnectedDevices 测试 (mock executor) ───────────────

test('getConnectedDevices 解析 adb devices 输出中的设备', async () => {
  const executorMock = {
    execute: async (args, opts) => {
      assert.deepStrictEqual(args, ['devices']);
      return {
        success: true,
        output: 'List of devices attached\n70665345151351    device\n192.168.1.100:5555    device\n',
        error: '',
      };
    },
  };
  const restoreElectron = setupElectronMock();
  try {
    const ADBService = loadAdbService();
    const svc = new ADBService(PROJECT_ROOT, i18nMock, { commandExecutor: executorMock });
    const devices = await svc.getConnectedDevices();

    assert.strictEqual(devices.length, 2);
    assert.deepStrictEqual(devices[0], { id: '70665345151351', status: 'device' });
    assert.deepStrictEqual(devices[1], { id: '192.168.1.100:5555', status: 'device' });
  } finally {
    restoreElectron();
  }
});

test('getConnectedDevices 区分 device/unauthorized/offline 状态', async () => {
  const executorMock = {
    execute: async () => ({
      success: true,
      output: 'List of devices attached\ndev1    device\ndev2    unauthorized\ndev3    offline\ndev4    device\n',
      error: '',
    }),
  };
  const restoreElectron = setupElectronMock();
  try {
    const ADBService = loadAdbService();
    const svc = new ADBService(PROJECT_ROOT, i18nMock, { commandExecutor: executorMock });
    const devices = await svc.getConnectedDevices();

    assert.strictEqual(devices.length, 4);
    assert.deepStrictEqual(devices.find(d => d.id === 'dev1'), { id: 'dev1', status: 'device' });
    assert.deepStrictEqual(devices.find(d => d.id === 'dev2'), { id: 'dev2', status: 'unauthorized' });
    assert.deepStrictEqual(devices.find(d => d.id === 'dev3'), { id: 'dev3', status: 'offline' });
  } finally {
    restoreElectron();
  }
});

test('getConnectedDevices executor 失败时返回空数组', async () => {
  const executorMock = {
    execute: async () => ({ success: false, output: '', error: 'adb not found' }),
  };
  const restoreElectron = setupElectronMock();
  try {
    const ADBService = loadAdbService();
    const svc = new ADBService(PROJECT_ROOT, i18nMock, { commandExecutor: executorMock });
    const devices = await svc.getConnectedDevices();

    assert.deepStrictEqual(devices, []);
  } finally {
    restoreElectron();
  }
});

test('getConnectedDevices 忽略空行和无关行', async () => {
  const executorMock = {
    execute: async () => ({
      success: true,
      output: 'List of devices attached\n\n70665345151351    device\n\n* daemon not running\n',
      error: '',
    }),
  };
  const restoreElectron = setupElectronMock();
  try {
    const ADBService = loadAdbService();
    const svc = new ADBService(PROJECT_ROOT, i18nMock, { commandExecutor: executorMock });
    const devices = await svc.getConnectedDevices();

    assert.strictEqual(devices.length, 1);
    assert.strictEqual(devices[0].id, '70665345151351');
  } finally {
    restoreElectron();
  }
});


// ── executeAdbCommand 命令路由测试 (spawn mock) ──────────────

test('executeAdbCommand 非特殊命令自动加 shell 前缀', async () => {
  let capturedArgs;
  const spawnMock = function (cmd, args, opts) {
    capturedArgs = args;
    const closeCbs = [];
    return {
      stdout: { on: () => {} },
      stderr: { on: () => {} },
      on: (evt, cb) => { if (evt === 'close') closeCbs.push(cb); },
      kill: () => {},
      pid: 1,
      _triggerClose: (code) => closeCbs.forEach(cb => cb(code)),
    };
  };

  const restoreCp = setupChildProcessMock({ spawn: spawnMock });
  const restoreElectron = setupElectronMock();

  try {
    const ADBService = loadAdbService();
    const svc = new ADBService(PROJECT_ROOT, i18nMock, { spawnFn: spawnMock });

    const promise = svc.executeAdbCommand('pm list packages', 'dev1');
    await new Promise(resolve => setTimeout(resolve, 10));

    assert.ok(capturedArgs.includes('shell'), '应包含 shell 前缀');
    assert.ok(capturedArgs.includes('pm'));
    assert.ok(capturedArgs.includes('list'));
    assert.ok(capturedArgs.includes('packages'));
    assert.ok(capturedArgs.includes('-s'));
    assert.ok(capturedArgs.includes('dev1'));

    // 避免 unhandled promise
    promise.then(() => {}).catch(() => {});
  } finally {
    restoreElectron();
    restoreCp();
  }
});

test('executeAdbCommand connect 命令不加 shell 前缀', async () => {
  let capturedArgs;
  const spawnMock = function (cmd, args, opts) {
    capturedArgs = args;
    const closeCbs = [];
    const stdoutCbs = [];
    const proc = {
      stdout: { on: (evt, cb) => { if (evt === 'data') stdoutCbs.push(cb); } },
      stderr: { on: () => {} },
      on: (evt, cb) => { if (evt === 'close') closeCbs.push(cb); },
      kill: () => {},
      pid: 1,
    };
    setImmediate(() => {
      stdoutCbs.forEach(cb => cb(Buffer.from('connected to 192.168.1.100:5555')));
      closeCbs.forEach(cb => cb(0));
    });
    return proc;
  };

  const restoreCp = setupChildProcessMock({ spawn: spawnMock });
  const restoreElectron = setupElectronMock();

  try {
    const ADBService = loadAdbService();
    const svc = new ADBService(PROJECT_ROOT, i18nMock, { spawnFn: spawnMock });

    const result = await svc.executeAdbCommand('connect 192.168.1.100:5555', null);

    assert.ok(!capturedArgs.includes('shell'), 'connect 命令不应加 shell');
    assert.ok(capturedArgs.includes('connect'));
    assert.ok(capturedArgs.includes('192.168.1.100:5555'));
    assert.strictEqual(result.success, true);
  } finally {
    restoreElectron();
    restoreCp();
  }
});

test('executeAdbCommand devices 命令不加 shell 前缀', async () => {
  let capturedArgs;
  const spawnMock = function (cmd, args, opts) {
    capturedArgs = args;
    const closeCbs = [];
    const stdoutCbs = [];
    const proc = {
      stdout: { on: (evt, cb) => { if (evt === 'data') stdoutCbs.push(cb); } },
      stderr: { on: () => {} },
      on: (evt, cb) => { if (evt === 'close') closeCbs.push(cb); },
      kill: () => {},
      pid: 1,
    };
    setImmediate(() => {
      stdoutCbs.forEach(cb => cb(Buffer.from('List of devices attached\n')));
      closeCbs.forEach(cb => cb(0));
    });
    return proc;
  };

  const restoreCp = setupChildProcessMock({ spawn: spawnMock });
  const restoreElectron = setupElectronMock();

  try {
    const ADBService = loadAdbService();
    const svc = new ADBService(PROJECT_ROOT, i18nMock, { spawnFn: spawnMock });

    await svc.executeAdbCommand('devices', null);

    assert.ok(!capturedArgs.includes('shell'), 'devices 命令不应加 shell');
    assert.ok(capturedArgs.includes('devices'));
  } finally {
    restoreElectron();
    restoreCp();
  }
});

test('executeAdbCommand 命令执行失败返回 success=false', async () => {
  const spawnMock = function (cmd, args, opts) {
    const closeCbs = [];
    const stderrCbs = [];
    const proc = {
      stdout: { on: () => {} },
      stderr: { on: (evt, cb) => { if (evt === 'data') stderrCbs.push(cb); } },
      on: (evt, cb) => { if (evt === 'close') closeCbs.push(cb); },
      kill: () => {},
      pid: 1,
    };
    setImmediate(() => {
      stderrCbs.forEach(cb => cb(Buffer.from('error: device not found')));
      closeCbs.forEach(cb => cb(1));
    });
    return proc;
  };

  const restoreCp = setupChildProcessMock({ spawn: spawnMock });
  const restoreElectron = setupElectronMock();

  try {
    const ADBService = loadAdbService();
    const svc = new ADBService(PROJECT_ROOT, i18nMock, { spawnFn: spawnMock });

    const result = await svc.executeAdbCommand('shell pm list packages', 'dev1');

    assert.strictEqual(result.success, false);
    assert.ok(result.error);
  } finally {
    restoreElectron();
    restoreCp();
  }
});

test('executeAdbCommand tcpip 命令成功触发端口切换', async () => {
  const spawnMock = function (cmd, args, opts) {
    const closeCbs = [];
    const stdoutCbs = [];
    return {
      stdout: {
        on: (evt, cb) => {
          if (evt === 'data') {
            stdoutCbs.push(cb);
            cb(Buffer.from('restarting in TCP mode port: 5555'));
          }
        },
      },
      stderr: { on: () => {} },
      on: (evt, cb) => { if (evt === 'close') closeCbs.push(cb); },
      kill: () => {},
      pid: 1,
    };
  };

  const restoreCp = setupChildProcessMock({ spawn: spawnMock });
  const restoreElectron = setupElectronMock();

  try {
    const ADBService = loadAdbService();
    const svc = new ADBService(PROJECT_ROOT, i18nMock, { spawnFn: spawnMock });

    const result = await svc.executeAdbCommand('tcpip 5555', 'dev1');

    assert.strictEqual(result.success, true);
    assert.ok(result.output.includes('restarting in TCP mode port'));
  } finally {
    restoreElectron();
    restoreCp();
  }
});


// ── collaborator 委托测试 ──────────────────────────────────

test('uploadFile 委托 fileTransferService.upload', async () => {
  let calledArgs = null;
  const fileTransferMock = {
    upload: async (...args) => {
      calledArgs = args;
      return { success: true, output: 'uploaded' };
    },
  };
  const restoreElectron = setupElectronMock();
  try {
    const ADBService = loadAdbService();
    const svc = new ADBService(PROJECT_ROOT, i18nMock, { fileTransferService: fileTransferMock });

    const result = await svc.uploadFile('/local/f', '/sdcard/f', 'dev1', { send: () => {} });

    assert.strictEqual(result.success, true);
    // deepStrictEqual 比函数引用必不等,改拆分断言
    assert.strictEqual(calledArgs.length, 4);
    assert.strictEqual(calledArgs[0], '/local/f');
    assert.strictEqual(calledArgs[1], '/sdcard/f');
    assert.strictEqual(calledArgs[2], 'dev1');
    assert.ok(calledArgs[3] && typeof calledArgs[3].send === 'function', 'eventSender.send 应为函数');
  } finally {
    restoreElectron();
  }
});

test('downloadFile 委托 fileTransferService.download', async () => {
  let calledArgs = null;
  const fileTransferMock = {
    download: async (...args) => {
      calledArgs = args;
      return { success: true, localPath: '/local/out.zip' };
    },
  };
  const restoreElectron = setupElectronMock();
  try {
    const ADBService = loadAdbService();
    const svc = new ADBService(PROJECT_ROOT, i18nMock, { fileTransferService: fileTransferMock });

    const result = await svc.downloadFile('/sdcard/f', '/local/f', null, null);

    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(calledArgs, ['/sdcard/f', '/local/f', null, null]);
  } finally {
    restoreElectron();
  }
});

test('installApk 委托 apkInstaller.install', async () => {
  let calledArgs = null;
  const apkInstallerMock = {
    install: async (...args) => {
      calledArgs = args;
      return { success: true, output: 'Success' };
    },
  };
  const restoreElectron = setupElectronMock();
  try {
    const ADBService = loadAdbService();
    const svc = new ADBService(PROJECT_ROOT, i18nMock, { apkInstaller: apkInstallerMock });

    const result = await svc.installApk('/local/app.apk', 'dev1', null);

    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(calledArgs, ['/local/app.apk', 'dev1', null]);
  } finally {
    restoreElectron();
  }
});


// ── pathHelper 委托测试 ─────────────────────────────────────

test('ADBService 通过 pathHelper.getAdbPath 获取 adb 路径', async () => {
  const executorMock = {
    execute: async () => ({ success: true, output: 'List of devices attached\n', error: '' }),
  };
  const restoreElectron = setupElectronMock();
  try {
    const ADBService = loadAdbService();
    const svc = new ADBService(PROJECT_ROOT, i18nMock, { commandExecutor: executorMock });

    // ADBService 不应有 getAdbPath 实例方法 (已委托 pathHelper)
    assert.strictEqual(typeof svc.getAdbPath, 'undefined',
      'ADBService 不应再有 getAdbPath 方法 (已委托 pathHelper)');

    const devices = await svc.getConnectedDevices();
    assert.ok(Array.isArray(devices));
  } finally {
    restoreElectron();
  }
});

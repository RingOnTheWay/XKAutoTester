// ADBService facade 集成测试
// 验证: 1) getConnectedDevices 解析 2) executeAdbCommand 命令路由 (connect/tcpip/devices)
//      3) M4: fileTransfer/apkInstaller/remoteStat 属性暴露 + collaborator 直调 4) pathHelper 委托
// M4: 删 3 pass-through wrapper (uploadFile/downloadFile/installApk), 调用方持属性
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

// ── daemon 自动启动 (start-server) 测试 ─────────────────────

test('getConnectedDevices daemon 未运行: 自动 start-server 后重试成功', async () => {
  const callLog = [];
  const executorMock = {
    execute: async (args) => {
      callLog.push(args);
      if (args[0] === 'start-server') {
        return { success: true, output: '* daemon started successfully', error: '' };
      }
      // 第一次 devices: daemon 启动失败; 重试的 devices: 成功返回设备
      if (callLog.filter(a => a[0] === 'devices').length === 1) {
        return { success: false, output: '* daemon not running; starting now at tcp:5037\n', error: 'error: cannot connect to daemon' };
      }
      return { success: true, output: 'List of devices attached\n70665345151351    device\n', error: '' };
    },
  };
  const restoreElectron = setupElectronMock();
  try {
    const ADBService = loadAdbService();
    const svc = new ADBService(PROJECT_ROOT, i18nMock, { commandExecutor: executorMock });
    const devices = await svc.getConnectedDevices();

    assert.deepStrictEqual(callLog, [['devices'], ['start-server'], ['devices']]);
    assert.strictEqual(devices.length, 1);
    assert.deepStrictEqual(devices[0], { id: '70665345151351', status: 'device' });
  } finally {
    restoreElectron();
  }
});

test('getConnectedDevices daemon 冷启动慢: 轮询重试直到成功', async () => {
  const callLog = [];
  let devicesCalls = 0;
  const executorMock = {
    execute: async (args) => {
      callLog.push(args);
      if (args[0] === 'start-server') {
        return { success: true, output: '* daemon started successfully', error: '' };
      }
      devicesCalls += 1;
      // 前 3 次 devices 失败 (初始 1 次 + 轮询 2 次, daemon 尚未就绪); 第 4 次 (轮询第 3 次) 成功
      if (devicesCalls <= 3) {
        return { success: false, output: '', error: 'error: cannot connect to daemon' };
      }
      return { success: true, output: 'List of devices attached\ndev1    device\ndev2    device\n', error: '' };
    },
  };
  const restoreElectron = setupElectronMock();
  try {
    const ADBService = loadAdbService();
    const svc = new ADBService(PROJECT_ROOT, i18nMock, { commandExecutor: executorMock });
    const devices = await svc.getConnectedDevices();

    // 1 次初始 devices + 1 次 start-server + 3 次轮询 (第 3 次成功 break)
    assert.deepStrictEqual(callLog, [
      ['devices'], ['start-server'],
      ['devices'], ['devices'], ['devices'],
    ]);
    assert.strictEqual(devices.length, 2);
  } finally {
    restoreElectron();
  }
});

test('getConnectedDevices devices 首次成功: 不触发 start-server', async () => {
  const callLog = [];
  const executorMock = {
    execute: async (args) => {
      callLog.push(args);
      return { success: true, output: 'List of devices attached\n\ndev1    device\n', error: '' };
    },
  };
  const restoreElectron = setupElectronMock();
  try {
    const ADBService = loadAdbService();
    const svc = new ADBService(PROJECT_ROOT, i18nMock, { commandExecutor: executorMock });
    const devices = await svc.getConnectedDevices();

    assert.deepStrictEqual(callLog, [['devices']]);
    assert.strictEqual(devices.length, 1);
  } finally {
    restoreElectron();
  }
});

test('getConnectedDevices start-server 后仍失败: 轮询耗尽返回空数组', async () => {
  const callLog = [];
  const executorMock = {
    execute: async (args) => {
      callLog.push(args);
      return { success: false, output: '', error: 'adb not found' };
    },
  };
  const restoreElectron = setupElectronMock();
  try {
    const ADBService = loadAdbService();
    const svc = new ADBService(PROJECT_ROOT, i18nMock, { commandExecutor: executorMock });
    const devices = await svc.getConnectedDevices();

    // 1 次初始 devices + 修复(start-server 失败 → kill-server → start-server) + 3 次轮询 devices (全部失败)
    assert.deepStrictEqual(callLog, [
      ['devices'], ['start-server'], ['kill-server'], ['start-server'],
      ['devices'], ['devices'], ['devices'],
    ]);
    assert.deepStrictEqual(devices, []);
  } finally {
    restoreElectron();
  }
});

test('getConnectedDevices start-server 协议错误: kill-server 重建后成功', async () => {
  const callLog = [];
  const executorMock = {
    execute: async (args) => {
      callLog.push(args);
      const cmd = args[0];
      if (cmd === 'start-server') {
        // 第一次 start-server 协议错误 (server 损坏/版本不匹配); kill-server 后第二次成功
        if (callLog.filter(a => a[0] === 'start-server').length === 1) {
          return { success: false, output: '', error: "adb.exe: failed to check server version: protocol fault (couldn't read status): connection reset" };
        }
        return { success: true, output: '* daemon started successfully', error: '' };
      }
      if (cmd === 'kill-server') {
        return { success: true, output: '* server not running', error: '' };
      }
      // devices: 初始失败 (daemon 未运行); 修复后成功
      if (callLog.filter(a => a[0] === 'devices').length === 1) {
        return { success: false, output: '', error: 'error: cannot connect to daemon' };
      }
      return { success: true, output: 'List of devices attached\ndev1    device\n', error: '' };
    },
  };
  const restoreElectron = setupElectronMock();
  try {
    const ADBService = loadAdbService();
    const svc = new ADBService(PROJECT_ROOT, i18nMock, { commandExecutor: executorMock });
    const devices = await svc.getConnectedDevices();

    // 初始 devices → 修复(start-server 协议错误 → kill-server → start-server) → 轮询 devices 成功
    assert.deepStrictEqual(callLog, [
      ['devices'], ['start-server'], ['kill-server'], ['start-server'], ['devices'],
    ]);
    assert.strictEqual(devices.length, 1);
    assert.deepStrictEqual(devices[0], { id: 'dev1', status: 'device' });
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

test('M4: fileTransfer 属性暴露 collaborator + 直调 upload', async () => {
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

    // M4: 调用方直接持 .fileTransfer (无 uploadFile wrapper)
    assert.strictEqual(typeof svc.uploadFile, 'undefined', 'M4: uploadFile wrapper 应已删除');
    assert.strictEqual(svc.fileTransfer, fileTransferMock, 'M4: fileTransfer 属性应暴露注入的 collaborator');

    const result = await svc.fileTransfer.upload('/local/f', '/sdcard/f', 'dev1', { send: () => {} });

    assert.strictEqual(result.success, true);
    assert.strictEqual(calledArgs.length, 4);
    assert.strictEqual(calledArgs[0], '/local/f');
    assert.strictEqual(calledArgs[1], '/sdcard/f');
    assert.strictEqual(calledArgs[2], 'dev1');
    assert.ok(calledArgs[3] && typeof calledArgs[3].send === 'function', 'eventSender.send 应为函数');
  } finally {
    restoreElectron();
  }
});

test('M4: fileTransfer 属性直调 download', async () => {
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

    // M4: 调用方直接持 .fileTransfer (无 downloadFile wrapper)
    assert.strictEqual(typeof svc.downloadFile, 'undefined', 'M4: downloadFile wrapper 应已删除');

    const result = await svc.fileTransfer.download('/sdcard/f', '/local/f', null, null);

    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(calledArgs, ['/sdcard/f', '/local/f', null, null]);
  } finally {
    restoreElectron();
  }
});

test('M4: apkInstaller 属性暴露 collaborator + 直调 install', async () => {
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

    // M4: 调用方直接持 .apkInstaller (无 installApk wrapper)
    assert.strictEqual(typeof svc.installApk, 'undefined', 'M4: installApk wrapper 应已删除');
    assert.strictEqual(svc.apkInstaller, apkInstallerMock, 'M4: apkInstaller 属性应暴露注入的 collaborator');

    const result = await svc.apkInstaller.install('/local/app.apk', 'dev1', null);

    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(calledArgs, ['/local/app.apk', 'dev1', null]);
  } finally {
    restoreElectron();
  }
});

test('M4: remoteStat 属性暴露 collaborator', async () => {
  const remoteStatMock = { stat: async () => ({ success: true }) };
  const restoreElectron = setupElectronMock();
  try {
    const ADBService = loadAdbService();
    const svc = new ADBService(PROJECT_ROOT, i18nMock, { remoteStatService: remoteStatMock });

    // M4: remoteStat 属性应暴露注入的 collaborator
    assert.strictEqual(svc.remoteStat, remoteStatMock);
  } finally {
    restoreElectron();
  }
});

test('M4: tarExtractor factory-or-default 注入', async () => {
  const fakeTarExtractor = { extract: async () => [] };
  const restoreElectron = setupElectronMock();
  try {
    const ADBService = loadAdbService();

    // 默认构造 → 内部 new TarExtractor()
    const svc1 = new ADBService(PROJECT_ROOT, i18nMock);
    assert.ok(svc1.tarExtractor, '默认构造应有 tarExtractor');
    assert.strictEqual(typeof svc1.tarExtractor.extract, 'function');

    // 注入 fake → 用 fake
    const svc2 = new ADBService(PROJECT_ROOT, i18nMock, { tarExtractor: fakeTarExtractor });
    assert.strictEqual(svc2.tarExtractor, fakeTarExtractor, '注入的 tarExtractor 应被使用');
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

// ── P1-6: 危险命令黑名单加固 ─────────────────────────────

test('P1-6 normalizeShellCommand 剥离引号/反斜杠', () => {
  const ADBService = loadAdbService();
  assert.strictEqual(ADBService.normalizeShellCommand(`re'boot'`), 'reboot');
  assert.strictEqual(ADBService.normalizeShellCommand(`re"boot"`), 'reboot');
  assert.strictEqual(ADBService.normalizeShellCommand('r\\eboot'), 'reboot');
  assert.strictEqual(ADBService.normalizeShellCommand('pm list packages'), 'pm list packages');
});

test('P1-6 黑名单拒绝系统级破坏命令 (含引号绕过)', async () => {
  const spawnMock = function () {
    throw new Error('黑名单命中不应 spawn');
  };
  const restoreCp = setupChildProcessMock({ spawn: spawnMock });
  const restoreElectron = setupElectronMock();
  try {
    const ADBService = loadAdbService();
    const svc = new ADBService(PROJECT_ROOT, i18nMock, { spawnFn: spawnMock });

    const blockedCmds = [
      'reboot',
      `re'boot'`,                    // 引号拆分绕过 (P1-6 堵住)
      `re"boot"`,
      'rm -rf /data',
      'rm -rf /system/app',
      'rm -rf /sdcard',
      `rm -rf "/sdcard"`,
      'factory reset',
      'wipe data',
      'pm clear com.android.settings',
      'pm uninstall com.android.settings',
      'dd if=/dev/zero of=/dev/block/sda',
      'su',
      'chmod 777 /system/bin/sh',
    ];
    for (const cmd of blockedCmds) {
      const result = await svc.executeAdbCommand(cmd, 'dev1');
      assert.strictEqual(result.success, false, `应拒绝: ${cmd}`);
      assert.match(result.error, /security policy/);
    }
  } finally {
    restoreElectron();
    restoreCp();
  }
});

test('P1-6 合法命令放行 (查询类; mv/rm 已全面拦截走专用通道)', async () => {
  let spawnCount = 0;
  const spawnMock = function (cmd, args, opts) {
    spawnCount++;
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

    const allowedCmds = [
      'getprop ro.build.version.release',     // 查询
      'dumpsys battery',
      'pm list packages',
      'connect 192.168.1.100:5555',
      'tcpip 5555',
    ];
    for (const cmd of allowedCmds) {
      const promise = svc.executeAdbCommand(cmd, 'dev1');
      await new Promise(resolve => setTimeout(resolve, 5));
      promise.then(() => {}).catch(() => {});
    }
    assert.ok(spawnCount >= allowedCmds.length, `合法命令均应 spawn (实际 ${spawnCount}/${allowedCmds.length})`);

    // P1-6 根治: rm/mv 全面拦截 (文件操作走 deleteRemoteFile/renameRemoteFile 专用通道)
    const blocked = [
      'rm "/sdcard/DCIM/a.jpg"',
      'rm -rf "/sdcard/DCIM/tmp/"',
      'mv "/sdcard/DCIM/a.jpg" "/sdcard/DCIM/b.jpg"',
    ];
    for (const cmd of blocked) {
      const result = await svc.executeAdbCommand(cmd, 'dev1');
      assert.strictEqual(result.success, false, `应拒绝: ${cmd}`);
    }
  } finally {
    restoreElectron();
    restoreCp();
  }
});

// ── P1-6 根治: 专用文件操作通道 ──────────────────────────

test('P1-6 deleteRemoteFile 删除文件: shell rm -f + 设备序列号', async () => {
  let capturedArgs = null;
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

    const promise = svc.deleteRemoteFile('/sdcard/DCIM/a.jpg', 'dev1', false);
    await new Promise(resolve => setTimeout(resolve, 10));
    promise.then(() => {}).catch(() => {});
    assert.ok(capturedArgs.includes('shell'));
    assert.ok(capturedArgs.includes('rm'));
    assert.ok(capturedArgs.includes('-f'));
    assert.strictEqual(capturedArgs[capturedArgs.length - 1], '/sdcard/DCIM/a.jpg');
  } finally {
    restoreElectron();
    restoreCp();
  }
});

test('P1-6 deleteRemoteFile 目录删除用 rm -rf', async () => {
  let capturedArgs = null;
  const spawnMock = function (cmd, args) {
    capturedArgs = args;
    const closeCbs = [];
    return {
      stdout: { on: () => {} }, stderr: { on: () => {} },
      on: (evt, cb) => { if (evt === 'close') closeCbs.push(cb); },
      kill: () => {}, pid: 1,
    };
  };
  const restoreCp = setupChildProcessMock({ spawn: spawnMock });
  const restoreElectron = setupElectronMock();
  try {
    const ADBService = loadAdbService();
    const svc = new ADBService(PROJECT_ROOT, i18nMock, { spawnFn: spawnMock });
    const promise = svc.deleteRemoteFile('/sdcard/DCIM/tmp', 'dev1', true);
    promise.then(() => {}).catch(() => {});
    assert.ok(capturedArgs.includes('rm'));
    assert.ok(capturedArgs.includes('-rf'));
  } finally {
    restoreElectron();
    restoreCp();
  }
});

test('P1-6 deleteRemoteFile 恶意路径 (shell 元字符) 拒绝且不 spawn', async () => {
  let spawnCount = 0;
  const spawnMock = function () {
    spawnCount++;
    return { stdout: { on: () => {} }, stderr: { on: () => {} }, on: () => {}, kill: () => {}, pid: 1 };
  };
  const restoreCp = setupChildProcessMock({ spawn: spawnMock });
  const restoreElectron = setupElectronMock();
  try {
    const ADBService = loadAdbService();
    const svc = new ADBService(PROJECT_ROOT, i18nMock, { spawnFn: spawnMock });
    const evilPaths = ['/sdcard/x;reboot', '/sdcard/$(reboot)', '/sdcard/a" & whoami', '/sdcard/a`reboot`', '/sdcard/a&reboot', '/sdcard/a|reboot'];
    for (const p of evilPaths) {
      const result = await svc.deleteRemoteFile(p, 'dev1', false);
      assert.strictEqual(result.success, false, `应拒绝: ${p}`);
      assert.strictEqual(result.error, 'invalid_remote_path');
    }
    assert.strictEqual(spawnCount, 0, '恶意路径不得 spawn');
  } finally {
    restoreElectron();
    restoreCp();
  }
});

test('P1-6 renameRemoteFile 同目录改名: mv + 新路径拼接', async () => {
  let capturedArgs = null;
  const spawnMock = function (cmd, args) {
    capturedArgs = args;
    const closeCbs = [];
    return {
      stdout: { on: () => {} }, stderr: { on: () => {} },
      on: (evt, cb) => { if (evt === 'close') closeCbs.push(cb); },
      kill: () => {}, pid: 1,
    };
  };
  const restoreCp = setupChildProcessMock({ spawn: spawnMock });
  const restoreElectron = setupElectronMock();
  try {
    const ADBService = loadAdbService();
    const svc = new ADBService(PROJECT_ROOT, i18nMock, { spawnFn: spawnMock });
    const promise = svc.renameRemoteFile('/sdcard/DCIM/a.jpg', 'b.jpg', 'dev1');
    promise.catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.ok(capturedArgs && capturedArgs.includes('mv'), `capturedArgs 应为 mv args, 实际: ${JSON.stringify(capturedArgs)}`);
    assert.strictEqual(capturedArgs[capturedArgs.length - 1], '/sdcard/DCIM/b.jpg');
  } finally {
    restoreElectron();
    restoreCp();
  }
});

test('P1-6 renameRemoteFile 新名含路径/元字符拒绝', async () => {
  let spawnCount = 0;
  const spawnMock = function () {
    spawnCount++;
    return { stdout: { on: () => {} }, stderr: { on: () => {} }, on: () => {}, kill: () => {}, pid: 1 };
  };
  const restoreCp = setupChildProcessMock({ spawn: spawnMock });
  const restoreElectron = setupElectronMock();
  try {
    const ADBService = loadAdbService();
    const svc = new ADBService(PROJECT_ROOT, i18nMock, { spawnFn: spawnMock });
    const result = await svc.renameRemoteFile('/sdcard/DCIM/a.jpg', '../evil.jpg', 'dev1');
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error, 'invalid_remote_path');
    const result2 = await svc.renameRemoteFile('/sdcard/DCIM/a.jpg', 'x;reboot', 'dev1');
    assert.strictEqual(result2.success, false);
    assert.strictEqual(spawnCount, 0);
  } finally {
    restoreElectron();
    restoreCp();
  }
});

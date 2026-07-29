// EnvironmentService 单测 — 6 factory 注入 + 懒初始化 + 4 module-level 纯函数 + 5 公共 API + 5 委托。
// 验证:
//   - constructor 收 6 factory + _initialized=false
//   - 懒初始化 (constructor 不触发 fs/cmd/new)
//   - 懒初始化幂等
//   - 4 module-level 纯函数独立可测 (parsePyprojectDependencies / extractPackageName /
//     checkMissingPackages / buildPythonConfig)
//   - configurePythonEnvironment (embedded/venv/system 三级回退)
//   - configureEmbeddedPythonPth (fileSystem port)
//   - findSystemPython (跳过 windowsapps)
//   - 5 委托方法 (checkCP210xDriver / isInstallerRunning / getDriverInstallerPath /
//     getSerialPorts / getAapt2Path)
//   - checkCommandExists (where 0/非0/异常)
//   - checkPythonEnvironment (用纯函数)
//   - checkNodeModules (用 isPackagedGetter + fileSystem port)
//   - runEnvironmentChecks (编排 + IPC 进度推送)
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const ENV_SERVICE_PATH = path.join(
  __dirname, '..', '..', 'electron', 'src', 'main', 'services', 'EnvironmentService.js'
);
const {
  EnvironmentService,
  parsePyprojectDependencies,
  extractPackageName,
  checkMissingPackages,
  buildPythonConfig,
} = require(ENV_SERVICE_PATH);

const i18nMock = {
  t: (key, params) => key + (params ? ` ${JSON.stringify(params)}` : ''),
};

// ── Fakes ──────────────────────────────────────────────

function makeFakeFileSystem(opts = {}) {
  const calls = {
    existsSync: [],
    readFileSync: [],
    readdirSync: [],
    writeFileSync: [],
  };
  const normalizePath = (p) => path.normalize(p);
  const files = {};
  for (const k in (opts.files || {})) files[normalizePath(k)] = opts.files[k];
  const dirs = {};
  for (const k in (opts.dirs || {})) dirs[normalizePath(k)] = opts.dirs[k];
  return {
    calls,
    existsSync: (p) => {
      calls.existsSync.push(p);
      const np = normalizePath(p);
      return files[np] !== undefined || dirs[np] !== undefined;
    },
    readFileSync: (p, enc) => {
      calls.readFileSync.push(p);
      const np = normalizePath(p);
      if (files[np] === undefined) throw new Error('ENOENT');
      return files[np];
    },
    readdirSync: (d) => {
      calls.readdirSync.push(d);
      const nd = normalizePath(d);
      return dirs[nd] || [];
    },
    writeFileSync: (p, content, enc) => {
      calls.writeFileSync.push({ path: p, content });
      const np = normalizePath(p);
      files[np] = content;
    },
  };
}

function makeFakeCommandRunner(responses = []) {
  const calls = [];
  let idx = 0;
  const fn = async (cmd, args, opts) => {
    calls.push({ cmd, args, opts });
    const resp = responses[idx++] || { code: 0, stdout: '', stderr: '' };
    if (resp instanceof Error) throw resp;
    return resp;
  };
  fn.calls = calls;
  return fn;
}

function makeFakeDriverChecker(overrides = {}) {
  const calls = {};
  const stub = {
    checkCP210xDriver: async (...a) => { calls.checkCP210xDriver = a; return overrides.checkCP210xDriver || { status: 'success', message: 'stub-driver' }; },
    isInstallerRunning: async (...a) => { calls.isInstallerRunning = a; return overrides.isInstallerRunning !== undefined ? overrides.isInstallerRunning : false; },
    getDriverInstallerPath: (...a) => { calls.getDriverInstallerPath = a; return overrides.getDriverInstallerPath !== undefined ? overrides.getDriverInstallerPath : null; },
  };
  stub.__calls = calls;
  return stub;
}

function makeFakeSerialPortEnumerator(overrides = {}) {
  const calls = {};
  const stub = {
    getSerialPorts: async (...a) => { calls.getSerialPorts = a; return overrides.getSerialPorts || { success: true, data: [] }; },
  };
  stub.__calls = calls;
  return stub;
}

function makeFakePathHelper(overrides = {}) {
  // 兼容 value 或 () => value 两种写法
  const pick = (key, dflt) => {
    const v = overrides[key];
    if (v === undefined) return dflt;
    return typeof v === 'function' ? v() : v;
  };
  return {
    getEmbeddedPythonPath: () => pick('getEmbeddedPythonPath', null),
    getVenvPythonPath: () => pick('getVenvPythonPath', null),
    getVenvSitePackagesPath: () => pick('getVenvSitePackagesPath', '/fake/venv/site-packages'),
    getPythonConfig: () => pick('getPythonConfig', null),
    setPythonConfig: overrides.setPythonConfig || (() => {}),
    fixPyvenvCfg: () => {},
    getAdbPath: () => pick('getAdbPath', 'adb'),
    getAapt2Path: () => pick('getAapt2Path', 'aapt2'),
  };
}

function makeFakeApp(opts = {}) {
  const fileSystem = makeFakeFileSystem(opts.fileSystem || {});
  const commandRunner = makeFakeCommandRunner(opts.commandResponses || []);
  const driverChecker = makeFakeDriverChecker(opts.driverChecker || {});
  const serialPortEnumerator = makeFakeSerialPortEnumerator(opts.serialPortEnumerator || {});
  const pathHelper = makeFakePathHelper(opts.pathHelper || {});
  const isPackagedGetter = opts.isPackagedGetter || (() => false);

  const svc = new EnvironmentService(i18nMock, '/fake/root', {
    fileSystemFactory: () => fileSystem,
    commandRunnerFactory: () => commandRunner,
    driverCheckerFactory: () => driverChecker,
    serialPortEnumeratorFactory: () => serialPortEnumerator,
    pathHelperFactory: () => pathHelper,
    isPackagedGetterFactory: () => isPackagedGetter,
  });

  return { svc, fileSystem, commandRunner, driverChecker, serialPortEnumerator, pathHelper, isPackagedGetter };
}


// ─── module-level 纯函数 ─────────────────────────────────────

test('parsePyprojectDependencies 解析 dependencies 数组', () => {
  const content = `
[project]
name = "xkautotester"
dependencies = [
    "pytest>=8.0",
    "allure-pytest",
    # 注释行
    "",
    "requests",
]
`;
  const deps = parsePyprojectDependencies(content);
  assert.deepStrictEqual(deps, ['pytest>=8.0', 'allure-pytest', 'requests']);
});

test('parsePyprojectDependencies 无 dependencies 时返回空数组', () => {
  assert.deepStrictEqual(parsePyprojectDependencies('no deps here'), []);
});

test('extractPackageName 处理各类操作符 + 小写化', () => {
  assert.strictEqual(extractPackageName('pytest>=8.0'), 'pytest');
  assert.strictEqual(extractPackageName('Allure-Pytest==2.15.0'), 'allure-pytest');
  assert.strictEqual(extractPackageName('requests<=2.32'), 'requests');
  assert.strictEqual(extractPackageName('Faker~=37.0'), 'faker');
  assert.strictEqual(extractPackageName('pyserial!=3.0'), 'pyserial');
  assert.strictEqual(extractPackageName('plain'), 'plain');
});

test('checkMissingPackages 返缺失列表 + 已装包不返', () => {
  const installed = new Set(['pytest==8.4.2', 'allure-pytest==2.15.0', 'requests==2.32.5']);
  const requirements = ['pytest>=8.0', 'allure-pytest', 'missing-pkg>=1.0', 'requests'];
  const missing = checkMissingPackages(installed, requirements);
  assert.deepStrictEqual(missing, ['missing-pkg>=1.0']);
});

test('checkMissingPackages 全已装时返空数组', () => {
  const installed = new Set(['pytest==8.4.2']);
  const missing = checkMissingPackages(installed, ['pytest>=8.0']);
  assert.deepStrictEqual(missing, []);
});

test('buildPythonConfig 构建 setPythonConfig 参数对象', () => {
  const cfg = buildPythonConfig('/path/python.exe', { isEmbedded: true, isSystem: false }, '/site', '(内置)');
  assert.deepStrictEqual(cfg, {
    pythonPath: '/path/python.exe',
    isEmbedded: true,
    isSystem: false,
    sitePackagesPath: '/site',
    sourceLabel: '(内置)',
  });
});

test('buildPythonConfig sitePackagesPath=null 允许', () => {
  const cfg = buildPythonConfig('/p', { isEmbedded: false, isSystem: false }, null, '');
  assert.strictEqual(cfg.sitePackagesPath, null);
  assert.strictEqual(cfg.isEmbedded, false);
  assert.strictEqual(cfg.isSystem, false);
});


// ─── constructor + 懒初始化 ─────────────────────────────────

test('constructor 收 6 factory + _initialized=false + pythonConfigured=false', () => {
  const { svc } = makeFakeApp();
  assert.strictEqual(svc._initialized, false);
  assert.strictEqual(svc.pythonConfigured, false);
  assert.strictEqual(svc.projectRoot, '/fake/root');
  assert.ok(svc._fileSystemFactory);
  assert.ok(svc._commandRunnerFactory);
  assert.ok(svc._driverCheckerFactory);
  assert.ok(svc._serialPortEnumeratorFactory);
  assert.ok(svc._pathHelperFactory);
  assert.ok(svc._isPackagedGetterFactory);
});

test('懒初始化: constructor 不触发 factory 调用, 首次 configurePythonEnvironment 触发 _ensureInitialized', async () => {
  let fsFactoryCalled = 0, cmdFactoryCalled = 0, dcFactoryCalled = 0, spFactoryCalled = 0, phFactoryCalled = 0, ipFactoryCalled = 0;
  const svc = new EnvironmentService(i18nMock, '/fake/root', {
    fileSystemFactory: () => { fsFactoryCalled++; return makeFakeFileSystem(); },
    commandRunnerFactory: () => { cmdFactoryCalled++; return makeFakeCommandRunner(); },
    driverCheckerFactory: () => { dcFactoryCalled++; return makeFakeDriverChecker(); },
    serialPortEnumeratorFactory: () => { spFactoryCalled++; return makeFakeSerialPortEnumerator(); },
    pathHelperFactory: () => { phFactoryCalled++; return makeFakePathHelper(); },
    isPackagedGetterFactory: () => { ipFactoryCalled++; return () => false; },
  });

  assert.strictEqual(fsFactoryCalled, 0, 'constructor 不触发 fileSystemFactory');
  assert.strictEqual(dcFactoryCalled, 0, 'constructor 不触发 driverCheckerFactory');

  await svc.configurePythonEnvironment();

  assert.strictEqual(fsFactoryCalled, 1, '首次调用触发 fileSystemFactory');
  assert.strictEqual(cmdFactoryCalled, 2, '首次调用触发 commandRunnerFactory (spawnHelper + cmd)');
  assert.strictEqual(dcFactoryCalled, 1, '首次调用触发 driverCheckerFactory');
  assert.strictEqual(phFactoryCalled, 1, '首次调用触发 pathHelperFactory');
  assert.strictEqual(ipFactoryCalled, 1, '首次调用触发 isPackagedGetterFactory');
  assert.strictEqual(svc._initialized, true);
});

test('懒初始化幂等: 重复 configurePythonEnvironment 仅初始化一次', async () => {
  let dcCount = 0;
  const svc = new EnvironmentService(i18nMock, '/fake/root', {
    driverCheckerFactory: () => { dcCount++; return makeFakeDriverChecker(); },
  });
  await svc.configurePythonEnvironment();
  const initCount = dcCount;
  await svc.configurePythonEnvironment();
  assert.strictEqual(dcCount, initCount, '二次调用不重新初始化');
});


// ─── configurePythonEnvironment (三级回退) ───────────────────

test('configurePythonEnvironment embedded 路径调 buildPythonConfig + setPythonConfig', async () => {
  const setCalls = [];
  const { svc, pathHelper } = makeFakeApp({
    pathHelper: {
      getEmbeddedPythonPath: () => '/fake/python.exe',
      getVenvSitePackagesPath: () => '/fake/venv/site',
      setPythonConfig: (cfg) => setCalls.push(cfg),
    },
  });

  await svc.configurePythonEnvironment();

  assert.strictEqual(svc.pythonConfigured, true);
  assert.strictEqual(setCalls.length, 1);
  assert.strictEqual(setCalls[0].pythonPath, '/fake/python.exe');
  assert.strictEqual(setCalls[0].isEmbedded, true);
  assert.strictEqual(setCalls[0].isSystem, false);
  assert.strictEqual(setCalls[0].sitePackagesPath, '/fake/venv/site');
});

test('configurePythonEnvironment venv 路径调 commandRunner --version + buildPythonConfig', async () => {
  const setCalls = [];
  const { svc, commandRunner } = makeFakeApp({
    pathHelper: {
      getVenvPythonPath: () => '/fake/venv/python.exe',
      setPythonConfig: (cfg) => setCalls.push(cfg),
    },
    commandResponses: [{ code: 0, stdout: 'Python 3.12.4', stderr: '' }],
  });

  await svc.configurePythonEnvironment();

  assert.strictEqual(svc.pythonConfigured, true);
  assert.strictEqual(commandRunner.calls.length, 1);
  assert.deepStrictEqual(commandRunner.calls[0].args, ['--version']);
  assert.strictEqual(setCalls.length, 1);
  assert.strictEqual(setCalls[0].pythonPath, '/fake/venv/python.exe');
  assert.strictEqual(setCalls[0].isEmbedded, false);
  assert.strictEqual(setCalls[0].sitePackagesPath, null);
});

test('configurePythonEnvironment 无任何 Python 时 setPythonConfig(null)', async () => {
  const setCalls = [];
  const { svc, commandRunner } = makeFakeApp({
    pathHelper: {
      setPythonConfig: (cfg) => setCalls.push(cfg),
    },
    commandResponses: [{ code: 1, stdout: '', stderr: 'not found' }],
  });

  await svc.configurePythonEnvironment();

  assert.strictEqual(svc.pythonConfigured, true);
  assert.deepStrictEqual(setCalls, [null]);
});


// ─── configureEmbeddedPythonPth (fileSystem port) ────────────

test('configureEmbeddedPythonPth 用 fileSystem port 写 ._pth 文件', () => {
  const pthPath = path.join('/fake/python', 'python312._pth');
  const { svc, fileSystem } = makeFakeApp({
    fileSystem: {
      files: { [pthPath]: 'old content' },
      dirs: { [path.normalize('/fake/python')]: ['python312._pth'] },
    },
    pathHelper: {
      getVenvSitePackagesPath: () => '/fake/venv/site',
    },
  });

  svc.configureEmbeddedPythonPth('/fake/python/python.exe');

  assert.strictEqual(fileSystem.calls.readdirSync.length, 1);
  assert.strictEqual(fileSystem.calls.readFileSync.length, 1);
  assert.strictEqual(fileSystem.calls.writeFileSync.length, 1);
  assert.ok(fileSystem.calls.writeFileSync[0].content.includes('# XKAutoTester configured'));
});

test('configureEmbeddedPythonPth 已含 marker 时不重写', () => {
  const pthPath = path.join('/fake/python', 'python312._pth');
  const { svc, fileSystem } = makeFakeApp({
    fileSystem: {
      files: { [pthPath]: '# XKAutoTester configured\nold' },
      dirs: { [path.normalize('/fake/python')]: ['python312._pth'] },
    },
  });

  svc.configureEmbeddedPythonPth('/fake/python/python.exe');

  assert.strictEqual(fileSystem.calls.writeFileSync.length, 0, '已含 marker 不应重写');
});

test('configureEmbeddedPythonPth 无 ._pth 文件时不报错', () => {
  const { svc, fileSystem } = makeFakeApp({
    fileSystem: {
      dirs: { [path.normalize('/fake/python')]: ['other.txt'] },
    },
  });

  assert.doesNotThrow(() => svc.configureEmbeddedPythonPth('/fake/python/python.exe'));
  assert.strictEqual(fileSystem.calls.writeFileSync.length, 0);
});


// ─── findSystemPython (跳过 windowsapps) ─────────────────────

test('findSystemPython 跳过 windowsapps 路径', async () => {
  const { svc, commandRunner } = makeFakeApp({
    commandResponses: [
      // where python 输出
      { code: 0, stdout: 'C:\\Users\\test\\AppData\\Local\\Microsoft\\WindowsApps\\python.exe\nC:\\Python\\python.exe', stderr: '' },
      // python --version 验证非 windowsapps 路径
      { code: 0, stdout: 'Python 3.12.4', stderr: '' },
    ],
  });

  const result = await svc.findSystemPython();
  assert.ok(result !== null);
  assert.ok(!result.toLowerCase().includes('windowsapps'));
  assert.strictEqual(commandRunner.calls.length, 2);
  assert.deepStrictEqual(commandRunner.calls[0].args, ['python']);
  assert.deepStrictEqual(commandRunner.calls[1].args, ['--version']);
});

test('findSystemPython where 无结果时返回 null', async () => {
  const { svc } = makeFakeApp({
    commandResponses: [{ code: 1, stdout: '', stderr: 'not found' }],
  });

  const result = await svc.findSystemPython();
  assert.strictEqual(result, null);
});


// ─── 委托: DriverChecker / SerialPortEnumerator / pathHelper ─

test('checkCP210xDriver 委托 driverChecker', async () => {
  const { svc, driverChecker } = makeFakeApp({
    driverChecker: { checkCP210xDriver: { status: 'success', message: 'stub-cp210' } },
  });

  const result = await svc.checkCP210xDriver();
  assert.strictEqual(result.status, 'success');
  assert.strictEqual(result.message, 'stub-cp210');
  assert.ok(driverChecker.__calls.checkCP210xDriver);
});

test('isInstallerRunning 委托 driverChecker', async () => {
  const { svc, driverChecker } = makeFakeApp({
    driverChecker: { isInstallerRunning: true },
  });

  const result = await svc.isInstallerRunning();
  assert.strictEqual(result, true);
  assert.ok(driverChecker.__calls.isInstallerRunning);
});

test('getDriverInstallerPath 委托 driverChecker', () => {
  const { svc, driverChecker } = makeFakeApp({
    driverChecker: { getDriverInstallerPath: '/stub/installer.exe' },
  });

  const result = svc.getDriverInstallerPath();
  assert.strictEqual(result, '/stub/installer.exe');
  assert.ok(driverChecker.__calls.getDriverInstallerPath);
});

test('getSerialPorts 委托 serialPortEnumerator', async () => {
  const { svc, serialPortEnumerator } = makeFakeApp({
    serialPortEnumerator: { getSerialPorts: { success: true, data: [{ deviceId: 'COM3' }] } },
  });

  const result = await svc.getSerialPorts();
  assert.deepStrictEqual(result.data, [{ deviceId: 'COM3' }]);
  assert.ok(serialPortEnumerator.__calls.getSerialPorts);
});

test('getAapt2Path 委托 pathHelper', () => {
  const { svc, pathHelper } = makeFakeApp({
    pathHelper: { getAapt2Path: '/fake/aapt2.exe' },
  });

  const result = svc.getAapt2Path();
  assert.strictEqual(result, '/fake/aapt2.exe');
});


// ─── checkCommandExists ──────────────────────────────────────

test('checkCommandExists where 返回 0 + 非空 stdout 时返回 true', async () => {
  const { svc, commandRunner } = makeFakeApp({
    commandResponses: [{ code: 0, stdout: 'C:\\Python\\python.exe', stderr: '' }],
  });

  const exists = await svc.checkCommandExists('python');
  assert.strictEqual(exists, true);
  assert.deepStrictEqual(commandRunner.calls[0].args, ['python']);
});

test('checkCommandExists where 返回非 0 时返回 false', async () => {
  const { svc } = makeFakeApp({
    commandResponses: [{ code: 1, stdout: '', stderr: 'not found' }],
  });

  const exists = await svc.checkCommandExists('nonexistent');
  assert.strictEqual(exists, false);
});

test('checkCommandExists commandRunner 抛异常时返回 false', async () => {
  const { svc } = makeFakeApp({
    commandResponses: [new Error('spawn fail')],
  });

  const exists = await svc.checkCommandExists('python');
  assert.strictEqual(exists, false);
});


// ─── checkPythonEnvironment (用纯函数) ───────────────────────

test('checkPythonEnvironment 用 parsePyprojectDependencies + checkMissingPackages', async () => {
  const pyprojectPath = path.join('/fake/root', 'pyproject.toml');
  const { svc } = makeFakeApp({
    pathHelper: {
      getPythonConfig: () => ({
        pythonPath: '/fake/python.exe',
        sourceLabel: '(内置)',
        isSystem: false,
      }),
    },
    fileSystem: {
      files: {
        [pyprojectPath]: `dependencies = [\n  "pytest>=8.0",\n  "missing-pkg>=1.0",\n]`,
      },
    },
    commandResponses: [
      // python --version
      { code: 0, stdout: 'Python 3.12.4', stderr: '' },
      // pip list (只装了 pytest)
      { code: 0, stdout: 'pytest==8.4.2', stderr: '' },
    ],
  });

  const result = await svc.checkPythonEnvironment('/fake/root');
  assert.strictEqual(result.status, 'warning');
  assert.ok(result.message.includes('missingPackages'));
});

test('checkPythonEnvironment 无 pythonConfig 时返回 error', async () => {
  const { svc } = makeFakeApp({
    pathHelper: { getPythonConfig: () => null },
  });

  const result = await svc.checkPythonEnvironment('/fake/root');
  assert.strictEqual(result.status, 'error');
  assert.ok(result.message.includes('venvNotFound'));
});

test('checkPythonEnvironment 全装齐时返回 success', async () => {
  const pyprojectPath = path.join('/fake/root', 'pyproject.toml');
  const { svc } = makeFakeApp({
    pathHelper: {
      getPythonConfig: () => ({
        pythonPath: '/fake/python.exe',
        sourceLabel: '(内置)',
        isSystem: false,
      }),
    },
    fileSystem: {
      files: {
        [pyprojectPath]: `dependencies = [\n  "pytest>=8.0",\n]`,
      },
    },
    commandResponses: [
      { code: 0, stdout: 'Python 3.12.4', stderr: '' },
      { code: 0, stdout: 'pytest==8.4.2', stderr: '' },
    ],
  });

  const result = await svc.checkPythonEnvironment('/fake/root');
  assert.strictEqual(result.status, 'success');
});

test('checkPythonEnvironment system Python 版本不匹配时返回 error', async () => {
  const { svc } = makeFakeApp({
    pathHelper: {
      getPythonConfig: () => ({
        pythonPath: '/fake/python.exe',
        sourceLabel: '(系统)',
        isSystem: true,
      }),
    },
    commandResponses: [
      { code: 0, stdout: 'Python 3.10.0', stderr: '' },
    ],
  });

  const result = await svc.checkPythonEnvironment('/fake/root');
  assert.strictEqual(result.status, 'error');
  assert.ok(result.message.includes('pythonVersionMismatch'));
});


// ─── checkNodeModules (用 isPackagedGetter + fileSystem) ─────

test('checkNodeModules isPackaged=true 时返回 success', () => {
  const { svc, fileSystem } = makeFakeApp({
    isPackagedGetter: () => true,
  });

  const result = svc.checkNodeModules();
  assert.strictEqual(result.status, 'success');
  assert.strictEqual(fileSystem.calls.existsSync.length, 0, 'isPackaged 时不应检查 fs');
});

test('checkNodeModules 无 node_modules 时返回 error', () => {
  const { svc } = makeFakeApp({
    isPackagedGetter: () => false,
    fileSystem: { files: {}, dirs: {} },
  });

  const result = svc.checkNodeModules();
  assert.strictEqual(result.status, 'error');
  assert.ok(result.message.includes('nodeModulesNotFound'));
});

test('checkNodeModules 无 package.json 时返回 warning', () => {
  // node_modules 是目录, package.json 不存在
  // 源码: __dirname (services/) + ../../.. = electron/, + node_modules = electron/node_modules
  const envServiceDir = path.dirname(ENV_SERVICE_PATH);
  const nodeModulesPath = path.join(envServiceDir, '..', '..', '..', 'node_modules');
  const { svc } = makeFakeApp({
    isPackagedGetter: () => false,
    fileSystem: { files: {}, dirs: { [path.normalize(nodeModulesPath)]: [] } },
  });

  const result = svc.checkNodeModules();
  assert.strictEqual(result.status, 'warning');
  assert.ok(result.message.includes('packageJsonNotFound'));
});


// ─── runEnvironmentChecks (编排) ─────────────────────────────

test('runEnvironmentChecks 编排 4 checks + 返 {required, warnings}', async () => {
  const { svc } = makeFakeApp({
    driverChecker: { checkCP210xDriver: { status: 'success', message: 'cp210 ok' } },
  });

  const splashWindow = { webContents: { send: () => {} } };
  const results = await svc.runEnvironmentChecks('/fake/root', splashWindow);

  assert.ok(Array.isArray(results.required));
  assert.ok(Array.isArray(results.warnings));
});

test('runEnvironmentChecks splashWindow=null 时不报错', async () => {
  const { svc } = makeFakeApp({
    driverChecker: { checkCP210xDriver: { status: 'success', message: 'cp210 ok' } },
  });

  const results = await svc.runEnvironmentChecks('/fake/root', null);
  assert.ok(results);
  assert.ok(Array.isArray(results.required));
});

test('runEnvironmentChecks 必需检查失败时填 required 数组', async () => {
  const { svc } = makeFakeApp({
    driverChecker: { checkCP210xDriver: { status: 'warning', message: 'cp210 missing' } },
    pathHelper: {
      getAdbPath: () => 'adb',  // 本地不存在
      getAapt2Path: () => 'aapt2',
      getPythonConfig: () => null,  // python 检查失败
    },
    commandResponses: [
      { code: 1, stdout: '', stderr: 'not found' },  // where adb
      { code: 1, stdout: '', stderr: 'not found' },  // where aapt2
    ],
  });

  const results = await svc.runEnvironmentChecks('/fake/root', null);
  // Android SDK 必需检查失败 + Python 环境必需检查失败
  assert.ok(results.required.length >= 1, '必需检查失败应填 required');
});

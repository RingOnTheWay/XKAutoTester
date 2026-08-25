// ApplicationService 单测 — 26 factory 注入 + 20 服务依赖图 + 3 await 顺序 + run + catch + shape + mutation。
// 验证: factory 收到正确 deps + 3 await 顺序固定 + run 调 setServices+initialize + catch 调 errorHandler +
//      initializeServices 返 20 字段 shape + electronApp.userConfigPath/userDataPath mutation。
// M1: 删 schedulerInitializer (factory 直接 2 参构造 SmartScheduler)。
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const APPLICATION_SERVICE_PATH = path.join(
  __dirname, '..', '..', 'electron', 'src', 'main', 'services', 'application', 'applicationService.js'
);
const { ApplicationService } = require(APPLICATION_SERVICE_PATH);

// ── Fakes ──────────────────────────────────────────────

function makeFakeElectronApp() {
  return {
    isPackaged: false,
    projectRoot: '/fake/root',
    userConfigPath: null,
    userDataPath: null,
    setServicesCalled: false,
    setServicesArgs: null,
    initializeCalled: false,
    setServices(services) {
      this.setServicesCalled = true;
      this.setServicesArgs = services;
    },
    async initialize() {
      this.initializeCalled = true;
    },
  };
}

function makeFakeApp(opts = {}) {
  const electronApp = makeFakeElectronApp();
  const calls = {
    factories: {},
    awaitOrder: [],
    errorHandler: null,
  };

  const app = new ApplicationService({
    electronApp,
    i18nInitializer: async () => {
      calls.awaitOrder.push('i18n');
    },
    pythonEnvConfigurer: async () => {
      calls.awaitOrder.push('pythonEnv');
    },
    apkParserInitializer: async () => {
      calls.awaitOrder.push('apkInit');
    },
    updateServiceInitializer: async () => {
      calls.awaitOrder.push('updateInit');
    },
    registerHandlers: () => {},
    errorHandler: {
      onInitFail: (e) => {
        calls.errorHandler = e.message;
      },
    },

    versionServiceFactory: (pr) => {
      calls.factories.version = { pr };
      return { __tag: 'version' };
    },
    userDataServiceFactory: (pr, v) => {
      calls.factories.userData = { pr, version: v.__tag };
      return {
        __tag: 'userData',
        getUserConfigPath: () => '/fake/cfg',
        getUserDataPath: () => '/fake/data',
      };
    },
    scheduledPlanServiceFactory: (ucp) => {
      calls.factories.scheduledPlan = { ucp };
      return { __tag: 'scheduledPlan' };
    },
    testPlanServiceFactory: (ucp, pr) => {
      calls.factories.testPlan = { ucp, pr };
      return { __tag: 'testPlan' };
    },
    allureServiceFactory: (pr, i18n, udp) => {
      calls.factories.allure = { pr, i18n: typeof i18n, udp };
      return { __tag: 'allure' };
    },
    pythonTestServiceFactory: (opts) => {
      calls.factories.pythonTest = opts;
      return { __tag: 'pythonTest' };
    },
    environmentServiceFactory: (pr, i18n) => {
      calls.factories.environment = { pr, i18n: typeof i18n };
      return { __tag: 'environment' };
    },
    adbServiceFactory: (pr, i18n) => {
      calls.factories.adb = { pr, i18n: typeof i18n };
      return { __tag: 'adb' };
    },
    notificationServiceFactory: (i18n) => {
      calls.factories.notification = { i18n: typeof i18n };
      return { __tag: 'notification' };
    },
    scrcpyServiceFactory: (pr, i18n) => {
      calls.factories.scrcpy = { pr, i18n: typeof i18n };
      return { __tag: 'scrcpy' };
    },
    pagePackageServiceFactory: (ucp) => {
      calls.factories.pagePackage = { ucp };
      return { __tag: 'pagePackage' };
    },
    bleDeviceDiscoveryServiceFactory: (pr) => {
      calls.factories.ble = { pr };
      return { __tag: 'ble' };
    },
    testCaseServiceFactory: (ucp, pr) => {
      calls.factories.testCase = { ucp, pr };
      return { __tag: 'testCase' };
    },
    apkParserServiceFactory: (pr, i18n) => {
      calls.factories.apkParser = { pr, i18n: typeof i18n };
      return { __tag: 'apkParser' };
    },
    updateServiceFactory: (v, u) => {
      calls.factories.update = { version: v.__tag, userData: u.__tag };
      return { __tag: 'update' };
    },
    inspectorServiceFactory: (pr, i18n, udp) => {
      calls.factories.inspector = { pr, i18n: typeof i18n, udp };
      return { __tag: 'inspector' };
    },
    dataTransferServiceFactory: (u, i18n, v) => {
      calls.factories.dataTransfer = { userData: u.__tag, i18n: typeof i18n, version: v.__tag };
      return { __tag: 'dataTransfer' };
    },
    schedulerServiceFactory: (plan, i18n) => {
      // M4: factory 收 (scheduledPlanService, i18nService) 2 参, 对齐 SmartScheduler 构造器
      calls.factories.scheduler = { i18n: typeof i18n, plan: plan.__tag };
      return { __tag: 'scheduler' };
    },
    environmentStartupServiceFactory: (opts) => {
      calls.factories.environmentStartup = opts;
      return { __tag: 'environmentStartup' };
    },
  });

  return { app, electronApp, calls };
}

// ── 测试 ────────────────────────────────────────────────

test('_buildServices 20 服务构造 + factory 收到正确 deps', async () => {
  const { app, calls } = makeFakeApp();

  await app.initializeServices();

  // version + userData 依赖链
  assert.strictEqual(calls.factories.version.pr, '/fake/root');
  assert.strictEqual(calls.factories.userData.pr, '/fake/root');
  assert.strictEqual(calls.factories.userData.version, 'version');

  // scheduledPlan + testPlan 收 userConfigPath
  assert.strictEqual(calls.factories.scheduledPlan.ucp, '/fake/cfg');
  assert.strictEqual(calls.factories.testPlan.ucp, '/fake/cfg');
  assert.strictEqual(calls.factories.testPlan.pr, '/fake/root');

  // allure 收 projectRoot + userDataPath
  assert.strictEqual(calls.factories.allure.pr, '/fake/root');
  assert.strictEqual(calls.factories.allure.udp, '/fake/data');

  // pythonTest 收 6 字段 bag
  assert.strictEqual(calls.factories.pythonTest.projectRoot, '/fake/root');
  assert.strictEqual(calls.factories.pythonTest.userDataPath, '/fake/data');
  assert.strictEqual(calls.factories.pythonTest.allureService.__tag, 'allure');
  assert.strictEqual(calls.factories.pythonTest.testPlanService.__tag, 'testPlan');
  assert.strictEqual(calls.factories.pythonTest.mainWindow, null);

  // update 收 version + userData
  assert.strictEqual(calls.factories.update.version, 'version');
  assert.strictEqual(calls.factories.update.userData, 'userData');

  // dataTransfer 收 userData + version
  assert.strictEqual(calls.factories.dataTransfer.userData, 'userData');
  assert.strictEqual(calls.factories.dataTransfer.version, 'version');
});

test('4 await 顺序: i18n → pythonEnv → apkInit → updateInit', async () => {
  const { app, calls } = makeFakeApp();

  await app.initializeServices();

  assert.deepStrictEqual(calls.awaitOrder, ['i18n', 'pythonEnv', 'apkInit', 'updateInit']);
});

test('run() 调 setServices + initialize', async () => {
  const { app, electronApp } = makeFakeApp();

  await app.run();

  assert.strictEqual(electronApp.setServicesCalled, true);
  assert.strictEqual(electronApp.initializeCalled, true);
});

test('run() catch 调 errorHandler.onInitFail', async () => {
  const { app, calls } = makeFakeApp({ failAt: 'i18n' });
  // 替换 i18nInitializer 抛错
  app._i18nInitializer = async () => {
    throw new Error('i18n init failed');
  };

  await app.run();

  assert.strictEqual(calls.errorHandler, 'i18n init failed');
});

test('initializeServices 返 21 字段 shape (20 服务 + registerHandlers)', async () => {
  const { app } = makeFakeApp();

  const services = await app.initializeServices();

  const expectedKeys = [
    'i18nService', 'schedulerService', 'scheduledPlanService', 'testPlanService',
    'pythonTestService', 'environmentService', 'allureService', 'adbService',
    'notificationService', 'scrcpyService', 'pagePackageService', 'bleDeviceDiscoveryService',
    'testCaseService', 'apkParserService', 'versionService', 'userDataService',
    'updateService', 'inspectorService', 'dataTransferService', 'environmentStartupService',
    'registerHandlers',
  ];
  assert.deepStrictEqual(Object.keys(services).sort(), expectedKeys.sort());
  assert.strictEqual(typeof services.registerHandlers, 'function');
});

test('electronApp.userConfigPath/userDataPath 被 mutation', async () => {
  const { app, electronApp } = makeFakeApp();

  await app.initializeServices();

  assert.strictEqual(electronApp.userConfigPath, '/fake/cfg');
  assert.strictEqual(electronApp.userDataPath, '/fake/data');
});

test('schedulerServiceFactory 收 scheduledPlan + i18n (M4: 参数顺序对齐 SmartScheduler 构造器)', async () => {
  const { app, calls } = makeFakeApp();

  await app.initializeServices();

  // M4: factory 收 (scheduledPlanService, i18nService), 对齐 SmartScheduler 构造器
  assert.deepStrictEqual(calls.factories.scheduler, {
    i18n: 'object',
    plan: 'scheduledPlan',
  });
});

test('pythonEnvConfigurer 在 environmentService 构造后调用', async () => {
  const { app, calls } = makeFakeApp();
  let envFactoryCalled = false;
  let envConfigurerCalled = false;
  app._environmentServiceFactory = (i18n, pr) => {
    envFactoryCalled = true;
    return { __tag: 'environment' };
  };
  app._pythonEnvConfigurer = async (envSvc) => {
    assert.strictEqual(envFactoryCalled, true);
    assert.strictEqual(envSvc.__tag, 'environment');
    envConfigurerCalled = true;
  };

  await app.initializeServices();

  assert.strictEqual(envConfigurerCalled, true);
});

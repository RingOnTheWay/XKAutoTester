// ApplicationService — 应用入口深模块。
//
// 藏 20 服务依赖图编排 + 3 await 顺序 + electronApp 副作用 + 错误兜底。
// 26 factory-or-default (20 服务 factory + 3 await injector + registerHandlers + errorHandler)。
//
// 生产: new ApplicationService().run()  # 一行
// 测试: new ApplicationService({ electronApp: mock, versionServiceFactory: fake, ... }).run()

const ElectronApp = require('../../ElectronApp');
const {
  defaultVersionServiceFactory,
  defaultI18nServiceFactory,
  defaultUserDataServiceFactory,
  defaultScheduledPlanServiceFactory,
  defaultTestPlanServiceFactory,
  defaultAllureServiceFactory,
  defaultPythonTestServiceFactory,
  defaultEnvironmentServiceFactory,
  defaultAdbServiceFactory,
  defaultNotificationServiceFactory,
  defaultScrcpyServiceFactory,
  defaultPagePackageServiceFactory,
  defaultBleDeviceDiscoveryServiceFactory,
  defaultTestCaseServiceFactory,
  defaultApkParserServiceFactory,
  defaultUpdateServiceFactory,
  defaultInspectorServiceFactory,
  defaultDataTransferServiceFactory,
  defaultSchedulerServiceFactory,
  defaultEnvironmentStartupServiceFactory,
} = require('./factories');
const {
  defaultI18nInitializer,
  defaultPythonEnvConfigurer,
  defaultApkParserInitializer,
  defaultUpdateServiceInitializer,
  defaultRegisterHandlers,
  defaultErrorHandler,
} = require('./effects');

class ApplicationService {
  /**
   * @param {Object} [opts] - factory-or-default (全可选, 生产不传)
   */
  constructor(opts = {}) {
    this._electronApp = opts.electronApp || new ElectronApp();

    // 20 服务 factory-or-default
    this._versionServiceFactory = opts.versionServiceFactory || defaultVersionServiceFactory;
    this._i18nServiceFactory = opts.i18nServiceFactory || defaultI18nServiceFactory;
    this._userDataServiceFactory = opts.userDataServiceFactory || defaultUserDataServiceFactory;
    this._scheduledPlanServiceFactory = opts.scheduledPlanServiceFactory || defaultScheduledPlanServiceFactory;
    this._testPlanServiceFactory = opts.testPlanServiceFactory || defaultTestPlanServiceFactory;
    this._allureServiceFactory = opts.allureServiceFactory || defaultAllureServiceFactory;
    this._pythonTestServiceFactory = opts.pythonTestServiceFactory || defaultPythonTestServiceFactory;
    this._environmentServiceFactory = opts.environmentServiceFactory || defaultEnvironmentServiceFactory;
    this._adbServiceFactory = opts.adbServiceFactory || defaultAdbServiceFactory;
    this._notificationServiceFactory = opts.notificationServiceFactory || defaultNotificationServiceFactory;
    this._scrcpyServiceFactory = opts.scrcpyServiceFactory || defaultScrcpyServiceFactory;
    this._pagePackageServiceFactory = opts.pagePackageServiceFactory || defaultPagePackageServiceFactory;
    this._bleDeviceDiscoveryServiceFactory = opts.bleDeviceDiscoveryServiceFactory || defaultBleDeviceDiscoveryServiceFactory;
    this._testCaseServiceFactory = opts.testCaseServiceFactory || defaultTestCaseServiceFactory;
    this._apkParserServiceFactory = opts.apkParserServiceFactory || defaultApkParserServiceFactory;
    this._updateServiceFactory = opts.updateServiceFactory || defaultUpdateServiceFactory;
    this._inspectorServiceFactory = opts.inspectorServiceFactory || defaultInspectorServiceFactory;
    this._dataTransferServiceFactory = opts.dataTransferServiceFactory || defaultDataTransferServiceFactory;
    this._schedulerServiceFactory = opts.schedulerServiceFactory || defaultSchedulerServiceFactory;
    this._environmentStartupServiceFactory = opts.environmentStartupServiceFactory || defaultEnvironmentStartupServiceFactory;

    // 4 await injector + registerHandlers + errorHandler
    this._i18nInitializer = opts.i18nInitializer || defaultI18nInitializer;
    this._pythonEnvConfigurer = opts.pythonEnvConfigurer || defaultPythonEnvConfigurer;
    this._apkParserInitializer = opts.apkParserInitializer || defaultApkParserInitializer;
    this._updateServiceInitializer = opts.updateServiceInitializer || defaultUpdateServiceInitializer;
    this._registerHandlers = opts.registerHandlers || defaultRegisterHandlers;
    this._errorHandler = opts.errorHandler || defaultErrorHandler;
  }

  /** 生产入口. 装配 + setServices + initialize + 错误兜底. */
  async run() {
    try {
      const services = await this._buildServices();
      this._electronApp.setServices(services);
      await this._electronApp.initialize();
    } catch (error) {
      this._errorHandler.onInitFail(error);
    }
  }

  /** 仅服务装配 (兼容 index.js L94 旧契约). 返 Promise<services>. */
  async initializeServices() {
    return this._buildServices();
  }

  /** 私有: 20 服务依赖图编排 + 3 await 固定顺序. */
  async _buildServices() {
    const electronApp = this._electronApp;
    const isPackaged = electronApp.isPackaged;
    const projectRoot = electronApp.projectRoot;

    // INIT phase: version + i18n + userData (派生 userConfigPath/userDataPath)
    const versionService = this._versionServiceFactory(projectRoot);
    const i18nService = this._i18nServiceFactory();
    const userDataService = this._userDataServiceFactory(projectRoot, versionService);

    const userConfigPath = userDataService.getUserConfigPath();
    const userDataPath = userDataService.getUserDataPath();

    electronApp.userConfigPath = userConfigPath;
    electronApp.userDataPath = userDataPath;

    // ENV phase: await #1 i18n.init (i18n 必先于其他服务)
    await this._i18nInitializer(i18nService, projectRoot, isPackaged, userConfigPath);

    // 构造依赖 i18n 的服务
    const scheduledPlanService = this._scheduledPlanServiceFactory(userConfigPath);
    const testPlanService = this._testPlanServiceFactory(userConfigPath, projectRoot);
    const allureService = this._allureServiceFactory(projectRoot, i18nService, userDataPath);
    const pythonTestService = this._pythonTestServiceFactory({
      projectRoot,
      i18nService,
      userDataPath,
      mainWindow: null,
      allureService,
      testPlanService,
    });
    const environmentService = this._environmentServiceFactory(projectRoot, i18nService);

    // ENV phase: await #2 configurePythonEnvironment (Python env 必先于 ADBService 用)
    await this._pythonEnvConfigurer(environmentService);

    // READY phase: 其余服务
    const adbService = this._adbServiceFactory(projectRoot, i18nService);
    const notificationService = this._notificationServiceFactory(i18nService);
    const scrcpyService = this._scrcpyServiceFactory(projectRoot, i18nService);
    const pagePackageService = this._pagePackageServiceFactory(userConfigPath);
    const bleDeviceDiscoveryService = this._bleDeviceDiscoveryServiceFactory(projectRoot);
    const testCaseService = this._testCaseServiceFactory(userConfigPath, projectRoot);
    const apkParserService = this._apkParserServiceFactory(projectRoot, i18nService);
    const updateService = this._updateServiceFactory(versionService, userDataService);
    const inspectorService = this._inspectorServiceFactory(projectRoot, i18nService, userDataPath);
    const dataTransferService = this._dataTransferServiceFactory(userDataService, i18nService, versionService);

    // CONFIGURE phase: await #3 apkParser.initialize (二段构造)
    await this._apkParserInitializer(apkParserService);

    // CONFIGURE phase: await #4 updateService.initialize (读 config + apply allowInsecureSSL)
    await this._updateServiceInitializer(updateService, userConfigPath);

    const schedulerService = this._schedulerServiceFactory(scheduledPlanService, i18nService);

    // EnvironmentStartupService: 启动期编排 (3 服务 + driver install + app lifecycle)
    // 依赖 environmentService + testCaseService + userDataService + i18nService + electronApp
    const environmentStartupService = this._environmentStartupServiceFactory({
      environmentService,
      testCaseService,
      userDataService,
      i18nService,
      electronApp,
    });

    return {
      i18nService,
      schedulerService,
      scheduledPlanService,
      testPlanService,
      pythonTestService,
      environmentService,
      allureService,
      adbService,
      notificationService,
      scrcpyService,
      pagePackageService,
      bleDeviceDiscoveryService,
      testCaseService,
      apkParserService,
      versionService,
      userDataService,
      updateService,
      inspectorService,
      dataTransferService,
      environmentStartupService,
      registerHandlers: this._registerHandlers,
    };
  }
}

module.exports = { ApplicationService };

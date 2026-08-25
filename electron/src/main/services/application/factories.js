// factories — 20 服务默认 factory lambda。
//
// 全藏 new XxxService(...) 构造, 对称 test_initializer.py default factories (L177-198) +
// smartScheduler.js defaultQueueFactory。纯构造, 0 副作用。

const { VersionService } = require('../VersionService');
const { I18nService } = require('../I18nService');
const UserDataService = require('../UserDataService');
const { ScheduledPlanService } = require('../ScheduledPlanService');
const { TestPlanService } = require('../TestPlanService');
const PythonTestService = require('../PythonTestService');
const { EnvironmentService } = require('../EnvironmentService');
const { AllureService } = require('../AllureService');
const ADBService = require('../ADBService');
const { NotificationService } = require('../NotificationService');
const { ScrcpyService } = require('../ScrcpyService');
const { PagePackageService } = require('../PagePackageService');
const { BleDeviceDiscoveryService } = require('../BleDeviceDiscoveryService');
const { TestCaseService } = require('../TestCaseService');
const ApkParserService = require('../ApkParserService');
const { UpdateService } = require('../UpdateService');
const InspectorService = require('../InspectorService');
const { DataTransferService } = require('../DataTransferService');
const { SmartScheduler } = require('../scheduler');
const EnvironmentStartupService = require('../EnvironmentStartupService');

const defaultVersionServiceFactory = (projectRoot) => new VersionService(projectRoot);
const defaultI18nServiceFactory = () => new I18nService();
const defaultUserDataServiceFactory = (projectRoot, versionService) => new UserDataService(projectRoot, versionService);
const defaultScheduledPlanServiceFactory = (userConfigPath) => new ScheduledPlanService(userConfigPath);
const defaultTestPlanServiceFactory = (userConfigPath, projectRoot) => new TestPlanService(userConfigPath, projectRoot);
const defaultAllureServiceFactory = (projectRoot, i18nService, userDataPath) => new AllureService(projectRoot, i18nService, userDataPath);
const defaultPythonTestServiceFactory = (opts) => new PythonTestService(opts);
const defaultEnvironmentServiceFactory = (projectRoot, i18nService) => new EnvironmentService(i18nService, projectRoot);
const defaultAdbServiceFactory = (projectRoot, i18nService) => new ADBService(projectRoot, i18nService);
const defaultNotificationServiceFactory = (i18nService) => new NotificationService(i18nService);
const defaultScrcpyServiceFactory = (projectRoot, i18nService) => new ScrcpyService(projectRoot, i18nService);
const defaultPagePackageServiceFactory = (userConfigPath) => new PagePackageService(userConfigPath);
const defaultBleDeviceDiscoveryServiceFactory = (projectRoot) => new BleDeviceDiscoveryService(projectRoot);
const defaultTestCaseServiceFactory = (userConfigPath, projectRoot) => new TestCaseService(userConfigPath, projectRoot);
const defaultApkParserServiceFactory = (projectRoot, i18nService) => new ApkParserService(projectRoot, i18nService);
const defaultUpdateServiceFactory = (versionService, userDataService) =>
  new UpdateService(versionService, userDataService);
const defaultInspectorServiceFactory = (projectRoot, i18nService, userDataPath, isPackaged = false) =>
  new InspectorService(projectRoot, i18nService, userDataPath, isPackaged);
const defaultDataTransferServiceFactory = (userDataService, i18nService, versionService) => new DataTransferService(userDataService, i18nService, versionService);
const defaultSchedulerServiceFactory = (scheduledPlanService, i18nService) =>
  new SmartScheduler(scheduledPlanService, i18nService);
const defaultEnvironmentStartupServiceFactory = (opts) => new EnvironmentStartupService(opts);

module.exports = {
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
};

// factories — 20 服务默认 factory lambda。
//
// 全藏 new XxxService(...) 构造, 对称 test_initializer.py default factories (L177-198) +
// smartScheduler.js defaultQueueFactory。纯构造, 0 副作用。

const fs = require('fs');
const path = require('path');
const { VersionService } = require('../VersionService');
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
const { SchedulerService } = require('../SchedulerService');
const EnvironmentStartupService = require('../EnvironmentStartupService');

const defaultVersionServiceFactory = (projectRoot) => new VersionService(projectRoot);
const defaultUserDataServiceFactory = (projectRoot, versionService) => new UserDataService(projectRoot, versionService);
const defaultScheduledPlanServiceFactory = (userConfigPath) => new ScheduledPlanService(userConfigPath);
const defaultTestPlanServiceFactory = (userConfigPath, projectRoot) => new TestPlanService(userConfigPath, projectRoot);
const defaultAllureServiceFactory = (projectRoot, i18nService, userDataPath) => new AllureService(projectRoot, i18nService, userDataPath);
const defaultPythonTestServiceFactory = (opts) => new PythonTestService(opts);
const defaultEnvironmentServiceFactory = (i18nService, projectRoot) => new EnvironmentService(i18nService, projectRoot);
const defaultAdbServiceFactory = (projectRoot, i18nService) => new ADBService(projectRoot, i18nService);
const defaultNotificationServiceFactory = (i18nService) => new NotificationService(i18nService);
const defaultScrcpyServiceFactory = (projectRoot, i18nService) => new ScrcpyService(projectRoot, i18nService);
const defaultPagePackageServiceFactory = (userConfigPath) => new PagePackageService(userConfigPath);
const defaultBleDeviceDiscoveryServiceFactory = (projectRoot) => new BleDeviceDiscoveryService(projectRoot);
const defaultTestCaseServiceFactory = (userConfigPath, projectRoot) => new TestCaseService(userConfigPath, projectRoot);
const defaultApkParserServiceFactory = (projectRoot, i18nService) => new ApkParserService(projectRoot, i18nService);
const defaultUpdateServiceFactory = (versionService, userDataService) => {
  // 启动期读 config.json 拿 allowInsecureSSL 初始值 (容错: 读失败默认 false)
  let allowInsecureSSL = false;
  try {
    const configPath = path.join(userDataService.getUserConfigPath(), 'config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      allowInsecureSSL = !!(config && config.APP_SETTINGS && config.APP_SETTINGS.allowInsecureSSL);
    }
  } catch (e) {
    // 忽略: 保持默认 false
  }
  return new UpdateService(versionService, userDataService, { allowInsecureSSL });
};
const defaultInspectorServiceFactory = (projectRoot, i18nService, userDataPath) => new InspectorService(projectRoot, i18nService, userDataPath);
const defaultDataTransferServiceFactory = (userDataService, i18nService, versionService) => new DataTransferService(userDataService, i18nService, versionService);
const defaultSchedulerServiceFactory = () => new SchedulerService();
const defaultEnvironmentStartupServiceFactory = (opts) => new EnvironmentStartupService(opts);

module.exports = {
  defaultVersionServiceFactory,
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

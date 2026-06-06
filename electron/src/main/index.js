const { app } = require('electron');

const ElectronApp = require('./ElectronApp');
const i18nService = require('./services/I18nService');
const { SchedulerService } = require('./services/SchedulerService');
const ScheduledPlanService = require('./services/ScheduledPlanService');
const TestPlanService = require('./services/TestPlanService');
const PythonTestService = require('./services/PythonTestService');
const EnvironmentService = require('./services/EnvironmentService');
const AllureService = require('./services/AllureService');
const ADBService = require('./services/ADBService');
const NotificationService = require('./services/NotificationService');
const ScrcpyService = require('./services/ScrcpyService');
const PagePackageService = require('./services/PagePackageService');
const BleDeviceDiscoveryService = require('./services/BleDeviceDiscoveryService');
const TestCaseService = require('./services/TestCaseService');
const ApkParserService = require('./services/ApkParserService');
const VersionService = require('./services/VersionService');
const UserDataService = require('./services/UserDataService');
const UpdateService = require('./services/UpdateService');
const InspectorService = require('./services/InspectorService');
const DataTransferService = require('./services/DataTransferService');
const { registerAllHandlers } = require('./handlers');

const electronApp = new ElectronApp();

async function initializeServices() {
  const isPackaged = electronApp.isPackaged;
  const projectRoot = electronApp.projectRoot;

  const userDataService = new UserDataService(projectRoot);

  const userConfigPath = userDataService.getUserConfigPath();
  const userDataPath = userDataService.getUserDataPath();

  electronApp.userConfigPath = userConfigPath;
  electronApp.userDataPath = userDataPath;

  await i18nService.init(projectRoot, isPackaged, userConfigPath);

  const scheduledPlanService = new ScheduledPlanService(userConfigPath);
  const testPlanService = new TestPlanService(userConfigPath, projectRoot);
  const allureService = new AllureService(projectRoot, i18nService, userDataPath);
  const pythonTestService = new PythonTestService(projectRoot, i18nService, userDataPath, allureService, testPlanService);
  const environmentService = new EnvironmentService(i18nService, projectRoot);
  await environmentService.configurePythonEnvironment();
  const adbService = new ADBService(projectRoot, i18nService);
  const notificationService = new NotificationService(i18nService);
  const scrcpyService = new ScrcpyService(projectRoot, i18nService);
  const pagePackageService = new PagePackageService(userConfigPath);
  const bleDeviceDiscoveryService = new BleDeviceDiscoveryService(projectRoot);
  const testCaseService = new TestCaseService(userConfigPath, projectRoot);
  const apkParserService = new ApkParserService(projectRoot, i18nService);
  const versionService = new VersionService(projectRoot);
  const updateService = new UpdateService(versionService, userDataService);
  const inspectorService = new InspectorService(projectRoot, i18nService, userDataPath);
  const dataTransferService = new DataTransferService(userDataService, i18nService);
  await apkParserService.initialize();

  const schedulerService = new SchedulerService();
  schedulerService.init(i18nService, scheduledPlanService);

  electronApp.setServices({
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
    registerHandlers: registerAllHandlers
  });
}

initializeServices().then(() => {
  electronApp.initialize();
}).catch(error => {
  console.error('初始化服务失败:', error);
  process.exit(1);
});

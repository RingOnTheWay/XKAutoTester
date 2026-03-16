const { app } = require('electron');

// if (process.platform === 'win32') {
//   app.disableHardwareAcceleration();
//   app.commandLine.appendSwitch('enable-transparent-visuals');
// }

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
const { registerAllHandlers } = require('./handlers');

const electronApp = new ElectronApp();

async function initializeServices() {
  const isPackaged = electronApp.isPackaged;
  const projectRoot = electronApp.projectRoot;
  
  await i18nService.init(projectRoot, isPackaged);
  
  const scheduledPlanService = new ScheduledPlanService(projectRoot);
  const testPlanService = new TestPlanService(projectRoot);
  const pythonTestService = new PythonTestService(projectRoot, i18nService);
  const environmentService = new EnvironmentService(i18nService);
  const allureService = new AllureService(projectRoot, i18nService);
  const adbService = new ADBService(projectRoot, i18nService);
  const notificationService = new NotificationService(i18nService);
  const scrcpyService = new ScrcpyService(projectRoot, i18nService);
  
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
    registerHandlers: registerAllHandlers
  });
}

initializeServices().then(() => {
  electronApp.initialize();
}).catch(error => {
  console.error('初始化服务失败:', error);
  process.exit(1);
});

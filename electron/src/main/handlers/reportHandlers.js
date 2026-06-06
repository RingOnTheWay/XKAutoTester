const { registerHandlers } = require('./base/handlerUtils');
const path = require('path');
const asyncFs = require('../utils/asyncFs');

function mapToAllureLanguage(appLanguage) {
  if (appLanguage && appLanguage.startsWith('zh')) return 'zh';
  if (appLanguage && appLanguage.startsWith('en')) return 'en';
  return 'en';
}

function register(ipcMain, services) {
  const { allureService, notificationService, electronApp, i18nService, userDataService } = services;

  async function getAppTheme() {
    try {
      const configPath = path.join(electronApp.userConfigPath, 'config.json');
      if (await asyncFs.exists(configPath)) {
        const config = await asyncFs.readJson(configPath);
        return config.APP_SETTINGS?.dark_mode === true;
      }
    } catch {}
    return false;
  }

  registerHandlers(ipcMain, {
    'view-report': async (testPlanName) => {
      const appLanguage = i18nService ? i18nService.getLanguage() : 'zh-CN';
      const isDark = await getAppTheme();
      const options = { language: mapToAllureLanguage(appLanguage), isDark };
      const result = await allureService.openAllureReport(testPlanName, options);
      if (result.success && result.url) {
        electronApp.createAllureWindow(result.url, options.language, isDark);
      }
      return result;
    },
    'check-report-exists': (testPlanName) => allureService.checkReportExists(testPlanName),
    'open-report-by-path': async (reportPath) => {
      const appLanguage = i18nService ? i18nService.getLanguage() : 'zh-CN';
      const isDark = await getAppTheme();
      const options = { language: mapToAllureLanguage(appLanguage), isDark };
      const result = await allureService.openReportByPath(reportPath, options);
      if (result.success && result.url) {
        electronApp.createAllureWindow(result.url, options.language, isDark);
      }
      return result;
    },
    'get-allure-server-status': () => allureService.getAllureServerStatus(),
    'clear-allure-reports': () => allureService.clearAllureReports(),
    'clear-all-logs': () => allureService.clearAllLogs(),
    'send-dingtalk-notification': (notificationData) => notificationService.sendDingTalkNotification(notificationData)
  });
}

module.exports = { register };

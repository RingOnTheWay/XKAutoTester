const { registerHandlers } = require('./base/handlerUtils');

function mapToAllureLanguage(appLanguage) {
  if (appLanguage && appLanguage.startsWith('zh')) return 'zh';
  if (appLanguage && appLanguage.startsWith('en')) return 'en';
  return 'en';
}

function register(ipcMain, services) {
  const { allureService, notificationService, electronApp, i18nService } = services;

  registerHandlers(ipcMain, {
    'view-report': async (testPlanName) => {
      const result = await allureService.openAllureReport(testPlanName);
      if (result.success && result.url) {
        const appLanguage = i18nService ? i18nService.getLanguage() : 'zh-CN';
        electronApp.createAllureWindow(result.url, mapToAllureLanguage(appLanguage));
      }
      return result;
    },
    'check-report-exists': (testPlanName) => allureService.checkReportExists(testPlanName),
    'open-report-by-path': async (reportPath) => {
      const result = await allureService.openReportByPath(reportPath);
      if (result.success && result.url) {
        const appLanguage = i18nService ? i18nService.getLanguage() : 'zh-CN';
        electronApp.createAllureWindow(result.url, mapToAllureLanguage(appLanguage));
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

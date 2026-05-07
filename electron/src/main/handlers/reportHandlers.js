const { registerHandlers } = require('./base/handlerUtils');

function register(ipcMain, services) {
  const { allureService, notificationService } = services;

  registerHandlers(ipcMain, {
    'view-report': (testPlanName) => allureService.openAllureReport(testPlanName),
    'check-report-exists': (testPlanName) => allureService.checkReportExists(testPlanName),
    'open-report-by-path': (reportPath) => allureService.openReportByPath(reportPath),
    'stop-allure-server': () => allureService.stopAllureServer(),
    'get-allure-server-status': () => allureService.getAllureServerStatus(),
    'clear-allure-reports': () => allureService.clearAllureReports(),
    'clear-all-logs': () => allureService.clearAllLogs(),
    'send-dingtalk-notification': (notificationData) => notificationService.sendDingTalkNotification(notificationData)
  });
}

module.exports = { register };

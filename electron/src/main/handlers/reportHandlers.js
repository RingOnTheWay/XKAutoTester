function register(ipcMain, services) {
  const { allureService, notificationService } = services;

  ipcMain.handle('view-report', async (event, testPlanName) => {
    return allureService.openAllureReport(testPlanName);
  });

  ipcMain.handle('check-report-exists', async (event, testPlanName) => {
    return allureService.checkReportExists(testPlanName);
  });

  ipcMain.handle('open-report-by-path', async (event, reportPath) => {
    return allureService.openReportByPath(reportPath);
  });

  ipcMain.handle('stop-allure-server', async () => {
    return allureService.stopAllureServer();
  });

  ipcMain.handle('get-allure-server-status', async () => {
    return allureService.getAllureServerStatus();
  });

  ipcMain.handle('clear-allure-reports', async () => {
    return allureService.clearAllureReports();
  });

  ipcMain.handle('send-dingtalk-notification', async (event, notificationData) => {
    return notificationService.sendDingTalkNotification(notificationData);
  });
}

module.exports = { register };

function register(ipcMain, services) {
  const { testPlanService, pythonTestService } = services;

  ipcMain.handle('run-python-tests', async (event, testConfig) => {
    return pythonTestService.runPythonTests(testConfig);
  });

  ipcMain.handle('stop-python-tests', async () => {
    return pythonTestService.stopPythonTests();
  });

  ipcMain.handle('get-test-plans', async () => {
    return testPlanService.getTestPlans();
  });

  ipcMain.handle('save-test-plan', async (event, planData) => {
    return testPlanService.saveTestPlan(planData);
  });

  ipcMain.handle('delete-test-plan', async (event, planId) => {
    return testPlanService.deleteTestPlan(planId);
  });

  ipcMain.handle('update-test-plan', async (event, planData) => {
    return testPlanService.updateTestPlan(planData);
  });

  ipcMain.handle('get-test-plan-runs', async (event, testPlanName) => {
    return testPlanService.getTestPlanRuns(testPlanName);
  });

  ipcMain.handle('scan-test-files', async (event, directoryPath) => {
    return testPlanService.scanTestFiles(directoryPath);
  });

  ipcMain.handle('extract-pytest-markers', async (event, filePaths) => {
    return testPlanService.extractPytestMarkers(filePaths);
  });

  ipcMain.handle('get-pytest-markers', async () => {
    return testPlanService.getPytestMarkers();
  });
}

module.exports = { register };

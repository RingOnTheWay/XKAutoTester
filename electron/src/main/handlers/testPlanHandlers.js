const { registerHandler } = require('./base/handlerUtils');

function register(ipcMain, services) {
  const { testPlanService, pythonTestService } = services;

  registerHandler(ipcMain, 'run-python-tests', (testConfig) => pythonTestService.runPythonTests(testConfig));
  registerHandler(ipcMain, 'stop-python-tests', () => pythonTestService.stopPythonTests());
  registerHandler(ipcMain, 'get-test-plans', () => testPlanService.getTestPlans());
  registerHandler(ipcMain, 'save-test-plan', (planData) => testPlanService.saveTestPlan(planData));
  registerHandler(ipcMain, 'delete-test-plan', (planId) => testPlanService.deleteTestPlan(planId));
  registerHandler(ipcMain, 'update-test-plan', (planData) => testPlanService.updateTestPlan(planData));
  registerHandler(ipcMain, 'get-test-plan-runs', (testPlanName) => testPlanService.getTestPlanRuns(testPlanName));
  registerHandler(ipcMain, 'scan-test-files', (directoryPath) => testPlanService.scanTestFiles(directoryPath));
  registerHandler(ipcMain, 'extract-pytest-markers', (filePaths) => testPlanService.extractPytestMarkers(filePaths));
  registerHandler(ipcMain, 'get-pytest-markers', () => testPlanService.getPytestMarkers());
}

module.exports = { register };

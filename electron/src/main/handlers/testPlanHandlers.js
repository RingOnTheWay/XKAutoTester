const { registerHandler } = require('./base/handlerUtils');

function register(ipcMain, services) {
  const { testPlanService, pythonTestService } = services;

  registerHandler(ipcMain, 'run-python-tests', (testConfig) => pythonTestService.run(testConfig));
  registerHandler(ipcMain, 'stop-python-tests', () => pythonTestService.stop());
  registerHandler(ipcMain, 'get-test-plans', () => testPlanService.getTestPlans());
  registerHandler(ipcMain, 'save-test-plan', (planData) => testPlanService.saveTestPlan(planData));
  registerHandler(ipcMain, 'delete-test-plan', (planId) => testPlanService.deleteTestPlan(planId));
  registerHandler(ipcMain, 'update-test-plan', (planData) => testPlanService.updateTestPlan(planData));
  registerHandler(ipcMain, 'get-test-plan-runs', (testPlanName) => testPlanService.getTestPlanRuns(testPlanName));
  registerHandler(ipcMain, 'scan-test-files', (directoryPath) => testPlanService.scanTestFiles(directoryPath));
  registerHandler(ipcMain, 'extract-pytest-markers', (filePaths) => testPlanService.extractPytestMarkers(filePaths));
  registerHandler(ipcMain, 'get-pytest-markers', () => testPlanService.getPytestMarkers());

  ipcMain.on('log-test-output', (event, text, isError) => {
    if (pythonTestService.logger) {
      const trimmed = typeof text === 'string' ? text.trimEnd() : '';
      if (trimmed) {
        if (isError) {
          pythonTestService.logger.stderr(trimmed);
        } else {
          pythonTestService.logger.stdout(trimmed);
        }
      }
    }
  });
}

module.exports = { register };

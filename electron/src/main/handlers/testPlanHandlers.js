const { registerHandler, assertTrustedSender } = require('./base/handlerUtils');
const { IPC_CHANNELS } = require('../../shared/constants');

function register(ipcMain, services) {
  const { testPlanService, pythonTestService } = services;

  registerHandler(ipcMain, IPC_CHANNELS.RUN_PYTHON_TESTS, (testConfig) => pythonTestService.run(testConfig));
  registerHandler(ipcMain, IPC_CHANNELS.STOP_PYTHON_TESTS, () => pythonTestService.stop());
  registerHandler(ipcMain, IPC_CHANNELS.GET_TEST_PLANS, () => testPlanService.getTestPlans());
  registerHandler(ipcMain, IPC_CHANNELS.SAVE_TEST_PLAN, (planData) => testPlanService.saveTestPlan(planData));
  registerHandler(ipcMain, IPC_CHANNELS.DELETE_TEST_PLAN, (planId) => testPlanService.deleteTestPlan(planId));
  registerHandler(ipcMain, IPC_CHANNELS.UPDATE_TEST_PLAN, (planData) => testPlanService.updateTestPlan(planData));
  registerHandler(ipcMain, IPC_CHANNELS.GET_TEST_PLAN_RUNS, (testPlanName) =>
    testPlanService.getTestPlanRuns(testPlanName)
  );
  registerHandler(ipcMain, IPC_CHANNELS.SCAN_TEST_FILES, (directoryPath) =>
    testPlanService.scanTestFiles(directoryPath)
  );
  registerHandler(ipcMain, IPC_CHANNELS.EXTRACT_PYTEST_MARKERS, (filePaths) =>
    testPlanService.extractPytestMarkers(filePaths)
  );
  registerHandler(ipcMain, IPC_CHANNELS.GET_PYTEST_MARKERS, () => testPlanService.getPytestMarkers());

  ipcMain.on(IPC_CHANNELS.LOG_TEST_OUTPUT, (event, text, isError) => {
    try {
      assertTrustedSender(event); // P0-3 补全: on 通道同样校验 sender
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
    } catch (error) {
      console.error(`IPC handler error [${IPC_CHANNELS.LOG_TEST_OUTPUT}]:`, error);
    }
  });
}

module.exports = { register };

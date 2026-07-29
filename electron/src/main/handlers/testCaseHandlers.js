const { registerHandler } = require('./base/handlerUtils');
const { IPC_CHANNELS } = require('../../shared/constants');

function register(ipcMain, services) {
  const { testCaseService } = services;

  registerHandler(ipcMain, IPC_CHANNELS.TEST_CASE_LIST, () => testCaseService.listTestCases());

  registerHandler(ipcMain, IPC_CHANNELS.TEST_CASE_GET, (fileName) => testCaseService.getTestCase(fileName));

  // saveTestCase 内化条件生成 (若 pyOutputDir 存在自动调 generatePythonFile)
  registerHandler(ipcMain, IPC_CHANNELS.TEST_CASE_SAVE, (caseData) => testCaseService.saveTestCase(caseData));

  registerHandler(ipcMain, IPC_CHANNELS.TEST_CASE_DELETE, (fileName) => testCaseService.deleteTestCase(fileName));

  registerHandler(ipcMain, IPC_CHANNELS.TEST_CASE_CHECK_JSON_EXISTS, async (fileName) => {
    const exists = await testCaseService.checkJsonExists(fileName);
    return { exists };
  });

  registerHandler(ipcMain, IPC_CHANNELS.TEST_CASE_BATCH_CHECK_JSON_EXISTS, async (fileNames) => {
    const results = await testCaseService.batchCheckJsonExists(fileNames);
    return { success: true, data: results };
  });

  registerHandler(ipcMain, IPC_CHANNELS.TEST_CASE_GENERATE_PYTHON, ({ caseData, outputDir }) =>
    testCaseService.generatePythonFile(caseData, outputDir)
  );

  // saveAndGenerate 内化 save + 强制 generate + 双路径返 (吸收原 L45-62 双委托)
  registerHandler(ipcMain, IPC_CHANNELS.TEST_CASE_SAVE_AND_GENERATE, ({ caseData, outputDir }) =>
    testCaseService.saveAndGenerate(caseData, outputDir)
  );
}

module.exports = { register };

const { registerHandler } = require('./base/handlerUtils');

function register(ipcMain, services) {
  const { testCaseService } = services;

  registerHandler(ipcMain, 'test-case:list', () => testCaseService.listTestCases());

  registerHandler(ipcMain, 'test-case:get', (fileName) => testCaseService.getTestCase(fileName));

  registerHandler(ipcMain, 'test-case:save', async (caseData) => {
    const saveResult = await testCaseService.saveTestCase(caseData);
    if (!saveResult.success) {
      return saveResult;
    }

    const savedData = saveResult.data;
    if (savedData.pyOutputDir) {
      try {
        await testCaseService.generatePythonFile(savedData, savedData.pyOutputDir);
      } catch (e) {
        console.error('同步更新Python文件失败:', e);
      }
    }

    return saveResult;
  });

  registerHandler(ipcMain, 'test-case:delete', (fileName) => testCaseService.deleteTestCase(fileName));

  registerHandler(ipcMain, 'test-case:check-json-exists', async (fileName) => {
    const exists = await testCaseService.checkJsonExists(fileName);
    return { exists };
  });

  registerHandler(ipcMain, 'test-case:batch-check-json-exists', async (fileNames) => {
    const results = await testCaseService.batchCheckJsonExists(fileNames);
    return { success: true, data: results };
  });

  registerHandler(ipcMain, 'test-case:generate-python', ({ caseData, outputDir }) =>
    testCaseService.generatePythonFile(caseData, outputDir)
  );

  registerHandler(ipcMain, 'test-case:save-and-generate', async ({ caseData, outputDir }) => {
    const saveResult = await testCaseService.saveTestCase(caseData);
    if (!saveResult.success) {
      return saveResult;
    }

    const generateResult = await testCaseService.generatePythonFile(saveResult.data, outputDir);
    if (!generateResult.success) {
      return generateResult;
    }

    return {
      success: true,
      data: saveResult.data,
      jsonPath: saveResult.path,
      pyPath: generateResult.path
    };
  });
}

module.exports = { register };

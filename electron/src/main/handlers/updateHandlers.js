const { registerHandler } = require('./base/handlerUtils');

function register(ipcMain, services) {
  const { updateService } = services;

  registerHandler(ipcMain, 'check-for-update', async () => {
    try {
      const data = await updateService.checkForUpdate();
      return {
        success: true,
        data
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        errorCode: error.code || 'unknown',
        statusCode: error.statusCode || null
      };
    }
  });

  registerHandler(ipcMain, 'download-update', (downloadUrl, fileName) => {
    if (!downloadUrl || !fileName) {
      return { success: false, error: 'Download URL or file name not provided' };
    }
    return updateService.downloadUpdate(downloadUrl, fileName);
  });

  registerHandler(ipcMain, 'install-update', (filePath) => updateService.installUpdate(filePath));
}

module.exports = { register };

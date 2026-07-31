const { registerHandler } = require('./base/handlerUtils');
const { IPC_CHANNELS } = require('../../shared/constants');

function register(ipcMain, services) {
  const { updateService } = services;

  registerHandler(ipcMain, IPC_CHANNELS.CHECK_FOR_UPDATE, async () => {
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

  registerHandler(ipcMain, IPC_CHANNELS.DOWNLOAD_UPDATE, (downloadUrl, fileName) => {
    if (!downloadUrl || !fileName) {
      return { success: false, error: 'Download URL or file name not provided' };
    }
    return updateService.downloadUpdate(downloadUrl, fileName);
  });

  registerHandler(ipcMain, IPC_CHANNELS.INSTALL_UPDATE, (filePath) => updateService.installUpdate(filePath));
}

module.exports = { register };

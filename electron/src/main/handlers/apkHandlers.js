const { registerHandlers } = require('./base/handlerUtils');
const { IPC_CHANNELS } = require('../../shared/constants');

function register(ipcMain, services) {
  const { apkParserService } = services;

  registerHandlers(ipcMain, {
    [IPC_CHANNELS.APK_PARSE]: (apkPath) => {
      if (!apkParserService) {
        return { success: false, error: 'APK parser service not initialized' };
      }
      return apkParserService.parseApk(apkPath);
    }
  });
}

module.exports = { register };

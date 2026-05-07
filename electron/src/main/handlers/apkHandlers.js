const { registerHandlers } = require('./base/handlerUtils');

function register(ipcMain, services) {
  const { apkParserService } = services;

  registerHandlers(ipcMain, {
    'apk:parse': (apkPath) => {
      if (!apkParserService) {
        return { success: false, error: 'APK parser service not initialized' };
      }
      return apkParserService.parseApk(apkPath);
    }
  });
}

module.exports = { register };

const { IPC_CHANNELS } = require('../../shared/constants');

function register(ipcMain, services) {
  const { adbService } = services;

  ipcMain.handle(IPC_CHANNELS.INSTALL_APK, async (event, { apkPath, deviceId }) => {
    if (!adbService) {
      return { success: false, error: 'ADB service not initialized' };
    }
    return adbService.installApk(apkPath, deviceId, event.sender);
  });
}

module.exports = { register };

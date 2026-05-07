function register(ipcMain, services) {
  const { adbService } = services;

  ipcMain.handle('install-apk', async (event, { apkPath, deviceId }) => {
    if (!adbService) {
      return { success: false, error: 'ADB service not initialized' };
    }
    return adbService.installApk(apkPath, deviceId, event.sender);
  });
}

module.exports = { register };

function register(ipcMain, services) {
  const { adbService, scrcpyService } = services;

  ipcMain.handle('getConnectedDevices', async () => {
    return adbService.getConnectedDevices();
  });

  ipcMain.handle('executeAdbCommand', async (event, cmd, deviceId) => {
    return adbService.executeAdbCommand(cmd, deviceId);
  });

  ipcMain.handle('uploadFile', async (event, localPath, remotePath, deviceId) => {
    return adbService.uploadFile(localPath, remotePath, deviceId);
  });

  ipcMain.handle('downloadFile', async (event, remotePath, localPath, deviceId) => {
    return adbService.downloadFile(remotePath, localPath, deviceId, event.sender);
  });

  ipcMain.handle('start-scrcpy', async (event, deviceId, scrcpyParams) => {
    return scrcpyService.startScrcpy(deviceId, scrcpyParams);
  });
}

module.exports = { register };

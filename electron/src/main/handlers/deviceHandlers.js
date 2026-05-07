const { registerHandler } = require('./base/handlerUtils');

const SCRCPY_CRASH_WINDOW_MS = 2000;

function register(ipcMain, services) {
  const { adbService, scrcpyService, electronApp } = services;

  registerHandler(ipcMain, 'getConnectedDevices', () =>
    adbService.getConnectedDevices()
  );

  registerHandler(ipcMain, 'executeAdbCommand', (cmd, deviceId) =>
    adbService.executeAdbCommand(cmd, deviceId)
  );

  registerHandler(ipcMain, 'uploadFile', (localPath, remotePath, deviceId) =>
    adbService.uploadFile(localPath, remotePath, deviceId)
  );

  registerHandler(ipcMain, 'start-scrcpy', async (deviceId, scrcpyParams) => {
    const result = await scrcpyService.startScrcpy(deviceId, scrcpyParams);

    if (result.success && result.process) {
      const startTime = Date.now();
      const childProcess = result.process;

      childProcess.on('error', (err) => {
        const mainWindow = electronApp.mainWindow;
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('scrcpy-error', {
            error: err.message || 'Unknown spawn error'
          });
        }
      });

      childProcess.on('close', (code, signal) => {
        const elapsed = Date.now() - startTime;
        if (code !== 0 && elapsed < SCRCPY_CRASH_WINDOW_MS) {
          const mainWindow = electronApp.mainWindow;
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('scrcpy-error', {
              error: 'crash',
              code,
              signal
            });
          }
        }
      });

      delete result.process;
    }

    return result;
  });

  ipcMain.handle('downloadFile', async (event, remotePath, localPath, deviceId) => {
    try {
      return await adbService.downloadFile(remotePath, localPath, deviceId, event.sender);
    } catch (error) {
      console.error(`IPC handler error [downloadFile]:`, error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { register };

const { registerHandler } = require('./base/handlerUtils');
const { IPC_CHANNELS } = require('../../shared/constants');

const SCRCPY_CRASH_WINDOW_MS = 2000;

function register(ipcMain, services) {
  const { adbService, scrcpyService, electronApp } = services;

  registerHandler(ipcMain, IPC_CHANNELS.GET_CONNECTED_DEVICES, () =>
    adbService.getConnectedDevices()
  );

  registerHandler(ipcMain, IPC_CHANNELS.EXECUTE_ADB_COMMAND, (cmd, deviceId) =>
    adbService.executeAdbCommand(cmd, deviceId)
  );

  registerHandler(ipcMain, IPC_CHANNELS.UPLOAD_FILE, (localPath, remotePath, deviceId, event) =>
    adbService.uploadFile(localPath, remotePath, deviceId, event.sender)
  , { withEvent: true });

  registerHandler(ipcMain, IPC_CHANNELS.START_SCRCPY, async (deviceId, scrcpyParams) => {
    const result = await scrcpyService.startScrcpy(deviceId, scrcpyParams);

    if (result.success && result.process) {
      const startTime = Date.now();
      const childProcess = result.process;

      childProcess.on('error', (err) => {
        const mainWindow = electronApp.mainWindow;
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send(IPC_CHANNELS.SCRCPY_ERROR, {
            error: err.message || 'Unknown spawn error'
          });
        }
      });

      childProcess.on('close', (code, signal) => {
        const elapsed = Date.now() - startTime;
        if (code !== 0 && elapsed < SCRCPY_CRASH_WINDOW_MS) {
          const mainWindow = electronApp.mainWindow;
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send(IPC_CHANNELS.SCRCPY_ERROR, {
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

  registerHandler(ipcMain, IPC_CHANNELS.DOWNLOAD_FILE, (remotePath, localPath, deviceId, event) =>
    adbService.downloadFile(remotePath, localPath, deviceId, event.sender)
  , { withEvent: true });
}

module.exports = { register };

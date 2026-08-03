const { registerHandler } = require('./base/handlerUtils');
const { IPC_CHANNELS } = require('../../shared/constants');

function register(ipcMain, services) {
  const { adbService, scrcpyService } = services;

  registerHandler(ipcMain, IPC_CHANNELS.GET_CONNECTED_DEVICES, () =>
    adbService.getConnectedDevices()
  );

  registerHandler(ipcMain, IPC_CHANNELS.EXECUTE_ADB_COMMAND, (cmd, deviceId) =>
    adbService.executeAdbCommand(cmd, deviceId)
  );

  registerHandler(ipcMain, IPC_CHANNELS.UPLOAD_FILE, (localPath, remotePath, deviceId, event) =>
    // M4: ADBService 删 uploadFile wrapper, 调用方直接持 .fileTransfer
    adbService.fileTransfer.upload(localPath, remotePath, deviceId, event.sender)
  , { withEvent: true });

  // H2: crash 检测 + child 生命周期下沉到 ScrcpyService (notifierFactory 通知)
  // 原此处 27 行 (startTime + child.on error/close + mainWindow.webContents.send + delete process)
  registerHandler(ipcMain, IPC_CHANNELS.START_SCRCPY, (deviceId, scrcpyParams) =>
    scrcpyService.startScrcpy(deviceId, scrcpyParams)
  );

  registerHandler(ipcMain, IPC_CHANNELS.DOWNLOAD_FILE, (remotePath, localPath, deviceId, event) =>
    // M4: ADBService 删 downloadFile wrapper, 调用方直接持 .fileTransfer
    adbService.fileTransfer.download(remotePath, localPath, deviceId, event.sender)
  , { withEvent: true });
}

module.exports = { register };

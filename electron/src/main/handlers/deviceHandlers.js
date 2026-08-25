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
    adbService.fileTransfer.upload(localPath, remotePath, deviceId, event.sender)
  , { withEvent: true });

  // crash 检测 + child 生命周期下沉到 ScrcpyService (notifierFactory 通知)
  registerHandler(ipcMain, IPC_CHANNELS.START_SCRCPY, (deviceId, scrcpyParams) =>
    scrcpyService.startScrcpy(deviceId, scrcpyParams)
  );

  registerHandler(ipcMain, IPC_CHANNELS.DOWNLOAD_FILE, (remotePath, localPath, deviceId, event) =>
    adbService.fileTransfer.download(remotePath, localPath, deviceId, event.sender)
  , { withEvent: true });
}

module.exports = { register };

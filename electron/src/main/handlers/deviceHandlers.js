const { registerHandler } = require('./base/handlerUtils');
const { IPC_CHANNELS } = require('../../shared/constants');
const path = require('path');

function register(ipcMain, services) {
  const { adbService, scrcpyService } = services;

  registerHandler(ipcMain, IPC_CHANNELS.GET_CONNECTED_DEVICES, () => adbService.getConnectedDevices());

  registerHandler(ipcMain, IPC_CHANNELS.EXECUTE_ADB_COMMAND, (cmd, deviceId) =>
    adbService.executeAdbCommand(cmd, deviceId)
  );

  // P1-6 根治: 专用文件操作通道 (不再经 executeAdbCommand 拼 shell, 路径主进程侧清洗)
  registerHandler(ipcMain, IPC_CHANNELS.DELETE_REMOTE_FILE, (remotePath, deviceId, isDirectory) =>
    adbService.deleteRemoteFile(remotePath, deviceId, isDirectory)
  );

  registerHandler(ipcMain, IPC_CHANNELS.RENAME_REMOTE_FILE, (remotePath, newName, deviceId) =>
    adbService.renameRemoteFile(remotePath, newName, deviceId)
  );

  registerHandler(
    ipcMain,
    IPC_CHANNELS.UPLOAD_FILE,
    (localPath, remotePath, deviceId, event) => {
      // R26 P1-1: localPath 必须为绝对路径 — 渲染层可控, 原无校验可读任意本机文件 push 到设备 (数据外泄)
      if (typeof localPath !== 'string' || !path.isAbsolute(localPath)) {
        return { success: false, error: 'invalid local path' };
      }
      return adbService.fileTransfer.upload(localPath, remotePath, deviceId, event.sender);
    },
    { withEvent: true }
  );

  // crash 检测 + child 生命周期下沉到 ScrcpyService (notifierFactory 通知)
  registerHandler(ipcMain, IPC_CHANNELS.START_SCRCPY, (deviceId, scrcpyParams) =>
    scrcpyService.startScrcpy(deviceId, scrcpyParams)
  );

  registerHandler(
    ipcMain,
    IPC_CHANNELS.DOWNLOAD_FILE,
    (remotePath, localPath, deviceId, event) => {
      // R26 P1-1: localPath 必须为绝对路径 — 原无校验可写任意目录 (覆盖 AppData\Startup 等)
      if (typeof localPath !== 'string' || !path.isAbsolute(localPath)) {
        return { success: false, error: 'invalid local path' };
      }
      return adbService.fileTransfer.download(remotePath, localPath, deviceId, event.sender);
    },
    { withEvent: true }
  );
}

module.exports = { register };

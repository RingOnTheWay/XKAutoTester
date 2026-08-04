const { IPC_CHANNELS } = require('../../shared/constants');
const { registerHandler } = require('./base/handlerUtils');

function register(ipcMain, services) {
  const { adbService } = services;

  // R7: 改用 registerHandler 包 try-catch (原 ipcMain.handle 直注册绕过 wrapper, 抛错直传 reject)
  // preload 传 { apkPath, deviceId } 对象 (见 preload/index.js installApk)
  registerHandler(ipcMain, IPC_CHANNELS.INSTALL_APK, async ({ apkPath, deviceId }, event) => {
    if (!adbService) {
      return { success: false, error: 'ADB service not initialized' };
    }
    // M4: ADBService 删 installApk wrapper, 调用方直接持 .apkInstaller
    return adbService.apkInstaller.install(apkPath, deviceId, event.sender);
  }, { withEvent: true });
}

module.exports = { register };

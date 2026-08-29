const { IPC_CHANNELS } = require('../../shared/constants');
const { registerHandler } = require('./base/handlerUtils');

function register(ipcMain, services) {
  const { adbService, i18nService } = services;

  // i18n 文案封装: i18nService 不可用时回退默认文案
  const t = (key, fallback) =>
    i18nService && typeof i18nService.t === 'function' ? i18nService.t(key, { defaultValue: fallback }) : fallback;

  // 改用 registerHandler 包 try-catch: 原 ipcMain.handle 直注册绕过 wrapper, 抛错直传 reject
  // preload 传 { apkPath, deviceId } 对象 (见 preload/index.js installApk)
  registerHandler(
    ipcMain,
    IPC_CHANNELS.INSTALL_APK,
    async (data, event) => {
      if (!adbService) {
        return {
          success: false,
          error: t('errors.adbServiceNotInit', 'ADB 服务未初始化'),
        };
      }
      const apkPath = data && typeof data === 'object' ? data.apkPath : null;
      const deviceId = data && typeof data === 'object' ? data.deviceId : null;

      if (typeof apkPath !== 'string' || apkPath.trim() === '') {
        return {
          success: false,
          error: t('errors.invalidApkPath', '无效的 APK 路径'),
        };
      }
      if (typeof deviceId !== 'string' || deviceId.trim() === '') {
        return {
          success: false,
          error: t('errors.invalidDeviceId', '无效的设备 ID'),
        };
      }
      // 调用方直接持 .apkInstaller
      return adbService.apkInstaller.install(apkPath, deviceId, event.sender);
    },
    { withEvent: true }
  );
}

module.exports = { register };

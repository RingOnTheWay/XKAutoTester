const { registerHandlers, makeI18nFallback } = require('./base/handlerUtils');
const { IPC_CHANNELS } = require('../../shared/constants');

function register(ipcMain, services) {
  const { apkParserService, i18nService } = services;

  // i18n 文案封装: i18nService 不可用时回退默认文案
  const t = makeI18nFallback(i18nService);

  registerHandlers(ipcMain, {
    [IPC_CHANNELS.APK_PARSE]: (apkPath) => {
      if (!apkParserService) {
        return {
          success: false,
          error: t('errors.apkParserNotInit', 'APK 解析服务未初始化'),
        };
      }
      return apkParserService.parseApk(apkPath);
    },
  });
}

module.exports = { register };

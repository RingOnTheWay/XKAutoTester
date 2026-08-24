const { registerHandler } = require('./base/handlerUtils');
const { IPC_CHANNELS } = require('../../shared/constants');

function register(ipcMain, services) {
  const { updateService, i18nService } = services;

  // i18n 文案封装: i18nService 不可用时回退默认文案
  const t = (key, fallback) => (i18nService && typeof i18nService.t === 'function'
    ? i18nService.t(key, { defaultValue: fallback })
    : fallback);

  registerHandler(ipcMain, IPC_CHANNELS.CHECK_FOR_UPDATE, async () => {
    try {
      const data = await updateService.checkForUpdate();
      return {
        success: true,
        data
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        errorCode: error.code || 'unknown',
        statusCode: error.statusCode || null
      };
    }
  });

  registerHandler(ipcMain, IPC_CHANNELS.DOWNLOAD_UPDATE, (downloadUrl, fileName) => {
    if (typeof downloadUrl !== 'string' || downloadUrl.trim() === '' || typeof fileName !== 'string' || fileName.trim() === '') {
      return { success: false, error: t('errors.updateUrlMissing', '未提供下载地址或文件名') };
    }
    return updateService.downloadUpdate(downloadUrl, fileName);
  });

  registerHandler(ipcMain, IPC_CHANNELS.INSTALL_UPDATE, (filePath) => {
    if (typeof filePath !== 'string' || filePath.trim() === '') {
      return { success: false, error: t('errors.invalidUpdatePath', '无效的更新文件路径') };
    }
    return updateService.installUpdate(filePath);
  });
}

module.exports = { register };

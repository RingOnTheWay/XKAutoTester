const { registerHandler } = require('./base/handlerUtils');
const path = require('path');
const asyncFs = require('../utils/asyncFs');
const { IPC_CHANNELS } = require('../../shared/constants');

function register(ipcMain, services) {
  const { electronApp, i18nService, versionService, userDataService } = services;

  registerHandler(ipcMain, IPC_CHANNELS.GET_CONFIG, async () => {
    const configPath = path.join(electronApp.userConfigPath, 'config.json');
    if (await asyncFs.exists(configPath)) {
      return await asyncFs.readJson(configPath);
    }
    return {};
  });

  registerHandler(ipcMain, IPC_CHANNELS.SAVE_CONFIG, async (newConfig) => {
    const configPath = path.join(electronApp.userConfigPath, 'config.json');
    let currentConfig = {};

    if (await asyncFs.exists(configPath)) {
      currentConfig = await asyncFs.readJson(configPath);
    }

    const updatedConfig = { ...currentConfig, ...newConfig };

    await asyncFs.writeJson(configPath, updatedConfig);

    // 同步后端 i18nService 的语言设置
    if (newConfig.APP_SETTINGS?.language && i18nService) {
      i18nService.changeLanguage(newConfig.APP_SETTINGS.language);
    }

    return { success: true };
  });

  registerHandler(ipcMain, IPC_CHANNELS.GET_PROJECT_INFO, () => ({
    root: electronApp.projectRoot,
    version: versionService ? versionService.getDisplayVersion() : 'v0.1.3-dev.1',
    name: 'XKAutoTester'
  }));

  registerHandler(ipcMain, IPC_CHANNELS.SHOW_DIALOG, async (options) => {
    const { dialog } = require('electron');
    const { type, title, message, buttons } = options;
    const browserWindow = electronApp.mainWindow || null;
    return await dialog.showMessageBox(browserWindow, {
      type: type || 'info',
      title: title || '提示',
      message: message,
      buttons: buttons || ['确定'],
      defaultId: 0,
      cancelId: 0
    });
  });

  registerHandler(ipcMain, IPC_CHANNELS.GET_DATA_PATH, () => {
    if (!userDataService) return { currentPath: '', defaultPath: '' };
    return {
      currentPath: userDataService.getUserDataPath(),
      defaultPath: userDataService.getDefaultUserDataPath()
    };
  });

  registerHandler(ipcMain, IPC_CHANNELS.CHANGE_DATA_PATH, async (newPath) => {
    if (!userDataService) return { success: false, error: '服务未初始化' };
    const result = await userDataService.changeDataPath(newPath);
    if (result.success) {
      electronApp.userConfigPath = userDataService.getUserConfigPath();
      electronApp.userDataPath = userDataService.getUserDataPath();
    }
    return result;
  });

  registerHandler(ipcMain, IPC_CHANNELS.RESET_DATA_PATH, async () => {
    if (!userDataService) return { success: false, error: '服务未初始化' };
    const result = await userDataService.resetToDefaultPath();
    if (result.success) {
      electronApp.userConfigPath = userDataService.getUserConfigPath();
      electronApp.userDataPath = userDataService.getUserDataPath();
    }
    return result;
  });

  registerHandler(ipcMain, IPC_CHANNELS.RELAUNCH_APP, () => {
    const { app } = require('electron');
    app.relaunch();
    app.exit(0);
  });
}

module.exports = { register };

const { registerHandler } = require('./base/handlerUtils');
const path = require('path');
const asyncFs = require('../utils/asyncFs');

function register(ipcMain, services) {
  const { electronApp, i18nService, versionService, userDataService } = services;

  registerHandler(ipcMain, 'get-config', async () => {
    const configPath = path.join(electronApp.userConfigPath, 'config.json');
    if (await asyncFs.exists(configPath)) {
      return await asyncFs.readJson(configPath);
    }
    return {};
  });

  registerHandler(ipcMain, 'save-config', async (newConfig) => {
    const configPath = path.join(electronApp.userConfigPath, 'config.json');
    let currentConfig = {};

    if (await asyncFs.exists(configPath)) {
      currentConfig = await asyncFs.readJson(configPath);
    }

    const updatedConfig = { ...currentConfig, ...newConfig };

    await asyncFs.writeJson(configPath, updatedConfig);

    return { success: true };
  });

  registerHandler(ipcMain, 'get-project-info', () => ({
    root: electronApp.projectRoot,
    version: versionService ? versionService.getDisplayVersion() : 'v0.1.3-dev.1',
    name: 'XKAutoTester'
  }));

  registerHandler(ipcMain, 'show-dialog', async (options) => {
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

  registerHandler(ipcMain, 'get-data-path', () => {
    if (!userDataService) return { currentPath: '', defaultPath: '' };
    return {
      currentPath: userDataService.getUserDataPath(),
      defaultPath: userDataService.getDefaultUserDataPath()
    };
  });

  registerHandler(ipcMain, 'change-data-path', async (newPath) => {
    if (!userDataService) return { success: false, error: '服务未初始化' };
    const result = await userDataService.changeDataPath(newPath);
    if (result.success) {
      electronApp.userConfigPath = userDataService.getUserConfigPath();
      electronApp.userDataPath = userDataService.getUserDataPath();
    }
    return result;
  });

  registerHandler(ipcMain, 'reset-data-path', async () => {
    if (!userDataService) return { success: false, error: '服务未初始化' };
    const result = await userDataService.resetToDefaultPath();
    if (result.success) {
      electronApp.userConfigPath = userDataService.getUserConfigPath();
      electronApp.userDataPath = userDataService.getUserDataPath();
    }
    return result;
  });

  registerHandler(ipcMain, 'relaunch-app', () => {
    const { app } = require('electron');
    app.relaunch();
    app.exit(0);
  });
}

module.exports = { register };

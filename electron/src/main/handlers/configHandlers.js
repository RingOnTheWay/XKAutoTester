const { registerHandler } = require('./base/handlerUtils');
const path = require('path');
const { app } = require('electron');
const asyncFs = require('../utils/asyncFs');
const { IPC_CHANNELS } = require('../../shared/constants');

function register(ipcMain, services) {
  const {
    electronApp, i18nService, versionService, userDataService, updateService,
    // changeDataPath 后需通知各 service 更新内部 filePath
    scheduledPlanService, testPlanService, pagePackageService, testCaseService,
  } = services;

  /**
   * changeDataPath/resetDataPath 后通知各 service 更新内部 filePath
   * 避免 service 持有旧路径导致数据写错位置 (原仅靠 relaunchApp 兜底)
   */
  function _notifyServicesPathChange(newConfigPath) {
    const servicesToUpdate = [
      scheduledPlanService, testPlanService, pagePackageService, testCaseService,
    ];
    for (const svc of servicesToUpdate) {
      if (svc && typeof svc.updateConfigPath === 'function') {
        try {
          svc.updateConfigPath(newConfigPath);
        } catch (e) {
          console.error(`[configHandlers] updateConfigPath failed for ${svc.constructor?.name}:`, e);
        }
      }
    }
  }

  registerHandler(ipcMain, IPC_CHANNELS.GET_CONFIG, async () => {
    const configPath = path.join(electronApp.userConfigPath, 'config.json');
    if (await asyncFs.exists(configPath)) {
      return await asyncFs.readJson(configPath);
    }
    return {};
  });

  registerHandler(ipcMain, IPC_CHANNELS.SAVE_CONFIG, async (newConfig) => {
    const configPath = path.join(electronApp.userConfigPath, 'config.json');

    // 串行化 read-merge-write, 防止多 handler 并发写丢字段
    return asyncFs.withLock(configPath, async () => {
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

      // 同步 UpdateService 的 allowInsecureSSL (运行时切换, 立即生效)
      if (Object.prototype.hasOwnProperty.call(newConfig.APP_SETTINGS || {}, 'allowInsecureSSL') && updateService) {
        updateService.setAllowInsecureSSL(!!newConfig.APP_SETTINGS.allowInsecureSSL);
      }

      return { success: true };
    });
  });

  registerHandler(ipcMain, IPC_CHANNELS.GET_PROJECT_INFO, () => {
    // exeDir = 程序安装目录 (app.getPath('exe') 父目录), 用于前端禁止选择该目录作配置存放路径
    let exeDir = '';
    try {
      exeDir = path.dirname(app.getPath('exe'));
    } catch (e) {
      exeDir = '';
    }
    return {
      root: electronApp.projectRoot,
      version: versionService ? versionService.getDisplayVersion() : 'v0.1.3-dev.1',
      name: 'XKAutoTester',
      exeDir,
    };
  });

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
      // 通知各 service 更新内部 filePath, 避免写旧路径
      _notifyServicesPathChange(electronApp.userConfigPath);
    }
    return result;
  });

  registerHandler(ipcMain, IPC_CHANNELS.RESET_DATA_PATH, async () => {
    if (!userDataService) return { success: false, error: '服务未初始化' };
    const result = await userDataService.resetToDefaultPath();
    if (result.success) {
      electronApp.userConfigPath = userDataService.getUserConfigPath();
      electronApp.userDataPath = userDataService.getUserDataPath();
      // 通知各 service 更新内部 filePath
      _notifyServicesPathChange(electronApp.userConfigPath);
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

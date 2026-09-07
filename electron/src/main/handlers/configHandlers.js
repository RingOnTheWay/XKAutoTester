const { registerHandler } = require('./base/handlerUtils');
const path = require('path');
const { app } = require('electron');
const asyncFs = require('../utils/asyncFs');
const { IPC_CHANNELS } = require('../../shared/constants');

function register(ipcMain, services) {
  const {
    electronApp,
    i18nService,
    versionService,
    userDataService,
    updateService,
    // changeDataPath 后需通知各 service 更新内部 filePath
    scheduledPlanService,
    testPlanService,
    pagePackageService,
    testCaseService,
  } = services;

  // i18n 文案封装: i18nService 不可用时回退默认文案
  const t = (key, fallback) =>
    i18nService && typeof i18nService.t === 'function' ? i18nService.t(key, { defaultValue: fallback }) : fallback;

  /**
   * changeDataPath/resetDataPath 后通知各 service 更新内部 filePath
   * 避免 service 持有旧路径导致数据写错位置 (原仅靠 relaunchApp 兜底)
   */
  function _notifyServicesPathChange(newConfigPath) {
    const servicesToUpdate = [scheduledPlanService, testPlanService, pagePackageService, testCaseService];
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
    // P3-7: 缺失时合并分发模板默认值 (config/config.json), 避免渲染层拿到空对象缺字段
    try {
      const templatePath = path.join(electronApp.projectRoot, 'config', 'config.json');
      if (await asyncFs.exists(templatePath)) {
        return await asyncFs.readJson(templatePath);
      }
    } catch (e) {
      console.error('[configHandlers] 读取模板配置失败:', e);
    }
    return {};
  });

  registerHandler(ipcMain, IPC_CHANNELS.SAVE_CONFIG, async (newConfig) => {
    if (!newConfig || typeof newConfig !== 'object' || Array.isArray(newConfig)) {
      return {
        success: false,
        error: t('errors.invalidConfig', '无效的配置数据'),
      };
    }
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
    const { type, title, message, buttons } =
      options && typeof options === 'object' && !Array.isArray(options) ? options : {};
    const browserWindow = electronApp.mainWindow || null;
    return await dialog.showMessageBox(browserWindow, {
      type: type || 'info',
      title: title || '提示',
      message: message,
      buttons: buttons || ['确定'],
      defaultId: 0,
      cancelId: 0,
    });
  });

  registerHandler(ipcMain, IPC_CHANNELS.GET_DATA_PATH, () => {
    if (!userDataService) return { currentPath: '', defaultPath: '' };
    return {
      currentPath: userDataService.getUserDataPath(),
      defaultPath: userDataService.getDefaultUserDataPath(),
    };
  });

  registerHandler(ipcMain, IPC_CHANNELS.CHANGE_DATA_PATH, async (newPath) => {
    if (!userDataService)
      return {
        success: false,
        error: t('errors.serviceNotInit', '服务未初始化'),
      };
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
    if (!userDataService)
      return {
        success: false,
        error: t('errors.serviceNotInit', '服务未初始化'),
      };
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

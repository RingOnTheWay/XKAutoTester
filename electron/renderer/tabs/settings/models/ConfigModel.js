import { BaseModel } from '../../../core/BaseModel.js';
import { ApiBridge } from '../../../core/ApiBridge.js';
import { AppState } from '../../../core/AppState.js';

const DEFAULT_NOTIFICATION = () => ({
  platform: 'none',
  dingtalk: { access_token: '', secret: '' },
});

/**
 * ConfigModel - 配置读写/通知/数据路径/导入导出/清理 (settings 拆分, R26 候选②)
 *
 * 加载/保存后 emit 'config-changed' (raw config) —— 主题/语言状态的派生
 * 由 facade (../model.js) 路由到 ThemeModel.applyFromConfig, 子模型间不互相引用。
 */
export class ConfigModel extends BaseModel {
  #api = ApiBridge.bind({
    getConfig: 'getConfig',
    saveConfig: 'saveConfig',
    getDataPath: 'getDataPath',
    changeDataPath: 'changeDataPath',
    resetDataPath: 'resetDataPath',
    relaunchApp: 'relaunchApp',
    selectDirectory: 'selectDirectory',
    selectExportPath: 'selectExportPath',
    selectImportPath: 'selectImportPath',
    exportConfig: 'exportConfig',
    exportLogs: 'exportLogs',
    importConfig: 'importConfig',
    clearAllureReports: 'clearAllureReports',
    clearAllLogs: 'clearAllLogs',
    setPreventSleep: 'setPreventSleep',
    openExternal: 'openExternal',
  });

  constructor() {
    super({
      config: null,
      dataPath: null,
      dataPathInfo: null,
      notification: DEFAULT_NOTIFICATION(),
      autoCheckUpdate: true,
      preventSleep: false,
      allowInsecureSSL: false,
    });
  }

  get config() {
    return this.get('config');
  }

  get dataPath() {
    return this.get('dataPath');
  }

  get notification() {
    return this.get('notification');
  }

  get autoCheckUpdate() {
    return this.get('autoCheckUpdate');
  }

  get preventSleep() {
    return this.get('preventSleep');
  }

  get allowInsecureSSL() {
    return this.get('allowInsecureSSL');
  }

  async loadConfig() {
    try {
      const config = await this.#api.getConfig();
      const settings = config?.APP_SETTINGS || {};
      this.forceSet('config', config, 'config-changed');
      // 通知对象每次重建 (引用语义, 强制刷新下游)
      this.forceSet('notification', settings.notification || DEFAULT_NOTIFICATION(), 'notification-changed');
      this.set('autoCheckUpdate', settings.autoCheckUpdate !== false);
      this.set('preventSleep', !!settings.preventSleep);
      this.set('allowInsecureSSL', !!settings.allowInsecureSSL);
    } catch (error) {
      this.emitError('loadConfig', error);
    }
  }

  async loadDataPath() {
    try {
      const result = await this.#api.getDataPath();
      // API 返回 { currentPath, defaultPath }，提取 currentPath 作为显示路径
      const path = typeof result === 'string' ? result : result?.currentPath || '';
      this.set('dataPath', path, 'data-path-changed');
      this.set('dataPathInfo', result, 'data-path-info-changed');
    } catch (error) {
      this.emitError('loadDataPath', error);
    }
  }

  async saveConfig(settings) {
    try {
      const config = this.get('config') || {};
      config.APP_SETTINGS = { ...config.APP_SETTINGS, ...settings };
      // wrapper 已处理 IPC 失败,错误由外层 catch 接
      const result = await this.#api.saveConfig(config);
      this.forceSet('config', config, 'config-changed');
      // 同步到 AppState 供其他 Tab 读取
      AppState.instance.set('config', config);
      return result;
    } catch (error) {
      this.emitError('saveConfig', error);
      return { success: false, error: error.message };
    }
  }

  async saveNotificationConfig() {
    return this.saveConfig({ notification: this.get('notification') });
  }

  async changeDataPath(newPath) {
    try {
      // wrapper 已处理 IPC 失败,错误由外层 catch 接
      const result = await this.#api.changeDataPath(newPath);
      await this.#api.relaunchApp();
      return result;
    } catch (error) {
      this.emitError('changeDataPath', error);
      return { success: false, error: error.message };
    }
  }

  async resetDataPath() {
    try {
      // wrapper 已处理 IPC 失败,错误由外层 catch 接
      const result = await this.#api.resetDataPath();
      await this.#api.relaunchApp();
      return result;
    } catch (error) {
      this.emitError('resetDataPath', error);
      return { success: false, error: error.message };
    }
  }

  async selectExportPath(type = 'config') {
    try {
      return await this.#api.selectExportPath({
        type,
        title: window.i18n.t('settings.selectExportPath'),
      });
    } catch (error) {
      this.emitError('selectExportPath', error);
      return null;
    }
  }

  async selectImportPath() {
    try {
      return await this.#api.selectImportPath();
    } catch (error) {
      this.emitError('selectImportPath', error);
      return null;
    }
  }

  async exportConfig(outputPath) {
    try {
      const result = await this.#api.exportConfig(outputPath);
      if (result && result.success === false) {
        // ADR-0011 错误通知单一归口: IPC 失败形态归入 emit 路径, controller 不查 success 弹错
        this.emitError('exportConfig', new Error(result.error || 'Export failed'));
        return { success: false, error: result.error };
      }
      return result;
    } catch (error) {
      this.emitError('exportConfig', error);
      return { success: false, error: error.message };
    }
  }

  async exportLogs(outputPath) {
    try {
      const result = await this.#api.exportLogs(outputPath);
      if (result && result.success === false) {
        this.emitError('exportLogs', new Error(result.error || 'Export logs failed'));
        return { success: false, error: result.error };
      }
      return result;
    } catch (error) {
      this.emitError('exportLogs', error);
      return { success: false, error: error.message };
    }
  }

  async importConfig(zipPath) {
    try {
      const result = await this.#api.importConfig(zipPath);
      if (result && result.success === false) {
        // ADR-0011: IPC 失败形态归入 emit 路径 (原由 controller 查 success 弹错, 双 toast 风险)
        this.emitError('importConfig', new Error(result.error || 'Import failed'));
        return { success: false, error: result.error };
      }
      await this.loadConfig();
      return result;
    } catch (error) {
      this.emitError('importConfig', error);
      return { success: false, error: error.message };
    }
  }

  async clearAllureReports() {
    try {
      return await this.#api.clearAllureReports();
    } catch (error) {
      this.emitError('clearAllureReports', error);
      return { success: false, error: error.message };
    }
  }

  async clearAllLogs() {
    try {
      return await this.#api.clearAllLogs();
    } catch (error) {
      this.emitError('clearAllLogs', error);
      return { success: false, error: error.message };
    }
  }

  async setPreventSleep(enable) {
    try {
      // wrapper 已处理 IPC 失败,错误由外层 catch 接
      const result = await this.#api.setPreventSleep(enable);
      this.set('preventSleep', enable);
      return result;
    } catch (error) {
      this.emitError('setPreventSleep', error);
      return { success: false, error: error.message };
    }
  }

  async relaunchApp() {
    try {
      await this.#api.relaunchApp();
    } catch (error) {
      this.emitError('relaunchApp', error);
    }
  }

  async selectDirectory() {
    try {
      return await this.#api.selectDirectory();
    } catch (error) {
      this.emitError('selectDirectory', error);
      return null;
    }
  }

  async openExternal(url) {
    try {
      return await this.#api.openExternal(url);
    } catch (error) {
      this.emitError('openExternal', error);
      return { success: false, error: error.message };
    }
  }
}

import { EventEmitter } from '../../core/EventEmitter.js';
import { ApiBridge } from '../../core/ApiBridge.js';
import { AppState } from '../../core/AppState.js';

/**
 * SettingsModel - 设置 Tab 的 Model 层
 * 管理配置加载/保存、主题、语言、通知、版本、更新等状态
 */
export class SettingsModel extends EventEmitter {
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
    getVersionInfo: 'getVersionInfo',
    openExternal: 'openExternal',
    checkForUpdate: 'checkForUpdate',
    checkForUpdateRaw: 'checkForUpdateRaw',
    downloadUpdate: 'downloadUpdate',
    cancelUpdateDownload: 'cancelUpdateDownload', // R27: UI 取消进行中下载
    installUpdate: 'installUpdate',
    clearAllureReports: 'clearAllureReports',
    clearAllLogs: 'clearAllLogs',
    setPreventSleep: 'setPreventSleep',
  });

  #state = {
    config: null,
    darkMode: false,
    themeColor: '#4CAF50',
    language: 'zh-CN',
    notification: {
      platform: 'none',
      dingtalk: { access_token: '', secret: '' },
    },
    versionInfo: null,
    dataPath: null,
    updateData: null,
    updatePendingFilePath: null,
    removeUpdateProgressListener: null,
    autoCheckUpdate: true,
    preventSleep: false,
    allowInsecureSSL: false,
  };

  // ── State Getters ──────────────────────────────────────────────

  get config() {
    return this.#state.config;
  }
  get darkMode() {
    return this.#state.darkMode;
  }
  get themeColor() {
    return this.#state.themeColor;
  }
  get language() {
    return this.#state.language;
  }
  get notification() {
    return this.#state.notification;
  }
  get versionInfo() {
    return this.#state.versionInfo;
  }
  get dataPath() {
    return this.#state.dataPath;
  }
  get updateData() {
    return this.#state.updateData;
  }
  get updatePendingFilePath() {
    return this.#state.updatePendingFilePath;
  }
  get autoCheckUpdate() {
    return this.#state.autoCheckUpdate;
  }
  get preventSleep() {
    return this.#state.preventSleep;
  }
  get allowInsecureSSL() {
    return this.#state.allowInsecureSSL;
  }

  get(key) {
    return this.#state[key];
  }

  // ── Private State Helper ───────────────────────────────────────

  #set(key, value, event) {
    const old = this.#state[key];
    if (old === value) return;
    this.#state[key] = value;
    this.emit(event || `${key}-changed`, value, old);
  }

  // ── Initialization ─────────────────────────────────────────────

  async load() {
    await Promise.all([this.loadConfig(), this.loadVersionInfo(), this.loadDataPath()]);
  }

  async loadConfig() {
    try {
      const config = await this.#api.getConfig();
      this.#state.config = config;
      const settings = config?.APP_SETTINGS || {};
      this.#set('darkMode', !!settings.dark_mode, 'dark-mode-changed');
      this.#set('themeColor', settings.theme_color || '#4CAF50', 'theme-color-changed');
      this.#set('language', settings.language || 'zh-CN', 'language-changed');
      this.#set(
        'notification',
        settings.notification || {
          platform: 'none',
          dingtalk: { access_token: '', secret: '' },
        }
      );
      this.#set('autoCheckUpdate', settings.autoCheckUpdate !== false);
      this.#set('preventSleep', !!settings.preventSleep);
      this.#set('allowInsecureSSL', !!settings.allowInsecureSSL);
      this.emit('config-changed', config);
    } catch (error) {
      this.emit('error', { source: 'loadConfig', error });
    }
  }

  async loadVersionInfo() {
    try {
      const versionInfo = await this.#api.getVersionInfo();
      this.#set('versionInfo', versionInfo, 'version-info-changed');
    } catch (error) {
      this.emit('error', { source: 'loadVersionInfo', error });
    }
  }

  async loadDataPath() {
    try {
      const result = await this.#api.getDataPath();
      // API 返回 { currentPath, defaultPath }，提取 currentPath 作为显示路径
      const path = typeof result === 'string' ? result : result?.currentPath || '';
      this.#set('dataPath', path, 'data-path-changed');
      this.#set('dataPathInfo', result, 'data-path-info-changed');
    } catch (error) {
      this.emit('error', { source: 'loadDataPath', error });
    }
  }

  // ── Config Save ────────────────────────────────────────────────

  async saveConfig(settings) {
    try {
      const config = this.#state.config || {};
      config.APP_SETTINGS = { ...config.APP_SETTINGS, ...settings };
      // wrapper 已处理 IPC 失败,错误由外层 catch 接
      const result = await this.#api.saveConfig(config);
      this.#state.config = config;
      this.emit('config-changed', config);
      // 同步到 AppState 供其他 Tab 读取
      AppState.instance.set('config', config);
      return result;
    } catch (error) {
      this.emit('error', { source: 'saveConfig', error });
      return { success: false, error: error.message };
    }
  }

  async saveNotificationConfig() {
    return this.saveConfig({ notification: this.#state.notification });
  }

  // ── Theme ──────────────────────────────────────────────────────

  applyDarkMode(isDark) {
    this.#set('darkMode', isDark, 'dark-mode-changed');
  }

  applyThemeColor(color) {
    this.#set('themeColor', color, 'theme-color-changed');
  }

  // ── Language ───────────────────────────────────────────────────

  changeLanguage(lang) {
    this.#set('language', lang, 'language-changed');
    AppState.instance.set('locale', lang);
  }

  // ── Data Path ──────────────────────────────────────────────────

  async changeDataPath(newPath) {
    try {
      // wrapper 已处理 IPC 失败,错误由外层 catch 接
      const result = await this.#api.changeDataPath(newPath);
      await this.#api.relaunchApp();
      return result;
    } catch (error) {
      this.emit('error', { source: 'changeDataPath', error });
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
      this.emit('error', { source: 'resetDataPath', error });
      return { success: false, error: error.message };
    }
  }

  // ── Export / Import ────────────────────────────────────────────

  async selectExportPath(type = 'config') {
    try {
      return await this.#api.selectExportPath({
        type,
        title: window.i18n.t('settings.selectExportPath'),
      });
    } catch (error) {
      this.emit('error', { source: 'selectExportPath', error });
      return null;
    }
  }

  async selectImportPath() {
    try {
      return await this.#api.selectImportPath();
    } catch (error) {
      this.emit('error', { source: 'selectImportPath', error });
      return null;
    }
  }

  async exportConfig(outputPath) {
    try {
      const result = await this.#api.exportConfig(outputPath);
      return result;
    } catch (error) {
      // 不 emit('error'): 失败由 controller 检查 result.success 统一显示原因, 避免双 toast
      return { success: false, error: error.message };
    }
  }

  async exportLogs(outputPath) {
    try {
      const result = await this.#api.exportLogs(outputPath);
      return result;
    } catch (error) {
      // 不 emit('error'): 失败由 controller 检查 result.success 统一显示原因, 避免双 toast
      return { success: false, error: error.message };
    }
  }

  async importConfig(zipPath) {
    try {
      // wrapper 已处理 IPC 失败,错误由外层 catch 接
      const result = await this.#api.importConfig(zipPath);
      await this.loadConfig();
      return result;
    } catch (error) {
      this.emit('error', { source: 'importConfig', error });
      return { success: false, error: error.message };
    }
  }

  // ── Update ─────────────────────────────────────────────────────

  async checkForUpdate() {
    try {
      const result = await this.#api.checkForUpdateRaw();
      if (result && result.success === false) {
        const err = new Error(result.error || 'Unknown IPC error');
        err.code = result.errorCode;
        err.statusCode = result.statusCode;
        throw err;
      }
      const data = result?.data || {};
      if (data.hasUpdate) {
        this.#set(
          'updateData',
          {
            // R27: 显示保留 'v' 前缀 (latestVersionDisplay 带 v, 与 tag 一致);
            // latestVersion 仍可访问用于 semver 比较 (无 v)
            version: data.latestVersionDisplay || data.latestVersion,
            releaseNotes: data.releaseNotes,
            releaseName: data.releaseName,
            downloadUrl: data.downloadUrl,
            fileName: data.fileName,
            fileSize: data.fileSize,
            htmlUrl: data.htmlUrl,
            sha256: data.sha256, // R10: 透出 hash 供 UI 显示
            secure: data.secure !== false && !!data.sha256, // R10: 无 hash 标记不可安装
          },
          'update-available'
        );
      } else {
        this.emit('update-not-available', data);
      }
      return data;
    } catch (error) {
      this.emit('error', {
        source: 'checkUpdate',
        error,
        code: error.code,
        statusCode: error.statusCode,
      });
      return { success: false, error: error.message };
    }
  }

  async downloadUpdate() {
    try {
      // 注册下载进度监听
      // R27 P3-7: 仅当为函数才调用 — 旧 preload 兼容可能存非函数真值 → 原调抛 TypeError
      if (typeof this.#state.removeUpdateProgressListener === 'function') {
        this.#state.removeUpdateProgressListener();
      }
      const removeListener = ApiBridge.api.onUpdateDownloadProgress((progress) => {
        this.emit('download-progress', progress);
      });
      this.#state.removeUpdateProgressListener = removeListener;

      const updateData = this.#state.updateData;
      if (!updateData) {
        this.emit('error', {
          source: 'downloadUpdate',
          message: 'noUpdateData',
        });
        return;
      }

      const downloadUrl = updateData.downloadUrl || updateData.url;
      const fileName = updateData.fileName || updateData.version || 'update';
      const result = await this.#api.downloadUpdate(downloadUrl, fileName);

      if (removeListener) removeListener();
      this.#state.removeUpdateProgressListener = null;

      if (result && result.filePath) {
        this.#set('updatePendingFilePath', result.filePath, 'update-downloaded');
      }
      // R27: 取消下载 (cancelled) → 状态复位, UI 已由取消按钮关闭
      else if (result && result.cancelled) {
        this.emit('update-download-cancelled');
      }
      return result;
    } catch (error) {
      if (this.#state.removeUpdateProgressListener) {
        this.#state.removeUpdateProgressListener();
        this.#state.removeUpdateProgressListener = null;
      }
      this.emit('error', { source: 'downloadUpdate', error });
      return { success: false, error: error.message };
    }
  }

  /**
   * R27: 取消进行中的更新下载 (abort 主进程下载 + 清临时文件)
   */
  async cancelDownload() {
    try {
      return await this.#api.cancelUpdateDownload();
    } catch (error) {
      this.emit('error', { source: 'cancelDownload', error });
      return { success: false, error: error.message };
    }
  }

  async installUpdate(filePath) {
    try {
      const path = filePath || this.#state.updatePendingFilePath;
      if (!path) {
        this.emit('error', {
          source: 'installUpdate',
          message: 'noUpdateFile',
        });
        return;
      }
      const result = await this.#api.installUpdate(path);
      return result;
    } catch (error) {
      this.emit('error', { source: 'installUpdate', error });
      return { success: false, error: error.message };
    }
  }

  // ── Clear Operations ───────────────────────────────────────────

  async clearAllureReports() {
    try {
      return await this.#api.clearAllureReports();
    } catch (error) {
      this.emit('error', { source: 'clearAllureReports', error });
      return { success: false, error: error.message };
    }
  }

  async clearAllLogs() {
    try {
      return await this.#api.clearAllLogs();
    } catch (error) {
      this.emit('error', { source: 'clearAllLogs', error });
      return { success: false, error: error.message };
    }
  }

  // ── Prevent Sleep ──────────────────────────────────────────────

  async setPreventSleep(enable) {
    try {
      // wrapper 已处理 IPC 失败,错误由外层 catch 接
      const result = await this.#api.setPreventSleep(enable);
      this.#set('preventSleep', enable);
      return result;
    } catch (error) {
      this.emit('error', { source: 'setPreventSleep', error });
      return { success: false, error: error.message };
    }
  }

  // ── Relaunch App ────────────────────────────────────────────────

  async relaunchApp() {
    try {
      await this.#api.relaunchApp();
    } catch (error) {
      this.emit('error', { source: 'relaunchApp', error });
    }
  }

  // ── Select Directory ───────────────────────────────────────────

  async selectDirectory() {
    try {
      const result = await this.#api.selectDirectory();
      return result;
    } catch (error) {
      this.emit('error', { source: 'selectDirectory', error });
      return null;
    }
  }

  // ── Open External URL ──────────────────────────────────────────

  async openExternal(url) {
    try {
      return await this.#api.openExternal(url);
    } catch (error) {
      this.emit('error', { source: 'openExternal', error });
      return { success: false, error: error.message };
    }
  }

  // ── Static Utilities ───────────────────────────────────────────

  static hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : null;
  }

  static darkenColor(hex, amount = 0.2) {
    const rgb = SettingsModel.hexToRgb(hex);
    if (!rgb) return hex;
    const r = Math.max(0, Math.round(rgb.r * (1 - amount)));
    const g = Math.max(0, Math.round(rgb.g * (1 - amount)));
    const b = Math.max(0, Math.round(rgb.b * (1 - amount)));
    return SettingsModel.rgbToHex(r, g, b);
  }

  static lightenColor(hex, amount = 0.2) {
    const rgb = SettingsModel.hexToRgb(hex);
    if (!rgb) return hex;
    const r = Math.min(255, Math.round(rgb.r + (255 - rgb.r) * amount));
    const g = Math.min(255, Math.round(rgb.g + (255 - rgb.g) * amount));
    const b = Math.min(255, Math.round(rgb.b + (255 - rgb.b) * amount));
    return SettingsModel.rgbToHex(r, g, b);
  }

  static rgbToHex(r, g, b) {
    return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
  }

  static renderMarkdown(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
  }

  static formatDownloadSpeed(bytesPerSecond) {
    if (!bytesPerSecond || bytesPerSecond <= 0) return '';
    if (bytesPerSecond < 1024) return `${bytesPerSecond.toFixed(0)} B/s`;
    if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
    return `${(bytesPerSecond / (1024 * 1024)).toFixed(2)} MB/s`;
  }

  destroy() {
    if (this.#state.removeUpdateProgressListener) {
      this.#state.removeUpdateProgressListener();
      this.#state.removeUpdateProgressListener = null;
    }
    this.removeAllListeners();
  }
}

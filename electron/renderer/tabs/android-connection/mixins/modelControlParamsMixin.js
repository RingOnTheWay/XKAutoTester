// Control Params Mixin for AndroidConnectionModel
// Extracted from model.js during refactor
// Provides: scrcpy params load/save, screen control, MVC wrappers (testCase/getDataPath), IPC listeners

import { ApiBridge } from '../../../core/ApiBridge.js';

export const modelControlParamsMixin = {
  // ── 投屏控制 ───────────────────────────────────────────────────

  async loadControlParams() {
    try {
      const config = await this._api.getConfig();
      const scrcpyParams = config.SCRCPY_PARAMS || {};
      this._set('scrcpyParams', scrcpyParams, 'scrcpy-params-loaded');
      return scrcpyParams;
    } catch (error) {
      this.emit('error', { source: 'loadControlParams', error });
      return {};
    }
  },

  async saveControlParams(params) {
    try {
      const result = await this._api.saveConfig({ SCRCPY_PARAMS: params });
      // invokeWithCheck 已保证失败时抛错，直接更新状态
      this._set('scrcpyParams', params, 'scrcpy-params-saved');
      return result;
    } catch (error) {
      this.emit('error', { source: 'saveControlParams', error });
      return { success: false, error: error.message };
    }
  },

  /**
   * 获取测试用例数据
   * MVC: model wrapper,避免 controller 调 window.electronAPI.testCase.get
   */
  async getTestCase(fileName) {
    try {
      return await this._api.testCaseGet(fileName);
    } catch (error) {
      this.emit('error', { source: 'getTestCase', error });
      return { success: false, error: error.message };
    }
  },

  /**
   * 保存并生成测试用例
   * MVC: model wrapper,避免 controller 调 window.electronAPI.testCase.saveAndGenerate
   */
  async saveAndGenerateTestCase(caseData, outputDir) {
    try {
      return await this._api.testCaseSaveAndGenerate(caseData, outputDir);
    } catch (error) {
      this.emit('error', { source: 'saveAndGenerateTestCase', error });
      return { success: false, error: error.message };
    }
  },

  /**
   * 获取数据路径
   * MVC: model wrapper,避免 controller 调 window.electronAPI.getDataPath
   */
  async getDataPath() {
    try {
      return await this._api.getDataPath();
    } catch (error) {
      this.emit('error', { source: 'getDataPath', error });
      return { currentPath: '', defaultPath: '' };
    }
  },

  async startScreenControl() {
    if (!this._state.selectedDevice) {
      this.emit('screen-control-error', { message: window.i18n.t('fileManager.selectDeviceFirst') });
      return null;
    }

    try {
      // 获取最新配置
      const config = await this._api.getConfig();
      const scrcpyParams = config.SCRCPY_PARAMS || {};
      const result = await this._api.startScrcpy(this._state.selectedDevice, scrcpyParams);
      this.emit('screen-control-result', result);
      return result;
    } catch (error) {
      this.emit('error', { source: 'startScreenControl', error });
      return { success: false, error: error.message };
    }
  },

  // ── IPC 事件监听 ───────────────────────────────────────────────

  listenScrcpyError(callback) {
    return ApiBridge.api.onScrcpyError?.(callback);
  },

  listenDownloadProgress(callback) {
    return ApiBridge.api.onDownloadProgress?.(callback);
  },

  listenUploadProgress(callback) {
    return ApiBridge.api.onUploadProgress?.(callback);
  },

  listenInstallProgress(callback) {
    return ApiBridge.api.onInstallProgress?.(callback);
  },
};

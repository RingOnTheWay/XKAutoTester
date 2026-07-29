/**
 * Model Mixin - 用例 CRUD 与选择项变更
 * 提供 saveCase / deleteCase / loadCaseData / selectApp / selectPlatform 方法
 * 通过 Object.assign 挂载到 TestCaseModel.prototype
 */
export const modelCaseMixin = {
  // ── Case CRUD ──────────────────────────────────────────────────

  /**
   * 保存测试用例（验证 + API 调用）
   * @param {Object} caseData - 用例数据
   */
  async saveCase(caseData) {
    if (!caseData.fileName) {
      this.emit('error', { source: 'saveCase', message: 'fileNameRequired' });
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(caseData.fileName)) {
      this.emit('error', { source: 'saveCase', message: 'fileNameInvalidChars' });
      return;
    }
    if (!this._state.selectedDirectory) {
      this.emit('error', { source: 'saveCase', message: 'selectCaseFirst' });
      return;
    }
    if (!this._state.selectedApp) {
      this.emit('error', { source: 'saveCase', message: 'selectAppFirst' });
      return;
    }

    try {
      const result = await this._api.saveAndGenerate(caseData, this._state.selectedDirectory);
      // invokeWithCheck 已保证失败时抛错，走到这里即成功
      this._set('hasUnsavedChanges', false, 'dirty-changed');
      this.emit('case-saved', result);
      await this.scanTestFiles(this._state.selectedDirectory);
    } catch (error) {
      this.emit('error', { source: 'saveCase', message: 'saveFailed', error });
    }
  },

  /**
   * 删除测试用例
   * @param {string} fileName - 文件名（不含扩展名）
   * @param {string} pyFilePath - .py 文件完整路径
   */
  async deleteCase(fileName, pyFilePath) {
    try {
      const result = await this._api.deleteCase({ fileName, pyFilePath });
      // invokeWithCheck 已保证失败时抛错，走到这里即成功
      void result; // 删除结果未使用
      this.emit('case-deleted', { fileName, pyFilePath });
      await this.scanTestFiles(this._state.selectedDirectory);
    } catch (error) {
      this.emit('error', { source: 'deleteCase', message: 'deleteFailed', error });
    }
  },

  /**
   * 从 API 加载用例数据
   * @param {string} fileName - 文件名（不含扩展名）
   */
  async loadCaseData(fileName) {
    try {
      const result = await this._api.getCase(fileName);
      // invokeWithCheck 已保证失败时抛错，走到这里即成功
      const caseData = result.data;

      // 恢复 markers
      const savedMarkers = caseData.allureConfig?.markers || [];
      this._state.selectedMarkers = savedMarkers;
      this.emit('markers-changed', savedMarkers);

      // 恢复 targetApp
      if (caseData.targetApp?.id) {
        this._state.selectedApp = caseData.targetApp;
        this.emit('app-changed', caseData.targetApp);
      }

      // 恢复 steps
      this._state.steps = caseData.steps || [];
      this.emit('steps-changed', this._state.steps);

      // 恢复设备配置
      this._set('loadedDeviceConfig', caseData.deviceConfig || null);
      this._set('loadedBleDevice', caseData.bleDevice || null);

      this.emit('case-loaded', caseData);
    } catch (error) {
      this.emit('error', { source: 'loadCaseData', error });
    }
  },

  // ── Selection Mutators ─────────────────────────────────────────

  /**
   * 设置选中的应用
   * @param {Object} app - 应用对象
   */
  selectApp(app) {
    this._set('selectedApp', app, 'app-changed');
  },

  /**
   * 设置选中的平台
   * @param {string} platform - 平台标识
   */
  selectPlatform(platform) {
    this._set('selectedPlatform', platform, 'platform-changed');
  },
};

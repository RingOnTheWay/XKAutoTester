/**
 * Model Mixin - 目录与文件、引用数据加载
 * 提供 load / selectDirectory / scanTestFiles / batchCheckJsonExists /
 *   loadApps / loadBleDevices / loadMarkers 方法
 * 通过 Object.assign 挂载到 TestCaseModel.prototype
 */
export const modelDirectoryMixin = {
  // ── Initialization ─────────────────────────────────────────────

  /**
   * 加载初始数据（apps, bleDevices, markers）
   */
  async load() {
    await Promise.all([
      this.loadApps(),
      this.loadBleDevices(),
      this.loadMarkers(),
    ]);
  },

  // ── Directory & Files ──────────────────────────────────────────

  /**
   * 打开目录选择器，设置 selectedDirectory 并扫描文件
   */
  async selectDirectory() {
    try {
      const result = await this._api.selectDirectory();
      if (result && !result.canceled && result.filePaths.length > 0) {
        this._set('selectedDirectory', result.filePaths[0], 'directory-changed');
        await this.scanTestFiles(result.filePaths[0]);
      }
    } catch (error) {
      this.emit('error', { source: 'selectDirectory', error });
    }
  },

  /**
   * 扫描目录中的测试文件
   * @param {string} directory - 目录路径
   */
  async scanTestFiles(directory) {
    if (!directory) return;
    try {
      const files = await this._api.scanTestFiles(directory);
      this._set('testFiles', files || [], 'files-changed');
      this._set('searchQuery', '');
      if (this._state.searchDebounceTimer) {
        clearTimeout(this._state.searchDebounceTimer);
        this._set('searchDebounceTimer', null);
      }
      await this.batchCheckJsonExists(
        (files || []).map(f => f.name.replace(/\.[^/.]+$/, ''))
      );
    } catch (error) {
      this.emit('error', { source: 'scanTestFiles', error });
    }
  },

  /**
   * 批量检查 .py 文件是否有对应的 .json
   * @param {string[]} fileNames - 不含扩展名的文件名列表
   */
  async batchCheckJsonExists(fileNames) {
    if (!fileNames || fileNames.length === 0) {
      this._set('jsonExistsMap', {}, 'json-exists-changed');
      this.emit('files-changed'); // 重新渲染文件列表
      return;
    }
    try {
      const result = await this._api.batchCheckJsonExists(fileNames);
      // invokeWithCheck 已保证失败时抛错，此处只需校验业务字段 data
      this._set('jsonExistsMap', result.data || {}, 'json-exists-changed');
      this.emit('files-changed'); // jsonExistsMap 更新后重新渲染文件列表
    } catch (error) {
      this._set('jsonExistsMap', {}, 'json-exists-changed');
      this.emit('files-changed');
      this.emit('error', { source: 'batchCheckJsonExists', error });
    }
  },

  // ── Reference Data Loaders ─────────────────────────────────────

  /**
   * 加载应用列表
   */
  async loadApps() {
    try {
      const result = await this._api.getApps();
      // invokeWithCheck 已保证失败时抛错，走到这里即成功
      this._set('apps', result.data || [], 'apps-changed');
    } catch (error) {
      this.emit('error', { source: 'loadApps', error });
    }
  },

  /**
   * 加载蓝牙设备列表
   */
  async loadBleDevices() {
    try {
      const result = await this._api.getBleDevices();
      // invokeWithCheck 已保证失败时抛错，走到这里即成功
      this._set('bleDevices', result.data || [], 'ble-devices-changed');
    } catch (error) {
      this.emit('error', { source: 'loadBleDevices', error });
    }
  },

  /**
   * 加载 pytest markers 列表
   */
  async loadMarkers() {
    try {
      const markers = await this._api.getPytestMarkers();
      this._set('markers', markers || [], 'markers-list-changed');
    } catch (error) {
      this._set('markers', [], 'markers-list-changed');
      this.emit('error', { source: 'loadMarkers', error });
    }
  },
};

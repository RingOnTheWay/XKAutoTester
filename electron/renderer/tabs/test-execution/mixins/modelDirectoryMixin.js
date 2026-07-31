// modelDirectoryMixin for TestExecutionModel
// Extracted from model.js during refactor
// Provides: 目录选择 + 测试文件扫描 + 目录状态更新

export const modelDirectoryMixin = {
  // ─── 目录与文件 ─────────────────────────────────────────────────

  async selectDirectory() {
    try {
      const result = await this._api.selectDirectory();
      if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
        return null;
      }
      const path = result.filePaths[0];
      const displayName = path.split(/[/\\]/).pop() || path;
      this.updateSelectedDirectory(path, displayName);
      return path;
    } catch (error) {
      this.emit('error', { source: 'selectDirectory', error });
      return null;
    }
  },

  async scanTestFiles() {
    if (!this._state.selectedDirectory) return [];
    try {
      // wrapper 已处理 IPC 失败,错误由外层 catch 接
      const result = await this._api.scanTestFiles(this._state.selectedDirectory);
      const files = result.files || result || [];
      // 仅在无选中计划时更新 selectedTestFiles，避免弹窗中的扫描覆盖计划文件列表
      if (!this._state.currentTestPlan) {
        this._set('selectedTestFiles', files, 'test-files-scanned');
      }
      return files;
    } catch (error) {
      this.emit('error', { source: 'scanTestFiles', error });
      return [];
    }
  },

  updateSelectedDirectory(path, displayName) {
    this._set('selectedDirectory', path, 'selectedDirectory-changed');
    this._set('selectedDirectoryDisplayName', displayName, 'selectedDirectoryDisplayName-changed');
  },
};

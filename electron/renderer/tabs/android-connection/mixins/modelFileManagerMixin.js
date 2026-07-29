// File Manager Mixin for AndroidConnectionModel
// Extracted from model.js during refactor
// Provides: file list loading, path navigation, file selection, file operations (delete/rename)

export const modelFileManagerMixin = {
  // ── 文件管理 ───────────────────────────────────────────────────

  async loadFileList() {
    if (!this._state.selectedDevice) return;

    this.emit('file-list-loading');
    try {
      const cmd = `ls -la ${this._state.currentPath}`;
      // wrapper 失败已抛错进 catch,走到这里即成功
      const result = await this.executeAdbCommand(cmd, this._state.selectedDevice);

      const fileList = this.constructor.parseAdbFileList(result.output, this._state.currentPath);
      this._set('fileList', fileList, 'file-list-loaded');
      this._set('selectedFiles', [], 'selectedFiles-changed');
    } catch (error) {
      this.emit('error', { source: 'loadFileList', error });
      this.emit('file-list-error', error.message);
    }
  },

  async navigateToPath(path) {
    if (path === this._state.currentPath) return;
    this._set('currentPath', path, 'currentPath-changed');
    this._set('selectedFiles', [], 'selectedFiles-changed');
    await this.loadFileList();
  },

  async navigateToDirectory(path) {
    this._set('currentPath', path, 'currentPath-changed');
    this._set('selectedFiles', [], 'selectedFiles-changed');
    await this.loadFileList();
  },

  async navigateBack() {
    if (this._state.currentPath === '/storage/emulated/0') return;
    const pathParts = this._state.currentPath.split('/');
    pathParts.pop();
    const parentPath = pathParts.join('/') || '/';
    await this.navigateToDirectory(parentPath);
  },

  // ── 文件选择 ───────────────────────────────────────────────────

  addSelectedFile(file) {
    if (!this._state.selectedFiles.some(f => f.path === file.path)) {
      this._state.selectedFiles = [...this._state.selectedFiles, file];
      this.emit('selectedFiles-changed', this._state.selectedFiles);
    }
  },

  removeSelectedFile(file) {
    this._state.selectedFiles = this._state.selectedFiles.filter(f => f.path !== file.path);
    this.emit('selectedFiles-changed', this._state.selectedFiles);
  },

  toggleSelectAll(checked) {
    if (checked) {
      this._state.selectedFiles = [...this._state.fileList];
    } else {
      this._state.selectedFiles = [];
    }
    this.emit('selectedFiles-changed', this._state.selectedFiles);
  },

  setContextMenuTarget(file) {
    this._state.contextMenuTarget = file;
  },

  // ── 文件操作 ───────────────────────────────────────────────────

  async deleteFile(file) {
    try {
      const cmd = file.isDirectory ? `rm -rf "${file.path}"` : `rm "${file.path}"`;
      const result = await this.executeAdbCommand(cmd, this._state.selectedDevice);
      return result;
    } catch (error) {
      this.emit('error', { source: 'deleteFile', error });
      return { success: false, error: error.message };
    }
  },

  async deleteSelectedFiles() {
    if (this._state.selectedFiles.length === 0) return;
    const results = [];
    for (const file of this._state.selectedFiles) {
      const result = await this.deleteFile(file);
      results.push({ file, result });
    }
    this._set('selectedFiles', [], 'selectedFiles-changed');
    await this.loadFileList();
    return results;
  },

  async renameFile(file, newName) {
    if (!newName || newName === file.name) return { success: false, error: window.i18n.t('fileManager.invalidNewName') };
    try {
      const newPath = `${this._state.currentPath}/${newName}`;
      // wrapper 失败已抛错进 catch,走到这里即成功
      const result = await this.executeAdbCommand(`mv "${file.path}" "${newPath}"`, this._state.selectedDevice);
      await this.loadFileList();
      return result;
    } catch (error) {
      this.emit('error', { source: 'renameFile', error });
      return { success: false, error: error.message };
    }
  },
};

/**
 * Model Mixin - 文件选择与编辑器状态
 * 提供 selectFile / deselectFile / showEditor / cancelEdit 方法
 * 通过 Object.assign 挂载到 TestCaseModel.prototype
 */
export const modelFileMixin = {
  // ── File Selection ─────────────────────────────────────────────

  /**
   * 选中文件，设置 selectedFile
   * @param {Object} file - 文件对象 { name, path, ... }
   */
  selectFile(file) {
    this._set('selectedFile', file, 'selected-file-changed');
    this._set('hasUnsavedChanges', false, 'dirty-changed');
    // 选中文件后自动进入编辑模式
    this.showEditor(file);
  },

  /**
   * 取消选中文件，重置编辑器状态
   */
  deselectFile() {
    this._set('selectedFile', null, 'selected-file-changed');
    this._set('loadedDeviceConfig', null);
    this._set('loadedBleDevice', null);
    this._set('hasUnsavedChanges', false, 'dirty-changed');
  },

  // ── Editor State ───────────────────────────────────────────────

  /**
   * 进入编辑模式，可选加载已有用例数据
   * @param {Object|null} file - 文件对象，null 表示新建
   */
  async showEditor(file = null) {
    if (file) {
      const fileName = typeof file.name === 'string' ? file.name.replace(/\.[^/.]+$/, '') : file.name;
      try {
        const jsonCheck = await this._api.checkJsonExists(fileName);
        if (!jsonCheck.exists) {
          this._set('isEditing', false, 'editing-changed');
          this.resetEditor();
          this.emit('show-editor', { file, isNew: false, jsonMissing: true, fileName });
          return;
        }
        this._set('isEditing', true, 'editing-changed');
        this.emit('show-editor', { file, isNew: false, jsonMissing: false, fileName });
        await this.loadCaseData(fileName);
      } catch (error) {
        this.emit('error', { source: 'showEditor', error });
      }
    } else {
      // 新建模式
      this._set('isEditing', false, 'editing-changed');
      this.resetEditor();
      this.emit('show-editor', { file: null, isNew: true, jsonMissing: false, fileName: '' });
    }
  },

  /**
   * 取消编辑，重置编辑状态
   */
  cancelEdit() {
    this.resetEditor();
    this._set('selectedFile', null, 'selected-file-changed');
    this._set('isEditing', false, 'editing-changed');
    this._set('hasUnsavedChanges', false, 'dirty-changed');
    this._set('loadedDeviceConfig', null);
    this._set('loadedBleDevice', null);
    this.emit('cancel-edit');
  },
};

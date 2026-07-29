// Binding Mixin for AndroidConnectionView
// Extracted from view.js during refactor
// Provides: BLE port input, event bindings (select-all, global click, context-menu, rename, nav-tabs),
//   getters/setters for edit-device-id form, file checkboxes, rename input, confirm dialog

export const bindingMixin = {
  // ─── 事件绑定辅助（Controller → View 迁移） ─────────────────────

  /**
   * 设置蓝牙端口输入框的值
   * @param {string} portId - 端口 ID
   */
  setBlePortInput(portId) {
    const { editBlePortInput } = this.els;
    if (editBlePortInput && portId) {
      editBlePortInput.value = portId;
    }
  },

  /**
   * 绑定 BLE 端口输入校验
   * @returns {Function} unbind 函数
   */
  bindBlePortValidation() {
    const { editBlePortInput } = this.els;
    if (!editBlePortInput) return () => {};
    const validate = () => {
      const val = editBlePortInput.value.trim();
      if (val && !/^COM\d+$/i.test(val)) {
        editBlePortInput.style.borderColor = 'var(--error)';
      } else {
        editBlePortInput.style.borderColor = '';
      }
    };
    editBlePortInput.addEventListener('input', validate);
    editBlePortInput.addEventListener('blur', validate);
    return () => {
      editBlePortInput.removeEventListener('input', validate);
      editBlePortInput.removeEventListener('blur', validate);
    };
  },

  /**
   * 绑定全选复选框 change 事件
   * @param {Function} handler - (checked) => void
   * @returns {Function} unbind 函数
   */
  bindSelectAllChange(handler) {
    const { selectAll } = this.els;
    if (!selectAll) return () => {};
    const listener = (e) => handler(e.target.checked);
    selectAll.addEventListener('change', listener);
    return () => selectAll.removeEventListener('change', listener);
  },

  /**
   * 绑定全局点击事件：处理右键菜单/省略号下拉的外部点击关闭
   * @param {Object} handlers - { onOutsideContextMenu, onOutsideEllipsis }
   * @returns {Function} unbind 函数
   */
  bindGlobalClickForDropdowns({ onOutsideContextMenu, onOutsideEllipsis } = {}) {
    const handler = (e) => {
      const { contextMenu, ellipsisDropdown } = this.els;
      if (onOutsideContextMenu && contextMenu && !contextMenu.contains(e.target)) {
        onOutsideContextMenu();
      }
      if (onOutsideEllipsis && ellipsisDropdown && !ellipsisDropdown.contains(e.target) && e.target.id !== 'unique-ellipsis') {
        onOutsideEllipsis();
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  },

  /**
   * 隐藏省略号下拉菜单
   */
  hideEllipsisDropdown() {
    const { ellipsisDropdown } = this.els;
    if (ellipsisDropdown) ellipsisDropdown.classList.remove('show');
  },

  /**
   * 绑定右键菜单 action 点击
   * @param {Function} handler - (action: string) => void
   * @returns {Function} unbind 函数
   */
  bindContextMenuActionClick(handler) {
    const { contextMenu } = this.els;
    if (!contextMenu) return () => {};
    const listener = (e) => {
      const actionEl = e.target.closest('[data-action]');
      if (actionEl) {
        handler(actionEl.dataset.action);
      }
    };
    contextMenu.addEventListener('click', listener);
    return () => contextMenu.removeEventListener('click', listener);
  },

  /**
   * 绑定重命名表单 submit 事件
   * @param {Function} handler - submit 处理函数
   * @returns {Function} unbind 函数
   */
  bindRenameFormSubmit(handler) {
    const { renameModalForm } = this.els;
    if (!renameModalForm) return () => {};
    const submitHandler = (e) => {
      e.preventDefault();
      handler();
    };
    renameModalForm.addEventListener('submit', submitHandler);
    return () => renameModalForm.removeEventListener('submit', submitHandler);
  },

  /**
   * 绑定导航 Tab 点击事件
   * @param {Function} handler - (tabName: string) => void
   * @returns {Function} unbind 函数
   */
  bindNavTabsClick(handler) {
    const tabs = document.querySelectorAll('.nav-tab');
    const unbinds = [];
    tabs.forEach(tab => {
      const listener = () => handler(tab.dataset.tab);
      tab.addEventListener('click', listener);
      unbinds.push(() => tab.removeEventListener('click', listener));
    });
    return () => unbinds.forEach(fn => fn());
  },

  /**
   * 获取当前选中的设备 ID
   * @returns {string|null}
   */
  getSelectedDeviceId() {
    const selected = document.querySelector('.device-item.selected');
    return selected?.getAttribute('data-device-id') || null;
  },

  /**
   * 获取设备模态框的 modal-container（用作 Toast 容器）
   * @returns {Element|null}
   */
  getDeviceModalContainer() {
    return document.querySelector('#device-modal-overlay .modal-container');
  },

  /**
   * 设置编辑设备 ID 输入框的值
   * @param {string} deviceId
   */
  setEditDeviceIdInput(deviceId) {
    const { editDeviceIdInput } = this.els;
    if (editDeviceIdInput) editDeviceIdInput.value = deviceId;
  },

  /**
   * 设置 Android 版本输入框的值
   * @param {string} version
   */
  setEditAndroidVersionInput(version) {
    const { editAndroidVersionInput } = this.els;
    if (editAndroidVersionInput && version) {
      editAndroidVersionInput.value = version;
    }
  },

  /**
   * 获取编辑设备 ID 弹窗的全部表单数据
   * @returns {{deviceName:string, platformVersion:string, blePort:string}}
   */
  getEditDeviceIdFormData() {
    const { editDeviceIdInput, editAndroidVersionInput, editBlePortInput } = this.els;
    return {
      deviceName: editDeviceIdInput?.value?.trim() || '',
      platformVersion: editAndroidVersionInput?.value?.trim() || '',
      blePort: editBlePortInput?.value?.trim() || '',
    };
  },

  /**
   * 获取当前选中的端口 ID
   * @returns {string|null}
   */
  getSelectedPortId() {
    const { portList } = this.els;
    if (!portList) return null;
    const selected = portList.querySelector('.device-item.selected');
    return selected?.getAttribute('data-port-id') || null;
  },

  /**
   * 批量设置所有文件复选框的选中状态
   * @param {boolean} checked
   */
  setAllFileCheckboxes(checked) {
    document.querySelectorAll('.file-checkbox').forEach(cb => {
      cb.checked = checked;
    });
  },

  /**
   * 获取重命名输入框的值
   * @returns {string}
   */
  getRenameInputValue() {
    const { renameInput } = this.els;
    return renameInput?.value?.trim() || '';
  },

  /**
   * 显示通用确认弹窗，返回 Promise<boolean>
   * @param {string} title - 标题
   * @param {string} message - 消息
   * @returns {Promise<boolean>} 用户是否确认
   */
  showConfirmDialog(title, message) {
    return new Promise((resolve) => {
      const titleElement = document.getElementById('confirm-modal-title');
      const messageElement = document.getElementById('confirm-modal-message');

      if (titleElement) titleElement.textContent = title;
      if (messageElement) messageElement.textContent = message;

      // 重置确认按钮状态
      const confirmBtn = document.getElementById('confirm-modal-confirm-btn');
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.classList.remove('loading');
        // 清除旧的 originalText，使用当前语言重新翻译
        delete confirmBtn.dataset.originalText;
        const i18nKey = confirmBtn.getAttribute('data-i18n');
        confirmBtn.innerHTML = i18nKey ? window.i18n.t(i18nKey) || confirmBtn.textContent : confirmBtn.textContent;
      }

      window.__XKAT_CONFIRM_CALLBACK__ = () => {
        window.__XKAT_CONFIRM_CALLBACK__ = null;
        resolve(true);
      };

      // 绑定一次性确认按钮点击（确保 callback 在 close 前被调用）
      const handleConfirmClick = () => {
        resolve(true);
      };
      if (confirmBtn) confirmBtn.addEventListener('click', handleConfirmClick, { once: true });

      // 取消按钮 → reject
      const cancelBtn = document.getElementById('confirm-modal-cancel-btn');
      const handleCancelClick = (e) => {
        e.stopPropagation();
        if (confirmBtn) confirmBtn.removeEventListener('click', handleConfirmClick);
        window.__XKAT_CONFIRM_CALLBACK__ = null;
        resolve(false);
      };
      if (cancelBtn) cancelBtn.addEventListener('click', handleCancelClick, { once: true });

      const confirmModal = window.__XKAT_MODALS__?.confirm;
      if (confirmModal) {
        confirmModal.open();
      } else {
        // 降级处理
        const ok = window.confirm(message);
        resolve(ok);
      }
    });
  },
};

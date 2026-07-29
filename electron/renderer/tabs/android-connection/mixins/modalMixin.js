// Modal Mixin for AndroidConnectionView
// Extracted from view.js during refactor
// Provides: open/close helpers for device, edit-device-id, port, control-params, rename modals

export const modalMixin = {
  // ─── 弹窗控制 ──────────────────────────────────────────────────

  openDeviceModal() {
    window.__XKAT_MODALS__?.device?.open();
  },

  closeDeviceModal() {
    window.__XKAT_MODALS__?.device?.close();
  },

  openEditDeviceIdModal(data) {
    const { editDeviceIdInput, editAndroidVersionInput, editBlePortInput,
            bleMockPortGroup, editPortManageBtn } = this.els;

    if (editDeviceIdInput) editDeviceIdInput.value = data.deviceName || '';
    if (editAndroidVersionInput) editAndroidVersionInput.value = data.platformVersion || '';
    if (editBlePortInput) editBlePortInput.value = data.blePort || '';

    // 根据是否有蓝牙步骤显示/隐藏蓝牙端口相关元素
    if (bleMockPortGroup) bleMockPortGroup.style.display = data.hasBleSteps ? 'block' : 'none';
    if (editPortManageBtn) editPortManageBtn.style.display = data.hasBleSteps ? 'inline-flex' : 'none';

    window.__XKAT_MODALS__?.editDeviceId?.open();
  },

  closeEditDeviceIdModal() {
    window.__XKAT_MODALS__?.editDeviceId?.close();
  },

  openPortModal() {
    window.__XKAT_MODALS__?.port?.open();
  },

  closePortModal() {
    window.__XKAT_MODALS__?.port?.close();
  },

  openControlParamsModal() {
    // 初始化 custom-select 组件
    if (window.__XKAT_APP__?.initializeCustomSelects) {
      window.__XKAT_APP__.initializeCustomSelects();
    }
    window.__XKAT_MODALS__?.controlParams?.open();
  },

  closeControlParamsModal() {
    window.__XKAT_MODALS__?.controlParams?.close();
  },

  openRenameModal(fileName) {
    const { renameInput } = this.els;
    if (renameInput) {
      renameInput.value = fileName;
      renameInput.focus();
      renameInput.select();
    }
    window.__XKAT_MODALS__?.rename?.open();
  },

  closeRenameModal() {
    window.__XKAT_MODALS__?.rename?.close();
  },
};

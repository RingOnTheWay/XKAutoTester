/**
 * DeviceModalNetworkMixin - DeviceSelectionModal IP 连接新增设备与 5555 端口开放。
 *
 * Extracted from device-selection-modal.js via Object.assign prototype composition.
 * NOTE: original private methods (#xxx) were converted to public so they can be
 * assigned to the prototype. Original private fields (#xxx) remain private in the
 * class body; accessors (get/set) are added for cross-mixin read/write.
 */
import { Toast } from '../toast.js';

export const deviceModalNetworkMixin = {
  // ==================== 新增设备（IP连接） ====================

  showAddDeviceInput() {
    // 取消当前选中
    document.querySelectorAll('.device-item.selected').forEach((item) => {
      item.classList.remove('selected');
      item.style.backgroundColor = '';
    });
    this.modalSelectedDeviceId = null;

    // 禁用按钮
    if (this.confirmBtn) this.confirmBtn.disabled = true;
    if (this.openPortBtn) this.openPortBtn.disabled = true;

    // 隐藏设备信息卡片
    const deviceStatusCard = document.getElementById('modal-device-status-card');
    if (deviceStatusCard) deviceStatusCard.classList.add('hidden');

    const deviceListElement = document.getElementById('device-list');
    const addDeviceInputContainer = document.getElementById('add-device-input-container');

    if (deviceListElement) deviceListElement.classList.add('hidden');
    if (addDeviceInputContainer) addDeviceInputContainer.classList.remove('hidden');

    // 绑定输入框按钮事件
    const addDeviceCancelBtn = document.getElementById('add-device-cancel-btn');
    if (addDeviceCancelBtn) {
      const newCancel = addDeviceCancelBtn.cloneNode(true);
      addDeviceCancelBtn.parentNode.replaceChild(newCancel, addDeviceCancelBtn);
      newCancel.addEventListener('click', () => this.hideAddDeviceInput());
    }

    const addDeviceConfirmBtn = document.getElementById('add-device-confirm-btn');
    if (addDeviceConfirmBtn) {
      const newConfirm = addDeviceConfirmBtn.cloneNode(true);
      addDeviceConfirmBtn.parentNode.replaceChild(newConfirm, addDeviceConfirmBtn);
      newConfirm.addEventListener('click', () => this.addDeviceByIp());
    }

    const addDeviceInput = document.getElementById('add-device-input');
    if (addDeviceInput) {
      const newInput = addDeviceInput.cloneNode(true);
      addDeviceInput.parentNode.replaceChild(newInput, addDeviceInput);
      newInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') this.addDeviceByIp();
      });
    }
  },

  hideAddDeviceInput() {
    const deviceListElement = document.getElementById('device-list');
    const addDeviceInputContainer = document.getElementById('add-device-input-container');
    const addDeviceInput = document.getElementById('add-device-input');
    const addDeviceResult = document.getElementById('add-device-result');

    if (deviceListElement) deviceListElement.classList.remove('hidden');
    if (addDeviceInputContainer) addDeviceInputContainer.classList.add('hidden');
    if (addDeviceInput) addDeviceInput.value = '';
    if (addDeviceResult) addDeviceResult.classList.add('hidden');

    // 恢复设备信息卡片状态
    const selectedDevice = document.querySelector('.device-item.selected');
    const deviceStatusCard = document.getElementById('modal-device-status-card');
    if (selectedDevice && deviceStatusCard) {
      deviceStatusCard.classList.remove('hidden');
    } else if (deviceStatusCard) {
      deviceStatusCard.classList.add('hidden');
    }
  },

  async addDeviceByIp() {
    const addDeviceInput = document.getElementById('add-device-input');
    const addDeviceResult = document.getElementById('add-device-result');

    if (!addDeviceInput || !addDeviceResult) return;

    const input = addDeviceInput.value.trim();
    if (!input) {
      this.showAddDeviceResult(window.i18n.t('deviceModal.enterIp'), 'error');
      return;
    }

    // 校验IP格式
    let ipAddress,
      port = 5555;
    if (input.includes(':')) {
      const parts = input.split(':');
      ipAddress = parts[0];
      port = parseInt(parts[1]);
      if (isNaN(port)) {
        this.showAddDeviceResult(window.i18n.t('deviceModal.portFormatError'), 'error');
        return;
      }
    } else {
      ipAddress = input;
    }

    const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    if (!ipRegex.test(ipAddress)) {
      this.showAddDeviceResult(window.i18n.t('deviceModal.ipFormatError'), 'error');
      return;
    }

    // 执行 adb connect
    try {
      this.showAddDeviceResult(window.i18n.t('deviceModal.connecting'), 'info');
      const deviceAddress = `${ipAddress}:${port}`;
      // wrapper 已在 success=false 时抛错，失败时由 catch 接
      await window.electronAPI.executeAdbCommand(`connect ${deviceAddress}`);

      this.showAddDeviceResult(`${window.i18n.t('deviceModal.connectSuccess')}: ${deviceAddress}`, 'success');
      // 延迟返回设备列表并自动选中新设备
      setTimeout(() => {
        this.hideAddDeviceInput();
        this.selectDeviceInList(deviceAddress);
      }, 1000);
    } catch (error) {
      this.showAddDeviceResult(`${window.i18n.t('deviceModal.connectFailed')}: ${error.message}`, 'error');
    }
  },

  showAddDeviceResult(message, type) {
    const addDeviceResult = document.getElementById('add-device-result');
    if (!addDeviceResult) return;

    addDeviceResult.textContent = message;
    addDeviceResult.classList.remove('hidden', 'error', 'success', 'info');
    addDeviceResult.style.backgroundColor = '';
    addDeviceResult.style.color = '';
    addDeviceResult.style.border = '';

    if (type) addDeviceResult.classList.add(type);
    addDeviceResult.classList.remove('hidden');
  },

  selectDeviceInList(deviceAddress) {
    const deviceElement = document.querySelector(`.device-item[data-device-id="${deviceAddress}"]`);
    if (deviceElement) {
      deviceElement.click();
    }
  },

  // ==================== 开放5555端口 ====================

  async openPort5555() {
    const modalContainer = document.querySelector('#device-modal-overlay .modal-container');
    const selectedDeviceElement = document.querySelector('.device-item.selected');
    if (!selectedDeviceElement) {
      Toast.error(window.i18n.t('deviceModal.selectUsbDevice'), {
        container: modalContainer,
      });
      return;
    }

    const deviceId = selectedDeviceElement.getAttribute('data-device-id');
    if (!deviceId || deviceId.includes(':')) {
      Toast.error(window.i18n.t('deviceModal.selectUsbDevice'), {
        container: modalContainer,
      });
      return;
    }

    try {
      Toast.info(window.i18n.t('deviceModal.openingPort'), {
        container: modalContainer,
      });
      // wrapper 已在 success=false 时抛错，失败时由 catch 接
      await window.electronAPI.executeAdbCommand('tcpip 5555', deviceId);

      Toast.success(window.i18n.t('deviceModal.portOpenSuccess'), {
        container: modalContainer,
      });
    } catch (error) {
      Toast.error(`${window.i18n.t('deviceModal.portOpenFailed')}: ${error.message}`, { container: modalContainer });
    }
  },
};

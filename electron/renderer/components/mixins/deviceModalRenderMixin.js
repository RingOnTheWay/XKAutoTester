/**
 * DeviceModalRenderMixin - DeviceSelectionModal 设备列表 DOM 渲染。
 *
 * Extracted from device-selection-modal.js via Object.assign prototype composition.
 * NOTE: original private methods (#xxx) were converted to public so they can be
 * assigned to the prototype. Original private fields (#xxx) remain private in the
 * class body; accessors (get/set) are added for cross-mixin read/write.
 */

// R15: 转义 deviceId（与 R10 android-connection/view.js 同类防线）

import { escapeHtml } from '../../core/utils/html.js';

export const deviceModalRenderMixin = {
  // ==================== 设备列表渲染 ====================

  showDeviceScanningState() {
    const scanningElement = document.getElementById('device-scanning');
    const deviceListElement = document.getElementById('device-list');
    const noDevicesElement = document.getElementById('no-devices');
    const addDeviceInputContainer = document.getElementById('add-device-input-container');
    const deviceStatusCard = document.getElementById('modal-device-status-card');

    if (scanningElement) scanningElement.classList.remove('hidden');
    if (deviceListElement) deviceListElement.classList.add('hidden');
    if (noDevicesElement) noDevicesElement.classList.add('hidden');
    if (addDeviceInputContainer) addDeviceInputContainer.classList.add('hidden');
    if (deviceStatusCard) deviceStatusCard.classList.add('hidden');
    if (this.confirmBtn) this.confirmBtn.disabled = true;
    if (this.openPortBtn) this.openPortBtn.disabled = true;
  },

  displayDevices(devices) {
    const scanningElement = document.getElementById('device-scanning');
    const deviceListElement = document.getElementById('device-list');
    const noDevicesElement = document.getElementById('no-devices');
    const addDeviceInputContainer = document.getElementById('add-device-input-container');
    const deviceStatusCard = document.getElementById('modal-device-status-card');

    if (scanningElement) scanningElement.classList.add('hidden');
    if (addDeviceInputContainer) addDeviceInputContainer.classList.add('hidden');
    if (deviceStatusCard) deviceStatusCard.classList.add('hidden');

    // 初始禁用按钮
    if (this.confirmBtn) this.confirmBtn.disabled = true;
    if (this.openPortBtn) this.openPortBtn.disabled = true;

    if (deviceListElement) {
      deviceListElement.classList.remove('hidden');
      deviceListElement.innerHTML = '';

      // 渲染设备项
      devices.forEach((device) => {
        const deviceElement = this.createDeviceItemElement(device);
        deviceListElement.appendChild(deviceElement);
      });

      // 新增设备按钮
      const addDeviceButton = document.createElement('div');
      addDeviceButton.id = 'add-device-btn';
      addDeviceButton.className = 'device-item add-device-btn';
      addDeviceButton.style.cssText =
        'padding:8px 12px;border-radius:4px;cursor:pointer;transition:background-color 0.2s;display:flex;align-items:center;justify-content:space-between;';
      const iconHtml = window.__XKAT_APP__?.getIconHtml?.bind(window.__XKAT_APP__);
      addDeviceButton.innerHTML = `
                <div style="display:flex;align-items:center;">
                    ${iconHtml ? iconHtml('add', 'vertical-align:middle;margin-right:8px;') : ''}
                    <span style="vertical-align:middle;">${window.i18n.t('deviceModal.addDevice')}</span>
                </div>
                ${iconHtml ? iconHtml('keyboard_arrow_right', 'vertical-align:middle;') : ''}
            `;
      addDeviceButton.addEventListener('mouseenter', () => {
        addDeviceButton.style.backgroundColor = 'rgba(0,0,0,0.05)';
      });
      addDeviceButton.addEventListener('mouseleave', () => {
        addDeviceButton.style.backgroundColor = '';
      });
      addDeviceButton.addEventListener('click', () => {
        this.showAddDeviceInput();
      });
      deviceListElement.appendChild(addDeviceButton);

      // 恢复选中状态
      if (this.modalSelectedDeviceId) {
        const deviceToSelect = deviceListElement.querySelector(
          `.device-item[data-device-id="${this.modalSelectedDeviceId}"]`
        );
        if (deviceToSelect) {
          deviceToSelect.classList.add('selected');
          const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();
          deviceToSelect.style.backgroundColor = `${primaryColor}20`;
          if (this.confirmBtn) this.confirmBtn.disabled = false;
          if (this.openPortBtn) {
            this.openPortBtn.disabled = this.modalSelectedDeviceId.includes(':');
          }
          if (deviceStatusCard) deviceStatusCard.classList.remove('hidden');
          this.getDeviceInfo(this.modalSelectedDeviceId);
        }
      }
    }

    if (noDevicesElement) noDevicesElement.classList.add('hidden');
    this.currentDeviceList = [...devices];
  },

  createDeviceItemElement(device) {
    // device 形态：{id, status}；兼容旧字符串调用
    const deviceId = typeof device === 'string' ? device : device.id;

    const deviceElement = document.createElement('div');
    deviceElement.className = 'device-item';
    deviceElement.setAttribute('data-device-id', deviceId);
    deviceElement.style.cssText =
      'padding:8px 12px;border-radius:4px;cursor:pointer;transition:background-color 0.2s;display:flex;align-items:flex-start;';

    const icon = deviceId.includes(':') ? 'wifi' : 'usb';
    const iconHtml = window.__XKAT_APP__?.getIconHtml?.bind(window.__XKAT_APP__);

    deviceElement.innerHTML = `
            ${iconHtml ? iconHtml(icon, 'vertical-align:top;margin-right:8px;flex-shrink:0;margin-top:2px;') : ''}
            <span style="vertical-align:top;flex:1;min-width:0;word-wrap:break-word;overflow-wrap:break-word;white-space:normal;">${escapeHtml(deviceId)}</span>
        `;

    // 悬停效果
    deviceElement.addEventListener('mouseenter', () => {
      if (!deviceElement.classList.contains('selected')) {
        deviceElement.style.backgroundColor = 'rgba(0,0,0,0.05)';
      }
    });
    deviceElement.addEventListener('mouseleave', () => {
      if (!deviceElement.classList.contains('selected')) {
        deviceElement.style.backgroundColor = '';
      }
    });

    // 点击选中
    deviceElement.addEventListener('click', () => {
      // 取消其他选中
      document.querySelectorAll('.device-item.selected').forEach((item) => {
        item.classList.remove('selected');
        item.style.backgroundColor = '';
      });

      deviceElement.classList.add('selected');
      this.modalSelectedDeviceId = deviceId;
      const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();
      deviceElement.style.backgroundColor = `${primaryColor}20`;

      // 启用按钮
      if (this.confirmBtn) this.confirmBtn.disabled = false;
      if (this.openPortBtn) {
        this.openPortBtn.disabled = deviceId.includes(':');
      }

      // 显示设备信息卡片
      const deviceStatusCard = document.getElementById('modal-device-status-card');
      if (deviceStatusCard) deviceStatusCard.classList.remove('hidden');

      this.getDeviceInfo(deviceId);
    });

    // 恢复选中状态
    if (this.modalSelectedDeviceId === deviceId) {
      deviceElement.classList.add('selected');
      const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();
      deviceElement.style.backgroundColor = `${primaryColor}20`;
    }

    return deviceElement;
  },
};

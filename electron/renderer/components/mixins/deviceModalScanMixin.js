/**
 * DeviceModalScanMixin - DeviceSelectionModal 设备扫描与定时刷新。
 *
 * Extracted from device-selection-modal.js via Object.assign prototype composition.
 * NOTE: original private methods (#xxx) were converted to public so they can be
 * assigned to the prototype. Original private fields (#xxx) remain private in the
 * class body; accessors (get/set) are added for cross-mixin read/write.
 */

export const deviceModalScanMixin = {
  // ==================== 设备扫描与刷新 ====================

  async scanDevices() {
    try {
      const devices = await this.getConnectedDevices();
      this.displayDevices(devices);
    } catch (error) {
      console.error('扫描设备失败:', error);
      this.displayDevices([]);
    }
  },

  async getConnectedDevices() {
    try {
      if (window.electronAPI && window.electronAPI.getConnectedDevices) {
        return await window.electronAPI.getConnectedDevices();
      }
    } catch (error) {
      console.error('获取设备列表失败:', error);
    }
    return [];
  },

  startDeviceRefresh() {
    this.stopDeviceRefresh();
    this.deviceRefreshTimer = setInterval(() => {
      this.refreshDeviceList();
    }, 2000);
  },

  stopDeviceRefresh() {
    if (this.deviceRefreshTimer) {
      clearInterval(this.deviceRefreshTimer);
      this.deviceRefreshTimer = null;
    }
  },

  async refreshDeviceList() {
    if (this.isDeviceRefreshing) return;
    this.isDeviceRefreshing = true;

    try {
      const newDevices = await this.getConnectedDevices();
      // 设备对象为 {id, status}，按 id 比较增减
      const oldIdSet = new Set(this.currentDeviceList.map((d) => d.id));
      const newIdSet = new Set(newDevices.map((d) => d.id));

      const added = newDevices.filter((d) => !oldIdSet.has(d.id));
      const removedIds = this.currentDeviceList.filter((d) => !newIdSet.has(d.id)).map((d) => d.id);
      const unchanged = this.currentDeviceList.filter((d) => newIdSet.has(d.id));

      // 检测状态变化（如 unauthorized → device），原地替换 DOM
      const statusChanged = newDevices.filter((d) => {
        const old = this.currentDeviceList.find((o) => o.id === d.id);
        return old && old.status !== d.status;
      });

      if (added.length === 0 && removedIds.length === 0 && statusChanged.length === 0) {
        this.isDeviceRefreshing = false;
        return;
      }

      const orderedDevices = [...added, ...unchanged];
      this.currentDeviceList = [...orderedDevices];

      const deviceListElement = document.getElementById('device-list');
      if (!deviceListElement) {
        this.isDeviceRefreshing = false;
        return;
      }

      // 移除已断开的设备
      removedIds.forEach((deviceId) => {
        // P3-8: CSS.escape 防设备 ID 含引号时 querySelector 抛异常
        const el = deviceListElement.querySelector(`.device-item[data-device-id="${CSS.escape(deviceId)}"]`);
        if (el) el.remove();
      });

      // 状态变化的设备原地替换 DOM 元素
      statusChanged.forEach((d) => {
        const oldEl = deviceListElement.querySelector(`.device-item[data-device-id="${CSS.escape(d.id)}"]`);
        if (oldEl) {
          const newEl = this.createDeviceItemElement(d);
          oldEl.replaceWith(newEl);
        }
      });

      // 新增设备插入到列表顶部
      for (let i = added.length - 1; i >= 0; i--) {
        const deviceElement = this.createDeviceItemElement(added[i]);
        // 插入到 add-device-btn 之前
        const addBtn = deviceListElement.querySelector('#add-device-btn');
        if (addBtn) {
          deviceListElement.insertBefore(deviceElement, addBtn);
        } else {
          deviceListElement.prepend(deviceElement);
        }
      }

      // 选中设备被移除时重置状态
      if (this.modalSelectedDeviceId && removedIds.includes(this.modalSelectedDeviceId)) {
        this.modalSelectedDeviceId = null;
        if (this.confirmBtn) this.confirmBtn.disabled = true;
        if (this.openPortBtn) this.openPortBtn.disabled = true;
        const deviceStatusCard = document.getElementById('modal-device-status-card');
        if (deviceStatusCard) deviceStatusCard.classList.add('hidden');
      }
    } catch (error) {
      console.error('刷新设备列表失败:', error);
    } finally {
      this.isDeviceRefreshing = false;
    }
  },
};

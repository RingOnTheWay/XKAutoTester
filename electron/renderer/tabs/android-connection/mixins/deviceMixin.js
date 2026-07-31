// Device Mixin for AndroidConnectionView
// Extracted from view.js during refactor
// Provides: device display, device list rendering, add-device input, device info card, file manager toggle

export const deviceMixin = {
  // ─── 设备显示 ──────────────────────────────────────────────────

  updateSelectedDeviceDisplay(deviceId) {
    const { selectedDeviceName, screenControlBtn, deviceInfoCard } = this.els;
    if (!selectedDeviceName) return;

    if (deviceId) {
      // 截断设备名称
      const maxLen = 20;
      const displayName = deviceId.length <= maxLen ? deviceId : deviceId.substring(0, maxLen - 3) + '...';
      selectedDeviceName.textContent = displayName;
      selectedDeviceName.title = deviceId;
      selectedDeviceName.style.color = 'var(--text-primary)';
      screenControlBtn && (screenControlBtn.disabled = false);
      deviceInfoCard && deviceInfoCard.classList.remove('hidden');
    } else {
      selectedDeviceName.textContent = window.i18n.t('android.noDeviceSelected');
      selectedDeviceName.title = '';
      selectedDeviceName.style.color = 'var(--text-secondary)';
      screenControlBtn && (screenControlBtn.disabled = true);
      deviceInfoCard && deviceInfoCard.classList.add('hidden');
    }
  },

  showDeviceScanningState() {
    const { deviceScanning, deviceList, noDevices, addDeviceInputContainer,
            modalDeviceStatusCard, deviceModalConfirmBtn, openPortBtn } = this.els;
    deviceScanning && deviceScanning.classList.remove('hidden');
    deviceList && deviceList.classList.add('hidden');
    noDevices && noDevices.classList.add('hidden');
    addDeviceInputContainer && addDeviceInputContainer.classList.add('hidden');
    modalDeviceStatusCard && modalDeviceStatusCard.classList.add('hidden');
    deviceModalConfirmBtn && (deviceModalConfirmBtn.disabled = true);
    openPortBtn && (openPortBtn.disabled = true);
  },

  displayDevices(devices, modalSelectedDeviceId, onDeviceClick, onAddDeviceClick) {
    const { deviceScanning, deviceList, noDevices, addDeviceInputContainer,
            modalDeviceStatusCard, deviceModalConfirmBtn, openPortBtn } = this.els;

    deviceScanning && deviceScanning.classList.add('hidden');
    addDeviceInputContainer && addDeviceInputContainer.classList.add('hidden');
    modalDeviceStatusCard && modalDeviceStatusCard.classList.add('hidden');
    deviceModalConfirmBtn && (deviceModalConfirmBtn.disabled = true);
    openPortBtn && (openPortBtn.disabled = true);

    if (!deviceList) return;
    deviceList.classList.remove('hidden');
    deviceList.innerHTML = '';

    // 渲染设备项
    devices.forEach(device => {
      const el = this.createDeviceItemElement(device, modalSelectedDeviceId, onDeviceClick);
      deviceList.appendChild(el);
    });

    // 添加新增设备按钮
    const addBtn = document.createElement('div');
    addBtn.id = 'add-device-btn';
    addBtn.className = 'device-item add-device-btn';
    addBtn.style.cssText = 'padding:8px 12px;border-radius:4px;cursor:pointer;transition:background-color 0.2s;display:flex;align-items:center;justify-content:space-between;';
    addBtn.innerHTML = `
      <div style="display:flex;align-items:center;">
        ${this.getIconHtml('add', 'vertical-align:middle;margin-right:8px;')}
        <span style="vertical-align:middle;">${window.i18n.t('deviceModal.addDevice')}</span>
      </div>
      ${this.getIconHtml('keyboard_arrow_right', 'vertical-align:middle;')}
    `;
    addBtn.addEventListener('mouseenter', () => { addBtn.style.backgroundColor = 'rgba(0,0,0,0.05)'; });
    addBtn.addEventListener('mouseleave', () => { addBtn.style.backgroundColor = ''; });
    addBtn.addEventListener('click', () => onAddDeviceClick?.());
    deviceList.appendChild(addBtn);

    // 恢复选中状态
    if (modalSelectedDeviceId) {
      const selectedEl = deviceList.querySelector(`.device-item[data-device-id="${modalSelectedDeviceId}"]`);
      if (selectedEl) {
        selectedEl.classList.add('selected');
        const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();
        selectedEl.style.backgroundColor = `${primaryColor}20`;
        deviceModalConfirmBtn && (deviceModalConfirmBtn.disabled = false);
        if (openPortBtn) {
          openPortBtn.disabled = modalSelectedDeviceId.includes(':');
        }
        modalDeviceStatusCard && modalDeviceStatusCard.classList.remove('hidden');
      }
    }

    noDevices && noDevices.classList.add('hidden');
  },

  createDeviceItemElement(device, modalSelectedDeviceId, onClick) {
    // device 形态：{id, status}；兼容旧字符串调用
    const deviceId = typeof device === 'string' ? device : device.id;

    const el = document.createElement('div');
    el.className = 'device-item';
    el.setAttribute('data-device-id', deviceId);
    el.style.cssText = 'padding:8px 12px;border-radius:4px;cursor:pointer;transition:background-color 0.2s;display:flex;align-items:flex-start;';

    const icon = deviceId.includes(':') ? 'wifi' : 'usb';
    el.innerHTML = `
      ${this.getIconHtml(icon, 'vertical-align:top;margin-right:8px;flex-shrink:0;margin-top:2px;')}
      <span style="vertical-align:top;flex:1;min-width:0;word-wrap:break-word;overflow-wrap:break-word;white-space:normal;">${deviceId}</span>
    `;

    el.addEventListener('mouseenter', () => {
      if (!el.classList.contains('selected')) el.style.backgroundColor = 'rgba(0,0,0,0.05)';
    });
    el.addEventListener('mouseleave', () => {
      if (!el.classList.contains('selected')) el.style.backgroundColor = '';
    });
    el.addEventListener('click', () => onClick?.(deviceId));

    // 初始选中状态
    if (modalSelectedDeviceId === deviceId) {
      el.classList.add('selected');
      const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();
      el.style.backgroundColor = `${primaryColor}20`;
    }

    return el;
  },

  showAddDeviceInput() {
    const { deviceList, addDeviceInputContainer } = this.els;
    // 取消所有已选中设备
    document.querySelectorAll('.device-item.selected').forEach(item => {
      item.classList.remove('selected');
      item.style.backgroundColor = '';
    });
    deviceList && deviceList.classList.add('hidden');
    addDeviceInputContainer && addDeviceInputContainer.classList.remove('hidden');
  },

  hideAddDeviceInput() {
    const { deviceList, addDeviceInputContainer, addDeviceInput, addDeviceResult } = this.els;
    deviceList && deviceList.classList.remove('hidden');
    addDeviceInputContainer && addDeviceInputContainer.classList.add('hidden');
    addDeviceInput && (addDeviceInput.value = '');
    addDeviceResult && addDeviceResult.classList.add('hidden');
  },

  showAddDeviceResult(message, type) {
    const { addDeviceResult } = this.els;
    if (!addDeviceResult) return;
    addDeviceResult.textContent = message;
    addDeviceResult.classList.remove('hidden', 'error', 'success', 'info');
    addDeviceResult.style.backgroundColor = '';
    addDeviceResult.style.color = '';
    addDeviceResult.style.border = '';
    if (type) addDeviceResult.classList.add(type);
    addDeviceResult.classList.remove('hidden');
  },

  resetDeviceStatusCard(isModal = false) {
    const prefix = isModal ? 'modal-' : '';
    const ids = [
      `${prefix}device-manufacturer`,
      `${prefix}device-model`,
      `${prefix}device-android-version`,
    ];
    // 外部卡片额外重置
    if (!isModal) {
      ids.push('device-wifi', 'device-battery', 'device-storage', 'device-memory');
    }
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '-';
    });
  },

  showDeviceInfoLoading(isModal = false) {
    if (isModal) {
      this.els.modalDeviceLoading && (this.els.modalDeviceLoading.style.display = 'flex');
      this.els.modalDeviceInfoContent && (this.els.modalDeviceInfoContent.style.display = 'none');
    } else {
      this.els.deviceLoading && (this.els.deviceLoading.style.display = 'flex');
      this.els.deviceInfoContent && (this.els.deviceInfoContent.style.display = 'none');
    }
  },

  renderDeviceInfo(info, isModal = false) {
    const prefix = isModal ? 'modal-' : '';

    // 制造商
    const manufacturerEl = document.getElementById(`${prefix}device-manufacturer`);
    manufacturerEl && (manufacturerEl.textContent = info.manufacturer || '-');

    // 型号
    const modelEl = document.getElementById(`${prefix}device-model`);
    modelEl && (modelEl.textContent = info.model || '-');

    // Android 版本
    const androidVersionEl = document.getElementById(`${prefix}device-android-version`);
    androidVersionEl && (androidVersionEl.textContent = info.androidVersion || '-');

    // 外部卡片额外信息
    if (!isModal) {
      const { deviceWifi, deviceBattery, deviceStorage, deviceMemory } = this.els;
      deviceWifi && (deviceWifi.textContent = info.wifi || '-');
      deviceBattery && (deviceBattery.textContent = info.battery || '-');
      deviceStorage && (deviceStorage.textContent = info.storage || '-');
      deviceMemory && (deviceMemory.textContent = info.memory || '-');
    }

    // 切换加载/内容显示
    if (isModal) {
      this.els.modalDeviceLoading && (this.els.modalDeviceLoading.style.display = 'none');
      this.els.modalDeviceInfoContent && (this.els.modalDeviceInfoContent.style.display = 'flex');
    } else {
      this.els.deviceLoading && (this.els.deviceLoading.style.display = 'none');
      this.els.deviceInfoContent && (this.els.deviceInfoContent.style.display = 'grid');
    }
  },

  toggleFileManagerEnabled(enabled) {
    const { fileManagerActions, currentPath, fileManagerContent, fileList } = this.els;

    if (fileManagerActions) {
      if (enabled) {
        fileManagerActions.classList.remove('disabled');
        fileManagerActions.querySelectorAll('button').forEach(btn => { btn.disabled = false; });
      } else {
        fileManagerActions.classList.add('disabled');
        fileManagerActions.querySelectorAll('button').forEach(btn => { btn.disabled = true; });
      }
    }

    if (currentPath) {
      currentPath.classList.toggle('disabled', !enabled);
    }

    if (fileManagerContent) {
      fileManagerContent.classList.toggle('disabled', !enabled);
    }

    if (!enabled && fileList) {
      fileList.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;"><div style="display:flex;align-items:center;justify-content:center;gap:8px;">'
        + this.getIconHtml('info', 'vertical-align:middle;')
        + `<span style="vertical-align:middle;">${window.i18n.t('fileManager.selectDeviceFirst')}</span></div></td></tr>`;
    }
  },
};

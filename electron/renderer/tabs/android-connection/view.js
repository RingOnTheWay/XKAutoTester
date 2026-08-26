/**
 * AndroidConnectionView - 安卓连接 Tab View 层
 * 纯 DOM 操作，不调用 API，不管理状态
 * 通过 window.__XKAT_MODALS__ / window.__XKAT_APP__ / window.i18n 访问全局资源
 *
 * R10: 原 6 个 view mixin (device/modal/port/fileManager/controlParams/binding)
 *      已内联到本类，移除 Object.assign prototype 注入。方法体保持不变，
 *      this.els / this.getIconHtml 访问器行为一致。
 *      注: fileManagerMixin 原注释提到 #formatFileSize/#checkAndApplyEllipsis 因
 *      Object.assign 转公共；内联后可转回 #private，但保持公共以降低变更风险
 *      (call sites 用 this.formatFileSize/this.checkAndApplyEllipsis)。
 */
import { Icons } from '../../icons.js';
import { escapeHtml as escapeHtmlUtil } from '../../core/utils/html.js';

export class AndroidConnectionView {
  constructor() {
    this.els = {};
    this.#cacheElements();
  }

  // ─── 缓存 DOM 元素 ────────────────────────────────────────────

  #cacheElements() {
    this.els = {
      // 设备选择卡片
      selectedDeviceName: document.getElementById('selected-device-name'),
      deviceManagementBtn: document.getElementById('device-management-btn'),
      screenControlBtn: document.getElementById('screen-control-btn'),
      deviceInfoCard: document.getElementById('device-info-card'),
      deviceLoading: document.getElementById('device-loading'),
      deviceInfoContent: document.getElementById('device-info-content'),
      deviceManufacturer: document.getElementById('device-manufacturer'),
      deviceModel: document.getElementById('device-model'),
      deviceAndroidVersion: document.getElementById('device-android-version'),
      deviceWifi: document.getElementById('device-wifi'),
      deviceBattery: document.getElementById('device-battery'),
      deviceStorage: document.getElementById('device-storage'),
      deviceMemory: document.getElementById('device-memory'),

      // 设备管理弹窗
      deviceModalOverlay: document.getElementById('device-modal-overlay'),
      deviceModalCloseBtn: document.getElementById('device-modal-close-btn'),
      deviceModalCancelBtn: document.getElementById('device-modal-cancel-btn'),
      deviceModalConfirmBtn: document.getElementById('device-modal-confirm-btn'),
      deviceScanning: document.getElementById('device-scanning'),
      deviceList: document.getElementById('device-list'),
      noDevices: document.getElementById('no-devices'),
      openPortBtn: document.getElementById('open-port-btn'),
      addDeviceInputContainer: document.getElementById('add-device-input-container'),
      addDeviceInput: document.getElementById('add-device-input'),
      addDeviceConfirmBtn: document.getElementById('add-device-confirm-btn'),
      addDeviceCancelBtn: document.getElementById('add-device-cancel-btn'),
      addDeviceResult: document.getElementById('add-device-result'),
      modalDeviceStatusCard: document.getElementById('modal-device-status-card'),
      modalDeviceLoading: document.getElementById('modal-device-loading'),
      modalDeviceInfoContent: document.getElementById('modal-device-info-content'),
      modalDeviceManufacturer: document.getElementById('modal-device-manufacturer'),
      modalDeviceModel: document.getElementById('modal-device-model'),
      modalDeviceAndroidVersion: document.getElementById('modal-device-android-version'),

      // 编辑设备 ID 弹窗
      editDeviceIdModalOverlay: document.getElementById('edit-device-id-modal-overlay'),
      editDeviceIdModalCloseBtn: document.getElementById('edit-device-id-modal-close-btn'),
      editDeviceIdCancelBtn: document.getElementById('edit-device-id-cancel-btn'),
      editDeviceIdConfirmBtn: document.getElementById('edit-device-id-confirm-btn'),
      editDeviceIdInput: document.getElementById('edit-device-id-input'),
      editAndroidVersionInput: document.getElementById('edit-android-version-input'),
      editBlePortInput: document.getElementById('edit-ble-port-input'),
      editDeviceIdManageBtn: document.getElementById('edit-device-id-manage-btn'),
      bleMockPortGroup: document.getElementById('ble-mock-port-group'),
      editPortManageBtn: document.getElementById('edit-port-manage-btn'),

      // 端口管理弹窗
      portModalOverlay: document.getElementById('port-modal-overlay'),
      portModalCloseBtn: document.getElementById('port-modal-close-btn'),
      portModalCancelBtn: document.getElementById('port-modal-cancel-btn'),
      portModalConfirmBtn: document.getElementById('port-modal-confirm-btn'),
      portScanning: document.getElementById('port-scanning'),
      portList: document.getElementById('port-list'),

      // 控制参数弹窗
      controlParamsBtn: document.getElementById('control-params-btn'),
      controlParamsCloseBtn: document.getElementById('control-params-close-btn'),
      controlParamsCancelBtn: document.getElementById('control-params-cancel-btn'),
      controlParamsSaveBtn: document.getElementById('control-params-save-btn'),
      maxSize: document.getElementById('max-size'),
      videoBitRate: document.getElementById('video-bit-rate'),
      maxFps: document.getElementById('max-fps'),
      alwaysOnTop: document.getElementById('always-on-top'),
      videoCodec: document.getElementById('video-codec'),

      // 文件管理器
      currentPath: document.getElementById('current-path'),
      pathDisplay: document.getElementById('path-display'),
      backBtn: document.getElementById('back-btn'),
      refreshBtn: document.getElementById('refresh-btn'),
      deleteBtn: document.getElementById('delete-btn'),
      uploadBtn: document.getElementById('upload-btn'),
      downloadBtn: document.getElementById('download-btn'),
      installApkBtn: document.getElementById('install-apk-btn'),
      selectAll: document.getElementById('select-all'),
      fileList: document.getElementById('file-list'),
      contextMenu: document.getElementById('context-menu'),
      ellipsisDropdown: document.getElementById('ellipsis-dropdown'),
      fileManagerActions: document.querySelector('.file-manager-actions'),
      fileManagerContent: document.querySelector('.file-manager-content'),

      // 重命名弹窗
      renameInput: document.getElementById('rename-input'),
      renameModalForm: document.getElementById('rename-modal-form'),
      renameModalSaveBtn: document.getElementById('rename-modal-save-btn'),
      renameModalCancelBtn: document.getElementById('rename-modal-cancel-btn'),
      renameModalCloseBtn: document.getElementById('rename-modal-close-btn'),
    };
  }

  // ─── Icon Helper ───────────────────────────────────────────────

  getIconHtml(name, style = '') {
    if (window.__XKAT_APP__?.getIconHtml) {
      return window.__XKAT_APP__.getIconHtml(name, style);
    }
    if (!Icons[name]) return '';
    return `<span class="svg-icon" data-icon="${name}" style="${style}">${Icons[name]}</span>`;
  }

  /**
   * HTML 转义工具：转义 & < > 双引号 单引号
   * 用于插入 innerHTML 的动态值（文本内容与属性值均安全）
   * @param {*} str
   * @returns {string}
   */
  escapeHtml(str) {
    // P2-5: 统一实现 (renderer/core/utils/html.js)
    return escapeHtmlUtil(str);
  }

  /**
   * 显示设备选择弹窗 (封装 DeviceSelectionModal)
   * MVC: UI 组件实例化归 view,与 test-execution/test-case/page-package 一致
   * @param {Object} options - { mode: 'select' | 'inspector' | 'test' }
   * @returns {Promise<string|null>} 选中的 deviceId
   */
  async showDeviceSelection(options) {
    const { default: DeviceSelectionModal } = await import('../../components/device-selection-modal.js');
    const modal = new DeviceSelectionModal();
    return await modal.show(options);
  }

  // ─── 设备显示 (原 deviceMixin) ────────────────────────────────

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
  }

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
  }

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
  }

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
      <span style="vertical-align:top;flex:1;min-width:0;word-wrap:break-word;overflow-wrap:break-word;white-space:normal;">${this.escapeHtml(deviceId)}</span>
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
  }

  showAddDeviceInput() {
    const { deviceList, addDeviceInputContainer } = this.els;
    // 取消所有已选中设备
    document.querySelectorAll('.device-item.selected').forEach(item => {
      item.classList.remove('selected');
      item.style.backgroundColor = '';
    });
    deviceList && deviceList.classList.add('hidden');
    addDeviceInputContainer && addDeviceInputContainer.classList.remove('hidden');
  }

  hideAddDeviceInput() {
    const { deviceList, addDeviceInputContainer, addDeviceInput, addDeviceResult } = this.els;
    deviceList && deviceList.classList.remove('hidden');
    addDeviceInputContainer && addDeviceInputContainer.classList.add('hidden');
    addDeviceInput && (addDeviceInput.value = '');
    addDeviceResult && addDeviceResult.classList.add('hidden');
  }

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
  }

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
  }

  showDeviceInfoLoading(isModal = false) {
    if (isModal) {
      this.els.modalDeviceLoading && (this.els.modalDeviceLoading.style.display = 'flex');
      this.els.modalDeviceInfoContent && (this.els.modalDeviceInfoContent.style.display = 'none');
    } else {
      this.els.deviceLoading && (this.els.deviceLoading.style.display = 'flex');
      this.els.deviceInfoContent && (this.els.deviceInfoContent.style.display = 'none');
    }
  }

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
  }

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
  }

  // ─── 弹窗控制 (原 modalMixin) ─────────────────────────────────

  openDeviceModal() {
    window.__XKAT_MODALS__?.device?.open();
  }

  closeDeviceModal() {
    window.__XKAT_MODALS__?.device?.close();
  }

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
  }

  closeEditDeviceIdModal() {
    window.__XKAT_MODALS__?.editDeviceId?.close();
  }

  openPortModal() {
    window.__XKAT_MODALS__?.port?.open();
  }

  closePortModal() {
    window.__XKAT_MODALS__?.port?.close();
  }

  openControlParamsModal() {
    // 初始化 custom-select 组件
    if (window.__XKAT_APP__?.initializeCustomSelects) {
      window.__XKAT_APP__.initializeCustomSelects();
    }
    window.__XKAT_MODALS__?.controlParams?.open();
  }

  closeControlParamsModal() {
    window.__XKAT_MODALS__?.controlParams?.close();
  }

  openRenameModal(fileName) {
    const { renameInput } = this.els;
    if (renameInput) {
      renameInput.value = fileName;
      renameInput.focus();
      renameInput.select();
    }
    window.__XKAT_MODALS__?.rename?.open();
  }

  closeRenameModal() {
    window.__XKAT_MODALS__?.rename?.close();
  }

  // ─── 端口管理 (原 portMixin) ──────────────────────────────────

  renderPortList(ports, onPortClick) {
    const { portList, portModalConfirmBtn } = this.els;
    if (!portList) return;

    portList.innerHTML = '';
    portModalConfirmBtn && (portModalConfirmBtn.disabled = true);

    if (ports && ports.length > 0) {
      ports.forEach(port => {
        const item = document.createElement('div');
        item.className = 'device-item';
        item.setAttribute('data-port-id', port.deviceId);
        item.innerHTML = `
          <div style="display:flex;align-items:center;">
            ${this.getIconHtml('cable', 'margin-right:8px;')}
            <div>
              <div style="font-weight:500;">${this.escapeHtml(port.deviceId)}</div>
              <div style="font-size:12px;color:var(--text-secondary);">${this.escapeHtml(port.name || '')}</div>
            </div>
          </div>
        `;
        item.addEventListener('click', () => {
          portList.querySelectorAll('.device-item').forEach(i => i.classList.remove('selected'));
          item.classList.add('selected');
          portModalConfirmBtn && (portModalConfirmBtn.disabled = false);
          onPortClick?.(port);
        });
        portList.appendChild(item);
      });
    } else {
      portList.innerHTML = `<div style="padding:16px;text-align:center;color:var(--text-secondary);">${
        window.i18n.t('testExecution.deviceSelection.noPortsFound') || '未找到串口设备'
      }</div>`;
    }
  }

  showPortScanning() {
    const { portScanning, portList, portModalConfirmBtn } = this.els;
    portScanning && (portScanning.style.display = 'flex');
    portList && (portList.classList.add('hidden'));
    portModalConfirmBtn && (portModalConfirmBtn.disabled = true);
  }

  hidePortScanning() {
    const { portScanning, portList } = this.els;
    portScanning && (portScanning.style.display = 'none');
    portList && (portList.classList.remove('hidden'));
  }

  // ─── 文件管理器显示 (原 fileManagerMixin) ─────────────────────
  // 注: #formatFileSize/#checkAndApplyEllipsis 原因 Object.assign 转公共;
  // 内联后保持公共以降低变更风险 (call sites 用 this.formatFileSize/this.checkAndApplyEllipsis)

  showFileListLoading() {
    const { fileList } = this.els;
    if (fileList) {
      fileList.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;"><div style="display:flex;align-items:center;justify-content:center;gap:8px;">'
        + this.getIconHtml('sync', 'vertical-align:middle;')
        + `<span style="vertical-align:middle;">${window.i18n.t('fileManager.loadingFiles')}</span></div></td></tr>`;
    }
  }

  displayFileError(message) {
    const { fileList } = this.els;
    if (fileList) {
      // P2-1 XSS 修复: message 为 adb 错误输出 (可含文件名等用户可控内容), 必须转义
      fileList.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;"><div style="display:flex;align-items:center;justify-content:center;gap:8px;">'
        + this.getIconHtml('error', 'vertical-align:middle;color:var(--error);')
        + `<span style="vertical-align:middle;color:var(--error);">${this.escapeHtml(message)}</span></div></td></tr>`;
    }
  }

  displayFileList(files, selectedFiles, onFileClick, onCheckboxChange, onActionsBtnClick) {
    const { fileList } = this.els;
    if (!fileList) return;

    fileList.innerHTML = '';

    // 空目录
    if (!files || files.length === 0) {
      fileList.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;"><div style="display:flex;align-items:center;justify-content:center;gap:8px;">'
        + this.getIconHtml('folder_open', 'vertical-align:middle;')
        + `<span style="vertical-align:middle;">${window.i18n.t('fileManager.emptyDirectory')}</span></div></td></tr>`;
      return;
    }

    files.forEach(file => {
      if (file.name === '.' || file.name === '..') return;

      const isSelected = selectedFiles?.some(f => f.path === file.path);
      const sizeDisplay = file.isDirectory ? '' : this.formatFileSize(file.size);

      const row = document.createElement('tr');
      row.className = 'file-item';
      row.setAttribute('data-path', file.path);
      row.setAttribute('data-is-directory', file.isDirectory);

      row.innerHTML = `
        <td><input type="checkbox" class="file-checkbox" ${isSelected ? 'checked' : ''} data-path="${this.escapeHtml(file.path)}"></td>
        <td>
          <div class="file-item-name ${file.isDirectory ? 'directory' : 'file'}">
            ${this.getIconHtml(file.isDirectory ? 'folder' : 'description')}
            <span>${this.escapeHtml(file.name)}</span>
          </div>
        </td>
        <td class="file-size">${sizeDisplay}</td>
        <td class="file-date">${file.modifiedTime || ''}</td>
        <td class="file-date">${file.createdAt || ''}</td>
        <td class="file-actions">
          <button class="file-actions-btn" data-path="${this.escapeHtml(file.path)}">
            ${this.getIconHtml('more_vert')}
          </button>
        </td>
      `;

      // 文件名点击
      const nameEl = row.querySelector('.file-item-name');
      nameEl?.addEventListener('click', () => onFileClick?.(file));

      // 复选框
      const checkbox = row.querySelector('.file-checkbox');
      checkbox?.addEventListener('change', (e) => onCheckboxChange?.(file, e.target.checked));

      // 操作按钮
      const actionsBtn = row.querySelector('.file-actions-btn');
      actionsBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        onActionsBtnClick?.(file, actionsBtn);
      });

      // 行点击
      row.addEventListener('click', (e) => {
        if (e.target.closest('.file-actions-btn') || e.target.closest('.file-checkbox')) return;
        if (file.isDirectory) onFileClick?.(file);
      });

      fileList.appendChild(row);
    });
  }

  updatePathDisplay(pathSegments, onSegmentClick, onEllipsisClick) {
    const { pathDisplay } = this.els;
    if (!pathDisplay) return;

    pathDisplay.innerHTML = '';

    const container = document.createElement('div');
    container.className = 'path-segments';
    pathDisplay.appendChild(container);

    // 先渲染所有片段
    this.renderPathSegments(container, pathSegments, 0, pathSegments.length, onSegmentClick);

    // 延迟检查溢出
    setTimeout(() => {
      this.checkAndApplyEllipsis(pathDisplay, container, pathSegments, onSegmentClick, onEllipsisClick);
    }, 0);
  }

  renderPathSegments(container, segments, startIndex, endIndex, onClick) {
    const fragment = document.createDocumentFragment();
    for (let i = startIndex; i < endIndex; i++) {
      const seg = segments[i];
      if (i > startIndex) {
        const sep = document.createElement('span');
        sep.className = 'path-separator';
        sep.textContent = '/';
        fragment.appendChild(sep);
      }
      const el = document.createElement('span');
      el.className = `path-segment ${i === endIndex - 1 ? 'active' : ''}`;
      el.textContent = seg.displayName;
      el.setAttribute('data-path', seg.path);
      el.addEventListener('click', () => onClick?.(seg.path));
      fragment.appendChild(el);
    }
    container.appendChild(fragment);
  }

  renderEllipsis(container, hiddenSegments, onClick) {
    const el = document.createElement('span');
    el.className = 'path-ellipsis';
    el.textContent = '...';
    el.title = window.i18n.t('fileManager.clickToViewMorePath');
    el.style.cssText = 'cursor:pointer;font-size:16px;margin:0 4px;color:var(--primary);display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;';

    container.appendChild(el);

    // 渲染省略项到下拉菜单
    const dropdown = this.els.ellipsisDropdown;
    if (dropdown) {
      dropdown.innerHTML = '';
      hiddenSegments.forEach(seg => {
        const item = document.createElement('div');
        item.className = 'ellipsis-item';
        item.innerHTML = `${this.getIconHtml('folder')}<span>${this.escapeHtml(seg.displayName)}</span>`;
        item.addEventListener('click', () => {
          onClick?.(seg.path);
          dropdown.classList.remove('show');
        });
        dropdown.appendChild(item);
      });
    }

    el.id = 'unique-ellipsis';
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (dropdown) {
        dropdown.classList.toggle('show');
        this.positionEllipsisDropdown(el, dropdown);
      }
    });
  }

  positionEllipsisDropdown(ellipsisElement, dropdown) {
    const rect = ellipsisElement.getBoundingClientRect();
    dropdown.style.left = `${rect.left}px`;
    dropdown.style.top = `${rect.bottom + 5}px`;
    dropdown.style.position = 'fixed';
  }

  updateBackButtonState(isRoot) {
    const { backBtn } = this.els;
    if (backBtn) {
      backBtn.disabled = isRoot;
      backBtn.classList.toggle('disabled', isRoot);
    }
  }

  updateActionButtonsState(hasSelection) {
    const { deleteBtn, downloadBtn } = this.els;
    if (deleteBtn) {
      deleteBtn.disabled = !hasSelection;
      deleteBtn.classList.toggle('disabled', !hasSelection);
    }
    if (downloadBtn) {
      downloadBtn.disabled = !hasSelection;
      downloadBtn.classList.toggle('disabled', !hasSelection);
    }
  }

  updateSelectAllCheckbox(totalFiles, selectedCount) {
    const { selectAll } = this.els;
    if (!selectAll) return;
    selectAll.checked = totalFiles > 0 && selectedCount === totalFiles;
    selectAll.indeterminate = selectedCount > 0 && selectedCount < totalFiles;
  }

  showContextMenu(x, y, file, triggerElement = null) {
    const { contextMenu } = this.els;
    if (!contextMenu) return;

    // 锁定滚动
    const fileListContainer = document.querySelector('.file-list-container');
    fileListContainer?.classList.add('scroll-locked');

    contextMenu.classList.remove('hidden');
    contextMenu.offsetHeight; // 强制重排

    const menuWidth = contextMenu.offsetWidth || 140;
    const menuHeight = contextMenu.offsetHeight || 120;
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const hPad = 20;
    const vPad = 20;
    const bottomSafe = 50;

    let posX, posY;

    if (triggerElement) {
      const rect = triggerElement.getBoundingClientRect();
      const spaceBelow = windowHeight - rect.bottom - vPad;
      const spaceAbove = rect.top - vPad;

      if (spaceBelow < menuHeight + bottomSafe && spaceAbove > menuHeight) {
        posY = rect.top - menuHeight - 4;
      } else {
        posY = rect.bottom + 4;
        if (spaceBelow < menuHeight && spaceAbove >= menuHeight) {
          posY = rect.top - menuHeight - 4;
        }
      }

      posX = rect.left - 45;
      if (posX + menuWidth > windowWidth - hPad) posX = windowWidth - menuWidth - hPad;
      if (posX < hPad) posX = hPad;
      if (posY < vPad) posY = vPad;
      if (posY + menuHeight > windowHeight - vPad) posY = windowHeight - vPad;
    } else {
      posX = x;
      posY = y;
      if (posX + menuWidth > windowWidth - hPad) posX = windowWidth - menuWidth - hPad;
      if (posX < hPad) posX = hPad;
      if (posY + menuHeight > windowHeight - vPad) posY = windowHeight - vPad;
      if (posY < vPad) posY = vPad;
    }

    contextMenu.style.left = `${posX}px`;
    contextMenu.style.top = `${posY}px`;
  }

  hideContextMenu() {
    const { contextMenu } = this.els;
    if (contextMenu) contextMenu.classList.add('hidden');
    const fileListContainer = document.querySelector('.file-list-container');
    fileListContainer?.classList.remove('scroll-locked');
  }

  toggleFileSelection(file, isSelected) {
    const row = document.querySelector(`.file-item[data-path="${file.path}"]`);
    if (row) {
      row.classList.toggle('selected', isSelected);
    }
  }

  // ─── 私有方法 (保持公共，见类头注释) ──────────────────────────

  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  checkAndApplyEllipsis(pathDisplay, segmentsContainer, allSegments, onSegmentClick, onEllipsisClick) {
    // 移除旧省略号
    const existingEllipsis = segmentsContainer.querySelector('.path-ellipsis');
    if (existingEllipsis) existingEllipsis.remove();

    // 重新渲染
    segmentsContainer.innerHTML = '';

    const containerWidth = pathDisplay.clientWidth;

    // 测量文本宽度
    const temp = document.createElement('span');
    temp.style.cssText = 'visibility:hidden;position:absolute;white-space:nowrap;font-size:14px;';
    document.body.appendChild(temp);

    let totalWidth = 0;
    const segWidths = [];

    allSegments.forEach((seg, idx) => {
      let w = 0;
      if (idx > 0) {
        temp.textContent = '/';
        w += temp.clientWidth + 8;
      }
      temp.textContent = seg.displayName;
      w += temp.clientWidth + 12;
      segWidths.push(w);
      totalWidth += w;
    });

    // 不溢出 -> 全部显示
    if (totalWidth <= containerWidth) {
      this.renderPathSegments(segmentsContainer, allSegments, 0, allSegments.length, onSegmentClick);
      document.body.removeChild(temp);
      return;
    }

    // 计算省略号宽度
    temp.textContent = '...';
    temp.style.fontSize = '16px';
    temp.style.padding = '0 4px';
    const ellipsisWidth = temp.clientWidth + 8;
    document.body.removeChild(temp);

    // 从末尾向前累加
    let visibleWidth = 0;
    let startIdx = allSegments.length - 1;
    visibleWidth += segWidths[startIdx];
    startIdx--;

    while (startIdx >= 0) {
      const newWidth = visibleWidth + segWidths[startIdx];
      if (newWidth + ellipsisWidth <= containerWidth) {
        visibleWidth = newWidth;
        startIdx--;
      } else {
        break;
      }
    }

    const hiddenSegments = allSegments.slice(0, startIdx + 1);
    this.renderEllipsis(segmentsContainer, hiddenSegments, onEllipsisClick);
    this.renderPathSegments(segmentsContainer, allSegments, startIdx + 1, allSegments.length, onSegmentClick);
  }

  // ─── 控制参数 (原 controlParamsMixin) ─────────────────────────

  loadControlParamsValues(params) {
    const { maxSize, videoBitRate, maxFps, alwaysOnTop } = this.els;
    if (maxSize) maxSize.value = params.max_size || '';
    if (videoBitRate) videoBitRate.value = params.video_bit_rate || '';
    if (maxFps) maxFps.value = params.max_fps || '';
    if (alwaysOnTop) alwaysOnTop.checked = params.always_on_top || false;
    this.setCustomSelectValue('video-codec', params.video_codec || 'h264');
  }

  collectControlParams() {
    const { maxSize, videoBitRate, maxFps, alwaysOnTop } = this.els;
    return {
      max_size: maxSize?.value || null,
      video_bit_rate: videoBitRate?.value || null,
      max_fps: maxFps?.value || null,
      video_codec: this.getCustomSelectValue('video-codec') || null,
      always_on_top: alwaysOnTop?.checked || false,
    };
  }

  setCustomSelectValue(wrapperId, value) {
    const wrapper = document.getElementById(wrapperId);
    if (!wrapper) return;
    const optionsEl = document.getElementById(`${wrapperId}-options`);
    if (!optionsEl) return;

    const selected = wrapper.querySelector('.custom-select__text');
    optionsEl.querySelectorAll('.custom-select__option').forEach(option => {
      if (option.dataset.value === value) {
        option.classList.add('selected');
        if (selected) selected.textContent = option.querySelector('span')?.textContent || option.textContent;
      } else {
        option.classList.remove('selected');
      }
    });
  }

  getCustomSelectValue(wrapperId) {
    const optionsEl = document.getElementById(`${wrapperId}-options`);
    if (!optionsEl) return null;
    const selectedOption = optionsEl.querySelector('.custom-select__option.selected');
    return selectedOption ? selectedOption.dataset.value : null;
  }

  // ─── 浮动提示 ──────────────────────────────────────────────────

  showFloatingTooltip(element, message, type = 'info', duration = 3000) {
    // 移除已有提示
    const existing = document.querySelector('.floating-tooltip');
    if (existing) existing.remove();

    const tooltip = document.createElement('div');
    tooltip.className = 'floating-tooltip';
    tooltip.textContent = message;

    tooltip.style.cssText = 'position:absolute;z-index:1000;padding:8px 12px;border-radius:4px;font-size:12px;white-space:nowrap;opacity:0;transform:translateY(10px);transition:opacity 0.3s ease,transform 0.3s ease;';

    // 根据类型设置颜色
    switch (type) {
      case 'error':
        tooltip.style.backgroundColor = '#ffebee';
        tooltip.style.color = '#c62828';
        tooltip.style.border = '1px solid #ef5350';
        break;
      case 'success':
        tooltip.style.backgroundColor = '#e8f5e8';
        tooltip.style.color = '#2e7d32';
        tooltip.style.border = '1px solid #4caf50';
        break;
      case 'info':
      default:
        tooltip.style.backgroundColor = '#e3f2fd';
        tooltip.style.color = '#1565c0';
        tooltip.style.border = '1px solid #2196f3';
        break;
    }

    document.body.appendChild(tooltip);

    // 计算位置
    const elementRect = element.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    tooltip.style.left = `${elementRect.left + (elementRect.width - tooltipRect.width) / 2}px`;
    tooltip.style.top = `${elementRect.bottom + 8}px`;

    // 显示
    setTimeout(() => {
      tooltip.style.opacity = '1';
      tooltip.style.transform = 'translateY(0)';
    }, 10);

    // 自动隐藏
    setTimeout(() => {
      tooltip.style.opacity = '0';
      tooltip.style.transform = 'translateY(10px)';
      setTimeout(() => {
        if (document.body.contains(tooltip)) tooltip.remove();
      }, 300);
    }, duration);

    return tooltip;
  }

  // ─── 事件绑定 + 表单/选择辅助 (原 bindingMixin) ───────────────
  // Controller → View 迁移的事件绑定辅助

  /**
   * 设置蓝牙端口输入框的值
   * @param {string} portId - 端口 ID
   */
  setBlePortInput(portId) {
    const { editBlePortInput } = this.els;
    if (editBlePortInput && portId) {
      editBlePortInput.value = portId;
    }
  }

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
  }

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
  }

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
  }

  /**
   * 隐藏省略号下拉菜单
   */
  hideEllipsisDropdown() {
    const { ellipsisDropdown } = this.els;
    if (ellipsisDropdown) ellipsisDropdown.classList.remove('show');
  }

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
  }

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
  }

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
  }

  /**
   * 获取当前选中的设备 ID
   * @returns {string|null}
   */
  getSelectedDeviceId() {
    const selected = document.querySelector('.device-item.selected');
    return selected?.getAttribute('data-device-id') || null;
  }

  /**
   * 获取设备模态框的 modal-container（用作 Toast 容器）
   * @returns {Element|null}
   */
  getDeviceModalContainer() {
    return document.querySelector('#device-modal-overlay .modal-container');
  }

  /**
   * 设置编辑设备 ID 输入框的值
   * @param {string} deviceId
   */
  setEditDeviceIdInput(deviceId) {
    const { editDeviceIdInput } = this.els;
    if (editDeviceIdInput) editDeviceIdInput.value = deviceId;
  }

  /**
   * 设置 Android 版本输入框的值
   * @param {string} version
   */
  setEditAndroidVersionInput(version) {
    const { editAndroidVersionInput } = this.els;
    if (editAndroidVersionInput && version) {
      editAndroidVersionInput.value = version;
    }
  }

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
  }

  /**
   * 获取当前选中的端口 ID
   * @returns {string|null}
   */
  getSelectedPortId() {
    const { portList } = this.els;
    if (!portList) return null;
    const selected = portList.querySelector('.device-item.selected');
    return selected?.getAttribute('data-port-id') || null;
  }

  /**
   * 批量设置所有文件复选框的选中状态
   * @param {boolean} checked
   */
  setAllFileCheckboxes(checked) {
    document.querySelectorAll('.file-checkbox').forEach(cb => {
      cb.checked = checked;
    });
  }

  /**
   * 获取重命名输入框的值
   * @returns {string}
   */
  getRenameInputValue() {
    const { renameInput } = this.els;
    return renameInput?.value?.trim() || '';
  }

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
  }
}

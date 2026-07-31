/**
 * AndroidConnectionView - 安卓连接 Tab View 层
 * 纯 DOM 操作，不调用 API，不管理状态
 * 通过 window.__XKAT_MODALS__ / window.__XKAT_APP__ / window.i18n 访问全局资源
 */
import { Icons } from '../../icons.js';
import { deviceMixin } from './mixins/deviceMixin.js';
import { modalMixin } from './mixins/modalMixin.js';
import { portMixin } from './mixins/portMixin.js';
import { fileManagerMixin } from './mixins/fileManagerMixin.js';
import { controlParamsMixin } from './mixins/controlParamsMixin.js';
import { bindingMixin } from './mixins/bindingMixin.js';

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
}

Object.assign(AndroidConnectionView.prototype, deviceMixin, modalMixin, portMixin, fileManagerMixin, controlParamsMixin, bindingMixin);

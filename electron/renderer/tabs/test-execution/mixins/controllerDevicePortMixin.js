// Device/port mixin for TestExecutionController
// Extracted from controller.js during refactor
// Provides: device-id edit confirm handler + port modal handlers
//   (handleShowPortModal, handleConfirmPortSelection, handleConfirmEditDeviceId)

import { Toast } from '../../../components/toast.js';

export const controllerDevicePortMixin = {
  /**
   * 打开端口管理弹窗并扫描串口（独立于 android-connection controller）
   * 因为 android-connection 是延迟初始化的，从测试执行 Tab 打开端口弹窗时可能还没 ready
   */
  async handleShowPortModal() {
    window.__XKAT_MODALS__?.port?.open();
    this.view.showPortScanningState();

    try {
      // wrapper 已处理 IPC 失败,错误由外层 catch 接
      const result = await window.electronAPI.getSerialPorts();
      const ports = result?.data || [];

      if (ports.length > 0) {
        this.view.renderPortList(ports, () => {});
      } else {
        this.view.renderPortListEmpty();
      }
    } catch (error) {
      console.error('获取串口列表失败:', error);
      this.view.renderPortListError();
    }
  },

  /** 确认端口选择 → 回填到蓝牙端口输入框 */
  handleConfirmPortSelection() {
    const portId = this.view.getSelectedPortId();
    if (!portId) return;
    this.view.setBlePortInput(portId);
    window.__XKAT_MODALS__?.port?.close();
  },

  // ─── Handler 方法（设备/端口） ─────────────────────────────

  async handleConfirmEditDeviceId() {
    const { deviceName, platformVersion, blePort } = this.view.getEditDeviceIdFormData();

    if (!deviceName) {
      Toast.error(window.i18n.t('android.deviceNameRequired') || '请输入设备名称');
      return;
    }

    // BLE 端口格式校验
    if (blePort && !/^COM\d+$/i.test(blePort)) {
      Toast.error(window.i18n.t('android.blePortFormatError') || '蓝牙端口格式应为 COM+数字');
      return;
    }

    await this.model.confirmEditDeviceId(deviceName, platformVersion, blePort);
    this.view.closeEditDeviceIdModal();

    // 刷新测试计划弹窗中的文件列表（更新设备信息显示）
    // 新建计划场景下 currentTestPlan 为 null,需用 view 当前选中文件回填
    const selectedFiles = this.view.getModalSelectedTestFiles();
    const files = await this.model.scanTestFiles();
    await this.view.renderModalTestFiles(files || [], selectedFiles, (file, checked) => {
      this.refreshModalTestTypes();
    }, (fileName, filePath) => {
      this.model.showEditDeviceIdModal(fileName, filePath);
    }, (fileName) => this.model.getTestCase(fileName));

    Toast.success(window.i18n.t('android.deviceIdUpdated') || '设备信息已更新');
  },
};

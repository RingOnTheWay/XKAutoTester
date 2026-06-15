import { Action } from '../../core/Action.js';
import { ApiBridge } from '../../core/ApiBridge.js';
import DeviceSelectionModal from '../../components/device-selection-modal.js';

/**
 * AndroidConnectionController - 安卓连接 Tab 控制器
 * 绑定 Model 事件到 View 渲染，绑定 DOM 事件到 Model 方法
 */
export class AndroidConnectionController {
  #model;
  #view;
  #cleanups = [];
  #deviceSelectionModal = null;
  #initialized = false;

  constructor(model, view) {
    this.#model = model;
    this.#view = view;
  }

  // ─── 生命周期 ────────────────────────────────────────────

  async init() {
    if (this.#initialized) return;
    this.#initialized = true;
    this.#bindModelEvents();
    this.#bindUserActions();
    this.#bindIpcEvents();
    await this.#model.load();
    // 设置初始视图状态
    this.#view.updateSelectedDeviceDisplay(this.#model.selectedDevice);
    this.#view.toggleFileManagerEnabled(!!this.#model.selectedDevice);
  }

  destroy() {
    this.#cleanups.forEach(fn => fn());
    this.#cleanups = [];
    this.#model.stopDeviceRefresh();
    this.#model.destroy();
  }

  // ─── Model 事件 → View 渲染 ──────────────────────────────

  #bindModelEvents() {
    const model = this.#model;
    const view = this.#view;

    // 选中设备变更
    this.#onModel(model, 'selectedDevice-changed', (deviceId) => {
      view.updateSelectedDeviceDisplay(deviceId);
      view.toggleFileManagerEnabled(!!deviceId);
    });

    // 文件列表加载中
    this.#onModel(model, 'file-list-loading', () => {
      view.showFileListLoading();
    });

    // 文件列表加载完成
    this.#onModel(model, 'file-list-loaded', (files) => {
      view.displayFileList(
        files,
        model.selectedFiles,
        (file) => this.#handleFileClick(file),
        (file, checked) => this.#handleFileCheckboxChange(file, checked),
        (file, btn) => this.#handleFileActionsBtnClick(file, btn),
      );
      view.updateSelectAllCheckbox(files.length, model.selectedFiles.length);
      view.updateActionButtonsState(model.selectedFiles.length > 0);
      // 同步更新路径显示
      const segments = this.#buildPathSegments(model.currentPath);
      view.updatePathDisplay(
        segments,
        (segPath) => model.navigateToPath(segPath),
        (segPath) => model.navigateToPath(segPath),
      );
      view.updateBackButtonState(model.currentPath === '/storage/emulated/0');
    });

    // 文件列表加载失败
    this.#onModel(model, 'file-list-error', (message) => {
      view.displayFileError(message);
    });

    // 当前路径变更
    this.#onModel(model, 'currentPath-changed', (path) => {
      const segments = this.#buildPathSegments(path);
      view.updatePathDisplay(
        segments,
        (segPath) => model.navigateToPath(segPath),
        (segPath) => model.navigateToPath(segPath),
      );
      view.updateBackButtonState(path === '/storage/emulated/0');
    });

    // 选中文件变更
    this.#onModel(model, 'selectedFiles-changed', () => {
      view.updateSelectAllCheckbox(model.fileList.length, model.selectedFiles.length);
      view.updateActionButtonsState(model.selectedFiles.length > 0);
    });

    // 设备信息加载完成
    this.#onModel(model, 'device-info-loaded', ({ deviceId, isModal, info }) => {
      view.renderDeviceInfo(info, isModal);
    });

    // scrcpy 参数加载完成
    this.#onModel(model, 'scrcpy-params-loaded', (params) => {
      // 供控制参数弹窗使用，不立即渲染
    });

    // scrcpy 参数保存成功
    this.#onModel(model, 'scrcpy-params-saved', () => {
      if (typeof Toast !== 'undefined') {
        Toast.success(window.i18n.t('android.controlParamsSaved') || '控制参数已保存');
      }
    });

    // 投屏控制结果
    this.#onModel(model, 'screen-control-result', (result) => {
      if (!result.success && typeof Toast !== 'undefined') {
        Toast.error(result.error || window.i18n.t('android.scrcpyStartFailed') || '投屏启动失败');
      }
    });

    // 投屏控制错误
    this.#onModel(model, 'screen-control-error', ({ message }) => {
      if (typeof Toast !== 'undefined') {
        Toast.error(message);
      }
    });

    // APK 安装结果
    this.#onModel(model, 'install-apk-result', (result) => {
      if (typeof Toast !== 'undefined') {
        if (result.success) {
          Toast.success(window.i18n.t('android.apkInstallSuccess') || 'APK 安装成功');
        } else {
          Toast.error(result.error || window.i18n.t('android.apkInstallFailed') || 'APK 安装失败');
        }
      }
    });

    // 串口列表加载完成
    this.#onModel(model, 'serial-ports-loaded', (result) => {
      view.hidePortScanning();
      const ports = result?.ports || result || [];
      view.renderPortList(ports, (port) => {
        // 选中端口后填充到蓝牙端口输入框
        const blePortInput = document.getElementById('edit-ble-port-input');
        if (blePortInput) blePortInput.value = port.deviceId;
      });
    });

    // 通用错误
    this.#onModel(model, 'error', ({ source, error, message }) => {
      const msg = message || error?.message || '未知错误';
      if (typeof Toast !== 'undefined') {
        Toast.error(msg);
      }
      console.error(`[AndroidConnection] ${source} error:`, error);
    });
  }

  // ─── DOM 事件绑定 ──────────────────────────────────────────

  #bindUserActions() {
    const view = this.#view;
    const model = this.#model;

    // ── 设备管理 ─────────────────────────────────────────────
    this.#addAction('#device-management-btn', () => this.handleShowDeviceModal());
    this.#addAction('#device-modal-close-btn', () => this.handleHideDeviceModal());
    this.#addAction('#device-modal-cancel-btn', () => this.handleDeviceModalCancel());
    this.#addAction('#device-modal-confirm-btn', () => this.handleConfirmDeviceSelection());
    this.#addAction('#open-port-btn', () => this.handleOpenPort5555());

    // ── 编辑设备 ID 弹窗 ─────────────────────────────────────
    this.#addAction('#edit-device-id-modal-close-btn', () => view.closeEditDeviceIdModal());
    this.#addAction('#edit-device-id-cancel-btn', () => view.closeEditDeviceIdModal());
    this.#addAction('#edit-device-id-confirm-btn', () => this.handleConfirmEditDeviceId());
    this.#addAction('#edit-device-id-manage-btn', () => this.handleShowDeviceManagementForEdit());
    this.#addAction('#edit-port-manage-btn', () => this.handleShowPortModal());

    // BLE 端口输入校验
    const blePortInput = document.getElementById('edit-ble-port-input');
    if (blePortInput) {
      const validateBlePort = () => {
        const val = blePortInput.value.trim();
        if (val && !/^COM\d+$/i.test(val)) {
          blePortInput.style.borderColor = 'var(--error)';
        } else {
          blePortInput.style.borderColor = '';
        }
      };
      blePortInput.addEventListener('input', validateBlePort);
      blePortInput.addEventListener('blur', validateBlePort);
      this.#cleanups.push(() => {
        blePortInput.removeEventListener('input', validateBlePort);
        blePortInput.removeEventListener('blur', validateBlePort);
      });
    }

    // ── 端口管理弹窗 ─────────────────────────────────────────
    this.#addAction('#port-modal-close-btn', () => view.closePortModal());
    this.#addAction('#port-modal-cancel-btn', () => view.closePortModal());
    this.#addAction('#port-modal-confirm-btn', () => this.handleConfirmPortSelection());

    // ── 控制参数弹窗 ─────────────────────────────────────────
    this.#addAction('#control-params-btn', () => this.handleShowControlParamsModal());
    this.#addAction('#control-params-close-btn', () => view.closeControlParamsModal());
    this.#addAction('#control-params-cancel-btn', () => view.closeControlParamsModal());
    this.#addAction('#control-params-save-btn', () => this.handleSaveControlParams());

    // ── 投屏控制 ─────────────────────────────────────────────
    this.#addAction('#screen-control-btn', () => this.handleStartScreenControl());

    // ── 文件管理器 ───────────────────────────────────────────
    this.#addAction('#back-btn', () => model.navigateBack());
    this.#addAction('#refresh-btn', () => model.loadFileList());
    this.#addAction('#delete-btn', () => this.#handleDeleteFiles());
    this.#addAction('#upload-btn', () => this.#handleUploadFiles());
    this.#addAction('#download-btn', () => this.#handleDownloadFiles());
    this.#addAction('#install-apk-btn', () => model.installApk());

    // 全选复选框
    const selectAll = document.getElementById('select-all');
    if (selectAll) {
      const handler = (e) => this.handleToggleSelectAll(e.target.checked);
      selectAll.addEventListener('change', handler);
      this.#cleanups.push(() => selectAll.removeEventListener('change', handler));
    }

    // ── 右键菜单 ─────────────────────────────────────────────
    const docClickHandler = (e) => {
      const contextMenu = document.getElementById('context-menu');
      if (contextMenu && !contextMenu.contains(e.target)) {
        view.hideContextMenu();
      }
      // 省略号下拉菜单
      const ellipsisDropdown = document.getElementById('ellipsis-dropdown');
      if (ellipsisDropdown && !ellipsisDropdown.contains(e.target) && e.target.id !== 'unique-ellipsis') {
        ellipsisDropdown.classList.remove('show');
      }
    };
    document.addEventListener('click', docClickHandler);
    this.#cleanups.push(() => document.removeEventListener('click', docClickHandler));

    // 右键菜单项点击
    const contextMenu = document.getElementById('context-menu');
    if (contextMenu) {
      const menuClickHandler = (e) => {
        const actionEl = e.target.closest('[data-action]');
        if (actionEl) {
          this.handleContextMenuAction(actionEl.dataset.action);
          view.hideContextMenu();
        }
      };
      contextMenu.addEventListener('click', menuClickHandler);
      this.#cleanups.push(() => contextMenu.removeEventListener('click', menuClickHandler));
    }

    // ── 重命名弹窗 ───────────────────────────────────────────
    this.#addAction('#rename-modal-save-btn', () => this.handleRenameSave());
    this.#addAction('#rename-modal-cancel-btn', () => view.closeRenameModal());
    this.#addAction('#rename-modal-close-btn', () => view.closeRenameModal());

    const renameForm = document.getElementById('rename-modal-form');
    if (renameForm) {
      const submitHandler = (e) => {
        e.preventDefault();
        this.handleRenameSave();
      };
      renameForm.addEventListener('submit', submitHandler);
      this.#cleanups.push(() => renameForm.removeEventListener('submit', submitHandler));
    }

    // ── 导航 Tab 切换 ────────────────────────────────────────
    document.querySelectorAll('.nav-tab').forEach(tab => {
      const handler = () => {
        if (tab.dataset.tab === 'android-connection' && this.#model.selectedDevice) {
          model.loadFileList();
        }
      };
      tab.addEventListener('click', handler);
      this.#cleanups.push(() => tab.removeEventListener('click', handler));
    });
  }

  // ─── IPC 事件绑定 ──────────────────────────────────────────

  #bindIpcEvents() {
    // scrcpy 错误
    const unsubScrcpyError = this.#model.listenScrcpyError?.((data) => {
      if (typeof Toast !== 'undefined') {
        Toast.error(data?.error || data?.message || window.i18n.t('android.scrcpyError') || '投屏错误');
      }
    });
    if (unsubScrcpyError) this.#cleanups.push(unsubScrcpyError);

    // 下载进度
    const unsubDownloadProgress = this.#model.listenDownloadProgress?.((data) => {
      this.#updateProgressIndicator('download', data);
    });
    if (unsubDownloadProgress) this.#cleanups.push(unsubDownloadProgress);

    // 上传进度
    const unsubUploadProgress = this.#model.listenUploadProgress?.((data) => {
      this.#updateProgressIndicator('upload', data);
    });
    if (unsubUploadProgress) this.#cleanups.push(unsubUploadProgress);

    // 安装进度
    const unsubInstallProgress = this.#model.listenInstallProgress?.((data) => {
      this.#updateProgressIndicator('install', data);
    });
    if (unsubInstallProgress) this.#cleanups.push(unsubInstallProgress);
  }

  // ─── Handler 方法 ──────────────────────────────────────────

  async handleShowDeviceModal() {
    if (!this.#deviceSelectionModal) {
      this.#deviceSelectionModal = new DeviceSelectionModal();
    }
    try {
      const deviceId = await this.#deviceSelectionModal.show({ mode: 'select' });
      this.#model.selectDevice(deviceId);
      this.#view.updateSelectedDeviceDisplay(deviceId);
      this.#view.toggleFileManagerEnabled(true);
      this.#view.showDeviceInfoLoading(false);
      this.#model.getDeviceInfo(deviceId);
      this.#model.loadFileList();
    } catch {
      // 用户取消选择，不做处理
    }
  }

  handleHideDeviceModal() {
    this.#view.closeDeviceModal();
  }

  handleDeviceModalCancel() {
    this.#view.closeDeviceModal();
  }

  handleConfirmDeviceSelection() {
    const selectedElement = document.querySelector('.device-item.selected');
    if (!selectedElement) {
      if (typeof Toast !== 'undefined') {
        const modalContainer = document.querySelector('#device-modal-overlay .modal-container');
        Toast.error(window.i18n.t('testExecution.deviceSelection.deviceRequired'), { container: modalContainer });
      }
      return;
    }
    const deviceId = selectedElement.getAttribute('data-device-id');
    this.#model.selectDevice(deviceId);
    this.#view.closeDeviceModal();
    this.#view.updateSelectedDeviceDisplay(deviceId);
    this.#view.toggleFileManagerEnabled(true);
    this.#view.showDeviceInfoLoading(false);
    this.#model.getDeviceInfo(deviceId);
    this.#model.loadFileList();
  }

  async handleShowDeviceManagementForEdit() {
    // 隐藏编辑设备 ID 弹窗
    this.#view.closeEditDeviceIdModal();

    if (!this.#deviceSelectionModal) {
      this.#deviceSelectionModal = new DeviceSelectionModal();
    }
    try {
      const deviceId = await this.#deviceSelectionModal.show({ mode: 'select' });
      // 选中设备后填充到编辑弹窗输入框
      const editDeviceIdInput = document.getElementById('edit-device-id-input');
      if (editDeviceIdInput) editDeviceIdInput.value = deviceId;

      // 获取 Android 版本并填充
      const versionResult = await this.#model.executeAdbCommand('getprop ro.build.version.release', deviceId);
      const editAndroidVersionInput = document.getElementById('edit-android-version-input');
      if (editAndroidVersionInput && versionResult.success) {
        editAndroidVersionInput.value = versionResult.output.trim();
      }

      // 重新打开编辑弹窗
      this.#view.openEditDeviceIdModal({
        deviceName: deviceId,
        platformVersion: versionResult.success ? versionResult.output.trim() : '',
        blePort: '',
        hasBleSteps: false,
      });
    } catch {
      // 用户取消，重新打开编辑弹窗
      this.#view.openEditDeviceIdModal({
        deviceName: '',
        platformVersion: '',
        blePort: '',
        hasBleSteps: false,
      });
    }
  }

  async handleConfirmEditDeviceId() {
    const editDeviceIdInput = document.getElementById('edit-device-id-input');
    const editAndroidVersionInput = document.getElementById('edit-android-version-input');
    const editBlePortInput = document.getElementById('edit-ble-port-input');

    const deviceName = editDeviceIdInput?.value?.trim();
    const platformVersion = editAndroidVersionInput?.value?.trim();
    const blePort = editBlePortInput?.value?.trim();

    if (!deviceName) {
      if (typeof Toast !== 'undefined') {
        Toast.error(window.i18n.t('android.deviceNameRequired') || '请输入设备名称');
      }
      return;
    }

    // BLE 端口格式校验
    if (blePort && !/^COM\d+$/i.test(blePort)) {
      if (typeof Toast !== 'undefined') {
        Toast.error(window.i18n.t('android.blePortFormatError') || '蓝牙端口格式应为 COM+数字');
      }
      return;
    }

    try {
      // 获取当前测试用例数据并更新设备信息
      const fileName = this.#model.selectedDevice;
      if (window.electronAPI?.testCase?.get && window.electronAPI?.testCase?.saveAndGenerate) {
        const caseResult = await window.electronAPI.testCase.get(fileName);
        if (caseResult?.success && caseResult?.data) {
          const caseData = caseResult.data;
          caseData.deviceName = deviceName;
          caseData.platformVersion = platformVersion;
          if (blePort) {
            caseData.blePort = blePort;
          }

          const outputDir = await window.electronAPI.getDataPath?.() || '';
          const saveResult = await window.electronAPI.testCase.saveAndGenerate(caseData, outputDir);
          if (saveResult?.success) {
            if (typeof Toast !== 'undefined') {
              Toast.success(window.i18n.t('android.deviceIdUpdated') || '设备信息已更新');
            }
          }
        }
      }
      this.#view.closeEditDeviceIdModal();
    } catch (error) {
      if (typeof Toast !== 'undefined') {
        Toast.error(error.message || '更新设备信息失败');
      }
    }
  }

  async handleShowPortModal() {
    this.#view.openPortModal();
    this.#view.showPortScanning();
    await this.#model.showPortManagementModal();
  }

  handleConfirmPortSelection() {
    const selectedPort = document.querySelector('#port-list .device-item.selected');
    if (selectedPort) {
      const portId = selectedPort.getAttribute('data-port-id');
      const blePortInput = document.getElementById('edit-ble-port-input');
      if (blePortInput && portId) {
        blePortInput.value = portId;
      }
    }
    this.#view.closePortModal();
  }

  async handleShowControlParamsModal() {
    this.#view.openControlParamsModal();
    const params = await this.#model.loadControlParams();
    this.#view.loadControlParamsValues(params);
  }

  async handleSaveControlParams() {
    const params = this.#view.collectControlParams();
    await this.#model.saveControlParams(params);
    this.#view.closeControlParamsModal();
  }

  handleStartScreenControl() {
    this.#model.startScreenControl();
  }

  handleToggleSelectAll(checked) {
    this.#model.toggleSelectAll?.(checked);
    // 更新所有复选框视觉状态
    document.querySelectorAll('.file-checkbox').forEach(cb => {
      cb.checked = checked;
    });
  }

  handleContextMenuAction(action) {
    const target = this.#model.contextMenuTarget;
    if (!target) return;

    switch (action) {
      case 'open':
        if (target.isDirectory) {
          this.#model.navigateToDirectory(target.path);
        }
        break;
      case 'download':
        this.#model.downloadFile(target, '');
        break;
      case 'rename':
        this.#view.openRenameModal(target.name);
        break;
      case 'delete':
        this.#handleDeleteSingleFile(target);
        break;
      case 'info':
        // 文件信息 - 暂不实现
        break;
    }
  }

  async handleRenameSave() {
    const renameInput = document.getElementById('rename-input');
    const newName = renameInput?.value?.trim();
    if (!newName) {
      if (typeof Toast !== 'undefined') {
        Toast.error(window.i18n.t('fileManager.nameRequired') || '请输入新名称');
      }
      return;
    }
    const target = this.#model.contextMenuTarget;
    if (!target) {
      this.#view.closeRenameModal();
      return;
    }
    const result = await this.#model.renameFile(target, newName);
    if (result?.success) {
      if (typeof Toast !== 'undefined') {
        Toast.success(window.i18n.t('fileManager.renameSuccess') || '重命名成功');
      }
    } else if (result?.error) {
      if (typeof Toast !== 'undefined') {
        Toast.error(result.error);
      }
    }
    this.#view.closeRenameModal();
  }

  async handleOpenPort5555() {
    const result = await this.#model.openPort5555();
    const modalContainer = document.querySelector('#device-modal-overlay .modal-container');
    if (result?.success) {
      if (typeof Toast !== 'undefined') {
        Toast.success(window.i18n.t('deviceModal.portOpenSuccess'), { container: modalContainer });
      }
    } else {
      if (typeof Toast !== 'undefined') {
        Toast.error(result?.error || window.i18n.t('deviceModal.portOpenFailed'), { container: modalContainer });
      }
    }
  }

  // ─── 文件管理内部处理 ──────────────────────────────────────

  #handleFileClick(file) {
    if (file.isDirectory) {
      this.#model.navigateToDirectory(file.path);
    }
  }

  #handleFileCheckboxChange(file, checked) {
    if (checked) {
      this.#model.addSelectedFile?.(file);
    } else {
      this.#model.removeSelectedFile?.(file);
    }
    this.#view.toggleFileSelection(file, checked);
    this.#view.updateSelectAllCheckbox(this.#model.fileList.length, this.#model.selectedFiles.length);
    this.#view.updateActionButtonsState(this.#model.selectedFiles.length > 0);
  }

  #handleFileActionsBtnClick(file, btn) {
    this.#model.setContextMenuTarget?.(file);
    this.#view.showContextMenu(0, 0, file, btn);
  }

  async #handleDeleteFiles() {
    const files = this.#model.selectedFiles;
    if (files.length === 0) return;

    // 确认弹窗
    const confirmed = await this.#showConfirmDialog(
      window.i18n.t('fileManager.deleteConfirm') || '确认删除',
      window.i18n.t('fileManager.deleteConfirmMessage', { count: files.length }) || `确定要删除 ${files.length} 个文件吗？`,
    );
    if (!confirmed) return;

    await this.#model.deleteSelectedFiles();
    if (typeof Toast !== 'undefined') {
      Toast.success(window.i18n.t('fileManager.deleteSuccess') || '删除成功');
    }
  }

  async #handleDeleteSingleFile(file) {
    const confirmed = await this.#showConfirmDialog(
      window.i18n.t('fileManager.deleteConfirm') || '确认删除',
      window.i18n.t('fileManager.deleteSingleConfirmMessage', { name: file.name }) || `确定要删除 "${file.name}" 吗？`,
    );
    if (!confirmed) return;

    const result = await this.#model.deleteFile(file);
    if (result?.success) {
      if (typeof Toast !== 'undefined') {
        Toast.success(window.i18n.t('fileManager.deleteSuccess') || '删除成功');
      }
      await this.#model.loadFileList();
    } else if (result?.error) {
      if (typeof Toast !== 'undefined') {
        Toast.error(result.error);
      }
    }
  }

  async #handleUploadFiles() {
    const filePaths = await this.#model.uploadFiles();
    if (!filePaths || filePaths.length === 0) return;

    for (const localPath of filePaths) {
      const remotePath = `${this.#model.currentPath}/`;
      await this.#model.uploadFile(localPath, remotePath);
    }
    if (typeof Toast !== 'undefined') {
      Toast.success(window.i18n.t('fileManager.uploadSuccess') || '上传成功');
    }
    await this.#model.loadFileList();
  }

  async #handleDownloadFiles() {
    const result = await this.#model.downloadSelectedFiles();
    if (!result) return;

    const { downloadDir, files } = result;
    for (const file of files) {
      await this.#model.downloadFile(file, downloadDir);
    }
    if (typeof Toast !== 'undefined') {
      Toast.success(window.i18n.t('fileManager.downloadSuccess') || '下载成功');
    }
  }

  // ─── Tab 生命周期 ──────────────────────────────────────────

  onTabActivated() {
    if (this.#model.selectedDevice) {
      this.#model.loadFileList();
    }
  }

  onTabDeactivated() {
    this.#model.stopDeviceRefresh();
  }

  // ─── 辅助方法 ──────────────────────────────────────────────

  #onModel(emitter, event, handler) {
    const unsub = emitter.on(event, handler);
    this.#cleanups.push(unsub);
  }

  #addAction(selector, handler) {
    const unbind = Action.bind(selector, 'click', handler);
    this.#cleanups.push(unbind);
  }

  #buildPathSegments(path) {
    if (!path) return [];
    const rootPath = '/storage/emulated/0';
    const rootLabel = window.i18n?.t('fileManager.internalStorage') || '内部存储空间';

    // 根目录
    if (path === rootPath) {
      return [{ path: rootPath, displayName: rootLabel }];
    }

    // 非根目录：先添加根目录，再添加子路径段
    const segments = [{ path: rootPath, displayName: rootLabel }];
    const relativePath = path.replace(rootPath, '');
    const parts = relativePath.split('/').filter(Boolean);
    let accumulated = rootPath;
    for (const part of parts) {
      accumulated += `/${part}`;
      segments.push({ displayName: part, path: accumulated });
    }
    return segments;
  }

  #updateProgressIndicator(type, data) {
    // 进度指示器更新 - 通过全局组件
    const progressIndicator = window.__XKAT_PROGRESS_INDICATOR__;
    if (progressIndicator) {
      progressIndicator.update(data);
    }
  }

  async #showConfirmDialog(title, message) {
    const result = await window.electronAPI?.showDialog?.({
      type: 'question',
      title,
      message,
      buttons: [window.i18n?.t('common.confirm') || '确认', window.i18n?.t('common.cancel') || '取消'],
      defaultId: 0,
      cancelId: 1,
    });
    return result?.response === 0;
  }
}

import { Action } from '../../core/Action.js';
import { ApiBridge } from '../../core/ApiBridge.js';
import { Toast } from '../../components/toast.js';

/**
 * AndroidConnectionController - 安卓连接 Tab 控制器
 * 绑定 Model 事件到 View 渲染，绑定 DOM 事件到 Model 方法
 */
export class AndroidConnectionController {
  #model;
  #view;
  #cleanups = [];
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
      Toast.success(window.i18n.t('android.controlParamsSaved') || '控制参数已保存');
    });

    // 投屏控制结果（invokeWithCheck 已保证失败时抛错，走到这里即成功）
    this.#onModel(model, 'screen-control-result', () => {
      Toast.success(window.i18n.t('android.scrcpyStartSuccess'));
    });

    // 投屏控制错误
    this.#onModel(model, 'screen-control-error', ({ message }) => {
      Toast.error(message);
    });

    // APK 安装结果（invokeWithCheck 已保证失败时抛错，走到这里即成功）
    this.#onModel(model, 'install-apk-result', () => {
      Toast.success(window.i18n.t('android.apkInstallSuccess') || 'APK 安装成功');
    });

    // 串口列表加载完成
    this.#onModel(model, 'serial-ports-loaded', (result) => {
      view.hidePortScanning();
      const ports = result?.ports || result || [];
      view.renderPortList(ports, (port) => {
        // 选中端口后填充到蓝牙端口输入框
        view.setBlePortInput(port.deviceId);
      });
    });

    // 通用错误
    this.#onModel(model, 'error', ({ source, error, message }) => {
      const msg = message || error?.message || window.i18n.t('common.unknownError');
      Toast.error(msg);
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
    // 注意：edit-device-id-manage-btn 由 test-execution controller 通过 addEventListener 绑定
    // （遵循 memory 规则：编辑设备弹窗按钮统一由 test-execution controller 处理）
    // 此处不再重复绑定，避免双 handler 触发导致 DeviceSelectionModal 实例冲突
    this.#addAction('#edit-device-id-modal-close-btn', () => view.closeEditDeviceIdModal());
    this.#addAction('#edit-device-id-cancel-btn', () => view.closeEditDeviceIdModal());
    this.#addAction('#edit-device-id-confirm-btn', () => this.handleConfirmEditDeviceId());
    this.#addAction('#edit-port-manage-btn', () => this.handleShowPortModal());

    // BLE 端口输入校验
    this.#cleanups.push(this.#view.bindBlePortValidation());

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
    this.#cleanups.push(
      this.#view.bindSelectAllChange((checked) => this.handleToggleSelectAll(checked))
    );

    // ── 右键菜单 ─────────────────────────────────────────────
    this.#cleanups.push(
      this.#view.bindGlobalClickForDropdowns({
        onOutsideContextMenu: () => view.hideContextMenu(),
        onOutsideEllipsis: () => view.hideEllipsisDropdown(),
      })
    );

    // 右键菜单项点击
    this.#cleanups.push(
      this.#view.bindContextMenuActionClick((action) => {
        this.handleContextMenuAction(action);
        view.hideContextMenu();
      })
    );

    // ── 重命名弹窗 ───────────────────────────────────────────
    this.#addAction('#rename-modal-cancel-btn', () => view.closeRenameModal());
    this.#addAction('#rename-modal-close-btn', () => view.closeRenameModal());

    this.#cleanups.push(
      this.#view.bindRenameFormSubmit(() => this.handleRenameSave())
    );

    // ── 导航 Tab 切换 ────────────────────────────────────────
    this.#cleanups.push(
      this.#view.bindNavTabsClick((tabName) => {
        if (tabName === 'android-connection' && this.#model.selectedDevice) {
          model.loadFileList();
        }
      })
    );
  }

  // ─── IPC 事件绑定 ──────────────────────────────────────────

  #bindIpcEvents() {
    // scrcpy 错误
    const unsubScrcpyError = this.#model.listenScrcpyError?.((data) => {
      Toast.error(data?.error || data?.message || window.i18n.t('android.scrcpyError'));
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
    // MVC: DeviceSelectionModal 实例化委托给 view.showDeviceSelection
    try {
      const deviceId = await this.#view.showDeviceSelection({ mode: 'select' });
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
    const deviceId = this.#view.getSelectedDeviceId();
    if (!deviceId) {
      const modalContainer = this.#view.getDeviceModalContainer();
      Toast.error(window.i18n.t('testExecution.deviceSelection.deviceRequired'), { container: modalContainer });
      return;
    }
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

    // MVC: DeviceSelectionModal 实例化委托给 view.showDeviceSelection
    try {
      const deviceId = await this.#view.showDeviceSelection({ mode: 'select' });
      // 选中设备后填充到编辑弹窗输入框
      this.#view.setEditDeviceIdInput(deviceId);

      // 获取 Android 版本并填充（失败时容错,platformVersion 留空）
      let platformVersion = '';
      try {
        const versionResult = await this.#model.executeAdbCommand('getprop ro.build.version.release', deviceId);
        platformVersion = versionResult.output.trim();
        this.#view.setEditAndroidVersionInput(platformVersion);
      } catch (e) { /* 获取版本失败容错,留空 */ }

      // 重新打开编辑弹窗
      this.#view.openEditDeviceIdModal({
        deviceName: deviceId,
        platformVersion,
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
    const { deviceName, platformVersion, blePort } = this.#view.getEditDeviceIdFormData();

    if (!deviceName) {
      Toast.error(window.i18n.t('android.deviceNameRequired') || '请输入设备名称');
      return;
    }

    // BLE 端口格式校验
    if (blePort && !/^COM\d+$/i.test(blePort)) {
      Toast.error(window.i18n.t('android.blePortFormatError') || '蓝牙端口格式应为 COM+数字');
      return;
    }

    try {
      // 获取当前测试用例数据并更新设备信息
      const fileName = this.#model.selectedDevice;
      // MVC: controller 调 model wrapper,不直接调 window.electronAPI
      const caseResult = await this.#model.getTestCase(fileName);
      if (caseResult?.success && caseResult?.data) {
        const caseData = caseResult.data;
        // P1-2: 修复数据模型分叉 — 写入 deviceConfig 嵌套结构,
        // 与 test-execution/model.js (deviceConfig?.deviceName) 和
        // test-case/TestCaseEditor.js (deviceConfig) 读取侧对齐。
        // 此前写入顶层 deviceName/platformVersion/blePort, 其他 tab 读不到。
        caseData.deviceConfig = {
          ...(caseData.deviceConfig || {}),
          deviceName,
          platformVersion,
          ...(blePort ? { blePort } : {}),
        };
        // 兼容旧数据结构: 清理顶层残留, 避免后续读取分叉
        delete caseData.deviceName;
        delete caseData.platformVersion;
        delete caseData.blePort;

        const dataPathResult = await this.#model.getDataPath();
        const outputDir = dataPathResult?.currentPath || '';
        const saveResult = await this.#model.saveAndGenerateTestCase(caseData, outputDir);
        if (saveResult?.success) {
          Toast.success(window.i18n.t('android.deviceIdUpdated') || '设备信息已更新');
        }
      }
      this.#view.closeEditDeviceIdModal();
    } catch (error) {
      Toast.error(error.message || window.i18n.t('android.updateDeviceInfoFailed'));
    }
  }

  async handleShowPortModal() {
    this.#view.openPortModal();
    this.#view.showPortScanning();
    await this.#model.showPortManagementModal();
  }

  handleConfirmPortSelection() {
    const portId = this.#view.getSelectedPortId();
    if (portId) {
      this.#view.setBlePortInput(portId);
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
    this.#view.setAllFileCheckboxes(checked);
  }

  async handleContextMenuAction(action) {
    const target = this.#model.contextMenuTarget;
    if (!target) return;

    switch (action) {
      case 'open':
        if (target.isDirectory) {
          this.#model.navigateToDirectory(target.path);
        }
        break;
      case 'download':
        await this.#handleDownloadSingleFile(target);
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
    const newName = this.#view.getRenameInputValue();
    if (!newName) {
      Toast.error(window.i18n.t('fileManager.nameRequired') || '请输入新名称');
      return;
    }
    const target = this.#model.contextMenuTarget;
    if (!target) {
      this.#view.closeRenameModal();
      return;
    }
    const result = await this.#model.renameFile(target, newName);
    if (result?.success) {
      Toast.success(window.i18n.t('fileManager.renameSuccess') || '重命名成功');
    } else if (result?.error) {
      Toast.error(result.error);
    }
    this.#view.closeRenameModal();
  }

  async handleOpenPort5555() {
    const result = await this.#model.openPort5555();
    const modalContainer = this.#view.getDeviceModalContainer();
    if (result?.success) {
      Toast.success(window.i18n.t('deviceModal.portOpenSuccess'), { container: modalContainer });
    } else {
      Toast.error(result?.error || window.i18n.t('deviceModal.portOpenFailed'), { container: modalContainer });
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
    Toast.success(window.i18n.t('fileManager.deleteSuccess') || '删除成功');
  }

  async #handleDeleteSingleFile(file) {
    const confirmed = await this.#showConfirmDialog(
      window.i18n.t('fileManager.deleteConfirm') || '确认删除',
      window.i18n.t('fileManager.deleteSingleConfirmMessage', { name: file.name }) || `确定要删除 "${file.name}" 吗？`,
    );
    if (!confirmed) return;

    const result = await this.#model.deleteFile(file);
    if (result?.success) {
      Toast.success(window.i18n.t('fileManager.deleteSuccess') || '删除成功');
      await this.#model.loadFileList();
    } else if (result?.error) {
      Toast.error(result.error);
    }
  }

  async #handleUploadFiles() {
    const filePaths = await this.#model.uploadFiles();
    if (!filePaths || filePaths.length === 0) return;

    const results = [];
    for (const localPath of filePaths) {
      const fileName = localPath.split(/[\\/]/).pop();
      const remotePath = `${this.#model.currentPath}/${fileName}`;
      const result = await this.#model.uploadFile(localPath, remotePath);
      results.push({ fileName, result });
    }

    const failed = results.filter(r => !r.result?.success);
    if (failed.length === 0) {
      Toast.success(window.i18n.t('fileManager.uploadSuccess') || '上传成功');
    } else {
      const failedNames = failed.map(r => r.fileName).join(', ');
      Toast.error(`${window.i18n.t('fileManager.uploadFailed') || '上传失败'}: ${failedNames}`);
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
    Toast.success(window.i18n.t('fileManager.downloadSuccess'));
  }

  async #handleDownloadSingleFile(file) {
    try {
      let downloadDir = await this.#model.resolveDownloadDirectory();
      if (!downloadDir) {
        downloadDir = await this.#model.selectDownloadDirectory();
        if (!downloadDir) return;
      }
      await this.#model.downloadFile(file, downloadDir);
      Toast.success(window.i18n.t('fileManager.downloadSuccess'));
    } catch (error) {
      Toast.error(window.i18n.t('fileManager.downloadFailed'));
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
    const rootLabel = window.i18n.t('fileManager.internalStorage');

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

  #showConfirmDialog(title, message) {
    return this.#view.showConfirmDialog(title, message);
  }
}

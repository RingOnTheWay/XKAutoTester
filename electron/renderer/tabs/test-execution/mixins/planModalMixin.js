// planModalMixin for TestExecutionView
// Extracted from view.js during refactor
// Provides: 测试计划弹窗 + 编辑设备连接标识弹窗 + 弹窗内文件/类型渲染

import DeviceSelectionModal from '../../../components/device-selection-modal.js';

export const planModalMixin = {
  // ─── 测试计划弹窗 ──────────────────────────────────────────────

  openPlanModal() {
    window.__XKAT_MODALS__?.plan?.open();
  },

  closePlanModal() {
    window.__XKAT_MODALS__?.plan?.close();
  },

  /**
   * 绑定测试计划表单 submit 事件
   * @param {Function} handler - submit 处理函数
   * @returns {Function} unbind 函数
   */
  bindTestPlanFormSubmit(handler) {
    const { testPlanForm } = this.els;
    if (!testPlanForm) return () => {};
    const submitHandler = (e) => {
      e.preventDefault();
      handler();
    };
    testPlanForm.addEventListener('submit', submitHandler);
    return () => testPlanForm.removeEventListener('submit', submitHandler);
  },

  // ─── 编辑设备连接标识弹窗 ───────────────────────────────────────

  openEditDeviceIdModal({ deviceName = '', platformVersion = '', blePort = '', isAndroid = false, hasBleSteps = false } = {}) {
    const deviceIdInput = document.getElementById('edit-device-id-input');
    const androidVersionInput = document.getElementById('edit-android-version-input');
    const blePortInput = document.getElementById('edit-ble-port-input');
    const blePortGroup = document.getElementById('ble-mock-port-group');
    const portManageBtn = document.getElementById('edit-port-manage-btn');

    if (deviceIdInput) deviceIdInput.value = deviceName;
    if (androidVersionInput) androidVersionInput.value = platformVersion;
    if (blePortInput) blePortInput.value = blePort;

    // 根据条件显示/隐藏蓝牙端口输入框和端口管理按钮
    if (blePortGroup) blePortGroup.style.display = hasBleSteps ? 'block' : 'none';
    if (portManageBtn) portManageBtn.style.display = hasBleSteps ? 'inline-flex' : 'none';

    window.__XKAT_MODALS__?.editDeviceId?.open();
  },

  closeEditDeviceIdModal() {
    window.__XKAT_MODALS__?.editDeviceId?.close();
  },

  getEditDeviceIdFormData() {
    const deviceIdInput = document.getElementById('edit-device-id-input');
    const androidVersionInput = document.getElementById('edit-android-version-input');
    const blePortInput = document.getElementById('edit-ble-port-input');
    return {
      deviceName: deviceIdInput?.value?.trim() || '',
      platformVersion: androidVersionInput?.value?.trim() || '',
      blePort: blePortInput?.value?.trim() || '',
    };
  },

  fillEditDeviceIdFields({ deviceName, platformVersion }) {
    const deviceIdInput = document.getElementById('edit-device-id-input');
    const androidVersionInput = document.getElementById('edit-android-version-input');
    if (deviceIdInput) deviceIdInput.value = deviceName || '';
    if (androidVersionInput && platformVersion && platformVersion !== '-') {
      androidVersionInput.value = platformVersion;
    }
  },

  /**
   * 批量绑定编辑设备连接标识弹窗按钮
   * @param {Object} handlers - { onClose, onCancel, onConfirm, onManageDevice, onManagePort }
   * @returns {Function} unbind 函数
   */
  bindEditDeviceModalButtons({ onClose, onCancel, onConfirm, onManageDevice, onManagePort } = {}) {
    const unbinds = [];
    const { editDeviceCloseBtn, editDeviceCancelBtn, editDeviceConfirmBtn, editDeviceManageBtn, editPortManageBtn } = this.els;
    if (editDeviceCloseBtn && onClose) {
      const h = () => onClose();
      editDeviceCloseBtn.addEventListener('click', h);
      unbinds.push(() => editDeviceCloseBtn.removeEventListener('click', h));
    }
    if (editDeviceCancelBtn && onCancel) {
      const h = () => onCancel();
      editDeviceCancelBtn.addEventListener('click', h);
      unbinds.push(() => editDeviceCancelBtn.removeEventListener('click', h));
    }
    if (editDeviceConfirmBtn && onConfirm) {
      const h = () => onConfirm();
      editDeviceConfirmBtn.addEventListener('click', h);
      unbinds.push(() => editDeviceConfirmBtn.removeEventListener('click', h));
    }
    if (editDeviceManageBtn && onManageDevice) {
      const h = () => onManageDevice();
      editDeviceManageBtn.addEventListener('click', h);
      unbinds.push(() => editDeviceManageBtn.removeEventListener('click', h));
    }
    if (editPortManageBtn && onManagePort) {
      const h = () => onManagePort();
      editPortManageBtn.addEventListener('click', h);
      unbinds.push(() => editPortManageBtn.removeEventListener('click', h));
    }
    return () => unbinds.forEach(fn => fn());
  },

  /**
   * 检查蓝牙端口分组当前是否可见
   * @returns {boolean}
   */
  isBleMockPortGroupVisible() {
    const { bleMockPortGroup } = this.els;
    return !!bleMockPortGroup?.style.display?.includes('block');
  },

  // 设置计划弹窗标题
  setPlanModalTitle(title) {
    const titleEl = document.getElementById('modal-title');
    if (titleEl) {
      titleEl.textContent = title;
      titleEl.removeAttribute('data-i18n');
    }
  },

  // 显示自定义确认弹窗（复用全局 confirm modal，回调存全局）
  showConfirmModal(title, message, onConfirm) {
    const titleElement = document.getElementById('confirm-modal-title');
    const messageElement = document.getElementById('confirm-modal-message');

    if (titleElement) titleElement.textContent = title;
    if (messageElement) messageElement.textContent = message;

    // 保存回调到全局，供 controller 的事件委托读取
    window.__XKAT_CONFIRM_CALLBACK__ = onConfirm;

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

    const confirmModal = window.__XKAT_MODALS__?.confirm;
    if (confirmModal) {
      confirmModal.open();
    } else {
      // fallback 到原生确认框
      if (window.confirm(message)) {
        onConfirm();
      }
    }
  },

  // ─── 全局确认弹窗按钮绑定 (供 controller 使用) ───────────────────
  bindGlobalClickForConfirmModal({ onConfirm, onCancel } = {}) {
    const handler = (e) => {
      if (e.target.id === 'confirm-modal-confirm-btn' || e.target.closest('#confirm-modal-confirm-btn')) {
        onConfirm?.();
      }
      if (e.target.id === 'confirm-modal-cancel-btn' || e.target.closest('#confirm-modal-cancel-btn')) {
        onCancel?.();
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  },

  setConfirmButtonLoading(loading) {
    const confirmBtn = document.getElementById('confirm-modal-confirm-btn');
    if (!confirmBtn) return;
    if (loading) {
      // 保存原始文本 (若未保存过)
      if (!confirmBtn.dataset.originalText) {
        confirmBtn.dataset.originalText = confirmBtn.textContent;
      }
      confirmBtn.disabled = true;
      confirmBtn.classList.add('loading');
      confirmBtn.innerHTML = `<span class="spinner"></span>`;
    } else {
      confirmBtn.disabled = false;
      confirmBtn.classList.remove('loading');
      delete confirmBtn.dataset.originalText;
      const i18nKey = confirmBtn.getAttribute('data-i18n');
      confirmBtn.innerHTML = i18nKey ? window.i18n.t(i18nKey) || confirmBtn.textContent : confirmBtn.textContent;
    }
  },

  /**
   * 显示设备选择弹窗 (MVC: view 负责 UI 组件创建)
   * @param {Object} options - 弹窗选项 { mode: 'test' | ... }
   * @returns {Promise<string>} 用户选择的 deviceId
   */
  async showDeviceSelection(options) {
    const modal = new DeviceSelectionModal();
    return await modal.show(options);
  },

  /**
   * 渲染弹窗内的测试文件列表
   * @param {Array} files - 文件列表
   * @param {Array} selectedFiles - 已选文件
   * @param {Function} onFileCheck - 文件选中回调
   * @param {Function} onEditDevice - 编辑设备回调
   * @param {Function} getFileInfo - MVC: 文件元数据查询回调 (由 controller 提供,内部调 model)
   */
  async renderModalTestFiles(files, selectedFiles, onFileCheck, onEditDevice, getFileInfo) {
    const { modalTestFileList } = this.els;
    if (!modalTestFileList) return;
    // Bug 修复: 显示 loading 至少 1s,避免结果太快导致界面闪烁
    modalTestFileList.innerHTML = `<div class="placeholder-message modal-loading-placeholder">${
      this.getIconHtml('refresh', 'animation: spin 1s linear infinite; vertical-align:middle;')
    }<span style="vertical-align:middle;">${window.i18n.t('testExecution.loadingFiles') || '加载中...'}</span></div>`;
    await new Promise(resolve => setTimeout(resolve, 1000));
    modalTestFileList.innerHTML = '';

    if (!files || files.length === 0) {
      modalTestFileList.innerHTML = `<div class="placeholder-message">${
        this.getIconHtml('info', 'vertical-align:middle;')
      }<span style="vertical-align:middle;">${window.i18n.t('testExecution.noTestFilesInDir') || '当前目录下没有测试文件'}</span></div>`;
      return;
    }

    // 统一 selectedFiles 为路径字符串数组（兼容对象数组与字符串数组）
    const selectedPaths = (selectedFiles || []).map(f => (typeof f === 'string' ? f : f?.path)).filter(Boolean);

    for (const file of files) {
      const filePath = typeof file === 'string' ? file : file?.path;
      const fileName = typeof file === 'string' ? file.split(/[\\/]/).pop() : file?.name;
      if (!filePath) continue;
      const isChecked = selectedPaths.includes(filePath) ? 'checked' : '';

      // 获取测试用例的平台信息和蓝牙步骤信息
      let platform = null;
      let deviceName = '';
      let hasBleSteps = false;
      let blePort = '';
      let testCaseFileName = fileName;
      if (testCaseFileName.endsWith('.py')) {
        testCaseFileName = testCaseFileName.slice(0, -3);
      }

      try {
        // MVC: view 不直接调 electronAPI,通过 controller 传入的 getFileInfo 回调获取元数据
        // wrapper 已处理 IPC 失败,此处直接判断 data 字段
        const result = getFileInfo ? await getFileInfo(testCaseFileName) : null;
        if (result && result.data) {
          platform = result.data.platform || null;
          deviceName = result.data.deviceConfig?.deviceName || '';
          blePort = result.data.bleDevice?.port || '';
          hasBleSteps = result.data.steps && result.data.steps.some(step => step.type === 'ble');
        }
      } catch (error) {
        // 忽略错误，使用默认值
      }

      // 显示编辑按钮的条件: 安卓平台 或 有蓝牙步骤
      const isAndroid = platform && platform.toLowerCase() === 'android';
      const hasDeviceName = deviceName && deviceName !== '{{DEVICE_NAME}}' && deviceName.trim() !== '';
      const showEditBtn = isAndroid || hasBleSteps;

      // 构建设备信息显示（安卓用例显示设备ID，蓝牙用例显示端口）
      let deviceInfoHtml = '';
      let editBtnHtml = '';
      if (showEditBtn) {
        let infoItems = [];

        // 安卓设备信息
        if (isAndroid) {
          const deviceDisplay = hasDeviceName ? deviceName : window.i18n.t('testExecution.deviceSelection.notSet');
          const deviceStatusClass = hasDeviceName ? 'device-set' : 'device-not-set';
          infoItems.push(`
            <span class="test-file-device-info ${deviceStatusClass}" data-file-name="${this.escapeHtml(testCaseFileName)}" data-type="device">
              ${this.getIconHtml('devices')}
              <span class="device-name-display">${this.escapeHtml(deviceDisplay)}</span>
            </span>
          `);
        }

        // 蓝牙端口信息
        if (hasBleSteps) {
          const portDisplay = blePort || window.i18n.t('testExecution.deviceSelection.notSet');
          const portStatusClass = blePort ? 'device-set' : 'device-not-set';
          infoItems.push(`
            <span class="test-file-device-info ${portStatusClass}" data-file-name="${this.escapeHtml(testCaseFileName)}" data-type="ble-port">
              ${this.getIconHtml('cable')}
              <span class="ble-port-display">${this.escapeHtml(portDisplay)}</span>
            </span>
          `);
        }

        if (infoItems.length > 0) {
          deviceInfoHtml = `<div class="test-file-device-row">${infoItems.join('')}</div>`;
        }

        editBtnHtml = `
          <button type="button" class="edit-device-btn" data-file-name="${this.escapeHtml(testCaseFileName)}" data-file-path="${this.escapeHtml(filePath)}" data-has-ble="${hasBleSteps}" data-is-android="${isAndroid}">
            ${this.getIconHtml('edit')}
          </button>
        `;
      }

      const item = document.createElement('div');
      item.className = 'modal-test-file-item';
      item.innerHTML = `
        <div class="test-file-main-row" style="display:flex;align-items:center;gap:8px;width:100%;">
          <input type="checkbox" id="modal-file-${this.escapeHtml(fileName)}" value="${this.escapeHtml(filePath)}" ${isChecked}>
          <label for="modal-file-${this.escapeHtml(fileName)}">
            ${this.getIconHtml('description')}
            <span>${this.escapeHtml(fileName)}</span>
          </label>
        </div>
        ${deviceInfoHtml}
        ${editBtnHtml}
      `;
      const checkbox = item.querySelector('input[type="checkbox"]');
      checkbox.checked = selectedPaths.includes(filePath);
      checkbox.addEventListener('change', (e) => onFileCheck?.(file, e.target.checked));

      // 为整个文件项添加点击事件，点击时切换复选框状态
      item.addEventListener('click', (e) => {
        // 排除编辑按钮的点击
        if (e.target.closest('.edit-device-btn')) return;
        // 排除复选框本身的点击
        if (e.target.type === 'checkbox') return;
        // 排除label元素的点击
        if (e.target.closest('label')) return;
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event('change'));
      });

      // 为编辑按钮添加事件监听
      const editBtn = item.querySelector('.edit-device-btn');
      if (editBtn && onEditDevice) {
        editBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          onEditDevice(testCaseFileName, filePath);
        });
      }

      modalTestFileList.appendChild(item);
    }
  },

  renderModalTestTypes(markers, selectedTypes, onTypeCheck) {
    const { modalTestTypeList } = this.els;
    if (!modalTestTypeList) return;
    modalTestTypeList.innerHTML = '';

    if (!markers || markers.length === 0) {
      modalTestTypeList.innerHTML = `<div class="placeholder-message">${
        this.getIconHtml('info', 'vertical-align:middle;')
      }<span style="vertical-align:middle;">${window.i18n.t('testExecution.noMarkers') || '没有找到pytest标记，将执行所有测试'}</span></div>`;
      return;
    }

    markers.forEach(marker => {
      // marker 可能是字符串或 {name, description} 对象
      const markerName = typeof marker === 'string' ? marker : marker?.name;
      const markerDesc = typeof marker === 'string' ? marker : (marker?.description || marker?.name);
      if (!markerName) return;
      const isChecked = selectedTypes?.includes(markerName) ? 'checked' : '';
      const item = document.createElement('div');
      item.className = 'modal-test-type-item';
      item.innerHTML = `
        <input type="checkbox" id="modal-type-${this.escapeHtml(markerName)}" value="${this.escapeHtml(markerName)}" ${isChecked}>
        <label for="modal-type-${this.escapeHtml(markerName)}">
          ${this.getIconHtml('category')}
          <span>${this.escapeHtml(markerDesc)}</span>
        </label>
      `;
      const checkbox = item.querySelector('input[type="checkbox"]');
      checkbox.addEventListener('change', (e) => onTypeCheck?.(markerName, e.target.checked));
      modalTestTypeList.appendChild(item);
    });
  },

  // 渲染测试类型占位符（未选择测试文件时提示）
  renderModalTestTypesPlaceholder() {
    const { modalTestTypeList } = this.els;
    if (!modalTestTypeList) return;
    modalTestTypeList.innerHTML = `<div class="placeholder-message">${
      this.getIconHtml('info', 'vertical-align:middle;')
    }<span style="vertical-align:middle;">${window.i18n.t('testExecution.selectTestFileFirst') || '请先选择测试文件'}</span></div>`;
  },

  updateTestTypeWarning(hasTypes) {
    const { testTypeWarning } = this.els;
    if (!testTypeWarning) return;
    if (hasTypes) {
      testTypeWarning.classList.add('warning-hidden');
    } else {
      testTypeWarning.classList.remove('warning-hidden');
    }
  },

  collectPlanFormData() {
    const { planNameInput, planDescriptionInput, planLoopCountInput, planContinueOnFailureCheckbox } = this.els;
    return {
      name: planNameInput?.value?.trim() || '',
      description: planDescriptionInput?.value?.trim() || '',
      loopCount: parseInt(planLoopCountInput?.value) || 1,
      continueOnFailure: planContinueOnFailureCheckbox?.checked ?? true,
      testFiles: this.getModalSelectedTestFiles(),
      testTypes: this.getModalSelectedTestTypes(),
    };
  },

  getModalSelectedTestFiles() {
    const { modalTestFileList } = this.els;
    if (!modalTestFileList) return [];
    const checked = modalTestFileList.querySelectorAll('input[type="checkbox"]:checked');
    return Array.from(checked).map(cb => {
      const filePath = cb.value;
      const fileName = filePath.split(/[\\/]/).pop();
      let type = 'unit';
      if (fileName.includes('appium')) type = 'appium';
      else if (fileName.includes('playwright')) type = 'playwright';
      else if (fileName.includes('check_app_status')) type = 'status';
      return { name: fileName, path: filePath, type };
    });
  },

  getModalSelectedTestTypes() {
    const { modalTestTypeList } = this.els;
    if (!modalTestTypeList) return [];
    const checked = modalTestTypeList.querySelectorAll('input[type="checkbox"]:checked');
    return Array.from(checked).map(cb => cb.value);
  },

  preselectModalItems(plan) {
    const { planNameInput, planDescriptionInput, planLoopCountInput, planContinueOnFailureCheckbox, updatePlanBtn } = this.els;

    if (planNameInput) planNameInput.value = plan.name || '';
    if (planDescriptionInput) planDescriptionInput.value = plan.description || '';
    if (planLoopCountInput) planLoopCountInput.value = plan.loopCount || 1;
    if (planContinueOnFailureCheckbox) planContinueOnFailureCheckbox.checked = plan.continueOnFailure !== false;

    // 编辑模式：隐藏保存按钮，显示更新按钮
    const savePlanBtn = document.getElementById('save-plan-btn');
    if (savePlanBtn) savePlanBtn.classList.add('hidden');
    if (updatePlanBtn) updatePlanBtn.classList.remove('hidden');

    // 预选文件和类型
    if (plan.testFiles && this.els.modalTestFileList) {
      const selectedPaths = plan.testFiles.map(f => (typeof f === 'string' ? f : f?.path)).filter(Boolean);
      this.els.modalTestFileList.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.checked = selectedPaths.includes(cb.value);
      });
    }
    if (plan.testTypes && this.els.modalTestTypeList) {
      this.els.modalTestTypeList.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.checked = plan.testTypes.includes(cb.value);
      });
    }
  },

  // 重置计划弹窗为"新建"模式：清空表单 + 显示保存按钮、隐藏更新按钮
  resetPlanModalForNew() {
    const { planNameInput, planDescriptionInput, planLoopCountInput, planContinueOnFailureCheckbox } = this.els;
    if (planNameInput) planNameInput.value = '';
    if (planDescriptionInput) planDescriptionInput.value = '';
    if (planLoopCountInput) planLoopCountInput.value = 1;
    if (planContinueOnFailureCheckbox) planContinueOnFailureCheckbox.checked = true;

    const savePlanBtn = document.getElementById('save-plan-btn');
    const updatePlanBtn = this.els.updatePlanBtn;
    if (savePlanBtn) savePlanBtn.classList.remove('hidden');
    if (updatePlanBtn) updatePlanBtn.classList.add('hidden');

    // 隐藏计划名称错误提示
    this.hidePlanNameError();
  },

  showPlanNameError() {
    const { planNameError } = this.els;
    if (planNameError) planNameError.classList.remove('error-hidden');
  },

  hidePlanNameError() {
    const { planNameError } = this.els;
    if (planNameError) planNameError.classList.add('error-hidden');
  },
};

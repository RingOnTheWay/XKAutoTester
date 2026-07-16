/**
 * TestExecutionView - 测试执行 Tab View 层
 * 纯 DOM 操作，不调用 API，不管理状态
 * 通过 window.__XKAT_MODALS__ / window.__XKAT_APP__ / window.i18n 访问全局资源
 */
import { Icons } from '../../icons.js';
export class TestExecutionView {
  constructor() {
    this.els = {};
    this.#cacheElements();

    // 日期时间选择器状态
    this._pickerState = {
      overlay: null,
      currentInput: null,
      year: new Date().getFullYear(),
      month: new Date().getMonth(),
      day: new Date().getDate(),
      hour: new Date().getHours(),
      minute: new Date().getMinutes(),
    };
  }

  // ─── 缓存 DOM 元素 ────────────────────────────────────────────

  #cacheElements() {
    this.els = {
      // 测试目录卡片
      selectedDirectory: document.getElementById('selected-directory'),
      selectDirectoryBtn: document.getElementById('select-directory-btn'),
      testFileList: document.getElementById('test-file-list'),

      // 测试计划区域
      testPlanSection: document.getElementById('test-plan-section'),
      testPlanList: document.getElementById('test-plans-list'),
      newPlanBtn: document.getElementById('new-plan-btn'),
      editPlanBtn: document.getElementById('edit-plan-btn'),
      deletePlanBtn: document.getElementById('delete-plan-btn'),

      // 测试类型区域
      testTypeSelector: document.getElementById('test-type-selector'),
      testTypeList: document.getElementById('test-type-list'),

      // 测试输出区域
      testOutput: document.getElementById('test-output'),
      progressBar: document.getElementById('progress-bar'),
      progressStatus: document.getElementById('progress-status'),
      runTestsBtn: document.getElementById('run-tests-btn'),
      stopTestsBtn: document.getElementById('stop-tests-btn'),
      viewReportBtn: document.getElementById('view-report-btn'),
      clearOutputBtn: document.getElementById('clear-output-btn'),
      openXkatFolderBtn: document.getElementById('open-xkat-folder-btn'),

      // 测试计划弹窗
      modalOverlay: document.getElementById('modal-overlay'),
      modalCloseBtn: document.getElementById('modal-close-btn'),
      modalCancelBtn: document.getElementById('modal-cancel-btn'),
      testPlanForm: document.getElementById('test-plan-form'),
      planNameInput: document.getElementById('plan-name'),
      planDescriptionInput: document.getElementById('plan-description'),
      planLoopCountInput: document.getElementById('loop-count'),
      planContinueOnFailureCheckbox: document.getElementById('continue-on-failure'),
      modalTestFileList: document.getElementById('modal-test-files'),
      modalTestTypeList: document.getElementById('modal-test-types'),
      testTypeWarning: document.getElementById('test-type-warning'),
      updatePlanBtn: document.getElementById('update-plan-btn'),

      // 定时计划区域
      scheduledPlanList: document.getElementById('scheduled-plans-list'),
      newScheduledPlanBtn: document.getElementById('new-scheduled-plan-btn'),
      editScheduledPlanBtn: document.getElementById('edit-scheduled-plan-btn'),
      deleteScheduledPlanBtn: document.getElementById('delete-scheduled-plan-btn'),

      // 定时计划弹窗
      scheduledPlanModalOverlay: document.getElementById('scheduled-plan-modal-overlay'),
      scheduledPlanModalCloseBtn: document.getElementById('scheduled-plan-modal-close-btn'),
      scheduledPlanCancelBtn: document.getElementById('scheduled-plan-cancel-btn'),
      scheduledPlanForm: document.getElementById('scheduled-plan-form'),
      scheduledPlanNameInput: document.getElementById('scheduled-plan-name'),
      scheduledPlanTimeInput: document.getElementById('scheduled-plan-time'),
      scheduledPlanTestPlansList: document.getElementById('scheduled-test-plans-list'),
      updateScheduledPlanBtn: document.getElementById('update-scheduled-plan-btn'),

      // 报告弹窗
      reportModalOverlay: document.getElementById('report-modal-overlay'),
      reportRunsList: document.getElementById('report-runs-list'),
      reportOpenBtn: document.getElementById('report-modal-open-btn'),
      reportCloseBtn: document.getElementById('report-modal-close-btn'),

      // 计划名称错误
      planNameError: document.getElementById('plan-name-error'),
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

  // ─── 目录显示 ──────────────────────────────────────────────────

  updateSelectedDirectory(path, displayName) {
    const { selectedDirectory } = this.els;
    if (!selectedDirectory) return;
    if (path) {
      selectedDirectory.textContent = displayName || path;
      selectedDirectory.title = path;
      selectedDirectory.removeAttribute('data-i18n');
      selectedDirectory.style.color = 'var(--text-primary)';
    } else {
      selectedDirectory.textContent = window.i18n.t('testExecution.noDirectorySelected');
      selectedDirectory.title = '';
      selectedDirectory.style.color = 'var(--text-secondary)';
    }
  }

  // 更新"选择测试目录"按钮的禁用状态（选中测试计划时禁用）
  updateSelectDirectoryButton(disabled) {
    const { selectDirectoryBtn } = this.els;
    if (!selectDirectoryBtn) return;
    // 运行中状态由 updateUIForRunning 单独控制，此处仅在非运行时生效
    selectDirectoryBtn.disabled = !!disabled;
  }

  renderTestFiles(files, selectedFiles) {
    const { testFileList } = this.els;
    if (!testFileList) return;
    testFileList.innerHTML = '';

    if (!files || files.length === 0) {
      testFileList.innerHTML = `<div class="placeholder-message">${
        this.getIconHtml('info', 'vertical-align:middle;')
      }<span style="vertical-align:middle;">${window.i18n.t('testExecution.noTestFilesInDir') || '当前目录下没有测试文件'}</span></div>`;
      return;
    }

    files.forEach(file => {
      const isChecked = selectedFiles?.includes(file) ? 'checked' : '';
      const item = document.createElement('div');
      item.className = 'test-file-item';
      item.innerHTML = `
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
          <input type="checkbox" value="${file}" ${isChecked}>
          <span>${file}</span>
        </label>
      `;
      testFileList.appendChild(item);
    });
  }

  // ─── 测试计划显示 ──────────────────────────────────────────────

  renderTestPlans(plans, currentPlanId, onSelectPlan) {
    const { testPlanList } = this.els;
    if (!testPlanList) return;
    testPlanList.innerHTML = '';

    if (!plans || plans.length === 0) {
      this.displayTestPlansPlaceholder(window.i18n.t('testExecution.noTestPlans') || '暂无测试计划');
      return;
    }

    plans.forEach(plan => {
      const item = document.createElement('div');
      item.className = `test-plan-item${plan.id === currentPlanId ? ' selected' : ''}`;
      item.setAttribute('data-plan-id', plan.id);

      // 构建测试计划详细信息
      const fileCount = plan.testFiles ? plan.testFiles.length : 0;
      const typeCount = plan.testTypes ? plan.testTypes.length : 0;
      const fileInfo = fileCount > 0 ? `${fileCount} ${window.i18n?.t('testExecution.files') || '个文件'}` : (window.i18n?.t('testExecution.noFiles') || '无文件');
      const typeInfo = typeCount > 0 ? `${typeCount} ${window.i18n?.t('testExecution.types') || '个类型'}` : (window.i18n?.t('testExecution.allTypes') || '所有类型');

      // 循环设置信息
      const loopCount = plan.loopCount || 1;
      const continueOnFailure = plan.continueOnFailure !== false;
      const loopInfo = window.i18n?.t('testExecution.loopInfo', { count: loopCount }) || `循环 ${loopCount} 次`;
      const continueInfo = !continueOnFailure ? `<span class="continue-info">${this.getIconHtml('warning')}<span>${window.i18n?.t('testExecution.stopOnFailure') || '失败即停'}</span></span>` : '';

      const descriptionHtml = plan.description ? `<div style="font-size: 12px; color: var(--text-secondary); margin-left: 1px;">${this.#escapeHtml(plan.description)}</div>` : '';

      item.innerHTML = `
        ${this.getIconHtml('assignment')}
        <div class="test-plan-content">
          <div class="test-plan-header">
            <div style="font-weight: 500;">${this.#escapeHtml(plan.name)}</div>
          </div>
          ${descriptionHtml}
          <div class="test-plan-meta">
            <span class="meta-item">${this.getIconHtml('description')}<span>${fileInfo}</span></span>
            <span class="meta-item">${this.getIconHtml('category')}<span>${typeInfo}</span></span>
          </div>
          <div class="test-plan-meta">
            <span class="loop-info">${this.getIconHtml('repeat')}<span>${loopInfo}</span></span>
            ${continueInfo}
          </div>
        </div>
      `;
      item.addEventListener('click', () => onSelectPlan?.(plan));
      testPlanList.appendChild(item);
    });
  }

  selectTestPlanItem(planId) {
    const { testPlanList } = this.els;
    if (!testPlanList) return;
    testPlanList.querySelectorAll('.test-plan-item.selected').forEach(el => el.classList.remove('selected'));
    if (planId) {
      const target = testPlanList.querySelector(`.test-plan-item[data-plan-id="${CSS.escape(planId)}"]`);
      if (target) target.classList.add('selected');
    }
  }

  highlightTestPlanItems(planIds) {
    const { testPlanList } = this.els;
    if (!testPlanList) return;
    testPlanList.querySelectorAll('.test-plan-item.selected').forEach(el => el.classList.remove('selected'));
    if (planIds && planIds.length > 0) {
      planIds.forEach(id => {
        const target = testPlanList.querySelector(`.test-plan-item[data-plan-id="${CSS.escape(id)}"]`);
        if (target) target.classList.add('selected');
      });
    }
  }

  displayTestPlansPlaceholder(message) {
    const { testPlanList } = this.els;
    if (!testPlanList) return;
    testPlanList.innerHTML = `<div class="placeholder-message">${
      this.getIconHtml('info', 'vertical-align:middle;')
    }<span style="vertical-align:middle;">${message}</span></div>`;
  }

  updatePlanButtons(hasPlan, isRunning) {
    const { editPlanBtn, deletePlanBtn } = this.els;
    if (editPlanBtn) editPlanBtn.disabled = !hasPlan || isRunning;
    if (deletePlanBtn) deletePlanBtn.disabled = !hasPlan || isRunning;
  }

  // ─── 测试类型显示 ──────────────────────────────────────────────

  displayTestTypes(markers, placeholder, forceRender, onTypeChange, disabled = false, preselected = []) {
    const { testTypeSelector } = this.els;
    if (!testTypeSelector) return;

    // 如果有占位消息且非强制渲染
    if (placeholder && !forceRender) {
      testTypeSelector.innerHTML = '';
      const placeholderElement = document.createElement('div');
      placeholderElement.className = 'placeholder-message';
      placeholderElement.innerHTML = `${this.getIconHtml('info')}<span>${placeholder}</span>`;
      testTypeSelector.appendChild(placeholderElement);
      return;
    }

    if (!markers || markers.length === 0) {
      testTypeSelector.innerHTML = '';
      const placeholderElement = document.createElement('div');
      placeholderElement.className = 'placeholder-message';
      placeholderElement.innerHTML = `${this.getIconHtml('info')}<span>${window.i18n.t('testExecution.noMarkers') || '没有找到pytest标记，将执行所有测试'}</span>`;
      testTypeSelector.appendChild(placeholderElement);
      return;
    }

    // 去重
    const uniqueMarkers = [];
    const seenNames = new Set();
    markers.forEach(marker => {
      const markerName = typeof marker === 'string' ? marker : marker?.name;
      if (markerName && !seenNames.has(markerName)) {
        seenNames.add(markerName);
        uniqueMarkers.push(marker);
      }
    });

    testTypeSelector.innerHTML = '';
    const fragment = document.createDocumentFragment();
    uniqueMarkers.forEach(marker => {
      const markerName = typeof marker === 'string' ? marker : marker?.name;
      const markerDesc = typeof marker === 'string' ? marker : (marker?.description || marker?.name);
      if (!markerName) return;

      const label = document.createElement('label');
      label.className = 'checkbox-container' + (disabled ? ' disabled' : '');

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = `${markerName}-tests`;
      checkbox.value = markerName;
      checkbox.checked = preselected.length > 0 ? preselected.includes(markerName) : true;
      if (disabled) checkbox.disabled = true;

      const checkmark = document.createElement('span');
      checkmark.className = 'checkmark';

      const text = document.createTextNode(markerDesc || markerName);

      label.appendChild(checkbox);
      label.appendChild(checkmark);
      label.appendChild(text);

      if (!disabled) {
        checkbox.addEventListener('change', () => onTypeChange?.());
      }

      fragment.appendChild(label);
    });
    testTypeSelector.appendChild(fragment);
  }

  getSelectedTestTypes() {
    const { testTypeSelector } = this.els;
    if (!testTypeSelector) return [];
    const checked = testTypeSelector.querySelectorAll('input[type="checkbox"]:checked');
    return Array.from(checked).map(cb => cb.value);
  }

  refreshTestTypes() {
    // 重新渲染当前测试类型（保留选中状态由 controller 管理）
    // 此方法由 controller 调用，controller 负责传入最新 markers 和选中状态
  }

  // ─── 测试执行 UI ──────────────────────────────────────────────

  updateUIForRunning(isRunning) {
    const { runTestsBtn, stopTestsBtn, selectDirectoryBtn, newPlanBtn, editPlanBtn, deletePlanBtn } = this.els;

    if (runTestsBtn) runTestsBtn.disabled = isRunning;
    if (stopTestsBtn) stopTestsBtn.disabled = !isRunning;
    if (selectDirectoryBtn) selectDirectoryBtn.disabled = isRunning;
    if (newPlanBtn) newPlanBtn.disabled = isRunning;
    if (editPlanBtn) editPlanBtn.disabled = isRunning;
    if (deletePlanBtn) deletePlanBtn.disabled = isRunning;
  }

  updateRunButtonState(canRun, isRunning) {
    const { runTestsBtn } = this.els;
    if (!runTestsBtn) return;
    runTestsBtn.disabled = !canRun || isRunning;
  }

  updateViewReportButton(hasPlan) {
    const { viewReportBtn } = this.els;
    if (!viewReportBtn) return;
    viewReportBtn.disabled = !hasPlan;
  }

  updateProgress(status, percentage) {
    const { progressStatus, progressBar } = this.els;
    if (progressStatus) progressStatus.textContent = status;
    const percentageEl = document.getElementById('progress-percentage');
    if (percentageEl) percentageEl.textContent = percentage + '%';
    if (progressBar) {
      const fill = progressBar.querySelector('.progress-fill');
      if (fill) fill.style.width = percentage + '%';
    }
  }

  updateLoopProgress(current, total) {
    const { progressStatus } = this.els;
    if (progressStatus) {
      progressStatus.textContent = window.i18n.t('testExecution.loopProgress', { current, total })
        || `循环 ${current}/${total}`;
    }
  }

  appendOutputToDOM(text, isError = false) {
    const { testOutput } = this.els;
    if (!testOutput) return;

    // 移除欢迎消息
    const welcome = testOutput.querySelector('.welcome-message');
    if (welcome) welcome.remove();

    // 清理所有非元素子节点（HTML 源码中的缩进/换行文本节点）
    const textNodes = Array.from(testOutput.childNodes).filter(n => n.nodeType === Node.TEXT_NODE);
    textNodes.forEach(n => n.remove());

    // 添加 has-content class
    testOutput.classList.add('has-content');

    // 按换行符拆分，每行创建一个 div
    const lines = text.split(/\r?\n/);
    for (const lineText of lines) {
      if (lineText.trim() === '') continue;
      const line = document.createElement('div');
      line.className = isError ? 'output-line error' : 'output-line';
      line.textContent = lineText;
      if (isError) line.style.color = 'var(--error)';
      testOutput.appendChild(line);
    }

    testOutput.scrollTop = testOutput.scrollHeight;
  }

  clearOutputDisplay() {
    const { testOutput } = this.els;
    if (!testOutput) return;
    testOutput.innerHTML = '';
    // 恢复欢迎消息（使用紧凑格式避免产生空白文本节点）
    const welcome = document.createElement('div');
    welcome.className = 'welcome-message';
    welcome.innerHTML = `<div class="welcome-text-container"><span class="welcome-text">${window.i18n?.t('testExecution.welcome') || '欢迎使用'}</span><span class="welcome-app-name">XKAutoTester</span></div><p>${window.i18n?.t('testExecution.createTestPlan') || '创建测试计划开始测试'}</p>`;
    testOutput.appendChild(welcome);
  }

  showError(message) {
    const { testOutput } = this.els;
    if (!testOutput) return;
    const welcome = testOutput.querySelector('.welcome-message');
    if (welcome) welcome.remove();

    const line = document.createElement('div');
    line.className = 'output-line error';
    line.innerHTML = `${this.getIconHtml('error', 'vertical-align:middle;color:var(--error);margin-right:4px;')}<span style="vertical-align:middle;">${this.#escapeHtml(message)}</span>`;
    testOutput.appendChild(line);
    testOutput.scrollTop = testOutput.scrollHeight;
  }

  showSuccess(message) {
    const { testOutput } = this.els;
    if (!testOutput) return;
    const welcome = testOutput.querySelector('.welcome-message');
    if (welcome) welcome.remove();

    const line = document.createElement('div');
    line.className = 'output-line success';
    line.innerHTML = `${this.getIconHtml('check_circle', 'vertical-align:middle;color:var(--success);margin-right:4px;')}<span style="vertical-align:middle;">${this.#escapeHtml(message)}</span>`;
    testOutput.appendChild(line);
    testOutput.scrollTop = testOutput.scrollHeight;
  }

  // ─── 测试计划弹窗 ──────────────────────────────────────────────

  openPlanModal() {
    window.__XKAT_MODALS__?.plan?.open();
  }

  closePlanModal() {
    window.__XKAT_MODALS__?.plan?.close();
  }

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
  }

  closeEditDeviceIdModal() {
    window.__XKAT_MODALS__?.editDeviceId?.close();
  }

  getEditDeviceIdFormData() {
    const deviceIdInput = document.getElementById('edit-device-id-input');
    const androidVersionInput = document.getElementById('edit-android-version-input');
    const blePortInput = document.getElementById('edit-ble-port-input');
    return {
      deviceName: deviceIdInput?.value?.trim() || '',
      platformVersion: androidVersionInput?.value?.trim() || '',
      blePort: blePortInput?.value?.trim() || '',
    };
  }

  fillEditDeviceIdFields({ deviceName, platformVersion }) {
    const deviceIdInput = document.getElementById('edit-device-id-input');
    const androidVersionInput = document.getElementById('edit-android-version-input');
    if (deviceIdInput) deviceIdInput.value = deviceName || '';
    if (androidVersionInput && platformVersion && platformVersion !== '-') {
      androidVersionInput.value = platformVersion;
    }
  }

  // 设置计划弹窗标题
  setPlanModalTitle(title) {
    const titleEl = document.getElementById('modal-title');
    if (titleEl) {
      titleEl.textContent = title;
      titleEl.removeAttribute('data-i18n');
    }
  }

  // 显示自定义确认弹窗（复用全局 confirm modal，回调存全局）
  showConfirmModal(title, message, onConfirm) {
    const titleElement = document.getElementById('confirm-modal-title');
    const messageElement = document.getElementById('confirm-modal-message');

    if (titleElement) titleElement.textContent = title;
    if (messageElement) messageElement.textContent = message;

    // 保存回调到全局，供 settings controller 的事件委托读取
    window.__XKAT_CONFIRM_CALLBACK__ = onConfirm;

    // 重置确认按钮状态
    const confirmBtn = document.getElementById('confirm-modal-confirm-btn');
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.classList.remove('loading');
      // 清除旧的 originalText，使用当前语言重新翻译
      delete confirmBtn.dataset.originalText;
      const i18nKey = confirmBtn.getAttribute('data-i18n');
      confirmBtn.innerHTML = i18nKey ? window.i18n?.t(i18nKey) || confirmBtn.textContent : confirmBtn.textContent;
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
  }

  async renderModalTestFiles(files, selectedFiles, onFileCheck, onEditDevice) {
    const { modalTestFileList } = this.els;
    if (!modalTestFileList) return;
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
        const result = await window.electronAPI.testCase.get(testCaseFileName);
        if (result && result.success && result.data) {
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
            <span class="test-file-device-info ${deviceStatusClass}" data-file-name="${this.#escapeHtml(testCaseFileName)}" data-type="device">
              ${this.getIconHtml('devices')}
              <span class="device-name-display">${this.#escapeHtml(deviceDisplay)}</span>
            </span>
          `);
        }

        // 蓝牙端口信息
        if (hasBleSteps) {
          const portDisplay = blePort || window.i18n.t('testExecution.deviceSelection.notSet');
          const portStatusClass = blePort ? 'device-set' : 'device-not-set';
          infoItems.push(`
            <span class="test-file-device-info ${portStatusClass}" data-file-name="${this.#escapeHtml(testCaseFileName)}" data-type="ble-port">
              ${this.getIconHtml('cable')}
              <span class="ble-port-display">${this.#escapeHtml(portDisplay)}</span>
            </span>
          `);
        }

        if (infoItems.length > 0) {
          deviceInfoHtml = `<div class="test-file-device-row">${infoItems.join('')}</div>`;
        }

        editBtnHtml = `
          <button type="button" class="edit-device-btn" data-file-name="${this.#escapeHtml(testCaseFileName)}" data-file-path="${this.#escapeHtml(filePath)}" data-has-ble="${hasBleSteps}" data-is-android="${isAndroid}">
            ${this.getIconHtml('edit')}
          </button>
        `;
      }

      const item = document.createElement('div');
      item.className = 'modal-test-file-item';
      item.innerHTML = `
        <div class="test-file-main-row" style="display:flex;align-items:center;gap:8px;width:100%;">
          <input type="checkbox" id="modal-file-${this.#escapeHtml(fileName)}" value="${this.#escapeHtml(filePath)}" ${isChecked}>
          <label for="modal-file-${this.#escapeHtml(fileName)}">
            ${this.getIconHtml('description')}
            <span>${this.#escapeHtml(fileName)}</span>
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
  }

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
        <input type="checkbox" id="modal-type-${this.#escapeHtml(markerName)}" value="${this.#escapeHtml(markerName)}" ${isChecked}>
        <label for="modal-type-${this.#escapeHtml(markerName)}">
          ${this.getIconHtml('category')}
          <span>${this.#escapeHtml(markerDesc)}</span>
        </label>
      `;
      const checkbox = item.querySelector('input[type="checkbox"]');
      checkbox.addEventListener('change', (e) => onTypeCheck?.(markerName, e.target.checked));
      modalTestTypeList.appendChild(item);
    });
  }

  // 渲染测试类型占位符（未选择测试文件时提示）
  renderModalTestTypesPlaceholder() {
    const { modalTestTypeList } = this.els;
    if (!modalTestTypeList) return;
    modalTestTypeList.innerHTML = `<div class="placeholder-message">${
      this.getIconHtml('info', 'vertical-align:middle;')
    }<span style="vertical-align:middle;">${window.i18n.t('testExecution.selectTestFileFirst') || '请先选择测试文件'}</span></div>`;
  }

  updateTestTypeWarning(hasTypes) {
    const { testTypeWarning } = this.els;
    if (!testTypeWarning) return;
    if (hasTypes) {
      testTypeWarning.classList.add('warning-hidden');
    } else {
      testTypeWarning.classList.remove('warning-hidden');
    }
  }

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
  }

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
  }

  getModalSelectedTestTypes() {
    const { modalTestTypeList } = this.els;
    if (!modalTestTypeList) return [];
    const checked = modalTestTypeList.querySelectorAll('input[type="checkbox"]:checked');
    return Array.from(checked).map(cb => cb.value);
  }

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
  }

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
  }

  showPlanNameError() {
    const { planNameError } = this.els;
    if (planNameError) planNameError.classList.remove('error-hidden');
  }

  hidePlanNameError() {
    const { planNameError } = this.els;
    if (planNameError) planNameError.classList.add('error-hidden');
  }

  // ─── 定时计划显示 ──────────────────────────────────────────────

  renderScheduledPlansList(plans, currentPlanId, onSelectPlan) {
    const { scheduledPlanList } = this.els;
    if (!scheduledPlanList) return;
    scheduledPlanList.innerHTML = '';

    if (!plans || plans.length === 0) {
      scheduledPlanList.innerHTML = `<div class="placeholder-message">${
        this.getIconHtml('info', 'vertical-align:middle;')
      }<span style="vertical-align:middle;">${window.i18n?.t('testExecution.noScheduledPlans') || '暂无定时计划'}</span></div>`;
      return;
    }

    plans.forEach(plan => {
      const item = document.createElement('div');
      item.className = `scheduled-plan-item${plan.id === currentPlanId ? ' selected' : ''}`;
      item.setAttribute('data-plan-id', plan.id);
      const formattedTime = plan.scheduledTime ? TestExecutionView.formatDateTime(new Date(plan.scheduledTime)) : '-';
      const status = TestExecutionView.getScheduledPlanStatus(plan);
      const planNames = plan.testPlanNames ? plan.testPlanNames.join(', ') : (window.i18n?.t('testExecution.noTestPlans') || '无测试计划');

      item.innerHTML = `
        ${this.getIconHtml('schedule')}
        <div class="test-plan-content">
          <div class="test-plan-header">
            <div style="font-weight: 500;">${this.#escapeHtml(plan.name)}</div>
          </div>
          <div style="font-size: 12px; color: var(--text-secondary);">${this.#escapeHtml(planNames)}</div>
          <div class="test-plan-meta">
            <span class="scheduled-time"><span>${formattedTime}</span></span>
            <span class="scheduled-status ${status.class}">${status.text}</span>
          </div>
        </div>
      `;
      item.addEventListener('click', () => onSelectPlan?.(plan));
      scheduledPlanList.appendChild(item);
    });
  }

  selectScheduledPlanItem(planId) {
    const { scheduledPlanList } = this.els;
    if (!scheduledPlanList) return;
    scheduledPlanList.querySelectorAll('.scheduled-plan-item.selected').forEach(el => el.classList.remove('selected'));
    if (planId) {
      const target = scheduledPlanList.querySelector(`.scheduled-plan-item[data-plan-id="${CSS.escape(planId)}"]`);
      if (target) target.classList.add('selected');
    }
  }

  updateScheduledPlanButtons(hasPlan) {
    const { editScheduledPlanBtn, deleteScheduledPlanBtn } = this.els;
    if (editScheduledPlanBtn) editScheduledPlanBtn.disabled = !hasPlan;
    if (deleteScheduledPlanBtn) deleteScheduledPlanBtn.disabled = !hasPlan;
  }

  // ─── 定时计划弹窗 ──────────────────────────────────────────────

  openScheduledPlanModal() {
    // 初始化执行时间输入框的日期时间选择器
    const { scheduledPlanTimeInput } = this.els;
    if (scheduledPlanTimeInput) {
      this.initDateTimePicker(scheduledPlanTimeInput);
    }
    window.__XKAT_MODALS__?.scheduledPlan?.open();
  }

  closeScheduledPlanModal() {
    window.__XKAT_MODALS__?.scheduledPlan?.close();
  }

  collectScheduledPlanFormData() {
    const { scheduledPlanNameInput, scheduledPlanTimeInput } = this.els;
    return {
      name: scheduledPlanNameInput?.value?.trim() || '',
      scheduledTime: scheduledPlanTimeInput?.value?.trim() || '',
      testPlans: this.getSelectedTestPlansFromModal(),
    };
  }

  renderScheduledPlanTestPlansList(testPlans, selectedPlanIds, onPlanCheck) {
    const { scheduledPlanTestPlansList } = this.els;
    if (!scheduledPlanTestPlansList) return;
    scheduledPlanTestPlansList.innerHTML = '';

    if (!testPlans || testPlans.length === 0) {
      scheduledPlanTestPlansList.innerHTML = `<div class="placeholder-message">${
        this.getIconHtml('info', 'vertical-align:middle;')
      }<span style="vertical-align:middle;">${window.i18n.t('testExecution.noTestPlans') || '暂无测试计划'}</span></div>`;
      return;
    }

    const fragment = document.createDocumentFragment();
    testPlans.forEach(plan => {
      const isSelected = selectedPlanIds?.includes(plan.id);
      const planElement = document.createElement('div');
      planElement.className = 'checkbox-item scheduled-plan-checkbox';
      planElement.innerHTML = `
        <input type="checkbox" id="scheduled-plan-${this.#escapeHtml(plan.id)}" value="${this.#escapeHtml(plan.id)}" ${isSelected ? 'checked' : ''}>
        <label for="scheduled-plan-${this.#escapeHtml(plan.id)}">${this.#escapeHtml(plan.name)}</label>
      `;
      const checkbox = planElement.querySelector('input');
      checkbox.addEventListener('change', (e) => onPlanCheck?.(plan.id, e.target.checked));
      fragment.appendChild(planElement);
    });
    scheduledPlanTestPlansList.appendChild(fragment);
  }

  getSelectedTestPlansFromModal() {
    const { scheduledPlanTestPlansList } = this.els;
    if (!scheduledPlanTestPlansList) return [];
    const checked = scheduledPlanTestPlansList.querySelectorAll('input[type="checkbox"]:checked');
    return Array.from(checked).map(cb => cb.value);
  }

  // ─── 报告弹窗 ──────────────────────────────────────────────────

  openReportModal() {
    window.__XKAT_MODALS__?.report?.open();
  }

  closeReportModal() {
    window.__XKAT_MODALS__?.report?.close();
  }

  renderReportRuns(runs, selectedRunId, onSelectRun) {
    const { reportRunsList } = this.els;
    if (!reportRunsList) return;
    reportRunsList.innerHTML = '';

    if (!runs || runs.length === 0) {
      const noRuns = document.getElementById('report-no-runs');
      if (noRuns) noRuns.classList.remove('hidden');
      reportRunsList.classList.add('hidden');
      return;
    }

    const noRuns = document.getElementById('report-no-runs');
    if (noRuns) noRuns.classList.add('hidden');
    reportRunsList.classList.remove('hidden');

    runs.forEach(run => {
      const item = document.createElement('div');
      item.className = `report-run-item${run.available ? '' : ' unavailable'}${run.index === selectedRunId ? ' selected' : ''}`;
      item.setAttribute('data-index', run.index);
      item.setAttribute('data-path', run.reportPath || '');
      item.setAttribute('data-available', run.available);
      const timeStr = run.timestamp || '-';
      const statusIcon = run.available
        ? this.getIconHtml('check_circle', 'vertical-align:middle;color:var(--success);margin-right:4px;')
        : this.getIconHtml('cancel', 'vertical-align:middle;color:var(--error);margin-right:4px;');
      const latestBadge = run.isLatest ? `<span class="report-latest-badge">${window.i18n?.t('reportModal.latest') || '最新'}</span>` : '';
      const statusText = run.available
        ? (window.i18n?.t('reportModal.reportAvailable') || '报告可用')
        : (window.i18n?.t('reportModal.reportUnavailable') || '报告不可用');
      item.innerHTML = `
        <div class="report-run-left">
          <div class="report-run-index">${run.index}</div>
          <div class="report-run-info">
            <div class="report-run-time">${timeStr}${latestBadge}</div>
          </div>
        </div>
        <div class="report-run-right">
          <div class="report-run-status ${run.available ? 'available' : 'unavailable'}">
            ${statusIcon}
            <span>${statusText}</span>
          </div>
        </div>
      `;
      item.addEventListener('click', () => {
        if (!run.available) return;
        // 取消其他选中
        reportRunsList.querySelectorAll('.report-run-item').forEach(i => i.classList.remove('selected'));
        item.classList.add('selected');
        onSelectRun?.(run);
      });
      reportRunsList.appendChild(item);
    });
  }

  resetReportModalButtons() {
    const { reportOpenBtn } = this.els;
    if (reportOpenBtn) reportOpenBtn.disabled = true;
  }

  enableViewReportButton(enabled) {
    const { reportOpenBtn } = this.els;
    if (reportOpenBtn) reportOpenBtn.disabled = !enabled;
  }

  // ─── 日期时间选择器（内联实现） ────────────────────────────────

  initDateTimePicker(inputElement) {
    if (!inputElement) return;
    // 防止重复绑定
    if (inputElement.dataset.pickerInitialized) return;
    inputElement.dataset.pickerInitialized = 'true';
    inputElement.setAttribute('readonly', true);
    inputElement.addEventListener('focus', (e) => {
      e.preventDefault();
      this.showDateTimePicker(inputElement);
    });
    inputElement.addEventListener('click', () => {
      this.showDateTimePicker(inputElement);
    });
  }

  createDateTimePickerOverlay() {
    // 如果已存在则复用
    const existing = document.getElementById('datetime-picker-overlay');
    if (existing) {
      this._pickerState.overlay = existing;
      return existing;
    }

    const overlay = document.createElement('div');
    overlay.id = 'datetime-picker-overlay';
    overlay.className = 'datetime-picker-overlay hidden';
    overlay.innerHTML = `
      <div class="datetime-picker-panel">
        <div class="datetime-picker-header">
          <button type="button" class="datetime-picker-nav prev-month" data-action="prev-month">
            <span class="svg-icon" data-icon="keyboard_arrow_left"></span>
          </button>
          <div class="datetime-picker-title">
            <span class="picker-year"></span>
            <span class="picker-month"></span>
          </div>
          <button type="button" class="datetime-picker-nav next-month" data-action="next-month">
            <span class="svg-icon" data-icon="keyboard_arrow_right"></span>
          </button>
        </div>
        <div class="datetime-picker-body">
          <div class="datetime-picker-weekdays">
            <span>${window.i18n.t('datetime.sun') || '日'}</span>
            <span>${window.i18n.t('datetime.mon') || '一'}</span>
            <span>${window.i18n.t('datetime.tue') || '二'}</span>
            <span>${window.i18n.t('datetime.wed') || '三'}</span>
            <span>${window.i18n.t('datetime.thu') || '四'}</span>
            <span>${window.i18n.t('datetime.fri') || '五'}</span>
            <span>${window.i18n.t('datetime.sat') || '六'}</span>
          </div>
          <div class="datetime-picker-days"></div>
        </div>
        <div class="datetime-picker-time">
          <div class="time-input-group">
            <label>${window.i18n.t('datetime.hour') || '时'}</label>
            <input type="number" class="time-input hour-input" min="0" max="23" value="00">
          </div>
          <span class="time-separator">:</span>
          <div class="time-input-group">
            <label>${window.i18n.t('datetime.minute') || '分'}</label>
            <input type="number" class="time-input minute-input" min="0" max="59" value="00">
          </div>
        </div>
        <div class="datetime-picker-footer">
          <button type="button" class="datetime-picker-btn cancel-btn">${window.i18n.t('modal.cancel') || '取消'}</button>
          <button type="button" class="datetime-picker-btn confirm-btn">${window.i18n.t('modal.confirm') || '确定'}</button>
        </div>
      </div>
    `;

    // 挂载到定时计划弹窗内部（和原始代码一致）
    const modalOverlay = document.getElementById('scheduled-plan-modal-overlay');
    if (modalOverlay) {
      modalOverlay.appendChild(overlay);
    } else {
      document.body.appendChild(overlay);
    }
    this._pickerState.overlay = overlay;

    // 绑定导航按钮
    overlay.querySelector('.prev-month').addEventListener('click', () => this.navigatePicker('month', -1));
    overlay.querySelector('.next-month').addEventListener('click', () => this.navigatePicker('month', 1));

    // 取消/确认按钮
    overlay.querySelector('.cancel-btn').addEventListener('click', () => this.hideDateTimePicker());
    overlay.querySelector('.confirm-btn').addEventListener('click', () => this.confirmDateTimePicker());

    // 点击遮罩关闭
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.hideDateTimePicker();
    });

    // 时间输入校验
    const hourInput = overlay.querySelector('.hour-input');
    const minuteInput = overlay.querySelector('.minute-input');

    hourInput.addEventListener('input', (e) => {
      let value = e.target.value.replace(/[^0-9]/g, '');
      if (value.length > 2) value = value.slice(0, 2);
      const numValue = parseInt(value) || 0;
      if (numValue > 23) value = '23';
      e.target.value = value;
    });
    hourInput.addEventListener('blur', (e) => {
      let value = e.target.value;
      const numValue = parseInt(value) || 0;
      if (numValue < 0 || isNaN(numValue)) value = '00';
      else if (numValue > 23) value = '23';
      else value = String(numValue).padStart(2, '0');
      e.target.value = value;
    });

    minuteInput.addEventListener('input', (e) => {
      let value = e.target.value.replace(/[^0-9]/g, '');
      if (value.length > 2) value = value.slice(0, 2);
      const numValue = parseInt(value) || 0;
      if (numValue > 59) value = '59';
      e.target.value = value;
    });
    minuteInput.addEventListener('blur', (e) => {
      let value = e.target.value;
      const numValue = parseInt(value) || 0;
      if (numValue < 0 || isNaN(numValue)) value = '00';
      else if (numValue > 59) value = '59';
      else value = String(numValue).padStart(2, '0');
      e.target.value = value;
    });

    // 初始化图标
    this.#initializeDateTimePickerIcons(overlay);

    return overlay;
  }

  #initializeDateTimePickerIcons(overlay) {
    const iconElements = overlay.querySelectorAll('.svg-icon[data-icon]');
    iconElements.forEach(element => {
      const iconName = element.getAttribute('data-icon');
      const iconHtml = this.getIconHtml(iconName);
      if (iconHtml) element.innerHTML = iconHtml;
    });
  }

  showDateTimePicker(inputElement) {
    if (!inputElement) return;

    const overlay = this.createDateTimePickerOverlay();
    this._pickerState.currentInput = inputElement;

    // 解析已有值
    if (inputElement.value) {
      const parsed = TestExecutionView.parseDateTimeString(inputElement.value);
      if (parsed) {
        this._pickerState.year = parsed.year;
        this._pickerState.month = parsed.month;
        this._pickerState.day = parsed.day;
        this._pickerState.selectedYear = parsed.year;
        this._pickerState.selectedMonth = parsed.month;
        this._pickerState.hour = parsed.hour;
        this._pickerState.minute = parsed.minute;
      }
    } else {
      const now = new Date();
      this._pickerState.year = now.getFullYear();
      this._pickerState.month = now.getMonth() + 1;
      this._pickerState.day = now.getDate();
      this._pickerState.selectedYear = now.getFullYear();
      this._pickerState.selectedMonth = now.getMonth() + 1;
      this._pickerState.hour = now.getHours();
      this._pickerState.minute = now.getMinutes();
    }

    this.renderDatePicker();
    overlay.classList.remove('hidden');
  }

  hideDateTimePicker() {
    if (this._pickerState.overlay) {
      this._pickerState.overlay.classList.add('hidden');
    }
    this._pickerState.currentInput = null;
  }

  navigatePicker(unit, direction) {
    if (unit === 'month') {
      this._pickerState.month += direction;
      if (this._pickerState.month > 12) {
        this._pickerState.month = 1;
        this._pickerState.year++;
      } else if (this._pickerState.month < 1) {
        this._pickerState.month = 12;
        this._pickerState.year--;
      }
    } else if (unit === 'year') {
      this._pickerState.year += direction;
    }
    this.renderDatePicker();
  }

  renderDatePicker() {
    const overlay = this._pickerState.overlay;
    if (!overlay) return;

    const yearSpan = overlay.querySelector('.picker-year');
    const monthSpan = overlay.querySelector('.picker-month');
    if (yearSpan) yearSpan.textContent = `${this._pickerState.year}年`;
    if (monthSpan) monthSpan.textContent = `${this._pickerState.month}月`;

    const daysContainer = overlay.querySelector('.datetime-picker-days');
    if (!daysContainer) return;
    daysContainer.innerHTML = '';

    const year = this._pickerState.year;
    const month = this._pickerState.month;
    const firstDay = new Date(year, month - 1, 1).getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    const today = new Date();

    // 填充空白
    for (let i = 0; i < firstDay; i++) {
      const empty = document.createElement('div');
      empty.className = 'datetime-picker-day empty';
      daysContainer.appendChild(empty);
    }

    // 填充日期
    for (let d = 1; d <= daysInMonth; d++) {
      const dayEl = document.createElement('div');
      dayEl.className = 'datetime-picker-day';
      dayEl.textContent = d;

      // 今天
      if (year === today.getFullYear() && month === today.getMonth() + 1 && d === today.getDate()) {
        dayEl.classList.add('today');
      }

      // 已选中（仅在当月且用户已选择的日期才显示选中状态）
      if (d === this._pickerState.day &&
          this._pickerState.selectedYear === year &&
          this._pickerState.selectedMonth === month) {
        dayEl.classList.add('selected');
      }

      dayEl.addEventListener('click', () => {
        this._pickerState.day = d;
        this._pickerState.selectedYear = year;
        this._pickerState.selectedMonth = month;
        this.renderDatePicker();
      });

      daysContainer.appendChild(dayEl);
    }

    // 更新时间输入
    const hourInput = overlay.querySelector('.hour-input');
    const minuteInput = overlay.querySelector('.minute-input');
    if (hourInput) hourInput.value = String(this._pickerState.hour).padStart(2, '0');
    if (minuteInput) minuteInput.value = String(this._pickerState.minute).padStart(2, '0');
  }

  confirmDateTimePicker() {
    const { currentInput, year, month, day } = this._pickerState;
    const overlay = this._pickerState.overlay;

    // 从时间输入框读取最新值
    const hourInput = overlay?.querySelector('.hour-input');
    const minuteInput = overlay?.querySelector('.minute-input');
    if (hourInput) this._pickerState.hour = Math.min(23, Math.max(0, parseInt(hourInput.value) || 0));
    if (minuteInput) this._pickerState.minute = Math.min(59, Math.max(0, parseInt(minuteInput.value) || 0));

    if (currentInput) {
      const pad = (n) => String(n).padStart(2, '0');
      currentInput.value = `${year}-${pad(month)}-${pad(day)} ${pad(this._pickerState.hour)}:${pad(this._pickerState.minute)}`;
    }
    this.hideDateTimePicker();
  }

  static parseDateTimeString(str) {
    if (!str) return null;
    // 支持 "YYYY-MM-DD HH:mm" 格式
    const match = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{1,2})$/);
    if (!match) return null;
    return {
      year: parseInt(match[1]),
      month: parseInt(match[2]),
      day: parseInt(match[3]),
      hour: parseInt(match[4]),
      minute: parseInt(match[5]),
    };
  }

  // ─── 工具方法 ──────────────────────────────────────────────────

  static formatDateTime(date) {
    if (!(date instanceof Date) || isNaN(date)) return '-';
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  static getScheduledPlanStatus(plan) {
    if (!plan) return { class: 'unknown', text: 'Unknown' };
    const now = new Date();
    const scheduledTime = plan.scheduledTime ? new Date(plan.scheduledTime) : null;

    if (plan.status === 'completed') {
      return { class: 'completed', text: window.i18n?.t('scheduledPlan.statusCompleted') || '已完成' };
    } else if (plan.status === 'running') {
      return { class: 'running', text: window.i18n?.t('scheduledPlan.statusRunning') || '运行中' };
    } else if (plan.status === 'cancelled') {
      return { class: 'cancelled', text: window.i18n?.t('scheduledPlan.statusCancelled') || '已取消' };
    } else if (plan.status === 'expired') {
      return { class: 'expired', text: window.i18n?.t('scheduledPlan.statusExpired') || '已过期' };
    } else if (scheduledTime && scheduledTime <= now) {
      return { class: 'overdue', text: window.i18n?.t('scheduledPlan.statusOverdue') || '已逾期' };
    } else {
      return { class: 'pending', text: window.i18n?.t('scheduledPlan.statusPending') || '待执行' };
    }
  }

  // ─── 私有方法 ──────────────────────────────────────────────────

  #escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}

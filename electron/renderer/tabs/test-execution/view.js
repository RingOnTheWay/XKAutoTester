/**
 * TestExecutionView - 测试执行 Tab View 层
 * 纯 DOM 操作，不调用 API，不管理状态
 * 通过 window.__XKAT_MODALS__ / window.__XKAT_APP__ / window.i18n 访问全局资源
 *
 * R10: 原 5 个 view mixin (directory/testPlans/output/planModal/scheduledReport)
 *      已内联到本类，移除 Object.assign prototype 注入。方法体保持不变，
 *      this 引用不变 (mixin 中 this 指实例，内联到 class 后仍指实例)。
 *      this.els / this.getIconHtml / this.escapeHtml / this.constructor.formatDateTime
 *      均通过实例属性/方法或静态方法访问，行为一致。
 */
import { Icons } from '../../icons.js';
import { escapeHtml as escapeHtmlUtil } from '../../core/utils/html.js';
import { getScheduledPlanStatus } from '../../core/utils/scheduledPlanStatus.js';
import DeviceSelectionModal from '../../components/device-selection-modal.js';
import DateTimePicker from '../../components/datetime-picker.js';

export class TestExecutionView {
  constructor() {
    this.els = {};
    this.#cacheElements();
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
      scheduledPlanSection: document.getElementById('scheduled-plan-section'),
      scheduledPlanList: document.getElementById('scheduled-plans-list'),
      newScheduledPlanBtn: document.getElementById('new-scheduled-plan-btn'),
      editScheduledPlanBtn: document.getElementById('edit-scheduled-plan-btn'),
      deleteScheduledPlanBtn: document.getElementById('delete-scheduled-plan-btn'),

      // 定时计划弹窗
      scheduledPlanModalOverlay: document.getElementById('scheduled-plan-modal-overlay'),
      scheduledPlanModalCloseBtn: document.getElementById('scheduled-plan-modal-close-btn'),
      scheduledPlanCancelBtn: document.getElementById('scheduled-plan-cancel-btn'),
      scheduledPlanForm: document.getElementById('scheduled-plan-form'),
      scheduledPlanModalTitle: document.getElementById('scheduled-plan-modal-title'),
      scheduledPlanNameInput: document.getElementById('scheduled-plan-name'),
      scheduledPlanTimeInput: document.getElementById('scheduled-plan-time'),
      scheduledPlanTestPlansList: document.getElementById('scheduled-test-plans-list'),
      saveScheduledPlanBtn: document.getElementById('save-scheduled-plan-btn'),
      updateScheduledPlanBtn: document.getElementById('update-scheduled-plan-btn'),

      // 报告弹窗
      reportModalOverlay: document.getElementById('report-modal-overlay'),
      reportPlanName: document.getElementById('report-plan-name'),
      reportRunsList: document.getElementById('report-runs-list'),
      reportNoRuns: document.getElementById('report-no-runs'),
      reportOpenBtn: document.getElementById('report-modal-open-btn'),
      reportCloseBtn: document.getElementById('report-modal-close-btn'),

      // 编辑设备连接标识弹窗
      editDeviceCloseBtn: document.getElementById('edit-device-id-modal-close-btn'),
      editDeviceCancelBtn: document.getElementById('edit-device-id-cancel-btn'),
      editDeviceConfirmBtn: document.getElementById('edit-device-id-confirm-btn'),
      editDeviceManageBtn: document.getElementById('edit-device-id-manage-btn'),
      editDeviceIdInput: document.getElementById('edit-device-id-input'),
      editAndroidVersionInput: document.getElementById('edit-android-version-input'),
      editBlePortInput: document.getElementById('edit-ble-port-input'),
      bleMockPortGroup: document.getElementById('ble-mock-port-group'),
      editPortManageBtn: document.getElementById('edit-port-manage-btn'),

      // 端口管理弹窗
      portModalCloseBtn: document.getElementById('port-modal-close-btn'),
      portModalCancelBtn: document.getElementById('port-modal-cancel-btn'),
      portModalConfirmBtn: document.getElementById('port-modal-confirm-btn'),
      portScanning: document.getElementById('port-scanning'),
      portList: document.getElementById('port-list'),

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

  // ─── 工具方法 ──────────────────────────────────────────────────

  static formatDateTime(date) {
    if (!(date instanceof Date) || isNaN(date)) return '-';
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  static getScheduledPlanStatus(plan) {
    // P2-2: 委托统一工具 (原与 model.js 双份重复)
    return getScheduledPlanStatus(plan);
  }

  // ─── 私有方法（公共化供内联方法调用） ──────────────────────────

  escapeHtml(str) {
    // P2-5: 统一实现 (renderer/core/utils/html.js)
    return escapeHtmlUtil(str);
  }

  // ═════════════════════════════════════════════════════════════════
  // ─── 目录显示 + 测试文件渲染（原 directoryMixin） ────────────────
  // ═════════════════════════════════════════════════════════════════

  updateSelectedDirectory(path, displayName) {
    const { selectedDirectory } = this.els;
    if (!selectedDirectory) return;
    if (path) {
      selectedDirectory.textContent = displayName || path;
      selectedDirectory.title = path;
      selectedDirectory.removeAttribute('data-i18n');
      // MVC: 颜色由 CSS .selected-path 统一管理 (var(--text-secondary)),与 test-case tab 一致
    } else {
      selectedDirectory.textContent = window.i18n.t('testExecution.noDirectorySelected');
      selectedDirectory.title = '';
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
      testFileList.innerHTML = `<div class="placeholder-message">${this.getIconHtml(
        'info',
        'vertical-align:middle;'
      )}<span style="vertical-align:middle;">${window.i18n.t('testExecution.noTestFilesInDir', { defaultValue: '当前目录下没有测试文件' })}</span></div>`;
      return;
    }

    files.forEach((file) => {
      const isChecked = selectedFiles?.includes(file) ? 'checked' : '';
      const item = document.createElement('div');
      item.className = 'test-file-item';
      item.innerHTML = `
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
          <input type="checkbox" value="${this.escapeHtml(file)}" ${isChecked}>
          <span>${this.escapeHtml(file)}</span>
        </label>
      `;
      testFileList.appendChild(item);
    });
  }

  // ═════════════════════════════════════════════════════════════════
  // ─── 测试计划列表 + 测试类型显示（原 testPlansMixin） ─────────────
  // ═════════════════════════════════════════════════════════════════

  renderTestPlans(plans, currentPlanId, onSelectPlan, runningPlanName = null) {
    const { testPlanList } = this.els;
    if (!testPlanList) return;
    testPlanList.innerHTML = '';

    if (!plans || plans.length === 0) {
      this.displayTestPlansPlaceholder(
        window.i18n.t('testExecution.noTestPlans', {
          defaultValue: '暂无测试计划',
        })
      );
      return;
    }

    plans.forEach((plan) => {
      const item = document.createElement('div');
      item.className = `test-plan-item${plan.id === currentPlanId ? ' selected' : ''}${plan.name === runningPlanName ? ' running' : ''}`;
      item.setAttribute('data-plan-id', plan.id);
      item.setAttribute('data-plan-name', plan.name);

      // 构建测试计划详细信息
      const fileCount = plan.testFiles ? plan.testFiles.length : 0;
      const typeCount = plan.testTypes ? plan.testTypes.length : 0;
      const fileInfo =
        fileCount > 0 ? `${fileCount} ${window.i18n.t('testExecution.files')}` : window.i18n.t('testExecution.noFiles');
      const typeInfo =
        typeCount > 0
          ? `${typeCount} ${window.i18n.t('testExecution.types')}`
          : window.i18n.t('testExecution.allTypes');

      // 循环设置信息
      const loopCount = plan.loopCount || 1;
      const continueOnFailure = plan.continueOnFailure !== false;
      const loopInfo = window.i18n.t('testExecution.loopInfo', {
        count: loopCount,
      });
      const continueInfo = !continueOnFailure
        ? `<span class="continue-info">${this.getIconHtml('warning')}<span>${window.i18n.t('testExecution.stopOnFailure')}</span></span>`
        : '';

      const descriptionHtml = plan.description
        ? `<div style="font-size: 12px; color: var(--text-secondary); margin-left: 1px;">${this.escapeHtml(plan.description)}</div>`
        : '';

      item.innerHTML = `
        ${this.getIconHtml('assignment')}
        <div class="test-plan-content">
          <div class="test-plan-header">
            <div style="font-weight: 500;">${this.escapeHtml(plan.name)}</div>
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
    testPlanList.querySelectorAll('.test-plan-item.selected').forEach((el) => el.classList.remove('selected'));
    if (planId) {
      const target = testPlanList.querySelector(`.test-plan-item[data-plan-id="${CSS.escape(planId)}"]`);
      if (target) target.classList.add('selected');
    }
  }

  /**
   * 设置测试计划项的运行中状态（边框渐变动画）
   * @param {string|null} planName - 测试计划名称，null 表示清除运行状态
   * @param {boolean} isRunning - 是否正在运行
   */
  setTestPlanRunning(planName, isRunning) {
    const { testPlanList } = this.els;
    if (!testPlanList) return;
    testPlanList.querySelectorAll('.test-plan-item.running').forEach((el) => el.classList.remove('running'));
    if (isRunning && planName) {
      const target = testPlanList.querySelector(`.test-plan-item[data-plan-name="${CSS.escape(planName)}"]`);
      if (target) target.classList.add('running');
    }
  }

  highlightTestPlanItems(planIds) {
    const { testPlanList } = this.els;
    if (!testPlanList) return;
    testPlanList.querySelectorAll('.test-plan-item.selected').forEach((el) => el.classList.remove('selected'));
    if (planIds && planIds.length > 0) {
      planIds.forEach((id) => {
        const target = testPlanList.querySelector(`.test-plan-item[data-plan-id="${CSS.escape(id)}"]`);
        if (target) target.classList.add('selected');
      });
    }
  }

  displayTestPlansPlaceholder(message) {
    const { testPlanList } = this.els;
    if (!testPlanList) return;
    testPlanList.innerHTML = `<div class="placeholder-message">${this.getIconHtml(
      'info',
      'vertical-align:middle;'
    )}<span style="vertical-align:middle;">${message}</span></div>`;
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
      placeholderElement.innerHTML = `${this.getIconHtml('info')}<span>${window.i18n.t('testExecution.noMarkers', { defaultValue: '没有找到pytest标记，将执行所有测试' })}</span>`;
      testTypeSelector.appendChild(placeholderElement);
      return;
    }

    // 去重
    const uniqueMarkers = [];
    const seenNames = new Set();
    markers.forEach((marker) => {
      const markerName = typeof marker === 'string' ? marker : marker?.name;
      if (markerName && !seenNames.has(markerName)) {
        seenNames.add(markerName);
        uniqueMarkers.push(marker);
      }
    });

    testTypeSelector.innerHTML = '';
    const fragment = document.createDocumentFragment();
    uniqueMarkers.forEach((marker) => {
      const markerName = typeof marker === 'string' ? marker : marker?.name;
      const markerDesc = typeof marker === 'string' ? marker : marker?.description || marker?.name;
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
    return Array.from(checked).map((cb) => cb.value);
  }

  // ═════════════════════════════════════════════════════════════════
  // ─── 测试执行 UI 状态 + 输出显示 + 通知（原 outputMixin） ────────
  // ═════════════════════════════════════════════════════════════════

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
      progressStatus.textContent =
        window.i18n.t('testExecution.loopProgress', { current, total }) || `循环 ${current}/${total}`;
    }
  }

  appendOutputToDOM(text, isError = false) {
    const { testOutput } = this.els;
    if (!testOutput) return;

    // 移除欢迎消息
    const welcome = testOutput.querySelector('.welcome-message');
    if (welcome) welcome.remove();

    // 清理所有非元素子节点（HTML 源码中的缩进/换行文本节点）
    const textNodes = Array.from(testOutput.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE);
    textNodes.forEach((n) => n.remove());

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
    // MVC: has-content 类管理是 view 内部状态,由 view 自己维护
    testOutput.classList.remove('has-content');
    // 恢复欢迎消息（使用紧凑格式避免产生空白文本节点）
    const welcome = document.createElement('div');
    welcome.className = 'welcome-message';
    welcome.innerHTML = `<div class="welcome-text-container"><span class="welcome-text">${window.i18n.t('testExecution.welcome')}</span><span class="welcome-app-name">XKAutoTester</span></div><p>${window.i18n.t('testExecution.createTestPlan')}</p>`;
    testOutput.appendChild(welcome);
  }

  showError(message) {
    const { testOutput } = this.els;
    if (!testOutput) return;
    const welcome = testOutput.querySelector('.welcome-message');
    if (welcome) welcome.remove();

    const line = document.createElement('div');
    line.className = 'output-line error';
    line.innerHTML = `${this.getIconHtml('error', 'vertical-align:middle;color:var(--error);margin-right:4px;')}<span style="vertical-align:middle;">${this.escapeHtml(message)}</span>`;
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
    line.innerHTML = `${this.getIconHtml('check_circle', 'vertical-align:middle;color:var(--success);margin-right:4px;')}<span style="vertical-align:middle;">${this.escapeHtml(message)}</span>`;
    testOutput.appendChild(line);
    testOutput.scrollTop = testOutput.scrollHeight;
  }

  // ═════════════════════════════════════════════════════════════════
  // ─── 测试计划弹窗 + 编辑设备弹窗 + 文件/类型渲染（原 planModalMixin）
  // ═════════════════════════════════════════════════════════════════

  openPlanModal() {
    window.__XKAT_MODALS__?.plan?.open();
  }

  closePlanModal() {
    window.__XKAT_MODALS__?.plan?.close();
  }

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
  }

  // ─── 编辑设备连接标识弹窗 ───────────────────────────────────────

  openEditDeviceIdModal({
    deviceName = '',
    platformVersion = '',
    blePort = '',
    isAndroid = false,
    hasBleSteps = false,
  } = {}) {
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

  /**
   * 批量绑定编辑设备连接标识弹窗按钮
   * @param {Object} handlers - { onClose, onCancel, onConfirm, onManageDevice, onManagePort }
   * @returns {Function} unbind 函数
   */
  bindEditDeviceModalButtons({ onClose, onCancel, onConfirm, onManageDevice, onManagePort } = {}) {
    const unbinds = [];
    const { editDeviceCloseBtn, editDeviceCancelBtn, editDeviceConfirmBtn, editDeviceManageBtn, editPortManageBtn } =
      this.els;
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
    return () => unbinds.forEach((fn) => fn());
  }

  /**
   * 检查蓝牙端口分组当前是否可见
   * @returns {boolean}
   */
  isBleMockPortGroupVisible() {
    const { bleMockPortGroup } = this.els;
    return !!bleMockPortGroup?.style.display?.includes('block');
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
  }

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
  }

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
  }

  /**
   * 显示设备选择弹窗 (MVC: view 负责 UI 组件创建)
   * P3-15: 单例复用 (原每次 new DeviceSelectionModal 触发全量 #cacheDom)
   * @param {Object} options - 弹窗选项 { mode: 'test' | ... }
   * @returns {Promise<string>} 用户选择的 deviceId
   */
  async showDeviceSelection(options) {
    if (!this._deviceSelectionModal) {
      this._deviceSelectionModal = new DeviceSelectionModal();
    }
    return await this._deviceSelectionModal.show(options);
  }

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
    const loadStart = Date.now();
    // P1-10: loading 时长自适应 — 原固定等满 1s, 数据已就绪也白等
    modalTestFileList.innerHTML = `<div class="placeholder-message modal-loading-placeholder">${this.getIconHtml(
      'refresh',
      'animation: spin 1s linear infinite; vertical-align:middle;'
    )}<span style="vertical-align:middle;">${window.i18n.t('testExecution.loadingFiles', { defaultValue: '加载中...' })}</span></div>`;

    // 统一 selectedFiles 为路径字符串数组（兼容对象数组与字符串数组）
    const selectedPaths = (selectedFiles || []).map((f) => (typeof f === 'string' ? f : f?.path)).filter(Boolean);

    // P1-10: 并行获取所有文件元数据 (原 for 循环内串行 await getFileInfo,
    // N 个文件 = N 次 IPC 往返, 弹窗打开明显卡顿)
    const fileInfos = await Promise.all(
      (files || []).map(async (file) => {
        const filePath = typeof file === 'string' ? file : file?.path;
        const fileName = typeof file === 'string' ? file.split(/[\\/]/).pop() : file?.name;
        if (!filePath) return null;
        let testCaseFileName = fileName;
        if (testCaseFileName && testCaseFileName.endsWith('.py')) {
          testCaseFileName = testCaseFileName.slice(0, -3);
        }
        let platform = null;
        let deviceName = '';
        let hasBleSteps = false;
        let blePort = '';
        try {
          const result = getFileInfo ? await getFileInfo(testCaseFileName) : null;
          if (result && result.data) {
            platform = result.data.platform || null;
            deviceName = result.data.deviceConfig?.deviceName || '';
            blePort = result.data.bleDevice?.port || '';
            hasBleSteps = result.data.steps && result.data.steps.some((step) => step.type === 'ble');
          }
        } catch (error) {
          // 忽略错误，使用默认值
        }
        return {
          file,
          filePath,
          fileName,
          testCaseFileName,
          platform,
          deviceName,
          hasBleSteps,
          blePort,
        };
      })
    );
    const infos = (fileInfos || []).filter(Boolean);

    // 最小 loading 时长 300ms (防闪烁), 超过则不再补等待
    const elapsed = Date.now() - loadStart;
    if (elapsed < 300) {
      await new Promise((resolve) => setTimeout(resolve, 300 - elapsed));
    }
    modalTestFileList.innerHTML = '';

    if (!files || files.length === 0) {
      modalTestFileList.innerHTML = `<div class="placeholder-message">${this.getIconHtml(
        'info',
        'vertical-align:middle;'
      )}<span style="vertical-align:middle;">${window.i18n.t('testExecution.noTestFilesInDir', { defaultValue: '当前目录下没有测试文件' })}</span></div>`;
      return;
    }

    for (const info of infos) {
      const { filePath, fileName, testCaseFileName } = info;
      const isChecked = selectedPaths.includes(filePath) ? 'checked' : '';

      // 显示编辑按钮的条件: 安卓平台 或 有蓝牙步骤
      const isAndroid = info.platform && info.platform.toLowerCase() === 'android';
      const hasDeviceName = info.deviceName && info.deviceName !== '{{DEVICE_NAME}}' && info.deviceName.trim() !== '';
      const showEditBtn = isAndroid || info.hasBleSteps;

      // 构建设备信息显示（安卓用例显示设备ID，蓝牙用例显示端口）
      let deviceInfoHtml = '';
      let editBtnHtml = '';
      if (showEditBtn) {
        let infoItems = [];

        // 安卓设备信息
        if (isAndroid) {
          const deviceDisplay = hasDeviceName ? info.deviceName : window.i18n.t('testExecution.deviceSelection.notSet');
          const deviceStatusClass = hasDeviceName ? 'device-set' : 'device-not-set';
          infoItems.push(`
            <span class="test-file-device-info ${deviceStatusClass}" data-file-name="${this.escapeHtml(testCaseFileName)}" data-type="device">
              ${this.getIconHtml('devices')}
              <span class="device-name-display">${this.escapeHtml(deviceDisplay)}</span>
            </span>
          `);
        }

        // 蓝牙端口信息
        if (info.hasBleSteps) {
          const portDisplay = info.blePort || window.i18n.t('testExecution.deviceSelection.notSet');
          const portStatusClass = info.blePort ? 'device-set' : 'device-not-set';
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
          <button type="button" class="edit-device-btn" data-file-name="${this.escapeHtml(testCaseFileName)}" data-file-path="${this.escapeHtml(filePath)}" data-has-ble="${info.hasBleSteps}" data-is-android="${isAndroid}">
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
      // 选中态样式跟随主题色（.selected 类）
      if (checkbox.checked) item.classList.add('selected');
      checkbox.addEventListener('change', (e) => {
        item.classList.toggle('selected', e.target.checked);
        onFileCheck?.(info, e.target.checked);
      });

      // 为整个文件项添加点击事件，点击时切换复选框状态
      item.addEventListener('click', (e) => {
        // 排除编辑按钮的点击
        if (e.target.closest('.edit-device-btn')) return;
        // 复选框自身点击走原生行为
        if (e.target.type === 'checkbox') return;
        // label 点击: 阻止原生 for 关联 (防止与手动 toggle 竞态导致双 flip,
        // 以及 id 特殊字符导致关联失效), 统一手动切换保证恰好一次 change
        if (e.target.closest('label')) {
          e.preventDefault();
        }
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
      modalTestTypeList.innerHTML = `<div class="placeholder-message">${this.getIconHtml(
        'info',
        'vertical-align:middle;'
      )}<span style="vertical-align:middle;">${window.i18n.t('testExecution.noMarkers', { defaultValue: '没有找到pytest标记，将执行所有测试' })}</span></div>`;
      return;
    }

    markers.forEach((marker) => {
      // marker 可能是字符串或 {name, description} 对象
      const markerName = typeof marker === 'string' ? marker : marker?.name;
      const markerDesc = typeof marker === 'string' ? marker : marker?.description || marker?.name;
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
      checkbox.checked = selectedTypes?.includes(markerName) ?? false;
      // 选中态样式跟随主题色（.selected 类）
      if (checkbox.checked) item.classList.add('selected');
      checkbox.addEventListener('change', (e) => {
        item.classList.toggle('selected', e.target.checked);
        onTypeCheck?.(markerName, e.target.checked);
      });
      // 与测试文件项一致: label 点击统一手动切换, 防止原生 for 关联竞态/失效
      item.addEventListener('click', (e) => {
        if (e.target.type === 'checkbox') return;
        if (e.target.closest('label')) {
          e.preventDefault();
        }
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event('change'));
      });
      modalTestTypeList.appendChild(item);
    });
  }

  // 渲染测试类型占位符（未选择测试文件时提示）
  renderModalTestTypesPlaceholder() {
    const { modalTestTypeList } = this.els;
    if (!modalTestTypeList) return;
    modalTestTypeList.innerHTML = `<div class="placeholder-message">${this.getIconHtml(
      'info',
      'vertical-align:middle;'
    )}<span style="vertical-align:middle;">${window.i18n.t('testExecution.selectTestFileFirst', { defaultValue: '请先选择测试文件' })}</span></div>`;
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
    return Array.from(checked).map((cb) => {
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
    return Array.from(checked).map((cb) => cb.value);
  }

  preselectModalItems(plan) {
    const { planNameInput, planDescriptionInput, planLoopCountInput, planContinueOnFailureCheckbox, updatePlanBtn } =
      this.els;

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
      const selectedPaths = plan.testFiles.map((f) => (typeof f === 'string' ? f : f?.path)).filter(Boolean);
      this.els.modalTestFileList.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        cb.checked = selectedPaths.includes(cb.value);
        // 同步选中态样式（跟随主题色）
        cb.closest('.modal-test-file-item')?.classList.toggle('selected', cb.checked);
      });
    }
    if (plan.testTypes && this.els.modalTestTypeList) {
      this.els.modalTestTypeList.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        cb.checked = plan.testTypes.includes(cb.value);
        // 同步选中态样式（跟随主题色）
        cb.closest('.modal-test-type-item')?.classList.toggle('selected', cb.checked);
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

  // ═════════════════════════════════════════════════════════════════
  // ─── 定时计划列表/弹窗 + 报告弹窗 + 端口管理 + Section 显隐（原 scheduledReportMixin）
  // ═════════════════════════════════════════════════════════════════

  // ─── 定时计划显示 ──────────────────────────────────────────────

  renderScheduledPlansList(plans, currentPlanId, onSelectPlan, runningPlanId = null) {
    const { scheduledPlanList } = this.els;
    if (!scheduledPlanList) return;
    scheduledPlanList.innerHTML = '';

    if (!plans || plans.length === 0) {
      scheduledPlanList.innerHTML = `<div class="placeholder-message">${this.getIconHtml(
        'info',
        'vertical-align:middle;'
      )}<span style="vertical-align:middle;">${window.i18n.t('testExecution.noScheduledPlans')}</span></div>`;
      return;
    }

    plans.forEach((plan) => {
      const item = document.createElement('div');
      item.className = `scheduled-plan-item${plan.id === currentPlanId ? ' selected' : ''}${plan.id === runningPlanId ? ' running' : ''}`;
      item.setAttribute('data-plan-id', plan.id);
      const formattedTime = plan.scheduledTime ? this.constructor.formatDateTime(new Date(plan.scheduledTime)) : '-';
      const status = this.constructor.getScheduledPlanStatus(plan);
      const planNames = plan.testPlanNames ? plan.testPlanNames.join(', ') : window.i18n.t('testExecution.noTestPlans');

      item.innerHTML = `
        ${this.getIconHtml('schedule')}
        <div class="test-plan-content">
          <div class="test-plan-header">
            <div style="font-weight: 500;">${this.escapeHtml(plan.name)}</div>
          </div>
          <div style="font-size: 12px; color: var(--text-secondary);">${this.escapeHtml(planNames)}</div>
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
    scheduledPlanList
      .querySelectorAll('.scheduled-plan-item.selected')
      .forEach((el) => el.classList.remove('selected'));
    if (planId) {
      const target = scheduledPlanList.querySelector(`.scheduled-plan-item[data-plan-id="${CSS.escape(planId)}"]`);
      if (target) target.classList.add('selected');
    }
  }

  /**
   * 设置定时计划项的运行中状态（边框渐变动画）
   * @param {string|null} planId - 定时计划 ID，null 表示清除运行状态
   * @param {boolean} isRunning - 是否正在运行
   */
  setScheduledPlanRunning(planId, isRunning) {
    const { scheduledPlanList } = this.els;
    if (!scheduledPlanList) return;
    scheduledPlanList.querySelectorAll('.scheduled-plan-item.running').forEach((el) => el.classList.remove('running'));
    if (isRunning && planId) {
      const target = scheduledPlanList.querySelector(`.scheduled-plan-item[data-plan-id="${CSS.escape(planId)}"]`);
      if (target) target.classList.add('running');
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
    // 注: DateTimePicker 无 destroy 方法, 但构造时通过 inputElement.dataset.pickerInitialized 防止重复绑定;
    //     同一 input 重复 new 不会叠加监听器, 旧实例被 GC 回收, 无资源累积/泄漏。
    const { scheduledPlanTimeInput } = this.els;
    if (scheduledPlanTimeInput) {
      const mountContainer = document.getElementById('scheduled-plan-modal-overlay') || document.body;
      new DateTimePicker(scheduledPlanTimeInput, { mountContainer });
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
      scheduledPlanTestPlansList.innerHTML = `<div class="placeholder-message">${this.getIconHtml(
        'info',
        'vertical-align:middle;'
      )}<span style="vertical-align:middle;">${window.i18n.t('testExecution.noTestPlans', { defaultValue: '暂无测试计划' })}</span></div>`;
      return;
    }

    const fragment = document.createDocumentFragment();
    testPlans.forEach((plan) => {
      const isSelected = selectedPlanIds?.includes(plan.id);
      const planElement = document.createElement('div');
      planElement.className = 'checkbox-item scheduled-plan-checkbox';
      planElement.innerHTML = `
        <input type="checkbox" id="scheduled-plan-${this.escapeHtml(plan.id)}" value="${this.escapeHtml(plan.id)}" ${isSelected ? 'checked' : ''}>
        <label for="scheduled-plan-${this.escapeHtml(plan.id)}">${this.escapeHtml(plan.name)}</label>
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
    return Array.from(checked).map((cb) => cb.value);
  }

  // ─── 报告弹窗 ──────────────────────────────────────────────────

  openReportModal() {
    window.__XKAT_MODALS__?.report?.open();
  }

  closeReportModal() {
    window.__XKAT_MODALS__?.report?.close();
  }

  renderReportRuns(runs, selectedRunId, onSelectRun, onDeleteRun) {
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

    runs.forEach((run) => {
      const item = this._buildRunItemElement(run, {
        selectedRunId,
        onSelectRun: (r) => {
          // 取消其他选中 (扁平列表场景), 当前 item 由 _buildRunItemElement 统一 add
          reportRunsList.querySelectorAll('.report-run-item').forEach((i) => i.classList.remove('selected'));
          onSelectRun?.(r);
        },
        onDeleteRun,
      });
      if (item) reportRunsList.appendChild(item);
    });
  }

  /**
   * 构造单条运行记录 DOM 元素 (renderReportRuns / renderScheduledReportGroups 共用)
   * @param {Object} run - 运行记录
   * @param {Object} callbacks - { selectedRunId, onSelectRun, onDeleteRun }
   * @returns {HTMLElement|null}
   * @private
   */
  _buildRunItemElement(run, { selectedRunId, onSelectRun, onDeleteRun } = {}) {
    if (!run) return null;
    const item = document.createElement('div');
    item.className = `report-run-item${run.available ? '' : ' unavailable'}${run.index === selectedRunId ? ' selected' : ''}`;
    item.setAttribute('data-index', run.index);
    item.setAttribute('data-path', run.reportPath || '');
    item.setAttribute('data-available', run.available);
    if (run.sourcePlanName) item.setAttribute('data-source-plan', run.sourcePlanName);
    const timeStr = this.escapeHtml(run.timestamp || '-');
    const statusIcon = run.available
      ? this.getIconHtml('check_circle', 'vertical-align:middle;color:var(--success);margin-right:4px;')
      : this.getIconHtml('cancel', 'vertical-align:middle;color:var(--error);margin-right:4px;');
    const latestBadge = run.isLatest
      ? `<span class="report-latest-badge">${window.i18n.t('reportModal.latest')}</span>`
      : '';
    const statusText = run.available
      ? window.i18n.t('reportModal.reportAvailable')
      : window.i18n.t('reportModal.reportUnavailable');
    const deleteIcon = this.getIconHtml('delete', 'vertical-align:middle;');
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
        <button class="report-run-delete-btn" title="${window.i18n.t('reportModal.delete')}">${deleteIcon}</button>
      </div>
    `;
    item.addEventListener('click', () => {
      if (!run.available) return;
      // 先回调 (回调内 remove 其他 selected), 再 add 当前 (避免被 remove 掉)
      onSelectRun?.(run);
      item.classList.add('selected');
    });
    const deleteBtn = item.querySelector('.report-run-delete-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        onDeleteRun?.(run);
      });
    }
    return item;
  }

  /**
   * 渲染定时计划整合报告 (分组展示, 默认收起, 点击分组头展开)
   * 分组排序已由后端完成 (按分组内最新 run 时间倒序)
   * 分组内 runs 排序已由后端完成 (时间倒序, 分组内各自标 isLatest)
   * @param {Array<{sourcePlanName: string, runs: Array}>} groups
   * @param {Function} onSelectRun - 选中某条 run
   * @param {Function} onDeleteRun - 删除某条 run
   */
  renderScheduledReportGroups(groups, onSelectRun, onDeleteRun) {
    const { reportRunsList } = this.els;
    if (!reportRunsList) return;
    reportRunsList.innerHTML = '';

    const noRunsEl = document.getElementById('report-no-runs');
    const validGroups = (groups || []).filter((g) => g && g.runs && g.runs.length > 0);

    if (validGroups.length === 0) {
      if (noRunsEl) noRunsEl.classList.remove('hidden');
      reportRunsList.classList.add('hidden');
      return;
    }

    if (noRunsEl) noRunsEl.classList.add('hidden');
    reportRunsList.classList.remove('hidden');

    const fragment = document.createDocumentFragment();
    validGroups.forEach((group) => {
      const groupEl = document.createElement('div');
      groupEl.className = 'report-group collapsed'; // 默认收起
      groupEl.setAttribute('data-source-plan', group.sourcePlanName);

      const count = group.runs.length;
      const arrowIcon = this.getIconHtml(
        'keyboard_arrow_right',
        'vertical-align:middle;font-size:16px;transition:transform 0.2s ease;'
      );
      const folderIcon = this.getIconHtml(
        'folder',
        'vertical-align:middle;color:var(--primary);margin-right:6px;font-size:16px;'
      );

      const header = document.createElement('div');
      header.className = 'report-group-header';
      header.innerHTML = `
        <span class="report-group-arrow">${arrowIcon}</span>
        <span class="report-group-icon">${folderIcon}</span>
        <span class="report-group-name">${this.escapeHtml(group.sourcePlanName)}</span>
        <span class="report-group-count">${count}</span>
      `;
      header.addEventListener('click', () => {
        groupEl.classList.toggle('collapsed');
        groupEl.classList.toggle('expanded');
      });
      groupEl.appendChild(header);

      const body = document.createElement('div');
      body.className = 'report-group-body';
      group.runs.forEach((run) => {
        const item = this._buildRunItemElement(run, {
          onSelectRun: (r) => {
            // 跨分组取消选中, 当前 item 由 _buildRunItemElement 统一 add
            reportRunsList.querySelectorAll('.report-run-item').forEach((i) => i.classList.remove('selected'));
            onSelectRun?.(r);
          },
          onDeleteRun,
        });
        if (item) body.appendChild(item);
      });
      groupEl.appendChild(body);

      fragment.appendChild(groupEl);
    });
    reportRunsList.appendChild(fragment);
  }

  resetReportModalButtons() {
    const { reportOpenBtn } = this.els;
    if (reportOpenBtn) reportOpenBtn.disabled = true;
  }

  enableViewReportButton(enabled) {
    const { reportOpenBtn } = this.els;
    if (reportOpenBtn) reportOpenBtn.disabled = !enabled;
  }

  /**
   * 设置报告弹窗的计划名标题
   * @param {string} name - 计划名称
   */
  setReportPlanName(name) {
    const { reportPlanName } = this.els;
    if (reportPlanName) reportPlanName.textContent = name || '';
  }

  /**
   * 显示报告加载状态
   */
  showReportLoading() {
    const { reportRunsList, reportNoRuns } = this.els;
    if (reportRunsList) {
      reportRunsList.innerHTML = `
        <div class="report-loading">
          <div class="report-loading-spinner"></div>
          <span data-i18n="reportModal.loading">${window.i18n.t('reportModal.loading')}</span>
        </div>
      `;
      reportRunsList.classList.remove('hidden');
    }
    if (reportNoRuns) reportNoRuns.classList.add('hidden');
  }

  /**
   * 显示报告加载错误
   * @param {string} errorMsg - 错误消息
   */
  showReportError(errorMsg) {
    const { reportRunsList } = this.els;
    if (reportRunsList) {
      reportRunsList.innerHTML = `
        <div class="report-no-runs">
          <span class="svg-icon" data-icon="error"></span>
          <span>${errorMsg}</span>
        </div>
      `;
    }
  }

  // ─── 定时计划弹窗扩展 ──────────────────────────────────────────

  /**
   * 设置定时计划弹窗标题
   * @param {string} title - 标题文本
   */
  setScheduledPlanModalTitle(title) {
    const { scheduledPlanModalTitle } = this.els;
    if (scheduledPlanModalTitle) scheduledPlanModalTitle.textContent = title;
  }

  /**
   * 填充定时计划表单（自动将 ISO 时间转换为 "YYYY-MM-DD HH:mm" 格式）
   * @param {Object} data - { name, scheduledTime }
   */
  fillScheduledPlanForm({ name = '', scheduledTime = null } = {}) {
    const { scheduledPlanNameInput, scheduledPlanTimeInput } = this.els;
    if (scheduledPlanNameInput) scheduledPlanNameInput.value = name || '';

    if (scheduledTime && scheduledPlanTimeInput) {
      const date = new Date(scheduledTime);
      if (!isNaN(date.getTime())) {
        const pad = (n) => String(n).padStart(2, '0');
        scheduledPlanTimeInput.value = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
      } else {
        scheduledPlanTimeInput.value = scheduledTime;
      }
    } else if (scheduledPlanTimeInput) {
      scheduledPlanTimeInput.value = '';
    }
  }

  /**
   * 设置定时计划弹窗模式：控制保存/更新按钮可见性
   * @param {'new'|'edit'} mode - 'new' 显示保存按钮，'edit' 显示更新按钮
   */
  setScheduledPlanModalMode(mode) {
    const { saveScheduledPlanBtn, updateScheduledPlanBtn } = this.els;
    if (mode === 'edit') {
      if (saveScheduledPlanBtn) saveScheduledPlanBtn.classList.add('hidden');
      if (updateScheduledPlanBtn) updateScheduledPlanBtn.classList.remove('hidden');
    } else {
      if (saveScheduledPlanBtn) saveScheduledPlanBtn.classList.remove('hidden');
      if (updateScheduledPlanBtn) updateScheduledPlanBtn.classList.add('hidden');
    }
  }

  /**
   * 绑定定时计划表单 submit 事件
   * @param {Function} handler - submit 处理函数
   * @returns {Function} unbind 函数
   */
  bindScheduledPlanFormSubmit(handler) {
    const { scheduledPlanForm } = this.els;
    if (!scheduledPlanForm) return () => {};
    const submitHandler = (e) => {
      e.preventDefault();
      handler();
    };
    scheduledPlanForm.addEventListener('submit', submitHandler);
    return () => scheduledPlanForm.removeEventListener('submit', submitHandler);
  }

  // ─── 端口管理弹窗 ──────────────────────────────────────────────

  /**
   * 批量绑定端口管理弹窗按钮
   * @param {Object} handlers - { onClose, onCancel, onConfirm }
   * @returns {Function} unbind 函数
   */
  bindPortModalButtons({ onClose, onCancel, onConfirm } = {}) {
    const unbinds = [];
    const { portModalCloseBtn, portModalCancelBtn, portModalConfirmBtn } = this.els;
    if (portModalCloseBtn && onClose) {
      const h = () => onClose();
      portModalCloseBtn.addEventListener('click', h);
      unbinds.push(() => portModalCloseBtn.removeEventListener('click', h));
    }
    if (portModalCancelBtn && onCancel) {
      const h = () => onCancel();
      portModalCancelBtn.addEventListener('click', h);
      unbinds.push(() => portModalCancelBtn.removeEventListener('click', h));
    }
    if (portModalConfirmBtn && onConfirm) {
      const h = () => onConfirm();
      portModalConfirmBtn.addEventListener('click', h);
      unbinds.push(() => portModalConfirmBtn.removeEventListener('click', h));
    }
    return () => unbinds.forEach((fn) => fn());
  }

  /**
   * 显示端口扫描中状态（禁用确认按钮）
   */
  showPortScanningState() {
    const { portScanning, portList, portModalConfirmBtn } = this.els;
    if (portScanning) portScanning.style.display = 'flex';
    if (portList) portList.classList.add('hidden');
    if (portModalConfirmBtn) portModalConfirmBtn.disabled = true;
  }

  /**
   * 渲染端口扫描结果列表
   * @param {Array} ports - 端口数组 [{ deviceId, name, ... }]
   * @param {Function} onSelect - 选中端口回调 (port) => void
   */
  renderPortList(ports, onSelect) {
    const { portList, portModalConfirmBtn, portScanning } = this.els;
    if (!portList) return;
    if (portScanning) portScanning.style.display = 'none';
    portList.classList.remove('hidden');
    portList.innerHTML = '';
    ports.forEach((port) => {
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
        portList.querySelectorAll('.device-item').forEach((i) => i.classList.remove('selected'));
        item.classList.add('selected');
        if (portModalConfirmBtn) portModalConfirmBtn.disabled = false;
        onSelect?.(port);
      });
      portList.appendChild(item);
    });
  }

  /**
   * 渲染端口列表空态
   */
  renderPortListEmpty() {
    const { portList, portScanning } = this.els;
    if (portScanning) portScanning.style.display = 'none';
    if (portList) {
      portList.classList.remove('hidden');
      portList.innerHTML = `
        <div style="padding:16px;text-align:center;color:var(--text-secondary);">
          ${window.i18n.t('testExecution.deviceSelection.noPortsFound', { defaultValue: '未找到串口设备' })}
        </div>
      `;
    }
  }

  /**
   * 渲染端口列表错误状态
   * @param {string} errorMsg - 错误消息
   */
  renderPortListError(errorMsg) {
    const { portList, portScanning } = this.els;
    if (portScanning) portScanning.style.display = 'none';
    if (portList) {
      portList.classList.remove('hidden');
      portList.innerHTML = `
        <div style="padding:16px;text-align:center;color:var(--text-secondary);">
          ${errorMsg || window.i18n.t('testExecution.deviceSelection.scanPortsFailed', { defaultValue: '获取串口列表失败' })}
        </div>
      `;
    }
  }

  /**
   * 隐藏端口扫描状态（用于扫描完成的过渡）
   */
  hidePortScanningState() {
    const { portScanning, portList } = this.els;
    if (portScanning) portScanning.style.display = 'none';
    if (portList) portList.classList.remove('hidden');
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
   * 设置蓝牙端口输入框的值
   * @param {string} portId - 端口 ID
   */
  setBlePortInput(portId) {
    const { editBlePortInput } = this.els;
    if (editBlePortInput && portId) {
      editBlePortInput.value = portId;
    }
  }

  // ─── Section 显隐 ──────────────────────────────────────────────

  /**
   * 显示测试计划区域
   */
  showTestPlanSection() {
    const { testPlanSection } = this.els;
    if (testPlanSection) testPlanSection.classList.remove('hidden');
  }

  /**
   * 显示定时计划区域
   */
  showScheduledPlanSection() {
    const { scheduledPlanSection } = this.els;
    if (scheduledPlanSection) scheduledPlanSection.classList.remove('hidden');
  }
}

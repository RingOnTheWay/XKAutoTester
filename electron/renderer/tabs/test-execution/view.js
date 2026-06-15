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

  renderTestFiles(files, selectedFiles) {
    const { testFileList } = this.els;
    if (!testFileList) return;
    testFileList.innerHTML = '';

    if (!files || files.length === 0) {
      testFileList.innerHTML = `<div class="placeholder-message">${
        this.getIconHtml('info', 'vertical-align:middle;')
      }<span style="vertical-align:middle;">${window.i18n.t('testExecution.noTestFiles') || '未找到测试文件'}</span></div>`;
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

  displayTestTypes(markers, placeholder, forceRender, onTypeChange) {
    const { testTypeSelector } = this.els;
    if (!testTypeSelector) return;

    // 如果有占位消息且非强制渲染
    if (placeholder && !forceRender) {
      testTypeSelector.innerHTML = `<div class="placeholder-message">${
        this.getIconHtml('info', 'vertical-align:middle;')
      }<span style="vertical-align:middle;">${placeholder}</span></div>`;
      return;
    }

    if (!markers || markers.length === 0) {
      testTypeSelector.innerHTML = `<div class="placeholder-message">${
        this.getIconHtml('info', 'vertical-align:middle;')
      }<span style="vertical-align:middle;">${window.i18n.t('testExecution.noTestTypes') || '未找到测试类型'}</span></div>`;
      return;
    }

    testTypeSelector.innerHTML = '';
    markers.forEach(marker => {
      const label = document.createElement('label');
      label.className = 'test-type-item';
      label.innerHTML = `
        <input type="checkbox" value="${marker}">
        <span>${marker}</span>
      `;
      const checkbox = label.querySelector('input');
      checkbox.addEventListener('change', () => onTypeChange?.());
      testTypeSelector.appendChild(label);
    });
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

    const line = document.createElement('div');
    line.className = isError ? 'output-line error' : 'output-line';
    line.textContent = text;
    testOutput.appendChild(line);
    testOutput.scrollTop = testOutput.scrollHeight;
  }

  clearOutputDisplay() {
    const { testOutput } = this.els;
    if (!testOutput) return;
    testOutput.innerHTML = '';
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

  renderModalTestFiles(files, selectedFiles, onFileCheck) {
    const { modalTestFileList } = this.els;
    if (!modalTestFileList) return;
    modalTestFileList.innerHTML = '';

    if (!files || files.length === 0) {
      modalTestFileList.innerHTML = `<div class="placeholder-message">${
        this.getIconHtml('info', 'vertical-align:middle;')
      }<span style="vertical-align:middle;">${window.i18n.t('testExecution.noTestFiles') || '未找到测试文件'}</span></div>`;
      return;
    }

    files.forEach(file => {
      const isChecked = selectedFiles?.includes(file) ? 'checked' : '';
      const label = document.createElement('label');
      label.className = 'checkbox-item';
      label.innerHTML = `
        <input type="checkbox" value="${this.#escapeHtml(file)}" ${isChecked}>
        <span>${this.#escapeHtml(file)}</span>
      `;
      const checkbox = label.querySelector('input');
      checkbox.addEventListener('change', (e) => onFileCheck?.(file, e.target.checked));
      modalTestFileList.appendChild(label);
    });
  }

  renderModalTestTypes(markers, selectedTypes, onTypeCheck) {
    const { modalTestTypeList } = this.els;
    if (!modalTestTypeList) return;
    modalTestTypeList.innerHTML = '';

    if (!markers || markers.length === 0) {
      modalTestTypeList.innerHTML = `<div class="placeholder-message">${
        this.getIconHtml('info', 'vertical-align:middle;')
      }<span style="vertical-align:middle;">${window.i18n.t('testExecution.noTestTypes') || '未找到测试类型'}</span></div>`;
      return;
    }

    markers.forEach(marker => {
      const isChecked = selectedTypes?.includes(marker) ? 'checked' : '';
      const label = document.createElement('label');
      label.className = 'checkbox-item';
      label.innerHTML = `
        <input type="checkbox" value="${marker}" ${isChecked}>
        <span>${marker}</span>
      `;
      const checkbox = label.querySelector('input');
      checkbox.addEventListener('change', (e) => onTypeCheck?.(marker, e.target.checked));
      modalTestTypeList.appendChild(label);
    });
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
    };
  }

  getModalSelectedTestFiles() {
    const { modalTestFileList } = this.els;
    if (!modalTestFileList) return [];
    const checked = modalTestFileList.querySelectorAll('input[type="checkbox"]:checked');
    return Array.from(checked).map(cb => cb.value);
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
      this.els.modalTestFileList.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.checked = plan.testFiles.includes(cb.value);
      });
    }
    if (plan.testTypes && this.els.modalTestTypeList) {
      this.els.modalTestTypeList.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.checked = plan.testTypes.includes(cb.value);
      });
    }
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

    testPlans.forEach(plan => {
      const isChecked = selectedPlanIds?.includes(plan.id) ? 'checked' : '';
      const label = document.createElement('label');
      label.className = 'checkbox-item';
      label.innerHTML = `
        <input type="checkbox" value="${plan.id}" ${isChecked}>
        <span>${this.#escapeHtml(plan.name)}</span>
      `;
      const checkbox = label.querySelector('input');
      checkbox.addEventListener('change', (e) => onPlanCheck?.(plan.id, e.target.checked));
      scheduledPlanTestPlansList.appendChild(label);
    });
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
      item.className = `report-run-item${run.id === selectedRunId ? ' selected' : ''}`;
      item.setAttribute('data-run-id', run.id);
      const timeStr = run.timestamp ? TestExecutionView.formatDateTime(new Date(run.timestamp)) : '-';
      const statusIcon = run.status === 'passed'
        ? this.getIconHtml('check_circle', 'vertical-align:middle;color:var(--success);margin-right:4px;')
        : run.status === 'failed'
          ? this.getIconHtml('error', 'vertical-align:middle;color:var(--error);margin-right:4px;')
          : this.getIconHtml('info', 'vertical-align:middle;margin-right:4px;');
      item.innerHTML = `
        ${statusIcon}
        <span style="vertical-align:middle;">${timeStr}</span>
      `;
      item.addEventListener('click', () => onSelectRun?.(run.id));
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
    overlay.className = 'datetime-picker-overlay';
    overlay.innerHTML = `
      <div class="datetime-picker-container">
        <div class="datetime-picker-header">
          <button type="button" class="picker-nav-btn" data-unit="year" data-dir="-1">
            ${this.getIconHtml('chevron_left')}
          </button>
          <span class="picker-title" id="picker-title"></span>
          <button type="button" class="picker-nav-btn" data-unit="year" data-dir="1">
            ${this.getIconHtml('chevron_right')}
          </button>
        </div>
        <div class="datetime-picker-body" id="picker-body"></div>
        <div class="datetime-picker-footer">
          <button type="button" class="material-button outlined small" id="picker-cancel-btn">${window.i18n.t('modal.cancel') || '取消'}</button>
          <button type="button" class="material-button primary small" id="picker-confirm-btn">${window.i18n.t('modal.confirm') || '确定'}</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    this._pickerState.overlay = overlay;

    // 绑定导航按钮
    overlay.querySelectorAll('.picker-nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const unit = btn.dataset.unit;
        const dir = parseInt(btn.dataset.dir);
        this.navigatePicker(unit, dir);
      });
    });

    // 取消按钮
    const cancelBtn = overlay.querySelector('#picker-cancel-btn');
    cancelBtn?.addEventListener('click', () => this.hideDateTimePicker());

    // 确认按钮
    const confirmBtn = overlay.querySelector('#picker-confirm-btn');
    confirmBtn?.addEventListener('click', () => this.confirmDateTimePicker());

    // 点击遮罩关闭
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.hideDateTimePicker();
    });

    return overlay;
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
        this._pickerState.hour = parsed.hour;
        this._pickerState.minute = parsed.minute;
      }
    } else {
      // 默认当前时间
      const now = new Date();
      this._pickerState.year = now.getFullYear();
      this._pickerState.month = now.getMonth() + 1;
      this._pickerState.day = now.getDate();
      this._pickerState.hour = now.getHours();
      this._pickerState.minute = now.getMinutes();
    }

    this.renderDatePicker();
    overlay.classList.add('show');

    // 定位到输入框下方
    const container = overlay.querySelector('.datetime-picker-container');
    if (container) {
      const rect = inputElement.getBoundingClientRect();
      container.style.position = 'fixed';
      container.style.left = `${rect.left}px`;
      container.style.top = `${rect.bottom + 4}px`;
    }
  }

  hideDateTimePicker() {
    if (this._pickerState.overlay) {
      this._pickerState.overlay.classList.remove('show');
    }
    this._pickerState.currentInput = null;
  }

  navigatePicker(unit, direction) {
    if (unit === 'year') {
      this._pickerState.year += direction;
    } else if (unit === 'month') {
      this._pickerState.month += direction;
      if (this._pickerState.month > 12) {
        this._pickerState.month = 1;
        this._pickerState.year++;
      } else if (this._pickerState.month < 1) {
        this._pickerState.month = 12;
        this._pickerState.year--;
      }
    }
    this.renderDatePicker();
  }

  renderDatePicker() {
    const overlay = this._pickerState.overlay;
    if (!overlay) return;

    const title = overlay.querySelector('#picker-title');
    if (title) {
      title.textContent = `${this._pickerState.year}年${this._pickerState.month}月`;
    }

    const body = overlay.querySelector('#picker-body');
    if (!body) return;
    body.innerHTML = '';

    // 星期标题行
    const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
    const weekRow = document.createElement('div');
    weekRow.className = 'picker-week-row';
    weekDays.forEach(d => {
      const cell = document.createElement('div');
      cell.className = 'picker-week-cell';
      cell.textContent = d;
      weekRow.appendChild(cell);
    });
    body.appendChild(weekRow);

    // 计算当月天数和起始星期
    const year = this._pickerState.year;
    const month = this._pickerState.month;
    const firstDay = new Date(year, month - 1, 1).getDay();
    const daysInMonth = new Date(year, month, 0).getDate();

    // 日期网格
    const grid = document.createElement('div');
    grid.className = 'picker-day-grid';

    // 填充空白
    for (let i = 0; i < firstDay; i++) {
      const empty = document.createElement('div');
      empty.className = 'picker-day-cell empty';
      grid.appendChild(empty);
    }

    // 填充日期
    for (let d = 1; d <= daysInMonth; d++) {
      const cell = document.createElement('div');
      cell.className = 'picker-day-cell';
      if (d === this._pickerState.day) cell.classList.add('selected');
      cell.textContent = d;
      cell.addEventListener('click', () => this.selectDate(year, month, d));
      grid.appendChild(cell);
    }

    body.appendChild(grid);

    // 时间选择
    const timeRow = document.createElement('div');
    timeRow.className = 'picker-time-row';
    timeRow.innerHTML = `
      <label>时间</label>
      <input type="number" class="glass-input no-spinner" id="picker-hour" min="0" max="23" value="${this._pickerState.hour}" style="width:50px;text-align:center;">
      <span>:</span>
      <input type="number" class="glass-input no-spinner" id="picker-minute" min="0" max="59" value="${this._pickerState.minute}" style="width:50px;text-align:center;">
    `;
    body.appendChild(timeRow);

    // 监听时间输入
    const hourInput = timeRow.querySelector('#picker-hour');
    const minuteInput = timeRow.querySelector('#picker-minute');
    hourInput?.addEventListener('input', () => {
      this._pickerState.hour = Math.min(23, Math.max(0, parseInt(hourInput.value) || 0));
    });
    minuteInput?.addEventListener('input', () => {
      this._pickerState.minute = Math.min(59, Math.max(0, parseInt(minuteInput.value) || 0));
    });
  }

  selectDate(year, month, day) {
    this._pickerState.year = year;
    this._pickerState.month = month;
    this._pickerState.day = day;
    this.renderDatePicker();
  }

  confirmDateTimePicker() {
    const { currentInput, year, month, day, hour, minute } = this._pickerState;
    if (currentInput) {
      const pad = (n) => String(n).padStart(2, '0');
      currentInput.value = `${year}-${pad(month)}-${pad(day)} ${pad(hour)}:${pad(minute)}`;
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

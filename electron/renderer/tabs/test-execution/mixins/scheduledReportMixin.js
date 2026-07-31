// scheduledReportMixin for TestExecutionView
// Extracted from view.js during refactor
// Provides: 定时计划列表/弹窗 + 报告弹窗 + 端口管理弹窗 + Section 显隐

import DateTimePicker from '../../../components/datetime-picker.js';

export const scheduledReportMixin = {
  // ─── 定时计划显示 ──────────────────────────────────────────────

  renderScheduledPlansList(plans, currentPlanId, onSelectPlan, runningPlanId = null) {
    const { scheduledPlanList } = this.els;
    if (!scheduledPlanList) return;
    scheduledPlanList.innerHTML = '';

    if (!plans || plans.length === 0) {
      scheduledPlanList.innerHTML = `<div class="placeholder-message">${
        this.getIconHtml('info', 'vertical-align:middle;')
      }<span style="vertical-align:middle;">${window.i18n.t('testExecution.noScheduledPlans')}</span></div>`;
      return;
    }

    plans.forEach(plan => {
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
  },

  selectScheduledPlanItem(planId) {
    const { scheduledPlanList } = this.els;
    if (!scheduledPlanList) return;
    scheduledPlanList.querySelectorAll('.scheduled-plan-item.selected').forEach(el => el.classList.remove('selected'));
    if (planId) {
      const target = scheduledPlanList.querySelector(`.scheduled-plan-item[data-plan-id="${CSS.escape(planId)}"]`);
      if (target) target.classList.add('selected');
    }
  },

  /**
   * 设置定时计划项的运行中状态（边框渐变动画）
   * @param {string|null} planId - 定时计划 ID，null 表示清除运行状态
   * @param {boolean} isRunning - 是否正在运行
   */
  setScheduledPlanRunning(planId, isRunning) {
    const { scheduledPlanList } = this.els;
    if (!scheduledPlanList) return;
    scheduledPlanList.querySelectorAll('.scheduled-plan-item.running').forEach(el => el.classList.remove('running'));
    if (isRunning && planId) {
      const target = scheduledPlanList.querySelector(`.scheduled-plan-item[data-plan-id="${CSS.escape(planId)}"]`);
      if (target) target.classList.add('running');
    }
  },

  updateScheduledPlanButtons(hasPlan) {
    const { editScheduledPlanBtn, deleteScheduledPlanBtn } = this.els;
    if (editScheduledPlanBtn) editScheduledPlanBtn.disabled = !hasPlan;
    if (deleteScheduledPlanBtn) deleteScheduledPlanBtn.disabled = !hasPlan;
  },

  // ─── 定时计划弹窗 ──────────────────────────────────────────────

  openScheduledPlanModal() {
    // 初始化执行时间输入框的日期时间选择器
    const { scheduledPlanTimeInput } = this.els;
    if (scheduledPlanTimeInput) {
      const mountContainer = document.getElementById('scheduled-plan-modal-overlay') || document.body;
      new DateTimePicker(scheduledPlanTimeInput, { mountContainer });
    }
    window.__XKAT_MODALS__?.scheduledPlan?.open();
  },

  closeScheduledPlanModal() {
    window.__XKAT_MODALS__?.scheduledPlan?.close();
  },

  collectScheduledPlanFormData() {
    const { scheduledPlanNameInput, scheduledPlanTimeInput } = this.els;
    return {
      name: scheduledPlanNameInput?.value?.trim() || '',
      scheduledTime: scheduledPlanTimeInput?.value?.trim() || '',
      testPlans: this.getSelectedTestPlansFromModal(),
    };
  },

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
        <input type="checkbox" id="scheduled-plan-${this.escapeHtml(plan.id)}" value="${this.escapeHtml(plan.id)}" ${isSelected ? 'checked' : ''}>
        <label for="scheduled-plan-${this.escapeHtml(plan.id)}">${this.escapeHtml(plan.name)}</label>
      `;
      const checkbox = planElement.querySelector('input');
      checkbox.addEventListener('change', (e) => onPlanCheck?.(plan.id, e.target.checked));
      fragment.appendChild(planElement);
    });
    scheduledPlanTestPlansList.appendChild(fragment);
  },

  getSelectedTestPlansFromModal() {
    const { scheduledPlanTestPlansList } = this.els;
    if (!scheduledPlanTestPlansList) return [];
    const checked = scheduledPlanTestPlansList.querySelectorAll('input[type="checkbox"]:checked');
    return Array.from(checked).map(cb => cb.value);
  },

  // ─── 报告弹窗 ──────────────────────────────────────────────────

  openReportModal() {
    window.__XKAT_MODALS__?.report?.open();
  },

  closeReportModal() {
    window.__XKAT_MODALS__?.report?.close();
  },

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

    runs.forEach(run => {
      const item = this._buildRunItemElement(run, {
        selectedRunId,
        onSelectRun: (r) => {
          // 取消其他选中 (扁平列表场景), 当前 item 由 _buildRunItemElement 统一 add
          reportRunsList.querySelectorAll('.report-run-item').forEach(i => i.classList.remove('selected'));
          onSelectRun?.(r);
        },
        onDeleteRun,
      });
      if (item) reportRunsList.appendChild(item);
    });
  },

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
    const timeStr = run.timestamp || '-';
    const statusIcon = run.available
      ? this.getIconHtml('check_circle', 'vertical-align:middle;color:var(--success);margin-right:4px;')
      : this.getIconHtml('cancel', 'vertical-align:middle;color:var(--error);margin-right:4px;');
    const latestBadge = run.isLatest ? `<span class="report-latest-badge">${window.i18n.t('reportModal.latest')}</span>` : '';
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
  },

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
    const validGroups = (groups || []).filter(g => g && g.runs && g.runs.length > 0);

    if (validGroups.length === 0) {
      if (noRunsEl) noRunsEl.classList.remove('hidden');
      reportRunsList.classList.add('hidden');
      return;
    }

    if (noRunsEl) noRunsEl.classList.add('hidden');
    reportRunsList.classList.remove('hidden');

    const fragment = document.createDocumentFragment();
    validGroups.forEach(group => {
      const groupEl = document.createElement('div');
      groupEl.className = 'report-group collapsed';  // 默认收起
      groupEl.setAttribute('data-source-plan', group.sourcePlanName);

      const count = group.runs.length;
      const arrowIcon = this.getIconHtml('keyboard_arrow_right', 'vertical-align:middle;font-size:16px;transition:transform 0.2s ease;');
      const folderIcon = this.getIconHtml('folder', 'vertical-align:middle;color:var(--primary);margin-right:6px;font-size:16px;');

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
      group.runs.forEach(run => {
        const item = this._buildRunItemElement(run, {
          onSelectRun: (r) => {
            // 跨分组取消选中, 当前 item 由 _buildRunItemElement 统一 add
            reportRunsList.querySelectorAll('.report-run-item').forEach(i => i.classList.remove('selected'));
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
  },

  resetReportModalButtons() {
    const { reportOpenBtn } = this.els;
    if (reportOpenBtn) reportOpenBtn.disabled = true;
  },

  enableViewReportButton(enabled) {
    const { reportOpenBtn } = this.els;
    if (reportOpenBtn) reportOpenBtn.disabled = !enabled;
  },

  /**
   * 设置报告弹窗的计划名标题
   * @param {string} name - 计划名称
   */
  setReportPlanName(name) {
    const { reportPlanName } = this.els;
    if (reportPlanName) reportPlanName.textContent = name || '';
  },

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
  },

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
  },

  // ─── 定时计划弹窗扩展 ──────────────────────────────────────────

  /**
   * 设置定时计划弹窗标题
   * @param {string} title - 标题文本
   */
  setScheduledPlanModalTitle(title) {
    const { scheduledPlanModalTitle } = this.els;
    if (scheduledPlanModalTitle) scheduledPlanModalTitle.textContent = title;
  },

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
  },

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
  },

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
  },

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
    return () => unbinds.forEach(fn => fn());
  },

  /**
   * 显示端口扫描中状态（禁用确认按钮）
   */
  showPortScanningState() {
    const { portScanning, portList, portModalConfirmBtn } = this.els;
    if (portScanning) portScanning.style.display = 'flex';
    if (portList) portList.classList.add('hidden');
    if (portModalConfirmBtn) portModalConfirmBtn.disabled = true;
  },

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
    ports.forEach(port => {
      const item = document.createElement('div');
      item.className = 'device-item';
      item.setAttribute('data-port-id', port.deviceId);
      item.innerHTML = `
        <div style="display:flex;align-items:center;">
          ${this.getIconHtml('cable', 'margin-right:8px;')}
          <div>
            <div style="font-weight:500;">${port.deviceId}</div>
            <div style="font-size:12px;color:var(--text-secondary);">${port.name || ''}</div>
          </div>
        </div>
      `;
      item.addEventListener('click', () => {
        portList.querySelectorAll('.device-item').forEach(i => i.classList.remove('selected'));
        item.classList.add('selected');
        if (portModalConfirmBtn) portModalConfirmBtn.disabled = false;
        onSelect?.(port);
      });
      portList.appendChild(item);
    });
  },

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
          ${window.i18n.t('testExecution.deviceSelection.noPortsFound') || '未找到串口设备'}
        </div>
      `;
    }
  },

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
          ${errorMsg || window.i18n.t('testExecution.deviceSelection.scanPortsFailed') || '获取串口列表失败'}
        </div>
      `;
    }
  },

  /**
   * 隐藏端口扫描状态（用于扫描完成的过渡）
   */
  hidePortScanningState() {
    const { portScanning, portList } = this.els;
    if (portScanning) portScanning.style.display = 'none';
    if (portList) portList.classList.remove('hidden');
  },

  /**
   * 获取当前选中的端口 ID
   * @returns {string|null}
   */
  getSelectedPortId() {
    const { portList } = this.els;
    if (!portList) return null;
    const selected = portList.querySelector('.device-item.selected');
    return selected?.getAttribute('data-port-id') || null;
  },

  /**
   * 设置蓝牙端口输入框的值
   * @param {string} portId - 端口 ID
   */
  setBlePortInput(portId) {
    const { editBlePortInput } = this.els;
    if (editBlePortInput && portId) {
      editBlePortInput.value = portId;
    }
  },

  // ─── Section 显隐 ──────────────────────────────────────────────

  /**
   * 显示测试计划区域
   */
  showTestPlanSection() {
    const { testPlanSection } = this.els;
    if (testPlanSection) testPlanSection.classList.remove('hidden');
  },

  /**
   * 显示定时计划区域
   */
  showScheduledPlanSection() {
    const { scheduledPlanSection } = this.els;
    if (scheduledPlanSection) scheduledPlanSection.classList.remove('hidden');
  },
};

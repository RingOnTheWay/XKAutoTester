/**
 * TestExecutionView - 测试执行 Tab View 层
 * 纯 DOM 操作，不调用 API，不管理状态
 * 通过 window.__XKAT_MODALS__ / window.__XKAT_APP__ / window.i18n 访问全局资源
 */
import { Icons } from '../../icons.js';
import { directoryMixin } from './mixins/directoryMixin.js';
import { testPlansMixin } from './mixins/testPlansMixin.js';
import { outputMixin } from './mixins/outputMixin.js';
import { planModalMixin } from './mixins/planModalMixin.js';
import { scheduledReportMixin } from './mixins/scheduledReportMixin.js';

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
    if (!plan) return { class: 'unknown', text: 'Unknown' };
    const now = new Date();
    const scheduledTime = plan.scheduledTime ? new Date(plan.scheduledTime) : null;

    if (plan.status === 'completed') {
      return { class: 'completed', text: window.i18n.t('scheduledPlan.statusCompleted') };
    } else if (plan.status === 'running') {
      return { class: 'running', text: window.i18n.t('scheduledPlan.statusRunning') };
    } else if (plan.status === 'cancelled') {
      return { class: 'cancelled', text: window.i18n.t('scheduledPlan.statusCancelled') };
    } else if (plan.status === 'expired') {
      return { class: 'expired', text: window.i18n.t('scheduledPlan.statusExpired') };
    } else if (scheduledTime && scheduledTime <= now) {
      return { class: 'overdue', text: window.i18n.t('scheduledPlan.statusOverdue') };
    } else {
      return { class: 'pending', text: window.i18n.t('scheduledPlan.statusPending') };
    }
  }

  // ─── 私有方法（公共化供 mixin 调用） ────────────────────────────

  escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}

Object.assign(TestExecutionView.prototype, directoryMixin, testPlansMixin, outputMixin, planModalMixin, scheduledReportMixin);

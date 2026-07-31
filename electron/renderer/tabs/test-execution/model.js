import { EventEmitter } from '../../core/EventEmitter.js';
import { ApiBridge } from '../../core/ApiBridge.js';
import { AppState } from '../../core/AppState.js';
import { modelDirectoryMixin } from './mixins/modelDirectoryMixin.js';
import { modelTestPlansMixin } from './mixins/modelTestPlansMixin.js';
import { modelTestExecutionMixin } from './mixins/modelTestExecutionMixin.js';
import { modelDeviceSelectionMixin } from './mixins/modelDeviceSelectionMixin.js';
import { modelScheduledPlansMixin } from './mixins/modelScheduledPlansMixin.js';
import { modelReportsMixin } from './mixins/modelReportsMixin.js';

/**
 * TestExecutionModel - 测试执行 Tab 的 Model 层
 * 管理测试计划、定时计划、测试执行、报告等状态与业务逻辑
 *
 * Refactored: 业务方法通过 Object.assign 原型组合拆分到 mixins/ 目录下
 * model<Domain>Mixin.js 文件中。私有字段 #api/#state/#ipcUnsubscribers 与
 * 私有方法 #set/#requestDeviceSelection 因需被 mixin 方法访问，已公共化为
 * _api/_state/_ipcUnsubscribers 与 _set/_requestDeviceSelection。
 * #unsubAppState 仅在类体内使用，保持私有。
 */
export class TestExecutionModel extends EventEmitter {
  _api = ApiBridge.bind({
    getTestPlans: 'getTestPlans',
    saveTestPlan: 'saveTestPlan',
    updateTestPlan: 'updateTestPlan',
    deleteTestPlan: 'deleteTestPlan',
    getScheduledPlans: 'getScheduledPlans',
    saveScheduledPlan: 'saveScheduledPlan',
    updateScheduledPlan: 'updateScheduledPlan',
    deleteScheduledPlan: 'deleteScheduledPlan',
    checkTimeConflict: 'checkTimeConflict',
    getScheduledPlanRuns: 'getScheduledPlanRuns',
    runPythonTests: 'runPythonTests',
    stopPythonTests: 'stopPythonTests',
    scanTestFiles: 'scanTestFiles',
    extractPytestMarkers: 'extractPytestMarkers',
    selectDirectory: 'selectDirectory',
    viewReport: 'viewReport',
    checkReportExists: 'checkReportExists',
    getTestPlanRuns: 'getTestPlanRuns',
    deleteReportRun: 'deleteReportRun',
    openReportByPath: 'openReportByPath',
    stopAllureServer: 'stopAllureServer',
    sendDingTalkNotification: 'sendDingTalkNotification',
    getConfig: 'getConfig',
    saveConfig: 'saveConfig',
    getProjectInfo: 'getProjectInfo',
    openExternal: 'openExternal',
    executeAdbCommand: 'executeAdbCommand',
    testCaseGet: 'testCase.get',
    testCaseSaveAndGenerate: 'testCase.saveAndGenerate',
    getConnectedDevices: 'getConnectedDevices',
    scheduledTestComplete: 'scheduledTestComplete',
  });

  _state = {
    selectedDirectory: null,           // 选中的测试目录路径
    selectedDirectoryDisplayName: null,// 目录显示名称
    selectedTestFiles: [],             // 选中的测试文件列表
    testPlans: [],                     // 测试计划列表
    currentTestPlan: null,             // 当前选中的测试计划
    scheduledPlans: [],                // 定时计划列表
    currentScheduledPlan: null,        // 当前选中的定时计划
    isRunning: false,                  // 是否正在执行测试
    runningTestPlanName: null,         // 正在执行的测试计划名称
    runningScheduledPlanId: null,      // 正在执行的定时计划 ID
    currentMarkers: [],                // 当前提取的 pytest 标记
    selectedReportRun: null,           // 选中的报告运行记录
    reportMode: 'testPlan',            // 报告弹窗模式: 'testPlan' | 'scheduledPlan'
    currentScheduledPlanForReport: null, // 整合报告弹窗当前定时计划 (scheduledPlan 模式)
    outputBuffer: [],                  // 输出缓冲区
    outputRafId: null,                 // 输出刷新的 RAF ID
    extractingMarkers: null,           // 标记提取的 Promise 守卫
    selectingFromPlan: false,          // 是否从计划中选择文件
    selectedDevice: null,              // 当前选中的设备 ID（与 AppState 同步）
  };

  // ── AppState 订阅取消函数 ──────────────────────────────────────
  #unsubAppState = null;

  // ── IPC 事件取消函数列表 ────────────────────────────────────────
  _ipcUnsubscribers = [];

  // ── State Getters ──────────────────────────────────────────────

  get selectedDirectory() { return this._state.selectedDirectory; }
  get selectedDirectoryDisplayName() { return this._state.selectedDirectoryDisplayName; }
  get selectedTestFiles() { return this._state.selectedTestFiles; }
  get testPlans() { return this._state.testPlans; }
  get currentTestPlan() { return this._state.currentTestPlan; }
  get scheduledPlans() { return this._state.scheduledPlans; }
  get currentScheduledPlan() { return this._state.currentScheduledPlan; }
  get isRunning() { return this._state.isRunning; }
  get runningTestPlanName() { return this._state.runningTestPlanName; }
  get runningScheduledPlanId() { return this._state.runningScheduledPlanId; }
  get currentMarkers() { return this._state.currentMarkers; }
  get selectedReportRun() { return this._state.selectedReportRun; }
  get outputBuffer() { return this._state.outputBuffer; }
  get outputRafId() { return this._state.outputRafId; }
  get extractingMarkers() { return this._state.extractingMarkers; }
  get selectingFromPlan() { return this._state.selectingFromPlan; }
  get selectedDevice() { return this._state.selectedDevice; }

  get(key) { return this._state[key]; }

  setSelectedTestFiles(files) {
    this._set('selectedTestFiles', files, 'selectedTestFiles-changed');
  }

  // ── Private State Helper（公共化供 mixin 调用） ───────────────

  _set(key, value, event) {
    const old = this._state[key];
    if (old === value) return;
    this._state[key] = value;
    this.emit(event || `${key}-changed`, value, old);
  }

  // ── 初始化 ─────────────────────────────────────────────────────

  async load() {
    // 从 AppState 同步 selectedDevice
    const appStateDevice = AppState.instance.get('selectedDevice');
    if (appStateDevice) {
      this._state.selectedDevice = appStateDevice;
    }

    // 订阅 AppState 的 selectedDevice 变更，保持本地同步
    this.#unsubAppState = AppState.instance.on('selectedDevice-changed', (value) => {
      if (this._state.selectedDevice !== value) {
        this._state.selectedDevice = value;
        this.emit('selectedDevice-changed', value);
      }
    });

    // 加载测试计划和定时计划
    await Promise.all([
      this.loadTestPlans(),
      this.loadScheduledPlans(),
    ]);
  }

  destroy() {
    // 清理 RAF
    if (this._state.outputRafId) {
      cancelAnimationFrame(this._state.outputRafId);
      this._state.outputRafId = null;
    }
    // 清理输出缓冲
    this._state.outputBuffer = [];
    // 取消 AppState 订阅
    if (this.#unsubAppState) {
      this.#unsubAppState();
      this.#unsubAppState = null;
    }
    // 取消 IPC 事件监听
    this._ipcUnsubscribers.forEach(fn => fn());
    this._ipcUnsubscribers = [];
    // 移除所有事件监听
    this.removeAllListeners();
  }

  // ── 静态工具方法（保留在类体中，不能挂到 prototype） ──────────

  static formatDateTime(date) {
    if (!date) return '';
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  static parseDateTimeString(str) {
    if (!str) return null;
    const d = new Date(str.replace(' ', 'T'));
    return isNaN(d.getTime()) ? null : d;
  }
}

Object.assign(
  TestExecutionModel.prototype,
  modelDirectoryMixin,
  modelTestPlansMixin,
  modelTestExecutionMixin,
  modelDeviceSelectionMixin,
  modelScheduledPlansMixin,
  modelReportsMixin,
);

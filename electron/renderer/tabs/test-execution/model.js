import { EventEmitter } from '../../core/EventEmitter.js';
import { ApiBridge } from '../../core/ApiBridge.js';
import { DevicePrecheckModel } from './models/DevicePrecheckModel.js';
import { ReportModel } from './models/ReportModel.js';
import { TestPlanModel } from './models/TestPlanModel.js';
import { ScheduledPlanModel } from './models/ScheduledPlanModel.js';
import { ExecutionModel } from './models/ExecutionModel.js';

// R26 候选④: 纯函数实现在 core/utils/testFile.js (view 不再反向 import model),
// re-export 保持既有调用方兼容
export { toCaseFileName, inferTestTypeFromFileName } from '../../core/utils/testFile.js';

// 状态 key → 子模型路由表
const EXECUTION_STATE_KEYS = new Set([
  'selectedDirectory',
  'selectedDirectoryDisplayName',
  'selectedTestFiles',
  'isRunning',
  'runningTestPlanName',
  'runningScheduledPlanId',
  'currentMarkers',
  'outputBuffer',
  'outputRafId',
  'extractingMarkers',
  'selectingFromPlan',
]);
const REPORT_STATE_KEYS = new Set(['selectedReportRun', 'reportMode', 'currentScheduledPlanForReport']);
const TESTPLAN_STATE_KEYS = new Set(['testPlans', 'currentTestPlan']);
const SCHEDULEDPLAN_STATE_KEYS = new Set(['scheduledPlans', 'currentScheduledPlan']);

/**
 * TestExecutionModel - 测试执行 Tab 的 Model 门面 (ADR-0012)
 *
 * 组合根: 5 个子模型各自 extends BaseModel (models/ 目录):
 * - TestPlanModel        测试计划 CRUD/选中态
 * - ScheduledPlanModel   定时计划 CRUD/冲突检查/过期处理
 * - ExecutionModel       执行编排: 选择/标记/输出缓冲 + runTests 生命周期 (注入 precheck)
 * - DevicePrecheckModel  设备前置检查 (AppState selectedDevice 同步)
 * - ReportModel          报告弹窗/运行记录/打开
 *
 * 门面职责:
 * 1. 事件转发: 子模型事件原样上抛, controller/view 订阅词汇不变 (零调用方改动)
 * 2. 跨域路由: 子模型互不引用, 跨域数据由门面取好后作参数传入
 *    (runTests 的 testPlan / precheck 的 files·fallbackDir / report 的 planName)
 * 3. 跨域组合: 定时计划触发/立即执行序列 (handleScheduledTestStart/
 *    runScheduledPlanNow/_executeScheduledPlanPlans) — 对齐 settings 门面路由先例
 * 4. 方法/状态委托: 保持原公开面 (含 _api 共享对象, 测试可继续打补丁)
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

  #precheckModel;
  #reportModel;
  #testPlanModel;
  #scheduledPlanModel;
  #executionModel;

  constructor() {
    super();
    // 子模型共享同一 _api 对象 (测试经 model._api 打补丁对子模型同样生效)
    this.#precheckModel = new DevicePrecheckModel(this._api);
    this.#reportModel = new ReportModel(this._api);
    this.#testPlanModel = new TestPlanModel(this._api);
    this.#scheduledPlanModel = new ScheduledPlanModel(this._api);
    this.#executionModel = new ExecutionModel(this._api, { precheck: this.#precheckModel });
    // 子模型 → 门面 事件转发 (显式列出, 可 grep; 'error' 带原 source 上抛)
    const forward = [
      [
        this.#precheckModel,
        [
          'selectedDevice-changed',
          'confirm-replace-device',
          'show-edit-device-id-modal',
          'edit-device-id-saved',
          'request-device-selection',
          'error',
        ],
      ],
      [
        this.#reportModel,
        [
          'show-report-modal',
          'show-scheduled-report-modal',
          'report-runs-loaded',
          'report-runs-error',
          'scheduled-report-runs-loaded',
          'report-run-selected',
          'report-run-deleted',
          'report-opened',
          'report-open-failed',
          'error',
        ],
      ],
      [
        this.#testPlanModel,
        [
          'testPlans-changed',
          'currentTestPlan-changed',
          'testPlan-saved',
          'testPlan-updated',
          'testPlan-deleted',
          'show-edit-plan-modal',
          'error',
        ],
      ],
      [
        this.#scheduledPlanModel,
        [
          'scheduledPlans-changed',
          'currentScheduledPlan-changed',
          'scheduledPlan-saved',
          'scheduledPlan-updated',
          'scheduledPlan-deleted',
          'show-edit-scheduled-plan-modal',
          'scheduled-plan-expired',
          'error',
        ],
      ],
      [
        this.#executionModel,
        [
          'selectedDirectory-changed',
          'selectedDirectoryDisplayName-changed',
          'selectedTestFiles-changed',
          'test-files-scanned',
          'isRunning-changed',
          'runningTestPlanName-changed',
          'runningScheduledPlanId-changed',
          'currentMarkers-changed',
          'run-error',
          'run-warning',
          'loop-progress-changed',
          'run-complete',
          'tests-stopped',
          'output-flushed',
          'output-cleared',
          'error',
        ],
      ],
    ];
    for (const [sub, events] of forward) {
      for (const event of events) {
        sub.on(event, (...args) => this.emit(event, ...args));
      }
    }
  }

  // ── IPC 事件取消函数列表 ────────────────────────────────────────
  _ipcUnsubscribers = [];

  // ── 子模型访问 (供渐进迁移与测试) ──────────────────────────────

  get precheckModel() {
    return this.#precheckModel;
  }
  get reportModel() {
    return this.#reportModel;
  }
  get testPlanModel() {
    return this.#testPlanModel;
  }
  get scheduledPlanModel() {
    return this.#scheduledPlanModel;
  }
  get executionModel() {
    return this.#executionModel;
  }

  // ── State Getters (委托) ────────────────────────────────────────

  get selectedDirectory() {
    return this.#executionModel.get('selectedDirectory');
  }
  get selectedDirectoryDisplayName() {
    return this.#executionModel.get('selectedDirectoryDisplayName');
  }
  get selectedTestFiles() {
    return this.#executionModel.get('selectedTestFiles');
  }
  get testPlans() {
    return this.#testPlanModel.get('testPlans');
  }
  get currentTestPlan() {
    return this.#testPlanModel.get('currentTestPlan');
  }
  get scheduledPlans() {
    return this.#scheduledPlanModel.get('scheduledPlans');
  }
  get currentScheduledPlan() {
    return this.#scheduledPlanModel.get('currentScheduledPlan');
  }
  get isRunning() {
    return this.#executionModel.get('isRunning');
  }
  get runningTestPlanName() {
    return this.#executionModel.get('runningTestPlanName');
  }
  get runningScheduledPlanId() {
    return this.#executionModel.get('runningScheduledPlanId');
  }
  get currentMarkers() {
    return this.#executionModel.get('currentMarkers');
  }
  get selectedReportRun() {
    return this.#reportModel.get('selectedReportRun');
  }
  get outputBuffer() {
    return this.#executionModel.get('outputBuffer');
  }
  get outputRafId() {
    return this.#executionModel.get('outputRafId');
  }
  get extractingMarkers() {
    return this.#executionModel.get('extractingMarkers');
  }
  get selectingFromPlan() {
    return this.#executionModel.get('selectingFromPlan');
  }
  get selectedDevice() {
    return this.#precheckModel.get('selectedDevice');
  }

  /**
   * 按状态 key 路由到对应子模型 (保持原 get(key) 公开面)
   */
  get(key) {
    if (key === 'selectedDevice') return this.#precheckModel.get(key);
    if (REPORT_STATE_KEYS.has(key)) return this.#reportModel.get(key);
    if (TESTPLAN_STATE_KEYS.has(key)) return this.#testPlanModel.get(key);
    if (SCHEDULEDPLAN_STATE_KEYS.has(key)) return this.#scheduledPlanModel.get(key);
    if (EXECUTION_STATE_KEYS.has(key)) return this.#executionModel.get(key);
    return undefined;
  }

  // ── 初始化 / 生命周期 ───────────────────────────────────────────

  async load() {
    // 设备前置检查: AppState selectedDevice 初始同步 + 订阅
    this.#precheckModel.initAppStateSync();

    // 加载测试计划和定时计划
    await Promise.all([this.#testPlanModel.loadTestPlans(), this.#scheduledPlanModel.loadScheduledPlans()]);
  }

  destroy() {
    // 取消 IPC 事件监听
    this._ipcUnsubscribers.forEach((fn) => fn());
    this._ipcUnsubscribers = [];
    // 子模型生命周期收尾 (execution 清 RAF/缓冲, precheck 退订 AppState)
    this.#executionModel.destroy();
    this.#precheckModel.destroy();
    this.#reportModel.destroy();
    this.#testPlanModel.destroy();
    this.#scheduledPlanModel.destroy();
    // 移除所有事件监听
    this.removeAllListeners();
  }

  // ─── 执行编排 (models/ExecutionModel) ──────────────────────────

  selectDirectory() {
    return this.#executionModel.selectDirectory();
  }

  scanTestFiles() {
    // 跨域路由: 是否有选中计划 (避免扫描覆盖计划文件列表)
    return this.#executionModel.scanTestFiles(!!this.#testPlanModel.get('currentTestPlan'));
  }

  updateSelectedDirectory(path, displayName) {
    return this.#executionModel.updateSelectedDirectory(path, displayName);
  }

  setSelectedTestFiles(files) {
    return this.#executionModel.setSelectedTestFiles(files);
  }

  /**
   * 执行当前选中的测试计划 (计划数据参数传入 ExecutionModel, ADR-0012)
   */
  async runTests(scheduledPlanInfo = null) {
    return this.#executionModel.runTests(this.#testPlanModel.get('currentTestPlan'), scheduledPlanInfo);
  }

  stopTests() {
    return this.#executionModel.stopTests();
  }

  appendOutput(text) {
    return this.#executionModel.appendOutput(text);
  }

  appendError(text) {
    return this.#executionModel.appendError(text);
  }

  clearOutput() {
    return this.#executionModel.clearOutput();
  }

  updateTestTypesFromSelectedFiles() {
    return this.#executionModel.updateTestTypesFromSelectedFiles();
  }

  extractMarkersFromSelectedFiles() {
    return this.#executionModel.extractMarkersFromSelectedFiles();
  }

  extractMarkersFromFiles(files) {
    return this.#executionModel.extractMarkersFromFiles(files);
  }

  getSelectedTestTypes() {
    return this.#executionModel.getSelectedTestTypes();
  }

  sendTestNotification(testInfo) {
    return this.#executionModel.sendTestNotification(testInfo);
  }

  // ─── 测试计划 (models/TestPlanModel) ───────────────────────────

  loadTestPlans() {
    return this.#testPlanModel.loadTestPlans();
  }

  saveTestPlan(planData) {
    return this.#testPlanModel.saveTestPlan(planData);
  }

  updateTestPlan(planId, planData) {
    return this.#testPlanModel.updateTestPlan(planId, planData);
  }

  deleteTestPlan(planId) {
    return this.#testPlanModel.deleteTestPlan(planId);
  }

  selectTestPlan(plan) {
    return this.#testPlanModel.selectTestPlan(plan);
  }

  deselectTestPlan() {
    return this.#testPlanModel.deselectTestPlan();
  }

  showEditPlanModal(plan) {
    return this.#testPlanModel.showEditPlanModal(plan);
  }

  // ─── 设备前置检查 (models/DevicePrecheckModel) ─────────────────

  checkAndroidDeviceRequired(testPlan) {
    return this.#precheckModel.checkAndroidDeviceRequired(testPlan);
  }

  checkDeviceNamePlaceholder(androidCases) {
    return this.#precheckModel.checkDeviceNamePlaceholder(androidCases);
  }

  showDeviceSelectionForTest(androidCases) {
    // 跨域路由: 输出目录兜底取执行域 selectedDirectory
    return this.#precheckModel.showDeviceSelectionForTest(androidCases, this.#executionModel.get('selectedDirectory'));
  }

  showReplaceDeviceConfirm(currentDevice) {
    return this.#precheckModel.showReplaceDeviceConfirm(currentDevice);
  }

  checkAndroidDeviceConfig() {
    // 跨域路由: 待检文件取执行域 selectedTestFiles
    return this.#precheckModel.checkAndroidDeviceConfig(this.#executionModel.get('selectedTestFiles'));
  }

  checkBlePortConfig() {
    return this.#precheckModel.checkBlePortConfig(this.#executionModel.get('selectedTestFiles'));
  }

  showEditDeviceIdModal(fileName, filePath) {
    return this.#precheckModel.showEditDeviceIdModal(fileName, filePath, this.#executionModel.get('selectedDirectory'));
  }

  confirmEditDeviceId(deviceName, platformVersion, blePort) {
    return this.#precheckModel.confirmEditDeviceId(deviceName, platformVersion, blePort);
  }

  selectDeviceForEdit() {
    return this.#precheckModel.selectDeviceForEdit();
  }

  getTestCase(fileName) {
    return this.#precheckModel.getTestCase(fileName);
  }

  // ─── 定时计划 CRUD (models/ScheduledPlanModel) ─────────────────

  loadScheduledPlans() {
    return this.#scheduledPlanModel.loadScheduledPlans();
  }

  saveScheduledPlan(planData) {
    return this.#scheduledPlanModel.saveScheduledPlan(planData);
  }

  updateScheduledPlan(planId, planData) {
    return this.#scheduledPlanModel.updateScheduledPlan(planId, planData);
  }

  deleteScheduledPlan(planId) {
    return this.#scheduledPlanModel.deleteScheduledPlan(planId);
  }

  selectScheduledPlan(plan) {
    return this.#scheduledPlanModel.selectScheduledPlan(plan);
  }

  deselectScheduledPlan() {
    return this.#scheduledPlanModel.deselectScheduledPlan();
  }

  showEditScheduledPlanModal(plan) {
    return this.#scheduledPlanModel.showEditScheduledPlanModal(plan);
  }

  handleScheduledPlanExpired(data) {
    return this.#scheduledPlanModel.handleScheduledPlanExpired(data);
  }

  checkTimeConflict(scheduledTime, excludeId) {
    return this.#scheduledPlanModel.checkTimeConflict(scheduledTime, excludeId);
  }

  getScheduledPlanStatus(plan) {
    return this.#scheduledPlanModel.getScheduledPlanStatus(plan);
  }

  // ─── 定时计划触发/立即执行序列 (跨域组合, ADR-0012 修订) ────────

  /**
   * 加载定时计划弹窗所需的测试计划列表
   */
  async loadTestPlansForScheduledModal() {
    const plans = await this.loadTestPlans();
    this.emit('test-plans-for-scheduled-modal', plans);
    return plans;
  }

  /**
   * 处理定时计划触发执行事件 (调度到点 → 渲染层执行其绑定的测试计划序列)
   */
  async handleScheduledTestStart(data) {
    const message = window.i18n.t('scheduledPlan.testStarting', {
      name: data.planName,
    });
    this.appendOutput(`\n>>> ${message}`);
    // 重新加载定时计划列表，显示"执行中"状态
    await this.loadScheduledPlans();

    try {
      await this._executeScheduledPlanPlans(data);
    } catch (error) {
      console.error('执行定时计划失败:', error);
      this.appendError('>>> ' + window.i18n.t('testExecution.executeScheduledPlanFailed') + ': ' + error.message);
    } finally {
      // 通知主进程测试执行完成，更新定时计划状态
      if (data.planId) {
        try {
          await this._api.scheduledTestComplete(data.planId);
        } catch (e) {
          console.error('通知定时计划完成失败:', e);
        }
      }
      // 执行完成后重新加载定时计划列表，显示"已完成"状态
      await this.loadScheduledPlans();
    }
  }

  /**
   * R27: 执行定时计划绑定的测试计划序列 (调度触发与手动立即执行共用)。
   * 不落 scheduledTestComplete — 状态通知由调用方决定 (调度: handleScheduledTestStart;
   * 手动: runScheduledPlanNow 不改变计划状态/下次调度)
   * @param {{planId?:string, planName:string, testPlans:Array, executionTime?:string}} data
   */
  async _executeScheduledPlanPlans(data) {
    const testPlansResult = await this._api.getTestPlans();
    const allTestPlans = testPlansResult?.data || testPlansResult || [];

    if (!data.testPlans || data.testPlans.length === 0) {
      this.appendError('>>> ' + window.i18n.t('testExecution.scheduledNoTestPlans'));
      return;
    }

    for (const testPlanObj of data.testPlans) {
      const testPlanId = typeof testPlanObj === 'string' ? testPlanObj : testPlanObj.id;
      const testPlan = allTestPlans.find((p) => p.id === testPlanId);

      if (!testPlan) {
        this.appendError(`>>> ${window.i18n.t('testExecution.testPlanNotExist')}: ${testPlanId}`);
        continue;
      }

      this.appendOutput(`>>> ${window.i18n.t('testExecution.executingTestPlan')}: ${testPlan.name}`);

      // 设置当前测试计划
      this.#testPlanModel.selectTestPlan(testPlan);

      const scheduledPlanInfo = {
        id: data.planId,
        name: data.planName,
        executionTime: data.executionTime || new Date().toLocaleString(),
      };

      // R27: runTests 返回 'stopped' 表示用户手动停止 → 终止整个序列,
      // 否则仅停当前 plan, 循环继续启动下一个 (停止对定时计划失效)
      const runStatus = await this.runTests(scheduledPlanInfo);
      if (runStatus === 'stopped') break;
    }
  }

  /**
   * R27: 手动立即执行选中的定时计划 ("开始执行"按钮, 非调度到点)。
   * 只跑绑定的测试计划序列 — 不调 scheduledTestComplete, 不改变计划状态/下次调度
   * @param {Object} plan - 定时计划对象 (含 id/name/testPlans)
   */
  async runScheduledPlanNow(plan) {
    if (!plan) return;
    const message = window.i18n.t('scheduledPlan.testStarting', { name: plan.name });
    this.appendOutput(`\n>>> ${message}`);
    try {
      await this._executeScheduledPlanPlans({
        planId: plan.id,
        planName: plan.name,
        testPlans: plan.testPlans || [],
        executionTime: new Date().toLocaleString(),
      });
    } catch (error) {
      console.error('立即执行定时计划失败:', error);
      this.appendError('>>> ' + window.i18n.t('testExecution.executeScheduledPlanFailed') + ': ' + error.message);
    }
  }

  // ─── 报告 (models/ReportModel) ─────────────────────────────────

  async showReportModal(testPlan) {
    // 空计划守卫留在门面 (提示走执行域输出)
    if (!testPlan) {
      this.appendOutput('>>> ' + window.i18n.t('testExecution.selectTestPlanFirst'));
      return;
    }
    return this.#reportModel.showReportModal(testPlan);
  }

  async showScheduledReportModal(scheduledPlan) {
    if (!scheduledPlan) {
      this.appendOutput('>>> ' + window.i18n.t('testExecution.selectTestPlanFirst'));
      return;
    }
    return this.#reportModel.showScheduledReportModal(scheduledPlan);
  }

  selectReportRun(run) {
    return this.#reportModel.selectReportRun(run);
  }

  async deleteReportRun(run) {
    // 跨域路由: testPlan 模式的源计划名取测试计划域 currentTestPlan
    const testPlanName =
      this.#reportModel.get('reportMode') === 'scheduledPlan'
        ? undefined
        : this.#testPlanModel.get('currentTestPlan')?.name;
    return this.#reportModel.deleteReportRun(run, testPlanName);
  }

  openSelectedReport(testPlan) {
    return this.#reportModel.openSelectedReport(testPlan);
  }

  checkReportExists(testPlan) {
    return this.#reportModel.checkReportExists(testPlan);
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

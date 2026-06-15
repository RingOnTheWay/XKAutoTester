import { EventEmitter } from '../../core/EventEmitter.js';
import { ApiBridge } from '../../core/ApiBridge.js';
import { AppState } from '../../core/AppState.js';
import DeviceSelectionModal from '../../components/device-selection-modal.js';

/**
 * TestExecutionModel - 测试执行 Tab 的 Model 层
 * 管理测试计划、定时计划、测试执行、报告等状态与业务逻辑
 */
export class TestExecutionModel extends EventEmitter {
  #api = ApiBridge.bind({
    getTestPlans: 'getTestPlans',
    saveTestPlan: 'saveTestPlan',
    updateTestPlan: 'updateTestPlan',
    deleteTestPlan: 'deleteTestPlan',
    getScheduledPlans: 'getScheduledPlans',
    saveScheduledPlan: 'saveScheduledPlan',
    updateScheduledPlan: 'updateScheduledPlan',
    deleteScheduledPlan: 'deleteScheduledPlan',
    checkTimeConflict: 'checkTimeConflict',
    runPythonTests: 'runPythonTests',
    stopPythonTests: 'stopPythonTests',
    scanTestFiles: 'scanTestFiles',
    extractPytestMarkers: 'extractPytestMarkers',
    getPytestMarkers: 'getPytestMarkers',
    selectDirectory: 'selectDirectory',
    viewReport: 'viewReport',
    checkReportExists: 'checkReportExists',
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
  });

  #state = {
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
    outputBuffer: [],                  // 输出缓冲区
    outputRafId: null,                 // 输出刷新的 RAF ID
    extractingMarkers: null,           // 标记提取的 Promise 守卫
    selectingFromPlan: false,          // 是否从计划中选择文件
    selectedDevice: null,              // 当前选中的设备 ID（与 AppState 同步）
  };

  // ── AppState 订阅取消函数 ──────────────────────────────────────
  #unsubAppState = null;

  // ── IPC 事件取消函数列表 ────────────────────────────────────────
  #ipcUnsubscribers = [];

  // ── State Getters ──────────────────────────────────────────────

  get selectedDirectory() { return this.#state.selectedDirectory; }
  get selectedDirectoryDisplayName() { return this.#state.selectedDirectoryDisplayName; }
  get selectedTestFiles() { return this.#state.selectedTestFiles; }
  get testPlans() { return this.#state.testPlans; }
  get currentTestPlan() { return this.#state.currentTestPlan; }
  get scheduledPlans() { return this.#state.scheduledPlans; }
  get currentScheduledPlan() { return this.#state.currentScheduledPlan; }
  get isRunning() { return this.#state.isRunning; }
  get runningTestPlanName() { return this.#state.runningTestPlanName; }
  get runningScheduledPlanId() { return this.#state.runningScheduledPlanId; }
  get currentMarkers() { return this.#state.currentMarkers; }
  get selectedReportRun() { return this.#state.selectedReportRun; }
  get outputBuffer() { return this.#state.outputBuffer; }
  get outputRafId() { return this.#state.outputRafId; }
  get extractingMarkers() { return this.#state.extractingMarkers; }
  get selectingFromPlan() { return this.#state.selectingFromPlan; }
  get selectedDevice() { return this.#state.selectedDevice; }

  get(key) { return this.#state[key]; }

  // ── Private State Helper ───────────────────────────────────────

  #set(key, value, event) {
    const old = this.#state[key];
    if (old === value) return;
    this.#state[key] = value;
    this.emit(event || `${key}-changed`, value, old);
  }

  // ── 初始化 ─────────────────────────────────────────────────────

  async load() {
    // 从 AppState 同步 selectedDevice
    const appStateDevice = AppState.instance.get('selectedDevice');
    if (appStateDevice) {
      this.#state.selectedDevice = appStateDevice;
    }

    // 订阅 AppState 的 selectedDevice 变更，保持本地同步
    this.#unsubAppState = AppState.instance.on('selectedDevice-changed', (value) => {
      if (this.#state.selectedDevice !== value) {
        this.#state.selectedDevice = value;
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
    if (this.#state.outputRafId) {
      cancelAnimationFrame(this.#state.outputRafId);
      this.#state.outputRafId = null;
    }
    // 清理输出缓冲
    this.#state.outputBuffer = [];
    // 取消 AppState 订阅
    if (this.#unsubAppState) {
      this.#unsubAppState();
      this.#unsubAppState = null;
    }
    // 取消 IPC 事件监听
    this.#ipcUnsubscribers.forEach(fn => fn());
    this.#ipcUnsubscribers = [];
    // 移除所有事件监听
    this.removeAllListeners();
  }

  // ── 目录与文件 ─────────────────────────────────────────────────

  async selectDirectory() {
    try {
      const result = await this.#api.selectDirectory();
      if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
        return null;
      }
      const path = result.filePaths[0];
      const displayName = path.split(/[/\\]/).pop() || path;
      this.updateSelectedDirectory(path, displayName);
      return path;
    } catch (error) {
      this.emit('error', { source: 'selectDirectory', error });
      return null;
    }
  }

  async scanTestFiles() {
    if (!this.#state.selectedDirectory) return [];
    try {
      const result = await this.#api.scanTestFiles(this.#state.selectedDirectory);
      if (result && result.success !== false) {
        const files = result.files || result || [];
        this.#set('selectedTestFiles', files, 'test-files-scanned');
        return files;
      }
      return [];
    } catch (error) {
      this.emit('error', { source: 'scanTestFiles', error });
      return [];
    }
  }

  updateSelectedDirectory(path, displayName) {
    this.#set('selectedDirectory', path, 'selectedDirectory-changed');
    this.#set('selectedDirectoryDisplayName', displayName, 'selectedDirectoryDisplayName-changed');
  }

  // ── 测试计划 ───────────────────────────────────────────────────

  async loadTestPlans() {
    try {
      const result = await this.#api.getTestPlans();
      const plans = result?.data || result || [];
      this.#set('testPlans', plans, 'testPlans-changed');
      return plans;
    } catch (error) {
      this.emit('error', { source: 'loadTestPlans', error });
      return [];
    }
  }

  async saveTestPlan(planData) {
    try {
      const result = await this.#api.saveTestPlan(planData);
      await this.loadTestPlans();
      this.emit('testPlan-saved', result);
      return result;
    } catch (error) {
      this.emit('error', { source: 'saveTestPlan', error });
      return { success: false, error: error.message };
    }
  }

  async updateTestPlan(planId, planData) {
    try {
      const result = await this.#api.updateTestPlan(planId, planData);
      await this.loadTestPlans();
      this.emit('testPlan-updated', result);
      return result;
    } catch (error) {
      this.emit('error', { source: 'updateTestPlan', error });
      return { success: false, error: error.message };
    }
  }

  async deleteTestPlan(planId) {
    try {
      const result = await this.#api.deleteTestPlan(planId);
      await this.loadTestPlans();
      this.emit('testPlan-deleted', { planId, result });
      return result;
    } catch (error) {
      this.emit('error', { source: 'deleteTestPlan', error });
      return { success: false, error: error.message };
    }
  }

  selectTestPlan(plan) {
    this.#set('currentTestPlan', plan, 'currentTestPlan-changed');
  }

  deselectTestPlan() {
    this.#set('currentTestPlan', null, 'currentTestPlan-changed');
  }

  // ── 测试执行 ───────────────────────────────────────────────────

  async runTests(scheduledPlanInfo = null) {
    const testPlan = this.#state.currentTestPlan;
    if (!testPlan) {
      this.emit('run-error', { message: '请先选择测试计划' });
      return;
    }

    // 检查安卓设备配置
    const deviceConfigOk = await this.checkAndroidDeviceConfig();
    if (!deviceConfigOk) return;

    // 检查蓝牙端口配置
    const bleConfigOk = await this.checkBlePortConfig();
    if (!bleConfigOk) return;

    // 检查是否需要安卓设备，需要时弹出设备选择
    const androidRequired = await this.checkAndroidDeviceRequired(testPlan);
    if (androidRequired && !this.#state.selectedDevice) {
      this.emit('run-error', { message: '请先选择安卓设备' });
      return;
    }

    // 设置运行状态
    this.#set('isRunning', true, 'isRunning-changed');
    this.#set('runningTestPlanName', testPlan.name, 'runningTestPlanName-changed');
    if (scheduledPlanInfo) {
      this.#set('runningScheduledPlanId', scheduledPlanInfo.id, 'runningScheduledPlanId-changed');
    }
    this.clearOutput();

    try {
      const loopCount = testPlan.loopCount || 1;
      let continueOnFailure = testPlan.continueOnFailure !== false;
      let lastResult = null;

      for (let i = 0; i < loopCount; i++) {
        if (!this.#state.isRunning) break;

        // 如果是循环执行，输出当前轮次
        if (loopCount > 1) {
          this.appendOutput(`\n========== 第 ${i + 1}/${loopCount} 轮 ==========\n`);
        }

        const testPaths = testPlan.testPaths || testPlan.testFiles || [];
        const markers = testPlan.markers || [];
        const planName = testPlan.name;

        lastResult = await this.#api.runPythonTests(testPaths, markers, planName);

        // 执行失败且不继续时中断
        if (lastResult && lastResult.success === false && !continueOnFailure) {
          break;
        }
      }

      // 发送钉钉通知
      await this.sendTestNotification(testPlan, lastResult, scheduledPlanInfo);

      this.emit('run-complete', { testPlan, result: lastResult, scheduledPlanInfo });
    } catch (error) {
      this.emit('error', { source: 'runTests', error });
      this.emit('run-error', { message: error.message });
    } finally {
      this.#set('isRunning', false, 'isRunning-changed');
      this.#set('runningTestPlanName', null, 'runningTestPlanName-changed');
      this.#set('runningScheduledPlanId', null, 'runningScheduledPlanId-changed');
    }
  }

  async stopTests() {
    try {
      const result = await this.#api.stopPythonTests();
      this.#set('isRunning', false, 'isRunning-changed');
      this.#set('runningTestPlanName', null, 'runningTestPlanName-changed');
      this.#set('runningScheduledPlanId', null, 'runningScheduledPlanId-changed');
      this.emit('tests-stopped', result);
      return result;
    } catch (error) {
      this.emit('error', { source: 'stopTests', error });
      return { success: false, error: error.message };
    }
  }

  appendOutput(text) {
    this.#state.outputBuffer.push({ text, isError: false });
    this._scheduleOutputFlush();
  }

  appendError(text) {
    this.#state.outputBuffer.push({ text: `[ERROR] ${text}`, isError: true });
    this._scheduleOutputFlush();
  }

  clearOutput() {
    this.#state.outputBuffer = [];
    if (this.#state.outputRafId) {
      cancelAnimationFrame(this.#state.outputRafId);
      this.#state.outputRafId = null;
    }
    this.emit('output-cleared');
  }

  _scheduleOutputFlush() {
    if (this.#state.outputRafId) return;
    this.#state.outputRafId = requestAnimationFrame(() => this._flushOutputBuffer());
  }

  _flushOutputBuffer() {
    this.#state.outputRafId = null;
    if (this.#state.outputBuffer.length === 0) return;
    const batch = this.#state.outputBuffer.splice(0);
    this.emit('output-flushed', batch);
  }

  // ── 设备选择（从 Phase 3.3 迁移） ─────────────────────────────

  async checkAndroidDeviceRequired(testPlan) {
    if (!testPlan) return false;
    const testPaths = testPlan.testPaths || testPlan.testFiles || [];
    // 检查是否有安卓相关用例
    const androidCases = testPaths.filter(p =>
      p.includes('android') || p.includes('appium') || p.includes('device')
    );
    return androidCases.length > 0;
  }

  checkDeviceNamePlaceholder(androidCases) {
    // 检查用例中是否包含设备名占位符
    return androidCases.some(p => p.includes('{{DEVICE_NAME}}') || p.includes('{{device_name}}'));
  }

  async showDeviceSelectionForTest(androidCases) {
    try {
      const modal = new DeviceSelectionModal();
      const deviceId = await modal.show({ mode: 'test' });

      // 检查当前是否有已选设备，如有则提示是否替换
      if (this.#state.selectedDevice) {
        const shouldReplace = await this.showReplaceDeviceConfirm(this.#state.selectedDevice);
        if (!shouldReplace) return this.#state.selectedDevice;
      }

      this.#set('selectedDevice', deviceId, 'selectedDevice-changed');
      AppState.instance.set('selectedDevice', deviceId);
      return deviceId;
    } catch (error) {
      // 用户取消选择
      if (error.message === 'cancelled') return null;
      this.emit('error', { source: 'showDeviceSelectionForTest', error });
      return null;
    }
  }

  async showReplaceDeviceConfirm(currentDevice) {
    // 通过事件让 View 层显示确认弹窗，返回 Promise
    return new Promise((resolve) => {
      this.emit('confirm-replace-device', {
        currentDevice,
        onConfirm: () => resolve(true),
        onCancel: () => resolve(false),
      });
    });
  }

  async checkAndroidDeviceConfig() {
    try {
      const config = await this.#api.getConfig();
      const androidCases = this.#state.currentTestPlan?.testPaths?.filter(p =>
        p.includes('android') || p.includes('appium') || p.includes('device')
      ) || [];

      if (androidCases.length === 0) return true;

      // 需要安卓设备但未选择设备
      if (!this.#state.selectedDevice) {
        const deviceId = await this.showDeviceSelectionForTest(androidCases);
        if (!deviceId) {
          this.emit('run-error', { message: '需要选择安卓设备才能执行测试' });
          return false;
        }
      }

      return true;
    } catch (error) {
      this.emit('error', { source: 'checkAndroidDeviceConfig', error });
      return false;
    }
  }

  async checkBlePortConfig() {
    try {
      const config = await this.#api.getConfig();
      // 检查是否有蓝牙相关用例
      const testPaths = this.#state.currentTestPlan?.testPaths || [];
      const bleCases = testPaths.filter(p =>
        p.includes('ble') || p.includes('bluetooth')
      );

      if (bleCases.length === 0) return true;

      // 检查蓝牙端口配置
      const bleDeviceConfig = await this.#api.getConfig();
      // 如果没有配置蓝牙端口，提示用户
      // 此处简化处理，实际可扩展
      return true;
    } catch (error) {
      this.emit('error', { source: 'checkBlePortConfig', error });
      return false;
    }
  }

  // ── 定时计划 ───────────────────────────────────────────────────

  async loadScheduledPlans() {
    try {
      const result = await this.#api.getScheduledPlans();
      const plans = result?.data || result || [];
      this.#set('scheduledPlans', plans, 'scheduledPlans-changed');
      return plans;
    } catch (error) {
      this.emit('error', { source: 'loadScheduledPlans', error });
      return [];
    }
  }

  async saveScheduledPlan(planData) {
    try {
      const result = await this.#api.saveScheduledPlan(planData);
      await this.loadScheduledPlans();
      this.emit('scheduledPlan-saved', result);
      return result;
    } catch (error) {
      this.emit('error', { source: 'saveScheduledPlan', error });
      return { success: false, error: error.message };
    }
  }

  async updateScheduledPlan(planId, planData) {
    try {
      const result = await this.#api.updateScheduledPlan(planId, planData);
      await this.loadScheduledPlans();
      this.emit('scheduledPlan-updated', result);
      return result;
    } catch (error) {
      this.emit('error', { source: 'updateScheduledPlan', error });
      return { success: false, error: error.message };
    }
  }

  async deleteScheduledPlan(planId) {
    try {
      const result = await this.#api.deleteScheduledPlan(planId);
      await this.loadScheduledPlans();
      this.emit('scheduledPlan-deleted', { planId, result });
      return result;
    } catch (error) {
      this.emit('error', { source: 'deleteScheduledPlan', error });
      return { success: false, error: error.message };
    }
  }

  selectScheduledPlan(plan) {
    this.#set('currentScheduledPlan', plan, 'currentScheduledPlan-changed');
  }

  deselectScheduledPlan() {
    this.#set('currentScheduledPlan', null, 'currentScheduledPlan-changed');
  }

  /**
   * 编辑测试计划弹窗 — 由 controller 调用，触发 view 填充数据
   * @param {Object} plan - 测试计划对象
   */
  showEditPlanModal(plan) {
    this.emit('show-edit-plan-modal', plan);
  }

  /**
   * 编辑定时计划弹窗 — 由 controller 调用，触发 view 填充数据
   * @param {Object} plan - 定时计划对象
   */
  showEditScheduledPlanModal(plan) {
    this.emit('show-edit-scheduled-plan-modal', plan);
  }

  /**
   * 加载定时计划弹窗所需的测试计划列表
   */
  async loadTestPlansForScheduledModal() {
    const plans = await this.loadTestPlans();
    this.emit('test-plans-for-scheduled-modal', plans);
    return plans;
  }

  /**
   * 处理定时计划触发执行事件
   */
  async handleScheduledTestStart(data) {
    this.emit('scheduled-test-started', data);
    // 自动运行测试
    if (data?.testPlanName) {
      await this.runTests({ id: data.planId, name: data.testPlanName });
    }
  }

  /**
   * 处理定时计划过期事件
   */
  handleScheduledPlanExpired(data) {
    this.emit('scheduled-plan-expired', data);
    // 刷新定时计划列表
    this.loadScheduledPlans();
  }

  async checkTimeConflict(scheduledTime, excludeId) {
    try {
      const result = await this.#api.checkTimeConflict(scheduledTime, excludeId);
      return result;
    } catch (error) {
      this.emit('error', { source: 'checkTimeConflict', error });
      return { hasConflict: false };
    }
  }

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

  getScheduledPlanStatus(plan) {
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

  // ── 测试类型/标记 ──────────────────────────────────────────────

  async updateTestTypesFromSelectedFiles() {
    await this.extractMarkersFromSelectedFiles();
  }

  async extractMarkersFromSelectedFiles() {
    // 使用 Promise 守卫防止并发提取
    if (this.#state.extractingMarkers) {
      return this.#state.extractingMarkers;
    }

    const promise = (async () => {
      try {
        const files = this.#state.selectedTestFiles;
        if (!files || files.length === 0) {
          this.#set('currentMarkers', [], 'currentMarkers-changed');
          return [];
        }

        const result = await this.#api.extractPytestMarkers(files);
        const markers = result?.markers || result || [];
        this.#set('currentMarkers', markers, 'currentMarkers-changed');
        return markers;
      } catch (error) {
        this.emit('error', { source: 'extractMarkersFromSelectedFiles', error });
        return [];
      } finally {
        this.#state.extractingMarkers = null;
      }
    })();

    this.#state.extractingMarkers = promise;
    return promise;
  }

  async loadPytestMarkers() {
    try {
      const result = await this.#api.getPytestMarkers();
      const markers = result?.markers || result || [];
      this.#set('currentMarkers', markers, 'currentMarkers-changed');
      return markers;
    } catch (error) {
      this.emit('error', { source: 'loadPytestMarkers', error });
      return [];
    }
  }

  getSelectedTestTypes() {
    return this.#state.currentMarkers || [];
  }

  // ── 报告 ───────────────────────────────────────────────────────

  async viewReport(testPlan) {
    try {
      const result = await this.#api.viewReport(testPlan);
      this.emit('report-viewed', { testPlan, result });
      return result;
    } catch (error) {
      this.emit('error', { source: 'viewReport', error });
      return { success: false, error: error.message };
    }
  }

  async checkReportExists(testPlan) {
    try {
      const result = await this.#api.checkReportExists(testPlan);
      return result;
    } catch (error) {
      this.emit('error', { source: 'checkReportExists', error });
      return { exists: false };
    }
  }

  // ── 钉钉通知 ───────────────────────────────────────────────────

  async sendTestNotification(testPlan, result, scheduledPlanInfo = null) {
    try {
      const config = await this.#api.getConfig();
      const notification = config?.APP_SETTINGS?.notification;
      if (!notification || notification.platform === 'none') return;

      const planName = testPlan?.name || '未知计划';
      const status = result?.success ? '✅ 通过' : '❌ 失败';
      const text = scheduledPlanInfo
        ? `[定时任务] ${planName} 执行完毕: ${status}`
        : `${planName} 执行完毕: ${status}`;

      await this.#api.sendDingTalkNotification(text);
    } catch (error) {
      // 通知失败不影响主流程，仅记录
      this.emit('notification-error', { source: 'sendTestNotification', error });
    }
  }

  // ── IPC 事件监听 ───────────────────────────────────────────────

  listenTestOutput() {
    const unlisten = ApiBridge.listen({
      'test-output': (text) => {
        this.appendOutput(text);
      },
    });
    this.#ipcUnsubscribers.push(unlisten);
    return unlisten;
  }

  listenTestError() {
    const unlisten = ApiBridge.listen({
      'test-error': (text) => {
        this.appendError(text);
      },
    });
    this.#ipcUnsubscribers.push(unlisten);
    return unlisten;
  }

  listenScheduledTestStart() {
    const unlisten = ApiBridge.listen({
      'scheduled-test-start': (data) => {
        this.emit('scheduled-test-started', data);
      },
    });
    this.#ipcUnsubscribers.push(unlisten);
    return unlisten;
  }

  listenScheduledPlanExpired() {
    const unlisten = ApiBridge.listen({
      'scheduled-plan-expired': (data) => {
        this.emit('scheduled-plan-expired', data);
      },
    });
    this.#ipcUnsubscribers.push(unlisten);
    return unlisten;
  }
}

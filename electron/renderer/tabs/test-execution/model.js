import { EventEmitter } from '../../core/EventEmitter.js';
import { ApiBridge } from '../../core/ApiBridge.js';
import { AppState } from '../../core/AppState.js';

/**
 * TestExecutionModel - 测试执行 Tab 的 Model 层
 * 管理测试计划、定时计划、测试执行、报告等状态与业务逻辑
 *
 * R10: 原 6 个 model mixin (Directory/TestPlans/TestExecution/DeviceSelection/
 *      ScheduledPlans/Reports) 已内联到本类，移除 Object.assign prototype 注入。
 *      方法体保持不变，this._api / this._state / this._ipcUnsubscribers /
 *      this._set / this._requestDeviceSelection 访问器行为一致 (mixin 中 this
 *      指实例，内联到 class 后仍指实例)。
 *      私有字段 #api/#state/#ipcUnsubscribers 与私有方法 #set/#requestDeviceSelection
 *      因需被 (原 mixin) 方法访问，已公共化为 _api/_state/_ipcUnsubscribers 与
 *      _set/_requestDeviceSelection。#unsubAppState 仅在类体内使用，保持私有。
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

  // ── Private State Helper（公共化供原 mixin 方法调用） ─────────

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

  // ─── 目录与文件 (原 modelDirectoryMixin) ───────────────────────

  async selectDirectory() {
    try {
      const result = await this._api.selectDirectory();
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
    if (!this._state.selectedDirectory) return [];
    try {
      // wrapper 已处理 IPC 失败,错误由外层 catch 接
      const result = await this._api.scanTestFiles(this._state.selectedDirectory);
      const files = result.files || result || [];
      // 仅在无选中计划时更新 selectedTestFiles，避免弹窗中的扫描覆盖计划文件列表
      if (!this._state.currentTestPlan) {
        this._set('selectedTestFiles', files, 'test-files-scanned');
      }
      return files;
    } catch (error) {
      this.emit('error', { source: 'scanTestFiles', error });
      return [];
    }
  }

  updateSelectedDirectory(path, displayName) {
    this._set('selectedDirectory', path, 'selectedDirectory-changed');
    this._set('selectedDirectoryDisplayName', displayName, 'selectedDirectoryDisplayName-changed');
  }

  // ─── 测试计划 (原 modelTestPlansMixin) ─────────────────────────

  async loadTestPlans() {
    try {
      const result = await this._api.getTestPlans();
      const plans = result?.data || result || [];
      this._set('testPlans', plans, 'testPlans-changed');
      // 同步 currentTestPlan：若已选中计划，从新列表中找到对应项更新引用
      if (this._state.currentTestPlan) {
        const updated = plans.find(p => p.id === this._state.currentTestPlan.id);
        if (updated) {
          if (updated !== this._state.currentTestPlan) {
            this._set('currentTestPlan', updated, 'currentTestPlan-changed');
          }
        } else {
          // 计划已被删除，清空 currentTestPlan
          this._set('currentTestPlan', null, 'currentTestPlan-changed');
        }
      }
      return plans;
    } catch (error) {
      this.emit('error', { source: 'loadTestPlans', error });
      return [];
    }
  }

  async saveTestPlan(planData) {
    try {
      const result = await this._api.saveTestPlan(planData);
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
      // preload updateTestPlan 只接收单个 planData 参数，需将 id 合并进去
      const result = await this._api.updateTestPlan({ ...planData, id: planId });
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
      const result = await this._api.deleteTestPlan(planId);
      await this.loadTestPlans();
      this.emit('testPlan-deleted', { planId, result });
      return result;
    } catch (error) {
      this.emit('error', { source: 'deleteTestPlan', error });
      return { success: false, error: error.message };
    }
  }

  selectTestPlan(plan) {
    this._set('currentTestPlan', plan, 'currentTestPlan-changed');
  }

  deselectTestPlan() {
    this._set('currentTestPlan', null, 'currentTestPlan-changed');
  }

  // ─── 测试执行 + 输出缓冲 + IPC (原 modelTestExecutionMixin) ────

  async runTests(scheduledPlanInfo = null) {
    const testPlan = this._state.currentTestPlan;
    if (!testPlan) {
      this.emit('run-error', { message: window.i18n.t('testExecution.selectPlanFirst') });
      return;
    }

    // 检查安卓用例是否已填写设备信息
    const deviceCheckResult = await this.checkAndroidDeviceConfig();
    if (!deviceCheckResult.valid) {
      this.emit('run-warning', { message: deviceCheckResult.message });
      return;
    }

    // 检查蓝牙用例是否已填写端口信息
    const blePortCheckResult = await this.checkBlePortConfig();
    if (!blePortCheckResult.valid) {
      this.emit('run-warning', { message: blePortCheckResult.message });
      return;
    }

    // 设置运行状态
    this._set('isRunning', true, 'isRunning-changed');
    this._set('runningTestPlanName', testPlan.name, 'runningTestPlanName-changed');
    if (scheduledPlanInfo) {
      this._set('runningScheduledPlanId', scheduledPlanInfo.id, 'runningScheduledPlanId-changed');
    }
    this.clearOutput();

    // 输出测试计划详情
    const loopCount = testPlan.loopCount || 1;
    const continueOnFailure = testPlan.continueOnFailure !== false;
    this.appendOutput('>>> ========== ' + window.i18n.t('testExecution.testPlanDetails') + ' ==========');
    this.appendOutput('>>> ' + window.i18n.t('testExecution.planName') + ': ' + (testPlan.name || ''));
    this.appendOutput('>>> ' + window.i18n.t('testExecution.planDescription') + ': ' + (testPlan.description || window.i18n.t('common.none')));
    const testFileNames = this._state.selectedTestFiles.map(f => f.name || f.path).join(', ');
    this.appendOutput('>>> ' + window.i18n.t('testExecution.testFiles') + ': ' + (testFileNames || window.i18n.t('common.none')));
    const testTypes = this.getSelectedTestTypes().join(', ');
    this.appendOutput('>>> ' + window.i18n.t('testExecution.testTypes') + ': ' + (testTypes || window.i18n.t('testExecution.allTypes')));
    this.appendOutput('>>> ' + window.i18n.t('testExecution.loopSettings') + ': ' + window.i18n.t('testExecution.loopCount') + ' ' + loopCount + ', ' + window.i18n.t('testExecution.continueOnFailure') + ': ' + (continueOnFailure ? window.i18n.t('common.yes') : window.i18n.t('common.no')));

    if (scheduledPlanInfo) {
      this.appendOutput('>>> ---------- ' + window.i18n.t('testExecution.scheduledPlanInfo') + ' ----------');
      this.appendOutput('>>> ' + window.i18n.t('testExecution.scheduledPlanName') + ': ' + (scheduledPlanInfo.name || ''));
      this.appendOutput('>>> ' + window.i18n.t('testExecution.executionTime') + ': ' + (scheduledPlanInfo.executionTime || new Date().toLocaleString()));
    }
    this.appendOutput('>>> ==================================\n');

    let hasFailure = false;
    let stoppedEarly = false;
    let lastResult = null;
    const loopResults = [];
    const aggregatedStats = { passed: 0, failed: 0, skipped: 0, broken: 0, total: 0 };

    try {
      for (let i = 1; i <= loopCount; i++) {
        if (!this._state.isRunning) {
          stoppedEarly = true;
          break;
        }

        this.emit('loop-progress-changed', { current: i, total: loopCount });

        const testPaths = this._state.selectedTestFiles.map(f => f.path || f);
        const markers = this.getSelectedTestTypes();
        const planName = testPlan.name;

        const testConfig = {
          testPaths,
          markers,
          testPlanName: planName,
          loopIndex: i,
          totalLoops: loopCount,
        };

        this.appendOutput(`\n>>> ${window.i18n.t('testExecution.loopProgress', { current: i, total: loopCount })}`);

        lastResult = await this._api.runPythonTests(testConfig);

        if (lastResult) {
          if (!lastResult.success) {
            hasFailure = true;
            loopResults.push({ loop: i, success: false, testStats: lastResult.testStats || null });
            if (!continueOnFailure) {
              this.appendError(`>>> ${window.i18n.t('testExecution.loopStopped', { current: i })}`);
              break;
            }
            this.appendError(`>>> ${window.i18n.t('testExecution.loopFailed', { current: i })}`);
          } else {
            loopResults.push({ loop: i, success: true, testStats: lastResult.testStats || null });
            this.appendOutput(`>>> ${window.i18n.t('testExecution.loopCompleted', { current: i })}`);
          }

          if (lastResult.testStats) {
            aggregatedStats.passed += lastResult.testStats.passed || 0;
            aggregatedStats.failed += lastResult.testStats.failed || 0;
            aggregatedStats.skipped += lastResult.testStats.skipped || 0;
            aggregatedStats.broken += lastResult.testStats.broken || 0;
            aggregatedStats.total += lastResult.testStats.total || 0;
          }
        }

        if (!this._state.isRunning) {
          stoppedEarly = true;
          break;
        }
      }

      if (!stoppedEarly) {
        if (!hasFailure || continueOnFailure) {
          this.appendOutput('>>> ========== ' + window.i18n.t('testExecution.allLoopsCompleted'));
        }
        this.emit('run-report-available');
      }
    } catch (error) {
      this.emit('error', { source: 'runTests', error });
      // 不显示 error.message 全文: 旧版 preload invokeWithCheck 抛错时 message 是完整 stderr,
      // 而 TEST_ERROR 已实时转发, 重复显示无意义
      this.appendError(`>>> ${window.i18n.t('testExecution.testRunFailed')}`);
    } finally {
      // 输出统计摘要
      this.appendOutput('>>> ========== ' + window.i18n.t('testExecution.summaryInfo') + ' ==========');
      let passRate = '0.00';
      let passedLoops = 0;
      if (loopCount > 1) {
        passedLoops = loopResults.filter(r => r.success).length;
        passRate = loopResults.length > 0 ? ((passedLoops / loopResults.length) * 100).toFixed(2) : '0.00';
        this.appendOutput('>>> ' + window.i18n.t('testExecution.totalLoops') + ': ' + loopResults.length);
        this.appendOutput('>>> ' + window.i18n.t('testExecution.passedLoops') + ': ' + passedLoops);
        this.appendOutput('>>> ' + window.i18n.t('testExecution.passRate') + ': ' + passRate + '%');
      } else {
        const lastLoopResult = loopResults[loopResults.length - 1];
        if (lastLoopResult && lastLoopResult.success) {
          passedLoops = 1;
          passRate = '100.00';
        }
      }

      // 用例级统计
      const effectiveTotal = aggregatedStats.passed + aggregatedStats.failed + aggregatedStats.broken;
      const casePassRate = effectiveTotal > 0 ? ((aggregatedStats.passed / effectiveTotal) * 100).toFixed(2) : '0.00';
      if (aggregatedStats.total > 0) {
        this.appendOutput('>>> ' + window.i18n.t('testExecution.caseStats') + ': ' +
          window.i18n.t('testExecution.casePassed') + ' ' + aggregatedStats.passed + ', ' +
          window.i18n.t('testExecution.caseFailed') + ' ' + aggregatedStats.failed + ', ' +
          window.i18n.t('testExecution.caseSkipped') + ' ' + aggregatedStats.skipped + ', ' +
          window.i18n.t('testExecution.caseBroken') + ' ' + aggregatedStats.broken + ', ' +
          window.i18n.t('testExecution.caseTotal') + ' ' + aggregatedStats.total);
        this.appendOutput('>>> ' + window.i18n.t('testExecution.casePassRate') + ': ' + casePassRate + '%');
      }

      // 测试状态判断
      let testStatus = 'passed';
      if (aggregatedStats.total === 0) {
        testStatus = 'noTests';
      } else if (aggregatedStats.failed > 0 || aggregatedStats.broken > 0) {
        testStatus = aggregatedStats.passed > 0 ? 'partialPassed' : 'failed';
      } else if (aggregatedStats.skipped > 0 && aggregatedStats.passed === 0) {
        testStatus = 'skipped';
      } else if (aggregatedStats.skipped > 0 && aggregatedStats.passed > 0) {
        testStatus = 'partialPassed';
      }
      const lastLoopResult = loopResults[loopResults.length - 1];
      if (lastLoopResult && !lastLoopResult.success && aggregatedStats.total === 0) {
        testStatus = 'noTests';
      }

      const statusMessages = {
        passed: window.i18n.t('testExecution.testPassed'),
        failed: window.i18n.t('testExecution.testFailed'),
        skipped: window.i18n.t('testExecution.testSkipped'),
        partialPassed: window.i18n.t('testExecution.testPartialPassed'),
        noTests: window.i18n.t('testExecution.noTests'),
      };
      this.appendOutput('>>> ' + (statusMessages[testStatus] || statusMessages.passed));
      this.appendOutput('>>> ==================================\n');

      // 发送钉钉通知
      const notificationInfo = {
        testPlanName: testPlan?.name || '',
        testFileNames: testFileNames,
        testTypes: testTypes,
        loopCount: loopCount,
        totalLoops: loopResults.length,
        passRate: passRate,
        hasFailure: hasFailure,
        stoppedEarly: stoppedEarly,
        testStatus: testStatus,
        aggregatedStats: aggregatedStats,
        casePassRate: casePassRate
      };
      if (scheduledPlanInfo) {
        notificationInfo.scheduledPlanName = scheduledPlanInfo.name;
        notificationInfo.scheduledPlanExecutionTime = scheduledPlanInfo.executionTime;
      }
      await this.sendTestNotification(notificationInfo);

      this._set('isRunning', false, 'isRunning-changed');
      this._set('runningTestPlanName', null, 'runningTestPlanName-changed');
      this._set('runningScheduledPlanId', null, 'runningScheduledPlanId-changed');
      this.emit('run-complete', { testPlan, result: lastResult, scheduledPlanInfo, testStatus, aggregatedStats });
    }
  }

  async stopTests() {
    try {
      const result = await this._api.stopPythonTests();
      this._set('isRunning', false, 'isRunning-changed');
      this._set('runningTestPlanName', null, 'runningTestPlanName-changed');
      this._set('runningScheduledPlanId', null, 'runningScheduledPlanId-changed');
      this.emit('tests-stopped', result);
      return result;
    } catch (error) {
      this.emit('error', { source: 'stopTests', error });
      return { success: false, error: error.message };
    }
  }

  appendOutput(text) {
    if (!text) return;
    // 按行过滤空白行
    const filteredLines = text.split(/\r?\n/).filter(line => line.trim() !== '');
    if (filteredLines.length === 0) return;
    const filteredText = filteredLines.join('\n');
    this._state.outputBuffer.push({ text: filteredText, isError: false });
    this._scheduleOutputFlush();
  }

  appendError(text) {
    if (!text) return;
    // 按行过滤空白行
    const filteredLines = text.split(/\r?\n/).filter(line => line.trim() !== '');
    if (filteredLines.length === 0) return;
    const filteredText = filteredLines.join('\n');
    this._state.outputBuffer.push({ text: filteredText, isError: true });
    this._scheduleOutputFlush();
  }

  clearOutput() {
    this._state.outputBuffer = [];
    if (this._state.outputRafId) {
      cancelAnimationFrame(this._state.outputRafId);
      this._state.outputRafId = null;
    }
    this.emit('output-cleared');
  }

  _scheduleOutputFlush() {
    if (this._state.outputRafId) return;
    this._state.outputRafId = requestAnimationFrame(() => this._flushOutputBuffer());
  }

  _flushOutputBuffer() {
    this._state.outputRafId = null;
    if (this._state.outputBuffer.length === 0) return;
    const batch = this._state.outputBuffer.splice(0);
    this.emit('output-flushed', batch);
  }

  // ─── 设备选择 (原 modelDeviceSelectionMixin) ──────────────────

  /**
   * 检查测试计划是否包含Android平台的测试用例
   * @param {Object} testPlan - 测试计划对象
   * @returns {Promise<{required: boolean, cases: Array}>}
   */
  async checkAndroidDeviceRequired(testPlan) {
    if (!testPlan || !testPlan.testFiles || testPlan.testFiles.length === 0) {
      return { required: false, cases: [] };
    }

    const androidCases = [];

    for (const testFile of testPlan.testFiles) {
      try {
        let fileName = testFile.name || testFile.path;
        if (fileName.endsWith('.py')) fileName = fileName.slice(0, -3);
        if (fileName.includes('/') || fileName.includes('\\')) fileName = fileName.split(/[\\/]/).pop();

        // wrapper 已处理 IPC 失败,此处直接判断 data 字段
        const result = await this._api.testCaseGet(fileName);

        if (result && result.data) {
          const caseData = result.data;
          const platform = caseData.platform || 'android';
          if (platform.toLowerCase() === 'android') {
            androidCases.push({
              fileName,
              filePath: testFile.path,
              caseData
            });
          }
        }
      } catch (error) {
        console.warn(`检查测试文件平台失败: ${testFile.name}`, error);
      }
    }

    return {
      required: androidCases.length > 0,
      cases: androidCases
    };
  }

  /**
   * 检查Android用例的DEVICE_NAME是否为占位符或未设置
   * @param {Array} androidCases - Android测试用例数组
   * @returns {{hasPlaceholder: boolean, existingDevice: string|null}}
   */
  checkDeviceNamePlaceholder(androidCases) {
    if (!androidCases || androidCases.length === 0) {
      return { hasPlaceholder: true, existingDevice: null };
    }

    let hasPlaceholder = false;
    let existingDevice = null;

    for (const caseItem of androidCases) {
      const deviceName = caseItem.caseData?.deviceName;
      if (!deviceName || deviceName === '' || deviceName === '{{DEVICE_NAME}}') {
        hasPlaceholder = true;
      } else if (deviceName && !existingDevice) {
        existingDevice = deviceName;
      }
    }

    return { hasPlaceholder, existingDevice };
  }

  /**
   * 显示设备选择弹窗并处理设备选择
   * @param {Array} androidCases - Android测试用例数组
   * @returns {Promise<boolean>} - 是否成功选择设备
   */
  async showDeviceSelectionForTest(androidCases) {
    try {
      // MVC: model 不直接创建 UI 组件,emit 事件让 controller 调 view 显示弹窗
      const deviceId = await this._requestDeviceSelection('test');

      // 获取设备Android版本
      let platformVersion = '';
      try {
        const versionResult = await this._api.executeAdbCommand('getprop ro.build.version.release', deviceId);
        // wrapper 失败已抛错由 catch 接,此处走到即成功
        platformVersion = versionResult.output.trim() || '';
      } catch (error) {
        console.warn('获取Android版本失败:', error);
      }

      // 更新所有Android用例的DEVICE_NAME和PLATFORM_VERSION并重新生成Python文件
      if (androidCases && androidCases.length > 0) {
        for (const caseItem of androidCases) {
          try {
            if (!caseItem.caseData.deviceConfig) {
              caseItem.caseData.deviceConfig = {};
            }
            caseItem.caseData.deviceConfig.deviceName = deviceId;
            if (platformVersion) {
              caseItem.caseData.deviceConfig.platformVersion = platformVersion;
            }

            // 从文件路径中提取输出目录
            const filePath = caseItem.filePath;
            let outputDir = this._state.selectedDirectory;
            if (filePath) {
              const pathParts = filePath.split(/[\\/]/);
              outputDir = pathParts.slice(0, -1).join('/');
            }
            if (!outputDir) {
              outputDir = this._state.selectedDirectory;
            }

            // wrapper 已处理 IPC 失败,错误由外层 catch 接
            await this._api.testCaseSaveAndGenerate(caseItem.caseData, outputDir);
          } catch (error) {
            console.error(`更新测试用例设备信息失败: ${caseItem.fileName}`, error);
          }
        }
      }

      this._set('selectedDevice', deviceId, 'selectedDevice-changed');
      AppState.instance.set('selectedDevice', deviceId);
      return true;
    } catch (error) {
      if (error.message === 'cancelled') return false;
      this.emit('error', { source: 'showDeviceSelectionForTest', error });
      return false;
    }
  }

  async showReplaceDeviceConfirm(currentDevice) {
    return new Promise((resolve) => {
      this.emit('confirm-replace-device', {
        currentDevice,
        onConfirm: () => resolve(true),
        onCancel: () => resolve(false),
      });
    });
  }

  /**
   * 检查安卓用例是否已填写设备信息
   * @returns {Promise<{valid: boolean, message: string}>}
   */
  async checkAndroidDeviceConfig() {
    if (!this._state.selectedTestFiles || this._state.selectedTestFiles.length === 0) {
      return { valid: true, message: '' };
    }

    const unconfiguredFiles = [];

    for (const file of this._state.selectedTestFiles) {
      let fileName = file.name || file.path;
      if (fileName.endsWith('.py')) fileName = fileName.slice(0, -3);
      if (fileName.includes('/') || fileName.includes('\\')) fileName = fileName.split(/[\\/]/).pop();

      try {
        // wrapper 已处理 IPC 失败,此处直接判断 data 字段
        const result = await this._api.testCaseGet(fileName);
        if (result && result.data) {
          const caseData = result.data;
          const platform = caseData.platform;

          if (platform && platform.toLowerCase() === 'android') {
            const deviceName = caseData.deviceConfig?.deviceName;
            if (!deviceName || deviceName === '{{DEVICE_NAME}}' || deviceName.trim() === '') {
              unconfiguredFiles.push(file.name || file.path);
            }
          }
        }
      } catch (error) {
        // 忽略单个文件的错误
      }
    }

    if (unconfiguredFiles.length > 0) {
      const fileList = unconfiguredFiles.length > 3
        ? unconfiguredFiles.slice(0, 3).join(', ') + '...'
        : unconfiguredFiles.join(', ');
      return {
        valid: false,
        message: window.i18n.t('testExecution.deviceSelection.deviceNotConfigured', { files: fileList })
      };
    }

    return { valid: true, message: '' };
  }

  /**
   * 检查蓝牙用例是否已填写端口信息
   * @returns {Promise<{valid: boolean, message: string}>}
   */
  async checkBlePortConfig() {
    if (!this._state.selectedTestFiles || this._state.selectedTestFiles.length === 0) {
      return { valid: true, message: '' };
    }

    const unconfiguredFiles = [];

    for (const file of this._state.selectedTestFiles) {
      let fileName = file.name || file.path;
      if (fileName.endsWith('.py')) fileName = fileName.slice(0, -3);
      if (fileName.includes('/') || fileName.includes('\\')) fileName = fileName.split(/[\\/]/).pop();

      try {
        // wrapper 已处理 IPC 失败,此处直接判断 data 字段
        const result = await this._api.testCaseGet(fileName);
        if (result && result.data) {
          const caseData = result.data;
          const steps = caseData.steps || [];

          const hasBleSteps = steps.some(step => step.type === 'ble');

          if (hasBleSteps) {
            const blePort = caseData.bleDevice?.port;
            if (!blePort || blePort.trim() === '') {
              unconfiguredFiles.push(file.name || file.path);
            }
          }
        }
      } catch (error) {
        // 忽略单个文件的错误
      }
    }

    if (unconfiguredFiles.length > 0) {
      const fileList = unconfiguredFiles.length > 3
        ? unconfiguredFiles.slice(0, 3).join(', ') + '...'
        : unconfiguredFiles.join(', ');
      return {
        valid: false,
        message: window.i18n.t('testExecution.deviceSelection.blePortNotConfigured', { files: fileList })
      };
    }

    return { valid: true, message: '' };
  }

  /**
   * 显示编辑设备连接标识弹窗
   * @param {string} fileName - 测试用例文件名（不含.py）
   * @param {string} filePath - 测试用例文件完整路径
   */
  async showEditDeviceIdModal(fileName, filePath) {
    this._editDeviceIdFileName = fileName;
    this._editDeviceIdFilePath = filePath;

    let isAndroid = false;
    let hasBleSteps = false;
    let deviceName = '';
    let platformVersion = '';
    let blePort = '';

    try {
      // wrapper 已处理 IPC 失败,此处直接判断 data 字段
      const result = await this._api.testCaseGet(fileName);
      if (result && result.data) {
        deviceName = result.data.deviceConfig?.deviceName || '';
        platformVersion = result.data.deviceConfig?.platformVersion || '';
        blePort = result.data.bleDevice?.port || '';
        isAndroid = result.data.platform && result.data.platform.toLowerCase() === 'android';
        hasBleSteps = result.data.steps && result.data.steps.some(step => step.type === 'ble');
      }
    } catch (error) {
      console.error('获取测试用例设备信息失败:', error);
    }

    // 保存是否有蓝牙步骤的标记
    this._editDeviceIdHasBle = hasBleSteps;

    // 通过事件通知 View 层打开弹窗并填充数据
    this.emit('show-edit-device-id-modal', {
      fileName,
      filePath,
      deviceName: (deviceName && deviceName !== '{{DEVICE_NAME}}') ? deviceName : '',
      platformVersion: (platformVersion && platformVersion !== '{{PLATFORM_VERSION}}') ? platformVersion : '',
      blePort,
      isAndroid,
      hasBleSteps,
    });
  }

  /**
   * 确认编辑设备连接标识
   * @param {string} deviceName - 设备名称
   * @param {string} platformVersion - 平台版本
   * @param {string} blePort - 蓝牙端口
   */
  async confirmEditDeviceId(deviceName, platformVersion, blePort) {
    if (!this._editDeviceIdFileName) return;

    try {
      // wrapper 已处理 IPC 失败,此处直接判断 data 字段
      const result = await this._api.testCaseGet(this._editDeviceIdFileName);
      if (result && result.data) {
        const caseData = result.data;

        // 更新设备配置
        if (!caseData.deviceConfig) {
          caseData.deviceConfig = {};
        }
        caseData.deviceConfig.deviceName = deviceName || '{{DEVICE_NAME}}';
        caseData.deviceConfig.platformVersion = platformVersion || '{{PLATFORM_VERSION}}';

        // 更新蓝牙端口配置
        if (this._editDeviceIdHasBle) {
          if (!caseData.bleDevice) {
            caseData.bleDevice = {};
          }
          caseData.bleDevice.port = blePort || '';
        }

        // 从文件路径中提取输出目录
        let outputDir = this._state.selectedDirectory;
        if (this._editDeviceIdFilePath) {
          const pathParts = this._editDeviceIdFilePath.split(/[\\/]/);
          outputDir = pathParts.slice(0, -1).join('/');
        }
        if (!outputDir) {
          outputDir = this._state.selectedDirectory;
        }

        // wrapper 已处理 IPC 失败,错误由外层 catch 接
        await this._api.testCaseSaveAndGenerate(caseData, outputDir);
        this.emit('edit-device-id-saved', { fileName: this._editDeviceIdFileName, caseData });
      }
    } catch (error) {
      this.emit('error', { source: 'confirmEditDeviceId', error });
    }

    // 清理状态
    this._editDeviceIdFileName = null;
    this._editDeviceIdFilePath = null;
    this._editDeviceIdHasBle = false;
  }

  /**
   * 为编辑设备ID弹窗中的"设备管理"按钮选择设备后回填
   * @returns {Promise<{deviceName: string, platformVersion: string}|null>}
   */
  async selectDeviceForEdit() {
    try {
      // MVC: model 不直接创建 UI 组件,emit 事件让 controller 调 view 显示弹窗
      const deviceId = await this._requestDeviceSelection('test');

      let platformVersion = '';
      try {
        const versionResult = await this._api.executeAdbCommand('getprop ro.build.version.release', deviceId);
        // wrapper 失败已抛错由 catch 接,此处走到即成功
        platformVersion = versionResult.output.trim() || '';
      } catch (error) {
        console.warn('获取Android版本失败:', error);
      }

      return { deviceName: deviceId, platformVersion };
    } catch (error) {
      if (error.message === 'cancelled') return null;
      this.emit('error', { source: 'selectDeviceForEdit', error });
      return null;
    }
  }

  /**
   * 请求显示设备选择弹窗 (MVC: emit 事件让 controller 调 view)
   * @param {string} mode - 弹窗模式
   * @returns {Promise<string>} 用户选择的 deviceId
   */
  _requestDeviceSelection(mode) {
    return new Promise((resolve, reject) => {
      this.emit('request-device-selection', { mode, resolve, reject });
    });
  }

  /**
   * 查询测试用例数据 (MVC: model 封装 API,供 controller 调用避免 view 直接调 electronAPI)
   * @param {string} fileName - 测试用例文件名 (不含 .py 后缀)
   * @returns {Promise<Object>} API 返回结果
   */
  async getTestCase(fileName) {
    return await this._api.testCaseGet(fileName);
  }

  // ─── 定时计划 (原 modelScheduledPlansMixin) ───────────────────

  async loadScheduledPlans() {
    try {
      const result = await this._api.getScheduledPlans();
      const plans = result?.data || result || [];
      this._set('scheduledPlans', plans, 'scheduledPlans-changed');
      // 同步 currentScheduledPlan：若已选中计划被删除，清空
      if (this._state.currentScheduledPlan) {
        const updated = plans.find(p => p.id === this._state.currentScheduledPlan.id);
        if (!updated) {
          this._set('currentScheduledPlan', null, 'currentScheduledPlan-changed');
        } else if (updated !== this._state.currentScheduledPlan) {
          this._set('currentScheduledPlan', updated, 'currentScheduledPlan-changed');
        }
      }
      return plans;
    } catch (error) {
      this.emit('error', { source: 'loadScheduledPlans', error });
      return [];
    }
  }

  async saveScheduledPlan(planData) {
    try {
      const result = await this._api.saveScheduledPlan(planData);
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
      // preload updateScheduledPlan 只接收单个 planData 参数，需将 id 合并进去
      const result = await this._api.updateScheduledPlan({ ...planData, id: planId });
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
      const result = await this._api.deleteScheduledPlan(planId);
      await this.loadScheduledPlans();
      this.emit('scheduledPlan-deleted', { planId, result });
      return result;
    } catch (error) {
      this.emit('error', { source: 'deleteScheduledPlan', error });
      return { success: false, error: error.message };
    }
  }

  selectScheduledPlan(plan) {
    this._set('currentScheduledPlan', plan, 'currentScheduledPlan-changed');
  }

  deselectScheduledPlan() {
    this._set('currentScheduledPlan', null, 'currentScheduledPlan-changed');
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
    const message = window.i18n.t('scheduledPlan.testStarting', { name: data.planName });
    this.appendOutput(`\n>>> ${message}`);
    // 重新加载定时计划列表，显示"执行中"状态
    await this.loadScheduledPlans();

    try {
      const testPlansResult = await this._api.getTestPlans();
      const allTestPlans = testPlansResult?.data || testPlansResult || [];

      if (!data.testPlans || data.testPlans.length === 0) {
        this.appendError('>>> ' + window.i18n.t('testExecution.scheduledNoTestPlans'));
        return;
      }

      for (const testPlanObj of data.testPlans) {
        const testPlanId = typeof testPlanObj === 'string' ? testPlanObj : testPlanObj.id;
        const testPlan = allTestPlans.find(p => p.id === testPlanId);

        if (!testPlan) {
          this.appendError(`>>> ${window.i18n.t('testExecution.testPlanNotExist')}: ${testPlanId}`);
          continue;
        }

        this.appendOutput(`>>> ${window.i18n.t('testExecution.executingTestPlan')}: ${testPlan.name}`);

        // 设置当前测试计划
        this._set('currentTestPlan', testPlan, 'currentTestPlan-changed');

        const scheduledPlanInfo = {
          id: data.planId,
          name: data.planName,
          executionTime: data.executionTime || new Date().toLocaleString(),
        };

        await this.runTests(scheduledPlanInfo);
      }
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
   * 处理定时计划过期事件
   */
  handleScheduledPlanExpired(data) {
    this.emit('scheduled-plan-expired', data);
    // 刷新定时计划列表
    this.loadScheduledPlans();
  }

  async checkTimeConflict(scheduledTime, excludeId) {
    try {
      const result = await this._api.checkTimeConflict(scheduledTime, excludeId);
      return result;
    } catch (error) {
      this.emit('error', { source: 'checkTimeConflict', error });
      return { hasConflict: false };
    }
  }

  getScheduledPlanStatus(plan) {
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

  // ─── 测试类型/标记 + 报告 + 钉钉通知 (原 modelReportsMixin) ────

  async updateTestTypesFromSelectedFiles() {
    await this.extractMarkersFromSelectedFiles();
  }

  async extractMarkersFromSelectedFiles() {
    // 使用 Promise 守卫防止并发提取
    if (this._state.extractingMarkers) {
      return this._state.extractingMarkers;
    }

    const promise = (async () => {
      try {
        const files = this._state.selectedTestFiles;
        if (!files || files.length === 0) {
          this._set('currentMarkers', [], 'currentMarkers-changed');
          return [];
        }

        // 统一转为路径字符串数组（兼容对象数组与字符串数组）
        const filePaths = files.map(f => (typeof f === 'string' ? f : f?.path)).filter(Boolean);
        if (filePaths.length === 0) {
          this._set('currentMarkers', [], 'currentMarkers-changed');
          return [];
        }

        const result = await this._api.extractPytestMarkers(filePaths);
        const markers = result?.markers || result || [];
        this._set('currentMarkers', markers, 'currentMarkers-changed');
        return markers;
      } catch (error) {
        this.emit('error', { source: 'extractMarkersFromSelectedFiles', error });
        return [];
      } finally {
        this._state.extractingMarkers = null;
      }
    })();

    this._state.extractingMarkers = promise;
    return promise;
  }

  /**
   * 从指定文件列表提取 pytest 标记（用于弹窗内文件选择变更时实时提取）
   * @param {Array} files - 文件对象数组或路径字符串数组
   * @returns {Promise<Array>} 标记数组
   */
  async extractMarkersFromFiles(files) {
    try {
      const filePaths = (files || [])
        .map(f => (typeof f === 'string' ? f : f?.path))
        .filter(Boolean);
      if (filePaths.length === 0) return [];
      const result = await this._api.extractPytestMarkers(filePaths);
      return result?.markers || result || [];
    } catch (error) {
      this.emit('error', { source: 'extractMarkersFromFiles', error });
      return [];
    }
  }

  getSelectedTestTypes() {
    return this._state.currentMarkers || [];
  }

  // ─── 报告 ───────────────────────────────────────────────────────

  async showReportModal(testPlan) {
    if (!testPlan) {
      this.appendOutput('>>> ' + window.i18n.t('testExecution.selectTestPlanFirst'));
      return;
    }

    // 重置选中状态
    this._state.selectedReportRun = null;
    this._state.reportMode = 'testPlan';
    this.emit('show-report-modal', testPlan);

    try {
      // wrapper 已处理 IPC 失败,错误由外层 catch 接
      const result = await this._api.getTestPlanRuns(testPlan.name);
      this.emit('report-runs-loaded', result.runs || []);
    } catch (error) {
      this.emit('report-runs-error', error.message);
    }
  }

  /**
   * 显示定时计划整合报告弹窗 (聚合所有关联测试计划的运行记录, 分组展示)
   * @param {Object} scheduledPlan - 定时计划对象 (含 id, name, testPlans)
   */
  async showScheduledReportModal(scheduledPlan) {
    if (!scheduledPlan) {
      this.appendOutput('>>> ' + window.i18n.t('testExecution.selectTestPlanFirst'));
      return;
    }

    // 重置选中状态
    this._state.selectedReportRun = null;
    this._state.reportMode = 'scheduledPlan';
    this._state.currentScheduledPlanForReport = scheduledPlan;
    this.emit('show-scheduled-report-modal', scheduledPlan);

    try {
      const result = await this._api.getScheduledPlanRuns(scheduledPlan.id);
      if (!result.success) {
        this.emit('report-runs-error', result.error || window.i18n.t('reportModal.loadFailed'));
        return;
      }
      this.emit('scheduled-report-runs-loaded', result.groups || []);
    } catch (error) {
      this.emit('report-runs-error', error.message);
    }
  }

  selectReportRun(run) {
    // P3-4: 参数实为整个 run 对象 (controller L299/L315 传 run), 原命名 runId 误导
    this._state.selectedReportRun = run;
    this.emit('report-run-selected', run);
  }

  /**
   * 删除指定运行记录及其报告
   * 支持两种模式:
   *   - testPlan 模式: 从 currentTestPlan.name 删除
   *   - scheduledPlan 模式: 从 run.sourcePlanName 删除 (后端按源计划名定位)
   * @param {Object} run - 运行记录对象 (含 timestamp, 可能含 reportPath/sourcePlanName)
   */
  async deleteReportRun(run) {
    if (!run) {
      this.emit('error', { source: 'deleteReportRun', error: new Error(window.i18n.t('reportModal.invalidReport')) });
      return;
    }

    const isScheduledMode = this._state.reportMode === 'scheduledPlan';
    const sourcePlanName = isScheduledMode
      ? (run.sourcePlanName || (this._state.currentScheduledPlanForReport?.name))
      : (this._state.currentTestPlan?.name);

    if (!sourcePlanName) {
      this.emit('error', { source: 'deleteReportRun', error: new Error(window.i18n.t('testExecution.selectTestPlanFirst')) });
      return;
    }

    try {
      // wrapper 已处理 IPC 失败,错误由外层 catch 接
      // reportPath 可能为 null (报告已删除的记录), 传 timestamp 作为匹配依据
      const identifier = run.reportPath || run.timestamp;
      const result = await this._api.deleteReportRun(sourcePlanName, identifier);
      if (!result.success) {
        this.emit('error', { source: 'deleteReportRun', error: new Error(result.error || window.i18n.t('reportModal.deleteFailed')) });
        return;
      }
      // 清除选中的 run (如果删除的是当前选中)
      const selected = this._state.selectedReportRun;
      if (selected && (selected.reportPath === run.reportPath || selected.timestamp === run.timestamp)) {
        this._state.selectedReportRun = null;
      }
      this.emit('report-run-deleted', run);
      // 重新加载列表 (按当前模式)
      if (isScheduledMode) {
        const scheduledPlan = this._state.currentScheduledPlanForReport;
        if (scheduledPlan) {
          const runsResult = await this._api.getScheduledPlanRuns(scheduledPlan.id);
          if (runsResult.success) {
            this.emit('scheduled-report-runs-loaded', runsResult.groups || []);
          }
        }
      } else {
        const testPlan = this._state.currentTestPlan;
        if (testPlan) {
          const runsResult = await this._api.getTestPlanRuns(testPlan.name);
          this.emit('report-runs-loaded', runsResult.runs || []);
        }
      }
    } catch (error) {
      this.emit('error', { source: 'deleteReportRun', error });
    }
  }

  async openSelectedReport(testPlan) {
    const run = this._state.selectedReportRun;
    if (!run || !run.reportPath) {
      this.emit('report-open-failed', new Error(window.i18n.t('reportModal.selectReport')));
      return;
    }

    try {
      // wrapper 已处理 IPC 失败,错误由外层 catch 接
      await this._api.openReportByPath(run.reportPath);
      this.emit('report-opened');
    } catch (error) {
      this.emit('report-open-failed', error);
    }
  }

  async checkReportExists(testPlan) {
    try {
      const result = await this._api.checkReportExists(testPlan);
      return result;
    } catch (error) {
      this.emit('error', { source: 'checkReportExists', error });
      return { exists: false };
    }
  }

  // ─── 钉钉通知 ───────────────────────────────────────────────────

  async sendTestNotification(testInfo) {
    try {
      const config = await this._api.getConfig();

      const notificationConfig = config?.APP_SETTINGS?.notification;
      if (!notificationConfig || notificationConfig.platform !== 'dingtalk') {
        return;
      }

      const dingtalkConfig = notificationConfig.dingtalk;
      if (!dingtalkConfig || !dingtalkConfig.access_token || !dingtalkConfig.secret) {
        return;
      }

      const statusLabels = {
        passed: '✅ ' + window.i18n.t('testExecution.testPassed'),
        failed: '❌ ' + window.i18n.t('testExecution.testFailed'),
        skipped: '⏭️ ' + window.i18n.t('testExecution.testSkipped'),
        partialPassed: '⚠️ ' + window.i18n.t('testExecution.testPartialPassed'),
        noTests: '⚠️ ' + window.i18n.t('testExecution.noTests')
      };
      const testResult = statusLabels[testInfo.testStatus] || (testInfo.hasFailure ? '❌ ' + window.i18n.t('testExecution.testFailed') : '✅ ' + window.i18n.t('testExecution.testPassed'));

      let message = window.i18n.t('testExecution.notification.title') + '\n';

      if (testInfo.scheduledPlanName) {
        message += '\n' + window.i18n.t('testExecution.notification.scheduledPlan') + ': ' + testInfo.scheduledPlanName + '\n';
        message += window.i18n.t('testExecution.notification.executionTime') + ': ' + (testInfo.scheduledPlanExecutionTime || new Date().toLocaleString()) + '\n';
      }

      message += '\n' + window.i18n.t('testExecution.notification.testPlan') + ': ' + testInfo.testPlanName + '\n';
      message += window.i18n.t('testExecution.notification.testFiles') + ': ' + (testInfo.testFileNames || window.i18n.t('testExecution.notification.none')) + '\n';
      message += window.i18n.t('testExecution.notification.testTypes') + ': ' + (testInfo.testTypes || window.i18n.t('testExecution.notification.all')) + '\n';
      message += window.i18n.t('testExecution.notification.loopCount') + ': ' + testInfo.loopCount + '\n';
      message += '\n' + window.i18n.t('testExecution.notification.roundInfo') + ':\n';
      message += window.i18n.t('testExecution.notification.totalRounds') + ': ' + testInfo.totalLoops + '\n';
      if (testInfo.loopCount > 1) {
        message += window.i18n.t('testExecution.notification.passRate') + ': ' + testInfo.passRate + '%\n';
      }

      if (testInfo.aggregatedStats && testInfo.aggregatedStats.total > 0) {
        const stats = testInfo.aggregatedStats;
        message += '\n' + window.i18n.t('testExecution.notification.caseStats') + ':\n';
        message += window.i18n.t('testExecution.notification.casePassed') + ': ' + stats.passed + ', ' + window.i18n.t('testExecution.notification.caseFailed') + ': ' + stats.failed + ', ' + window.i18n.t('testExecution.notification.caseSkipped') + ': ' + stats.skipped + ', ' + window.i18n.t('testExecution.notification.caseBroken') + ': ' + stats.broken + ', ' + window.i18n.t('testExecution.notification.caseTotal') + ': ' + stats.total + '\n';
        message += window.i18n.t('testExecution.notification.casePassRate') + ': ' + testInfo.casePassRate + '%\n';
      }

      message += '\n' + window.i18n.t('testExecution.notification.testResult') + ': ' + testResult;

      const notificationData = {
        message: message
      };

      this.appendOutput('>>> ' + window.i18n.t('testExecution.sendingNotification') + '...');
      // wrapper 已处理 IPC 失败,错误由外层 catch 接
      await this._api.sendDingTalkNotification(notificationData);
      this.appendOutput('>>> ' + window.i18n.t('testExecution.notificationSent'));
    } catch (error) {
      this.appendError('>>> ' + window.i18n.t('testExecution.notificationFailed') + ': ' + error.message);
    }
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

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
    getTestPlanRuns: 'getTestPlanRuns',
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

  setSelectedTestFiles(files) {
    this.#set('selectedTestFiles', files, 'selectedTestFiles-changed');
  }

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
        // 仅在无选中计划时更新 selectedTestFiles，避免弹窗中的扫描覆盖计划文件列表
        if (!this.#state.currentTestPlan) {
          this.#set('selectedTestFiles', files, 'test-files-scanned');
        }
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
      // 同步 currentTestPlan：若已选中计划，从新列表中找到对应项更新引用
      if (this.#state.currentTestPlan) {
        const updated = plans.find(p => p.id === this.#state.currentTestPlan.id);
        if (updated) {
          if (updated !== this.#state.currentTestPlan) {
            this.#set('currentTestPlan', updated, 'currentTestPlan-changed');
          }
        } else {
          // 计划已被删除，清空 currentTestPlan
          this.#set('currentTestPlan', null, 'currentTestPlan-changed');
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
      // preload updateTestPlan 只接收单个 planData 参数，需将 id 合并进去
      const result = await this.#api.updateTestPlan({ ...planData, id: planId });
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
    this.#set('isRunning', true, 'isRunning-changed');
    this.#set('runningTestPlanName', testPlan.name, 'runningTestPlanName-changed');
    if (scheduledPlanInfo) {
      this.#set('runningScheduledPlanId', scheduledPlanInfo.id, 'runningScheduledPlanId-changed');
    }
    this.clearOutput();

    // 输出测试计划详情
    const loopCount = testPlan.loopCount || 1;
    const continueOnFailure = testPlan.continueOnFailure !== false;
    this.appendOutput('>>> ========== ' + (window.i18n?.t('testExecution.testPlanDetails') || '测试计划详情') + ' ==========');
    this.appendOutput('>>> ' + (window.i18n?.t('testExecution.planName') || '计划名称') + ': ' + (testPlan.name || ''));
    this.appendOutput('>>> ' + (window.i18n?.t('testExecution.planDescription') || '计划描述') + ': ' + (testPlan.description || window.i18n?.t('common.none') || '无'));
    const testFileNames = this.#state.selectedTestFiles.map(f => f.name || f.path).join(', ');
    this.appendOutput('>>> ' + (window.i18n?.t('testExecution.testFiles') || '测试文件') + ': ' + (testFileNames || window.i18n?.t('common.none') || '无'));
    const testTypes = this.getSelectedTestTypes().join(', ');
    this.appendOutput('>>> ' + (window.i18n?.t('testExecution.testTypes') || '测试类型') + ': ' + (testTypes || window.i18n?.t('testExecution.allTypes') || '全部'));
    this.appendOutput('>>> ' + (window.i18n?.t('testExecution.loopSettings') || '循环设置') + ': ' + (window.i18n?.t('testExecution.loopCount') || '循环次数') + ' ' + loopCount + ', ' + (window.i18n?.t('testExecution.continueOnFailure') || '失败继续') + ': ' + (continueOnFailure ? (window.i18n?.t('common.yes') || '是') : (window.i18n?.t('common.no') || '否')));

    if (scheduledPlanInfo) {
      this.appendOutput('>>> ---------- ' + (window.i18n?.t('testExecution.scheduledPlanInfo') || '定时计划信息') + ' ----------');
      this.appendOutput('>>> ' + (window.i18n?.t('testExecution.scheduledPlanName') || '定时计划名称') + ': ' + (scheduledPlanInfo.name || ''));
      this.appendOutput('>>> ' + (window.i18n?.t('testExecution.executionTime') || '执行时间') + ': ' + (scheduledPlanInfo.executionTime || new Date().toLocaleString()));
    }
    this.appendOutput('>>> ==================================\n');

    let hasFailure = false;
    let stoppedEarly = false;
    let lastResult = null;
    const loopResults = [];
    const aggregatedStats = { passed: 0, failed: 0, skipped: 0, broken: 0, total: 0 };

    try {
      for (let i = 1; i <= loopCount; i++) {
        if (!this.#state.isRunning) {
          stoppedEarly = true;
          break;
        }

        this.emit('loop-progress-changed', { current: i, total: loopCount });

        const testPaths = this.#state.selectedTestFiles.map(f => f.path || f);
        const markers = this.getSelectedTestTypes();
        const planName = testPlan.name;

        const testConfig = {
          testPaths,
          markers,
          testPlanName: planName,
          loopIndex: i,
          totalLoops: loopCount,
        };

        this.appendOutput(`\n>>> ${window.i18n?.t('testExecution.loopProgress', { current: i, total: loopCount }) || `第 ${i}/${loopCount} 轮`}`);

        lastResult = await this.#api.runPythonTests(testConfig);

        if (lastResult) {
          if (!lastResult.success) {
            hasFailure = true;
            loopResults.push({ loop: i, success: false, testStats: lastResult.testStats || null });
            if (!continueOnFailure) {
              this.appendError(`>>> ${window.i18n?.t('testExecution.loopStopped', { current: i }) || `第 ${i} 轮停止`}`);
              break;
            }
            this.appendError(`>>> ${window.i18n?.t('testExecution.loopFailed', { current: i }) || `第 ${i} 轮失败`}`);
          } else {
            loopResults.push({ loop: i, success: true, testStats: lastResult.testStats || null });
            this.appendOutput(`>>> ${window.i18n?.t('testExecution.loopCompleted', { current: i }) || `第 ${i} 轮完成`}`);
          }

          if (lastResult.testStats) {
            aggregatedStats.passed += lastResult.testStats.passed || 0;
            aggregatedStats.failed += lastResult.testStats.failed || 0;
            aggregatedStats.skipped += lastResult.testStats.skipped || 0;
            aggregatedStats.broken += lastResult.testStats.broken || 0;
            aggregatedStats.total += lastResult.testStats.total || 0;
          }
        }

        if (!this.#state.isRunning) {
          stoppedEarly = true;
          break;
        }
      }

      if (!stoppedEarly) {
        if (!hasFailure || continueOnFailure) {
          this.appendOutput('>>> ' + (window.i18n?.t('testExecution.allLoopsCompleted') || '所有循环执行完成'));
        }
        this.emit('run-report-available');
      }
    } catch (error) {
      this.emit('error', { source: 'runTests', error });
      this.appendError(`>>> ${window.i18n?.t('testExecution.testRunFailed') || '测试执行失败'}: ${error.message}`);
    } finally {
      // 输出统计摘要
      this.appendOutput('>>> ========== ' + (window.i18n?.t('testExecution.summaryInfo') || '统计摘要') + ' ==========');
      let passRate = '0.00';
      let passedLoops = 0;
      if (loopCount > 1) {
        passedLoops = loopResults.filter(r => r.success).length;
        passRate = loopResults.length > 0 ? ((passedLoops / loopResults.length) * 100).toFixed(2) : '0.00';
        this.appendOutput('>>> ' + (window.i18n?.t('testExecution.totalLoops') || '总循环') + ': ' + loopResults.length);
        this.appendOutput('>>> ' + (window.i18n?.t('testExecution.passedLoops') || '通过循环') + ': ' + passedLoops);
        this.appendOutput('>>> ' + (window.i18n?.t('testExecution.passRate') || '通过率') + ': ' + passRate + '%');
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
        this.appendOutput('>>> ' + (window.i18n?.t('testExecution.caseStats') || '用例统计') + ': ' +
          (window.i18n?.t('testExecution.casePassed') || '通过') + ' ' + aggregatedStats.passed + ', ' +
          (window.i18n?.t('testExecution.caseFailed') || '失败') + ' ' + aggregatedStats.failed + ', ' +
          (window.i18n?.t('testExecution.caseSkipped') || '跳过') + ' ' + aggregatedStats.skipped + ', ' +
          (window.i18n?.t('testExecution.caseBroken') || '损坏') + ' ' + aggregatedStats.broken + ', ' +
          (window.i18n?.t('testExecution.caseTotal') || '总计') + ' ' + aggregatedStats.total);
        this.appendOutput('>>> ' + (window.i18n?.t('testExecution.casePassRate') || '用例通过率') + ': ' + casePassRate + '% (' + (window.i18n?.t('testExecution.excludingSkipped') || '不含跳过') + ')');
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
        passed: window.i18n?.t('testExecution.testPassed') || '✓ 测试通过',
        failed: window.i18n?.t('testExecution.testFailed') || '✗ 测试失败',
        skipped: window.i18n?.t('testExecution.testSkipped') || '⊙ 测试跳过',
        partialPassed: window.i18n?.t('testExecution.testPartialPassed') || '◐ 部分通过',
        noTests: window.i18n?.t('testExecution.noTests') || '? 未收集到测试用例',
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

      this.#set('isRunning', false, 'isRunning-changed');
      this.#set('runningTestPlanName', null, 'runningTestPlanName-changed');
      this.#set('runningScheduledPlanId', null, 'runningScheduledPlanId-changed');
      this.emit('run-complete', { testPlan, result: lastResult, scheduledPlanInfo, testStatus, aggregatedStats });
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
    if (!text) return;
    // 按行过滤空白行
    const filteredLines = text.split(/\r?\n/).filter(line => line.trim() !== '');
    if (filteredLines.length === 0) return;
    const filteredText = filteredLines.join('\n');
    this.#state.outputBuffer.push({ text: filteredText, isError: false });
    this._scheduleOutputFlush();
  }

  appendError(text) {
    if (!text) return;
    // 按行过滤空白行
    const filteredLines = text.split(/\r?\n/).filter(line => line.trim() !== '');
    if (filteredLines.length === 0) return;
    const filteredText = filteredLines.join('\n');
    this.#state.outputBuffer.push({ text: filteredText, isError: true });
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

        const result = await this.#api.testCaseGet(fileName);

        if (result && result.success && result.data) {
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
      const deviceName = caseItem.caseData?.deviceConfig?.deviceName;
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
      const modal = new DeviceSelectionModal();
      const deviceId = await modal.show({ mode: 'test' });

      // 获取设备Android版本
      let platformVersion = '';
      try {
        const versionResult = await this.#api.executeAdbCommand('getprop ro.build.version.release', deviceId);
        if (versionResult.success) {
          platformVersion = versionResult.output.trim() || '';
        }
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
            let outputDir = this.#state.selectedDirectory;
            if (filePath) {
              const pathParts = filePath.split(/[\\/]/);
              outputDir = pathParts.slice(0, -1).join('/');
            }
            if (!outputDir) {
              outputDir = this.#state.selectedDirectory;
            }

            const result = await this.#api.testCaseSaveAndGenerate(caseItem.caseData, outputDir);
            if (!result.success) {
              console.error(`保存并生成测试用例失败: ${caseItem.fileName}`, result.error);
            }
          } catch (error) {
            console.error(`更新测试用例设备信息失败: ${caseItem.fileName}`, error);
          }
        }
      }

      this.#set('selectedDevice', deviceId, 'selectedDevice-changed');
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
    if (!this.#state.selectedTestFiles || this.#state.selectedTestFiles.length === 0) {
      return { valid: true, message: '' };
    }

    const unconfiguredFiles = [];

    for (const file of this.#state.selectedTestFiles) {
      let fileName = file.name || file.path;
      if (fileName.endsWith('.py')) fileName = fileName.slice(0, -3);
      if (fileName.includes('/') || fileName.includes('\\')) fileName = fileName.split(/[\\/]/).pop();

      try {
        const result = await this.#api.testCaseGet(fileName);
        if (result && result.success && result.data) {
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
    if (!this.#state.selectedTestFiles || this.#state.selectedTestFiles.length === 0) {
      return { valid: true, message: '' };
    }

    const unconfiguredFiles = [];

    for (const file of this.#state.selectedTestFiles) {
      let fileName = file.name || file.path;
      if (fileName.endsWith('.py')) fileName = fileName.slice(0, -3);
      if (fileName.includes('/') || fileName.includes('\\')) fileName = fileName.split(/[\\/]/).pop();

      try {
        const result = await this.#api.testCaseGet(fileName);
        if (result && result.success && result.data) {
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
      const result = await this.#api.testCaseGet(fileName);
      if (result && result.success && result.data) {
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
      const result = await this.#api.testCaseGet(this._editDeviceIdFileName);
      if (result && result.success && result.data) {
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
        let outputDir = this.#state.selectedDirectory;
        if (this._editDeviceIdFilePath) {
          const pathParts = this._editDeviceIdFilePath.split(/[\\/]/);
          outputDir = pathParts.slice(0, -1).join('/');
        }
        if (!outputDir) {
          outputDir = this.#state.selectedDirectory;
        }

        const saveResult = await this.#api.testCaseSaveAndGenerate(caseData, outputDir);

        if (saveResult && saveResult.success) {
          this.emit('edit-device-id-saved', { fileName: this._editDeviceIdFileName, caseData });
        } else {
          this.emit('error', { source: 'confirmEditDeviceId', error: new Error(saveResult?.error || '保存失败') });
        }
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
      const modal = new DeviceSelectionModal();
      const deviceId = await modal.show({ mode: 'test' });

      let platformVersion = '';
      try {
        const versionResult = await this.#api.executeAdbCommand('getprop ro.build.version.release', deviceId);
        if (versionResult.success) {
          platformVersion = versionResult.output.trim() || '';
        }
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

  // ── 定时计划 ───────────────────────────────────────────────────

  async loadScheduledPlans() {
    try {
      const result = await this.#api.getScheduledPlans();
      const plans = result?.data || result || [];
      this.#set('scheduledPlans', plans, 'scheduledPlans-changed');
      // 同步 currentScheduledPlan：若已选中计划被删除，清空
      if (this.#state.currentScheduledPlan) {
        const updated = plans.find(p => p.id === this.#state.currentScheduledPlan.id);
        if (!updated) {
          this.#set('currentScheduledPlan', null, 'currentScheduledPlan-changed');
        } else if (updated !== this.#state.currentScheduledPlan) {
          this.#set('currentScheduledPlan', updated, 'currentScheduledPlan-changed');
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
      // preload updateScheduledPlan 只接收单个 planData 参数，需将 id 合并进去
      const result = await this.#api.updateScheduledPlan({ ...planData, id: planId });
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
    const message = window.i18n?.t('scheduledPlan.testStarting', { name: data.planName }) || `定时计划「${data.planName}」开始执行...`;
    this.appendOutput(`\n>>> ${message}`);

    // 重新加载定时计划列表，显示"执行中"状态
    await this.loadScheduledPlans();

    try {
      const testPlansResult = await this.#api.getTestPlans();
      const allTestPlans = testPlansResult?.data || testPlansResult || [];

      if (!data.testPlans || data.testPlans.length === 0) {
        this.appendError('>>> ' + (window.i18n?.t('testExecution.scheduledNoTestPlans') || '定时计划没有关联的测试计划'));
        return;
      }

      for (const testPlanObj of data.testPlans) {
        const testPlanId = typeof testPlanObj === 'string' ? testPlanObj : testPlanObj.id;
        const testPlan = allTestPlans.find(p => p.id === testPlanId);

        if (!testPlan) {
          this.appendError(`>>> ${window.i18n?.t('testExecution.testPlanNotExist') || '测试计划不存在'}: ${testPlanId}`);
          continue;
        }

        this.appendOutput(`>>> ${window.i18n?.t('testExecution.executingTestPlan') || '正在执行测试计划'}: ${testPlan.name}`);

        // 设置当前测试计划
        this.#set('currentTestPlan', testPlan, 'currentTestPlan-changed');

        const scheduledPlanInfo = {
          id: data.planId,
          name: data.planName,
          executionTime: data.executionTime || new Date().toLocaleString(),
        };

        await this.runTests(scheduledPlanInfo);
      }
    } catch (error) {
      console.error('执行定时计划失败:', error);
      this.appendError('>>> ' + (window.i18n?.t('testExecution.executeScheduledPlanFailed') || '执行定时计划失败') + ': ' + error.message);
    } finally {
      // 通知主进程测试执行完成，更新定时计划状态
      if (data.planId) {
        try {
          await this.#api.scheduledTestComplete(data.planId);
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

        // 统一转为路径字符串数组（兼容对象数组与字符串数组）
        const filePaths = files.map(f => (typeof f === 'string' ? f : f?.path)).filter(Boolean);
        if (filePaths.length === 0) {
          this.#set('currentMarkers', [], 'currentMarkers-changed');
          return [];
        }

        const result = await this.#api.extractPytestMarkers(filePaths);
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
      const result = await this.#api.extractPytestMarkers(filePaths);
      return result?.markers || result || [];
    } catch (error) {
      this.emit('error', { source: 'extractMarkersFromFiles', error });
      return [];
    }
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

  async showReportModal(testPlan) {
    if (!testPlan) {
      this.appendOutput('>>> ' + (window.i18n?.t('testExecution.selectTestPlanFirst') || '请先选择一个测试计划'));
      return;
    }

    // 重置选中状态
    this.#state.selectedReportRun = null;
    this.emit('show-report-modal', testPlan);

    try {
      const result = await this.#api.getTestPlanRuns(testPlan.name);

      if (!result.success) {
        this.emit('report-runs-error', result.error || window.i18n?.t('reportModal.loadFailed') || '加载失败');
        return;
      }

      this.emit('report-runs-loaded', result.runs || []);
    } catch (error) {
      this.emit('report-runs-error', error.message);
    }
  }

  selectReportRun(runId) {
    this.#state.selectedReportRun = runId;
    this.emit('report-run-selected', runId);
  }

  async openSelectedReport(testPlan) {
    const run = this.#state.selectedReportRun;
    if (!run || !run.reportPath) {
      this.appendOutput('>>> ' + (window.i18n?.t('reportModal.selectReport') || '请先选择一个报告'));
      return;
    }

    const openingMsg = window.i18n?.t('python.pytestRunner.openingReport') || "正在打开测试计划 '{test_plan_name}' 的第 {index} 次运行报告";
    const formattedMsg = openingMsg
      .replace('{test_plan_name}', testPlan?.name || '')
      .replace('{index}', run.index);
    this.appendOutput('>>> ' + formattedMsg);

    try {
      const result = await this.#api.openReportByPath(run.reportPath);

      if (result.success) {
        this.appendOutput('>>> ' + (window.i18n?.t('python.pytestRunner.reportOpened') || '报告已打开'));
        this.emit('report-opened');
      } else {
        this.appendError('>>> ' + (window.i18n?.t('python.pytestRunner.reportOpenFailed') || '打开报告失败') + ': ' + (result.error || ''));
        this.emit('report-open-failed');
      }
    } catch (error) {
      this.appendError('>>> ' + (window.i18n?.t('python.pytestRunner.reportOpenFailed') || '打开报告失败') + ': ' + error.message);
      this.emit('report-open-failed');
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

  async sendTestNotification(testInfo) {
    try {
      const config = await this.#api.getConfig();

      const notificationConfig = config?.APP_SETTINGS?.notification;
      if (!notificationConfig || notificationConfig.platform !== 'dingtalk') {
        return;
      }

      const dingtalkConfig = notificationConfig.dingtalk;
      if (!dingtalkConfig || !dingtalkConfig.access_token || !dingtalkConfig.secret) {
        return;
      }

      const statusLabels = {
        passed: '✅ ' + (window.i18n?.t('testExecution.testPassed') || '测试通过'),
        failed: '❌ ' + (window.i18n?.t('testExecution.testFailed') || '测试失败'),
        skipped: '⏭️ ' + (window.i18n?.t('testExecution.testSkipped') || '测试跳过'),
        partialPassed: '⚠️ ' + (window.i18n?.t('testExecution.testPartialPassed') || '部分通过'),
        noTests: '⚠️ ' + (window.i18n?.t('testExecution.noTests') || '未收集到测试用例')
      };
      const testResult = statusLabels[testInfo.testStatus] || (testInfo.hasFailure ? '❌ ' + (window.i18n?.t('testExecution.testFailed') || '测试失败') : '✅ ' + (window.i18n?.t('testExecution.testPassed') || '测试通过'));

      let message = (window.i18n?.t('testExecution.notification.title') || '测试执行结果通知') + '\n';

      if (testInfo.scheduledPlanName) {
        message += '\n' + (window.i18n?.t('testExecution.notification.scheduledPlan') || '定时计划') + ': ' + testInfo.scheduledPlanName + '\n';
        message += (window.i18n?.t('testExecution.notification.executionTime') || '执行时间') + ': ' + (testInfo.scheduledPlanExecutionTime || new Date().toLocaleString()) + '\n';
      }

      message += '\n' + (window.i18n?.t('testExecution.notification.testPlan') || '测试计划') + ': ' + testInfo.testPlanName + '\n';
      message += (window.i18n?.t('testExecution.notification.testFiles') || '测试文件') + ': ' + (testInfo.testFileNames || (window.i18n?.t('testExecution.notification.none') || '无')) + '\n';
      message += (window.i18n?.t('testExecution.notification.testTypes') || '测试类型') + ': ' + (testInfo.testTypes || (window.i18n?.t('testExecution.notification.all') || '全部')) + '\n';
      message += (window.i18n?.t('testExecution.notification.loopCount') || '循环次数') + ': ' + testInfo.loopCount + '\n';
      message += '\n' + (window.i18n?.t('testExecution.notification.roundInfo') || '循环信息') + ':\n';
      message += (window.i18n?.t('testExecution.notification.totalRounds') || '总轮数') + ': ' + testInfo.totalLoops + '\n';
      if (testInfo.loopCount > 1) {
        message += (window.i18n?.t('testExecution.notification.passRate') || '通过率') + ': ' + testInfo.passRate + '%\n';
      }

      if (testInfo.aggregatedStats && testInfo.aggregatedStats.total > 0) {
        const stats = testInfo.aggregatedStats;
        message += '\n' + (window.i18n?.t('testExecution.notification.caseStats') || '用例统计') + ':\n';
        message += (window.i18n?.t('testExecution.notification.casePassed') || '通过') + ': ' + stats.passed + ', ' + (window.i18n?.t('testExecution.notification.caseFailed') || '失败') + ': ' + stats.failed + ', ' + (window.i18n?.t('testExecution.notification.caseSkipped') || '跳过') + ': ' + stats.skipped + ', ' + (window.i18n?.t('testExecution.notification.caseBroken') || '损坏') + ': ' + stats.broken + ', ' + (window.i18n?.t('testExecution.notification.caseTotal') || '总计') + ': ' + stats.total + '\n';
        message += (window.i18n?.t('testExecution.notification.casePassRate') || '用例通过率') + ': ' + testInfo.casePassRate + '% (' + (window.i18n?.t('testExecution.notification.excludingSkipped') || '不含跳过') + ')\n';
      }

      message += '\n' + (window.i18n?.t('testExecution.notification.testResult') || '测试结果') + ': ' + testResult;

      const notificationData = {
        message: message
      };

      this.appendOutput('>>> ' + (window.i18n?.t('testExecution.sendingNotification') || '正在发送通知') + '...');
      const result = await this.#api.sendDingTalkNotification(notificationData);

      if (result.success) {
        this.appendOutput('>>> ' + (window.i18n?.t('testExecution.notificationSent') || '通知发送成功'));
      } else {
        this.appendError('>>> ' + (window.i18n?.t('testExecution.notificationFailed') || '通知发送失败') + ': ' + (result.error || ''));
      }
    } catch (error) {
      this.appendError('>>> ' + (window.i18n?.t('testExecution.notificationFailed') || '通知发送失败') + ': ' + error.message);
    }
  }

  // ── IPC 事件监听 ───────────────────────────────────────────────

  listenTestOutput() {
    const unlisten = ApiBridge.listen({
      'test-output': (text) => {
        // 清理 ANSI 转义码和 \r 字符
        const cleaned = text.replace(/\x1b\[[0-9;]*m/g, '').replace(/\r/g, '');
        this.appendOutput(cleaned);
      },
    });
    this.#ipcUnsubscribers.push(unlisten);
    return unlisten;
  }

  listenTestError() {
    const unlisten = ApiBridge.listen({
      'test-error': (text) => {
        // 清理 ANSI 转义码和 \r 字符
        const cleaned = text.replace(/\x1b\[[0-9;]*m/g, '').replace(/\r/g, '');
        this.appendError(cleaned);
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

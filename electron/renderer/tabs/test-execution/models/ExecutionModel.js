import { BaseModel } from '../../../core/BaseModel.js';

/**
 * ExecutionModel - 执行编排子模型 (ADR-0012)
 *
 * 职责: 测试执行的运行生命周期 — 目录/文件选择、pytest 标记提取、输出缓冲、
 * runTests 循环编排 (前置检查→执行→聚合→通知)、stopTests。
 *
 * 跨域契约 (门面路由, 本模型不持有计划域状态):
 * - runTests(testPlan, scheduledPlanInfo): 计划数据由门面从 TestPlanModel 取好后参数传入
 * - DevicePrecheckModel 单向构造注入 (Execution → Precheck, 不成环)
 * - scanTestFiles(hasSelectedPlan): 是否有选中计划由门面传入 (避免读 TestPlanModel)
 *
 * 事件面 (门面显式转发): selectedDirectory-changed / selectedDirectoryDisplayName-changed /
 * selectedTestFiles-changed / test-files-scanned / isRunning-changed /
 * runningTestPlanName-changed / runningScheduledPlanId-changed / currentMarkers-changed /
 * run-error / run-warning / loop-progress-changed / run-complete / tests-stopped /
 * output-flushed / output-cleared / error
 */
export class ExecutionModel extends BaseModel {
  _api;
  #precheck;

  /**
   * @param {Object} api - ApiBridge 绑定对象 (与门面/兄弟子模型共享同一实例)
   * @param {Object} [opts]
   * @param {Object} [opts.precheck] - DevicePrecheckModel 实例 (runTests 前置检查)
   */
  constructor(api, { precheck } = {}) {
    super({
      selectedDirectory: null,
      selectedDirectoryDisplayName: null,
      selectedTestFiles: [],
      isRunning: false,
      runningTestPlanName: null,
      runningScheduledPlanId: null,
      currentMarkers: [],
      outputBuffer: [],
      outputRafId: null,
      extractingMarkers: null, // 标记提取的 Promise 守卫
      selectingFromPlan: false, // 是否从计划中选择文件
    });
    this._api = api;
    this.#precheck = precheck;
  }

  // ── State Getters ──────────────────────────────────────────────

  get selectedDirectory() {
    return this.get('selectedDirectory');
  }
  get selectedDirectoryDisplayName() {
    return this.get('selectedDirectoryDisplayName');
  }
  get selectedTestFiles() {
    return this.get('selectedTestFiles');
  }
  get isRunning() {
    return this.get('isRunning');
  }
  get runningTestPlanName() {
    return this.get('runningTestPlanName');
  }
  get runningScheduledPlanId() {
    return this.get('runningScheduledPlanId');
  }
  get currentMarkers() {
    return this.get('currentMarkers');
  }
  get outputBuffer() {
    return this.get('outputBuffer');
  }
  get outputRafId() {
    return this.get('outputRafId');
  }
  get extractingMarkers() {
    return this.get('extractingMarkers');
  }
  get selectingFromPlan() {
    return this.get('selectingFromPlan');
  }

  // ─── 目录与文件 ─────────────────────────────────────────────────

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
      this.emitError('selectDirectory', error);
      return null;
    }
  }

  /**
   * @param {boolean} hasSelectedPlan - 是否有选中的测试计划 (门面从 TestPlanModel 取;
   *        仅有选中计划时不更新 selectedTestFiles, 避免弹窗中的扫描覆盖计划文件列表)
   */
  async scanTestFiles(hasSelectedPlan = false) {
    if (!this.get('selectedDirectory')) return [];
    try {
      // wrapper 已处理 IPC 失败,错误由外层 catch 接
      const result = await this._api.scanTestFiles(this.get('selectedDirectory'));
      const files = result.files || result || [];
      if (!hasSelectedPlan) {
        this.set('selectedTestFiles', files, 'test-files-scanned');
      }
      return files;
    } catch (error) {
      this.emitError('scanTestFiles', error);
      return [];
    }
  }

  updateSelectedDirectory(path, displayName) {
    this.set('selectedDirectory', path, 'selectedDirectory-changed');
    this.set('selectedDirectoryDisplayName', displayName, 'selectedDirectoryDisplayName-changed');
  }

  setSelectedTestFiles(files) {
    this.set('selectedTestFiles', files, 'selectedTestFiles-changed');
  }

  // ─── 测试执行 (runTests 运行生命周期) ───────────────────────────

  /**
   * 执行测试计划 (runTests 编排内聚于此: 前置检查→循环执行→聚合→通知)
   * @param {Object} testPlan - 测试计划 (门面从 TestPlanModel 取好传入)
   * @param {Object|null} [scheduledPlanInfo] - 定时计划触发信息 (调度/立即执行场景)
   * @returns {Promise<'stopped'|'completed'|undefined>} 结束状态 (守卫/校验早退为 undefined)
   */
  async runTests(testPlan, scheduledPlanInfo = null) {
    if (!testPlan) {
      this.emit('run-error', {
        message: window.i18n.t('testExecution.selectPlanFirst'),
      });
      return;
    }

    // P2-7: 防重入守卫 — isRunning 在 await 校验前置位。按钮禁用依赖
    // isRunning-changed 事件存在一帧延迟, 双击可在 checkAndroidDeviceConfig/
    // checkBlePortConfig 的 await 窗口内两次通过校验, 并行启动多个 pytest 进程
    // (资源翻倍/输出交错/统计混乱)。守卫 + 提前置位堵死该窗口。
    if (this.get('isRunning')) {
      this.emit('run-warning', {
        message: window.i18n.t('testExecution.alreadyRunning'),
      });
      return;
    }
    this.set('isRunning', true, 'isRunning-changed');

    const files = this.get('selectedTestFiles');

    // 检查安卓用例是否已填写设备信息
    const deviceCheckResult = await this.#precheck.checkAndroidDeviceConfig(files);
    if (!deviceCheckResult.valid) {
      this.set('isRunning', false, 'isRunning-changed');
      this.emit('run-warning', { message: deviceCheckResult.message });
      return;
    }

    // 检查蓝牙用例是否已填写端口信息
    const blePortCheckResult = await this.#precheck.checkBlePortConfig(files);
    if (!blePortCheckResult.valid) {
      this.set('isRunning', false, 'isRunning-changed');
      this.emit('run-warning', { message: blePortCheckResult.message });
      return;
    }

    // 设置运行状态 (isRunning 已在守卫后置位, 此处不重复触发)
    this.set('runningTestPlanName', testPlan.name, 'runningTestPlanName-changed');
    if (scheduledPlanInfo) {
      this.set('runningScheduledPlanId', scheduledPlanInfo.id, 'runningScheduledPlanId-changed');
    }
    this.clearOutput();

    // 输出测试计划详情
    const loopCount = testPlan.loopCount || 1;
    const continueOnFailure = testPlan.continueOnFailure !== false;
    this.appendOutput('>>> ========== ' + window.i18n.t('testExecution.testPlanDetails') + ' ==========');
    this.appendOutput('>>> ' + window.i18n.t('testExecution.planName') + ': ' + (testPlan.name || ''));
    this.appendOutput(
      '>>> ' +
        window.i18n.t('testExecution.planDescription') +
        ': ' +
        (testPlan.description || window.i18n.t('common.none'))
    );
    // R27 P3-8: 字符串条目兼容 (同 P1-3 根因) — f.name||f.path 对字符串条目输出 "undefined"
    const testFileNames = files
      .map((f) => (typeof f === 'string' ? f : (f && (f.name || f.path)) || ''))
      .filter(Boolean)
      .join(', ');
    this.appendOutput(
      '>>> ' + window.i18n.t('testExecution.testFiles') + ': ' + (testFileNames || window.i18n.t('common.none'))
    );
    const testTypes = this.getSelectedTestTypes().join(', ');
    this.appendOutput(
      '>>> ' + window.i18n.t('testExecution.testTypes') + ': ' + (testTypes || window.i18n.t('testExecution.allTypes'))
    );
    this.appendOutput(
      '>>> ' +
        window.i18n.t('testExecution.loopSettings') +
        ': ' +
        window.i18n.t('testExecution.loopCount') +
        ' ' +
        loopCount +
        ', ' +
        window.i18n.t('testExecution.continueOnFailure') +
        ': ' +
        (continueOnFailure ? window.i18n.t('common.yes') : window.i18n.t('common.no'))
    );

    if (scheduledPlanInfo) {
      this.appendOutput('>>> ---------- ' + window.i18n.t('testExecution.scheduledPlanInfo') + ' ----------');
      this.appendOutput(
        '>>> ' + window.i18n.t('testExecution.scheduledPlanName') + ': ' + (scheduledPlanInfo.name || '')
      );
      this.appendOutput(
        '>>> ' +
          window.i18n.t('testExecution.executionTime') +
          ': ' +
          (scheduledPlanInfo.executionTime || new Date().toLocaleString())
      );
    }
    this.appendOutput('>>> ==================================\n');

    let hasFailure = false;
    let stoppedEarly = false;
    let lastResult = null;
    const loopResults = [];
    const aggregatedStats = {
      passed: 0,
      failed: 0,
      skipped: 0,
      broken: 0,
      total: 0,
    };

    try {
      for (let i = 1; i <= loopCount; i++) {
        if (!this.get('isRunning')) {
          stoppedEarly = true;
          break;
        }

        this.emit('loop-progress-changed', { current: i, total: loopCount });

        const testPaths = this.get('selectedTestFiles').map((f) => f.path || f);
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
          // R27: 手动暂停 (主进程 stopping → stopped:true) — 非执行失败:
          // 提示暂停, 不计入失败/统计, 直接停止后续循环
          if (lastResult.stopped) {
            this.appendOutput(`>>> ${window.i18n.t('testExecution.testManuallyStopped')}`);
            stoppedEarly = true;
            break;
          }
          if (!lastResult.success) {
            hasFailure = true;
            loopResults.push({
              loop: i,
              success: false,
              testStats: lastResult.testStats || null,
            });
            if (!continueOnFailure) {
              this.appendError(`>>> ${window.i18n.t('testExecution.loopStopped', { current: i })}`);
              break;
            }
            this.appendError(`>>> ${window.i18n.t('testExecution.loopFailed', { current: i })}`);
          } else {
            loopResults.push({
              loop: i,
              success: true,
              testStats: lastResult.testStats || null,
            });
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

        if (!this.get('isRunning')) {
          stoppedEarly = true;
          break;
        }
      }

      if (!stoppedEarly) {
        if (!hasFailure || continueOnFailure) {
          this.appendOutput('>>> ========== ' + window.i18n.t('testExecution.allLoopsCompleted'));
        }
        // R26 候选④: 删除孤儿发射 'run-report-available' (无任何订阅者);
        // 报告就绪 UX 由 finally 处的 'run-complete' (唯一权威结局事件) 驱动
      }
    } catch (error) {
      this.emitError('runTests', error);
      // 不显示 error.message 全文: 旧版 preload invokeWithCheck 抛错时 message 是完整 stderr,
      // 而 TEST_ERROR 已实时转发, 重复显示无意义
      this.appendError(`>>> ${window.i18n.t('testExecution.testRunFailed')}`);
    } finally {
      // R27: 手动暂停 (stoppedEarly) → 跳过聚合信息/状态/平台通知输出
      // testStatus 提到 finally 顶层: emit run-complete 需要 (手动暂停语义='stopped')
      let testStatus = 'stopped';
      if (!stoppedEarly) {
        // 输出统计摘要
        this.appendOutput('>>> ========== ' + window.i18n.t('testExecution.summaryInfo') + ' ==========');
        let passRate = '0.00';
        let passedLoops = 0;
        if (loopCount > 1) {
          passedLoops = loopResults.filter((r) => r.success).length;
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
          this.appendOutput(
            '>>> ' +
              window.i18n.t('testExecution.caseStats') +
              ': ' +
              window.i18n.t('testExecution.casePassed') +
              ' ' +
              aggregatedStats.passed +
              ', ' +
              window.i18n.t('testExecution.caseFailed') +
              ' ' +
              aggregatedStats.failed +
              ', ' +
              window.i18n.t('testExecution.caseSkipped') +
              ' ' +
              aggregatedStats.skipped +
              ', ' +
              window.i18n.t('testExecution.caseBroken') +
              ' ' +
              aggregatedStats.broken +
              ', ' +
              window.i18n.t('testExecution.caseTotal') +
              ' ' +
              aggregatedStats.total
          );
          this.appendOutput('>>> ' + window.i18n.t('testExecution.casePassRate') + ': ' + casePassRate + '%');
        }

        // 测试状态判断
        testStatus = 'passed';
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
        // R27: 移除聚合块尾部长线 (= 与首行 "========== 聚合信息 ==========" 不等长, 视觉不协调)
        // 发送钉钉通知 (外层 !stoppedEarly 已 guard)
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
          casePassRate: casePassRate,
        };
        if (scheduledPlanInfo) {
          notificationInfo.scheduledPlanName = scheduledPlanInfo.name;
          notificationInfo.scheduledPlanExecutionTime = scheduledPlanInfo.executionTime;
        }
        await this.sendTestNotification(notificationInfo);
      } // R27: 聚合输出/通知 guard 关闭 (手动暂停时不输出)

      this.set('isRunning', false, 'isRunning-changed');
      this.set('runningTestPlanName', null, 'runningTestPlanName-changed');
      this.set('runningScheduledPlanId', null, 'runningScheduledPlanId-changed');
      this.emit('run-complete', {
        testPlan,
        result: lastResult,
        scheduledPlanInfo,
        testStatus,
        aggregatedStats,
      });
    }
    // R27: 返回结束状态供定时计划序列判断 — 'stopped'=用户手动停止(终止后续 plan),
    // 'completed'=正常完成(继续下一个); 守卫/校验早退路径不经过此(undefined)
    return stoppedEarly ? 'stopped' : 'completed';
  }

  async stopTests() {
    try {
      const result = await this._api.stopPythonTests();
      this.set('isRunning', false, 'isRunning-changed');
      this.set('runningTestPlanName', null, 'runningTestPlanName-changed');
      this.set('runningScheduledPlanId', null, 'runningScheduledPlanId-changed');
      this.emit('tests-stopped', result);
      return result;
    } catch (error) {
      this.emitError('stopTests', error);
      return { success: false, error: error.message };
    }
  }

  // ─── 输出缓冲 ───────────────────────────────────────────────────

  appendOutput(text) {
    if (!text) return;
    // 按行过滤空白行
    const filteredLines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
    if (filteredLines.length === 0) return;
    const filteredText = filteredLines.join('\n');
    this.get('outputBuffer').push({ text: filteredText, isError: false });
    this._scheduleOutputFlush();
  }

  appendError(text) {
    if (!text) return;
    // 按行过滤空白行
    const filteredLines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
    if (filteredLines.length === 0) return;
    const filteredText = filteredLines.join('\n');
    this.get('outputBuffer').push({ text: filteredText, isError: true });
    this._scheduleOutputFlush();
  }

  clearOutput() {
    this.silentSet('outputBuffer', []);
    if (this.get('outputRafId')) {
      cancelAnimationFrame(this.get('outputRafId'));
      this.silentSet('outputRafId', null);
    }
    this.emit('output-cleared');
  }

  _scheduleOutputFlush() {
    if (this.get('outputRafId')) return;
    this.silentSet(
      'outputRafId',
      requestAnimationFrame(() => this._flushOutputBuffer())
    );
  }

  _flushOutputBuffer() {
    this.silentSet('outputRafId', null);
    if (this.get('outputBuffer').length === 0) return;
    const batch = this.get('outputBuffer').splice(0);
    this.emit('output-flushed', batch);
  }

  // ─── 测试类型/标记提取 ──────────────────────────────────────────

  async updateTestTypesFromSelectedFiles() {
    await this.extractMarkersFromSelectedFiles();
  }

  async extractMarkersFromSelectedFiles() {
    // 使用 Promise 守卫防止并发提取
    if (this.get('extractingMarkers')) {
      return this.get('extractingMarkers');
    }

    const promise = (async () => {
      try {
        const files = this.get('selectedTestFiles');
        if (!files || files.length === 0) {
          this.set('currentMarkers', [], 'currentMarkers-changed');
          return [];
        }

        // 统一转为路径字符串数组（兼容对象数组与字符串数组）
        const filePaths = files.map((f) => (typeof f === 'string' ? f : f?.path)).filter(Boolean);
        if (filePaths.length === 0) {
          this.set('currentMarkers', [], 'currentMarkers-changed');
          return [];
        }

        const result = await this._api.extractPytestMarkers(filePaths);
        const markers = result?.markers || result || [];
        this.set('currentMarkers', markers, 'currentMarkers-changed');
        return markers;
      } catch (error) {
        this.emitError('extractMarkersFromSelectedFiles', error);
        return [];
      } finally {
        this.silentSet('extractingMarkers', null);
      }
    })();

    this.silentSet('extractingMarkers', promise);
    return promise;
  }

  /**
   * 从指定文件列表提取 pytest 标记（用于弹窗内文件选择变更时实时提取）
   * @param {Array} files - 文件对象数组或路径字符串数组
   * @returns {Promise<Array>} 标记数组
   */
  async extractMarkersFromFiles(files) {
    try {
      const filePaths = (files || []).map((f) => (typeof f === 'string' ? f : f?.path)).filter(Boolean);
      if (filePaths.length === 0) return [];
      const result = await this._api.extractPytestMarkers(filePaths);
      return result?.markers || result || [];
    } catch (error) {
      this.emitError('extractMarkersFromFiles', error);
      return [];
    }
  }

  getSelectedTestTypes() {
    return this.get('currentMarkers') || [];
  }

  // ─── 钉钉通知 (runTests 聚合结果) ───────────────────────────────

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
        noTests: '⚠️ ' + window.i18n.t('testExecution.noTests'),
      };
      const testResult =
        statusLabels[testInfo.testStatus] ||
        (testInfo.hasFailure
          ? '❌ ' + window.i18n.t('testExecution.testFailed')
          : '✅ ' + window.i18n.t('testExecution.testPassed'));

      let message = window.i18n.t('testExecution.notification.title') + '\n';

      if (testInfo.scheduledPlanName) {
        message +=
          '\n' + window.i18n.t('testExecution.notification.scheduledPlan') + ': ' + testInfo.scheduledPlanName + '\n';
        message +=
          window.i18n.t('testExecution.notification.executionTime') +
          ': ' +
          (testInfo.scheduledPlanExecutionTime || new Date().toLocaleString()) +
          '\n';
      }

      message += '\n' + window.i18n.t('testExecution.notification.testPlan') + ': ' + testInfo.testPlanName + '\n';
      message +=
        window.i18n.t('testExecution.notification.testFiles') +
        ': ' +
        (testInfo.testFileNames || window.i18n.t('testExecution.notification.none')) +
        '\n';
      message +=
        window.i18n.t('testExecution.notification.testTypes') +
        ': ' +
        (testInfo.testTypes || window.i18n.t('testExecution.notification.all')) +
        '\n';
      message += window.i18n.t('testExecution.notification.loopCount') + ': ' + testInfo.loopCount + '\n';
      message += '\n' + window.i18n.t('testExecution.notification.roundInfo') + ':\n';
      message += window.i18n.t('testExecution.notification.totalRounds') + ': ' + testInfo.totalLoops + '\n';
      if (testInfo.loopCount > 1) {
        message += window.i18n.t('testExecution.notification.passRate') + ': ' + testInfo.passRate + '%\n';
      }

      if (testInfo.aggregatedStats && testInfo.aggregatedStats.total > 0) {
        const stats = testInfo.aggregatedStats;
        message += '\n' + window.i18n.t('testExecution.notification.caseStats') + ':\n';
        message +=
          window.i18n.t('testExecution.notification.casePassed') +
          ': ' +
          stats.passed +
          ', ' +
          window.i18n.t('testExecution.notification.caseFailed') +
          ': ' +
          stats.failed +
          ', ' +
          window.i18n.t('testExecution.notification.caseSkipped') +
          ': ' +
          stats.skipped +
          ', ' +
          window.i18n.t('testExecution.notification.caseBroken') +
          ': ' +
          stats.broken +
          ', ' +
          window.i18n.t('testExecution.notification.caseTotal') +
          ': ' +
          stats.total +
          '\n';
        message += window.i18n.t('testExecution.notification.casePassRate') + ': ' + testInfo.casePassRate + '%\n';
      }

      message += '\n' + window.i18n.t('testExecution.notification.testResult') + ': ' + testResult;

      const notificationData = {
        message: message,
      };

      this.appendOutput('>>> ' + window.i18n.t('testExecution.sendingNotification') + '...');
      // wrapper 已处理 IPC 失败,错误由外层 catch 接
      await this._api.sendDingTalkNotification(notificationData);
      this.appendOutput('>>> ' + window.i18n.t('testExecution.notificationSent'));
    } catch (error) {
      this.appendError('>>> ' + window.i18n.t('testExecution.notificationFailed') + ': ' + error.message);
    }
  }

  // ─── 生命周期 ───────────────────────────────────────────────────

  destroy() {
    // 清理 RAF
    if (this.get('outputRafId')) {
      cancelAnimationFrame(this.get('outputRafId'));
      this.silentSet('outputRafId', null);
    }
    // 清理输出缓冲
    this.silentSet('outputBuffer', []);
    super.destroy();
  }
}

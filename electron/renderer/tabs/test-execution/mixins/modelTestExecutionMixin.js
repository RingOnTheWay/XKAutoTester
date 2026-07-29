// modelTestExecutionMixin for TestExecutionModel
// Extracted from model.js during refactor
// Provides: 测试执行 + 输出缓冲 + IPC 事件监听

import { ApiBridge } from '../../../core/ApiBridge.js';

export const modelTestExecutionMixin = {
  // ─── 测试执行 ───────────────────────────────────────────────────

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
  },

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
  },

  appendOutput(text) {
    if (!text) return;
    // 按行过滤空白行
    const filteredLines = text.split(/\r?\n/).filter(line => line.trim() !== '');
    if (filteredLines.length === 0) return;
    const filteredText = filteredLines.join('\n');
    this._state.outputBuffer.push({ text: filteredText, isError: false });
    this._scheduleOutputFlush();
  },

  appendError(text) {
    if (!text) return;
    // 按行过滤空白行
    const filteredLines = text.split(/\r?\n/).filter(line => line.trim() !== '');
    if (filteredLines.length === 0) return;
    const filteredText = filteredLines.join('\n');
    this._state.outputBuffer.push({ text: filteredText, isError: true });
    this._scheduleOutputFlush();
  },

  clearOutput() {
    this._state.outputBuffer = [];
    if (this._state.outputRafId) {
      cancelAnimationFrame(this._state.outputRafId);
      this._state.outputRafId = null;
    }
    this.emit('output-cleared');
  },

  _scheduleOutputFlush() {
    if (this._state.outputRafId) return;
    this._state.outputRafId = requestAnimationFrame(() => this._flushOutputBuffer());
  },

  _flushOutputBuffer() {
    this._state.outputRafId = null;
    if (this._state.outputBuffer.length === 0) return;
    const batch = this._state.outputBuffer.splice(0);
    this.emit('output-flushed', batch);
  },

  // ─── IPC 事件监听 ───────────────────────────────────────────────

  listenTestOutput() {
    const unlisten = ApiBridge.listen({
      'test-output': (text) => {
        // 清理 ANSI 转义码和 \r 字符
        const cleaned = text.replace(/\x1b\[[0-9;]*m/g, '').replace(/\r/g, '');
        this.appendOutput(cleaned);
      },
    });
    this._ipcUnsubscribers.push(unlisten);
    return unlisten;
  },

  listenTestError() {
    const unlisten = ApiBridge.listen({
      'test-error': (text) => {
        // 清理 ANSI 转义码和 \r 字符
        const cleaned = text.replace(/\x1b\[[0-9;]*m/g, '').replace(/\r/g, '');
        this.appendError(cleaned);
      },
    });
    this._ipcUnsubscribers.push(unlisten);
    return unlisten;
  },

  listenScheduledTestStart() {
    const unlisten = ApiBridge.listen({
      'scheduled-test-start': (data) => {
        this.emit('scheduled-test-started', data);
      },
    });
    this._ipcUnsubscribers.push(unlisten);
    return unlisten;
  },

  listenScheduledPlanExpired() {
    const unlisten = ApiBridge.listen({
      'scheduled-plan-expired': (data) => {
        this.emit('scheduled-plan-expired', data);
      },
    });
    this._ipcUnsubscribers.push(unlisten);
    return unlisten;
  },
};

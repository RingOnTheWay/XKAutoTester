// modelReportsMixin for TestExecutionModel
// Extracted from model.js during refactor
// Provides: 测试类型/标记提取 + 报告查看 + 钉钉通知

export const modelReportsMixin = {
  // ─── 测试类型/标记 ──────────────────────────────────────────────

  async updateTestTypesFromSelectedFiles() {
    await this.extractMarkersFromSelectedFiles();
  },

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
  },

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
  },

  getSelectedTestTypes() {
    return this._state.currentMarkers || [];
  },

  // ─── 报告 ───────────────────────────────────────────────────────

  async showReportModal(testPlan) {
    if (!testPlan) {
      this.appendOutput('>>> ' + window.i18n.t('testExecution.selectTestPlanFirst'));
      return;
    }

    // 重置选中状态
    this._state.selectedReportRun = null;
    this.emit('show-report-modal', testPlan);

    try {
      // wrapper 已处理 IPC 失败,错误由外层 catch 接
      const result = await this._api.getTestPlanRuns(testPlan.name);
      this.emit('report-runs-loaded', result.runs || []);
    } catch (error) {
      this.emit('report-runs-error', error.message);
    }
  },

  selectReportRun(runId) {
    this._state.selectedReportRun = runId;
    this.emit('report-run-selected', runId);
  },

  /**
   * 删除指定运行记录及其报告
   * @param {Object} run - 运行记录对象 (含 timestamp, 可能含 reportPath)
   */
  async deleteReportRun(run) {
    if (!run) {
      this.emit('error', { source: 'deleteReportRun', error: new Error(window.i18n.t('reportModal.invalidReport')) });
      return;
    }
    const testPlan = this._state.currentTestPlan;
    if (!testPlan) {
      this.emit('error', { source: 'deleteReportRun', error: new Error(window.i18n.t('testExecution.selectTestPlanFirst')) });
      return;
    }

    try {
      // wrapper 已处理 IPC 失败,错误由外层 catch 接
      // reportPath 可能为 null (报告已删除的记录), 传 timestamp 作为匹配依据
      const identifier = run.reportPath || run.timestamp;
      const result = await this._api.deleteReportRun(testPlan.name, identifier);
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
      // 重新加载 runs 列表 (序号会重排)
      const runsResult = await this._api.getTestPlanRuns(testPlan.name);
      this.emit('report-runs-loaded', runsResult.runs || []);
    } catch (error) {
      this.emit('error', { source: 'deleteReportRun', error });
    }
  },

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
  },

  async checkReportExists(testPlan) {
    try {
      const result = await this._api.checkReportExists(testPlan);
      return result;
    } catch (error) {
      this.emit('error', { source: 'checkReportExists', error });
      return { exists: false };
    }
  },

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
  },
};

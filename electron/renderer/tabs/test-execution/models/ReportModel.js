import { BaseModel } from '../../../core/BaseModel.js';

/**
 * ReportModel - 报告子模型 (ADR-0012)
 *
 * 职责: 测试计划报告 / 定时计划整合报告的弹窗状态、运行记录加载/删除/打开。
 *
 * 跨域数据经参数传入 (不持有测试计划域状态):
 * - deleteReportRun 的 testPlan 模式源计划名由门面从 TestPlanModel 取好后传入
 *
 * 事件面 (门面显式转发): show-report-modal / show-scheduled-report-modal /
 * report-runs-loaded / report-runs-error / scheduled-report-runs-loaded /
 * report-run-selected / report-run-deleted / report-opened / report-open-failed / error
 */
export class ReportModel extends BaseModel {
  _api;

  /**
   * @param {Object} api - ApiBridge 绑定对象 (与门面/兄弟子模型共享同一实例)
   */
  constructor(api) {
    super({
      selectedReportRun: null,
      reportMode: 'testPlan', // 'testPlan' | 'scheduledPlan'
      currentScheduledPlanForReport: null,
    });
    this._api = api;
  }

  get selectedReportRun() {
    return this.get('selectedReportRun');
  }

  get reportMode() {
    return this.get('reportMode');
  }

  /**
   * 显示测试计划报告弹窗 (空计划守卫由门面处理, 此处假定 testPlan 非空)
   * @param {Object} testPlan - 测试计划对象
   */
  async showReportModal(testPlan) {
    // 重置选中状态
    this.silentSet('selectedReportRun', null);
    this.silentSet('reportMode', 'testPlan');
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
    // 重置选中状态
    this.silentSet('selectedReportRun', null);
    this.silentSet('reportMode', 'scheduledPlan');
    this.silentSet('currentScheduledPlanForReport', scheduledPlan);
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
    // P3-4: 参数实为整个 run 对象 (controller 传 run), 原命名 runId 误导
    this.silentSet('selectedReportRun', run);
    this.emit('report-run-selected', run);
  }

  /**
   * 删除指定运行记录及其报告
   * 支持两种模式:
   *   - testPlan 模式: 按 testPlanName 删除 (门面从 TestPlanModel 取好传入)
   *   - scheduledPlan 模式: 从 run.sourcePlanName 删除 (后端按源计划名定位)
   * @param {Object} run - 运行记录对象 (含 timestamp, 可能含 reportPath/sourcePlanName)
   * @param {string|null} testPlanName - testPlan 模式的源计划名 (scheduledPlan 模式传 undefined)
   */
  async deleteReportRun(run, testPlanName) {
    if (!run) {
      this.emitError('deleteReportRun', new Error(window.i18n.t('reportModal.invalidReport')));
      return;
    }

    const isScheduledMode = this.get('reportMode') === 'scheduledPlan';
    const sourcePlanName = isScheduledMode
      ? run.sourcePlanName || this.get('currentScheduledPlanForReport')?.name
      : testPlanName;

    if (!sourcePlanName) {
      this.emitError('deleteReportRun', new Error(window.i18n.t('testExecution.selectTestPlanFirst')));
      return;
    }

    try {
      // wrapper 已处理 IPC 失败,错误由外层 catch 接
      // reportPath 可能为 null (报告已删除的记录), 传 timestamp 作为匹配依据
      const identifier = run.reportPath || run.timestamp;
      const result = await this._api.deleteReportRun(sourcePlanName, identifier);
      if (!result.success) {
        this.emitError('deleteReportRun', new Error(result.error || window.i18n.t('reportModal.deleteFailed')));
        return;
      }
      // 清除选中的 run (如果删除的是当前选中)
      const selected = this.get('selectedReportRun');
      if (selected && (selected.reportPath === run.reportPath || selected.timestamp === run.timestamp)) {
        this.silentSet('selectedReportRun', null);
      }
      this.emit('report-run-deleted', run);
      // 重新加载列表 (按当前模式)
      if (isScheduledMode) {
        const scheduledPlan = this.get('currentScheduledPlanForReport');
        if (scheduledPlan) {
          const runsResult = await this._api.getScheduledPlanRuns(scheduledPlan.id);
          if (runsResult.success) {
            this.emit('scheduled-report-runs-loaded', runsResult.groups || []);
          }
        }
      } else {
        if (testPlanName) {
          const runsResult = await this._api.getTestPlanRuns(testPlanName);
          this.emit('report-runs-loaded', runsResult.runs || []);
        }
      }
    } catch (error) {
      this.emitError('deleteReportRun', error);
    }
  }

  async openSelectedReport() {
    const run = this.get('selectedReportRun');
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
      this.emitError('checkReportExists', error);
      return { exists: false };
    }
  }
}

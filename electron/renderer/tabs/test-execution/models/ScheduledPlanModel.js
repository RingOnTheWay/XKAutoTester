import { BaseModel } from '../../../core/BaseModel.js';
import { getScheduledPlanStatus } from '../../../core/utils/scheduledPlanStatus.js';

/**
 * ScheduledPlanModel - 定时计划子模型 (ADR-0012)
 *
 * 职责: 定时计划 CRUD 与选中态、时间冲突检查、计划过期处理。
 * (调度触发/手动立即执行的跨域组合 handleScheduledTestStart/runScheduledPlanNow
 *  留在门面 — 见 ADR-0012 修订)
 *
 * 事件面 (门面显式转发): scheduledPlans-changed / currentScheduledPlan-changed /
 * scheduledPlan-saved / scheduledPlan-updated / scheduledPlan-deleted /
 * show-edit-scheduled-plan-modal / scheduled-plan-expired / error
 */
export class ScheduledPlanModel extends BaseModel {
  _api;

  /**
   * @param {Object} api - ApiBridge 绑定对象 (与门面/兄弟子模型共享同一实例)
   */
  constructor(api) {
    super({
      scheduledPlans: [],
      currentScheduledPlan: null,
    });
    this._api = api;
  }

  get scheduledPlans() {
    return this.get('scheduledPlans');
  }

  get currentScheduledPlan() {
    return this.get('currentScheduledPlan');
  }

  async loadScheduledPlans() {
    try {
      const result = await this._api.getScheduledPlans();
      const plans = result?.data || result || [];
      this.set('scheduledPlans', plans, 'scheduledPlans-changed');
      // 同步 currentScheduledPlan：若已选中计划被删除，清空
      if (this.get('currentScheduledPlan')) {
        const updated = plans.find((p) => p.id === this.get('currentScheduledPlan').id);
        if (!updated) {
          this.set('currentScheduledPlan', null, 'currentScheduledPlan-changed');
        } else if (updated !== this.get('currentScheduledPlan')) {
          this.set('currentScheduledPlan', updated, 'currentScheduledPlan-changed');
        }
      }
      return plans;
    } catch (error) {
      this.emitError('loadScheduledPlans', error);
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
      this.emitError('saveScheduledPlan', error);
      return { success: false, error: error.message };
    }
  }

  async updateScheduledPlan(planId, planData) {
    try {
      // preload updateScheduledPlan 只接收单个 planData 参数，需将 id 合并进去
      const result = await this._api.updateScheduledPlan({
        ...planData,
        id: planId,
      });
      await this.loadScheduledPlans();
      this.emit('scheduledPlan-updated', result);
      return result;
    } catch (error) {
      this.emitError('updateScheduledPlan', error);
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
      this.emitError('deleteScheduledPlan', error);
      return { success: false, error: error.message };
    }
  }

  selectScheduledPlan(plan) {
    this.set('currentScheduledPlan', plan, 'currentScheduledPlan-changed');
  }

  deselectScheduledPlan() {
    this.set('currentScheduledPlan', null, 'currentScheduledPlan-changed');
  }

  /**
   * 编辑定时计划弹窗 — 由 controller 调用，触发 view 填充数据
   * @param {Object} plan - 定时计划对象
   */
  showEditScheduledPlanModal(plan) {
    this.emit('show-edit-scheduled-plan-modal', plan);
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
      this.emitError('checkTimeConflict', error);
      return { hasConflict: false };
    }
  }

  getScheduledPlanStatus(plan) {
    // P2-2: 委托统一工具 (原与 view.js static 双份重复)
    return getScheduledPlanStatus(plan);
  }
}

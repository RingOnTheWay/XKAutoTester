import { BaseModel } from '../../../core/BaseModel.js';

/**
 * TestPlanModel - 测试计划子模型 (ADR-0012)
 *
 * 职责: 测试计划 CRUD 与选中态; 列表重载时同步 currentTestPlan 引用
 * (计划被删则清空选中)。
 *
 * 事件面 (门面显式转发): testPlans-changed / currentTestPlan-changed /
 * testPlan-saved / testPlan-updated / testPlan-deleted / show-edit-plan-modal / error
 */
export class TestPlanModel extends BaseModel {
  _api;

  /**
   * @param {Object} api - ApiBridge 绑定对象 (与门面/兄弟子模型共享同一实例)
   */
  constructor(api) {
    super({
      testPlans: [],
      currentTestPlan: null,
    });
    this._api = api;
  }

  get testPlans() {
    return this.get('testPlans');
  }

  get currentTestPlan() {
    return this.get('currentTestPlan');
  }

  async loadTestPlans() {
    try {
      const result = await this._api.getTestPlans();
      const plans = result?.data || result || [];
      this.set('testPlans', plans, 'testPlans-changed');
      // 同步 currentTestPlan：若已选中计划，从新列表中找到对应项更新引用
      if (this.get('currentTestPlan')) {
        const updated = plans.find((p) => p.id === this.get('currentTestPlan').id);
        if (updated) {
          if (updated !== this.get('currentTestPlan')) {
            this.set('currentTestPlan', updated, 'currentTestPlan-changed');
          }
        } else {
          // 计划已被删除，清空 currentTestPlan
          this.set('currentTestPlan', null, 'currentTestPlan-changed');
        }
      }
      return plans;
    } catch (error) {
      this.emitError('loadTestPlans', error);
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
      this.emitError('saveTestPlan', error);
      return { success: false, error: error.message };
    }
  }

  async updateTestPlan(planId, planData) {
    try {
      // preload updateTestPlan 只接收单个 planData 参数，需将 id 合并进去
      const result = await this._api.updateTestPlan({
        ...planData,
        id: planId,
      });
      await this.loadTestPlans();
      this.emit('testPlan-updated', result);
      return result;
    } catch (error) {
      this.emitError('updateTestPlan', error);
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
      this.emitError('deleteTestPlan', error);
      return { success: false, error: error.message };
    }
  }

  selectTestPlan(plan) {
    this.set('currentTestPlan', plan, 'currentTestPlan-changed');
  }

  deselectTestPlan() {
    this.set('currentTestPlan', null, 'currentTestPlan-changed');
  }

  /**
   * 编辑测试计划弹窗 — 由 controller 调用，触发 view 填充数据
   * @param {Object} plan - 测试计划对象
   */
  showEditPlanModal(plan) {
    this.emit('show-edit-plan-modal', plan);
  }
}

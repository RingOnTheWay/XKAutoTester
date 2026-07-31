// modelTestPlansMixin for TestExecutionModel
// Extracted from model.js during refactor
// Provides: 测试计划 CRUD + 选中状态管理

export const modelTestPlansMixin = {
  // ─── 测试计划 ───────────────────────────────────────────────────

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
  },

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
  },

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
  },

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
  },

  selectTestPlan(plan) {
    this._set('currentTestPlan', plan, 'currentTestPlan-changed');
  },

  deselectTestPlan() {
    this._set('currentTestPlan', null, 'currentTestPlan-changed');
  },
};

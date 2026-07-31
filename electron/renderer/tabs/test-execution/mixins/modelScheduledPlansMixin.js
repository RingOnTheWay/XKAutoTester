// modelScheduledPlansMixin for TestExecutionModel
// Extracted from model.js during refactor
// Provides: 定时计划 CRUD + 弹窗触发 + 定时执行处理 + 状态查询
// Note: 静态方法 formatDateTime / parseDateTimeString 保留在主类中

export const modelScheduledPlansMixin = {
  // ─── 定时计划 ───────────────────────────────────────────────────

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
  },

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
  },

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
  },

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
  },

  selectScheduledPlan(plan) {
    this._set('currentScheduledPlan', plan, 'currentScheduledPlan-changed');
  },

  deselectScheduledPlan() {
    this._set('currentScheduledPlan', null, 'currentScheduledPlan-changed');
  },

  /**
   * 编辑测试计划弹窗 — 由 controller 调用，触发 view 填充数据
   * @param {Object} plan - 测试计划对象
   */
  showEditPlanModal(plan) {
    this.emit('show-edit-plan-modal', plan);
  },

  /**
   * 编辑定时计划弹窗 — 由 controller 调用，触发 view 填充数据
   * @param {Object} plan - 定时计划对象
   */
  showEditScheduledPlanModal(plan) {
    this.emit('show-edit-scheduled-plan-modal', plan);
  },

  /**
   * 加载定时计划弹窗所需的测试计划列表
   */
  async loadTestPlansForScheduledModal() {
    const plans = await this.loadTestPlans();
    this.emit('test-plans-for-scheduled-modal', plans);
    return plans;
  },

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
  },

  /**
   * 处理定时计划过期事件
   */
  handleScheduledPlanExpired(data) {
    this.emit('scheduled-plan-expired', data);
    // 刷新定时计划列表
    this.loadScheduledPlans();
  },

  async checkTimeConflict(scheduledTime, excludeId) {
    try {
      const result = await this._api.checkTimeConflict(scheduledTime, excludeId);
      return result;
    } catch (error) {
      this.emit('error', { source: 'checkTimeConflict', error });
      return { hasConflict: false };
    }
  },

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
  },
};

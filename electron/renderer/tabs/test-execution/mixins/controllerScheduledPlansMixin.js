// Scheduled plans mixin for TestExecutionController
// Extracted from controller.js during refactor
// Provides: scheduled plan CRUD handlers + helpers (getTestPlanNames, showConfirmDialog)
//   (handleShowNewScheduledPlanModal, handleEditScheduledPlan, handleSaveScheduledPlan,
//    handleUpdateScheduledPlan, handleDeleteScheduledPlan, getTestPlanNames, showConfirmDialog)

import { Toast } from '../../../components/toast.js';

export const controllerScheduledPlansMixin = {
  // ─── Handler 方法（定时计划） ─────────────────────────────

  async handleShowNewScheduledPlanModal() {
    // 重置弹窗状态
    this.view.setScheduledPlanModalTitle(window.i18n.t('scheduledPlan.newTitle') || '新建定时计划');
    this.view.fillScheduledPlanForm({});
    this.view.setScheduledPlanModalMode('new');

    this.view.openScheduledPlanModal();
    await this.model.loadTestPlansForScheduledModal();
  },

  handleEditScheduledPlan() {
    if (!this.model.currentScheduledPlan) return;
    this.model.showEditScheduledPlanModal(this.model.currentScheduledPlan);
  },

  async handleSaveScheduledPlan() {
    const formData = this.view.collectScheduledPlanFormData();

    // 将 scheduledTime 从 "YYYY-MM-DD HH:mm" 转换为 ISO 格式
    let scheduledTime = null;
    if (formData.scheduledTime) {
      scheduledTime = new Date(formData.scheduledTime.replace(' ', 'T'));
      if (isNaN(scheduledTime.getTime())) {
        Toast.error(window.i18n.t('scheduledPlan.invalidTime'));
        return;
      }
    }

    const planData = {
      name: formData.name,
      scheduledTime: scheduledTime ? scheduledTime.toISOString() : '',
      testPlans: formData.testPlans,
      testPlanNames: this.getTestPlanNames(formData.testPlans),
      status: 'pending',
    };

    // 检查时间冲突
    const conflictResult = await this.model.checkTimeConflict(
      planData.scheduledTime,
      planData.excludeId || null
    );
    if (conflictResult?.hasConflict) {
      const override = await this.showConfirmDialog(
        window.i18n.t('scheduledPlan.timeConflict'),
        window.i18n.t('scheduledPlan.timeConflictMessage'),
      );
      if (!override) return;
    }
    await this.model.saveScheduledPlan(planData);
    this.view.closeScheduledPlanModal();
    await this.model.loadScheduledPlans();
  },

  async handleUpdateScheduledPlan() {
    if (!this.model.currentScheduledPlan) return;
    const formData = this.view.collectScheduledPlanFormData();
    const currentPlan = this.model.currentScheduledPlan;

    // 将 scheduledTime 从 "YYYY-MM-DD HH:mm" 转换为 ISO 格式
    let newScheduledTime = null;
    if (formData.scheduledTime) {
      newScheduledTime = new Date(formData.scheduledTime.replace(' ', 'T'));
      if (isNaN(newScheduledTime.getTime())) {
        Toast.error(window.i18n.t('scheduledPlan.invalidTime'));
        return;
      }
    }

    // 根据新时间重置状态（不打扰执行中的计划）
    let status = currentPlan.status;
    const now = new Date();
    if (status !== 'running') {
      if (newScheduledTime && newScheduledTime <= now) {
        // 新时间是过去时间 → 标记为已过期
        status = 'expired';
      } else if ((status === 'completed' || status === 'expired') && newScheduledTime && newScheduledTime > now) {
        // 原是已完成/已过期，但新时间是未来时间 → 重置为待执行
        status = 'pending';
      }
    }

    const planData = {
      id: currentPlan.id,
      name: formData.name,
      scheduledTime: newScheduledTime ? newScheduledTime.toISOString() : '',
      testPlans: formData.testPlans,
      testPlanNames: this.getTestPlanNames(formData.testPlans),
      status: status,
      created: currentPlan.created,
    };

    await this.model.updateScheduledPlan(currentPlan.id, planData);
    this.view.closeScheduledPlanModal();
    await this.model.loadScheduledPlans();
  },

  getTestPlanNames(testPlanIds) {
    const allPlans = this.model.testPlans;
    if (!testPlanIds || !allPlans) return [];
    return testPlanIds.map(id => {
      const plan = allPlans.find(p => p.id === id);
      return plan ? plan.name : id;
    });
  },

  async handleDeleteScheduledPlan() {
    if (!this.model.currentScheduledPlan) return;
    this.view.showConfirmModal(
      window.i18n.t('testExecution.deleteScheduledPlan'),
      window.i18n.t('testExecution.deleteScheduledPlanConfirm'),
      async () => {
        await this.model.deleteScheduledPlan(this.model.currentScheduledPlan.id);
        await this.model.loadScheduledPlans();
      },
    );
  },

  // ─── 辅助方法（定时计划） ──────────────────────────────────

  async showConfirmDialog(title, message) {
    const result = await window.electronAPI?.showDialog?.({
      type: 'question',
      title,
      message,
      buttons: [window.i18n.t('common.confirm'), window.i18n.t('common.cancel')],
      defaultId: 0,
      cancelId: 1,
    });
    return result?.response === 0;
  },
};

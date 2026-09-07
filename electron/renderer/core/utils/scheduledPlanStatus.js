// 定时计划状态展示统一工具 (P2-2 收敛)
// 原双份重复: test-execution/view.js static getScheduledPlanStatus (L135-153) +
// model.js 实例方法 (L1084-1102), 行为完全一致。收敛为单一实现, 两处薄委托。

/**
 * 计算计划状态展示 {class, text}
 * @param {object|null} plan
 * @returns {{class: string, text: string}}
 */
export function getScheduledPlanStatus(plan) {
  // R24 P3-3: 无 plan 时走 i18n (原硬编码 'Unknown', 语言切换失效)
  if (!plan) return { class: 'unknown', text: window.i18n.t('scheduledPlan.statusUnknown') };
  const now = new Date();
  const scheduledTime = plan.scheduledTime ? new Date(plan.scheduledTime) : null;

  if (plan.status === 'completed') {
    return {
      class: 'completed',
      text: window.i18n.t('scheduledPlan.statusCompleted'),
    };
  } else if (plan.status === 'running') {
    return {
      class: 'running',
      text: window.i18n.t('scheduledPlan.statusRunning'),
    };
  } else if (plan.status === 'cancelled') {
    return {
      class: 'cancelled',
      text: window.i18n.t('scheduledPlan.statusCancelled'),
    };
  } else if (plan.status === 'expired') {
    return {
      class: 'expired',
      text: window.i18n.t('scheduledPlan.statusExpired'),
    };
  } else if (scheduledTime && scheduledTime <= now) {
    return {
      class: 'overdue',
      text: window.i18n.t('scheduledPlan.statusOverdue'),
    };
  } else {
    return {
      class: 'pending',
      text: window.i18n.t('scheduledPlan.statusPending'),
    };
  }
}

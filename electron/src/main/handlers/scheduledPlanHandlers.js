const { registerHandler } = require('./base/handlerUtils');
const { IPC_CHANNELS } = require('../../shared/constants');

function register(ipcMain, services) {
  const { scheduledPlanService, schedulerService } = services;

  registerHandler(ipcMain, IPC_CHANNELS.GET_SCHEDULED_PLANS, () => scheduledPlanService.getScheduledPlans());

  registerHandler(ipcMain, IPC_CHANNELS.SAVE_SCHEDULED_PLAN, async (planData) => {
    const result = await scheduledPlanService.saveScheduledPlan(planData);
    if (result.success) {
      schedulerService.addPlan(result.plan);
    }
    return result;
  });

  registerHandler(ipcMain, IPC_CHANNELS.UPDATE_SCHEDULED_PLAN, async (planData) => {
    const result = await scheduledPlanService.updateScheduledPlan(planData);
    if (result.success) {
      schedulerService.updatePlan(planData.id, planData);
    }
    return result;
  });

  registerHandler(ipcMain, IPC_CHANNELS.DELETE_SCHEDULED_PLAN, async (planId) => {
    const result = await scheduledPlanService.deleteScheduledPlan(planId);
    if (result.success) {
      schedulerService.removePlan(planId);
    }
    return result;
  });

  registerHandler(ipcMain, IPC_CHANNELS.CHECK_TIME_CONFLICT, (data) => {
    const { scheduledTime, excludeId } = data || {};
    return scheduledPlanService.checkTimeConflict(scheduledTime, excludeId);
  });

  registerHandler(ipcMain, IPC_CHANNELS.SCHEDULED_TEST_COMPLETE, async (planId) => {
    const result = await scheduledPlanService.updateScheduledPlan({
      id: planId,
      status: 'completed',
      lastRun: new Date().toISOString()
    });
    // 通知调度器该计划已完成
    schedulerService.updatePlan(planId, { status: 'completed' });
    return result;
  });

  registerHandler(ipcMain, IPC_CHANNELS.GET_SCHEDULER_STATUS, () => schedulerService.getStatus());
}

module.exports = { register };

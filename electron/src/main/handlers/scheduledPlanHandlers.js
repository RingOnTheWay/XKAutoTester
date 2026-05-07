const { registerHandler } = require('./base/handlerUtils');

function register(ipcMain, services) {
  const { scheduledPlanService, schedulerService } = services;

  registerHandler(ipcMain, 'get-scheduled-plans', () => scheduledPlanService.getScheduledPlans());

  registerHandler(ipcMain, 'save-scheduled-plan', async (planData) => {
    const result = await scheduledPlanService.saveScheduledPlan(planData);
    if (result.success) {
      schedulerService.addPlan(result.plan);
    }
    return result;
  });

  registerHandler(ipcMain, 'update-scheduled-plan', async (planData) => {
    const result = await scheduledPlanService.updateScheduledPlan(planData);
    if (result.success) {
      schedulerService.updatePlan(planData.id, planData);
    }
    return result;
  });

  registerHandler(ipcMain, 'delete-scheduled-plan', async (planId) => {
    const result = await scheduledPlanService.deleteScheduledPlan(planId);
    if (result.success) {
      schedulerService.removePlan(planId);
    }
    return result;
  });

  registerHandler(ipcMain, 'check-time-conflict', (data) => {
    const { scheduledTime, excludeId } = data || {};
    return scheduledPlanService.checkTimeConflict(scheduledTime, excludeId);
  });

  registerHandler(ipcMain, 'scheduled-test-complete', (planId) =>
    scheduledPlanService.updateScheduledPlan({
      id: planId,
      status: 'completed',
      lastRun: new Date().toISOString()
    })
  );

  registerHandler(ipcMain, 'get-scheduler-status', () => schedulerService.getStatus());
}

module.exports = { register };

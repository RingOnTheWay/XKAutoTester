function register(ipcMain, services) {
  const { scheduledPlanService, schedulerService } = services;

  ipcMain.handle('get-scheduled-plans', async () => {
    return scheduledPlanService.getScheduledPlans();
  });

  ipcMain.handle('save-scheduled-plan', async (event, planData) => {
    const result = await scheduledPlanService.saveScheduledPlan(planData);
    if (result.success) {
      schedulerService.addPlan(result.plan);
    }
    return result;
  });

  ipcMain.handle('update-scheduled-plan', async (event, planData) => {
    const result = await scheduledPlanService.updateScheduledPlan(planData);
    if (result.success) {
      schedulerService.updatePlan(planData.id, planData);
    }
    return result;
  });

  ipcMain.handle('delete-scheduled-plan', async (event, planId) => {
    const result = await scheduledPlanService.deleteScheduledPlan(planId);
    if (result.success) {
      schedulerService.removePlan(planId);
    }
    return result;
  });

  ipcMain.handle('check-time-conflict', async (event, data) => {
    const { scheduledTime, excludeId } = data || {};
    return scheduledPlanService.checkTimeConflict(scheduledTime, excludeId);
  });

  ipcMain.handle('scheduled-test-complete', async (event, planId) => {
    return scheduledPlanService.updateScheduledPlan({
      id: planId,
      status: 'completed',
      lastRun: new Date().toISOString()
    });
  });

  ipcMain.handle('get-scheduler-status', async () => {
    return schedulerService.getStatus();
  });
}

module.exports = { register };

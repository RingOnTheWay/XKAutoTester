const { registerHandler } = require('./base/handlerUtils');
const { IPC_CHANNELS } = require('../../shared/constants');

/**
 * 聚合定时计划关联的所有测试计划运行记录 (整合显示用)
 * 数据结构: [{ sourcePlanName, runs: [...] }, ...]
 * 分组排序: 按分组内最新 run 时间倒序
 * 分组内 runs 排序: 时间倒序 (与原 getTestPlanRuns 一致)
 * @param {Object} scheduledPlanService
 * @param {Object} testPlanService
 * @param {string} planId - 定时计划 ID
 * @returns {Promise<{success: boolean, groups?: Array, error?: string}>}
 */
async function getScheduledPlanRuns(scheduledPlanService, testPlanService, planId) {
  try {
    const plans = await scheduledPlanService.getScheduledPlans();
    const plan = plans.find(p => p.id === planId);
    if (!plan) {
      return { success: false, error: '未找到指定的定时计划', groups: [] };
    }
    const testPlanIds = (plan.testPlans || []).map(p => typeof p === 'string' ? p : p.id);

    // 取所有 testPlans 用于 id -> name 映射
    const allTestPlansResult = await testPlanService.getTestPlans();
    const allTestPlans = allTestPlansResult?.data || allTestPlansResult || [];

    const groups = [];
    for (const tpId of testPlanIds) {
      const tp = allTestPlans.find(p => p.id === tpId);
      if (!tp) continue;
      const runsResult = await testPlanService.getTestPlanRuns(tp.name);
      const runs = runsResult?.runs || [];
      if (runs.length === 0) continue;
      // 附加 sourcePlanName 便于删除时定位原计划
      runs.forEach(r => { r.sourcePlanName = tp.name; });
      // 分组内最新 run 时间
      const latestTs = runs[0]?.timestamp || '';
      groups.push({ sourcePlanName: tp.name, latestTimestamp: latestTs, runs });
    }
    // 分组排序: 最新时间倒序
    groups.sort((a, b) => {
      const ta = a.latestTimestamp ? new Date(a.latestTimestamp).getTime() : 0;
      const tb = b.latestTimestamp ? new Date(b.latestTimestamp).getTime() : 0;
      return tb - ta;
    });
    return { success: true, groups };
  } catch (error) {
    console.error('[scheduledPlanHandlers] 获取定时计划运行记录失败:', error);
    return { success: false, error: error.message, groups: [] };
  }
}

function register(ipcMain, services) {
  const { scheduledPlanService, schedulerService, testPlanService } = services;

  registerHandler(ipcMain, IPC_CHANNELS.GET_SCHEDULED_PLANS, () => scheduledPlanService.getScheduledPlans());

  registerHandler(ipcMain, IPC_CHANNELS.GET_SCHEDULED_PLAN_RUNS, (planId) =>
    getScheduledPlanRuns(scheduledPlanService, testPlanService, planId)
  );

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

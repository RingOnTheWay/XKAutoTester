const path = require('path');
const JsonFileCrudService = require('./base/JsonFileCrudService');

class ScheduledPlanService extends JsonFileCrudService {
  constructor(userConfigPath) {
    const scheduledPlansPath = path.join(userConfigPath, 'scheduled_plans.json');
    super(scheduledPlansPath, []);
  }

  async getScheduledPlans() {
    return this.getData();
  }

  async getScheduledPlansSync() {
    return this.getScheduledPlans();
  }

  async saveScheduledPlan(planData) {
    try {
      let existingPlans = await this.getData();

      const newPlan = {
        id: planData.id || this._generateId(),
        name: planData.name,
        testPlans: planData.testPlans || [],
        testPlanNames: planData.testPlanNames || (planData.testPlans ? planData.testPlans.map(p => p.name) : []),
        scheduledTime: planData.scheduledTime,
        status: 'pending',
        created: planData.created || new Date().toISOString(),
        lastRun: null
      };

      existingPlans.push(newPlan);
      await this.saveData(existingPlans);

      return { success: true, plan: newPlan };
    } catch (error) {
      console.error('保存定时计划失败:', error);
      return { success: false, error: error.message };
    }
  }

  async updateScheduledPlan(planData) {
    try {
      let existingPlans = await this.getData();

      const index = existingPlans.findIndex(p => p.id === planData.id);

      if (index >= 0) {
        const originalPlan = existingPlans[index];
        existingPlans[index] = {
          ...originalPlan,
          ...planData,
          id: originalPlan.id,
          created: originalPlan.created,
          testPlanNames: planData.testPlanNames || (planData.testPlans ? planData.testPlans.map(p => p.name) : originalPlan.testPlanNames || [])
        };

        await this.saveData(existingPlans);
        return { success: true };
      } else {
        return { success: false, error: '未找到指定的定时计划' };
      }
    } catch (error) {
      console.error('更新定时计划失败:', error);
      return { success: false, error: error.message };
    }
  }

  async deleteScheduledPlan(planId) {
    try {
      let existingPlans = await this.getData();

      const index = existingPlans.findIndex(p => p.id === planId);

      if (index >= 0) {
        existingPlans.splice(index, 1);
        await this.saveData(existingPlans);
        return { success: true };
      } else {
        return { success: false, error: '未找到指定的定时计划' };
      }
    } catch (error) {
      console.error('删除定时计划失败:', error);
      return { success: false, error: error.message };
    }
  }

  async checkTimeConflict(scheduledTime, excludeId = null) {
    try {
      const existingPlans = await this.getScheduledPlans();

      const newTime = new Date(scheduledTime);
      const newTimeMinutes = newTime.getFullYear() + '-' +
                            String(newTime.getMonth() + 1).padStart(2, '0') + '-' +
                            String(newTime.getDate()).padStart(2, '0') + 'T' +
                            String(newTime.getHours()).padStart(2, '0') + ':' +
                            String(newTime.getMinutes()).padStart(2, '0');

      for (const plan of existingPlans) {
        if (excludeId && plan.id === excludeId) {
          continue;
        }

        if (plan.status === 'cancelled') {
          continue;
        }

        const planTime = new Date(plan.scheduledTime);
        const planTimeMinutes = planTime.getFullYear() + '-' +
                               String(planTime.getMonth() + 1).padStart(2, '0') + '-' +
                               String(planTime.getDate()).padStart(2, '0') + 'T' +
                               String(planTime.getHours()).padStart(2, '0') + ':' +
                               String(planTime.getMinutes()).padStart(2, '0');

        if (newTimeMinutes === planTimeMinutes) {
          return {
            hasConflict: true,
            conflictingPlan: plan
          };
        }
      }

      return { hasConflict: false };
    } catch (error) {
      console.error('检查时间冲突失败:', error);
      return { hasConflict: false };
    }
  }
}

module.exports = ScheduledPlanService;

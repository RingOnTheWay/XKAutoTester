// ScheduledPlanService — 定时计划深模块。
//
// 藏 plan CRUD + 时间冲突检测 (分钟级) + 日期格式化。
// 3 factory-or-default 经 base 透传 (asyncFsFactory + idGenerator + loggerFactory) + 2 日期纯函数。
//
// 生产: new ScheduledPlanService(userConfigPath)  # 1 参
// 测试: new ScheduledPlanService(userConfigPath, { asyncFsFactory, idGenerator, loggerFactory })

const path = require('path');
const { JsonFileCrudService } = require('./base/JsonFileCrudService');

/** @typedef {Object} ScheduledPlanLogger
 * @property {(msg: string) => void} error
 */
/** @typedef {Object} ScheduledPlanServiceOptions
 * @property {() => object} [asyncFsFactory] - 经 base
 * @property {() => string} [idGenerator] - 经 base
 * @property {() => ScheduledPlanLogger} [loggerFactory]
 */

/**
 * 格式化日期为分钟级字符串 (YYYY-MM-DDTHH:MM)
 * @param {Date} date
 * @returns {string}
 */
function formatDateToMinute(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * 判断两计划时间是否同一分钟
 * @param {Date} time1
 * @param {Date} time2
 * @returns {boolean}
 */
function isSameMinutePlan(time1, time2) {
  return formatDateToMinute(time1) === formatDateToMinute(time2);
}

const defaultLoggerFactory = () => ({ error: (msg) => console.error(msg) });

class ScheduledPlanService extends JsonFileCrudService {
  /**
   * @param {string} userConfigPath
   * @param {ScheduledPlanServiceOptions} [opts] - factory-or-default (经 base 透传)
   */
  constructor(userConfigPath, opts = {}) {
    const scheduledPlansPath = path.join(userConfigPath, 'scheduled_plans.json');
    super(scheduledPlansPath, [], opts);  // 透传 opts.asyncFsFactory + opts.idGenerator 给 base (filePath 由基类持有)
    this._loggerFactory = opts.loggerFactory || defaultLoggerFactory;
    this._logger = this._loggerFactory();
  }

  /** 定时计划文件路径 (供 SmartScheduler 设置文件监听; 复用基类 filePath 单源, 避免双字段漂移) */
  get scheduledPlansPath() {
    return this.filePath;
  }

  async getScheduledPlans() {
    return this.getData();
  }

  async saveScheduledPlan(planData) {
    try {
      let existingPlans = await this.getData();
      const newPlan = {
        id: planData.id || this._generateId(),
        name: planData.name,
        testPlans: planData.testPlans || [],
        testPlanNames: planData.testPlanNames ||
          (planData.testPlans ? planData.testPlans.map(p => p.name) : []),
        scheduledTime: planData.scheduledTime,
        status: 'pending',
        created: planData.created || new Date().toISOString(),
        lastRun: null
      };
      existingPlans.push(newPlan);
      await this.saveData(existingPlans);
      return { success: true, plan: newPlan };
    } catch (error) {
      this._logger.error('保存定时计划失败: ' + error.message);
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
          testPlanNames: planData.testPlanNames ||
            (planData.testPlans ? planData.testPlans.map(p => p.name) : originalPlan.testPlanNames || [])
        };
        await this.saveData(existingPlans);
        return { success: true };
      } else {
        return { success: false, error: '未找到指定的定时计划' };
      }
    } catch (error) {
      this._logger.error('更新定时计划失败: ' + error.message);
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
      this._logger.error('删除定时计划失败: ' + error.message);
      return { success: false, error: error.message };
    }
  }

  async checkTimeConflict(scheduledTime, excludeId = null) {
    try {
      const existingPlans = await this.getScheduledPlans();
      const newTime = new Date(scheduledTime);

      for (const plan of existingPlans) {
        if (excludeId && plan.id === excludeId) continue;
        if (plan.status === 'cancelled') continue;

        const planTime = new Date(plan.scheduledTime);
        if (isSameMinutePlan(newTime, planTime)) {
          return { hasConflict: true, conflictingPlan: plan };
        }
      }
      return { hasConflict: false };
    } catch (error) {
      this._logger.error('检查时间冲突失败: ' + error.message);
      return { hasConflict: false };
    }
  }
}

module.exports = { ScheduledPlanService, formatDateToMinute, isSameMinutePlan };

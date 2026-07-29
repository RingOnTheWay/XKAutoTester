// SchedulerService — facade, 公共 API 零变化。
//
// 7 公共方法全 delegate SmartScheduler。lazy createScheduler。
// 对称 adb_manager.py (facade) + cli.py Cli (facade)。

const { SmartScheduler } = require('./smartScheduler');

class SchedulerService {
  constructor() {
    this.scheduler = null;
    this.i18nService = null;
    this.scheduledPlanService = null;
  }

  init(i18nService, scheduledPlanService) {
    this.i18nService = i18nService;
    this.scheduledPlanService = scheduledPlanService;
  }

  createScheduler() {
    if (!this.scheduler) {
      this.scheduler = new SmartScheduler(this.scheduledPlanService, this.i18nService);
    }
    return this.scheduler;
  }

  async initialize() {
    if (this.scheduler) {
      return this.scheduler.initialize();
    }
  }

  start() {
    if (!this.scheduler) {
      this.createScheduler();
      return this.initialize();
    }
  }

  stop() {
    if (this.scheduler) {
      this.scheduler.destroy();
      this.scheduler = null;
    }
  }

  setMainWindow(window) {
    if (this.scheduler) {
      this.scheduler.setMainWindow(window);
    }
  }

  getStatus() {
    return this.scheduler ? this.scheduler.getStatus() : null;
  }

  addPlan(plan) {
    if (this.scheduler) {
      this.scheduler.addPlan(plan);
    }
  }

  removePlan(planId) {
    if (this.scheduler) {
      this.scheduler.removePlan(planId);
    }
  }

  async updatePlan(planId, updates) {
    if (this.scheduler) {
      await this.scheduler.updatePlan(planId, updates);
    }
  }
}

module.exports = { SchedulerService };

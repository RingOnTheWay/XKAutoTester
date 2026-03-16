const fs = require('fs');

class ScheduledPlanQueue {
  constructor() {
    this.heap = [];
  }

  enqueue(plan) {
    this.heap.push(plan);
    this.bubbleUp(this.heap.length - 1);
  }

  dequeue() {
    if (this.heap.length === 0) return null;
    const min = this.heap[0];
    const last = this.heap.pop();
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.bubbleDown(0);
    }
    return min;
  }

  peek() {
    return this.heap.length > 0 ? this.heap[0] : null;
  }

  remove(planId) {
    const index = this.heap.findIndex(p => p.id === planId);
    if (index !== -1) {
      this.heap.splice(index, 1);
      this.rebuild();
      return true;
    }
    return false;
  }

  rebuild() {
    const plans = [...this.heap];
    this.heap = [];
    plans.forEach(p => this.enqueue(p));
  }

  size() {
    return this.heap.length;
  }

  getAll() {
    return [...this.heap];
  }

  bubbleUp(index) {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.compare(this.heap[index], this.heap[parentIndex]) < 0) {
        [this.heap[index], this.heap[parentIndex]] = [this.heap[parentIndex], this.heap[index]];
        index = parentIndex;
      } else {
        break;
      }
    }
  }

  bubbleDown(index) {
    const length = this.heap.length;
    while (true) {
      let smallest = index;
      const left = 2 * index + 1;
      const right = 2 * index + 2;

      if (left < length && this.compare(this.heap[left], this.heap[smallest]) < 0) {
        smallest = left;
      }
      if (right < length && this.compare(this.heap[right], this.heap[smallest]) < 0) {
        smallest = right;
      }

      if (smallest !== index) {
        [this.heap[index], this.heap[smallest]] = [this.heap[smallest], this.heap[index]];
        index = smallest;
      } else {
        break;
      }
    }
  }

  compare(a, b) {
    return new Date(a.scheduledTime) - new Date(b.scheduledTime);
  }
}

const SCHEDULE_STRATEGY = {
  PRECISE: { threshold: 60 * 60 * 1000 },
  MEDIUM: { threshold: 24 * 60 * 60 * 1000 },
  LONG_TERM: { threshold: Infinity }
};

class SmartScheduler {
  constructor(scheduledPlanService, i18nService) {
    this.scheduledPlanService = scheduledPlanService;
    this.i18nService = i18nService;
    this.planQueue = new ScheduledPlanQueue();
    this.currentTimer = null;
    this.checkInterval = null;
    this.isExecuting = false;
    this.fileWatcher = null;
    this.mainWindow = null;
    this.state = {
      mode: 'idle',
      nextCheckTime: null,
      activePlanCount: 0
    };
  }

  setMainWindow(window) {
    this.mainWindow = window;
  }

  async initialize() {
    await this.loadPlansToQueue();
    this.setupFileWatcher();
    await this.startSmartScheduling();
  }

  async loadPlansToQueue() {
    try {
      const plans = await this.scheduledPlanService.getScheduledPlans();
      const now = new Date();

      plans.forEach(plan => {
        if (plan.status === 'pending') {
          const planTime = new Date(plan.scheduledTime);
          if (planTime > now) {
            this.planQueue.enqueue(plan);
          } else {
            this.markAsExpired(plan);
          }
        }
      });

      this.state.activePlanCount = this.planQueue.size();
    } catch (error) {
      console.error('加载计划到队列失败:', error);
    }
  }

  async startSmartScheduling() {
    const nextPlan = this.planQueue.peek();

    if (!nextPlan) {
      this.enterIdleMode();
      return;
    }

    const now = Date.now();
    const planTime = new Date(nextPlan.scheduledTime).getTime();
    const timeUntilPlan = planTime - now;

    if (timeUntilPlan <= 0) {
      await this.markAsExpired(nextPlan);
      this.planQueue.dequeue();
      await this.startSmartScheduling();
      return;
    }

    if (timeUntilPlan <= SCHEDULE_STRATEGY.PRECISE.threshold) {
      this.enterPreciseMode(nextPlan, timeUntilPlan);
    } else if (timeUntilPlan <= SCHEDULE_STRATEGY.MEDIUM.threshold) {
      this.enterMediumMode(nextPlan, timeUntilPlan);
    } else {
      this.enterLongTermMode(nextPlan, timeUntilPlan);
    }
  }

  enterIdleMode() {
    this.state.mode = 'idle';
    this.clearAllTimers();

    this.checkInterval = setInterval(() => {
      if (this.planQueue.size() > 0) {
        clearInterval(this.checkInterval);
        this.checkInterval = null;
        this.startSmartScheduling();
      }
    }, 30 * 60 * 1000);
  }

  enterPreciseMode(plan, delay) {
    this.state.mode = 'precise';
    this.clearAllTimers();

    const SAFETY_THRESHOLD = 100;
    const adjustedDelay = Math.max(0, delay - SAFETY_THRESHOLD);

    this.currentTimer = setTimeout(() => {
      this.finalCountdown(plan);
    }, adjustedDelay);

    this.state.nextCheckTime = Date.now() + adjustedDelay;
  }

  enterMediumMode(plan, timeUntilPlan) {
    this.state.mode = 'medium';
    this.clearAllTimers();

    const checkInterval = this.calculateMediumCheckInterval(timeUntilPlan);

    this.checkInterval = setInterval(() => {
      const remaining = new Date(plan.scheduledTime) - Date.now();

      if (remaining <= SCHEDULE_STRATEGY.PRECISE.threshold) {
        clearInterval(this.checkInterval);
        this.checkInterval = null;
        this.enterPreciseMode(plan, remaining);
      }
    }, checkInterval);

    this.state.nextCheckTime = Date.now() + checkInterval;
  }

  enterLongTermMode(plan, timeUntilPlan) {
    this.state.mode = 'long_term';
    this.clearAllTimers();

    const firstCheckDelay = timeUntilPlan - SCHEDULE_STRATEGY.MEDIUM.threshold;

    this.currentTimer = setTimeout(() => {
      const remaining = new Date(plan.scheduledTime) - Date.now();
      this.enterMediumMode(plan, remaining);
    }, firstCheckDelay);

    this.checkInterval = setInterval(() => {
      this.refreshSchedule();
    }, 24 * 60 * 60 * 1000);

    this.state.nextCheckTime = Date.now() + firstCheckDelay;
  }

  calculateMediumCheckInterval(timeUntilPlan) {
    if (timeUntilPlan < 2 * 60 * 60 * 1000) {
      return 10 * 60 * 1000;
    } else if (timeUntilPlan < 6 * 60 * 60 * 1000) {
      return 30 * 60 * 1000;
    } else {
      return 60 * 60 * 1000;
    }
  }

  finalCountdown(plan) {
    const now = Date.now();
    const planTime = new Date(plan.scheduledTime).getTime();
    const remaining = planTime - now;

    if (remaining <= 0) {
      this.executePlan(plan);
    } else if (remaining <= 100) {
      setImmediate(() => this.finalCountdown(plan));
    } else {
      this.currentTimer = setTimeout(() => {
        this.finalCountdown(plan);
      }, remaining);
    }
  }

  async executePlan(plan) {
    if (this.isExecuting) return;

    this.isExecuting = true;

    try {
      this.planQueue.dequeue();
      this.state.activePlanCount = this.planQueue.size();

      await this.scheduledPlanService.updateScheduledPlan({
        id: plan.id,
        status: 'running',
        lastRun: new Date().toISOString()
      });

      if (this.mainWindow) {
        this.mainWindow.webContents.send('scheduled-test-start', {
          planId: plan.id,
          planName: plan.name,
          testPlans: plan.testPlans,
          scheduledTime: plan.scheduledTime,
          executionTime: new Date().toLocaleString()
        });
      }
    } catch (error) {
      console.error('执行定时计划失败:', error);
      await this.scheduledPlanService.updateScheduledPlan({
        id: plan.id,
        status: 'completed',
        lastRun: new Date().toISOString()
      });
    } finally {
      this.isExecuting = false;
      await this.startSmartScheduling();
    }
  }

  setupFileWatcher() {
    try {
      const plansPath = this.scheduledPlanService.scheduledPlansPath;
      if (fs.existsSync(plansPath)) {
        this.fileWatcher = fs.watch(plansPath, (eventType) => {
          if (eventType === 'change') {
            this.handlePlansFileChange();
          }
        });
      }
    } catch (error) {
      console.error('设置文件监听失败:', error);
    }
  }

  async handlePlansFileChange() {
    this.planQueue = new ScheduledPlanQueue();
    await this.loadPlansToQueue();
    await this.refreshSchedule();
  }

  async refreshSchedule() {
    this.clearAllTimers();
    await this.startSmartScheduling();
  }

  addPlan(plan) {
    this.planQueue.enqueue(plan);
    this.state.activePlanCount = this.planQueue.size();

    const nextPlan = this.planQueue.peek();
    if (nextPlan && nextPlan.id === plan.id) {
      this.refreshSchedule();
    }
  }

  removePlan(planId) {
    const nextPlan = this.planQueue.peek();
    this.planQueue.remove(planId);
    this.state.activePlanCount = this.planQueue.size();

    if (nextPlan && nextPlan.id === planId) {
      this.refreshSchedule();
    }
  }

  updatePlan(planId, updates) {
    this.removePlan(planId);

    if (updates.status === 'pending') {
      const plans = this.scheduledPlanService.getScheduledPlansSync ? 
                    this.scheduledPlanService.getScheduledPlansSync() : [];
      const originalPlan = plans.find(p => p.id === planId);
      if (originalPlan) {
        const updatedPlan = { ...originalPlan, ...updates };
        this.addPlan(updatedPlan);
      }
    }
  }

  async markAsExpired(plan) {
    await this.scheduledPlanService.updateScheduledPlan({
      id: plan.id,
      status: 'expired'
    });

    if (this.mainWindow) {
      this.mainWindow.webContents.send('scheduled-plan-expired', {
        planId: plan.id,
        planName: plan.name
      });
    }
  }

  clearAllTimers() {
    if (this.currentTimer) {
      clearTimeout(this.currentTimer);
      this.currentTimer = null;
    }
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  destroy() {
    this.clearAllTimers();
    if (this.fileWatcher) {
      this.fileWatcher.close();
      this.fileWatcher = null;
    }
  }

  getStatus() {
    return {
      ...this.state,
      nextPlan: this.planQueue.peek(),
      queueSize: this.planQueue.size()
    };
  }
}

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

  updatePlan(planId, updates) {
    if (this.scheduler) {
      this.scheduler.updatePlan(planId, updates);
    }
  }
}

module.exports = {
  SchedulerService,
  SmartScheduler,
  ScheduledPlanQueue,
  SCHEDULE_STRATEGY
};

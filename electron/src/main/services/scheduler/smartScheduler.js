// SmartScheduler — 调度状态机 orchestrator。
//
// 藏 4 关注点: 状态机 4 模式切换 + timer 协调 + plan 执行编排 + 文件监听。
// 7 factory-or-default (对称 test_initializer.py L146-198 + cli.py L46-71):
//   queueFactory / timerProvider / watcherFactory / notifierFactory / nowProvider / logger / (compare via queueFactory)
//
// 行为零变化: 保留 executePlan catch 写 status='completed' bug (RFC §1.3) +
//   finalCountdown setImmediate 递归 + SAFETY_THRESHOLD=100ms 提前量。

const { IPC_CHANNELS } = require('../../../shared/constants');
const { ScheduledPlanQueue } = require('./planQueue');
const {
  SCHEDULE_STRATEGY,
  SAFETY_THRESHOLD,
  IDLE_CHECK_INTERVAL,
  LONG_TERM_REFRESH_INTERVAL,
  calculateMediumCheckInterval,
} = require('./strategies');
const { globalTimerProvider, defaultWatcherFactory, defaultNotifierFactory } = require('./effects');

class SmartScheduler {
  /**
   * @param {ScheduledPlanService} scheduledPlanService
   * @param {I18nService} i18nService
   * @param {Object} [opts] - factory-or-default (全可选, 生产不传)
   * @param {Function} [opts.queueFactory] - () => ScheduledPlanQueue
   * @param {Object} [opts.timerProvider] - { setTimeout, setInterval, clearTimeout, clearInterval, setImmediate }
   * @param {Function} [opts.watcherFactory] - (path, cb) => { close } | null
   * @param {Function} [opts.notifierFactory] - (window) => { send }
   * @param {Function} [opts.nowProvider] - () => number
   * @param {Object} [opts.logger] - { info, warn, error }
   */
  constructor(scheduledPlanService, i18nService, opts = {}) {
    this.scheduledPlanService = scheduledPlanService;
    this.i18nService = i18nService;

    // factory-or-default (对称 test_initializer.py L177-198)
    this._queueFactory = opts.queueFactory || (() => new ScheduledPlanQueue());
    this._timer = opts.timerProvider || globalTimerProvider;
    this._watcherFactory = opts.watcherFactory || defaultWatcherFactory;
    this._notifierFactory = opts.notifierFactory || defaultNotifierFactory;
    this._now = opts.nowProvider || Date.now;
    this._logger = opts.logger || console;

    this.planQueue = this._queueFactory();
    this.currentTimer = null;
    this.checkInterval = null;
    this.isExecuting = false;
    this.fileWatcher = null;
    this.mainWindow = null;
    this._notifier = this._notifierFactory(null);
    this.state = {
      mode: 'idle',
      nextCheckTime: null,
      activePlanCount: 0,
    };
  }

  setMainWindow(window) {
    this.mainWindow = window;
    this._notifier = this._notifierFactory(window);
  }

  async initialize() {
    await this._loadPlansToQueue();
    this._setupFileWatcher();
    await this._startSmartScheduling();
  }

  async _loadPlansToQueue() {
    try {
      const plans = await this.scheduledPlanService.getScheduledPlans();
      const now = new Date(this._now());

      plans.forEach((plan) => {
        if (plan.status === 'pending') {
          const planTime = new Date(plan.scheduledTime);
          if (planTime > now) {
            this.planQueue.enqueue(plan);
          } else {
            this._markAsExpired(plan);
          }
        }
      });

      this.state.activePlanCount = this.planQueue.size();
    } catch (error) {
      this._logger.error('加载计划到队列失败:', error);
    }
  }

  async _startSmartScheduling() {
    const nextPlan = this.planQueue.peek();

    if (!nextPlan) {
      this._enterIdleMode();
      return;
    }

    const now = this._now();
    const planTime = new Date(nextPlan.scheduledTime).getTime();
    const timeUntilPlan = planTime - now;

    if (timeUntilPlan <= 0) {
      await this._markAsExpired(nextPlan);
      this.planQueue.dequeue();
      await this._startSmartScheduling();
      return;
    }

    if (timeUntilPlan <= SCHEDULE_STRATEGY.PRECISE.threshold) {
      this._enterPreciseMode(nextPlan, timeUntilPlan);
    } else if (timeUntilPlan <= SCHEDULE_STRATEGY.MEDIUM.threshold) {
      this._enterMediumMode(nextPlan, timeUntilPlan);
    } else {
      this._enterLongTermMode(nextPlan, timeUntilPlan);
    }
  }

  _enterIdleMode() {
    this.state.mode = 'idle';
    this._clearAllTimers();

    this.checkInterval = this._timer.setInterval(() => {
      if (this.planQueue.size() > 0) {
        this._timer.clearInterval(this.checkInterval);
        this.checkInterval = null;
        this._startSmartScheduling();
      }
    }, IDLE_CHECK_INTERVAL);
  }

  _enterPreciseMode(plan, delay) {
    this.state.mode = 'precise';
    this._clearAllTimers();

    const adjustedDelay = Math.max(0, delay - SAFETY_THRESHOLD);

    this.currentTimer = this._timer.setTimeout(() => {
      this._finalCountdown(plan);
    }, adjustedDelay);

    this.state.nextCheckTime = this._now() + adjustedDelay;
  }

  _enterMediumMode(plan, timeUntilPlan) {
    this.state.mode = 'medium';
    this._clearAllTimers();

    const checkIntervalValue = calculateMediumCheckInterval(timeUntilPlan);

    this.checkInterval = this._timer.setInterval(() => {
      const remaining = new Date(plan.scheduledTime) - this._now();

      if (remaining <= SCHEDULE_STRATEGY.PRECISE.threshold) {
        this._timer.clearInterval(this.checkInterval);
        this.checkInterval = null;
        this._enterPreciseMode(plan, remaining);
      }
    }, checkIntervalValue);

    this.state.nextCheckTime = this._now() + checkIntervalValue;
  }

  _enterLongTermMode(plan, timeUntilPlan) {
    this.state.mode = 'long_term';
    this._clearAllTimers();

    const firstCheckDelay = timeUntilPlan - SCHEDULE_STRATEGY.MEDIUM.threshold;

    this.currentTimer = this._timer.setTimeout(() => {
      const remaining = new Date(plan.scheduledTime) - this._now();
      this._enterMediumMode(plan, remaining);
    }, firstCheckDelay);

    this.checkInterval = this._timer.setInterval(() => {
      this._refreshSchedule();
    }, LONG_TERM_REFRESH_INTERVAL);

    this.state.nextCheckTime = this._now() + firstCheckDelay;
  }

  _finalCountdown(plan) {
    const now = this._now();
    const planTime = new Date(plan.scheduledTime).getTime();
    const remaining = planTime - now;

    if (remaining <= 0) {
      this._executePlan(plan);
    } else if (remaining <= SAFETY_THRESHOLD) {
      this._timer.setImmediate(() => this._finalCountdown(plan));
    } else {
      this.currentTimer = this._timer.setTimeout(() => {
        this._finalCountdown(plan);
      }, remaining);
    }
  }

  async _executePlan(plan) {
    if (this.isExecuting) return;

    this.isExecuting = true;

    try {
      this.planQueue.dequeue();
      this.state.activePlanCount = this.planQueue.size();

      await this.scheduledPlanService.updateScheduledPlan({
        id: plan.id,
        status: 'running',
        lastRun: new Date(this._now()).toISOString(),
      });

      this._notifier.send(IPC_CHANNELS.SCHEDULED_TEST_START, {
        planId: plan.id,
        planName: plan.name,
        testPlans: plan.testPlans,
        scheduledTime: plan.scheduledTime,
        executionTime: new Date(this._now()).toLocaleString(),
      });
    } catch (error) {
      this._logger.error('执行定时计划失败:', error);
      // RFC §1.3: 保留 bug (status='completed' 而非 'failed'), 零行为变化
      await this.scheduledPlanService.updateScheduledPlan({
        id: plan.id,
        status: 'completed',
        lastRun: new Date(this._now()).toISOString(),
      });
    } finally {
      this.isExecuting = false;
      await this._startSmartScheduling();
    }
  }

  _setupFileWatcher() {
    try {
      const plansPath = this.scheduledPlanService.scheduledPlansPath;
      this.fileWatcher = this._watcherFactory(plansPath, (eventType) => {
        if (eventType === 'change') {
          this._handlePlansFileChange();
        }
      });
    } catch (error) {
      this._logger.error('设置文件监听失败:', error);
    }
  }

  async _handlePlansFileChange() {
    this.planQueue = this._queueFactory();
    await this._loadPlansToQueue();
    await this._refreshSchedule();
  }

  async _refreshSchedule() {
    this._clearAllTimers();
    await this._startSmartScheduling();
  }

  addPlan(plan) {
    this.planQueue.enqueue(plan);
    this.state.activePlanCount = this.planQueue.size();

    const nextPlan = this.planQueue.peek();
    if (nextPlan && nextPlan.id === plan.id) {
      this._refreshSchedule();
    }
  }

  removePlan(planId) {
    const nextPlan = this.planQueue.peek();
    this.planQueue.remove(planId);
    this.state.activePlanCount = this.planQueue.size();

    if (nextPlan && nextPlan.id === planId) {
      this._refreshSchedule();
    }
  }

  async updatePlan(planId, updates) {
    this.removePlan(planId);

    if (updates.status === 'pending') {
      try {
        const plans = await this.scheduledPlanService.getScheduledPlans();
        const originalPlan = plans.find((p) => p.id === planId);
        if (originalPlan) {
          const updatedPlan = { ...originalPlan, ...updates };
          this.addPlan(updatedPlan);
        }
      } catch (error) {
        this._logger.error('更新调度计划失败:', error);
      }
    }
  }

  async _markAsExpired(plan) {
    await this.scheduledPlanService.updateScheduledPlan({
      id: plan.id,
      status: 'expired',
    });

    this._notifier.send(IPC_CHANNELS.SCHEDULED_PLAN_EXPIRED, {
      planId: plan.id,
      planName: plan.name,
    });
  }

  _clearAllTimers() {
    if (this.currentTimer) {
      this._timer.clearTimeout(this.currentTimer);
      this.currentTimer = null;
    }
    if (this.checkInterval) {
      this._timer.clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  destroy() {
    this._clearAllTimers();
    if (this.fileWatcher) {
      this.fileWatcher.close();
      this.fileWatcher = null;
    }
  }

  getStatus() {
    return {
      ...this.state,
      nextPlan: this.planQueue.peek(),
      queueSize: this.planQueue.size(),
    };
  }
}

module.exports = { SmartScheduler };

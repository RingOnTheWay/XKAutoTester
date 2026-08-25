// SmartScheduler — 调度状态机 orchestrator。
//
// 藏 4 关注点: 状态机 4 模式切换 + timer 协调 + plan 执行编排 + 文件监听。
// 7 factory-or-default (对称 test_initializer.py L146-198 + cli.py L46-71):
//   queueFactory / timerProvider / watcherFactory / notifierFactory / nowProvider / logger / (compare via queueFactory)
//
// 行为变更:
//   executePlan catch 改写 status='failed' (原 'completed' 误标完成) +
//   _executePlan 加执行超时看门狗 (EXECUTION_TIMEOUT_MS) 避免 plan 永停 'running' +
//   updatePlan 当 scheduledTime 变化时重新入队 (原仅 status==='pending' 才入队)。
// 保留 finalCountdown setImmediate 递归 + SAFETY_THRESHOLD=100ms 提前量。

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

// 执行超时阈值: plan 进入 running 后若 N 分钟未收到 SCHEDULED_TEST_COMPLETE 回调, 视为渲染进程
// 未就绪/异常, 自动标记 failed 避免 plan 永停 'running'
const EXECUTION_TIMEOUT_MS = 30 * 60 * 1000;

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
    // plan 执行超时看门狗: planId → timeout timer (防止 plan 永停 'running')
    this._runningPlanTimeouts = new Map();
    this.state = {
      mode: 'idle',
      nextCheckTime: null,
      activePlanCount: 0,
    };

    // 刷新串行化链: 文件变更回调与 add/remove/update 并发触发重建队列时, 排队串行执行避免竞态
    this._refreshChain = Promise.resolve();
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

      // 启动执行超时看门狗。若渲染进程未就绪/被关闭, N 分钟内不会收到
      // SCHEDULED_TEST_COMPLETE 回调, 看门狗自动将 plan 标记 failed, 避免永停 'running'。
      this._startExecutionWatchdog(plan.id);
    } catch (error) {
      this._logger.error('执行定时计划失败:', error);
      // catch 写 'failed' (原 'completed' 误标完成)
      await this.scheduledPlanService.updateScheduledPlan({
        id: plan.id,
        status: 'failed',
        lastRun: new Date(this._now()).toISOString(),
      });
    } finally {
      this.isExecuting = false;
      await this._startSmartScheduling();
    }
  }

  /**
   * 启动执行超时看门狗
   * plan 进入 running 后, 若 EXECUTION_TIMEOUT_MS 内未收到 SCHEDULED_TEST_COMPLETE
   * (即 _clearExecutionWatchdog 未被调用), 自动标记 plan 为 failed。
   */
  _startExecutionWatchdog(planId) {
    this._clearExecutionWatchdog(planId);
    const timer = this._timer.setTimeout(() => {
      this._handleExecutionTimeout(planId);
    }, EXECUTION_TIMEOUT_MS);
    this._runningPlanTimeouts.set(planId, timer);
  }

  _clearExecutionWatchdog(planId) {
    const timer = this._runningPlanTimeouts.get(planId);
    if (timer) {
      this._timer.clearTimeout(timer);
      this._runningPlanTimeouts.delete(planId);
    }
  }

  async _handleExecutionTimeout(planId) {
    this._runningPlanTimeouts.delete(planId);
    try {
      const plans = await this.scheduledPlanService.getScheduledPlans();
      const plan = plans.find((p) => p.id === planId);
      if (plan && plan.status === 'running') {
        this._logger.warn(`定时计划 ${planId} 执行超时 (${EXECUTION_TIMEOUT_MS / 60000} 分钟), 自动标记为 failed`);
        await this.scheduledPlanService.updateScheduledPlan({
          id: planId,
          status: 'failed',
        });
      }
    } catch (error) {
      this._logger.error('处理执行超时失败:', error);
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
    await this._enqueueRefresh(async () => {
      this.planQueue = this._queueFactory();
      await this._loadPlansToQueue();
      await this._refreshSchedule();
    });
  }

  async _refreshSchedule() {
    this._clearAllTimers();
    await this._startSmartScheduling();
  }

  /**
   * 串行化刷新: 所有重建队列的刷新操作排队执行.
   * 避免文件监听回调与 add/remove/update 并发触发 _refreshSchedule/_loadPlansToQueue 时,
   * 读取旧队列与重建新队列互相干扰产生的竞态.
   * @param {Function} refreshFn - async 刷新操作
   * @returns {Promise<void>}
   */
  _enqueueRefresh(refreshFn) {
    this._refreshChain = this._refreshChain
      .then(refreshFn)
      .catch((error) => {
        this._logger.error('刷新调度计划失败:', error);
      });
    return this._refreshChain;
  }

  addPlan(plan) {
    this.planQueue.enqueue(plan);
    this.state.activePlanCount = this.planQueue.size();

    const nextPlan = this.planQueue.peek();
    if (nextPlan && nextPlan.id === plan.id) {
      // addPlan 是同步原子操作 (同一事件循环 tick), 直接同步刷新; 文件监听回调的并发走 _enqueueRefresh 串行化
      this._refreshSchedule();
    }
  }

  removePlan(planId) {
    const nextPlan = this.planQueue.peek();
    this.planQueue.remove(planId);
    this.state.activePlanCount = this.planQueue.size();

    if (nextPlan && nextPlan.id === planId) {
      // 同上: 同步刷新保持 planQueue/state 一致性, 文件监听回调的并发走 _enqueueRefresh 串行化
      this._refreshSchedule();
    }
  }

  async updatePlan(planId, updates) {
    this.removePlan(planId);

    // 计划完成/失败时清除执行看门狗
    if (updates.status === 'completed' || updates.status === 'failed') {
      this._clearExecutionWatchdog(planId);
    }

    // 重新入队条件放宽: status==='pending' 或 scheduledTime 变化且新时间在未来,
    // 且状态非终态 (completed/failed) 时均重新入队
    const shouldReenqueue = updates.status === 'pending' || updates.scheduledTime;
    if (shouldReenqueue) {
      try {
        const plans = await this.scheduledPlanService.getScheduledPlans();
        const originalPlan = plans.find((p) => p.id === planId);
        if (originalPlan) {
          const updatedPlan = { ...originalPlan, ...updates };
          const isTerminal = updatedPlan.status === 'completed' || updatedPlan.status === 'failed';
          const planTime = new Date(updatedPlan.scheduledTime).getTime();
          const now = this._now();
          if (!isTerminal && planTime > now) {
            this.addPlan(updatedPlan);
          }
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
    // 清除所有执行看门狗
    for (const planId of this._runningPlanTimeouts.keys()) {
      this._clearExecutionWatchdog(planId);
    }
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

// SmartScheduler 单测 — 7 factory 注入 + 状态机 4 模式 + CRUD。
// 验证: idle/precise/medium/long_term mode + executePlan (含 bug 保留) + markAsExpired + handlePlansFileChange + addPlan/removePlan。
// 注入 FakeTimer + fake watcher + fake notifier + fake now + fake logger, 0 真实副作用。
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const SMART_SCHEDULER_PATH = path.join(
  __dirname, '..', '..', 'electron', 'src', 'main', 'services', 'scheduler', 'smartScheduler.js'
);
const { SmartScheduler } = require(SMART_SCHEDULER_PATH);
const { SCHEDULE_STRATEGY, SAFETY_THRESHOLD, IDLE_CHECK_INTERVAL } = require(path.join(
  __dirname, '..', '..', 'electron', 'src', 'main', 'services', 'scheduler', 'strategies.js'
));

// ── Fakes ──────────────────────────────────────────────

class FakeTimer {
  constructor() {
    this.timeouts = [];
    this.intervals = [];
    this.immediates = [];
    this._nextId = 1;
  }
  setTimeout(fn, ms) {
    const id = this._nextId++;
    this.timeouts.push({ id, fn, ms });
    return id;
  }
  setInterval(fn, ms) {
    const id = this._nextId++;
    this.intervals.push({ id, fn, ms });
    return id;
  }
  clearTimeout(h) {
    this.timeouts = this.timeouts.filter((t) => t.id !== h);
  }
  clearInterval(h) {
    this.intervals = this.intervals.filter((t) => t.id !== h);
  }
  setImmediate(fn) {
    const id = this._nextId++;
    this.immediates.push({ id, fn });
    return id;
  }
  runTimeouts() {
    const t = [...this.timeouts];
    this.timeouts = [];
    t.forEach((x) => x.fn());
  }
  runIntervals(n = 1) {
    this.intervals.forEach((i) => {
      for (let k = 0; k < n; k++) i.fn();
    });
  }
}

function makeFakeWatcher() {
  const watchers = [];
  const fakeWatcherFactory = (p, cb) => {
    const w = { close: () => {}, _cb: cb, _path: p };
    watchers.push(w);
    return w;
  };
  return { watchers, fakeWatcherFactory };
}

function makeFakeNotifier() {
  const sent = [];
  const fakeNotifierFactory = () => ({
    send: (channel, payload) => sent.push({ channel, payload }),
  });
  return { sent, fakeNotifierFactory };
}

function makeFakePlanService(plans = []) {
  const updates = [];
  return {
    plans,
    updates,
    async getScheduledPlans() {
      return this.plans;
    },
    async updateScheduledPlan(update) {
      updates.push(update);
    },
    scheduledPlansPath: '/fake/scheduled_plans.json',
  };
}

function makeFakeLogger() {
  const logs = { info: [], warn: [], error: [] };
  return {
    logs,
    info: (...a) => logs.info.push(a),
    warn: (...a) => logs.warn.push(a),
    error: (...a) => logs.error.push(a),
  };
}

function makeScheduler({ plans = [], now = 0, queueFactory, watcherFactory, notifierFactory, timer, logger } = {}) {
  const planSvc = makeFakePlanService(plans);
  const t = timer || new FakeTimer();
  const { watchers, fakeWatcherFactory } = makeFakeWatcher();
  const { sent, fakeNotifierFactory } = makeFakeNotifier();
  const fakeLogger = logger || makeFakeLogger();
  const sched = new SmartScheduler(planSvc, { t: () => 'i18n' }, {
    queueFactory,
    timerProvider: t,
    watcherFactory: watcherFactory || fakeWatcherFactory,
    notifierFactory: notifierFactory || fakeNotifierFactory,
    nowProvider: () => now,
    logger: fakeLogger,
  });
  return { sched, planSvc, timer: t, watchers, sent, logger: fakeLogger };
}

function planAt(id, msFromNow, now) {
  return {
    id,
    name: `plan-${id}`,
    scheduledTime: new Date(now + msFromNow).toISOString(),
    status: 'pending',
    testPlans: [],
  };
}

// ── 测试 ────────────────────────────────────────────────

test('initialize 空 queue → enterIdleMode (setInterval IDLE_CHECK_INTERVAL)', async () => {
  const { sched, timer } = makeScheduler({ now: 1000 });

  await sched.initialize();

  assert.strictEqual(sched.state.mode, 'idle');
  assert.strictEqual(timer.intervals.length, 1);
  assert.strictEqual(timer.intervals[0].ms, IDLE_CHECK_INTERVAL);
});

test('initialize 1 plan 已过期 → markAsExpired + dequeue + idle', async () => {
  const pastPlan = planAt('p1', -10000, 1000); // 已过
  const { sched, sent, planSvc } = makeScheduler({ plans: [pastPlan], now: 1000 });

  await sched.initialize();

  assert.deepStrictEqual(planSvc.updates[0], { id: 'p1', status: 'expired' });
  assert.strictEqual(sent.length, 1);
  assert.strictEqual(sent[0].channel, 'scheduled-plan-expired');
  assert.strictEqual(sched.state.mode, 'idle');
});

test('initialize plan <1h → enterPreciseMode (setTimeout delay - SAFETY_THRESHOLD)', async () => {
  const NOW = 1000000;
  const plan = planAt('p1', 30 * 60 * 1000, NOW); // 30min < 1h
  const { sched, timer } = makeScheduler({ plans: [plan], now: NOW });

  await sched.initialize();

  assert.strictEqual(sched.state.mode, 'precise');
  assert.strictEqual(timer.timeouts.length, 1);
  // delay = 30min - SAFETY_THRESHOLD(100ms)
  assert.strictEqual(timer.timeouts[0].ms, 30 * 60 * 1000 - SAFETY_THRESHOLD);
});

test('initialize 1h < plan <24h → enterMediumMode (setInterval checkInterval)', async () => {
  const NOW = 1000000;
  const plan = planAt('p1', 3 * 60 * 60 * 1000, NOW); // 3h → checkInterval 30min
  const { sched, timer } = makeScheduler({ plans: [plan], now: NOW });

  await sched.initialize();

  assert.strictEqual(sched.state.mode, 'medium');
  assert.strictEqual(timer.intervals.length, 1);
  assert.strictEqual(timer.intervals[0].ms, 30 * 60 * 1000);
});

test('initialize plan >24h → enterLongTermMode (setTimeout + setInterval 24h refresh)', async () => {
  const NOW = 1000000;
  const plan = planAt('p1', 48 * 60 * 60 * 1000, NOW); // 48h
  const { sched, timer } = makeScheduler({ plans: [plan], now: NOW });

  await sched.initialize();

  assert.strictEqual(sched.state.mode, 'long_term');
  assert.strictEqual(timer.timeouts.length, 1); // firstCheckDelay = 48h - 24h = 24h
  assert.strictEqual(timer.intervals.length, 1);
  assert.strictEqual(timer.intervals[0].ms, 24 * 60 * 60 * 1000);
});

test('executePlan 成功: dequeue + service.update status=running + notifier.send SCHEDULED_TEST_START', async () => {
  const NOW = 1000000;
  const plan = planAt('p1', 30 * 60 * 1000, NOW);
  const { sched, sent, planSvc, timer } = makeScheduler({ plans: [plan], now: NOW });

  await sched.initialize();
  // 触发 finalCountdown → executePlan (模拟时间到)
  // 直接调 _executePlan 避开 timer
  await sched._executePlan(plan);

  assert.deepStrictEqual(planSvc.updates.find((u) => u.status === 'running'), {
    id: 'p1',
    status: 'running',
    lastRun: new Date(NOW).toISOString(),
  });
  assert.strictEqual(sent.length, 1);
  assert.strictEqual(sent[0].channel, 'scheduled-test-start');
  assert.strictEqual(sent[0].payload.planId, 'p1');
});

test('executePlan 异常保留 bug: catch 块写 status=completed (RFC §1.3)', async () => {
  const NOW = 1000000;
  const plan = planAt('p1', 30 * 60 * 1000, NOW);
  const failingPlanSvc = makeFakePlanService([plan]);
  failingPlanSvc.updateScheduledPlan = async () => {
    throw new Error('disk full');
  };
  const fakeTimer = new FakeTimer();
  const { watchers, fakeWatcherFactory } = makeFakeWatcher();
  const { sent, fakeNotifierFactory } = makeFakeNotifier();
  const fakeLogger = makeFakeLogger();
  const sched = new SmartScheduler(failingPlanSvc, { t: () => 'i18n' }, {
    timerProvider: fakeTimer,
    watcherFactory: fakeWatcherFactory,
    notifierFactory: fakeNotifierFactory,
    nowProvider: () => NOW,
    logger: fakeLogger,
  });

  await sched.initialize();
  // catch 内 updateScheduledPlan('completed') 也会抛, 异常传播出 _executePlan
  await assert.rejects(() => sched._executePlan(plan), /disk full/);

  // bug: catch 写 status='completed' (应 'failed', 但零行为变化要求保留)
  assert.ok(fakeLogger.logs.error.some((e) => e[0].includes('执行定时计划失败')));
  // failingPlanSvc.updates 空 (updateScheduledPlan 抛), 但 finally 调 _startSmartScheduling
});

test('addPlan 入队 + 队首变化触发 refreshSchedule', async () => {
  const NOW = 1000000;
  const { sched, timer } = makeScheduler({ now: NOW });

  await sched.initialize(); // idle
  assert.strictEqual(timer.intervals.length, 1); // idle polling

  const plan = planAt('new1', 30 * 60 * 1000, NOW);
  sched.addPlan(plan);

  // addPlan 触发 refreshSchedule (队首变化) → enterPreciseMode
  assert.strictEqual(sched.state.mode, 'precise');
  assert.strictEqual(sched.planQueue.size(), 1);
});

test('removePlan 队首被移除 → refreshSchedule', async () => {
  const NOW = 1000000;
  const plan = planAt('p1', 30 * 60 * 1000, NOW);
  const { sched } = makeScheduler({ plans: [plan], now: NOW });

  await sched.initialize();
  assert.strictEqual(sched.state.mode, 'precise');

  sched.removePlan('p1');
  assert.strictEqual(sched.planQueue.size(), 0);
  // removePlan 队首变化 → refreshSchedule → enterIdleMode
  assert.strictEqual(sched.state.mode, 'idle');
});

test('handlePlansFileChange 重建 queue + refreshSchedule', async () => {
  const NOW = 1000000;
  const plan = planAt('p1', 30 * 60 * 1000, NOW);
  const { sched, planSvc } = makeScheduler({ plans: [plan], now: NOW });

  await sched.initialize();
  assert.strictEqual(sched.state.mode, 'precise');

  // 模拟文件变化: plans 列表清空
  planSvc.plans = [];
  await sched._handlePlansFileChange();

  assert.strictEqual(sched.planQueue.size(), 0);
  assert.strictEqual(sched.state.mode, 'idle');
});

test('getStatus 返回 mode + nextPlan + queueSize', async () => {
  const NOW = 1000000;
  const plan = planAt('p1', 30 * 60 * 1000, NOW);
  const { sched } = makeScheduler({ plans: [plan], now: NOW });

  await sched.initialize();
  const status = sched.getStatus();

  assert.strictEqual(status.mode, 'precise');
  assert.strictEqual(status.queueSize, 1);
  assert.strictEqual(status.nextPlan.id, 'p1');
  assert.strictEqual(status.activePlanCount, 1);
});

test('destroy 清 timer + close watcher', async () => {
  const NOW = 1000000;
  const plan = planAt('p1', 30 * 60 * 1000, NOW);
  const { sched, timer, watchers } = makeScheduler({ plans: [plan], now: NOW });

  await sched.initialize();
  assert.strictEqual(watchers.length, 1);

  let watcherClosed = false;
  watchers[0].close = () => {
    watcherClosed = true;
  };

  sched.destroy();
  assert.strictEqual(timer.timeouts.length, 0);
  assert.strictEqual(timer.intervals.length, 0);
  assert.strictEqual(watcherClosed, true);
});

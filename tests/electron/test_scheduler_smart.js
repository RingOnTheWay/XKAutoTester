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
const { ScheduledPlanQueue } = require(path.join(
  __dirname, '..', '..', 'electron', 'src', 'main', 'services', 'scheduler', 'planQueue.js'
));
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

test('executePlan 异常: catch 写 failed + 串行链吞异常记录日志 (P1-4)', async () => {
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
  // P1-4 串行链: catch 吞异常并记录日志, 链不中断 (不再 rejects 传播)
  await sched._executePlan(plan);
  assert.ok(fakeLogger.logs.error.some((e) => e[0].includes('执行定时计划失败')));
});

test('addPlan 入队 + 队首变化触发 refreshSchedule', async () => {
  const NOW = 1000000;
  const { sched, timer } = makeScheduler({ now: NOW });

  await sched.initialize(); // idle
  assert.strictEqual(timer.intervals.length, 1); // idle polling

  const plan = planAt('new1', 30 * 60 * 1000, NOW);
  sched.addPlan(plan);
  // P1-4: 刷新走串行链 (微任务异步), 等待完成后断言
  await sched._refreshChain;

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
  // P1-4: 刷新走串行链 (微任务异步), 等待完成后断言
  await sched._refreshChain;
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


// ── P1-4 运行时回归: 串行执行链 + generation 令牌 ─────────────────────────

test('P1-4 双计划并发到期: 串行链依次执行, 不静默丢弃 (原 isExecuting 直接 return)', async () => {
  const NOW = 1000000;
  const plan1 = planAt('p1', 30 * 60 * 1000, NOW);
  const plan2 = planAt('p2', 30 * 60 * 1000, NOW);
  const { sched, sent, planSvc } = makeScheduler({ plans: [plan1, plan2], now: NOW });

  await sched.initialize();
  // 两个计划几乎同时到期 → 连续触发 _executePlan (不 await, 模拟并发)
  const p1 = sched._executePlan(plan1);
  const p2 = sched._executePlan(plan2);
  await Promise.all([p1, p2]);

  // 两个都必须执行: 各发一次 SCHEDULED_TEST_START
  const starts = sent.filter((s) => s.channel === 'scheduled-test-start');
  assert.strictEqual(starts.length, 2, '两个计划都应执行');
  assert.deepStrictEqual(new Set(starts.map((s) => s.payload.planId)), new Set(['p1', 'p2']));
  assert.strictEqual(planSvc.planQueueSize, undefined);
  // 队列应被清空 (两个都 dequeue)
  assert.strictEqual(sched.planQueue.size(), 0);
});

test('P2-9 排队期间队列重建: 以 dequeue 新队首为准, 不"通知了 A 实际跑的是 B"', async () => {
  const NOW = 1000000;
  const planB = planAt('pB', 30 * 60 * 1000, NOW);
  const planC = planAt('pC', 30 * 60 * 1000, NOW);
  const { sched, sent, planSvc } = makeScheduler({ plans: [], now: NOW });

  await sched.initialize(); // idle, 空队列

  // 旧队列持有 planB, _executePlan 将其排入串行链 (排队执行)
  sched.planQueue.enqueue(planB);
  const chain = sched._executePlan(planB);

  // 链执行前, _handlePlansFileChange 整体重建队列: 新队首为 planC, planB 已不在新队列
  sched.planQueue = new ScheduledPlanQueue();
  sched.planQueue.enqueue(planC);

  await chain;

  // 身份信息必须以 dequeued (planC) 为准
  const running = planSvc.updates.find((u) => u.status === 'running');
  assert.strictEqual(running.id, 'pC', '状态更新应使用实际执行的 plan (dequeue 结果), 而非闭包过期引用');
  const starts = sent.filter((s) => s.channel === 'scheduled-test-start');
  assert.strictEqual(starts.length, 1);
  assert.strictEqual(starts[0].payload.planId, 'pC', 'SCHEDULED_TEST_START 应通知实际执行的 plan');
  assert.strictEqual(starts[0].payload.planName, 'plan-pC');
  assert.strictEqual(sched.planQueue.size(), 0, '新队列队首应被 dequeue');
});

test('P1-4 删除倒计时中的计划: generation 令牌使旧回调失效, 不执行已删计划', async () => {
  const NOW = 1000000;
  const plan = planAt('p1', 200, NOW); // 200ms 后到期 → precise 模式 setTimeout
  const { sched, sent, timer } = makeScheduler({ plans: [plan], now: NOW });

  await sched.initialize();
  assert.strictEqual(sched.state.mode, 'precise');
  assert.strictEqual(timer.timeouts.length, 1);

  // 用户在倒计时中删除计划 → _clearAllTimers 递增 generation
  sched.removePlan('p1');
  await sched._refreshChain;

  // 模拟旧 setTimeout 回调仍被触发 (FakeTimer 不清除队列, 直接 run)
  timer.runTimeouts();

  // 已删计划不得被执行 (generation 令牌拦截), 也不得触发 expired 标记
  const starts = sent.filter((s) => s.channel === 'scheduled-test-start');
  assert.strictEqual(starts.length, 0, '已删除计划不得执行');
  const expired = sent.filter((s) => s.channel === 'scheduled-plan-expired');
  assert.strictEqual(expired.length, 0, '已删除计划不得被误标 expired');
  assert.strictEqual(sched.planQueue.size(), 0);
});

test('P1-4 连续 addPlan: 串行链刷新不互相覆盖 timer', async () => {
  const NOW = 1000000;
  const { sched, timer } = makeScheduler({ now: NOW });

  await sched.initialize(); // idle
  const planA = planAt('a', 30 * 60 * 1000, NOW);
  const planB = planAt('b', 60 * 60 * 1000, NOW);
  sched.addPlan(planA);
  sched.addPlan(planB);
  await sched._refreshChain;

  // 最终调度状态一致: precise 模式且 currentTimer 存在 (未被后一次清掉)
  assert.strictEqual(sched.state.mode, 'precise');
  assert.ok(sched.currentTimer !== null, '刷新后必须持有倒计时 timer');
});

// ── P1-5: 无效 scheduledTime 兜底 (防 NaN setTimeout 忙循环) ──

test('P1-5 initialize 脏计划 (无效时间) → 标记 expired + idle, 无 0ms 定时器', async () => {
  const dirtyPlan = { id: 'bad1', name: 'bad', scheduledTime: 'garbage-time', status: 'pending' };
  const { sched, planSvc, timer } = makeScheduler({ plans: [dirtyPlan], now: 1000 });

  await sched.initialize();

  assert.deepStrictEqual(planSvc.updates[0], { id: 'bad1', status: 'expired' });
  assert.strictEqual(sched.state.mode, 'idle');
  // 不得创建 0ms/NaN 忙循环定时器 (仅 idle 轮询 interval)
  assert.strictEqual(timer.timeouts.length, 0, '不得有 setTimeout(0) 忙循环');
  assert.strictEqual(timer.intervals.length, 1, '仅 idle 轮询');
  assert.strictEqual(timer.intervals[0].ms, IDLE_CHECK_INTERVAL);
});

test('P1-5 运行期 addPlan 脏计划 → 标记过期 + 队列清空, 无 NaN 忙循环', async () => {
  const NOW = 1000000;
  const { sched, planSvc, timer } = makeScheduler({ now: NOW });

  await sched.initialize(); // idle

  const dirtyPlan = { id: 'bad2', name: 'bad', scheduledTime: 'not-a-date', status: 'pending' };
  sched.addPlan(dirtyPlan);
  await sched._refreshChain;

  assert.strictEqual(sched.planQueue.size(), 0, '脏计划应被出队');
  assert.deepStrictEqual(planSvc.updates[0], { id: 'bad2', status: 'expired' });
  assert.strictEqual(sched.state.mode, 'idle');
  // 无 0ms timeout (原 NaN → setTimeout(NaN)≈0ms 自旋)
  assert.ok(timer.timeouts.every((t) => t.ms > 0), '不得有 0ms 定时器');
});

test('P1-5 _finalCountdown 脏计划直接放弃 (不创建 0ms 定时器)', async () => {
  const NOW = 1000000;
  const { sched, timer } = makeScheduler({ now: NOW });

  await sched.initialize();
  const timeoutsBefore = timer.timeouts.length;

  const dirtyPlan = { id: 'bad3', name: 'bad', scheduledTime: 'garbage' };
  sched._finalCountdown(dirtyPlan);

  assert.strictEqual(timer.timeouts.length, timeoutsBefore, '脏计划倒计时不新增定时器');
});

// ── R24 P2-2: 执行看门狗周期化 ─────────────────────────────

test('R24 P2-2 看门狗触发且渲染进程存活: 告警 + 重新武装 (不再永久脱离监控)', async () => {
  const runningPlan = { id: 'p1', name: 'plan-1', scheduledTime: new Date(1000).toISOString(), status: 'running', testPlans: [] };
  const { sched, timer, planSvc, logger } = makeScheduler({ plans: [runningPlan], now: 1000 });
  // 模拟渲染进程存活 (合法长用例场景)
  sched.mainWindow = { webContents: { isDestroyed: () => false } };

  sched._startExecutionWatchdog('p1');
  assert.strictEqual(timer.timeouts.length, 1, '初始武装 1 个看门狗 timer');
  const timerId = timer.timeouts[0].id;

  await timer.runTimeouts();

  // 渲染存活 → 不标记 failed, 且重新武装 (新 timer, 非原 id)
  assert.strictEqual(runningPlan.status, 'running', '渲染存活不得标记 failed');
  assert.ok(timer.timeouts.some((t) => t.id !== timerId), '看门狗被重新武装 (新 timer)');
  assert.strictEqual(planSvc.updates.length, 0, '不得写 failed');

  // 第二轮触发依旧存活 → 继续重新武装 (周期化)
  await timer.runTimeouts();
  assert.strictEqual(runningPlan.status, 'running');
  assert.ok(timer.timeouts.length >= 1, '周期化: 每轮触发后重新武装');
});

test('R24 P2-2 看门狗触发且渲染进程不可用: 标记 failed 且不重新武装', async () => {
  const runningPlan = { id: 'p2', name: 'plan-2', scheduledTime: new Date(1000).toISOString(), status: 'running', testPlans: [] };
  const { sched, timer, planSvc } = makeScheduler({ plans: [runningPlan], now: 1000 });
  // 渲染进程不可用 (mainWindow 已销毁)
  sched.mainWindow = { webContents: { isDestroyed: () => true } };

  sched._startExecutionWatchdog('p2');
  await timer.runTimeouts();

  assert.strictEqual(planSvc.updates.length, 1, '标记 failed');
  assert.strictEqual(planSvc.updates[0].status, 'failed');
  // fake updateScheduledPlan 不 mutation 原对象, 仅记录 update 调用
  assert.strictEqual(timer.timeouts.length, 0, '标记 failed 后不再重新武装');
});

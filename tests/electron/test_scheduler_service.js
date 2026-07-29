// SchedulerService facade 单测 — 公共 API delegate + 生命周期 + lazy createScheduler。
// 验证: init/start/stop + setMainWindow/getStatus/addPlan/removePlan/updatePlan + scheduler null 守卫。
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const SCHED_SERVICE_PATH = path.join(
  __dirname, '..', '..', 'electron', 'src', 'main', 'services', 'scheduler', 'SchedulerService.js'
);
const { SchedulerService } = require(SCHED_SERVICE_PATH);

function makeFakePlanService(plans = []) {
  return {
    plans,
    updates: [],
    async getScheduledPlans() {
      return plans;
    },
    async updateScheduledPlan(u) {
      this.updates.push(u);
    },
    scheduledPlansPath: '/fake/scheduled_plans.json',
  };
}

const i18nFake = { t: (k) => k };

test('init 设置 i18n + planSvc, scheduler 仍 null', () => {
  const svc = new SchedulerService();
  const planSvc = makeFakePlanService();

  svc.init(i18nFake, planSvc);

  assert.strictEqual(svc.i18nService, i18nFake);
  assert.strictEqual(svc.scheduledPlanService, planSvc);
  assert.strictEqual(svc.scheduler, null);
});

test('start lazy createScheduler + initialize', async () => {
  const svc = new SchedulerService();
  const planSvc = makeFakePlanService();
  svc.init(i18nFake, planSvc);

  await svc.start();

  assert.ok(svc.scheduler);
  assert.strictEqual(svc.scheduler.state.mode, 'idle'); // 空 queue
});

test('stop destroy scheduler + 置 null', async () => {
  const svc = new SchedulerService();
  const planSvc = makeFakePlanService();
  svc.init(i18nFake, planSvc);
  await svc.start();

  svc.stop();
  assert.strictEqual(svc.scheduler, null);
});

test('未 start 调 stop/getStatus/addPlan/removePlan/updatePlan/setMainWindow 不抛', () => {
  const svc = new SchedulerService();
  svc.stop();
  assert.strictEqual(svc.getStatus(), null);
  assert.doesNotThrow(() => svc.addPlan({ id: 'x' }));
  assert.doesNotThrow(() => svc.removePlan('x'));
  assert.doesNotThrow(() => svc.updatePlan('x', {}));
  assert.doesNotThrow(() => svc.setMainWindow(null));
});

test('addPlan/removePlan/updatePlan/getStatus/setMainWindow delegate scheduler', async () => {
  const svc = new SchedulerService();
  const planSvc = makeFakePlanService();
  svc.init(i18nFake, planSvc);
  await svc.start();

  // mock scheduler 方法
  let addCalled = false;
  let removeCalled = false;
  let updateCalled = false;
  let windowSet = null;
  svc.scheduler.addPlan = (p) => {
    addCalled = true;
  };
  svc.scheduler.removePlan = (id) => {
    removeCalled = true;
  };
  svc.scheduler.updatePlan = async (id, u) => {
    updateCalled = true;
  };
  svc.scheduler.setMainWindow = (w) => {
    windowSet = w;
  };
  svc.scheduler.getStatus = () => ({ mode: 'fake', queueSize: 99 });

  svc.addPlan({ id: 'p1' });
  svc.removePlan('p1');
  await svc.updatePlan('p1', { status: 'completed' });
  svc.setMainWindow({ id: 'win1' });
  const status = svc.getStatus();

  assert.ok(addCalled);
  assert.ok(removeCalled);
  assert.ok(updateCalled);
  assert.deepStrictEqual(windowSet, { id: 'win1' });
  assert.deepStrictEqual(status, { mode: 'fake', queueSize: 99 });
});

test('start 已有 scheduler 时不重新 create', async () => {
  const svc = new SchedulerService();
  const planSvc = makeFakePlanService();
  svc.init(i18nFake, planSvc);
  await svc.start();
  const original = svc.scheduler;

  await svc.start(); // 第二次
  assert.strictEqual(svc.scheduler, original);
});

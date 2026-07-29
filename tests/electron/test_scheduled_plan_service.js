// ScheduledPlanService 单测 — 3 factory (经 base) + 2 日期纯函数 + 5 公共方法。
// 验证: constructor 透传 base + formatDateToMinute + isSameMinutePlan + getScheduledPlans +
//      saveScheduledPlan (新建/已有 id) + updateScheduledPlan (找到/未找到) +
//      deleteScheduledPlan + checkTimeConflict (excludeId/cancelled/同分钟)。
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const SERVICE_PATH = path.join(
  __dirname, '..', '..', 'electron', 'src', 'main', 'services', 'ScheduledPlanService.js'
);
const { ScheduledPlanService, formatDateToMinute, isSameMinutePlan } = require(SERVICE_PATH);

// ── Fakes ──────────────────────────────────────────────

function makeFakeAsyncFs(opts = {}) {
  let storedData = opts.initialData !== undefined ? opts.initialData : [];
  const calls = { exists: [], readJson: [], writeJson: [], ensureDir: [] };
  return {
    calls,
    storedData,
    exists: async (p) => { calls.exists.push(p); return true; },
    readJson: async (p) => { calls.readJson.push(p); return storedData; },
    writeJson: async (p, data) => { calls.writeJson.push({ p, data }); storedData = data; },
    ensureDir: async (dir) => { calls.ensureDir.push(dir); },
  };
}

function makeFakeLogger() {
  const calls = [];
  return { calls, error: (msg) => calls.push(msg) };
}

function makeService(opts = {}) {
  const asyncFs = makeFakeAsyncFs({ initialData: opts.initialData || [] });
  const logger = makeFakeLogger();
  const svc = new ScheduledPlanService('/cfg', {
    asyncFsFactory: () => asyncFs,
    idGenerator: opts.idGenerator || (() => 'fixed-id-001'),
    loggerFactory: () => logger,
  });
  return { svc, asyncFs, logger };
}

// ── 日期纯函数 ─────────────────────────────────────────

test('formatDateToMinute 返 YYYY-MM-DDTHH:MM 格式', () => {
  const d = new Date(2026, 6, 28, 14, 5, 30);  // 2026-07-28 14:05:30 (local)
  assert.strictEqual(formatDateToMinute(d), '2026-07-28T14:05');
});

test('formatDateToMinute 补 0 (单位数月/日/时/分)', () => {
  const d = new Date(2026, 0, 1, 0, 0);  // 2026-01-01 00:00
  assert.strictEqual(formatDateToMinute(d), '2026-01-01T00:00');
});

test('isSameMinutePlan 同分钟返 true, 不同分钟返 false', () => {
  const t1 = new Date(2026, 6, 28, 14, 5, 30);
  const t2 = new Date(2026, 6, 28, 14, 5, 59);  // 同分钟, 不同秒
  const t3 = new Date(2026, 6, 28, 14, 6, 0);   // 不同分钟

  assert.strictEqual(isSameMinutePlan(t1, t2), true);
  assert.strictEqual(isSameMinutePlan(t1, t3), false);
});

// ── constructor ────────────────────────────────────────

test('constructor 收 opts + 透传 base + loggerFactory 实例建', () => {
  const { svc, asyncFs, logger } = makeService();

  assert.strictEqual(svc.filePath, path.join('/cfg', 'scheduled_plans.json'));
  assert.deepStrictEqual(svc.defaultData, []);
  assert.strictEqual(svc._asyncFs, asyncFs);
  assert.strictEqual(svc._logger, logger);
});

// ── getScheduledPlans ──────────────────────────────────

test('getScheduledPlans 委托 getData', async () => {
  const initial = [{ id: 'p1', name: 'plan1' }];
  const { svc } = makeService({ initialData: initial });

  const result = await svc.getScheduledPlans();

  assert.deepStrictEqual(result, initial);
});

// ── saveScheduledPlan ──────────────────────────────────

test('saveScheduledPlan 新建 (无 id) 调 _generateId + saveData', async () => {
  const { svc, asyncFs } = makeService({ idGenerator: () => 'gen-id-999' });

  const result = await svc.saveScheduledPlan({
    name: 'new plan',
    testPlans: [{ name: 'tp1' }],
    scheduledTime: '2026-07-28T14:00',
  });

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.plan.id, 'gen-id-999');
  assert.strictEqual(result.plan.name, 'new plan');
  assert.strictEqual(result.plan.status, 'pending');
  assert.strictEqual(result.plan.lastRun, null);
  assert.deepStrictEqual(result.plan.testPlanNames, ['tp1']);
  assert.ok(result.plan.created);

  // 验证 saveData 被调用
  assert.strictEqual(asyncFs.calls.writeJson.length, 1);
  const savedData = asyncFs.calls.writeJson[0].data;
  assert.strictEqual(savedData.length, 1);
  assert.strictEqual(savedData[0].id, 'gen-id-999');
});

test('saveScheduledPlan 已有 id 复用 + push + saveData', async () => {
  const { svc, asyncFs } = makeService();

  const result = await svc.saveScheduledPlan({
    id: 'custom-id',
    name: 'with id',
    scheduledTime: '2026-07-28T14:00',
  });

  assert.strictEqual(result.plan.id, 'custom-id');
  assert.strictEqual(asyncFs.calls.writeJson.length, 1);
});

// ── updateScheduledPlan ────────────────────────────────

test('updateScheduledPlan 找到 + spread 合并 + testPlanNames 兜底', async () => {
  const initial = [{
    id: 'p1',
    name: 'old',
    created: '2026-01-01T00:00:00Z',
    testPlanNames: ['old-tp'],
    scheduledTime: '2026-01-01T00:00',
    status: 'pending',
    lastRun: null,
  }];
  const { svc, asyncFs } = makeService({ initialData: initial });

  const result = await svc.updateScheduledPlan({
    id: 'p1',
    name: 'new name',
    testPlans: [{ name: 'new-tp' }],
  });

  assert.strictEqual(result.success, true);
  const saved = asyncFs.calls.writeJson[0].data[0];
  assert.strictEqual(saved.name, 'new name');
  assert.strictEqual(saved.created, '2026-01-01T00:00:00Z');  // 保留原 created
  assert.deepStrictEqual(saved.testPlanNames, ['new-tp']);  // 从 testPlans 推导
});

test('updateScheduledPlan 未找到返 {success:false, error:"未找到指定的定时计划"}', async () => {
  const { svc } = makeService();

  const result = await svc.updateScheduledPlan({ id: 'non-existent', name: 'x' });

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.error, '未找到指定的定时计划');
});

// ── deleteScheduledPlan ────────────────────────────────

test('deleteScheduledPlan 找到 + splice + saveData', async () => {
  const initial = [
    { id: 'p1', name: 'plan1' },
    { id: 'p2', name: 'plan2' },
  ];
  const { svc, asyncFs } = makeService({ initialData: initial });

  const result = await svc.deleteScheduledPlan('p1');

  assert.strictEqual(result.success, true);
  const saved = asyncFs.calls.writeJson[0].data;
  assert.strictEqual(saved.length, 1);
  assert.strictEqual(saved[0].id, 'p2');
});

test('deleteScheduledPlan 未找到返 {success:false, error}', async () => {
  const { svc } = makeService();

  const result = await svc.deleteScheduledPlan('non-existent');

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.error, '未找到指定的定时计划');
});

// ── checkTimeConflict ──────────────────────────────────

test('checkTimeConflict excludeId 跳过 + cancelled 跳过 + 同分钟返 conflictingPlan', async () => {
  const initial = [
    { id: 'p1', name: 'plan1', scheduledTime: '2026-07-28T14:30', status: 'pending' },
    { id: 'p2', name: 'plan2', scheduledTime: '2026-07-28T14:30', status: 'cancelled' },  // cancelled 跳过
    { id: 'p3', name: 'plan3', scheduledTime: '2026-07-28T14:30', status: 'pending' },
  ];
  const { svc } = makeService({ initialData: initial });

  // 与 p1 同分钟, excludeId=p1 → 跳过 p1, 不应跳过 p3
  const result1 = await svc.checkTimeConflict('2026-07-28T14:30:15', 'p1');
  assert.strictEqual(result1.hasConflict, true);
  assert.strictEqual(result1.conflictingPlan.id, 'p3');

  // 与 p1 同分钟, 无 excludeId → 应返 p1
  const result2 = await svc.checkTimeConflict('2026-07-28T14:30:15');
  assert.strictEqual(result2.hasConflict, true);
  assert.strictEqual(result2.conflictingPlan.id, 'p1');

  // 不同分钟
  const result3 = await svc.checkTimeConflict('2026-07-28T15:00');
  assert.strictEqual(result3.hasConflict, false);
});

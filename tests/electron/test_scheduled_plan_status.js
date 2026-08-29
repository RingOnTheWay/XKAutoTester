// scheduledPlanStatus 统一工具测试 (P2-2 收敛后单一实现)
const test = require('node:test');
const assert = require('node:assert');

async function loadModule() {
  if (!global.window) global.window = {};
  global.window.i18n = { t: (key) => `i18n:${key}` };
  const mod = await import('../../electron/renderer/core/utils/scheduledPlanStatus.js');
  return mod.getScheduledPlanStatus;
}

test('P2-2 状态映射: completed/running/cancelled/expired', async () => {
  const get = await loadModule();
  assert.deepStrictEqual(get({ status: 'completed' }), { class: 'completed', text: 'i18n:scheduledPlan.statusCompleted' });
  assert.deepStrictEqual(get({ status: 'running' }), { class: 'running', text: 'i18n:scheduledPlan.statusRunning' });
  assert.deepStrictEqual(get({ status: 'cancelled' }), { class: 'cancelled', text: 'i18n:scheduledPlan.statusCancelled' });
  assert.deepStrictEqual(get({ status: 'expired' }), { class: 'expired', text: 'i18n:scheduledPlan.statusExpired' });
});

test('P2-2 过期判定: scheduledTime <= now → overdue', async () => {
  const get = await loadModule();
  const plan = { status: 'pending', scheduledTime: new Date(Date.now() - 60000).toISOString() };
  assert.strictEqual(get(plan).class, 'overdue');
});

test('P2-2 未到期 → pending', async () => {
  const get = await loadModule();
  const plan = { status: 'pending', scheduledTime: new Date(Date.now() + 60000).toISOString() };
  assert.strictEqual(get(plan).class, 'pending');
});

test('P2-2 无 scheduledTime → pending (非过期)', async () => {
  const get = await loadModule();
  assert.strictEqual(get({ status: 'pending' }).class, 'pending');
});

test('P2-2 null 计划 → unknown', async () => {
  const get = await loadModule();
  assert.deepStrictEqual(get(null), { class: 'unknown', text: 'Unknown' });
});

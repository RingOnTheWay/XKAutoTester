// ScheduledPlanQueue 单测 — heap 性质 + compare 注入。
// 验证: enqueue/dequeue 顺序 + peek 不移除 + remove 重建 + size/getAll + compare 注入。
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const { ScheduledPlanQueue, compareByScheduledTime } = require(path.join(
  __dirname,
  '..',
  '..',
  'electron',
  'src',
  'main',
  'services',
  'scheduler',
  'planQueue.js'
));

function makePlan(id, scheduledTime) {
  return { id, scheduledTime, name: `plan-${id}` };
}

test('enqueue 按 scheduledTime 排序, dequeue 取最早', () => {
  const q = new ScheduledPlanQueue();
  q.enqueue(makePlan('b', '2026-01-02T10:00:00Z'));
  q.enqueue(makePlan('a', '2026-01-01T10:00:00Z'));
  q.enqueue(makePlan('c', '2026-01-03T10:00:00Z'));

  assert.strictEqual(q.dequeue().id, 'a');
  assert.strictEqual(q.dequeue().id, 'b');
  assert.strictEqual(q.dequeue().id, 'c');
  assert.strictEqual(q.dequeue(), null);
});

test('peek 不移除队首', () => {
  const q = new ScheduledPlanQueue();
  q.enqueue(makePlan('a', '2026-01-01T10:00:00Z'));
  q.enqueue(makePlan('b', '2026-01-02T10:00:00Z'));

  assert.strictEqual(q.peek().id, 'a');
  assert.strictEqual(q.peek().id, 'a');
  assert.strictEqual(q.size(), 2);
});

test('remove(planId) 重建 heap 并保持顺序', () => {
  const q = new ScheduledPlanQueue();
  q.enqueue(makePlan('a', '2026-01-01T10:00:00Z'));
  q.enqueue(makePlan('b', '2026-01-02T10:00:00Z'));
  q.enqueue(makePlan('c', '2026-01-03T10:00:00Z'));

  assert.strictEqual(q.remove('b'), true);
  assert.strictEqual(q.size(), 2);
  assert.strictEqual(q.dequeue().id, 'a');
  assert.strictEqual(q.dequeue().id, 'c');

  assert.strictEqual(q.remove('not-exist'), false);
});

test('rebuild 后 heap 性质保持', () => {
  const q = new ScheduledPlanQueue();
  q.enqueue(makePlan('c', '2026-01-03T10:00:00Z'));
  q.enqueue(makePlan('a', '2026-01-01T10:00:00Z'));
  q.enqueue(makePlan('b', '2026-01-02T10:00:00Z'));

  q.rebuild();

  assert.strictEqual(q.dequeue().id, 'a');
  assert.strictEqual(q.dequeue().id, 'b');
  assert.strictEqual(q.dequeue().id, 'c');
});

test('size + getAll 返回快照', () => {
  const q = new ScheduledPlanQueue();
  q.enqueue(makePlan('a', '2026-01-01T10:00:00Z'));
  q.enqueue(makePlan('b', '2026-01-02T10:00:00Z'));

  assert.strictEqual(q.size(), 2);
  const all = q.getAll();
  assert.strictEqual(all.length, 2);
  // getAll 返回快照, 不影响原 queue
  all.push({ id: 'x' });
  assert.strictEqual(q.size(), 2);
});

test('compare 注入: 自定义 priority 字段排序 (解 scheduledTime 硬绑)', () => {
  const q = new ScheduledPlanQueue({ compare: (a, b) => a.priority - b.priority });
  q.enqueue({ id: 'b', priority: 5 });
  q.enqueue({ id: 'a', priority: 1 });
  q.enqueue({ id: 'c', priority: 3 });

  assert.strictEqual(q.dequeue().id, 'a');
  assert.strictEqual(q.dequeue().id, 'c');
  assert.strictEqual(q.dequeue().id, 'b');
});

test('compareByScheduledTime 默认导出 + 与 queue 默认行为一致', () => {
  const a = makePlan('a', '2026-01-01T10:00:00Z');
  const b = makePlan('b', '2026-01-02T10:00:00Z');
  assert.ok(compareByScheduledTime(a, b) < 0);
  assert.ok(compareByScheduledTime(b, a) > 0);
  assert.strictEqual(compareByScheduledTime(a, a), 0);
});

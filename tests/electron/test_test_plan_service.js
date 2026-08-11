// TestPlanService 单测 — P0 并发回归: Promise.all 并发 saveTestPlan/recordRun/deleteTestPlan 不丢更新。
// 验证 withLock 串行化 read-modify-write, 防并发丢更新。
// 真实 fs + tmpdir, 模拟生产 IO 交错。
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { TestPlanService } = require(path.join(
  __dirname, '..', '..', 'electron', 'src', 'main', 'services', 'TestPlanService.js'
));

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'xkat-tp-conc-'));
}

// ── P0 并发回归 ─────────────────────────────────────────

test('P0 并发回归: 20 个并发 saveTestPlan (不同 name) 全部持久化', async () => {
  const tmpDir = makeTmpDir();
  try {
    const svc = new TestPlanService(tmpDir, tmpDir, {
      idGenerator: (() => {
        let n = 0;
        return () => `id-${++n}`;
      })(),
    });

    const N = 20;
    const results = await Promise.all(
      Array.from({ length: N }, (_, i) => svc.saveTestPlan({
        name: `Plan${i}`,
        testFiles: [],
        markers: [],
      }))
    );

    assert.ok(results.every(r => r.success === true), '所有 saveTestPlan 应成功');

    const fileContent = fs.readFileSync(path.join(tmpDir, 'test_plans.json'), 'utf8');
    const persisted = JSON.parse(fileContent);
    assert.strictEqual(persisted.length, N, `应持久化 ${N} 个 plan (withLock 防丢更新)`);

    const names = new Set(persisted.map(p => p.name));
    assert.strictEqual(names.size, N, 'plan 名称应无重复');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('P0 并发回归: 10 个并发 recordRun 到同一 plan 全部追加 (无丢 run)', async () => {
  const tmpDir = makeTmpDir();
  try {
    const svc = new TestPlanService(tmpDir, tmpDir, {
      idGenerator: (() => {
        let n = 0;
        return () => `id-${++n}`;
      })(),
    });

    // seed 一个 plan
    await svc.saveTestPlan({ name: 'TargetPlan', testFiles: [], markers: [] });

    const N = 10;
    const results = await Promise.all(
      Array.from({ length: N }, () => svc.recordRun('TargetPlan'))
    );

    assert.ok(results.every(r => r.success === true), '所有 recordRun 应成功');

    const plans = await svc.getTestPlans();
    const plan = plans.find(p => p.name === 'TargetPlan');
    assert.strictEqual(plan.runs.length, N, `应追加 ${N} 条 run (withLock 防丢更新)`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('P0 并发回归: 10 个并发 deleteTestPlan 互不干扰', async () => {
  const tmpDir = makeTmpDir();
  try {
    const svc = new TestPlanService(tmpDir, tmpDir, {
      idGenerator: (() => {
        let n = 0;
        return () => `id-${++n}`;
      })(),
    });

    // seed 10 个 plan
    for (let i = 0; i < 10; i++) {
      await svc.saveTestPlan({ name: `Seed${i}`, testFiles: [], markers: [] });
    }

    const allPlans = await svc.getTestPlans();
    const results = await Promise.all(
      allPlans.map(p => svc.deleteTestPlan(p.id))
    );

    assert.ok(results.every(r => r.success === true));
    const remaining = await svc.getTestPlans();
    assert.strictEqual(remaining.length, 0, '并发删除后应剩 0 个 plan');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('P0 并发回归: 并发 saveTestPlan 同名覆盖不产生重复 (withLock 串行化)', async () => {
  const tmpDir = makeTmpDir();
  try {
    const svc = new TestPlanService(tmpDir, tmpDir, {
      idGenerator: (() => {
        let n = 0;
        return () => `id-${++n}`;
      })(),
    });

    // 5 个并发都用同一 name → 最终只 1 个 (每次覆盖)
    const N = 5;
    const results = await Promise.all(
      Array.from({ length: N }, (_, i) => svc.saveTestPlan({
        name: 'SameName',
        testFiles: [`file${i}.py`],
        markers: [],
      }))
    );

    assert.ok(results.every(r => r.success === true));

    const plans = await svc.getTestPlans();
    const sameNamePlans = plans.filter(p => p.name === 'SameName');
    assert.strictEqual(sameNamePlans.length, 1, '同名 plan 应只 1 个 (withLock 串行覆盖)');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

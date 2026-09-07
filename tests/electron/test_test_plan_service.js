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


// ── P0-2 安全回归: 字段白名单 + 报告路径校验 ─────────────────────────

test('P0-2 saveTestPlan 白名单: 剥离 runs/report_path 等运行期字段', async () => {
  const tmpDir = makeTmpDir();
  try {
    const svc = new TestPlanService(tmpDir, tmpDir, {
      idGenerator: () => 'plan-id-1',
    });

    // 渲染进程可注入任意字段 (含 report_path) — 白名单后必须被剥离
    const result = await svc.saveTestPlan({
      name: 'VictimPlan',
      description: 'desc',
      loopCount: 3,
      continueOnFailure: false,
      testFiles: ['a.py'],
      testTypes: ['unit'],
      runs: [{ report_path: 'C:\\Windows\\System32', timestamp: '2026-01-01 00:00:00' }],
      last_run: 'fake',
      evilField: { any: 'thing' },
    });
    assert.strictEqual(result.success, true, result.error);

    const plans = await svc.getTestPlans();
    const plan = plans.find(p => p.name === 'VictimPlan');
    assert.ok(plan, 'plan 应存在');
    assert.strictEqual(plan.description, 'desc');
    assert.strictEqual(plan.loopCount, 3);
    assert.strictEqual(plan.continueOnFailure, false);
    assert.deepStrictEqual(plan.testFiles, ['a.py']);
    // 运行期/未知字段必须不存在
    assert.strictEqual(plan.runs, undefined, 'runs 不得由渲染进程注入');
    assert.strictEqual(plan.last_run, undefined);
    assert.strictEqual(plan.evilField, undefined);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('P0-2 updateTestPlan 保留服务端运行期字段 (runs/last_run 不丢失)', async () => {
  const tmpDir = makeTmpDir();
  try {
    const svc = new TestPlanService(tmpDir, tmpDir, { idGenerator: () => 'plan-id-1' });
    await svc.saveTestPlan({ name: 'P', testFiles: [] });
    // 服务端 recordRun 写入 runs/last_run
    await svc.recordRun('P');

    // 用户编辑计划 (渲染进程不传 runs) — 历史记录必须保留
    await svc.updateTestPlan({ id: 'plan-id-1', name: 'P2', testFiles: ['b.py'] });
    const plans = await svc.getTestPlans();
    const plan = plans.find(p => p.name === 'P2');
    assert.ok(plan.runs && plan.runs.length === 1, 'runs 应保留');
    assert.ok(plan.last_run, 'last_run 应保留');
    assert.deepStrictEqual(plan.testFiles, ['b.py']);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('P0-2 deleteReportRun 拒绝报告目录外的 report_path', async () => {
  const tmpDir = makeTmpDir();
  try {
    const svc = new TestPlanService(tmpDir, tmpDir, { idGenerator: () => 'plan-id-1' });
    // 手工构造一个带恶意 report_path 的 plan (模拟白名单上线前的存量脏数据)
    const evilPath = path.join(os.tmpdir(), 'p0-evil-target-dir');
    fs.mkdirSync(evilPath, { recursive: true });
    fs.writeFileSync(path.join(evilPath, 'victim.txt'), 'do-not-delete');
    try {
      const fsFactory = () => ({
        exists: (p) => fs.existsSync(p),
        stat: (p) => fs.statSync(p),
        readdir: (d) => fs.readdirSync(d),
        readFile: (p) => fs.readFileSync(p, 'utf8'),
        rm: (p, opts) => fs.rmSync(p, opts),
      });
      const svc2 = new TestPlanService(tmpDir, tmpDir, {
        idGenerator: () => 'plan-id-1',
        fileSystemFactory: fsFactory,
      });
      await svc2.saveTestPlan({ name: 'P', testFiles: [] });
      // 直接往文件注入恶意 run 记录 (模拟被攻破/存量数据)
      const filePath = path.join(tmpDir, 'test_plans.json');
      const plans = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      plans[0].runs = [{ report_path: evilPath, timestamp: '2026-01-01 00:00:00' }];
      fs.writeFileSync(filePath, JSON.stringify(plans, null, 2));

      const result = await svc2.deleteReportRun('P', evilPath);
      assert.strictEqual(result.success, false, '应拒绝删除目录外路径');
      assert.ok(result.error.includes('非法'), '错误信息应说明非法路径');
      // 目标目录必须未被删除
      assert.ok(fs.existsSync(path.join(evilPath, 'victim.txt')), '受害文件不得被删除');
    } finally {
      fs.rmSync(evilPath, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('P0-2 isPathInside 纯函数: 边界与穿越用例', () => {
  const { isPathInside, sanitizePlanData, PLAN_EDITABLE_FIELDS } = require(path.join(
    __dirname, '..', '..', 'electron', 'src', 'main', 'services', 'TestPlanService.js'
  ));
  const base = 'C:/reports';
  assert.strictEqual(isPathInside(base, 'C:/reports/plan1'), true);
  assert.strictEqual(isPathInside(base, 'C:/reports/plan1/index.html'), true);
  assert.strictEqual(isPathInside(base, 'C:/reports-evil/plan1'), false, '前缀目录不得误判为内部');
  assert.strictEqual(isPathInside(base, 'C:/reports2'), false);
  assert.strictEqual(isPathInside(base, 'C:/outside/plan1'), false);
  assert.strictEqual(isPathInside(base, 'C:/reports'), false, 'baseDir 自身不算内部');
  assert.strictEqual(isPathInside(base, '/absolute/path'), false);
  assert.ok(PLAN_EDITABLE_FIELDS.includes('name'));
  assert.ok(!PLAN_EDITABLE_FIELDS.includes('runs'));
  assert.ok(!PLAN_EDITABLE_FIELDS.includes('last_run'));
});

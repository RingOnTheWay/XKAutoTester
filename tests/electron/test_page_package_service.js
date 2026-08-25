// PagePackageService 单测 — _navigate 纯函数 + 3 apply helper + 2 factory 注入 + 18 facade 契约 + 集成。
// 验证: 1) _navigate 3 层导航 + 未找到分支 2) _applyQuery 读路径 3) _applyMutation 写路径
//      4) _applyDelete 删路径 5) idGenerator 注入 6) errorReporter 注入 7) 18 facade forward 契约
//      8) 默认 factory 集成 (真 fs)
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { PagePackageService } = require(path.join(
  __dirname, '..', '..', 'electron', 'src', 'main', 'services', 'PagePackageService.js'
));

// ── 测试数据 ─────────────────────────────────────────────

function makeTestData() {
  return {
    apps: [
      {
        id: 'app1', name: 'TestApp', platform: 'android', packageName: 'com.test', activityName: 'Main',
        pages: [
          {
            id: 'page1', name: 'HomePage',
            elements: [
              { id: 'elem1', name: 'SubmitBtn', locator: 'id', value: 'submit' },
              { id: 'elem2', name: 'CancelBtn', locator: 'xpath', value: '//cancel' }
            ]
          },
          { id: 'page2', name: 'SettingPage', elements: [] }
        ]
      },
      { id: 'app2', name: 'AnotherApp', pages: [] }
    ]
  };
}

// 测试用子类: 跳过 fs, 注入内存数据
class InMemoryPagePackageService extends PagePackageService {
  constructor(initialData, opts = {}) {
    super('/fake/path', opts);
    this._memData = initialData || { apps: [] };
  }
  async getData() { return this._memData; }
  async saveData(data) { this._memData = data; return { success: true }; }
}

// ── 1. _navigate 纯函数 ──────────────────────────────────

test('_navigate 3 层导航 + 未找到分支', () => {
  const svc = new InMemoryPagePackageService(makeTestData());
  const data = svc._memData;

  // 无 appId → 返 data
  let ctx = svc._navigate(data, {});
  assert.strictEqual(ctx.data, data);
  assert.strictEqual(ctx.error, undefined);

  // 仅 appId → 返 app
  ctx = svc._navigate(data, { appId: 'app1' });
  assert.strictEqual(ctx.app.id, 'app1');
  assert.strictEqual(ctx.error, undefined);

  // appId + pageId → 返 page
  ctx = svc._navigate(data, { appId: 'app1', pageId: 'page1' });
  assert.strictEqual(ctx.page.id, 'page1');
  assert.strictEqual(ctx.error, undefined);

  // appId + pageId + elementId → 返 element + elementIndex
  ctx = svc._navigate(data, { appId: 'app1', pageId: 'page1', elementId: 'elem1' });
  assert.strictEqual(ctx.element.id, 'elem1');
  assert.strictEqual(ctx.elementIndex, 0);
  assert.strictEqual(ctx.error, undefined);

  // 未找到应用
  ctx = svc._navigate(data, { appId: 'nonexistent' });
  assert.strictEqual(ctx.error, '未找到应用');

  // 未找到页面
  ctx = svc._navigate(data, { appId: 'app1', pageId: 'nonexistent' });
  assert.strictEqual(ctx.error, '未找到页面');

  // 未找到元素
  ctx = svc._navigate(data, { appId: 'app1', pageId: 'page1', elementId: 'nonexistent' });
  assert.strictEqual(ctx.error, '未找到元素');
});

// ── 2. _applyQuery 读路径 ────────────────────────────────

test('_applyQuery 读路径: getData → navigate → queryFn → _success', async () => {
  const svc = new InMemoryPagePackageService(makeTestData());

  const result = await svc._applyQuery({ appId: 'app1' }, (ctx) => ctx.app.pages);
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.data.length, 2);
  assert.strictEqual(result.data[0].id, 'page1');

  // 未找到应用分支
  const notFound = await svc._applyQuery({ appId: 'nope' }, () => []);
  assert.strictEqual(notFound.success, false);
  assert.strictEqual(notFound.error, '未找到应用');
});

// ── 3. _applyMutation 写路径 ─────────────────────────────

test('_applyMutation 写路径: getData → navigate → mutateFn → saveData → _success', async () => {
  const svc = new InMemoryPagePackageService(makeTestData());

  const result = await svc._applyMutation({ appId: 'app1' }, (ctx) => {
    const newPage = { id: 'new-page', name: 'NewPage', elements: [] };
    ctx.app.pages.push(newPage);
    return newPage;
  });

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.data.id, 'new-page');

  // 验证 saveData 被调 (内存数据已更新)
  const saved = await svc.getData();
  assert.strictEqual(saved.apps[0].pages.length, 3);
  assert.strictEqual(saved.apps[0].pages[2].id, 'new-page');
});

// ── 4. _applyDelete 删路径 ───────────────────────────────

test('_applyDelete 删路径: getData → navigate → splice → saveData → {success:true}', async () => {
  const svc = new InMemoryPagePackageService(makeTestData());

  // 删 page
  const result = await svc._applyDelete({ appId: 'app1', pageId: 'page1' }, (ctx) => {
    return ctx.app.pages.findIndex(p => p.id === 'page1');
  });

  assert.deepStrictEqual(result, { success: true });

  // 验证已删除
  const saved = await svc.getData();
  assert.strictEqual(saved.apps[0].pages.length, 1);
  assert.strictEqual(saved.apps[0].pages[0].id, 'page2');

  // 删 element
  const svc2 = new InMemoryPagePackageService(makeTestData());
  const result2 = await svc2._applyDelete(
    { appId: 'app1', pageId: 'page1', elementId: 'elem1' },
    (ctx) => ctx.page.elements.findIndex(e => e.id === 'elem1')
  );
  assert.deepStrictEqual(result2, { success: true });
  const saved2 = await svc2.getData();
  assert.strictEqual(saved2.apps[0].pages[0].elements.length, 1);
  assert.strictEqual(saved2.apps[0].pages[0].elements[0].id, 'elem2');
});

// ── 5. idGenerator 注入 ──────────────────────────────────

test('idGenerator 注入: 测试传确定性 ID 生成器', async () => {
  let seq = 0;
  const svc = new InMemoryPagePackageService({ apps: [] }, {
    idGenerator: () => `fixed-id-${++seq}`,
  });

  const r1 = await svc.addApp({ name: 'App1' });
  assert.strictEqual(r1.data.id, 'fixed-id-1');

  const r2 = await svc.addApp({ name: 'App2' });
  assert.strictEqual(r2.data.id, 'fixed-id-2');

  // 加 page 用同一 idGenerator
  const r3 = await svc.addPage('fixed-id-1', 'Page1');
  assert.strictEqual(r3.data.id, 'fixed-id-3');
});

// ── 6. errorReporter 注入 ────────────────────────────────

test('errorReporter 注入: 测试传 spy 验证错误日志调用', async () => {
  const errors = [];
  const svc = new InMemoryPagePackageService({ apps: [] }, {
    errorReporter: (msg, err) => errors.push({ msg, errMessage: err.message }),
  });

  // 触发错误: getData 抛错
  svc.getData = async () => { throw new Error('disk read failed'); };

  const result = await svc.getApps();

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.error, 'disk read failed');
  assert.strictEqual(errors.length, 1);
  assert.strictEqual(errors[0].errMessage, 'disk read failed');
});

// ── 7. facade forward 契约 ───────────────────────────────

test('facade forward 契约: 18 方法正确 forward 到 _applyQuery/_applyMutation/_applyDelete', async () => {
  const svc = new InMemoryPagePackageService(makeTestData());

  const calls = { query: [], mutation: [], delete: [] };
  svc._applyQuery = async (nav, fn) => { calls.query.push({ nav, fnName: fn.name || 'anon' }); return { success: true, data: 'query-result' }; };
  svc._applyMutation = async (nav, fn) => { calls.mutation.push({ nav, fnName: fn.name || 'anon' }); return { success: true, data: 'mutation-result' }; };
  svc._applyDelete = async (nav, fn) => { calls.delete.push({ nav, fnName: fn.name || 'anon' }); return { success: true }; };

  // Apps (5)
  await svc.getApps();
  await svc.addApp({ name: 'X' });
  await svc.updateApp('app1', { name: 'Y' });
  await svc.updateApp('app1', 'string-name');  // 字符串兼容
  await svc.deleteApp('app1');
  await svc.searchApps('keyword');

  // Pages (5)
  await svc.getPages('app1');
  await svc.addPage('app1', 'PageName');
  await svc.updatePage('app1', 'page1', 'NewName');
  await svc.deletePage('app1', 'page1');
  await svc.searchPages('app1', 'keyword');

  // Elements (5)
  await svc.getElements('app1', 'page1');
  await svc.addElement('app1', 'page1', { name: 'btn', locator: 'id', value: 'x' });
  await svc.updateElement('app1', 'page1', 'elem1', { name: 'btn', locator: 'id', value: 'y' });
  await svc.deleteElement('app1', 'page1', 'elem1');
  await svc.searchElements('app1', 'page1', 'keyword');

  // Stats (2)
  await svc.getAppStats('app1');
  await svc.getPageStats('app1', 'page1');

  // 验证调用次数: query=getApps/getPages/getElements/searchApps/searchPages/searchElements/getAppStats/getPageStats = 8
  // mutation=addApp/updateApp×2/addPage/updatePage/addElement/updateElement = 7
  // delete=deleteApp/deletePage/deleteElement = 3
  assert.strictEqual(calls.query.length, 8, 'query 应 8 次 (get×3 + search×3 + stats×2)');
  assert.strictEqual(calls.mutation.length, 7, 'mutation 应 7 次 (add×3 + update×3 + updateApp字符串兼容×1)');
  assert.strictEqual(calls.delete.length, 3, 'delete 应 3 次 (deleteApp + deletePage + deleteElement)');
});

// ── 8. 默认 factory 集成 (真 fs) ─────────────────────────

test('默认 factory 集成: 真实 fs + 临时 page_package.json', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xkat-pp-test-'));
  try {
    const svc = new PagePackageService(tmpDir);

    // 首次 getData 会创建默认 { apps: [] }
    const r1 = await svc.getApps();
    assert.strictEqual(r1.success, true);
    assert.deepStrictEqual(r1.data, []);

    // addApp
    const r2 = await svc.addApp({ name: 'RealApp', platform: 'android', packageName: 'com.real', activityName: 'Main' });
    assert.strictEqual(r2.success, true);
    assert.ok(r2.data.id, '应生成 ID');
    assert.strictEqual(r2.data.name, 'RealApp');

    // addPage
    const r3 = await svc.addPage(r2.data.id, 'HomePage');
    assert.strictEqual(r3.success, true);
    assert.strictEqual(r3.data.name, 'HomePage');

    // addElement
    const r4 = await svc.addElement(r2.data.id, r3.data.id, { name: 'Btn', locator: 'id', value: 'submit' });
    assert.strictEqual(r4.success, true);

    // getAppStats
    const r5 = await svc.getAppStats(r2.data.id);
    assert.strictEqual(r5.success, true);
    assert.deepStrictEqual(r5.data, { pageCount: 1, elementCount: 1 });

    // 验证持久化到文件
    const fileContent = fs.readFileSync(path.join(tmpDir, 'page_package.json'), 'utf8');
    const persisted = JSON.parse(fileContent);
    assert.strictEqual(persisted.apps.length, 1);
    assert.strictEqual(persisted.apps[0].name, 'RealApp');
    assert.strictEqual(persisted.apps[0].pages[0].elements[0].name, 'Btn');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ── 9. P0 并发回归: Promise.all 并发 addApp 不丢更新 ────

test('P0 并发回归: 20 个并发 addApp 全部持久化 (withLock 串行化 read-modify-write)', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xkat-pp-conc-'));
  try {
    const svc = new PagePackageService(tmpDir);

    // 20 个并发 addApp, 每个 push 一个新 app
    const N = 20;
    const results = await Promise.all(
      Array.from({ length: N }, (_, i) => svc.addApp({ name: `App${i}`, platform: 'android' }))
    );

    // 全部成功
    assert.ok(results.every(r => r.success === true), '所有 addApp 应成功');

    // 持久化数量 = N (无丢更新)
    const fileContent = fs.readFileSync(path.join(tmpDir, 'page_package.json'), 'utf8');
    const persisted = JSON.parse(fileContent);
    assert.strictEqual(persisted.apps.length, N, `应持久化 ${N} 个 app (withLock 防丢更新)`);

    // 名称集合完整 (无覆盖)
    const names = new Set(persisted.apps.map(a => a.name));
    assert.strictEqual(names.size, N, 'app 名称应无重复');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('P0 并发回归: 10 个并发 addPage 到同一 app 全部持久化', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xkat-pp-conc2-'));
  try {
    const svc = new PagePackageService(tmpDir);
    const appResult = await svc.addApp({ name: 'ConcurrentApp', platform: 'android' });
    const appId = appResult.data.id;

    // 10 个并发 addPage 到同一 app
    const N = 10;
    const results = await Promise.all(
      Array.from({ length: N }, (_, i) => svc.addPage(appId, `Page${i}`))
    );

    assert.ok(results.every(r => r.success === true));

    const fileContent = fs.readFileSync(path.join(tmpDir, 'page_package.json'), 'utf8');
    const persisted = JSON.parse(fileContent);
    assert.strictEqual(persisted.apps[0].pages.length, N, `应持久化 ${N} 个 page`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

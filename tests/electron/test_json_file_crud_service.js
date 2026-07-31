// JsonFileCrudService 单测 — 1 factory (asyncFsFactory) + idGenerator + 5 方法。
// 验证: constructor 收 factory + getData (存在/不存在/抛错) + saveData (目录存在/不存在) + _generateId 注入。
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const CRUD_SERVICE_PATH = path.join(
  __dirname, '..', '..', 'electron', 'src', 'main', 'services', 'base', 'JsonFileCrudService.js'
);
const { JsonFileCrudService } = require(CRUD_SERVICE_PATH);

// ── Fakes ──────────────────────────────────────────────

function makeFakeAsyncFs(opts = {}) {
  const calls = {
    exists: [],
    readJson: [],
    writeJson: [],
    ensureDir: [],
  };
  return {
    calls,
    exists: async (p) => {
      calls.exists.push(p);
      return opts.existsResult !== undefined ? opts.existsResult : false;
    },
    readJson: async (p) => {
      calls.readJson.push(p);
      if (opts.readJsonThrow) throw opts.readJsonThrow;
      return opts.readJsonResult || {};
    },
    writeJson: async (p, data) => { calls.writeJson.push({ p, data }); },
    ensureDir: async (dir) => { calls.ensureDir.push(dir); },
  };
}

// ── Tests ──────────────────────────────────────────────

test('constructor 收 asyncFsFactory + idGenerator + 实例建', () => {
  const fakeFs = makeFakeAsyncFs();
  const idGen = () => 'fixed-id';
  const svc = new JsonFileCrudService('/tmp/x.json', { a: 1 }, {
    asyncFsFactory: () => fakeFs,
    idGenerator: idGen,
  });

  assert.strictEqual(svc.filePath, '/tmp/x.json');
  assert.deepStrictEqual(svc.defaultData, { a: 1 });
  assert.strictEqual(svc._asyncFs, fakeFs);
  assert.strictEqual(svc._idGenerator, idGen);
});

test('getData 文件存在调 asyncFs.exists + readJson', async () => {
  const fakeFs = makeFakeAsyncFs({ existsResult: true, readJsonResult: { x: 1 } });
  const svc = new JsonFileCrudService('/tmp/x.json', {}, { asyncFsFactory: () => fakeFs });

  const data = await svc.getData();

  assert.deepStrictEqual(fakeFs.calls.exists, ['/tmp/x.json']);
  assert.deepStrictEqual(fakeFs.calls.readJson, ['/tmp/x.json']);
  assert.deepStrictEqual(data, { x: 1 });
});

test('getData 文件不存在返 defaultData deep clone', async () => {
  const fakeFs = makeFakeAsyncFs({ existsResult: false });
  const def = { items: [1, 2] };
  const svc = new JsonFileCrudService('/tmp/x.json', def, { asyncFsFactory: () => fakeFs });

  const data = await svc.getData();

  assert.deepStrictEqual(data, { items: [1, 2] });
  assert.notStrictEqual(data, def);  // deep clone, 非同引用
  assert.notStrictEqual(data.items, def.items);
});

test('getData readJson 抛错返 defaultData + console.error', async () => {
  const fakeFs = makeFakeAsyncFs({
    existsResult: true,
    readJsonThrow: new Error('parse fail'),
  });
  const originalErr = console.error;
  let errLogged = false;
  console.error = () => { errLogged = true; };
  try {
    const svc = new JsonFileCrudService('/tmp/x.json', { fallback: true }, {
      asyncFsFactory: () => fakeFs,
    });
    const data = await svc.getData();
    assert.deepStrictEqual(data, { fallback: true });
    assert.strictEqual(errLogged, true);
  } finally {
    console.error = originalErr;
  }
});

test('saveData 目录不存在调 ensureDir + writeJson', async () => {
  // exists 第一次返 false (目录不存在), 第二次返 true (由 writeJson 内部不调, 此处不模拟)
  let existsCount = 0;
  const fakeFs = {
    exists: async () => { existsCount++; return false; },  // 始终返 false
    readJson: async () => ({}),
    writeJson: async () => {},
    ensureDir: async () => {},
  };
  const calls = { ensureDir: [], writeJson: [] };
  fakeFs.ensureDir = async (dir) => calls.ensureDir.push(dir);
  fakeFs.writeJson = async (p, data) => calls.writeJson.push({ p, data });

  const svc = new JsonFileCrudService('/tmp/sub/x.json', {}, { asyncFsFactory: () => fakeFs });
  const result = await svc.saveData({ y: 2 });

  assert.deepStrictEqual(result, { success: true });
  assert.deepStrictEqual(calls.ensureDir, ['/tmp/sub']);
  assert.deepStrictEqual(calls.writeJson, [{ p: '/tmp/sub/x.json', data: { y: 2 } }]);
});

test('_generateId 调注入的 idGenerator', () => {
  const fakeFs = makeFakeAsyncFs();
  const svc = new JsonFileCrudService('/tmp/x.json', {}, {
    asyncFsFactory: () => fakeFs,
    idGenerator: () => 'generated-id-001',
  });

  assert.strictEqual(svc._generateId(), 'generated-id-001');
});

test('_success + _error helper 返正确结构', () => {
  const svc = new JsonFileCrudService('/tmp/x.json', {});
  assert.deepStrictEqual(svc._success({ a: 1 }), { success: true, data: { a: 1 } });
  assert.deepStrictEqual(svc._error('boom'), { success: false, error: 'boom' });
});

// lastDialogPaths 单元测试: 文件选择器"上次选择路径"记忆
// 验证: 1) getDefaultPath 语义 (目录→自身, 文件→父目录) 2) rememberPath 持久化到 config.json
//      3) 路径不存在回退 4) 无 configPath 时安全降级
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const MODULE_PATH = path.join(__dirname, '..', '..', 'electron', 'src', 'main', 'handlers', 'base', 'lastDialogPaths.js');

function loadStore() {
  delete require.cache[require.resolve(MODULE_PATH)];
  return require(MODULE_PATH);
}

function makeTempDir(prefix = 'lastpaths-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// 测试场景: 记住"目录" → defaultPath 为该目录自身
test('记住目录: defaultPath 返回目录自身', async () => {
  const store = loadStore();
  const dir = makeTempDir();
  const configPath = path.join(makeTempDir(), 'config.json');
  store.init(() => configPath);

  await store.rememberPath('select-directory', dir);

  const dp = await store.getDefaultPath('select-directory');
  assert.strictEqual(dp, dir);
});

// 测试场景: 记住"文件" → defaultPath 为其父目录
test('记住文件: defaultPath 返回父目录', async () => {
  const store = loadStore();
  const dir = makeTempDir();
  const file = path.join(dir, 'test.apk');
  fs.writeFileSync(file, 'fake');
  const configPath = path.join(makeTempDir(), 'config.json');
  store.init(() => configPath);

  await store.rememberPath('select-apk', file);

  const dp = await store.getDefaultPath('select-apk');
  assert.strictEqual(dp, dir);
});

// 测试场景: 无记录 → undefined
test('无记录: defaultPath 返回 undefined', async () => {
  const store = loadStore();
  store.init(() => path.join(makeTempDir(), 'config.json'));

  const dp = await store.getDefaultPath('select-directory');
  assert.strictEqual(dp, undefined);
});

// 测试场景: 记住的路径已不存在 → 回退父目录
test('路径已删除: 回退到父目录', async () => {
  const store = loadStore();
  const dir = makeTempDir();
  const file = path.join(dir, 'gone.apk');
  // 不创建该文件
  const configPath = path.join(makeTempDir(), 'config.json');
  store.init(() => configPath);

  await store.rememberPath('select-apk', file);

  const dp = await store.getDefaultPath('select-apk');
  assert.strictEqual(dp, dir);
});

// 测试场景: 持久化 — 重新加载后仍能读到 (跨会话)
test('持久化: 重新 init 后仍能读到上次路径', async () => {
  const dir = makeTempDir();
  const configPath = path.join(makeTempDir(), 'config.json');

  const store1 = loadStore();
  store1.init(() => configPath);
  await store1.rememberPath('select-directory', dir);

  // 模拟重启: 新实例重新从 config.json 加载
  const store2 = loadStore();
  store2.init(() => configPath);
  const dp = await store2.getDefaultPath('select-directory');
  assert.strictEqual(dp, dir);
});

// 测试场景: 多 key 互不覆盖
test('多选择器独立记忆', async () => {
  const store = loadStore();
  const dirA = makeTempDir();
  const dirB = makeTempDir();
  const configPath = path.join(makeTempDir(), 'config.json');
  store.init(() => configPath);

  await store.rememberPath('select-directory', dirA);
  await store.rememberPath('select-apk', dirB);

  assert.strictEqual(await store.getDefaultPath('select-directory'), dirA);
  assert.strictEqual(await store.getDefaultPath('select-apk'), dirB);
});

// 测试场景: 无 configPath → rememberPath 安全跳过, getDefaultPath 返回 undefined
test('无 configPath: 安全降级', async () => {
  const store = loadStore();
  store.init(() => null);

  await store.rememberPath('k', '/some/path');
  const dp = await store.getDefaultPath('k');
  assert.strictEqual(dp, undefined);
});

// UserDataMigrator 单元测试
// 验证: 1) updatePaths 路径更新 2) deleteOldPathIfNeeded 3) copyDefaultsToUserData
//      4) migrateFromOldLocation 5) smartMergeConfig 6) migrateConfigToNewPath
//      7) migrateDataToPath 8) _getDefaultConfig 9) _deepMerge 10) _isUserData / _hasNonDefaultConfig
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const MIGRATOR_PATH = path.join(
  PROJECT_ROOT, 'electron', 'src', 'main', 'services', 'UserDataMigrator.js'
);

function loadMigrator() {
  delete require.cache[require.resolve(MIGRATOR_PATH)];
  return require(MIGRATOR_PATH);
}

function mkTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'xkat-migrator-test-'));
}

/**
 * 构造 migrator 实例 + 准备目录结构
 * @param {Object} overrides - 覆盖默认 opts 字段
 */
function createMigrator(overrides = {}) {
  const tempDir = mkTempDir();
  const userDataPath = path.join(tempDir, 'userData');
  const userConfigPath = path.join(userDataPath, 'config');
  const defaultConfigPath = path.join(tempDir, 'project', 'config');
  const versionFilePath = path.join(userDataPath, 'data-version.json');
  const defaultUserDataPath = path.join(tempDir, 'AppData', 'Xkautotester');

  fs.mkdirSync(userConfigPath, { recursive: true });
  fs.mkdirSync(defaultConfigPath, { recursive: true });
  fs.mkdirSync(defaultUserDataPath, { recursive: true });

  const opts = {
    userDataPath,
    userConfigPath,
    defaultConfigPath,
    versionFilePath,
    defaultUserDataPath,
    userFiles: ['config.json', 'page_package.json', 'test_plans.json', 'scheduled_plans.json'],
    userDirs: ['test_cases'],
    defaultConfigs: {
      'page_package.json': { apps: [] },
      'test_plans.json': [],
      'scheduled_plans.json': []
    },
    ...overrides
  };

  const UserDataMigrator = loadMigrator();
  const migrator = new UserDataMigrator(opts);
  return { migrator, tempDir, opts };
}


// ─── 构造 + updatePaths ───────────────────────────────────────

test('构造函数存储所有 opts 字段', () => {
  const { migrator, opts } = createMigrator();
  assert.strictEqual(migrator.userDataPath, opts.userDataPath);
  assert.strictEqual(migrator.userConfigPath, opts.userConfigPath);
  assert.strictEqual(migrator.defaultConfigPath, opts.defaultConfigPath);
  assert.strictEqual(migrator.versionFilePath, opts.versionFilePath);
  assert.strictEqual(migrator.defaultUserDataPath, opts.defaultUserDataPath);
  assert.strictEqual(migrator.userFiles, opts.userFiles);
  assert.strictEqual(migrator.userDirs, opts.userDirs);
  assert.strictEqual(migrator.defaultConfigs, opts.defaultConfigs);
});

test('updatePaths 仅更新提供的字段', () => {
  const { migrator, opts } = createMigrator();
  const newUserData = '/new/user/data';
  const newVersionFile = '/new/version.json';

  migrator.updatePaths({ userDataPath: newUserData, versionFilePath: newVersionFile });

  assert.strictEqual(migrator.userDataPath, newUserData);
  assert.strictEqual(migrator.versionFilePath, newVersionFile);
  // 未提供的字段保持不变
  assert.strictEqual(migrator.userConfigPath, opts.userConfigPath);
  assert.strictEqual(migrator.defaultConfigPath, opts.defaultConfigPath);
});

test('updatePaths 三个字段同时更新', () => {
  const { migrator } = createMigrator();
  migrator.updatePaths({
    userDataPath: '/a',
    userConfigPath: '/b',
    versionFilePath: '/c'
  });
  assert.strictEqual(migrator.userDataPath, '/a');
  assert.strictEqual(migrator.userConfigPath, '/b');
  assert.strictEqual(migrator.versionFilePath, '/c');
});


// ─── _getDefaultConfig (从原 test_user_data_service.js 迁移) ───

test('_getDefaultConfig 模板文件存在时正确读取', () => {
  const { migrator, opts } = createMigrator();
  const templateConfig = {
    APP_SETTINGS: { autoCheckUpdate: true, language: 'zh-CN' },
    LOG_CONFIG: { level: 'INFO' }
  };
  fs.writeFileSync(
    path.join(opts.defaultConfigPath, 'config.json'),
    JSON.stringify(templateConfig, null, 2)
  );

  const config = migrator._getDefaultConfig();
  assert.strictEqual(config.APP_SETTINGS.autoCheckUpdate, true);
  assert.strictEqual(config.APP_SETTINGS.language, 'zh-CN');
  assert.strictEqual(config.LOG_CONFIG.level, 'INFO');
});

test('_getDefaultConfig 模板文件不存在时返回 {}', () => {
  const { migrator } = createMigrator();
  const config = migrator._getDefaultConfig();
  assert.deepStrictEqual(config, {}, '模板文件丢失时应返回空对象');
});

test('_getDefaultConfig 模板 JSON 损坏时返回 {}', () => {
  const { migrator, opts } = createMigrator();
  fs.writeFileSync(path.join(opts.defaultConfigPath, 'config.json'), '{ invalid !!!');
  const config = migrator._getDefaultConfig();
  assert.deepStrictEqual(config, {}, 'JSON 损坏时应返回空对象');
});

test('_getDefaultConfig 模板目录不存在时返回 {}', () => {
  // 删除 defaultConfigPath 目录
  const tempDir = mkTempDir();
  const opts = {
    userDataPath: path.join(tempDir, 'ud'),
    userConfigPath: path.join(tempDir, 'ud', 'config'),
    defaultConfigPath: path.join(tempDir, 'missing-config'), // 不创建
    versionFilePath: path.join(tempDir, 'ud', 'data-version.json'),
    defaultUserDataPath: path.join(tempDir, 'default'),
    userFiles: [],
    userDirs: [],
    defaultConfigs: {}
  };
  fs.mkdirSync(opts.userConfigPath, { recursive: true });

  const UserDataMigrator = loadMigrator();
  const migrator = new UserDataMigrator(opts);
  const config = migrator._getDefaultConfig();
  assert.deepStrictEqual(config, {}, '模板目录不存在时应返回空对象');
});


// ─── _deepMerge ────────────────────────────────────────────────

test('_deepMerge 嵌套对象合并 - 用户覆盖默认', () => {
  const { migrator } = createMigrator();
  const def = { a: 1, b: { c: 2, d: 3 }, e: 5 };
  const usr = { b: { c: 20 }, f: 6 };
  const result = migrator._deepMerge(def, usr);
  assert.strictEqual(result.a, 1);
  assert.strictEqual(result.b.c, 20);
  assert.strictEqual(result.b.d, 3);
  assert.strictEqual(result.e, 5);
  assert.strictEqual(result.f, 6);
});

test('_deepMerge 数组用用户值替换 (不合并)', () => {
  const { migrator } = createMigrator();
  const def = { items: [1, 2, 3] };
  const usr = { items: [4, 5] };
  const result = migrator._deepMerge(def, usr);
  assert.deepStrictEqual(result.items, [4, 5]);
});

test('_deepMerge null 值正确处理', () => {
  const { migrator } = createMigrator();
  const def = { a: null, b: { c: null } };
  const usr = { b: { c: 1 } };
  const result = migrator._deepMerge(def, usr);
  assert.strictEqual(result.a, null);
  assert.strictEqual(result.b.c, 1);
});


// ─── _isUserData / _hasNonDefaultConfig ────────────────────────

test('_isUserData 不同文件类型判定', () => {
  const { migrator } = createMigrator();
  assert.strictEqual(migrator._isUserData('page_package.json', { apps: [{ id: 1 }] }), true);
  assert.strictEqual(migrator._isUserData('page_package.json', { apps: [] }), false);
  assert.strictEqual(migrator._isUserData('test_plans.json', [{ id: 1 }]), true);
  assert.strictEqual(migrator._isUserData('test_plans.json', []), false);
  assert.strictEqual(migrator._isUserData('scheduled_plans.json', [{ id: 1 }]), true);
  assert.strictEqual(migrator._isUserData('scheduled_plans.json', []), false);
  assert.strictEqual(migrator._isUserData('unknown.json', {}), false);
});

test('_hasNonDefaultConfig 检测用户自定义配置', () => {
  const { migrator } = createMigrator();
  // 默认配置: 不算用户数据
  assert.strictEqual(migrator._hasNonDefaultConfig({
    APP_SETTINGS: { language: 'zh-CN', dark_mode: false, theme_color: '#4CAF50', notification: { platform: 'none' } }
  }), false);
  // 修改语言: 算
  assert.strictEqual(migrator._hasNonDefaultConfig({
    APP_SETTINGS: { language: 'en-US' }
  }), true);
  // 暗色模式: 算
  assert.strictEqual(migrator._hasNonDefaultConfig({
    APP_SETTINGS: { dark_mode: true }
  }), true);
  // 修改主题色: 算
  assert.strictEqual(migrator._hasNonDefaultConfig({
    APP_SETTINGS: { theme_color: '#FF0000' }
  }), true);
  // 启用通知: 算
  assert.strictEqual(migrator._hasNonDefaultConfig({
    APP_SETTINGS: { notification: { platform: 'dingtalk' } }
  }), true);
});

test('_isUserData config.json 调用 _hasNonDefaultConfig', () => {
  const { migrator } = createMigrator();
  // 含用户自定义: language=en-US -> true
  assert.strictEqual(migrator._isUserData('config.json', {
    APP_SETTINGS: { language: 'en-US' }
  }), true);
  // 完全默认配置 (所有字段匹配默认值) -> false
  assert.strictEqual(migrator._isUserData('config.json', {
    APP_SETTINGS: {
      language: 'zh-CN',
      dark_mode: false,
      theme_color: '#4CAF50',
      notification: { platform: 'none' }
    }
  }), false);
});


// ─── copyDefaultsToUserData ───────────────────────────────────

test('copyDefaultsToUserData 从 defaultConfigPath 复制文件', async () => {
  const { migrator, opts } = createMigrator();
  // 准备默认配置文件
  fs.writeFileSync(path.join(opts.defaultConfigPath, 'config.json'), JSON.stringify({ APP_SETTINGS: {} }));
  fs.writeFileSync(path.join(opts.defaultConfigPath, 'page_package.json'), JSON.stringify({ apps: [] }));

  await migrator.copyDefaultsToUserData();

  assert.ok(fs.existsSync(path.join(opts.userConfigPath, 'config.json')));
  assert.ok(fs.existsSync(path.join(opts.userConfigPath, 'page_package.json')));
});

test('copyDefaultsToUserData 已存在的目标文件不覆盖', async () => {
  const { migrator, opts } = createMigrator();
  fs.writeFileSync(path.join(opts.defaultConfigPath, 'config.json'), JSON.stringify({ source: 'default' }));
  fs.writeFileSync(path.join(opts.userConfigPath, 'config.json'), JSON.stringify({ source: 'user' }));

  await migrator.copyDefaultsToUserData();

  const result = JSON.parse(fs.readFileSync(path.join(opts.userConfigPath, 'config.json'), 'utf8'));
  assert.strictEqual(result.source, 'user', '已存在的用户文件不应被覆盖');
});

test('copyDefaultsToUserData 源文件不存在时使用 _generateDefaultConfig', async () => {
  const { migrator, opts } = createMigrator();
  // defaultConfigPath 下无 page_package.json, 但 defaultConfigs 中有 fallback
  await migrator.copyDefaultsToUserData();

  const content = JSON.parse(fs.readFileSync(path.join(opts.userConfigPath, 'page_package.json'), 'utf8'));
  assert.deepStrictEqual(content, { apps: [] });
});


// ─── smartMergeConfig ─────────────────────────────────────────

test('smartMergeConfig 用户配置 + 默认配置 = 合并结果', async () => {
  const { migrator, opts } = createMigrator();
  // 准备默认 config.json
  fs.writeFileSync(path.join(opts.defaultConfigPath, 'config.json'), JSON.stringify({
    APP_SETTINGS: { language: 'zh-CN', dark_mode: false, theme_color: '#4CAF50' },
    LOG_CONFIG: { level: 'INFO' }
  }));
  // 用户已有 config.json (只改了 language)
  fs.writeFileSync(path.join(opts.userConfigPath, 'config.json'), JSON.stringify({
    APP_SETTINGS: { language: 'en-US' }
  }));

  await migrator.smartMergeConfig();

  const merged = JSON.parse(fs.readFileSync(path.join(opts.userConfigPath, 'config.json'), 'utf8'));
  assert.strictEqual(merged.APP_SETTINGS.language, 'en-US');
  assert.strictEqual(merged.APP_SETTINGS.dark_mode, false);
  assert.strictEqual(merged.APP_SETTINGS.theme_color, '#4CAF50');
  assert.strictEqual(merged.LOG_CONFIG.level, 'INFO');
});

test('smartMergeConfig 用户配置不存在时 noop', async () => {
  const { migrator, opts } = createMigrator();
  // 不创建 userConfigPath/config.json
  await migrator.smartMergeConfig();
  assert.ok(!fs.existsSync(path.join(opts.userConfigPath, 'config.json')));
});


// ─── migrateConfigToNewPath ───────────────────────────────────

test('migrateConfigToNewPath 拷贝文件 + 目录到新路径', async () => {
  const { migrator, opts, tempDir } = createMigrator();
  // 准备源文件
  fs.writeFileSync(path.join(opts.userConfigPath, 'config.json'), JSON.stringify({ a: 1 }));
  fs.writeFileSync(path.join(opts.userConfigPath, 'page_package.json'), JSON.stringify({ apps: [] }));
  // 准备源目录 test_cases
  const srcTestCases = path.join(opts.userConfigPath, 'test_cases');
  fs.mkdirSync(srcTestCases, { recursive: true });
  fs.writeFileSync(path.join(srcTestCases, 'case1.json'), JSON.stringify({ id: 1 }));
  // 准备版本文件
  fs.writeFileSync(opts.versionFilePath, JSON.stringify({ dataVersion: '1.0.0' }));

  const newPath = path.join(tempDir, 'newPath');
  const newConfigPath = path.join(newPath, 'config');
  fs.mkdirSync(newConfigPath, { recursive: true });

  await migrator.migrateConfigToNewPath(opts.userDataPath, newPath);

  assert.ok(fs.existsSync(path.join(newConfigPath, 'config.json')));
  assert.ok(fs.existsSync(path.join(newConfigPath, 'page_package.json')));
  assert.ok(fs.existsSync(path.join(newConfigPath, 'test_cases', 'case1.json')));
  assert.ok(fs.existsSync(path.join(newPath, 'data-version.json')));
});


// ─── migrateDataToPath ───────────────────────────────────────

test('migrateDataToPath 空路径返回错误', async () => {
  const { migrator } = createMigrator();
  const result = await migrator.migrateDataToPath('');
  assert.strictEqual(result.success, false);
  assert.ok(result.error);
});

test('migrateDataToPath 成功迁移文件', async () => {
  const { migrator, opts, tempDir } = createMigrator();
  fs.writeFileSync(path.join(opts.userConfigPath, 'config.json'), JSON.stringify({ a: 1 }));
  fs.writeFileSync(opts.versionFilePath, JSON.stringify({ dataVersion: '1.0.0' }));

  const targetPath = path.join(tempDir, 'target');
  const result = await migrator.migrateDataToPath(targetPath);

  assert.strictEqual(result.success, true);
  assert.ok(fs.existsSync(path.join(targetPath, 'config', 'config.json')));
  assert.ok(fs.existsSync(path.join(targetPath, 'data-version.json')));
});


// ─── deleteOldPathIfNeeded ────────────────────────────────────

test('deleteOldPathIfNeeded 无 marker 文件时 noop', async () => {
  const { migrator, opts } = createMigrator();
  // 不创建 old-path-to-delete.json
  await migrator.deleteOldPathIfNeeded();
  assert.ok(!fs.existsSync(path.join(opts.userDataPath, 'old-path-to-delete.json')));
});

test('deleteOldPathIfNeeded 有 marker 时删除旧路径', async () => {
  const { migrator, opts, tempDir } = createMigrator();
  // 创建一个待删除的旧路径
  const oldPath = path.join(tempDir, 'oldPath');
  fs.mkdirSync(oldPath, { recursive: true });
  fs.writeFileSync(path.join(oldPath, 'some-file.txt'), 'content');
  // 创建 marker
  fs.writeFileSync(
    path.join(opts.userDataPath, 'old-path-to-delete.json'),
    JSON.stringify({ oldPath })
  );

  await migrator.deleteOldPathIfNeeded();

  assert.ok(!fs.existsSync(oldPath), '旧路径应被删除');
  assert.ok(!fs.existsSync(path.join(opts.userDataPath, 'old-path-to-delete.json')), 'marker 文件应被删除');
});

test('deleteOldPathIfNeeded marker 指向当前路径时不删除', async () => {
  const { migrator, opts } = createMigrator();
  // marker 指向当前 userDataPath
  fs.writeFileSync(
    path.join(opts.userDataPath, 'old-path-to-delete.json'),
    JSON.stringify({ oldPath: opts.userDataPath })
  );

  await migrator.deleteOldPathIfNeeded();

  // 当前路径应仍存在
  assert.ok(fs.existsSync(opts.userDataPath));
  // marker 文件被删除
  assert.ok(!fs.existsSync(path.join(opts.userDataPath, 'old-path-to-delete.json')));
});


// ─── migrateFromOldLocation ──────────────────────────────────

test('migrateFromOldLocation 源目录无文件时 noop', async () => {
  const { migrator, opts } = createMigrator();
  // defaultConfigPath 下无 userFiles
  await migrator.migrateFromOldLocation();
  // 不应创建任何文件
  assert.ok(!fs.existsSync(path.join(opts.userConfigPath, 'config.json')));
});

test('migrateFromOldLocation 源文件是用户数据时复制', async () => {
  const { migrator, opts } = createMigrator();
  // page_package.json 有 apps, 算用户数据
  fs.writeFileSync(
    path.join(opts.defaultConfigPath, 'page_package.json'),
    JSON.stringify({ apps: [{ id: 1, name: 'TestApp' }] })
  );

  await migrator.migrateFromOldLocation();

  const result = JSON.parse(fs.readFileSync(path.join(opts.userConfigPath, 'page_package.json'), 'utf8'));
  assert.deepStrictEqual(result.apps, [{ id: 1, name: 'TestApp' }]);
});

test('migrateFromOldLocation 源文件是空默认数据时不复制', async () => {
  const { migrator, opts } = createMigrator();
  // page_package.json 是空 apps, 不算用户数据
  fs.writeFileSync(
    path.join(opts.defaultConfigPath, 'page_package.json'),
    JSON.stringify({ apps: [] })
  );

  await migrator.migrateFromOldLocation();

  assert.ok(!fs.existsSync(path.join(opts.userConfigPath, 'page_package.json')));
});

test('migrateFromOldLocation test_cases 目录中 .json 文件被复制', async () => {
  const { migrator, opts } = createMigrator();
  // 准备 defaultConfigPath/test_cases/case1.json
  const srcTestCases = path.join(opts.defaultConfigPath, 'test_cases');
  fs.mkdirSync(srcTestCases, { recursive: true });
  fs.writeFileSync(path.join(srcTestCases, 'case1.json'), JSON.stringify({ id: 1 }));
  fs.writeFileSync(path.join(srcTestCases, 'case2.json'), JSON.stringify({ id: 2 }));
  fs.writeFileSync(path.join(srcTestCases, 'readme.txt'), 'not json');  // 非 .json 不复制

  // 目标 test_cases 目录需预先存在 (生产环境由 UserDataService._ensureUserDataDir 创建)
  const dstTestCases = path.join(opts.userConfigPath, 'test_cases');
  fs.mkdirSync(dstTestCases, { recursive: true });

  await migrator.migrateFromOldLocation();

  assert.ok(fs.existsSync(path.join(dstTestCases, 'case1.json')));
  assert.ok(fs.existsSync(path.join(dstTestCases, 'case2.json')));
  assert.ok(!fs.existsSync(path.join(dstTestCases, 'readme.txt')));
});

test('migrateFromOldLocation 源文件是用户数据时覆盖目标 (首次启动场景)', async () => {
  // 注意: 此方法是首次启动迁移专用,不检查 dst 是否存在
  // 源是用户数据即覆盖 (与 _isUserData 判定一致)
  const { migrator, opts } = createMigrator();
  // 源 page_package.json 有 apps, 算用户数据
  fs.writeFileSync(
    path.join(opts.defaultConfigPath, 'page_package.json'),
    JSON.stringify({ apps: [{ id: 1, name: 'Source' }] })
  );
  // 目标已存在 (模拟首次启动场景下 dst 已被 copyDefaultsToUserData 复制默认)
  fs.writeFileSync(
    path.join(opts.userConfigPath, 'page_package.json'),
    JSON.stringify({ apps: [{ id: 2, name: 'Existing' }] })
  );

  await migrator.migrateFromOldLocation();

  // 源是用户数据,直接覆盖 (这是首次启动迁移的预期行为)
  const result = JSON.parse(fs.readFileSync(path.join(opts.userConfigPath, 'page_package.json'), 'utf8'));
  assert.strictEqual(result.apps[0].name, 'Source', '源是用户数据时覆盖目标 (首次启动场景)');
});


// ─── _copyDirectoryRecursive / _deleteDirectoryRecursive ───

test('_copyDirectoryRecursive 递归复制嵌套目录', () => {
  const { migrator, tempDir } = createMigrator();
  const src = path.join(tempDir, 'src');
  const dst = path.join(tempDir, 'dst');
  fs.mkdirSync(path.join(src, 'sub1', 'sub2'), { recursive: true });
  fs.writeFileSync(path.join(src, 'file1.txt'), 'a');
  fs.writeFileSync(path.join(src, 'sub1', 'file2.txt'), 'b');
  fs.writeFileSync(path.join(src, 'sub1', 'sub2', 'file3.txt'), 'c');

  migrator._copyDirectoryRecursive(src, dst);

  assert.ok(fs.existsSync(path.join(dst, 'file1.txt')));
  assert.ok(fs.existsSync(path.join(dst, 'sub1', 'file2.txt')));
  assert.ok(fs.existsSync(path.join(dst, 'sub1', 'sub2', 'file3.txt')));
});

test('_deleteDirectoryRecursive 递归删除目录', () => {
  const { migrator, tempDir } = createMigrator();
  const target = path.join(tempDir, 'toDelete');
  fs.mkdirSync(path.join(target, 'sub1'), { recursive: true });
  fs.writeFileSync(path.join(target, 'file1.txt'), 'a');
  fs.writeFileSync(path.join(target, 'sub1', 'file2.txt'), 'b');

  migrator._deleteDirectoryRecursive(target);

  assert.ok(!fs.existsSync(target));
});

test('_deleteDirectoryRecursive 不存在的路径 noop', () => {
  const { migrator, tempDir } = createMigrator();
  const target = path.join(tempDir, 'notExist');
  // 不抛异常
  migrator._deleteDirectoryRecursive(target);
  assert.ok(!fs.existsSync(target));
});

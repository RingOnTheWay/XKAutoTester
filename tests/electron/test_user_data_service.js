// UserDataService 重构后测试
// 验证: 1) 持 migrator + registry 实例 2) 委托调用正确传递 3) _defaultConfigs 不含 config.json
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const os = require('os');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const USER_DATA_SERVICE_PATH = path.join(
  PROJECT_ROOT, 'electron', 'src', 'main', 'services', 'UserDataService.js'
);
const VERSION_SERVICE_PATH = path.join(
  PROJECT_ROOT, 'electron', 'src', 'main', 'services', 'VersionService.js'
);

// 创建临时目录
function mkTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'xkat-uds-test-'));
}

/**
 * mock electron app + UserDataMigrator + WindowsRegistryBridge
 * 返回 mock 实例的引用 + restore 函数
 */
function setupMocks(tempDir, opts = {}) {
  const migratorCalls = [];
  const registryCalls = [];

  const mockMigrator = {
    deleteOldPathIfNeeded: async () => { migratorCalls.push('deleteOldPathIfNeeded'); },
    copyDefaultsToUserData: async () => { migratorCalls.push('copyDefaultsToUserData'); },
    migrateFromOldLocation: async () => { migratorCalls.push('migrateFromOldLocation'); },
    smartMergeConfig: async () => { migratorCalls.push('smartMergeConfig'); },
    migrateConfigToNewPath: async (oldPath, newPath) => {
      migratorCalls.push({ method: 'migrateConfigToNewPath', oldPath, newPath });
    },
    migrateDataToPath: async (newPath) => {
      migratorCalls.push({ method: 'migrateDataToPath', newPath });
      return { success: true };
    },
    updatePaths: (paths) => { migratorCalls.push({ method: 'updatePaths', paths }); },
  };

  const mockRegistry = {
    writePath: (valueName, dataPath) => {
      registryCalls.push({ valueName, dataPath });
    },
  };

  const MigratorClass = function (opts) {
    mockMigrator.constructorOpts = opts;
    return mockMigrator;
  };
  const RegistryClass = function () { return mockRegistry; };

  const electronMock = {
    app: {
      getPath: (name) => {
        if (name === 'appData') return tempDir;
        return path.join(tempDir, name);
      },
      setPath: () => {},
    },
  };

  const origLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'electron') return electronMock;
    if (request === '../UserDataMigrator' || request === './UserDataMigrator') return MigratorClass;
    if (request === '../WindowsRegistryBridge' || request === './WindowsRegistryBridge') return RegistryClass;
    return origLoad.call(this, request, parent, isMain);
  };

  return {
    migrator: mockMigrator,
    registry: mockRegistry,
    migratorCalls,
    registryCalls,
    restore: () => { Module._load = origLoad; },
  };
}

function loadUserDataService() {
  delete require.cache[require.resolve(USER_DATA_SERVICE_PATH)];
  return require(USER_DATA_SERVICE_PATH);
}

/**
 * 构造 UserDataService 实例 (projectRoot 指向 tempDir/project)
 * projectRoot 下不创建 config/ 目录, _getDefaultConfig 在迁移时调用失败 → 返回 {}
 */
function createService(tempDir, mocks) {
  const projectRoot = path.join(tempDir, 'project');
  fs.mkdirSync(projectRoot, { recursive: true });
  // 创建空 config 目录以避免 _ensureUserDataDir 之外的副作用
  fs.mkdirSync(path.join(projectRoot, 'config'), { recursive: true });
  const UserDataService = loadUserDataService();
  // 使用真实 VersionService 读取 tempDir/project/version.json
  // 让 _getAppVersion 返回真实版本值，与 data-version.json 比较判断版本变更
  delete require.cache[require.resolve(VERSION_SERVICE_PATH)];
  const { VersionService } = require(VERSION_SERVICE_PATH);
  const versionService = new VersionService(projectRoot);
  return new UserDataService(projectRoot, versionService);
}


// ─── 构造函数测试 ──────────────────────────────────────────────

test('构造函数创建 migrator + registry 实例', () => {
  const tempDir = mkTempDir();
  const mocks = setupMocks(tempDir);
  try {
    const service = createService(tempDir, mocks);

    assert.ok(service.migrator, 'migrator 实例应存在');
    assert.ok(service.registry, 'registry 实例应存在');
    assert.strictEqual(service.migrator, mocks.migrator, 'migrator 应为 mock 实例');
    assert.strictEqual(service.registry, mocks.registry, 'registry 应为 mock 实例');
  } finally {
    mocks.restore();
  }
});

test('构造函数向 migrator 传递完整路径选项', () => {
  const tempDir = mkTempDir();
  const mocks = setupMocks(tempDir);
  try {
    const service = createService(tempDir, mocks);

    const opts = mocks.migrator.constructorOpts;
    assert.ok(opts.userDataPath, 'userDataPath 应传递');
    assert.ok(opts.userConfigPath, 'userConfigPath 应传递');
    assert.ok(opts.defaultConfigPath, 'defaultConfigPath 应传递');
    assert.ok(opts.versionFilePath, 'versionFilePath 应传递');
    assert.ok(opts.defaultUserDataPath, 'defaultUserDataPath 应传递');
    assert.deepStrictEqual(opts.userFiles, ['config.json', 'page_package.json', 'test_plans.json', 'scheduled_plans.json']);
    assert.deepStrictEqual(opts.userDirs, ['test_cases']);
    assert.ok(opts.defaultConfigs, 'defaultConfigs 应传递');
  } finally {
    mocks.restore();
  }
});

test('构造函数调用 registry.writePath 写入 UserDataPath', () => {
  const tempDir = mkTempDir();
  const mocks = setupMocks(tempDir);
  try {
    const service = createService(tempDir, mocks);

    assert.strictEqual(mocks.registryCalls.length, 1, '应调用一次 writePath');
    assert.strictEqual(mocks.registryCalls[0].valueName, 'UserDataPath');
    assert.strictEqual(mocks.registryCalls[0].dataPath, service.userDataPath);
  } finally {
    mocks.restore();
  }
});

test('_defaultConfigs 不应包含 config.json', () => {
  const tempDir = mkTempDir();
  const mocks = setupMocks(tempDir);
  try {
    const service = createService(tempDir, mocks);

    assert.ok(
      !('config.json' in service._defaultConfigs),
      '_defaultConfigs 不应包含 config.json (权威源为 config/config.json)'
    );
    assert.ok('page_package.json' in service._defaultConfigs);
    assert.ok('test_plans.json' in service._defaultConfigs);
    assert.ok('scheduled_plans.json' in service._defaultConfigs);
  } finally {
    mocks.restore();
  }
});


// ─── runMigration 委托测试 ────────────────────────────────────

test('runMigration 首次启动调用 migrator.copyDefaultsToUserData + migrateFromOldLocation', async () => {
  const tempDir = mkTempDir();
  const mocks = setupMocks(tempDir);
  try {
    const service = createService(tempDir, mocks);
    // 首次启动: versionFile 不存在
    if (fs.existsSync(service.versionFilePath)) {
      fs.unlinkSync(service.versionFilePath);
    }

    await service.runMigration();

    assert.ok(mocks.migratorCalls.includes('deleteOldPathIfNeeded'), '应调用 deleteOldPathIfNeeded');
    assert.ok(mocks.migratorCalls.includes('copyDefaultsToUserData'), '首次启动应调用 copyDefaultsToUserData');
    assert.ok(mocks.migratorCalls.includes('migrateFromOldLocation'), '首次启动应调用 migrateFromOldLocation');
    assert.ok(!mocks.migratorCalls.includes('smartMergeConfig'), '首次启动不应调用 smartMergeConfig');
  } finally {
    mocks.restore();
  }
});

test('runMigration 版本变更时调用 migrator.smartMergeConfig', async () => {
  const tempDir = mkTempDir();
  const mocks = setupMocks(tempDir);
  try {
    const service = createService(tempDir, mocks);
    // 非首次启动: 写一个旧版本的 versionFile
    fs.writeFileSync(service.versionFilePath, JSON.stringify({ dataVersion: '0.0.0', lastMigrated: '2020-01-01' }), 'utf8');
    // 写一个有效的 projectRoot/version.json
    fs.writeFileSync(
      path.join(service.projectRoot, 'version.json'),
      JSON.stringify({ version: '1.2.3' }),
      'utf8'
    );

    await service.runMigration();

    assert.ok(mocks.migratorCalls.includes('deleteOldPathIfNeeded'));
    assert.ok(mocks.migratorCalls.includes('smartMergeConfig'), '版本变更时应调用 smartMergeConfig');
    assert.ok(!mocks.migratorCalls.includes('copyDefaultsToUserData'), '非首次启动不应调用 copyDefaultsToUserData');
    assert.ok(!mocks.migratorCalls.includes('migrateFromOldLocation'), '非首次启动不应调用 migrateFromOldLocation');
  } finally {
    mocks.restore();
  }
});

test('runMigration 版本未变更时不调用 smartMergeConfig', async () => {
  const tempDir = mkTempDir();
  const mocks = setupMocks(tempDir);
  try {
    const service = createService(tempDir, mocks);
    // 版本一致
    fs.writeFileSync(
      path.join(service.projectRoot, 'version.json'),
      JSON.stringify({ version: '1.2.3' }),
      'utf8'
    );
    fs.writeFileSync(
      service.versionFilePath,
      JSON.stringify({ dataVersion: '1.2.3', lastMigrated: '2020-01-01' }),
      'utf8'
    );

    await service.runMigration();

    assert.ok(!mocks.migratorCalls.includes('smartMergeConfig'), '版本一致时不应调用 smartMergeConfig');
    assert.ok(!mocks.migratorCalls.includes('copyDefaultsToUserData'));
  } finally {
    mocks.restore();
  }
});


// ─── changeDataPath 委托测试 ───────────────────────────────────

test('changeDataPath 调用 migrator.migrateConfigToNewPath + updatePaths + registry.writePath', async () => {
  const tempDir = mkTempDir();
  const mocks = setupMocks(tempDir);
  try {
    const service = createService(tempDir, mocks);
    const newPath = path.join(tempDir, 'newDataPath', 'XKAutoTester');

    await service.changeDataPath(newPath);

    // migrateConfigToNewPath 被调用
    const migrateCall = mocks.migratorCalls.find(c => typeof c === 'object' && c.method === 'migrateConfigToNewPath');
    assert.ok(migrateCall, '应调用 migrateConfigToNewPath');

    // updatePaths 被调用,传递新路径
    const updateCall = mocks.migratorCalls.find(c => typeof c === 'object' && c.method === 'updatePaths');
    assert.ok(updateCall, '应调用 updatePaths');
    assert.strictEqual(updateCall.paths.userDataPath, newPath);
    assert.strictEqual(updateCall.paths.userConfigPath, path.join(newPath, 'config'));
    assert.strictEqual(updateCall.paths.versionFilePath, path.join(newPath, 'data-version.json'));

    // registry.writePath 被调用 (构造 1 次 + changeDataPath 1 次 = 2 次)
    assert.strictEqual(mocks.registryCalls.length, 2);
    assert.strictEqual(mocks.registryCalls[1].valueName, 'UserDataPath');
    assert.strictEqual(mocks.registryCalls[1].dataPath, newPath);

    // service 自身路径已更新
    assert.strictEqual(service.userDataPath, newPath);
  } finally {
    mocks.restore();
  }
});

test('changeDataPath 空路径返回错误', async () => {
  const tempDir = mkTempDir();
  const mocks = setupMocks(tempDir);
  try {
    const service = createService(tempDir, mocks);
    const result = await service.changeDataPath('');
    assert.strictEqual(result.success, false);
    assert.ok(result.error);
  } finally {
    mocks.restore();
  }
});


// ─── resetToDefaultPath 委托测试 ────────────────────────────────

test('resetToDefaultPath 调用 migrator.migrateConfigToNewPath + updatePaths + registry.writePath', async () => {
  const tempDir = mkTempDir();
  const mocks = setupMocks(tempDir);
  try {
    const service = createService(tempDir, mocks);
    // 先将 userDataPath 改为非默认路径 (模拟用户已切换过)
    const customPath = path.join(tempDir, 'custom', 'XKAutoTester');
    fs.mkdirSync(path.join(customPath, 'config'), { recursive: true });
    service.userDataPath = customPath;
    service.userConfigPath = path.join(customPath, 'config');
    service.versionFilePath = path.join(customPath, 'data-version.json');

    await service.resetToDefaultPath();

    // migrateConfigToNewPath 被调用,源 = customPath, 目标 = defaultUserDataPath
    const migrateCall = mocks.migratorCalls.find(c => typeof c === 'object' && c.method === 'migrateConfigToNewPath');
    assert.ok(migrateCall, '应调用 migrateConfigToNewPath');
    assert.strictEqual(migrateCall.oldPath, customPath);
    assert.strictEqual(migrateCall.newPath, service._defaultUserDataPath);

    // updatePaths 被调用
    const updateCall = mocks.migratorCalls.find(c => typeof c === 'object' && c.method === 'updatePaths');
    assert.ok(updateCall, '应调用 updatePaths');
    assert.strictEqual(updateCall.paths.userDataPath, service._defaultUserDataPath);

    // registry.writePath 被调用 (构造 1 + reset 1 = 2)
    assert.strictEqual(mocks.registryCalls.length, 2);
    assert.strictEqual(mocks.registryCalls[1].dataPath, service._defaultUserDataPath);

    // service 路径已重置
    assert.strictEqual(service.userDataPath, service._defaultUserDataPath);
  } finally {
    mocks.restore();
  }
});


// ─── migrateDataToPath 委托测试 ────────────────────────────────

test('migrateDataToPath 委托到 migrator.migrateDataToPath', async () => {
  const tempDir = mkTempDir();
  const mocks = setupMocks(tempDir);
  try {
    const service = createService(tempDir, mocks);
    const targetPath = path.join(tempDir, 'target');

    const result = await service.migrateDataToPath(targetPath);

    const call = mocks.migratorCalls.find(c => typeof c === 'object' && c.method === 'migrateDataToPath');
    assert.ok(call, '应委托到 migrator.migrateDataToPath');
    assert.strictEqual(call.newPath, targetPath);
    assert.strictEqual(result.success, true);
  } finally {
    mocks.restore();
  }
});


// ─── getter 测试 ────────────────────────────────────────────────

test('4 个 getter 返回正确路径', () => {
  const tempDir = mkTempDir();
  const mocks = setupMocks(tempDir);
  try {
    const service = createService(tempDir, mocks);

    assert.strictEqual(service.getUserConfigPath(), service.userConfigPath);
    assert.strictEqual(service.getProjectRoot(), service.projectRoot);
    assert.strictEqual(service.getUserDataPath(), service.userDataPath);
    assert.strictEqual(service.getDefaultUserDataPath(), service._defaultUserDataPath);
  } finally {
    mocks.restore();
  }
});

// 配置一致性测试 - 验证 config.json 为唯一权威源, 三处消费方字段值一致
// 防止"三份硬编码副本"问题复发
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..', '..');

// 权威源: config/config.json
const TEMPLATE_PATH = path.join(PROJECT_ROOT, 'config', 'config.json');

// JS 消费方: UserDataService.js
const USER_DATA_SERVICE_PATH = path.join(
  PROJECT_ROOT, 'electron', 'src', 'main', 'services', 'UserDataService.js'
);

// JS 消费方: UserDataMigrator.js (从 UserDataService 抽出, 持有 _getDefaultConfig)
const USER_DATA_MIGRATOR_PATH = path.join(
  PROJECT_ROOT, 'electron', 'src', 'main', 'services', 'UserDataMigrator.js'
);

// Python 消费方: config.py
const CONFIG_PY_PATH = path.join(PROJECT_ROOT, 'src', 'main', 'utils', 'config.py');


test('config/config.json 模板文件存在', () => {
  assert.ok(fs.existsSync(TEMPLATE_PATH), 'config/config.json 必须存在 (权威源)');
});

test('config/config.json autoCheckUpdate = true', () => {
  const config = JSON.parse(fs.readFileSync(TEMPLATE_PATH, 'utf8'));
  assert.strictEqual(
    config.APP_SETTINGS.autoCheckUpdate, true,
    'autoCheckUpdate 必须为 true (与 AGENTS.md 文档一致)'
  );
});

test('UserDataService.js 不再硬编码 config.json 副本', () => {
  const content = fs.readFileSync(USER_DATA_SERVICE_PATH, 'utf8');
  // 检查 _defaultConfigs 对象中不应包含 config.json 键
  assert.ok(
    !/_defaultConfigs\s*=\s*{\s*['"]config\.json['"]/.test(content),
    '_defaultConfigs 不应包含 config.json 键 (权威源应从文件读取)'
  );
  // 检查不应再有完整的 LOG_CONFIG/SCRCPY_PARAMS/APP_SETTINGS 副本
  assert.ok(
    !/LOG_CONFIG:\s*{\s*level:/.test(content),
    '不应硬编码 LOG_CONFIG 副本'
  );
  assert.ok(
    !/SCRCPY_PARAMS:\s*{\s*max_size:/.test(content),
    '不应硬编码 SCRCPY_PARAMS 副本'
  );
});

test('UserDataMigrator.js _getDefaultConfig 从模板文件读取', () => {
  const content = fs.readFileSync(USER_DATA_MIGRATOR_PATH, 'utf8');
  assert.ok(
    /_getDefaultConfig[\s\S]*?readFileSync[\s\S]*?config\.json/.test(content),
    '_getDefaultConfig 应使用 fs.readFileSync 读取 config.json 模板'
  );
  assert.ok(
    /_getDefaultConfig[\s\S]*?return\s*{}/.test(content),
    '_getDefaultConfig 读取失败时应返回 {} 容错'
  );
});

test('config.py 不再硬编码 DEFAULT_CONFIG', () => {
  const content = fs.readFileSync(CONFIG_PY_PATH, 'utf8');
  assert.ok(
    !/^DEFAULT_CONFIG\s*=/m.test(content),
    'config.py 不应再有 DEFAULT_CONFIG 模块级常量'
  );
  assert.ok(
    !/_save_default_config/.test(content),
    'config.py 不应再有 _save_default_config 方法 (Python 不写模板文件)'
  );
});

test('config.py _load_config 失败时抛 FileNotFoundError', () => {
  const content = fs.readFileSync(CONFIG_PY_PATH, 'utf8');
  assert.ok(
    /_load_config[\s\S]*?FileNotFoundError/.test(content),
    '_load_config 文件不存在时应抛 FileNotFoundError'
  );
});

test('config.py _detect_config_path 支持 XKAUTOTESTER_USER_DATA 环境变量', () => {
  const content = fs.readFileSync(CONFIG_PY_PATH, 'utf8');
  assert.ok(
    /XKAUTOTESTER_USER_DATA/.test(content),
    '_detect_config_path 应优先读取 XKAUTOTESTER_USER_DATA 环境变量'
  );
});

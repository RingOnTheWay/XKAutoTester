// Aapt2OutputParser 单元测试
// 验证 aapt2 dump badging 输出的 regex 解析
// 策略: 纯函数测试, 先内联字符串 (tracer bullet), 后 fixture 驱动 (复杂场景)
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const Aapt2OutputParser = require(path.join(
  __dirname, '..', '..', 'electron', 'src', 'main', 'services', 'apk', 'Aapt2OutputParser.js'
));

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

function loadFixture(name) {
  return fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf8');
}

// ── slice 1: package 行解析 (tracer bullet) ───────────────

test('parse package 行提取 packageName/versionCode/versionName', () => {
  const parser = new Aapt2OutputParser();
  const output = "package: name='com.example.app' versionCode='42' versionName='1.2.3' compileSdkVersion='30'";

  const result = parser.parse(output);

  assert.strictEqual(result.packageName, 'com.example.app');
  assert.strictEqual(result.versionCode, '42');
  assert.strictEqual(result.versionName, '1.2.3');
});

// ── slice 2: launchable-activity 行 ───────────────────────

test('parse launchable-activity 行提取 activityName', () => {
  const parser = new Aapt2OutputParser();
  const output = "launchable-activity: name='com.example.app.MainActivity'  label='App' icon=''";

  const result = parser.parse(output);

  assert.strictEqual(result.activityName, 'com.example.app.MainActivity');
});

// ── slice 3: application 默认标签 + locale 标签 ──────────

test('parse application 行提取默认 applicationLabel, application-label 行写入 localeLabels.default', () => {
  const parser = new Aapt2OutputParser();
  const output = [
    "application: label='MyApp' icon='res/ic.png'",
    "application-label: 'MyApp'",
  ].join('\n');

  const result = parser.parse(output);

  assert.strictEqual(result.applicationLabel, 'MyApp');
  assert.strictEqual(result.localeLabels.default, 'MyApp');
});

test('parse application-label-<locale> 行写入 localeLabels[locale]', () => {
  const parser = new Aapt2OutputParser();
  const output = [
    "application-label-zh-CN: '我的应用'",
    "application-label-en-US: 'MyApp'",
    "application-label-en: 'MyApp'",
  ].join('\n');

  const result = parser.parse(output);

  assert.strictEqual(result.localeLabels['zh-CN'], '我的应用');
  assert.strictEqual(result.localeLabels['en-US'], 'MyApp');
  assert.strictEqual(result.localeLabels.en, 'MyApp');
});

// ── slice 4: uses-permission 行 ───────────────────────────

test('parse uses-permission 行收集到 permissions 数组', () => {
  const parser = new Aapt2OutputParser();
  const output = [
    "uses-permission: name='android.permission.INTERNET'",
    "uses-permission: name='android.permission.CAMERA'",
    "uses-permission: name='android.permission.WRITE_EXTERNAL_STORAGE'",
  ].join('\n');

  const result = parser.parse(output);

  assert.deepStrictEqual(result.permissions, [
    'android.permission.INTERNET',
    'android.permission.CAMERA',
    'android.permission.WRITE_EXTERNAL_STORAGE',
  ]);
});

// ── slice 5: uses-feature / uses-implied-feature 行 ───────

test('parse uses-feature 与 uses-implied-feature 行收集到 features 数组', () => {
  const parser = new Aapt2OutputParser();
  const output = [
    "uses-feature: name='android.hardware.camera'",
    "uses-feature: name='android.hardware.bluetooth'",
    "uses-implied-feature: name='android.hardware.touchscreen' reason='default'",
  ].join('\n');

  const result = parser.parse(output);

  assert.deepStrictEqual(result.features, [
    'android.hardware.camera',
    'android.hardware.bluetooth',
    'android.hardware.touchscreen',
  ]);
});

// ── slice 6: 边界 + fixture 驱动 ──────────────────────────

test('parse 空字符串返回空字段对象, 不抛异常', () => {
  const parser = new Aapt2OutputParser();

  const result = parser.parse('');

  assert.strictEqual(result.packageName, '');
  assert.strictEqual(result.activityName, '');
  assert.deepStrictEqual(result.permissions, []);
  assert.deepStrictEqual(result.features, []);
  assert.deepStrictEqual(result.localeLabels, {});
});

test('parse null/undefined 输入返回空字段对象, 不抛异常', () => {
  const parser = new Aapt2OutputParser();

  const r1 = parser.parse(null);
  const r2 = parser.parse(undefined);

  assert.strictEqual(r1.packageName, '');
  assert.strictEqual(r2.packageName, '');
});

test('parse 无 package 行时 packageName 为空', () => {
  const parser = new Aapt2OutputParser();
  const output = "application: label='App'\napplication-label: 'App'";

  const result = parser.parse(output);

  assert.strictEqual(result.packageName, '');
  assert.strictEqual(result.applicationLabel, 'App');
});

test('parse fixture 完整 badging 输出解析所有字段', () => {
  const parser = new Aapt2OutputParser();
  const output = loadFixture('aapt2_output_full.txt');

  const result = parser.parse(output);

  assert.strictEqual(result.packageName, 'com.example.demo');
  assert.strictEqual(result.versionCode, '1024');
  assert.strictEqual(result.versionName, '2.1.0');
  assert.strictEqual(result.activityName, 'com.example.app.MainActivity');
  assert.strictEqual(result.applicationLabel, 'DemoApp');
  assert.deepStrictEqual(result.permissions, [
    'android.permission.INTERNET',
    'android.permission.ACCESS_NETWORK_STATE',
    'android.permission.CAMERA',
  ]);
  assert.deepStrictEqual(result.features, [
    'android.hardware.camera',
    'android.hardware.camera.autofocus',
    'android.hardware.touchscreen',
  ]);
  assert.strictEqual(result.localeLabels.default, 'DemoApp');
  assert.strictEqual(result.localeLabels['zh-CN'], '演示应用');
  assert.strictEqual(result.localeLabels['en-US'], 'DemoApp');
  assert.strictEqual(result.localeLabels.en, 'DemoApp');
  assert.strictEqual(result.localeLabels['ja-JP'], 'デモアプリ');
});

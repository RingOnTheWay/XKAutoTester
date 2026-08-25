// ApkParserService facade 集成测试
// 验证: 1) initialize 委托 invoker.resolvePath 2) parseApk 校验链 + 委托 3 collaborator
// 策略: 构造后替换 _invoker/_parser/_labelResolver 为 mock, 验证编排逻辑 (不触真实 collaborator)
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const Module = require('module');

const APK_PARSER_SERVICE_PATH = path.join(
  __dirname, '..', '..', 'electron', 'src', 'main', 'services', 'ApkParserService.js'
);
const ASYNC_FS_PATH = path.join(
  __dirname, '..', '..', 'electron', 'src', 'main', 'utils', 'asyncFs.js'
);

const PROJECT_ROOT = path.join(__dirname, '..', '..');

// ── mock 工厂 ──────────────────────────────────────────────

const i18nMock = {
  t: (key, params) => {
    if (params && Object.keys(params).length > 0) {
      return `${key}:${JSON.stringify(params)}`;
    }
    return key;
  },
};

function makeInvokerMock({ resolvePathResult = '/fake/aapt2.exe', dumpBadgingResult = null } = {}) {
  const calls = { resolvePath: 0, dumpBadging: [] };
  return {
    calls,
    async resolvePath() {
      calls.resolvePath++;
      return resolvePathResult;
    },
    async dumpBadging(aapt2Path, apkPath) {
      calls.dumpBadging.push({ aapt2Path, apkPath });
      return dumpBadgingResult || { success: true, output: "package: name='com.example' versionCode='1'\n" };
    },
  };
}

function makeParserMock({ parseResult = null } = {}) {
  const calls = { parse: [] };
  return {
    calls,
    parse(output) {
      calls.parse.push({ output });
      return parseResult || {
        packageName: 'com.example',
        activityName: 'com.example.MainActivity',
        versionName: '1.0',
        versionCode: '1',
        applicationLabel: 'ExampleApp',
        permissions: [],
        features: [],
        localeLabels: { default: 'ExampleApp' },
      };
    },
  };
}

function makeResolverMock({ resolveResult = 'ExampleApp' } = {}) {
  const calls = { resolve: [] };
  return {
    calls,
    resolve(localeLabels, defaultLabel) {
      calls.resolve.push({ localeLabels, defaultLabel });
      return resolveResult;
    },
  };
}

function makeAsyncFsMock({ existsResult = true } = {}) {
  const calls = { exists: [] };
  return {
    calls,
    async exists(p) {
      calls.exists.push({ path: p });
      return existsResult;
    },
  };
}

function loadServiceWithAsyncFsMock(asyncFsMock) {
  // 覆盖 asyncFs require 返回 mock
  const origLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === '../utils/asyncFs') return asyncFsMock;
    return origLoad.call(this, request, parent, isMain);
  };
  delete require.cache[require.resolve(APK_PARSER_SERVICE_PATH)];
  const ApkParserService = require(APK_PARSER_SERVICE_PATH);
  Module._load = origLoad;
  return ApkParserService;
}

// ── constructor 测试 ─────────────────────────────────────

test('constructor 收 projectRoot + i18nService + 建 3 collaborator 实例', () => {
  const ApkParserService = require(APK_PARSER_SERVICE_PATH);
  const svc = new ApkParserService(PROJECT_ROOT, i18nMock);

  assert.strictEqual(svc.projectRoot, PROJECT_ROOT);
  assert.strictEqual(svc.i18nService, i18nMock);
  assert.strictEqual(svc.aapt2Path, null);
  assert.ok(svc._invoker, '_invoker 实例建');
  assert.ok(svc._parser, '_parser 实例建');
  assert.ok(svc._labelResolver, '_labelResolver 实例建');
});

test('constructor i18nService 默认 null 不抛', () => {
  const ApkParserService = require(APK_PARSER_SERVICE_PATH);
  const svc = new ApkParserService(PROJECT_ROOT);

  assert.strictEqual(svc.i18nService, null);
  assert.strictEqual(svc.aapt2Path, null);
});

test('constructor collaborators 注入: 3 mock 替代默认 new (对称 ADBService collaborators)', () => {
  const ApkParserService = require(APK_PARSER_SERVICE_PATH);
  const invokerMock = makeInvokerMock();
  const parserMock = makeParserMock();
  const resolverMock = makeResolverMock();

  const svc = new ApkParserService(PROJECT_ROOT, i18nMock, {
    invoker: invokerMock,
    parser: parserMock,
    labelResolver: resolverMock,
  });

  assert.strictEqual(svc._invoker, invokerMock, '注入 invoker mock');
  assert.strictEqual(svc._parser, parserMock, '注入 parser mock');
  assert.strictEqual(svc._labelResolver, resolverMock, '注入 labelResolver mock');
});

// ── initialize 测试 ─────────────────────────────────────

test('initialize 委托 invoker.resolvePath + 缓存 aapt2Path', async () => {
  const ApkParserService = require(APK_PARSER_SERVICE_PATH);
  const svc = new ApkParserService(PROJECT_ROOT, i18nMock);
  const invokerMock = makeInvokerMock({ resolvePathResult: '/custom/aapt2.exe' });
  svc._invoker = invokerMock;

  await svc.initialize();

  assert.strictEqual(svc.aapt2Path, '/custom/aapt2.exe');
  assert.strictEqual(invokerMock.calls.resolvePath, 1);
});

// ── parseApk 校验链测试 ─────────────────────────────────

test('parseApk 路径空/非字符串 返 invalidPath', async () => {
  const ApkParserService = require(APK_PARSER_SERVICE_PATH);
  const svc = new ApkParserService(PROJECT_ROOT, i18nMock);

  const r1 = await svc.parseApk('');
  assert.strictEqual(r1.success, false);
  assert.strictEqual(r1.error, 'apkErrors.invalidPath');

  const r2 = await svc.parseApk(null);
  assert.strictEqual(r2.success, false);
  assert.strictEqual(r2.error, 'apkErrors.invalidPath');

  const r3 = await svc.parseApk(123);
  assert.strictEqual(r3.success, false);
  assert.strictEqual(r3.error, 'apkErrors.invalidPath');
});

test('parseApk aapt2Path 未初始化 返 aapt2NotFound', async () => {
  const ApkParserService = require(APK_PARSER_SERVICE_PATH);
  const svc = new ApkParserService(PROJECT_ROOT, i18nMock);
  // 不调 initialize, aapt2Path = null

  const r = await svc.parseApk('/path/app.apk');

  assert.strictEqual(r.success, false);
  assert.strictEqual(r.error, 'apkErrors.aapt2NotFound');
});

test('parseApk 文件不存在 返 fileNotFound', async () => {
  const asyncFsMock = makeAsyncFsMock({ existsResult: false });
  const ApkParserService = loadServiceWithAsyncFsMock(asyncFsMock);
  const svc = new ApkParserService(PROJECT_ROOT, i18nMock);
  svc.aapt2Path = '/fake/aapt2.exe';

  const r = await svc.parseApk('/path/app.apk');

  assert.strictEqual(r.success, false);
  assert.strictEqual(r.error, 'apkErrors.fileNotFound');
  assert.strictEqual(asyncFsMock.calls.exists.length, 1);
  assert.strictEqual(asyncFsMock.calls.exists[0].path, '/path/app.apk');
});

test('parseApk exists 抛错 返 fileAccessError', async () => {
  const asyncFsMock = {
    async exists() { throw new Error('EACCES'); },
  };
  const ApkParserService = loadServiceWithAsyncFsMock(asyncFsMock);
  const svc = new ApkParserService(PROJECT_ROOT, i18nMock);
  svc.aapt2Path = '/fake/aapt2.exe';

  const r = await svc.parseApk('/path/app.apk');

  assert.strictEqual(r.success, false);
  assert.strictEqual(r.error, 'apkErrors.fileAccessError');
});

test('parseApk 扩展名非 .apk 返 invalidFormat', async () => {
  const asyncFsMock = makeAsyncFsMock({ existsResult: true });
  const ApkParserService = loadServiceWithAsyncFsMock(asyncFsMock);
  const svc = new ApkParserService(PROJECT_ROOT, i18nMock);
  svc.aapt2Path = '/fake/aapt2.exe';

  const r = await svc.parseApk('/path/app.txt');

  assert.strictEqual(r.success, false);
  assert.strictEqual(r.error, 'apkErrors.invalidFormat');
});

// ── parseApk 委托链测试 ─────────────────────────────────

test('parseApk invoker.dumpBadging 失败 透传错误', async () => {
  const asyncFsMock = makeAsyncFsMock({ existsResult: true });
  const ApkParserService = loadServiceWithAsyncFsMock(asyncFsMock);
  const svc = new ApkParserService(PROJECT_ROOT, i18nMock);
  svc.aapt2Path = '/fake/aapt2.exe';
  svc._invoker = makeInvokerMock({
    dumpBadgingResult: { success: false, error: 'apkErrors.parseFailed' },
  });

  const r = await svc.parseApk('/path/app.apk');

  assert.strictEqual(r.success, false);
  assert.strictEqual(r.error, 'apkErrors.parseFailed');
  assert.strictEqual(svc._invoker.calls.dumpBadging.length, 1);
  assert.strictEqual(svc._invoker.calls.dumpBadging[0].aapt2Path, '/fake/aapt2.exe');
  assert.strictEqual(svc._invoker.calls.dumpBadging[0].apkPath, '/path/app.apk');
});

test('parseApk parser.parse 返无 packageName 返 noPackageName', async () => {
  const asyncFsMock = makeAsyncFsMock({ existsResult: true });
  const ApkParserService = loadServiceWithAsyncFsMock(asyncFsMock);
  const svc = new ApkParserService(PROJECT_ROOT, i18nMock);
  svc.aapt2Path = '/fake/aapt2.exe';
  svc._invoker = makeInvokerMock();
  svc._parser = makeParserMock({
    parseResult: { packageName: '', activityName: '', applicationLabel: '', localeLabels: {} },
  });

  const r = await svc.parseApk('/path/app.apk');

  assert.strictEqual(r.success, false);
  assert.strictEqual(r.error, 'apkErrors.noPackageName');
});

test('parseApk 成功: 委托 invoker + parser + resolver, 返 resolved 标签', async () => {
  const asyncFsMock = makeAsyncFsMock({ existsResult: true });
  const ApkParserService = loadServiceWithAsyncFsMock(asyncFsMock);
  const svc = new ApkParserService(PROJECT_ROOT, i18nMock);
  svc.aapt2Path = '/fake/aapt2.exe';
  const invokerMock = makeInvokerMock({
    dumpBadgingResult: { success: true, output: "package: name='com.example'\napplication-label-zh-CN:'测试'" },
  });
  const parserMock = makeParserMock({
    parseResult: {
      packageName: 'com.example',
      activityName: 'com.example.MainActivity',
      versionName: '1.0',
      versionCode: '1',
      applicationLabel: 'ExampleApp',
      permissions: ['android.permission.INTERNET'],
      features: [],
      localeLabels: { default: 'ExampleApp', 'zh-CN': '测试' },
    },
  });
  const resolverMock = makeResolverMock({ resolveResult: '测试' });
  svc._invoker = invokerMock;
  svc._parser = parserMock;
  svc._labelResolver = resolverMock;

  const r = await svc.parseApk('/path/app.apk');

  assert.strictEqual(r.success, true);
  // 验证 invoker 调用
  assert.strictEqual(invokerMock.calls.dumpBadging.length, 1);
  // 验证 parser 调用 (传 invoker output)
  assert.strictEqual(parserMock.calls.parse.length, 1);
  assert.ok(parserMock.calls.parse[0].output.includes("package: name='com.example'"));
  // 验证 resolver 调用 (传 localeLabels + default applicationLabel)
  assert.strictEqual(resolverMock.calls.resolve.length, 1);
  assert.deepStrictEqual(resolverMock.calls.resolve[0].localeLabels, { default: 'ExampleApp', 'zh-CN': '测试' });
  assert.strictEqual(resolverMock.calls.resolve[0].defaultLabel, 'ExampleApp');
  // 验证 applicationLabel 被 resolver 返回值替换
  assert.strictEqual(r.data.applicationLabel, '测试');
  // 验证 localeLabels 字段保留 (RFC 设计是 delete, 但当前实现保留 - 测试实际行为)
  assert.ok(r.data.localeLabels, 'localeLabels 字段保留');
});

test('parseApk parser.parse 抛错 返 parseError', async () => {
  const asyncFsMock = makeAsyncFsMock({ existsResult: true });
  const ApkParserService = loadServiceWithAsyncFsMock(asyncFsMock);
  const svc = new ApkParserService(PROJECT_ROOT, i18nMock);
  svc.aapt2Path = '/fake/aapt2.exe';
  svc._invoker = makeInvokerMock();
  svc._parser = {
    parse() { throw new Error('regex broken'); },
  };

  const r = await svc.parseApk('/path/app.apk');

  assert.strictEqual(r.success, false);
  assert.strictEqual(r.error, 'apkErrors.parseError');
});

// ── _t helper 测试 ──────────────────────────────────────

test('_t 无 i18nService 返原始 key', () => {
  const ApkParserService = require(APK_PARSER_SERVICE_PATH);
  const svc = new ApkParserService(PROJECT_ROOT);

  assert.strictEqual(svc._t('apkErrors.invalidPath'), 'apkErrors.invalidPath');
});

test('_t i18nService 无 t 方法 返原始 key', () => {
  const ApkParserService = require(APK_PARSER_SERVICE_PATH);
  const svc = new ApkParserService(PROJECT_ROOT, {});

  assert.strictEqual(svc._t('apkErrors.invalidPath'), 'apkErrors.invalidPath');
});

test('_t i18nService.t 调用 + 透传 params', () => {
  const ApkParserService = require(APK_PARSER_SERVICE_PATH);
  const svc = new ApkParserService(PROJECT_ROOT, i18nMock);

  const r = svc._t('apkErrors.parseFailed', { code: 1 });

  assert.strictEqual(r, 'apkErrors.parseFailed:{"code":1}');
});

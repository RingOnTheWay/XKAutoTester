// AllureService facade 集成测试
// 验证: 1) constructor factory-or-default 注入 4 依赖 2) 各 facade 方法编排逻辑
// 策略: 构造注入 mock 4 factory (logger/httpServer/cliInvoker/asyncFs), 验证委托关系 (不触真实 fs/子进程/HTTP)
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const ALLURE_SERVICE_PATH = path.join(
  __dirname, '..', '..', 'electron', 'src', 'main', 'services', 'AllureService.js'
);

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const USER_DATA_PATH = path.join(__dirname, '..', '..', 'trae-backup');
// R25 P2-3: openReportByPath 报告根 = <userDataPath>/logs/Allure/allure-reports (getLogsPath)
const REPORTS_ROOT = path.join(USER_DATA_PATH, 'logs', 'Allure', 'allure-reports');

// ── mock 工厂 ──────────────────────────────────────────────

function makeLoggerMock() {
  const calls = { error: [], warning: [], warn: [], info: [], ensureLogDir: 0, resetLogPath: 0 };
  return {
    calls,
    async ensureLogDir() { calls.ensureLogDir++; },
    resetLogPath() { calls.resetLogPath++; },
    async error(msg) { calls.error.push(msg); },
    async warning(msg) { calls.warning.push(msg); },
    async warn(msg) { calls.warn.push(msg); }, // R27: 对齐真实 Logger
    async info(msg) { calls.info.push(msg); },
  };
}

function makeHttpServerMock({ startResult = { success: true, url: 'http://localhost:8080', port: 8080 }, stopResult = { success: true }, statusResult = { running: false, port: null } } = {}) {
  const calls = { start: [], stop: 0, cleanupSync: 0, getStatus: 0 };
  return {
    calls,
    async start(reportDir, options) { calls.start.push({ reportDir, options }); return startResult; },
    async stop() { calls.stop++; return stopResult; },
    cleanupSync() { calls.cleanupSync++; },
    getStatus() { calls.getStatus++; return statusResult; },
  };
}

function makeCliInvokerMock({ generateResult = { code: 0, stdout: '', stderr: '' } } = {}) {
  const calls = { generate: [] };
  return {
    calls,
    async generate(allureResultsDir, allureReportDir) {
      calls.generate.push({ allureResultsDir, allureReportDir });
      return generateResult;
    },
  };
}

function makeAsyncFsMock({ existsResult = true, readdirResult = [], statResult = { isDirectory: () => true, mtimeMs: 0 } } = {}) {
  const calls = { exists: [], readdir: [], stat: [], rm: [], mkdir: [], unlink: [] };
  return {
    calls,
    async exists(p) { calls.exists.push(p); return existsResult; },
    async readdir(p) { calls.readdir.push(p); return readdirResult; },
    async stat(p) { calls.stat.push(p); return statResult; },
    async rm(p, opts) { calls.rm.push({ path: p, opts }); },
    async mkdir(p, opts) { calls.mkdir.push({ path: p, opts }); },
    async unlink(p) { calls.unlink.push(p); },
  };
}

function buildService({ loggerMock, httpServerMock, cliInvokerMock, asyncFsMock } = {}) {
  const logger = loggerMock || makeLoggerMock();
  const httpServer = httpServerMock || makeHttpServerMock();
  const cliInvoker = cliInvokerMock || makeCliInvokerMock();
  const asyncFs = asyncFsMock || makeAsyncFsMock();

  // 清除缓存 + 用解构 require
  delete require.cache[require.resolve(ALLURE_SERVICE_PATH)];
  const { AllureService } = require(ALLURE_SERVICE_PATH);

  const svc = new AllureService(PROJECT_ROOT, null, USER_DATA_PATH, {
    loggerFactory: () => logger,
    httpServerFactory: () => httpServer,
    cliInvokerFactory: () => cliInvoker,
    asyncFsFactory: () => asyncFs,
  });

  return { svc, logger, httpServer, cliInvoker, asyncFs };
}

// ── constructor 测试 ─────────────────────────────────────

test('constructor 收 4 factory + 建 4 实例', () => {
  const { svc, logger, httpServer, cliInvoker, asyncFs } = buildService();

  assert.strictEqual(svc.projectRoot, PROJECT_ROOT);
  assert.strictEqual(svc.userDataPath, USER_DATA_PATH);
  assert.strictEqual(svc.logger, logger);
  assert.strictEqual(svc.httpServer, httpServer);
  assert.strictEqual(svc.cliInvoker, cliInvoker);
  assert.strictEqual(svc._asyncFs, asyncFs);
});

test('constructor 默认 factory 建 4 真实实例 (生产路径)', () => {
  delete require.cache[require.resolve(ALLURE_SERVICE_PATH)];
  const { AllureService } = require(ALLURE_SERVICE_PATH);
  const svc = new AllureService(PROJECT_ROOT, null, USER_DATA_PATH);

  // 验证默认 factory 建真实实例 (不强依赖类型, 只验证非空)
  assert.ok(svc.logger, 'logger 实例建');
  assert.ok(svc.httpServer, 'httpServer 实例建');
  assert.ok(svc.cliInvoker, 'cliInvoker 实例建');
  assert.ok(svc._asyncFs, 'asyncFs 实例建');
});

// ── getAllureServerStatus 测试 ───────────────────────────

test('getAllureServerStatus 委托 httpServer.getStatus', async () => {
  const statusResult = { running: true, port: 8080 };
  const { svc, httpServer } = buildService({
    httpServerMock: makeHttpServerMock({ statusResult }),
  });

  const r = await svc.getAllureServerStatus();

  assert.deepStrictEqual(r, statusResult);
  assert.strictEqual(httpServer.calls.getStatus, 1);
});

test('getAllureServerStatus httpServer 抛错 返 running:false + error', async () => {
  const { svc, httpServer } = buildService();
  httpServer.getStatus = () => { throw new Error('server broken'); };

  const r = await svc.getAllureServerStatus();

  assert.strictEqual(r.running, false);
  assert.strictEqual(r.port, null);
  assert.strictEqual(r.error, 'server broken');
});

// ── cleanup / cleanupSync 测试 ───────────────────────────

test('cleanup 委托 httpServer.cleanupSync', async () => {
  const { svc, httpServer } = buildService();

  await svc.cleanup();

  assert.strictEqual(httpServer.calls.cleanupSync, 1);
});

test('cleanupSync 委托 httpServer.cleanupSync', () => {
  const { svc, httpServer } = buildService();

  svc.cleanupSync();

  assert.strictEqual(httpServer.calls.cleanupSync, 1);
});

// ── stopAllureServer 测试 ────────────────────────────────

test('stopAllureServer 委托 httpServer.stop + 调 logger.ensureLogDir/resetLogPath', async () => {
  const { svc, logger, httpServer } = buildService();

  const r = await svc.stopAllureServer();

  assert.strictEqual(r.success, true);
  assert.strictEqual(httpServer.calls.stop, 1);
  assert.strictEqual(logger.calls.ensureLogDir, 1);
  assert.strictEqual(logger.calls.resetLogPath, 1);
});

test('stopAllureServer httpServer.stop 抛错 catch 返 {success:false, error}', async () => {
  const { svc, httpServer } = buildService();
  httpServer.stop = async () => { throw new Error('stop failed'); };

  const r = await svc.stopAllureServer();

  assert.strictEqual(r.success, false);
  assert.strictEqual(r.error, 'stop failed');
});

// ── checkReportExists 测试 ───────────────────────────────

test('checkReportExists 目录不存在 返 {exists:false}', async () => {
  const { svc, asyncFs } = buildService({
    asyncFsMock: makeAsyncFsMock({ existsResult: false }),
  });

  const r = await svc.checkReportExists('plan1');

  assert.strictEqual(r.exists, false);
  assert.strictEqual(asyncFs.calls.exists.length, 1);
});

test('checkReportExists 目录存在 + timestamp 子目录含 index.html 返 {exists:true}', async () => {
  const asyncFs = makeAsyncFsMock({
    existsResult: true,
    readdirResult: ['20260728_120000'],
    statResult: { isDirectory: () => true, mtimeMs: 1000 },
  });
  // 第二次 exists (查 index.html) 返 true
  let existsCallCount = 0;
  asyncFs.exists = async () => {
    existsCallCount++;
    return existsCallCount === 1 ? true : true; // 目录存在 + index.html 存在
  };
  const { svc } = buildService({ asyncFsMock: asyncFs });

  const r = await svc.checkReportExists('plan1');

  assert.strictEqual(r.exists, true);
});

test('checkReportExists 抛错 catch 返 {exists:false}', async () => {
  const { svc, asyncFs } = buildService();
  asyncFs.exists = async () => { throw new Error('fs broken'); };

  const r = await svc.checkReportExists('plan1');

  assert.strictEqual(r.exists, false);
});

// ── openReportByPath 测试 ────────────────────────────────

test('openReportByPath 路径不存在 返 {success:false}', async () => {
  const { svc, asyncFs } = buildService({
    asyncFsMock: makeAsyncFsMock({ existsResult: false }),
  });

  // R25 P2-3: reportPath 须位于报告根内 — 用根内合法路径测"不存在"分支
  const r = await svc.openReportByPath(path.join(REPORTS_ROOT, 'plan1', '20260101_000000'));

  assert.strictEqual(r.success, false);
  assert.strictEqual(r.error, '报告路径不存在');
  assert.strictEqual(asyncFs.calls.exists.length, 1);
});

test('openReportByPath 路径存在 委托 httpServer.start + 返 url/port/message', async () => {
  const startResult = { success: true, url: 'http://localhost:9999', port: 9999 };
  const { svc, httpServer } = buildService({
    httpServerMock: makeHttpServerMock({ startResult }),
  });
  const i18nMock = { t: (key) => `[i18n]${key}` };
  svc.i18nService = i18nMock;

  const reportPath = path.join(REPORTS_ROOT, 'plan1', '20260101_000000');
  const r = await svc.openReportByPath(reportPath);

  assert.strictEqual(r.success, true);
  assert.strictEqual(r.url, 'http://localhost:9999');
  assert.strictEqual(r.port, 9999);
  assert.strictEqual(r.message, '[i18n]allure.openingReport');
  assert.strictEqual(httpServer.calls.stop, 1, '先调 stop 再 start');
  assert.strictEqual(httpServer.calls.start.length, 1);
  assert.strictEqual(httpServer.calls.start[0].reportDir, reportPath);
});

test('openReportByPath 无 i18nService 返默认中文 message', async () => {
  const startResult = { success: true, url: 'http://localhost:9999', port: 9999 };
  const { svc } = buildService({
    httpServerMock: makeHttpServerMock({ startResult }),
  });

  const r = await svc.openReportByPath(path.join(REPORTS_ROOT, 'plan1', '20260101_000000'));

  assert.strictEqual(r.message, '正在打开Allure报告...');
});

test('openReportByPath httpServer.start 返 {success:false} 透传', async () => {
  const startResult = { success: false, error: 'port in use' };
  const { svc, httpServer } = buildService({
    httpServerMock: makeHttpServerMock({ startResult }),
  });

  const r = await svc.openReportByPath(path.join(REPORTS_ROOT, 'plan1', '20260101_000000'));

  assert.strictEqual(r.success, false);
  assert.strictEqual(r.error, 'port in use');
});

test('R25 P2-3: openReportByPath 越界路径拒绝 (防 HTTP 托管任意目录)', async () => {
  const { svc, httpServer } = buildService();
  const outsidePaths = [
    path.join(USER_DATA_PATH, 'config.json'),   // 报告根之外 (userDataPath 下)
    path.join(REPORTS_ROOT, '..', '..'),          // 相对回溯
    path.join(__dirname, 'test_allure_service.js'), // 任意文件
  ];
  for (const p of outsidePaths) {
    const r = await svc.openReportByPath(p);
    assert.strictEqual(r.success, false, `应拒绝越界路径: ${p}`);
    assert.strictEqual(r.error, 'invalid_report_path');
  }
  assert.strictEqual(httpServer.calls.start.length, 0, '越界路径不得启动 HTTP 服务器');
  assert.strictEqual(httpServer.calls.stop, 0, '越界路径不得触发 stop');
});

// ── generateAllureReport 测试 ────────────────────────────

test('generateAllureReport resultsDir 不存在 返 {success:false}', async () => {
  const { svc, asyncFs } = buildService({
    asyncFsMock: makeAsyncFsMock({ existsResult: false }),
  });

  const r = await svc.generateAllureReport('/nonexistent/results', 'plan1');

  assert.strictEqual(r.success, false);
  assert.strictEqual(r.error, 'allure-results目录不存在');
  assert.strictEqual(asyncFs.calls.exists.length, 1);
});

test('generateAllureReport resultsDir 空字符串 返 {success:false}', async () => {
  const { svc } = buildService();

  const r = await svc.generateAllureReport('', 'plan1');

  assert.strictEqual(r.success, false);
  assert.strictEqual(r.error, 'allure-results目录不存在');
});

test('generateAllureReport 无 json 文件 返 {success:false}', async () => {
  const { svc, asyncFs } = buildService({
    asyncFsMock: makeAsyncFsMock({ existsResult: true, readdirResult: ['readme.txt'] }),
  });

  const r = await svc.generateAllureReport('/results', 'plan1');

  assert.strictEqual(r.success, false);
  assert.strictEqual(r.error, 'allure-results目录中没有结果文件');
});

test('generateAllureReport 成功: 委托 cliInvoker.generate + 返 reportPath', async () => {
  const asyncFs = makeAsyncFsMock({
    existsResult: true,
    readdirResult: ['test-result.json'],
    statResult: { isDirectory: () => true, mtimeMs: 0 },
  });
  const { svc, cliInvoker } = buildService({
    asyncFsMock: asyncFs,
    cliInvokerMock: makeCliInvokerMock({ generateResult: { code: 0, stdout: '', stderr: '' } }),
  });

  const r = await svc.generateAllureReport('/results', 'plan1');

  assert.strictEqual(r.success, true);
  assert.ok(r.reportPath, 'reportPath 返');
  assert.ok(r.reportPath.includes('plan1'), 'reportPath 含 plan1');
  assert.strictEqual(cliInvoker.calls.generate.length, 1);
  assert.strictEqual(cliInvoker.calls.generate[0].allureResultsDir, '/results');
});

test('generateAllureReport cliInvoker 返 code!=0 返 {success:false, error}', async () => {
  const { svc } = buildService({
    asyncFsMock: makeAsyncFsMock({ existsResult: true, readdirResult: ['test-result.json'] }),
    cliInvokerMock: makeCliInvokerMock({ generateResult: { code: 1, stdout: 'out', stderr: 'err' } }),
  });

  const r = await svc.generateAllureReport('/results', 'plan1');

  assert.strictEqual(r.success, false);
  assert.ok(r.error.includes('allure generate失败'));
  assert.ok(r.error.includes('err'));
});

// ── clearAllureReports 测试 ──────────────────────────────

test('clearAllureReports 目录均不存在 返 {success:true} 0 项', async () => {
  const { svc, asyncFs } = buildService({
    asyncFsMock: makeAsyncFsMock({ existsResult: false }),
  });

  const r = await svc.clearAllureReports();

  assert.strictEqual(r.success, true);
  assert.ok(r.message.includes('0'));
  assert.strictEqual(asyncFs.calls.exists.length, 2, 'reports + results 两个目录都探测');
});

test('clearAllureReports 同时清空 allure-reports 与 allure-results', async () => {
  const { svc, asyncFs } = buildService({
    asyncFsMock: makeAsyncFsMock({
      existsResult: true,
      // mock readdir 每次返回同数组: reports + results 两目录各扫 5 项
      readdirResult: ['item1', 'item2', 'item3', 'item4', 'item5'],
      statResult: { isDirectory: () => false, mtimeMs: 0 },
    }),
  });

  const r = await svc.clearAllureReports();

  assert.strictEqual(r.success, true);
  assert.ok(r.message.includes('报告'), 'message 含报告/结果分项');
  assert.strictEqual(asyncFs.calls.unlink.length, 10, 'reports 5 + results 5 全部 unlink');
  assert.strictEqual(asyncFs.calls.readdir.length, 2, 'reports + results 两个目录都扫描');
});

// ── clearAllLogs 测试 ────────────────────────────────────

test('clearAllLogs 目录不存在 返 {success:true}', async () => {
  const { svc, asyncFs } = buildService({
    asyncFsMock: makeAsyncFsMock({ existsResult: false }),
  });

  const r = await svc.clearAllLogs();

  assert.strictEqual(r.success, true);
  assert.ok(r.message.includes('不存在'));
});

// ── openAllureReport 测试 (无 testPlanName + 无可用报告) ──

test('openAllureReport 无 testPlanName + 无报告目录 返 {success:false}', async () => {
  const { svc, asyncFs } = buildService({
    asyncFsMock: makeAsyncFsMock({ existsResult: false }),
  });

  const r = await svc.openAllureReport();

  assert.strictEqual(r.success, false);
  assert.strictEqual(r.error, '没有可用的Allure报告，请先生成报告');
});

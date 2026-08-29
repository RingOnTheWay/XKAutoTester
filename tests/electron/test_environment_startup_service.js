// EnvironmentStartupService 单测 (R22-3 补覆盖缺口)
// 验证: buildDriverInstallCommand 纯函数 (EncodedCommand + 注入面消除) +
//       defaultDriverInstaller (fs 校验 + spawn powershell) + handleInstallDriver 委托。
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const SERVICE_PATH = path.join(
  __dirname, '..', '..', 'electron', 'src', 'main', 'services', 'EnvironmentStartupService.js'
);
const EnvironmentStartupService = require(SERVICE_PATH);
const { buildDriverInstallCommand } = EnvironmentStartupService;

function decodeCommand(encoded) {
  return Buffer.from(encoded, 'base64').toString('utf16le');
}

function makeService(opts = {}) {
  const svc = new EnvironmentStartupService({
    environmentService: opts.environmentService || {},
    testCaseService: opts.testCaseService || {},
    userDataService: null,
    i18nService: { t: (k) => k },
    electronApp: {},
    driverInstallerFactory: opts.driverInstallerFactory,
    ...opts.extra,
  });
  return svc;
}

// ── buildDriverInstallCommand 纯函数 ─────────────────────

test('P2-6 buildDriverInstallCommand 返回 powershell + EncodedCommand, 无路径明文', () => {
  const { cmd, args } = buildDriverInstallCommand('C:\\Drivers\\cp210x.exe');
  assert.strictEqual(cmd, 'powershell.exe');
  assert.ok(args.includes('-EncodedCommand'));
  // 命令行不得含路径明文 (路径不在 spawn args 中明文出现, 防 cmd 二次解析)
  assert.ok(args.every((a) => !a.includes('cp210x')));
  // 解码后脚本正确
  const encIdx = args.indexOf('-EncodedCommand');
  assert.strictEqual(decodeCommand(args[encIdx + 1]), "Start-Process -FilePath 'C:\\Drivers\\cp210x.exe'");
});

test('P2-6 路径含 cmd 元字符时脚本仍正确 (注入面消除)', () => {
  // 原实现: exec 拼接, 含 & 会命令错乱/注入; 现 EncodedCommand 原样传递
  const { args } = buildDriverInstallCommand('C:\\Drv & calc.exe');
  const encIdx = args.indexOf('-EncodedCommand');
  assert.strictEqual(decodeCommand(args[encIdx + 1]), "Start-Process -FilePath 'C:\\Drv & calc.exe'");
});

test('P2-6 路径含单引号时 PowerShell 内转义 (双单引号)', () => {
  const { args } = buildDriverInstallCommand("C:\\Drv\\it's.exe");
  const encIdx = args.indexOf('-EncodedCommand');
  assert.strictEqual(decodeCommand(args[encIdx + 1]), "Start-Process -FilePath 'C:\\Drv\\it''s.exe'");
});

test('P2-6 非字符串路径不抛错 (String 化)', () => {
  const result = buildDriverInstallCommand(42);
  assert.strictEqual(result.cmd, 'powershell.exe');
});

// ── defaultDriverInstaller (spawn powershell) ─────────────

test('P2-6 安装程序路径不存在 → 失败且不 spawn', async () => {
  const svc = makeService();
  await svc._ensureInitialized();
  const result = await svc.handleInstallDriver('C:\\missing\\driver.exe');
  assert.strictEqual(result.success, false);
  assert.match(result.message, /不存在/);
});

test('P2-6 handleInstallDriver 委托注入的 driverInstallerFactory', async () => {
  const calls = [];
  const svc = makeService({
    driverInstallerFactory: () => async (installerPath) => {
      calls.push(installerPath);
      return { success: true, message: 'ok' };
    },
  });
  await svc._ensureInitialized();
  const result = await svc.handleInstallDriver('C:\\Drivers\\cp210x.exe');
  assert.strictEqual(result.success, true);
  assert.deepStrictEqual(calls, ['C:\\Drivers\\cp210x.exe']);
});

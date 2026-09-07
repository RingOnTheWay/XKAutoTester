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

// R25 P2-4: 驱动安装白名单根 = <projectRoot>/env/CP210x_Windows_Drivers
const PROJECT_ROOT = path.join(__dirname, '..', '..');
const DRIVERS_ROOT = path.join(PROJECT_ROOT, 'env', 'CP210x_Windows_Drivers');

function decodeCommand(encoded) {
  return Buffer.from(encoded, 'base64').toString('utf16le');
}

function makeService(opts = {}) {
  const svc = new EnvironmentStartupService({
    environmentService: opts.environmentService || {},
    testCaseService: opts.testCaseService || {},
    userDataService: null,
    i18nService: { t: (k) => k },
    electronApp: { projectRoot: PROJECT_ROOT },
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
  // R25 P2-4: 路径须在驱动目录白名单内 — 用根内不存在的文件测"不存在"分支
  const result = await svc.handleInstallDriver(path.join(DRIVERS_ROOT, 'missing-driver.exe'));
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
  // R25 P2-4: 白名单内合法路径 (真实驱动安装包)
  const result = await svc.handleInstallDriver(
    path.join(DRIVERS_ROOT, 'CP210xVCPInstaller_x64.exe')
  );
  assert.strictEqual(result.success, true);
  assert.deepStrictEqual(calls, [path.join(DRIVERS_ROOT, 'CP210xVCPInstaller_x64.exe')]);
});

test('R25 P2-4: 白名单外路径拒绝 (防启动任意 exe)', async () => {
  const calls = [];
  const svc = makeService({
    driverInstallerFactory: () => async (installerPath) => {
      calls.push(installerPath);
      return { success: true, message: 'ok' };
    },
  });
  await svc._ensureInitialized();
  const outsidePaths = [
    'C:\\Windows\\System32\\cmd.exe',          // 系统目录
    path.join(PROJECT_ROOT, 'env', 'python', 'python.exe'), // 驱动目录外 (env 其他子目录)
    path.join(DRIVERS_ROOT, '..', '..', '..', 'x'),          // 相对回溯
    '',                                                  // 空串
    null,                                                // 非字符串
  ];
  for (const p of outsidePaths) {
    const result = await svc.handleInstallDriver(p);
    assert.strictEqual(result.success, false, `应拒绝: ${p}`);
  }
  assert.strictEqual(calls.length, 0, '白名单外路径不得进入 driverInstaller');
});

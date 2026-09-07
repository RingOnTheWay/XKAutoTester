// EnvironmentStartupService — 启动期编排深模块.
//
// 藏 5+ 副作用 (3 服务时序编排 + 5 IPC 推送 + driver 安装子进程 + app lifecycle 触发 +
// splashWindow 晚绑定 + 错误隔离双路径).
// 对称 applicationService.js (20-factory + 3-await-injector) +
//      EnvironmentService.js (6-factory + _ensureInitialized) +
//      effects.js (side-effect port = factory fn, 默认实现导出).
//
// 生产: new EnvironmentStartupService({ environmentService, testCaseService,
//                                       userDataService, i18nService, electronApp })
// 测试: new EnvironmentStartupService({ environmentService: mock,
//                                       progressSenderFactory: fake, ... })
//
// 内部组织:
//   _ensureInitialized()                  — 懒初始化 (首次 4 port: splashWindowProvider /
//                                          progressSender / driverInstaller / appLifecycle)
//   handleStartChecks()                   — 3 服务编排 (env→cleanup→migration) + 90/95/100% phase-level 进度
//   handleSplashReady()                   — app lifecycle: closeSplash + createMainWindow
//   handleInstallDriver(path)             — fs 校验 + PowerShell Start-Process
//   handleCheckInstallerRunning()         — 委托 environmentService + 错误包装
//   handleRecheckCp210xDriver()           — 委托 environmentService + DTO 转换 (i18n name + 默认值)
//   handleGetSerialPorts()                — 1-liner 委托 environmentService

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { IPC_CHANNELS } = require('../../shared/constants');

// ── module-level 常量 (对称 EnvironmentService REQUIRED_PYTHON_VERSION 等) ──

/** Phase-level 进度档 (per-check 0-80% 由 EnvironmentService 内部发) */
const PROGRESS = Object.freeze({
  CLEANUP: { percentage: 90, key: 'splash.checks.cleaningInvalidFiles' },
  MIGRATION: { percentage: 95, key: 'splash.checks.migratingConfig' },
  COMPLETE: { percentage: 100, key: 'splash.checkComplete' },
});

// ── module-level 纯函数 (对称 EnvironmentService.parsePyprojectDependencies 等) ──

/**
 * 构建 PowerShell Start-Process 命令 (从 INSTALL_DRIVER handler L81-92 提取)
 * P2-6: 原实现 exec() 经 cmd.exe 二次解析, 路径含 " & | <> ^ % 等 cmd 元字符会命令错乱/注入面。
 * 改为 spawn 数组参数 + -EncodedCommand (UTF-16LE base64):
 *   - spawn 不经 shell, 命令行无明文脚本 → cmd 元字符无害
 *   - 单引号在 PowerShell 脚本内以 '' 转义
 * @param {string} installerPath
 * @returns {{cmd: string, args: string[]}}
 */
function buildDriverInstallCommand(installerPath) {
  const script = `Start-Process -FilePath '${String(installerPath).replace(/'/g, "''")}'`;
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return {
    cmd: 'powershell.exe',
    args: ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
  };
}

// ── 4 默认 port factory (factory-or-default, 对称 EnvironmentService 6-factory) ──

/** splashWindow 晚绑定访问器 (调用时取, 不在构造期固化) */
const defaultSplashWindowProviderFactory = (electronApp) => () => electronApp.splashWindow;

/** 包装 splashWindow.webContents.send (null-safe) */
const defaultProgressSenderFactory = (electronApp) => (channel, payload) => {
  const splash = electronApp.splashWindow;
  if (splash) splash.webContents.send(channel, payload);
};

/** 包装 fs + spawn + PowerShell 启动驱动安装 */
const defaultDriverInstallerFactory = () => async (installerPath) => {
  if (!installerPath || !fs.existsSync(installerPath)) {
    return { success: false, message: '安装程序路径不存在' };
  }
  // P2-6: spawn 数组参数 + EncodedCommand, 不经 cmd.exe 二次解析 (注入面消除)
  const { cmd, args } = buildDriverInstallCommand(installerPath);
  await new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true, stdio: 'ignore' });
    child.on('error', (err) => reject(err));
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`PowerShell exit code ${code}`))));
  });
  return { success: true, message: '驱动安装程序已启动' };
};

/** 包装 app lifecycle: closeSplash + createMainWindow */
const defaultAppLifecycleFactory = (electronApp) => ({
  closeSplash: () => {
    if (electronApp.splashWindow) electronApp.splashWindow.close();
  },
  createMainWindow: () => electronApp.createWindow(),
});

// ── EnvironmentStartupService 类 ──────────────────────────────────

class EnvironmentStartupService {
  /**
   * @param {Object} opts - factory-or-default (全可选 port; 5 underlying service 必传实例)
   * @param {Object} opts.environmentService
   * @param {Object} opts.testCaseService
   * @param {Object|null} [opts.userDataService]              — 可选 (旧版本兼容)
   * @param {Object} opts.i18nService
   * @param {Object} opts.electronApp                          — 持 projectRoot + splashWindow
   * @param {(electronApp: Object) => () => Object|null} [opts.splashWindowProviderFactory]
   * @param {(electronApp: Object) => (channel: string, payload: Object) => void} [opts.progressSenderFactory]
   * @param {() => (path: string) => Promise<{success, message}>} [opts.driverInstallerFactory]
   * @param {(electronApp: Object) => {closeSplash: Function, createMainWindow: Function}} [opts.appLifecycleFactory]
   */
  constructor(opts = {}) {
    // 5 underlying service (实例引用, 由 applicationService.js 构造注入)
    this._environmentService = opts.environmentService;
    this._testCaseService = opts.testCaseService;
    this._userDataService = opts.userDataService;
    this._i18nService = opts.i18nService;
    this._electronApp = opts.electronApp;

    // 4 side-effect port (factory-or-default, 对称 effects.js)
    this._splashWindowProviderFactory = opts.splashWindowProviderFactory || defaultSplashWindowProviderFactory;
    this._progressSenderFactory = opts.progressSenderFactory || defaultProgressSenderFactory;
    this._driverInstallerFactory = opts.driverInstallerFactory || defaultDriverInstallerFactory;
    this._appLifecycleFactory = opts.appLifecycleFactory || defaultAppLifecycleFactory;

    this._initialized = false; // 懒初始化 flag (对称 EnvironmentService._initialized)
  }

  // 懒初始化 (消除构造期 I/O, 对称 EnvironmentService._ensureInitialized)
  _ensureInitialized() {
    if (this._initialized) return;
    this._getSplashWindow = this._splashWindowProviderFactory(this._electronApp);
    this._sendProgress = this._progressSenderFactory(this._electronApp);
    this._installDriver = this._driverInstallerFactory();
    this._appLifecycle = this._appLifecycleFactory(this._electronApp);
    this._initialized = true;
  }

  // ── 公共 API: 6 方法 / 6 IPC 通道 (1 方法 / 通道) ──

  /**
   * START_CHECKS 入口: 3 服务编排 (env→cleanup→migration) + phase-level 进度 + 错误兜底
   * 90/95/100% 由本方法推 (phase-level); 0-80% + CHECK_RESULT 由 environmentService 内部推 (per-check)
   * @returns {Promise<{success: boolean}>}
   */
  async handleStartChecks() {
    this._ensureInitialized();
    try {
      const results = await this._environmentService.runEnvironmentChecks(
        this._electronApp.projectRoot,
        this._getSplashWindow()
      );

      this._sendProgress(IPC_CHANNELS.CHECK_PROGRESS, {
        percentage: PROGRESS.CLEANUP.percentage,
        message: this._i18nService.t(PROGRESS.CLEANUP.key),
      });

      try {
        await this._testCaseService.cleanupOrphanedFiles();
        this._sendProgress(IPC_CHANNELS.CHECK_PROGRESS, {
          percentage: PROGRESS.MIGRATION.percentage,
          message: this._i18nService.t(PROGRESS.MIGRATION.key),
        });
      } catch (cleanupError) {
        console.error('清理无效用例文件失败:', cleanupError);
      }

      if (this._userDataService) {
        try {
          await this._userDataService.runMigration();
        } catch (migrationError) {
          console.error('配置迁移失败:', migrationError);
        }
      }

      this._sendProgress(IPC_CHANNELS.CHECK_PROGRESS, {
        percentage: PROGRESS.COMPLETE.percentage,
        message: this._i18nService.t(PROGRESS.COMPLETE.key),
      });
      this._sendProgress(IPC_CHANNELS.CHECK_COMPLETE, {
        requiredErrors: results.required,
        warnings: results.warnings,
      });

      return { success: true };
    } catch (error) {
      this._sendProgress(IPC_CHANNELS.CHECK_COMPLETE, {
        requiredErrors: [
          this._i18nService.t('splash.checks.environmentCheckFailed', {
            error: error.message,
          }),
        ],
        warnings: [],
      });
      throw error;
    }
  }

  /**
   * SPLASH_READY 入口: app lifecycle 跨界 (closeSplash + createMainWindow)
   * @returns {void}
   */
  handleSplashReady() {
    this._ensureInitialized();
    this._appLifecycle.closeSplash();
    this._appLifecycle.createMainWindow();
  }

  /**
   * INSTALL_DRIVER 入口: 白名单校验 + 委托 driverInstaller port (fs 校验 + PowerShell)
   * R25 P2-4: 安装程序必须位于 <projectRoot>/env/CP210x_Windows_Drivers/ 内。
   * 原实现仅 fs.existsSync 校验, 渲染层被攻破可启动任意存在的 exe (任意程序启动)。
   * @param {string} installerPath
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async handleInstallDriver(installerPath) {
    this._ensureInitialized();

    if (typeof installerPath !== 'string' || !installerPath.trim()) {
      return { success: false, message: '无效的安装程序路径' };
    }
    const projectRoot = this._electronApp && this._electronApp.projectRoot;
    if (!projectRoot) {
      return { success: false, message: '项目根目录不可用' };
    }
    const driversRoot = path.join(projectRoot, 'env', 'CP210x_Windows_Drivers');
    const resolved = path.resolve(installerPath);
    const rel = path.relative(driversRoot, resolved);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      return { success: false, message: '安装程序路径不在驱动目录内' };
    }
    return this._installDriver(resolved);
  }

  /**
   * CHECK_INSTALLER_RUNNING 入口: 委托 environmentService + 错误包装
   * @returns {Promise<{success: boolean, isRunning: boolean, error?: string}>}
   */
  async handleCheckInstallerRunning() {
    try {
      const isRunning = await this._environmentService.isInstallerRunning();
      return { success: true, isRunning };
    } catch (error) {
      return { success: false, isRunning: false, error: error.message };
    }
  }

  /**
   * RECHECK_CP210X_DRIVER 入口: 委托 environmentService + DTO 转换
   * (i18n name + canInstall/installerPath 默认值)
   * @returns {Promise<{success: boolean, result: Object}>}
   */
  async handleRecheckCp210xDriver() {
    const result = await this._environmentService.checkCP210xDriver();
    return {
      success: true,
      result: {
        name: this._i18nService.t('splash.checks.cp210DriverCheck'),
        status: result.status,
        message: result.message,
        canInstall: result.canInstall || false,
        installerPath: result.installerPath || null,
      },
    };
  }

  /**
   * GET_SERIAL_PORTS 入口: 1-liner 委托 environmentService
   * @returns {Promise<Array>}
   */
  handleGetSerialPorts() {
    return this._environmentService.getSerialPorts();
  }
}

// Object.assign 保 default export (对称 EnvironmentService L675-680 + PythonTestService)
// 附加 2 模块级纯函数/常量为静态属性 (可 EnvironmentStartupService.buildDriverInstallCommand 访问)
module.exports = Object.assign(EnvironmentStartupService, {
  buildDriverInstallCommand,
  PROGRESS,
});

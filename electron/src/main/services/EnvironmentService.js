// EnvironmentService — 环境检查深模块。
//
// 藏 5 类副作用 (构造期 new×2 + fs×8 + executeCommand×8 + pathHelper 状态读写 + app.isPackaged)
// + 4 处 setPythonConfig 模板重复 + 100+ 行 inline pyproject 解析。
// 6 factory-or-default (对称 I18nService 3-factory + PagePackageService 2-factory
//                       + UpdateService 5-factory + TestCaseService 4-factory)。
//
// 生产: new EnvironmentService(i18nService, projectRoot)  # 2 参, opts 默认 {}
// 测试: new EnvironmentService(i18nService, projectRoot, { fileSystemFactory: fake, ... })
//
// 内部组织:
//   _ensureInitialized()                — 懒初始化 (首次 5 公共 API 触发 fs/cmd/pathHelper/
//                                          isPackaged/driverChecker/serialPortEnumerator)
//   configurePythonEnvironment()        — embedded/venv/system 三级回退, 用 buildPythonConfig 消重
//   configureEmbeddedPythonPth()        — 用 fileSystem port 读写 ._pth
//   findSystemPython() / findPythonHome() / findUvCommand()
//                                       — 用 commandRunner port + pathHelper
//   checkCP210xDriver() / isInstallerRunning() / getDriverInstallerPath() / getSerialPorts()
//                                       — 委托 driverChecker / serialPortEnumerator (1-liner)
//   getAapt2Path()                      — 委托 pathHelper
//   checkCommandExists()                — 用 commandRunner port
//   checkAndroidSDK()                   — 编排 pathHelper + checkCommandExists
//   checkPythonEnvironment()            — 用 parsePyprojectDependencies + checkMissingPackages 纯函数
//   checkNodeModules()                  — 用 isPackagedGetter + fileSystem port
//   runEnvironmentChecks()              — 编排 4 checks + IPC 进度推送 + 300ms 节流

const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const { executeCommand } = require('./spawnHelper');
const DriverChecker = require('./DriverChecker');
const SerialPortEnumerator = require('./SerialPortEnumerator');
const { IPC_CHANNELS } = require('../../shared/constants');

// ── module-level 常量 (对称 UpdateService GITHUB_OWNER/REPO) ──────────

const REQUIRED_PYTHON_VERSION = '3.12.4';
const PYTHON_EMBEDDABLE_ZIP = 'python312.zip';
const PTH_CONFIG_MARKER = '# XKAutoTester configured';
const WINDOWSAPPS_MARKER = 'windowsapps';
const PYPROJECT_FILE = 'pyproject.toml';
const NODE_MODULES_DIR = 'node_modules';
const PACKAGE_JSON_FILE = 'package.json';

// 忽略缺失检查的依赖包 (项目暂未使用, 单独处理避免误报)
const IGNORED_MISSING_PACKAGES = ['ddddocr'];

// ── module-level 纯函数 (对称 UpdateService compareVersions/normalizeUpdateError) ──

/**
 * 解析 pyproject.toml dependencies 数组
 * @param {string} content - pyproject.toml 文件内容
 * @returns {string[]} 依赖列表 (原始 spec, 如 'pytest>=8.0')
 */
function parsePyprojectDependencies(content) {
  const match = content.match(/dependencies\s*=\s*\[([\s\S]*?)\]/);
  if (!match) return [];
  return match[1]
    .split('\n')
    .map(line => line.trim().replace(/['"]/g, '').replace(/,\s*$/, ''))
    .filter(line => line && !line.startsWith('#'));
}

/**
 * 从原始 spec 提取包名 (小写)
 * @param {string} spec - 'pytest>=8.0' -> 'pytest'
 * @returns {string}
 */
function extractPackageName(spec) {
  return spec.split(/[<>=~!]/)[0].toLowerCase().trim();
}

/**
 * 检查缺失包
 * @param {Set<string>} installed - 已安装 (小写, 'name==version')
 * @param {string[]} requirements - 依赖原始 spec
 * @returns {string[]} 缺失包列表 (原始 spec)
 */
function checkMissingPackages(installed, requirements) {
  const missing = [];
  for (const req of requirements) {
    const pkgName = extractPackageName(req);
    const found = [...installed].some(p =>
      p.startsWith(`${pkgName}==`) || p.startsWith(`${pkgName}>=`)
    );
    if (!found) missing.push(req);
  }
  return missing;
}

/**
 * 比较语义化版本号 (仅数字段, 如 '3.12.4')
 * @param {string} a
 * @param {string} b
 * @returns {number} -1 (a<b) / 0 (a==b) / 1 (a>b)
 */
function compareVersions(a, b) {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na < nb) return -1;
    if (na > nb) return 1;
  }
  return 0;
}

/**
 * 构建 setPythonConfig 参数对象
 * @param {string} pythonPath
 * @param {{isEmbedded: boolean, isSystem: boolean}} flags
 * @param {string|null} sitePackagesPath
 * @param {string} sourceLabel
 * @returns {{pythonPath: string, isEmbedded: boolean, isSystem: boolean, sitePackagesPath: string|null, sourceLabel: string}}
 */
function buildPythonConfig(pythonPath, flags, sitePackagesPath, sourceLabel) {
  return {
    pythonPath,
    isEmbedded: flags.isEmbedded,
    isSystem: flags.isSystem,
    sitePackagesPath,
    sourceLabel,
  };
}

// ── 6 默认 factory (factory-or-default, 对称 UpdateService 5-factory) ──

const defaultFileSystemFactory = () => ({
  existsSync: (p) => fs.existsSync(p),
  readFileSync: (p, enc) => fs.readFileSync(p, enc),
  readdirSync: (d) => fs.readdirSync(d),
  writeFileSync: (p, content, enc) => fs.writeFileSync(p, content, enc),
});

const defaultCommandRunnerFactory = () => executeCommand;

const defaultDriverCheckerFactory = (i18nService, projectRoot, spawnHelper) =>
  new DriverChecker(i18nService, projectRoot, spawnHelper);

const defaultSerialPortEnumeratorFactory = (i18nService, spawnHelper) =>
  new SerialPortEnumerator(i18nService, spawnHelper);

const defaultPathHelperFactory = () => require('../utils/pathHelper');

const defaultIsPackagedGetterFactory = () => () => app.isPackaged;

// ── EnvironmentService 类 ──────────────────────────────────────────

class EnvironmentService {
  /**
   * @param {Object} i18nService
   * @param {string} projectRoot
   * @param {Object} [opts] - factory-or-default (全可选, 生产不传)
   * @param {() => Object} [opts.fileSystemFactory]
   * @param {() => Function} [opts.commandRunnerFactory]
   * @param {(i18nService: Object, projectRoot: string, spawnHelper: Object) => Object} [opts.driverCheckerFactory]
   * @param {(i18nService: Object, spawnHelper: Object) => Object} [opts.serialPortEnumeratorFactory]
   * @param {() => Object} [opts.pathHelperFactory]
   * @param {() => () => boolean} [opts.isPackagedGetterFactory]
   */
  constructor(i18nService, projectRoot, opts = {}) {
    this.i18nService = i18nService;
    this.projectRoot = projectRoot;
    this.pythonConfigured = false;
    this._initialized = false;  // 懒初始化 flag (对称 UpdateService._initialized)

    this._fileSystemFactory = opts.fileSystemFactory || defaultFileSystemFactory;
    this._commandRunnerFactory = opts.commandRunnerFactory || defaultCommandRunnerFactory;
    this._driverCheckerFactory = opts.driverCheckerFactory || defaultDriverCheckerFactory;
    this._serialPortEnumeratorFactory = opts.serialPortEnumeratorFactory || defaultSerialPortEnumeratorFactory;
    this._pathHelperFactory = opts.pathHelperFactory || defaultPathHelperFactory;
    this._isPackagedGetterFactory = opts.isPackagedGetterFactory || defaultIsPackagedGetterFactory;
  }

  // 懒初始化 (消除构造期 I/O, 对称 UpdateService._ensureInitialized / TestCaseService._ensureInitialized)
  _ensureInitialized() {
    if (this._initialized) return;

    const spawnHelper = { executeCommand: this._commandRunnerFactory() };
    this._fs = this._fileSystemFactory();
    this._cmd = this._commandRunnerFactory();
    this._pathHelper = this._pathHelperFactory();
    this._isPackaged = this._isPackagedGetterFactory();
    this._driverChecker = this._driverCheckerFactory(this.i18nService, this.projectRoot, spawnHelper);
    this._serialPortEnumerator = this._serialPortEnumeratorFactory(this.i18nService, spawnHelper);

    this._initialized = true;
  }

  // ── Python 环境配置 ────────────────────────────────────────────

  async configurePythonEnvironment() {
    this._ensureInitialized();
    if (this.pythonConfigured) return;

    const embeddedPython = this._pathHelper.getEmbeddedPythonPath(this.projectRoot);
    if (embeddedPython) {
      this.configureEmbeddedPythonPth(embeddedPython);
      this._pathHelper.setPythonConfig(buildPythonConfig(
        embeddedPython,
        { isEmbedded: true, isSystem: false },
        this._pathHelper.getVenvSitePackagesPath(this.projectRoot),
        `(${this.i18nService.t('splash.checks.sourceBuiltIn')})`
      ));
      this.pythonConfigured = true;
      return;
    }

    const venvPython = this._pathHelper.getVenvPythonPath(this.projectRoot);
    if (venvPython) {
      const testResult = await this._cmd(venvPython, ['--version']);
      if (testResult.code === 0) {
        this._pathHelper.setPythonConfig(buildPythonConfig(
          venvPython,
          { isEmbedded: false, isSystem: false },
          null,
          `(${this.i18nService.t('splash.checks.sourceBuiltIn')})`
        ));
        this.pythonConfigured = true;
        return;
      }

      const pythonHome = await this.findPythonHome();
      if (pythonHome) {
        this._pathHelper.fixPyvenvCfg(this.projectRoot, pythonHome);
        const retryResult = await this._cmd(venvPython, ['--version']);
        if (retryResult.code === 0) {
          this._pathHelper.setPythonConfig(buildPythonConfig(
            venvPython,
            { isEmbedded: false, isSystem: false },
            null,
            `(${this.i18nService.t('splash.checks.sourceBuiltIn')})`
          ));
          this.pythonConfigured = true;
          return;
        }
      }
    }

    const systemPython = await this.findSystemPython();
    if (systemPython) {
      this._pathHelper.setPythonConfig(buildPythonConfig(
        systemPython,
        { isEmbedded: false, isSystem: true },
        this._pathHelper.getVenvSitePackagesPath(this.projectRoot),
        `(${this.i18nService.t('splash.checks.sourceSystem')})`
      ));
      this.pythonConfigured = true;
      return;
    }

    this._pathHelper.setPythonConfig(null);
    this.pythonConfigured = true;
  }

  configureEmbeddedPythonPth(embeddedPythonPath) {
    this._ensureInitialized();
    const pythonDir = path.dirname(embeddedPythonPath);
    const pthFiles = this._fs.readdirSync(pythonDir).filter(f => f.endsWith('._pth'));

    if (pthFiles.length === 0) return;

    const pthFilePath = path.join(pythonDir, pthFiles[0]);

    try {
      const existingContent = this._fs.readFileSync(pthFilePath, 'utf8');
      if (existingContent.includes(PTH_CONFIG_MARKER)) return;

      const sitePackagesPath = this._pathHelper.getVenvSitePackagesPath(this.projectRoot);
      const venvSitePackages = path.relative(pythonDir, sitePackagesPath).replace(/\\/g, '/');
      const srcPath = path.relative(pythonDir, path.join(this.projectRoot, 'src')).replace(/\\/g, '/');

      const newContent = [
        PYTHON_EMBEDDABLE_ZIP,
        '.',
        venvSitePackages,
        srcPath,
        '',
        '# Uncomment to run site.main() (automatically done by site.py)',
        'import site',
        '',
        PTH_CONFIG_MARKER
      ].join('\n');

      this._fs.writeFileSync(pthFilePath, newContent, 'utf8');
    } catch (error) {
      // 吞错保留 (契约: ._pth 写入失败不应中断启动)
    }
  }

  async findSystemPython() {
    this._ensureInitialized();
    try {
      const result = await this._cmd('where', ['python']);
      if (result.code !== 0) return null;

      const paths = result.stdout.split('\n').map(p => p.trim()).filter(p => p && p.endsWith('.exe'));
      for (const p of paths) {
        if (p.toLowerCase().includes(WINDOWSAPPS_MARKER)) continue;
        const testResult = await this._cmd(p, ['--version']);
        if (testResult.code === 0) return p;
      }
      return null;
    } catch {
      return null;
    }
  }

  async findPythonHome() {
    this._ensureInitialized();
    const embeddedPython = this._pathHelper.getEmbeddedPythonPath(this.projectRoot);
    if (embeddedPython) {
      return path.dirname(embeddedPython);
    }

    try {
      const systemPython = await this.findSystemPython();
      if (systemPython) {
        const result = await this._cmd(systemPython, ['-c', 'import sys; print(sys.base_prefix)']);
        if (result.code === 0) return result.stdout.trim();
      }
    } catch { }

    return null;
  }

  async findUvCommand() {
    this._ensureInitialized();
    try {
      const result = await this._cmd('where', ['uv']);
      if (result.code === 0) {
        const paths = result.stdout.split('\n').map(p => p.trim()).filter(p => p);
        return paths[0] || null;
      }
    } catch { }
    return null;
  }

  // ── 委托: DriverChecker (1-liner, IPC 兼容约束) ────────────────

  async checkCP210xDriver() {
    this._ensureInitialized();
    return this._driverChecker.checkCP210xDriver();
  }

  async isInstallerRunning() {
    this._ensureInitialized();
    return this._driverChecker.isInstallerRunning();
  }

  getDriverInstallerPath() {
    this._ensureInitialized();
    return this._driverChecker.getDriverInstallerPath();
  }

  // ── 委托: SerialPortEnumerator (1-liner) ───────────────────────

  async getSerialPorts() {
    this._ensureInitialized();
    return this._serialPortEnumerator.getSerialPorts();
  }

  // ── 委托: pathHelper (1-liner) ─────────────────────────────────

  getAapt2Path() {
    this._ensureInitialized();
    return this._pathHelper.getAapt2Path(this.projectRoot, true);
  }

  // ── Android SDK 检查 ──────────────────────────────────────────

  async checkCommandExists(command) {
    this._ensureInitialized();
    try {
      const result = await this._cmd('where', [command]);
      return result.code === 0 && result.stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  async checkAndroidSDK() {
    this._ensureInitialized();
    try {
      const adbPath = this._pathHelper.getAdbPath(this.projectRoot, true);
      const aapt2Path = this.getAapt2Path();

      const adbLocalExists = adbPath !== 'adb';
      const aapt2LocalExists = aapt2Path !== 'aapt2';

      let adbAvailable = adbLocalExists;
      let aapt2Available = aapt2LocalExists;

      if (!adbLocalExists) {
        adbAvailable = await this.checkCommandExists('adb');
      }
      if (!aapt2LocalExists) {
        aapt2Available = await this.checkCommandExists('aapt2');
      }

      const localComponents = [];
      const systemComponents = [];
      if (adbAvailable) {
        if (adbLocalExists) localComponents.push('adb');
        else systemComponents.push('adb');
      }
      if (aapt2Available) {
        if (aapt2LocalExists) localComponents.push('aapt2');
        else systemComponents.push('aapt2');
      }

      let sourceLabel = '';
      if (localComponents.length > 0 && systemComponents.length > 0) {
        sourceLabel = ` (${this.i18nService.t('splash.checks.sourceMixed', { local: localComponents.join(', '), system: systemComponents.join(', ') })})`;
      } else if (localComponents.length > 0) {
        sourceLabel = ` (${this.i18nService.t('splash.checks.sourceBuiltIn')})`;
      } else if (systemComponents.length > 0) {
        sourceLabel = ` (${this.i18nService.t('splash.checks.sourceSystem')})`;
      }

      if (adbAvailable && aapt2Available) {
        return {
          status: 'success',
          message: this.i18nService.t('splash.checks.androidSdkComplete') + sourceLabel
        };
      }

      const missingComponents = [];
      if (!adbAvailable) missingComponents.push('adb');
      if (!aapt2Available) missingComponents.push('aapt2');

      return {
        status: 'error',
        message: this.i18nService.t('splash.checks.missingAndroidSdkComponents', { components: missingComponents.join(', ') })
      };
    } catch (error) {
      return {
        status: 'error',
        message: this.i18nService.t('splash.checks.checkAndroidSdkFailed', { error: error.message })
      };
    }
  }

  // ── Python 环境检查 ───────────────────────────────────────────

  async checkPythonEnvironment(projectRoot) {
    this._ensureInitialized();
    try {
      const pythonConfig = this._pathHelper.getPythonConfig();
      if (!pythonConfig) {
        return {
          status: 'error',
          message: this.i18nService.t('splash.checks.venvNotFound')
        };
      }

      const result = await this._cmd(pythonConfig.pythonPath, ['--version']);
      const sourceLabel = pythonConfig.sourceLabel;

      if (result.code !== 0) {
        return {
          status: 'error',
          message: this.i18nService.t('splash.checks.pythonNotFound')
        };
      }

      const versionMatch = result.stdout.match(/Python (\d+\.\d+\.\d+)/);
      if (!versionMatch) {
        return {
          status: 'error',
          message: this.i18nService.t('splash.checks.cannotGetPythonVersion')
        };
      }

      const version = versionMatch[1];
      let versionStatus = 'success';
      let versionMessage;

      if (compareVersions(version, REQUIRED_PYTHON_VERSION) >= 0) {
        versionMessage = this.i18nService.t('splash.checks.pythonVersion', {
          version: version,
          recommended: REQUIRED_PYTHON_VERSION
        }) + ' ' + sourceLabel;
      } else {
        return {
          status: 'error',
          message: this.i18nService.t('splash.checks.pythonVersionMismatch', { version: version, required: REQUIRED_PYTHON_VERSION })
        };
      }

      const requirementsPath = path.join(projectRoot, PYPROJECT_FILE);
      if (this._fs.existsSync(requirementsPath)) {
        const listScript = "import importlib.metadata; dists = importlib.metadata.distributions(); [print(d.metadata['Name'] + '==' + d.version) for d in dists]";
        const pipResult = await this._cmd(pythonConfig.pythonPath, ['-c', listScript]);

        if (pipResult.code !== 0) {
          return {
            status: 'warning',
            message: versionMessage + ' - ' + this.i18nService.t('splash.checks.cannotCheckPackages')
          };
        }

        const installedPackages = new Set(pipResult.stdout.split('\n').map(pkg => pkg.toLowerCase().trim()).filter(pkg => pkg));
        const requirementsContent = this._fs.readFileSync(requirementsPath, 'utf8');
        const requirements = parsePyprojectDependencies(requirementsContent)
          .filter(spec => !IGNORED_MISSING_PACKAGES.includes(extractPackageName(spec)));

        if (requirements.length > 0) {
          const missingPackages = checkMissingPackages(installedPackages, requirements);
          if (missingPackages.length > 0) {
            return {
              status: 'warning',
              message: this.i18nService.t('splash.checks.missingPackages', { versionMessage: versionMessage, packages: missingPackages.join(', ') })
            };
          }
        }
      }

      return {
        status: versionStatus,
        message: versionMessage
      };
    } catch (error) {
      return {
        status: 'error',
        message: this.i18nService.t('splash.checks.checkPythonEnvironmentFailed', { error: error.message })
      };
    }
  }

  // ── Node Modules 检查 ─────────────────────────────────────────

  checkNodeModules() {
    this._ensureInitialized();
    try {
      if (this._isPackaged()) {
        return {
          status: 'success',
          message: this.i18nService.t('splash.checks.nodeModulesComplete')
        };
      }

      const nodeModulesPath = path.join(__dirname, '..', '..', '..', NODE_MODULES_DIR);
      const packageJsonPath = path.join(__dirname, '..', '..', '..', PACKAGE_JSON_FILE);

      if (!this._fs.existsSync(nodeModulesPath)) {
        return {
          status: 'error',
          message: this.i18nService.t('splash.checks.nodeModulesNotFound')
        };
      }

      if (!this._fs.existsSync(packageJsonPath)) {
        return {
          status: 'warning',
          message: this.i18nService.t('splash.checks.packageJsonNotFound')
        };
      }

      const packageJson = JSON.parse(this._fs.readFileSync(packageJsonPath, 'utf8'));
      const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
      const depNames = Object.keys(dependencies);

      if (depNames.length === 0) {
        return {
          status: 'success',
          message: this.i18nService.t('splash.checks.nodeModulesComplete')
        };
      }

      const missingDeps = [];
      for (const depName of depNames) {
        const depPath = path.join(nodeModulesPath, depName);
        if (!this._fs.existsSync(depPath)) {
          missingDeps.push(depName);
        }
      }

      if (missingDeps.length > 0) {
        if (missingDeps.length <= 5) {
          return {
            status: 'error',
            message: this.i18nService.t('splash.checks.nodeModulesMissing', { deps: missingDeps.join(', ') })
          };
        } else {
          return {
            status: 'error',
            message: this.i18nService.t('splash.checks.nodeModulesMissingMany', { count: missingDeps.length })
          };
        }
      }

      return {
        status: 'success',
        message: this.i18nService.t('splash.checks.nodeModulesComplete')
      };
    } catch (error) {
      return {
        status: 'error',
        message: this.i18nService.t('splash.checks.checkNodeModulesFailed', { error: error.message })
      };
    }
  }

  // ── 编排: 环境检查 ────────────────────────────────────────────

  async runEnvironmentChecks(projectRoot, splashWindow) {
    this._ensureInitialized();
    const checks = [
      {
        name: this.i18nService.t('splash.checks.cp210DriverCheck'),
        check: () => this.checkCP210xDriver(),
        isRequired: false
      },
      {
        name: 'Android SDK',
        check: () => this.checkAndroidSDK(),
        isRequired: true
      },
      {
        name: this.i18nService.t('splash.checks.pythonEnvironment'),
        check: () => this.checkPythonEnvironment(projectRoot),
        isRequired: true
      },
      {
        name: this.i18nService.t('splash.checks.nodeModulesCheck'),
        check: () => this.checkNodeModules(),
        isRequired: true
      }
    ];

    const results = {
      required: [],
      warnings: []
    };

    for (let i = 0; i < checks.length; i++) {
      const check = checks[i];
      const progress = Math.round(((i + 1) / (checks.length + 1)) * 100);

      if (splashWindow) {
        splashWindow.webContents.send(IPC_CHANNELS.CHECK_PROGRESS, {
          percentage: progress,
          message: this.i18nService.t('splash.checks.checking', { name: check.name })
        });
      }

      try {
        const result = await check.check();

        if (splashWindow) {
          splashWindow.webContents.send(IPC_CHANNELS.CHECK_RESULT, {
            name: check.name,
            status: result.status,
            message: result.message,
            isRequired: check.isRequired,
            canInstall: result.canInstall || false,
            installerPath: result.installerPath || null
          });
        }

        if (result.status === 'error') {
          if (check.isRequired) {
            results.required.push(`${check.name}: ${result.message}`);
          } else {
            results.warnings.push(`${check.name}: ${result.message}`);
          }
        } else if (result.status === 'warning') {
          results.warnings.push(`${check.name}: ${result.message}`);
        }
      } catch (error) {
        if (splashWindow) {
          splashWindow.webContents.send(IPC_CHANNELS.CHECK_RESULT, {
            name: check.name,
            status: 'error',
            message: this.i18nService.t('splash.checks.checkFailed', { error: error.message }),
            isRequired: check.isRequired
          });
        }

        if (check.isRequired) {
          results.required.push(`${check.name}: ${this.i18nService.t('splash.checks.checkFailedShort')}`);
        } else {
          results.warnings.push(`${check.name}: ${this.i18nService.t('splash.checks.checkFailedShort')}`);
        }
      }

      await new Promise(resolve => setTimeout(resolve, 300));
    }

    return results;
  }
}

module.exports = {
  EnvironmentService,
  parsePyprojectDependencies,
  extractPackageName,
  checkMissingPackages,
  compareVersions,
  buildPythonConfig,
  IGNORED_MISSING_PACKAGES,
  REQUIRED_PYTHON_VERSION,
};

const { spawn: defaultSpawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const pathHelper = require('../utils/pathHelper');
const Logger = require('../utils/logger');
const FileBasedDialogMonitor = require('./FileBasedDialogMonitor');
const { IPC_CHANNELS } = require('../../shared/constants');

// ── module-level 纯函数 (对称 H1 TestPlanService parsePytestIni/extractMarkersFromContent/inferTestType) ──

/**
 * 解析 pytest 摘要行 → stats (从 _parseTestStats 30 行提取, 纯 regex 无 this)
 * @param {string} output
 * @returns {{passed:number, failed:number, skipped:number, broken:number, total:number}}
 */
function parseTestStats(output) {
  const stats = { passed: 0, failed: 0, skipped: 0, broken: 0, total: 0 };
  if (!output) return stats;

  const lines = output.split('\n');
  let summaryLine = null;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (/\d+\s+(passed|failed|skipped|broken)/i.test(line)) {
      summaryLine = line;
      break;
    }
  }
  if (!summaryLine) return stats;

  const passedMatch = summaryLine.match(/(\d+)\s+passed/i);
  const failedMatch = summaryLine.match(/(\d+)\s+failed/i);
  const skippedMatch = summaryLine.match(/(\d+)\s+skipped/i);
  const brokenMatch = summaryLine.match(/(\d+)\s+broken/i);

  stats.passed = passedMatch ? parseInt(passedMatch[1], 10) : 0;
  stats.failed = failedMatch ? parseInt(failedMatch[1], 10) : 0;
  stats.skipped = skippedMatch ? parseInt(skippedMatch[1], 10) : 0;
  stats.broken = brokenMatch ? parseInt(brokenMatch[1], 10) : 0;
  stats.total = stats.passed + stats.failed + stats.skipped + stats.broken;
  return stats;
}

/**
 * 从输出提取 XKAT_ALLURE_RESULTS_DIR 标记 (纯 regex, 无 fs 依赖)
 * @param {string} output
 * @returns {string|null}
 */
function findAllureResultsDirMarker(output) {
  const m = output.match(/XKAT_ALLURE_RESULTS_DIR:(.+)/);
  return m ? m[1].trim() : null;
}

/**
 * 构建 PYTHONPATH env (从 buildPythonPathEnv 提取, 纯函数, srcPath 作参数)
 * @param {{isSystem:boolean, sitePackagesPath?:string}} pythonCmd
 * @param {string} srcPath
 * @returns {{PYTHONPATH:string}}
 */
function buildPythonPathEnv(pythonCmd, srcPath) {
  if (pythonCmd.isSystem && pythonCmd.sitePackagesPath) {
    return { PYTHONPATH: [pythonCmd.sitePackagesPath, srcPath].join(path.delimiter) };
  }
  return { PYTHONPATH: srcPath };
}

// ── 3 默认 factory (factory-or-default, 对称 H1/H2 3 factory) ──

/** 包装 fs 2 同步方法 (仅 _findAllureResultsDir fallback 用) */
const defaultFileSystemFactory = () => ({
  existsSync: (p) => fs.existsSync(p),
  readdirSync: (d) => fs.readdirSync(d),
});

/** 包装 new Logger (Q1 A: eager, 消除 L42 硬编码 new) */
const defaultLoggerFactory = (logsPath) => new Logger(logsPath, 'PythonTest');

/** 包装 mainWindow.webContents.send (Q2 A: progressSenderFactory, 集中 2 处 → 1 处) */
const defaultProgressSenderFactory = (mainWindow) => ({
  send: (channel, data) => {
    if (mainWindow) {
      mainWindow.webContents.send(channel, data);
    }
  }
});

// ── PythonTestService 类 ──

class PythonTestService {
  /**
   * @param {Object} deps - 签名零变 (调用方 factories.js / 26 测试依赖)
   * @param {string}   deps.projectRoot
   * @param {Object}   deps.i18nService
   * @param {string}   deps.userDataPath
   * @param {Electron.BrowserWindow} deps.mainWindow
   * @param {Object}   deps.allureService
   * @param {Object}   deps.testPlanService
   * @param {Object}   [deps.dialogMonitor]          - 已注入, 保留 (Q5 A)
   * @param {Function} [deps.spawn]                  - 已注入, 保留
   * @param {Function} [deps.fileSystemFactory]      - 新增, 默认包装 fs 2 方法
   * @param {Function} [deps.loggerFactory]          - 新增, 默认 new Logger
   * @param {Function} [deps.progressSenderFactory]  - 新增, 默认包装 mainWindow.webContents.send
   */
  constructor(deps) {
    // ── 公共属性 (测试 L55-60 直接断言, 必须保留) ──
    this.projectRoot = deps.projectRoot;
    this.i18nService = deps.i18nService;
    this.userDataPath = deps.userDataPath;
    this.mainWindow = deps.mainWindow;
    this.allureService = deps.allureService;
    this.testPlanService = deps.testPlanService;

    /** @type {import('child_process').ChildProcess|null} */
    this.currentPythonProcess = null;

    // ── 已有注入 (保留, Q5 A: deps.dialogMonitor 直传) ──
    this._spawn = deps.spawn || defaultSpawn;
    this._dialogMonitor = deps.dialogMonitor || new FileBasedDialogMonitor({
      mainWindow: this.mainWindow,
      i18nService: this.i18nService,
      userDataPath: this.userDataPath
    });

    // ── 3 新 factory-or-default (对称 H1/H2) ──
    this._fileSystemFactory = deps.fileSystemFactory || defaultFileSystemFactory;
    this._loggerFactory = deps.loggerFactory || defaultLoggerFactory;
    this._progressSenderFactory = deps.progressSenderFactory || defaultProgressSenderFactory;

    // ── eager 创建 (Q1 A: Logger eager, 无行为微变; 对称 TestCaseService L70-71) ──
    this._fs = this._fileSystemFactory();
    this.logger = this._loggerFactory(this._getLogsPath('XKAT'));
    this._progressSender = this._progressSenderFactory(this.mainWindow);
  }

  _getLogsPath(...subdirs) {
    const baseDir = this.userDataPath || this.projectRoot;
    return pathHelper.getLogsPath(baseDir, ...subdirs);
  }

  // Q4 A: 保留实例方法委托 (测试 L386 直接调用), 委托模块级 buildPythonPathEnv
  buildPythonPathEnv(pythonCmd) {
    return buildPythonPathEnv(pythonCmd, path.join(this.projectRoot, 'src'));
  }

  getPythonCommand() {
    const pythonConfig = pathHelper.getPythonConfig();
    if (pythonConfig) {
      return {
        command: pythonConfig.pythonPath,
        args: [],
        useVenv: true,
        isEmbedded: pythonConfig.isEmbedded,
        isSystem: pythonConfig.isSystem,
        sitePackagesPath: pythonConfig.sitePackagesPath
      };
    }
    return { command: null, args: [], useVenv: false, error: this.i18nService.t('splash.checks.venvNotFound') };
  }

  /**
   * 运行 Python 测试。Best-effort 流水线: 退出码权威, 副作用失败记入 sideEffectFailures。
   * run() 125 行 → ~20 行编排器, 7 私有 helper 拆分。
   * @param {Object} testConfig
   * @param {string[]} testConfig.testPaths
   * @param {string[]} [testConfig.markers]
   * @param {string}   [testConfig.testPlanName]
   * @returns {Promise<Object>}
   */
  run(testConfig) {
    return new Promise((resolve, reject) => {
      const { testPlanName } = testConfig;

      // run 时刷新 _progressSender: 构造时 mainWindow 可能为 null (applicationService L121),
      // ElectronApp.initialize L124-125 后续才赋值 this.mainWindow。
      // 闭包捕获的 null 会导致 webContents.send 静默失败, 渲染进程收不到 TEST_OUTPUT/TEST_ERROR。
      this._progressSender = this._progressSenderFactory(this.mainWindow);

      // Step 1: 解析 python 命令, 失败早退
      const pythonCmd = this.getPythonCommand();
      if (!pythonCmd.command) {
        resolve(this._buildFailureResult(testPlanName, pythonCmd.error));
        return;
      }

      // Step 2: 启动 dialog monitor
      this._dialogMonitor.start();

      // Step 3: 组装 args + env + spawn
      const args = this._buildPythonArgs(testConfig);
      const env = this._buildSpawnEnv(pythonCmd);
      const pythonProcess = this._spawnPythonProcess(pythonCmd.command, args, env);
      this.currentPythonProcess = pythonProcess;

      // Step 4: 接管 stdout/stderr 流 (累积 + 日志 + 转发渲染进程)
      const buffers = { output: '', errorOutput: '' };
      this._wireOutputStreams(pythonProcess, buffers);

      // Step 5: close → 清理 + 构建结果
      pythonProcess.on('close', async (code) => {
        this._cleanupAfterRun();
        try {
          const result = await this._buildRunResult(code, buffers, testPlanName);
          resolve(result);
        } catch (err) {
          reject(err);
        }
      });

      pythonProcess.on('error', reject);
    });
  }

  /**
   * 终止运行中的测试进程。
   * @returns {{ success: boolean, message: string }}
   */
  stop() {
    try {
      if (this.currentPythonProcess) {
        this.currentPythonProcess.kill();
        this.currentPythonProcess = null;

        this._dialogMonitor.stop();

        return { success: true, message: this.i18nService.t('testExecution.testManuallyStopped') };
      } else {
        return { success: false, message: this.i18nService.t('testExecution.noSelectedTestPlan') };
      }
    } catch (error) {
      console.error('Stop test failed:', error);
      return { success: false, message: this.i18nService.t('testExecution.stopTestFailed') + ': ' + error.message };
    }
  }

  // ═════════════════ 私有 helper (run() 125 行 → 7 helper, 每 < 20 行) ═════════════════

  /** 早退失败结果 (L87-97 提取) */
  _buildFailureResult(testPlanName, error) {
    return {
      success: false,
      exitCode: -1,
      output: '',
      error: error || this.i18nService.t('splash.checks.uvVenvNotFound'),
      testPlanName,
      testStats: { passed: 0, failed: 0, skipped: 0, broken: 0, total: 0 },
      allureReportPath: null,
      sideEffectFailures: []
    };
  }

  /** 构建 python CLI args (L102-113 提取) */
  _buildPythonArgs(testConfig) {
    const { testPaths, markers, testPlanName } = testConfig;
    const args = ['-m', 'main', '--test-paths', testPaths.join(',')];
    if (markers && markers.length > 0) {
      args.push('--markers', markers.join(','));
    }
    if (testPlanName) {
      args.push('--test-plan', testPlanName);
    }
    return args;
  }

  /** 构建 spawn env (L118-126 提取) */
  _buildSpawnEnv(pythonCmd) {
    return {
      ...process.env,
      PYTHONIOENCODING: 'utf-8',
      PYTHONUTF8: '1',
      XKAUTOTESTER_LANG: this.i18nService.getLanguage(),
      XKAUTOTESTER_LOCALES_PATH: pathHelper.getLocalesPath(this.projectRoot),
      ...(pythonCmd.isEmbedded ? {} : this.buildPythonPathEnv(pythonCmd)),
      XKAUTOTESTER_USER_DATA: this.userDataPath
    };
  }

  /** spawn 子进程 (L115-128 提取, 包装 this._spawn) */
  _spawnPythonProcess(command, args, env) {
    return this._spawn(command, args, {
      cwd: this.projectRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
      windowsHide: true
    });
  }

  /**
   * 接管 stdout/stderr 流 (L135-151 提取, 2 处 webContents.send → 1 处 _progressSender.send)
   * @param {import('child_process').ChildProcess} pythonProcess
   * @param {{output:string, errorOutput:string}} buffers — mutate
   */
  _wireOutputStreams(pythonProcess, buffers) {
    pythonProcess.stdout.on('data', (data) => {
      const decoded = data.toString('utf8');
      buffers.output += decoded;
      this.logger.stdout(decoded.trimEnd());
      this._progressSender.send(IPC_CHANNELS.TEST_OUTPUT, decoded);
    });
    pythonProcess.stderr.on('data', (data) => {
      const decoded = data.toString('utf8');
      buffers.errorOutput += decoded;
      this.logger.stderr(decoded.trimEnd());
      this._progressSender.send(IPC_CHANNELS.TEST_ERROR, decoded);
    });
  }

  /** close 后清理 (L154-155 提取) */
  _cleanupAfterRun() {
    this._dialogMonitor.stop();
    this.currentPythonProcess = null;
  }

  /**
   * 构建 close 结果 (L157-198 提取): 解析 stats + allure pipeline + 组装 result
   * @param {number} code
   * @param {{output:string, errorOutput:string}} buffers
   * @param {string} testPlanName
   * @returns {Promise<Object>}
   */
  async _buildRunResult(code, buffers, testPlanName) {
    const testStats = this._parseTestStats(buffers.output + '\n' + buffers.errorOutput);
    const { allureReportPath, sideEffectFailures } =
      await this._runAllurePipeline(buffers.output, testPlanName);
    // error 字段只用简短消息, 不含整段 errorOutput:
    // errorOutput 已由 _wireOutputStreams 实时转发到 TEST_ERROR (红字) 显示,
    // 若再作为 error 字段返回, invokeWithCheck 抛错时 error.message = 整段日志,
    // 渲染进程 catch 块显示 ">>> 测试运行失败: 整段日志" 重复
    let error = '';
    if (code !== 0) {
      error = `Tests failed (exit code: ${code})`;
    }
    return {
      success: code === 0,
      exitCode: code,
      output: buffers.output,
      error,
      testPlanName,
      testStats,
      allureReportPath,
      sideEffectFailures
    };
  }

  /**
   * Best-effort Allure 流水线 (L160-186 提取): 2 步 try-catch
   * @returns {Promise<{allureReportPath:null|string, sideEffectFailures:Array}>}
   */
  async _runAllurePipeline(output, testPlanName) {
    const sideEffectFailures = [];
    let allureReportPath = null;
    const allureResultsDir = this._findAllureResultsDir(output);

    // Step 1: 生成 Allure 报告
    if (this.allureService && allureResultsDir) {
      try {
        const r = await this.allureService.generateAllureReport(allureResultsDir, testPlanName);
        if (r.success) allureReportPath = r.reportPath;
      } catch (e) {
        sideEffectFailures.push({ step: 'generateReport', error: e.message });
        this.logger.error(`Pipeline generateReport failed: ${e.message}`);
      }
    }

    // Step 2: 更新测试计划报告路径
    if (this.testPlanService && testPlanName && allureReportPath) {
      try {
        await this.testPlanService.updateRunReportPath(testPlanName, allureReportPath);
      } catch (e) {
        sideEffectFailures.push({ step: 'updatePlanPath', error: e.message });
        this.logger.error(`Pipeline updatePlanPath failed: ${e.message}`);
      }
    }
    return { allureReportPath, sideEffectFailures };
  }

  // ═════════════════ 保留实例方法 (Q4 A: 委托模块级纯函数, 测试 L386/L416 依赖) ═════════════════

  /** 保留为实例方法 (测试 L386 直接调用), 委托模块级 parseTestStats */
  _parseTestStats(output) {
    return parseTestStats(output);
  }

  /**
   * 保留为实例方法 (测试 L416 直接调用)
   * marker 提取委托模块级纯函数; fallback 用注入 this._fs
   */
  _findAllureResultsDir(output) {
    const marker = findAllureResultsDirMarker(output);
    if (marker) return marker;

    const defaultResultsDir = path.join(this._getLogsPath('Allure'), 'allure-results');
    if (this._fs.existsSync(defaultResultsDir)) {
      const files = this._fs.readdirSync(defaultResultsDir);
      if (files.some(f => f.endsWith('-result.json') || f.endsWith('.json'))) {
        return defaultResultsDir;
      }
    }
    return null;
  }
}

// Q3 A: Object.assign 保 default export (零测试改 + factories.js 零改)
// 附加 3 模块级纯函数为静态属性 (可 PythonTestService.parseTestStats 访问)
module.exports = Object.assign(PythonTestService, {
  parseTestStats,
  findAllureResultsDirMarker,
  buildPythonPathEnv
});

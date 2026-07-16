const { spawn: defaultSpawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const pathHelper = require('../utils/pathHelper');
const Logger = require('../utils/logger');
const FileBasedDialogMonitor = require('./FileBasedDialogMonitor');

class PythonTestService {
  /**
   * @param {Object} deps
   * @param {string}   deps.projectRoot
   * @param {Object}   deps.i18nService
   * @param {string}   deps.userDataPath
   * @param {Electron.BrowserWindow} deps.mainWindow
   * @param {Object}   deps.allureService
   * @param {Object}   deps.testPlanService
   * @param {Object}   [deps.dialogMonitor] - { start(), stop() }，默认 FileBasedDialogMonitor
   * @param {Function} [deps.spawn] - 子进程 spawn 函数，默认 child_process.spawn
   */
  constructor(deps) {
    this.projectRoot = deps.projectRoot;
    this.i18nService = deps.i18nService;
    this.userDataPath = deps.userDataPath;
    this.mainWindow = deps.mainWindow;
    this.allureService = deps.allureService;
    this.testPlanService = deps.testPlanService;

    /** @type {import('child_process').ChildProcess|null} */
    this.currentPythonProcess = null;

    /** @private */
    this._spawn = deps.spawn || defaultSpawn;

    /** @private */
    this._dialogMonitor = deps.dialogMonitor || new FileBasedDialogMonitor({
      mainWindow: this.mainWindow,
      i18nService: this.i18nService,
      userDataPath: this.userDataPath
    });

    this.logger = new Logger(this._getLogsPath('XKAT'), 'PythonTest');
  }

  _getLogsPath(...subdirs) {
    const baseDir = this.userDataPath || this.projectRoot;
    return path.join(baseDir, 'logs', ...subdirs);
  }

  buildPythonPathEnv(pythonCmd) {
    const srcPath = path.join(this.projectRoot, 'src');
    if (pythonCmd.isSystem && pythonCmd.sitePackagesPath) {
      return { PYTHONPATH: [pythonCmd.sitePackagesPath, srcPath].join(path.delimiter) };
    }
    return { PYTHONPATH: srcPath };
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
   * 运行 Python 测试。Best-effort 流水线：退出码权威，副作用失败记入 sideEffectFailures。
   * @param {Object} testConfig
   * @param {string[]} testConfig.testPaths
   * @param {string[]} [testConfig.markers]
   * @param {string}   [testConfig.testPlanName]
   * @returns {Promise<Object>}
   */
  run(testConfig) {
    return new Promise((resolve, reject) => {
      const { testPaths, markers, testPlanName } = testConfig;

      const pythonCmd = this.getPythonCommand();
      if (!pythonCmd.command) {
        resolve({
          success: false,
          exitCode: -1,
          output: '',
          error: pythonCmd.error || this.i18nService.t('splash.checks.uvVenvNotFound'),
          testPlanName: testPlanName,
          testStats: { passed: 0, failed: 0, skipped: 0, broken: 0, total: 0 },
          allureReportPath: null,
          sideEffectFailures: []
        });
        return;
      }

      this._dialogMonitor.start();

      const pythonArgs = [
        '-m', 'main',
        '--test-paths', testPaths.join(',')
      ];

      if (markers && markers.length > 0) {
        pythonArgs.push('--markers', markers.join(','));
      }

      if (testPlanName) {
        pythonArgs.push('--test-plan', testPlanName);
      }

      const pythonProcess = this._spawn(pythonCmd.command, pythonArgs, {
        cwd: this.projectRoot,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          PYTHONIOENCODING: 'utf-8',
          PYTHONUTF8: '1',
          XKAUTOTESTER_LANG: this.i18nService.getLanguage(),
          ...(pythonCmd.isEmbedded ? {} : this.buildPythonPathEnv(pythonCmd)),
          XKAUTOTESTER_USER_DATA: this.userDataPath
        },
        windowsHide: true
      });

      this.currentPythonProcess = pythonProcess;

      let output = '';
      let errorOutput = '';

      pythonProcess.stdout.on('data', (data) => {
        const decodedData = data.toString('utf8');
        output += decodedData;
        this.logger.stdout(decodedData.trimEnd());
        if (this.mainWindow) {
          this.mainWindow.webContents.send('test-output', decodedData);
        }
      });

      pythonProcess.stderr.on('data', (data) => {
        const decodedData = data.toString('utf8');
        errorOutput += decodedData;
        this.logger.stderr(decodedData.trimEnd());
        if (this.mainWindow) {
          this.mainWindow.webContents.send('test-error', decodedData);
        }
      });

      pythonProcess.on('close', async (code) => {
        this._dialogMonitor.stop();
        this.currentPythonProcess = null;

        const testStats = this._parseTestStats(output + '\n' + errorOutput);
        const sideEffectFailures = [];

        // Best-effort 流水线 Step 1: 生成 Allure 报告
        let allureReportPath = null;
        const allureResultsDir = this._findAllureResultsDir(output);
        if (this.allureService && allureResultsDir) {
          try {
            const allureResult = await this.allureService.generateAllureReport(
              allureResultsDir,
              testPlanName
            );
            if (allureResult.success) {
              allureReportPath = allureResult.reportPath;
            }
          } catch (e) {
            sideEffectFailures.push({ step: 'generateReport', error: e.message });
            this.logger.error(`Pipeline generateReport failed: ${e.message}`);
          }
        }

        // Best-effort 流水线 Step 2: 更新测试计划报告路径
        if (this.testPlanService && testPlanName && allureReportPath) {
          try {
            await this.testPlanService.updateRunReportPath(testPlanName, allureReportPath);
          } catch (e) {
            sideEffectFailures.push({ step: 'updatePlanPath', error: e.message });
            this.logger.error(`Pipeline updatePlanPath failed: ${e.message}`);
          }
        }

        const result = {
          success: code === 0,
          exitCode: code,
          output: output,
          error: errorOutput,
          testPlanName: testPlanName,
          testStats: testStats,
          allureReportPath: allureReportPath,
          sideEffectFailures: sideEffectFailures
        };
        resolve(result);
      });

      pythonProcess.on('error', (error) => {
        reject(error);
      });
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

  /**
   * @private 从 Python 输出中检测 allure-results 目录
   */
  _findAllureResultsDir(output) {
    // 优先从输出标记解析
    const markerMatch = output.match(/XKAT_ALLURE_RESULTS_DIR:(.+)/);
    if (markerMatch) {
      return markerMatch[1].trim();
    }

    // Fallback: 检查已知路径
    const defaultResultsDir = path.join(this._getLogsPath('Allure'), 'allure-results');
    if (fs.existsSync(defaultResultsDir)) {
      const files = fs.readdirSync(defaultResultsDir);
      if (files.some(f => f.endsWith('-result.json') || f.endsWith('.json'))) {
        return defaultResultsDir;
      }
    }

    return null;
  }

  _parseTestStats(output) {
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
}

module.exports = PythonTestService;

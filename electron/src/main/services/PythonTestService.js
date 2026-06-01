const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const asyncFs = require('../utils/asyncFs');
const pathHelper = require('../utils/pathHelper');
const Logger = require('../utils/logger');

class PythonTestService {
  constructor(projectRoot, i18nService, userDataPath) {
    this.projectRoot = projectRoot;
    this.i18nService = i18nService;
    this.userDataPath = userDataPath;
    this.currentPythonProcess = null;
    this.unauthorizedDialogInterval = null;
    this.mainWindow = null;
    this.logger = new Logger(this._getLogsPath('XKAT'), 'PythonTest');
  }

  _getLogsPath(...subdirs) {
    const baseDir = this.userDataPath || this.projectRoot;
    return path.join(baseDir, 'logs', ...subdirs);
  }

  setMainWindow(window) {
    this.mainWindow = window;
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

  runPythonTests(testConfig) {
    return new Promise((resolve, reject) => {
      const { testPaths, markers, testPlanName } = testConfig;
      
      const pythonCmd = this.getPythonCommand();
      if (!pythonCmd.command) {
        resolve({
          success: false,
          error: pythonCmd.error || this.i18nService.t('splash.checks.uvVenvNotFound')
        });
        return;
      }
      
      this.startUnauthorizedDialogMonitor();
      
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

      const pythonProcess = spawn(pythonCmd.command, pythonArgs, {
        cwd: this.projectRoot,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          PYTHONIOENCODING: 'utf-8',
          PYTHONUTF8: '1',
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

      pythonProcess.on('close', (code) => {
        this.stopUnauthorizedDialogMonitor();
        this.currentPythonProcess = null;
        
        const testStats = this._parseTestStats(output);
        
        const result = {
          success: code === 0,
          exitCode: code,
          output: output,
          error: errorOutput,
          testPlanName: testPlanName,
          testStats: testStats
        };
        resolve(result);
      });

      pythonProcess.on('error', (error) => {
        reject(error);
      });
    });
  }

  stopPythonTests() {
    try {
      if (this.currentPythonProcess) {
        this.currentPythonProcess.kill();
        this.currentPythonProcess = null;
        
        this.stopUnauthorizedDialogMonitor();
        
        return { success: true, message: '测试已停止' };
      } else {
        return { success: false, message: '没有正在运行的测试' };
      }
    } catch (error) {
      console.error('停止测试失败:', error);
      return { success: false, message: '停止测试失败: ' + error.message };
    }
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

  startUnauthorizedDialogMonitor() {
    const dialogTriggerFile = path.join(this.userDataPath, 'logs', 'unauthorized_dialog.json');
    const dialogDir = path.dirname(dialogTriggerFile);
    
    const processDialogFile = async () => {
      try {
        if (fs.existsSync(dialogTriggerFile)) {
          const data = await asyncFs.readFile(dialogTriggerFile, 'utf8');
          const dialogData = JSON.parse(data);
          
          await this.showUnauthorizedDialog(dialogData);
          
          fs.unlinkSync(dialogTriggerFile);
        }
      } catch (error) {
        console.error('检查未授权弹窗触发文件失败:', error);
      }
    };
    
    if (fs.existsSync(dialogTriggerFile)) {
      processDialogFile();
    }
    
    try {
      if (!fs.existsSync(dialogDir)) {
        fs.mkdirSync(dialogDir, { recursive: true });
      }
      
      this.unauthorizedDialogWatcher = fs.watch(dialogDir, (eventType, filename) => {
        if (filename === 'unauthorized_dialog.json') {
          setTimeout(processDialogFile, 100);
        }
      });
      
      this.unauthorizedDialogWatcher.on('error', (error) => {
        console.error('未授权弹窗文件监听失败，回退到轮询模式:', error);
        this.unauthorizedDialogInterval = setInterval(processDialogFile, 2000);
        this.unauthorizedDialogWatcher = null;
      });
    } catch (error) {
      console.error('创建文件监听失败，回退到轮询模式:', error);
      this.unauthorizedDialogInterval = setInterval(processDialogFile, 2000);
    }
  }

  stopUnauthorizedDialogMonitor() {
    if (this.unauthorizedDialogWatcher) {
      this.unauthorizedDialogWatcher.close();
      this.unauthorizedDialogWatcher = null;
    }
    if (this.unauthorizedDialogInterval) {
      clearInterval(this.unauthorizedDialogInterval);
      this.unauthorizedDialogInterval = null;
    }
  }

  async showUnauthorizedDialog(dialogData) {
    const { dialog } = require('electron');
    const { device_name, message } = dialogData;
    
    await dialog.showMessageBox(this.mainWindow, {
      type: 'warning',
      title: '设备未授权',
      message: message || `设备 ${device_name} 未授权`,
      detail: '请在Android设备上点击"同意"授权此电脑连接。\n\n系统将自动等待授权，最多等待60秒。',
      buttons: ['确定'],
      defaultId: 0,
      cancelId: 0
    });
  }
}

module.exports = PythonTestService;

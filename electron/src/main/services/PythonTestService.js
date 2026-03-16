const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class PythonTestService {
  constructor(projectRoot, i18nService) {
    this.projectRoot = projectRoot;
    this.i18nService = i18nService;
    this.currentPythonProcess = null;
    this.unauthorizedDialogInterval = null;
    this.mainWindow = null;
  }

  setMainWindow(window) {
    this.mainWindow = window;
  }

  getPythonCommand() {
    const venvPython = path.resolve(this.projectRoot, '.venv', 'Scripts', 'python.exe');
    if (fs.existsSync(venvPython)) {
      return { command: venvPython, args: [], useVenv: true };
    }
    return { command: null, args: [], useVenv: false, error: this.i18nService.t('splash.checks.uvVenvNotFound') };
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
          PYTHONPATH: path.join(this.projectRoot, 'src')
        },
        windowsHide: true
      });
      
      this.currentPythonProcess = pythonProcess;

      let output = '';
      let errorOutput = '';

      pythonProcess.stdout.on('data', (data) => {
        const decodedData = data.toString('utf8');
        output += decodedData;
        if (this.mainWindow) {
          this.mainWindow.webContents.send('test-output', decodedData);
        }
      });

      pythonProcess.stderr.on('data', (data) => {
        const decodedData = data.toString('utf8');
        errorOutput += decodedData;
        if (this.mainWindow) {
          this.mainWindow.webContents.send('test-error', decodedData);
        }
      });

      pythonProcess.on('close', (code) => {
        this.stopUnauthorizedDialogMonitor();
        this.currentPythonProcess = null;
        
        const result = {
          success: code === 0,
          exitCode: code,
          output: output,
          error: errorOutput,
          testPlanName: testPlanName
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

  startUnauthorizedDialogMonitor() {
    const dialogTriggerFile = path.join(this.projectRoot, 'logs', 'unauthorized_dialog.json');
    
    const checkDialogTrigger = () => {
      try {
        if (fs.existsSync(dialogTriggerFile)) {
          const data = fs.readFileSync(dialogTriggerFile, 'utf8');
          const dialogData = JSON.parse(data);
          
          this.showUnauthorizedDialog(dialogData);
          
          fs.unlinkSync(dialogTriggerFile);
        }
      } catch (error) {
        console.error('检查未授权弹窗触发文件失败:', error);
      }
    };
    
    this.unauthorizedDialogInterval = setInterval(checkDialogTrigger, 2000);
    
    checkDialogTrigger();
  }

  stopUnauthorizedDialogMonitor() {
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

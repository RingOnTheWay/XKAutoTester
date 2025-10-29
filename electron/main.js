const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const axios = require('axios');

// 设置控制台输出编码为UTF-8（仅在Node.js环境下有效）
if (typeof process.stdout.setEncoding === 'function') {
    process.stdout.setEncoding('utf8');
}
if (typeof process.stderr.setEncoding === 'function') {
    process.stderr.setEncoding('utf8');
}

// 确保控制台输出支持UTF-8
if (process.platform === 'win32') {
    // Windows系统下设置控制台编码
    const { execSync } = require('child_process');
    try {
        execSync('chcp 65001', { stdio: 'inherit' });
    } catch (error) {
        console.warn('无法设置控制台编码为UTF-8:', error.message);
    }
}

class ElectronApp {
  constructor() {
    this.mainWindow = null;
    this.isDev = process.argv.includes('--dev');
    this.projectRoot = path.join(__dirname, '..'); // Python项目根目录
    this.allureServerProcess = null;
    this.allureServerPort = null;
    this.allureServerTestPlan = null;
    this.allureServerStartTime = null;
    this.allureOpenProcess = null;  // 新增：存储allure open进程
  }

  createWindow() {
    // 创建浏览器窗口
    this.mainWindow = new BrowserWindow({
      width: 1400,
      height: 900,
      minWidth: 1000,
      minHeight: 700,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js'),
        webSecurity: false // 允许加载本地文件
      },
      titleBarStyle: 'default', // 恢复默认标题栏
      frame: true, // 确保有窗口边框
      autoHideMenuBar: true, // 自动隐藏菜单栏
      show: false,
      icon: path.join(__dirname, 'assets', 'icon.png'),
      x: 100, // 设置窗口位置
      y: 100
    });

    // 加载应用的index.html
    this.mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

    // 窗口准备好后显示
    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow.show();
      this.mainWindow.focus();
      this.mainWindow.center(); // 居中显示窗口
      
      // 添加调试信息
      console.log('Electron window displayed and focused');
    });

    // 处理窗口关闭
    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });

    // 阻止新窗口打开
    this.mainWindow.webContents.setWindowOpenHandler(() => {
      return { action: 'deny' };
    });
  }

  setupIPC() {
    // 处理文件选择
    ipcMain.handle('select-directory', async () => {
      const result = await dialog.showOpenDialog(this.mainWindow, {
        properties: ['openDirectory']
      });
      return result;
    });

    // 处理文件选择
    ipcMain.handle('select-file', async () => {
      const result = await dialog.showOpenDialog(this.mainWindow, {
        properties: ['openFile'],
        filters: [
          { name: 'Python Files', extensions: ['py'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });
      return result;
    });

    // 运行Python测试
    ipcMain.handle('run-python-tests', async (event, testConfig) => {
      return this.runPythonTests(testConfig);
    });

    // 获取测试计划
    ipcMain.handle('get-test-plans', async () => {
      return this.getTestPlans();
    });

    // 保存测试计划
    ipcMain.handle('save-test-plan', async (event, planData) => {
      return this.saveTestPlan(planData);
    });

    // 删除测试计划
    ipcMain.handle('delete-test-plan', async (event, planId) => {
      return this.deleteTestPlan(planId);
    });

    // 更新测试计划
    ipcMain.handle('update-test-plan', async (event, planData) => {
      return this.updateTestPlan(planData);
    });

    // 打开外部链接
    ipcMain.handle('open-external', async (event, url) => {
      await shell.openExternal(url);
    });

    // 获取项目信息
    ipcMain.handle('get-project-info', async () => {
      return {
        root: this.projectRoot,
        version: '1.0.0',
        name: 'XKAutoTester'
      };
    });

    // 获取pytest标记定义
    ipcMain.handle('get-pytest-markers', async () => {
      return this.getPytestMarkers();
    });

    // 扫描tests文件夹获取测试文件
    ipcMain.handle('scan-test-files', async (event, directoryPath) => {
      return this.scanTestFiles(directoryPath);
    });

    // 提取pytest标记
    ipcMain.handle('extract-pytest-markers', async (event, filePaths) => {
      return this.extractPytestMarkers(filePaths);
    });

    // 查看测试报告
    ipcMain.handle('view-report', async (event, testPlanName) => {
      return this.openAllureReport(testPlanName);
    });

    // 检查报告是否存在
    ipcMain.handle('check-report-exists', async (event, testPlanName) => {
      return this.checkReportExists(testPlanName);
    });

    // 停止Allure服务器
    ipcMain.handle('stop-allure-server', async () => {
      return this.stopAllureServer();
    });

    // 获取Allure服务器状态
    ipcMain.handle('get-allure-server-status', async () => {
      return this.getAllureServerStatus();
    });
  }

  async runPythonTests(testConfig) {
    return new Promise((resolve, reject) => {
      const { testPaths, markers, testPlanName } = testConfig;
      
      // 构建Python命令 - 使用新的Electron专用运行器
      const pythonArgs = [
        path.join(this.projectRoot, 'electron_run_tests.py'),
        '--test-paths', testPaths.join(',')
      ];

      if (markers && markers.length > 0) {
        pythonArgs.push('--markers', markers.join(','));
      }

      if (testPlanName) {
        pythonArgs.push('--test-plan', testPlanName);
      }

      // 运行Python进程，设置UTF-8编码环境
      const pythonProcess = spawn('python', pythonArgs, {
        cwd: this.projectRoot,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          PYTHONIOENCODING: 'utf-8',  // 设置Python输出编码
          PYTHONUTF8: '1'  // 启用Python UTF-8模式
        }
      });

      let output = '';
      let errorOutput = '';

      pythonProcess.stdout.on('data', (data) => {
        // 使用UTF-8编码处理输出
        const decodedData = data.toString('utf8');
        output += decodedData;
        this.mainWindow.webContents.send('test-output', decodedData);
      });

      pythonProcess.stderr.on('data', (data) => {
        // 使用UTF-8编码处理错误输出
        const decodedData = data.toString('utf8');
        errorOutput += decodedData;
        this.mainWindow.webContents.send('test-error', decodedData);
      });

      pythonProcess.on('close', (code) => {
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

  async getTestPlans() {
    try {
      // 静默读取测试计划文件，避免控制台输出格式问题
      const plansPath = path.join(this.projectRoot, 'test_plans.json');
      
      if (fs.existsSync(plansPath)) {
        const data = fs.readFileSync(plansPath, 'utf8');
        const plans = JSON.parse(data);
        return plans;
      }
      return [];
    } catch (error) {
      console.error('Error reading test plans: ' + error);
      return [];
    }
  }

  async saveTestPlan(planData) {
    try {
      const plansPath = path.join(this.projectRoot, 'test_plans.json');
      let existingPlans = [];
      
      if (fs.existsSync(plansPath)) {
        const data = fs.readFileSync(plansPath, 'utf8');
        existingPlans = JSON.parse(data);
      }

      // 更新或添加测试计划
      const index = existingPlans.findIndex(p => p.name === planData.name);
      if (index >= 0) {
        existingPlans[index] = planData;
      } else {
        existingPlans.push(planData);
      }

      fs.writeFileSync(plansPath, JSON.stringify(existingPlans, null, 2));
      return { success: true };
    } catch (error) {
      console.error('保存测试计划失败:', error);
      return { success: false, error: error.message };
    }
  }

  async updateTestPlan(planData) {
    try {
      const plansPath = path.join(this.projectRoot, 'test_plans.json');
      let existingPlans = [];
      
      if (fs.existsSync(plansPath)) {
        const data = fs.readFileSync(plansPath, 'utf8');
        existingPlans = JSON.parse(data);
      }

      // 根据ID或名称查找并更新测试计划
      const index = existingPlans.findIndex(p => 
        (planData.id && (p.id === planData.id || p.name === planData.id)) || 
        p.name === planData.name
      );
      
      if (index >= 0) {
        // 保留原始创建时间
        const originalPlan = existingPlans[index];
        planData.created = originalPlan.created || planData.created;
        planData.id = originalPlan.id || planData.id;
        
        existingPlans[index] = planData;
        fs.writeFileSync(plansPath, JSON.stringify(existingPlans, null, 2));
        return { success: true };
      } else {
        return { success: false, error: '未找到指定的测试计划' };
      }
    } catch (error) {
      console.error('更新测试计划失败:', error);
      return { success: false, error: error.message };
    }
  }

  async deleteTestPlan(planId) {
    try {
      const plansPath = path.join(this.projectRoot, 'test_plans.json');
      let existingPlans = [];
      
      if (fs.existsSync(plansPath)) {
        const data = fs.readFileSync(plansPath, 'utf8');
        existingPlans = JSON.parse(data);
      }

      // 根据名称或ID删除测试计划
      const index = existingPlans.findIndex(p => p.name === planId || p.id === planId);
      if (index >= 0) {
        existingPlans.splice(index, 1);
        fs.writeFileSync(plansPath, JSON.stringify(existingPlans, null, 2));
        return { success: true };
      } else {
        return { success: false, error: '未找到指定的测试计划' };
      }
    } catch (error) {
      console.error('删除测试计划失败:', error);
      return { success: false, error: error.message };
    }
  }

  async openAllureReport(testPlanName = null) {
    try {
      // 如果没有指定测试计划名称，使用最新的测试计划
      if (!testPlanName) {
        const testPlans = await this.getTestPlans();
        if (testPlans.length > 0) {
          testPlanName = testPlans[testPlans.length - 1].name;
        } else {
          // 检查是否有任何报告目录存在
          const allureReportBaseDir = path.join(this.projectRoot, 'allure-reports');
          if (fs.existsSync(allureReportBaseDir)) {
            const reportDirs = fs.readdirSync(allureReportBaseDir).filter(item => {
              const itemPath = path.join(allureReportBaseDir, item);
              return fs.statSync(itemPath).isDirectory();
            });
            
            if (reportDirs.length > 0) {
              testPlanName = reportDirs[reportDirs.length - 1];
            }
          }
        }
      }

      if (!testPlanName) {
        return { success: false, error: '没有可用的Allure报告，请先生成报告' };
      }

      const allureReportDir = path.join(this.projectRoot, 'allure-reports', testPlanName);
      
      if (!fs.existsSync(allureReportDir)) {
        return { success: false, error: `测试计划 '${testPlanName}' 的Allure报告不存在` };
      }

      const indexHtmlPath = path.join(allureReportDir, 'index.html');
      
      if (!fs.existsSync(indexHtmlPath)) {
        return { success: false, error: `测试计划 '${testPlanName}' 的报告文件不完整` };
      }

      // 使用allure open命令打开报告
      const result = await this.openAllureReportDirectly(testPlanName);
      
      if (result.success) {
        return { 
          success: true, 
          message: `已打开测试计划 '${testPlanName}' 的Allure报告`
        };
      } else {
        return { 
          success: false, 
          error: `打开报告失败: ${result.error}` 
        };
      }
    } catch (error) {
      console.error('打开Allure报告失败:', error);
      return { success: false, error: error.message };
    }
  }

  async startAllureServer(testPlanName) {
    try {
      const allureReportDir = path.join(this.projectRoot, 'allure-reports', testPlanName);
      
      if (!fs.existsSync(allureReportDir)) {
        return { success: false, error: '报告目录不存在' };
      }

      // 查找可用的端口
      const port = await this.findAvailablePort(4040);
      
      // 启动allure serve命令
      const { spawn } = require('child_process');
      
      // 优先使用项目内的allure命令
      const projectAllureBat = path.join(this.projectRoot, 'env', 'allure', 'bin', 'allure.bat');
      const projectAllure = path.join(this.projectRoot, 'env', 'allure', 'bin', 'allure');
      
      let allureCmd;
      let args = ['serve', allureReportDir, '--port', port.toString()];
      
      if (fs.existsSync(projectAllureBat)) {
        // Windows系统：使用cmd.exe来执行.bat文件
        allureCmd = 'cmd.exe';
        args = ['/c', projectAllureBat, ...args];
      } else if (fs.existsSync(projectAllure)) {
        allureCmd = projectAllure;
      } else {
        allureCmd = 'allure';
      }

      console.log('启动Allure服务器，命令:', allureCmd, '参数:', args, '端口:', port, '目录:', allureReportDir);
      
      // 启动allure serve进程
      this.allureServerProcess = spawn(allureCmd, args, {
        cwd: this.projectRoot,
        stdio: 'pipe',
        detached: false
      });

      this.allureServerPort = port;
      this.allureServerTestPlan = testPlanName;
      this.allureServerStartTime = Date.now();

      // 监听进程输出
      this.allureServerProcess.stdout.on('data', (data) => {
        console.log(`Allure服务器输出: ${data}`);
      });

      this.allureServerProcess.stderr.on('data', (data) => {
        console.error(`Allure服务器错误: ${data}`);
      });

      this.allureServerProcess.on('close', (code) => {
        console.log(`Allure服务器进程已退出，退出码: ${code}`);
        this.allureServerProcess = null;
        this.allureServerPort = null;
        this.allureServerTestPlan = null;
      });

      // 等待服务器启动
      await new Promise(resolve => setTimeout(resolve, 3000));

      // 检查服务器是否在运行
      if (this.allureServerProcess && !this.allureServerProcess.killed) {
        // 打开浏览器
        await shell.openExternal(`http://localhost:${port}`);
        
        return { success: true, port: port };
      } else {
        return { success: false, error: 'Allure服务器启动失败' };
      }

    } catch (error) {
      console.error('启动Allure服务器失败:', error);
      return { success: false, error: error.message };
    }
  }

  // 从allure open输出中提取端口号
  extractPortFromAllureOpenOutput(stdoutData) {
    try {
      // allure open输出通常包含类似这样的信息：
      // "Generating report to temp directory..."
      // "Report successfully generated to /path/to/report"
      // "Starting web server..."
      // "Server started at <http://localhost:4040>"
      
      const lines = stdoutData.split('\n');
      for (const line of lines) {
        // 匹配端口号模式
        const portMatch = line.match(/http:\/\/localhost:(\d+)/) || line.match(/Server started at.*:(\d+)/);
        if (portMatch && portMatch[1]) {
          return parseInt(portMatch[1]);
        }
      }
      return null;
    } catch (error) {
      console.error('提取端口号失败:', error);
      return null;
    }
  }

  // 按端口杀死进程
  async killProcessByPort(port, processName = 'allure open进程') {
    const fs = require('fs');
    const logPath = path.join(this.projectRoot, 'logs', 'test.log');
    const logMessage = (message) => {
      const timestamp = new Date().toISOString();
      const logEntry = `[${timestamp}] [Electron] ${message}\n`;
      console.log(logEntry);
      fs.appendFileSync(logPath, logEntry, 'utf8');
    };

    logMessage(`开始按端口停止${processName}: ${port}`);
    
    try {
      // 使用netstat查找监听指定端口的进程
      const { execSync } = require('child_process');
      const findCommand = `netstat -ano | findstr :${port} | findstr LISTENING`;
      logMessage(`执行命令查找端口进程: ${findCommand}`);
      
      const result = execSync(findCommand, { encoding: 'utf8' });
      logMessage(`查找结果: ${result}`);
      
      if (result.trim()) {
        const lines = result.trim().split('\n');
        let killedProcesses = [];
        
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 5) {
            const pid = parts[parts.length - 1];
            logMessage(`找到进程PID: ${pid}`);
            
            // 杀死进程
            const killCommand = `taskkill /PID ${pid} /F`;
            logMessage(`执行杀死进程命令: ${killCommand}`);
            
            try {
              execSync(killCommand);
              logMessage(`成功杀死进程PID: ${pid}`);
              killedProcesses.push(`端口${port}的进程(PID:${pid})`);
            } catch (killError) {
              logMessage(`杀死进程失败: ${killError.message}`);
            }
          }
        }
        
        if (killedProcesses.length > 0) {
          const message = `已停止: ${killedProcesses.join(', ')}`;
          logMessage(`停止${processName}完成: ${message}`);
          return { success: true, killedProcesses };
        } else {
          logMessage(`未找到监听端口 ${port} 的进程`);
          return { success: false, error: '未找到进程' };
        }
      } else {
        logMessage(`未找到监听端口 ${port} 的进程`);
        return { success: false, error: '未找到进程' };
      }
    } catch (error) {
      const errorMessage = `按端口停止${processName}失败: ${error.message}`;
      logMessage(errorMessage);
      return { success: false, error: error.message };
    }
  }

  async stopAllureServer() {
    try {
      // 添加详细日志到test.log
      const fs = require('fs');
      const logPath = path.join(this.projectRoot, 'logs', 'test.log');
      const logMessage = (message) => {
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] [Electron] ${message}\n`;
        console.log(logEntry);
        fs.appendFileSync(logPath, logEntry, 'utf8');
      };
      
      logMessage('开始停止Allure服务器进程');
      
      let stoppedProcesses = [];
      
      // 首先尝试从allure open输出中提取端口号并杀死进程
      if (this.allureOpenProcess && !this.allureOpenProcess.killed) {
        logMessage('正在分析allure open进程输出以提取端口号...');
        
        // 这里需要获取allure open进程的输出数据
        // 由于输出数据是实时收集的，我们需要在进程运行时保存输出
        // 暂时使用直接杀死方式，后续可以改进为保存输出数据
        
        // 先尝试直接杀死allure open进程
        logMessage('正在停止allure open进程...');
        this.allureOpenProcess.kill();
        this.allureOpenProcess = null;
        stoppedProcesses.push('allure open进程');
        logMessage('allure open进程已停止');
      }
      
      // 按端口停止Allure服务器进程
      if (this.allureServerPort) {
        logMessage(`正在按端口 ${this.allureServerPort} 停止Allure服务器...`);
        
        const result = await this.killProcessByPort(this.allureServerPort, 'Allure服务器');
        if (result.success && result.killedProcesses) {
          stoppedProcesses = stoppedProcesses.concat(result.killedProcesses);
        }
        
        // 清理进程引用
        if (this.allureServerProcess) {
          this.allureServerProcess.kill('SIGTERM');
          this.allureServerProcess = null;
        }
        this.allureServerPort = null;
        this.allureServerTestPlan = null;
        this.allureServerStartTime = null;
      }
      
      if (stoppedProcesses.length > 0) {
        const message = `已停止: ${stoppedProcesses.join(', ')}`;
        logMessage(`停止服务器完成: ${message}`);
        return { success: true, message };
      } else {
        logMessage('没有找到需要停止的进程');
        return { success: true, message: '没有正在运行的进程需要停止' };
      }
    } catch (error) {
      const errorMessage = `停止进程失败: ${error.message}`;
      console.error(errorMessage);
      
      // 记录错误到日志文件
      const fs = require('fs');
      const logPath = path.join(this.projectRoot, 'logs', 'test.log');
      const timestamp = new Date().toISOString();
      const logEntry = `[${timestamp}] [Electron] ${errorMessage}\n`;
      fs.appendFileSync(logPath, logEntry, 'utf8');
      
      return { success: false, error: error.message };
    }
  }

  async getAllureServerStatus() {
    try {
      if (this.allureServerProcess && !this.allureServerProcess.killed) {
        return {
          running: true,
          allureOpenRunning: this.allureOpenProcess !== null && !this.allureOpenProcess.killed,
          port: this.allureServerPort,
          testPlan: this.allureServerTestPlan,
          startTime: this.allureServerStartTime,
          uptime: Date.now() - this.allureServerStartTime
        };
      } else {
        return { 
          running: false,
          allureOpenRunning: this.allureOpenProcess !== null && !this.allureOpenProcess.killed
        };
      }
    } catch (error) {
      console.error('获取Allure服务器状态失败:', error);
      return { 
        running: false, 
        allureOpenRunning: this.allureOpenProcess !== null && !this.allureOpenProcess.killed,
        error: error.message 
      };
    }
  }

  async openAllureReportDirectly(testPlanName) {
    try {
      // 添加详细日志到test.log
      const fs = require('fs');
      const logPath = path.join(this.projectRoot, 'logs', 'test.log');
      const logMessage = (message) => {
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] [Electron] ${message}\n`;
        console.log(logEntry);
        fs.appendFileSync(logPath, logEntry, 'utf8');
      };
      
      logMessage(`Starting to open Allure report with allure open: ${testPlanName}`);
      
      const allureReportDir = path.join(this.projectRoot, 'allure-reports', testPlanName);
      
      if (!fs.existsSync(allureReportDir)) {
        logMessage(`Report directory does not exist: ${allureReportDir}`);
        return { success: false, error: '报告目录不存在' };
      }

      // 检查报告目录是否包含有效的Allure报告
      const indexHtmlPath = path.join(allureReportDir, 'index.html');
      if (!fs.existsSync(indexHtmlPath)) {
        logMessage(`Report directory does not contain valid Allure report file: ${indexHtmlPath}`);
        return { success: false, error: '报告目录不包含有效的Allure报告文件' };
      }

      // 优先使用项目内的allure命令
      const projectAllureBat = path.join(this.projectRoot, 'env', 'allure', 'bin', 'allure.bat');
      const projectAllure = path.join(this.projectRoot, 'env', 'allure', 'bin', 'allure');
      
      let command;
      
      if (fs.existsSync(projectAllureBat)) {
        // Windows系统：使用完整的命令行字符串，确保空格被正确处理
        command = `"${projectAllureBat}" open "${allureReportDir}"`;
        logMessage('Using project allure.bat command');
      } else if (fs.existsSync(projectAllure)) {
        command = `"${projectAllure}" open "${allureReportDir}"`;
        logMessage('Using project allure command');
      } else {
        command = `allure open "${allureReportDir}"`;
        logMessage('Using system allure command');
      }

      logMessage(`Opening report with allure open, command: ${command}`);
      
      // 启动allure open进程
      const { spawn } = require('child_process');
      this.allureOpenProcess = spawn(command, {
        cwd: this.projectRoot,
        stdio: 'pipe',
        detached: false,
        shell: true  // 使用系统shell来处理命令，自动处理路径中的空格
      });

      let stdoutData = '';
      let stderrData = '';

      // 保存allure open进程的输出数据
      this.allureOpenOutput = '';

      // 监听进程输出
      this.allureOpenProcess.stdout.on('data', (data) => {
        const output = data.toString();
        stdoutData += output;
        this.allureOpenOutput += output; // 保存输出数据用于端口提取
        const logOutput = `allure open output: ${output}`;
        console.log(logOutput);
        logMessage(logOutput);
        
        // 尝试从输出中提取端口号
        const extractedPort = this.extractPortFromAllureOpenOutput(this.allureOpenOutput);
        if (extractedPort) {
          logMessage(`Extracted port number from output: ${extractedPort}`);
          this.allureServerPort = extractedPort;
        }
      });

      this.allureOpenProcess.stderr.on('data', (data) => {
        const output = data.toString();
        stderrData += output;
        this.allureOpenOutput += `[ERROR] ${output}`; // 保存错误输出数据
        const logOutput = `allure open error: ${output}`;
        console.error(logOutput);
        logMessage(logOutput);
      });

      // 监听进程退出
      this.allureOpenProcess.on('close', (code) => {
        const closeMessage = `allure open进程已退出，退出码: ${code}`;
        console.log(closeMessage);
        logMessage(closeMessage);
        
        const stdoutMessage = `标准输出: ${stdoutData}`;
        console.log(stdoutMessage);
        logMessage(stdoutMessage);
        
        const stderrMessage = `错误输出: ${stderrData}`;
        console.log(stderrMessage);
        logMessage(stderrMessage);
        
        // 清理输出数据
        this.allureOpenOutput = '';
        this.allureOpenProcess = null; // 进程退出后清空引用
        logMessage('allure open process reference cleared');
      });

      logMessage('allure open process started successfully');
      
      // 立即返回成功，不等待进程完成
      return { success: true };

    } catch (error) {
      const errorMessage = `使用allure open打开报告失败: ${error.message}`;
      console.error(errorMessage);
      
      // 记录错误到日志文件
      const fs = require('fs');
      const logPath = path.join(this.projectRoot, 'logs', 'test.log');
      const timestamp = new Date().toISOString();
      const logEntry = `[${timestamp}] [Electron] ${errorMessage}\n`;
      fs.appendFileSync(logPath, logEntry, 'utf8');
      
      return { success: false, error: error.message };
    }
  }

  async findAvailablePort(startPort = 4040) {
    const net = require('net');
    
    for (let port = startPort; port < startPort + 100; port++) {
      try {
        const server = net.createServer();
        await new Promise((resolve, reject) => {
          server.once('error', (err) => {
            if (err.code === 'EADDRINUSE') {
              reject(new Error(`端口 ${port} 已被占用`));
            } else {
              reject(err);
            }
          });
          
          server.once('listening', () => {
            server.close();
            resolve(port);
          });
          
          server.listen(port);
        });
        
        return port;
      } catch (error) {
        // 端口被占用，继续尝试下一个
        continue;
      }
    }
    
    throw new Error(`在端口 ${startPort}-${startPort + 99} 范围内找不到可用端口`);
  }

  async checkReportExists(testPlanName) {
    try {
      console.log('checkReportExists called with testPlanName:', testPlanName);
      
      const allureReportDir = path.join(this.projectRoot, 'allure-reports', testPlanName);
      const indexHtmlPath = path.join(allureReportDir, 'index.html');
      
      console.log('检查报告目录:', allureReportDir);
      console.log('检查index.html文件:', indexHtmlPath);
      
      const dirExists = fs.existsSync(allureReportDir);
      const fileExists = fs.existsSync(indexHtmlPath);
      const exists = dirExists && fileExists;
      
      console.log('目录存在:', dirExists, '文件存在:', fileExists, '最终结果:', exists);
      
      return { exists: exists };
    } catch (error) {
      console.error('检查报告存在性失败:', error);
      return { exists: false };
    }
  }

  async getPytestMarkers() {
    try {
      const pytestIniPath = path.join(this.projectRoot, 'pytest.ini');
      if (!fs.existsSync(pytestIniPath)) {
        throw new Error('pytest.ini文件不存在');
      }

      const content = fs.readFileSync(pytestIniPath, 'utf8');
      const markers = [];
      
      // 解析pytest.ini文件中的标记定义
      const lines = content.split('\n');
      let inMarkersSection = false;
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        
        // 检查是否进入markers部分
        if (trimmedLine === '[tool:pytest]' || trimmedLine === '[pytest]') {
          inMarkersSection = true;
          continue;
        }
        
        // 检查是否离开markers部分
        if (trimmedLine.startsWith('[') && trimmedLine.endsWith(']')) {
          if (trimmedLine !== '[tool:pytest]' && trimmedLine !== '[pytest]') {
            inMarkersSection = false;
          }
          continue;
        }
        
        // 在markers部分中解析标记定义
        if (inMarkersSection && trimmedLine.startsWith('markers =')) {
          // 处理多行标记定义
          const markerLine = trimmedLine.substring('markers ='.length).trim();
          if (markerLine) {
            this.parseMarkersLine(markerLine, markers);
          }
        } else if (inMarkersSection && trimmedLine.startsWith('    ') && markers.length > 0) {
          // 处理缩进的标记定义行
          this.parseMarkersLine(trimmedLine.trim(), markers);
        }
      }

      return markers;
    } catch (error) {
      console.error('读取pytest标记失败:', error);
      // 返回默认标记
      return [
        { name: 'smoke', description: '冒烟测试' },
        { name: 'unit', description: '单元功能测试' },
        { name: 'exception', description: '异常场景测试' },
        { name: 'critical', description: '关键功能测试' },
        { name: 'appium', description: 'Appium移动端测试' }
      ];
    }
  }

  parseMarkersLine(line, markers) {
    // 解析标记定义行，格式如: "smoke: 冒烟测试"
    const parts = line.split(':');
    if (parts.length >= 2) {
      const name = parts[0].trim();
      const description = parts.slice(1).join(':').trim();
      
      if (name) {
        markers.push({ name, description });
      }
    }
  }

  async scanTestFiles(directoryPath) {
    try {
      let projectRoot = directoryPath || this.projectRoot;
      
      // 检查用户是否选择了tests目录本身
      const testsPath = path.join(projectRoot, 'tests');
      if (fs.existsSync(testsPath) && fs.statSync(testsPath).isDirectory()) {
        // 如果tests目录存在，说明用户选择了项目根目录
        console.log('用户选择了项目根目录:', projectRoot);
      } else if (fs.existsSync(projectRoot) && fs.statSync(projectRoot).isDirectory()) {
        // 如果选择的目录存在，检查它是否是tests目录
        const dirName = path.basename(projectRoot);
        if (dirName === 'tests') {
          // 用户选择了tests目录，自动找到其父目录作为项目根目录
          projectRoot = path.dirname(projectRoot);
          console.log('用户选择了tests目录，自动调整项目根目录为:', projectRoot);
        }
      }
      
      const finalTestsPath = path.join(projectRoot, 'tests');
      console.log('最终项目根目录:', projectRoot);
      console.log('扫描测试文件路径:', finalTestsPath);
      console.log('目录是否存在:', fs.existsSync(finalTestsPath));
       
      if (!fs.existsSync(finalTestsPath)) {
        console.log('测试目录不存在:', finalTestsPath);
        return [];
      }
 
      const files = fs.readdirSync(finalTestsPath);
      console.log('目录中的文件:', files);
       
      const testFiles = [];

      for (const file of files) {
        // 只处理.py文件，排除__pycache__目录
        if (file.endsWith('.py') && file !== '__pycache__') {
          const filePath = path.join(finalTestsPath, file);
          const stats = fs.statSync(filePath);
          
          if (stats.isFile()) {
            // 根据文件名推断测试类型
            let type = 'unit';
            if (file.includes('appium')) {
              type = 'appium';
            } else if (file.includes('playwright')) {
              type = 'playwright';
            } else if (file.includes('check_app_status')) {
              type = 'status';
            }

            testFiles.push({
              name: file,
              path: path.relative(projectRoot, filePath),
              type: type
            });
          }
        }
      }

      console.log('找到的测试文件:', testFiles);
      return testFiles;
    } catch (error) {
      console.error('扫描测试文件失败:', error);
      return [];
    }
  }

  async extractPytestMarkers(filePaths) {
    try {
      // 添加调试日志，记录调用参数
      console.log('extractPytestMarkers called with files:', filePaths);
      
      const markers = new Set();
      
      for (const filePath of filePaths) {
        const fullPath = path.join(this.projectRoot, filePath);
        
        if (!fs.existsSync(fullPath)) {
          console.warn('文件不存在:', fullPath);
          continue;
        }
        
        const content = fs.readFileSync(fullPath, 'utf8');
        
        // 使用正则表达式匹配pytest标记
        // 匹配格式：@pytest.mark.标记名
        const markerRegex = /@pytest\.mark\.(\w+)/g;
        let match;
        
        while ((match = markerRegex.exec(content)) !== null) {
          markers.add(match[1]);
        }
      }
      
      // 创建标记描述映射，避免重复
      const markerDescriptions = {
        'smoke': '冒烟测试',
        'unit': '单元功能测试', 
        'exception': '异常场景测试',
        'critical': '关键功能测试',
        'appium': 'Appium移动端测试',
        'playwright': 'Playwright测试'
      };
      
      // 将标记转换为标准格式，确保每个标记只出现一次
      const foundMarkers = Array.from(markers).map(markerName => ({
        name: markerName,
        description: markerDescriptions[markerName] || `${markerName}测试`
      }));
      
      console.log('提取到的pytest标记:', Array.from(markers));
      console.log('返回的标记定义:', foundMarkers);
      
      return foundMarkers;
    } catch (error) {
      console.error('提取pytest标记失败:', error);
      // 如果提取失败，返回空数组（不添加任何默认标记）
      return [];
    }
  }

  initialize() {
    // 当所有窗口被关闭时退出应用
    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        this.createWindow();
      }
    });

    // 应用准备就绪
    app.whenReady().then(() => {
      this.createWindow();
      this.setupIPC();
    });

    // 阻止默认行为
    app.on('web-contents-created', (event, contents) => {
      contents.on('new-window', (event, navigationUrl) => {
        event.preventDefault();
        shell.openExternal(navigationUrl);
      });
    });
  }
}

// 启动应用
const electronApp = new ElectronApp();
electronApp.initialize();
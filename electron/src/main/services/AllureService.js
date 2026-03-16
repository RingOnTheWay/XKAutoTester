const path = require('path');
const { spawn, execSync } = require('child_process');
const asyncFs = require('../utils/asyncFs');

class AllureService {
  constructor(projectRoot, i18nService) {
    this.projectRoot = projectRoot;
    this.i18nService = i18nService;
    this.allureServerProcess = null;
    this.allureServerPort = null;
    this.allureServerTestPlan = null;
    this.allureServerStartTime = null;
    this.allureOpenProcess = null;
    this.allureOpenOutput = '';
  }

  async openAllureReport(testPlanName = null) {
    try {
      const serverStatus = await this.getAllureServerStatus();
      if (serverStatus.running || serverStatus.allureOpenRunning) {
        const serverInfo = this.allureServerPort ? `当前服务地址: http://127.0.0.1:${this.allureServerPort}` : '';
        return { 
          success: false, 
          error: `已有Allure服务器在运行，请先关闭现有服务器再尝试打开新报告。${serverInfo ? ' ' + serverInfo : ''}`
        };
      }

      if (!testPlanName) {
        const allureReportBaseDir = path.join(this.projectRoot, 'logs', 'Allure', 'allure-reports');
        if (await asyncFs.exists(allureReportBaseDir)) {
          const items = await asyncFs.readdir(allureReportBaseDir);
          const reportDirs = [];
          
          for (const item of items) {
            const itemPath = path.join(allureReportBaseDir, item);
            const stat = await asyncFs.stat(itemPath);
            if (stat.isDirectory()) {
              reportDirs.push(item);
            }
          }
          
          if (reportDirs.length > 0) {
            testPlanName = reportDirs[reportDirs.length - 1];
          }
        }
      }

      if (!testPlanName) {
        return { success: false, error: '没有可用的Allure报告，请先生成报告' };
      }

      const allureReportDir = path.join(this.projectRoot, 'logs', 'Allure', 'allure-reports', testPlanName);
      
      if (!(await asyncFs.exists(allureReportDir))) {
        return { success: false, error: `测试计划 '${testPlanName}' 的Allure报告不存在` };
      }

      const indexHtmlPath = path.join(allureReportDir, 'index.html');
      
      if (!(await asyncFs.exists(indexHtmlPath))) {
        return { success: false, error: `测试计划 '${testPlanName}' 的报告文件不完整` };
      }

      return await this.openAllureReportDirectly(testPlanName);
    } catch (error) {
      console.error('打开Allure报告失败:', error);
      return { success: false, error: error.message };
    }
  }

  async openAllureReportDirectly(testPlanName) {
    try {
      const logsDir = path.join(this.projectRoot, 'logs', 'XKAT');
      await asyncFs.ensureDir(logsDir);

      const currentTime = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const electronLogPath = path.join(logsDir, `XKAT-${currentTime}.log`);
      
      const logMessage = async (message) => {
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] [Electron] ${message}\n`;
        try {
          await asyncFs.appendFile(electronLogPath, logEntry);
        } catch (err) {
          console.error('写入Electron日志失败:', err);
        }
      };
      
      await logMessage(`Starting to open Allure report: ${testPlanName}`);
      
      const allureReportDir = path.join(this.projectRoot, 'logs', 'Allure', 'allure-reports', testPlanName);
      
      if (!(await asyncFs.exists(allureReportDir))) {
        await logMessage(`Report directory does not exist: ${allureReportDir}`);
        return { success: false, error: '报告目录不存在' };
      }

      const indexHtmlPath = path.join(allureReportDir, 'index.html');
      if (!(await asyncFs.exists(indexHtmlPath))) {
        await logMessage(`Report directory does not contain valid Allure report file`);
        return { success: false, error: '报告目录不包含有效的Allure报告文件' };
      }

      const projectAllureBat = path.join(this.projectRoot, 'env', 'allure', 'bin', 'allure.bat');
      const projectAllure = path.join(this.projectRoot, 'env', 'allure', 'bin', 'allure');
      
      let command;
      
      if (await asyncFs.exists(projectAllureBat)) {
        command = `"${projectAllureBat}" open "${allureReportDir}"`;
        await logMessage('Using project allure.bat command');
      } else if (await asyncFs.exists(projectAllure)) {
        command = `"${projectAllure}" open "${allureReportDir}"`;
        await logMessage('Using project allure command');
      } else {
        command = `allure open "${allureReportDir}"`;
        await logMessage('Using system allure command');
      }

      await logMessage(`Opening report with allure open, command: ${command}`);
      
      this.allureOpenProcess = spawn(command, {
        cwd: this.projectRoot,
        stdio: 'pipe',
        detached: false,
        shell: true,
        windowsHide: true
      });

      this.allureOpenOutput = '';

      this.allureOpenProcess.stdout.on('data', async (data) => {
        const output = data.toString();
        this.allureOpenOutput += output;
        await logMessage(`allure open output: ${output}`);
        
        const extractedPort = this.extractPortFromAllureOpenOutput(this.allureOpenOutput);
        if (extractedPort) {
          await logMessage(`Extracted port number from output: ${extractedPort}`);
          this.allureServerPort = extractedPort;
        }
      });

      this.allureOpenProcess.stderr.on('data', async (data) => {
        const output = data.toString();
        this.allureOpenOutput += `[ERROR] ${output}`;
        await logMessage(`allure open error: ${output}`);
      });

      this.allureOpenProcess.on('close', async (code) => {
        await logMessage(`allure open process exited with code: ${code}`);
        this.allureOpenProcess = null;
        this.allureOpenOutput = '';
      });

      this.allureOpenProcess.on('error', async (error) => {
        await logMessage(`allure open process error: ${error.message}`);
        this.allureOpenProcess = null;
      });

      await logMessage('allure open process started successfully');
      
      return { success: true, message: '正在打开Allure报告...' };
    } catch (error) {
      console.error('打开Allure报告失败:', error);
      return { success: false, error: error.message };
    }
  }

  async openReportByPath(reportPath) {
    try {
      const serverStatus = await this.getAllureServerStatus();
      if (serverStatus.running || serverStatus.allureOpenRunning) {
        const serverInfo = this.allureServerPort ? `当前服务地址: http://127.0.0.1:${this.allureServerPort}` : '';
        return { 
          success: false, 
          error: `已有Allure服务器在运行，请先关闭现有服务器再尝试打开新报告。${serverInfo ? ' ' + serverInfo : ''}`
        };
      }

      if (!reportPath || !(await asyncFs.exists(reportPath))) {
        return { success: false, error: '报告路径不存在' };
      }

      return await this.openAllureReportDirectlyByPath(reportPath);
    } catch (error) {
      console.error('打开报告失败:', error);
      return { success: false, error: error.message };
    }
  }

  async openAllureReportDirectlyByPath(reportPath) {
    try {
      const logsDir = path.join(this.projectRoot, 'logs', 'XKAT');
      await asyncFs.ensureDir(logsDir);

      const currentTime = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const logPath = path.join(logsDir, `XKAT-${currentTime}.log`);
      
      const logMessage = async (message) => {
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] [Electron] ${message}\n`;
        await asyncFs.appendFile(logPath, logEntry);
      };

      await logMessage(`开始打开报告: ${reportPath}`);
      
      const projectAllureBat = path.join(this.projectRoot, 'env', 'allure', 'bin', 'allure.bat');
      const projectAllure = path.join(this.projectRoot, 'env', 'allure', 'bin', 'allure');
      
      let command;
      
      if (await asyncFs.exists(projectAllureBat)) {
        command = `"${projectAllureBat}" open "${reportPath}"`;
        await logMessage('Using project allure.bat');
      } else if (await asyncFs.exists(projectAllure)) {
        command = `"${projectAllure}" open "${reportPath}"`;
        await logMessage('Using project allure');
      } else {
        command = `allure open "${reportPath}"`;
        await logMessage('Using system allure');
      }
      
      await logMessage(`Command: ${command}`);

      this.allureOpenProcess = spawn(command, {
        cwd: this.projectRoot,
        stdio: 'pipe',
        detached: false,
        shell: true,
        windowsHide: true
      });

      const self = this;
      this.allureOpenProcess.stdout.on('data', async (data) => {
        const output = data.toString();
        await asyncFs.appendFile(logPath, `[${new Date().toISOString()}] STDOUT: ${output}`);
        
        const portMatch = output.match(/http:\/\/[0-9.]+:(\d+)/);
        if (portMatch) {
          self.allureServerPort = parseInt(portMatch[1]);
        }
      });

      this.allureOpenProcess.stderr.on('data', async (data) => {
        await asyncFs.appendFile(logPath, `[${new Date().toISOString()}] STDERR: ${data.toString()}`);
      });

      this.allureOpenProcess.on('close', async (code) => {
        await asyncFs.appendFile(logPath, `[${new Date().toISOString()}] 进程退出，代码: ${code}\n`);
        this.allureOpenProcess = null;
        this.allureServerPort = null;
      });

      this.allureOpenProcess.on('error', async (error) => {
        await asyncFs.appendFile(logPath, `[${new Date().toISOString()}] 进程错误: ${error.message}\n`);
        this.allureOpenProcess = null;
      });

      await new Promise(resolve => setTimeout(resolve, 2000));

      return { success: true, message: '正在打开Allure报告...' };
    } catch (error) {
      return { success: false, error: `打开报告失败: ${error.message}` };
    }
  }

  async stopAllureServer() {
    try {
      const logsDir = path.join(this.projectRoot, 'logs', 'XKAT');
      await asyncFs.ensureDir(logsDir);
      
      const currentTime = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const electronLogPath = path.join(logsDir, `XKAT-${currentTime}.log`);
      
      const logMessage = async (message) => {
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] [Electron] ${message}\n`;
        try {
          await asyncFs.appendFile(electronLogPath, logEntry);
        } catch (err) {
          console.error('写入Electron日志失败:', err);
        }
      };
      
      await logMessage('开始停止Allure服务器进程');
      
      let stoppedProcesses = [];
      
      if (this.allureOpenProcess && !this.allureOpenProcess.killed) {
        await logMessage('正在停止allure open进程...');
        this.allureOpenProcess.kill();
        this.allureOpenProcess = null;
        stoppedProcesses.push('allure open进程');
        await logMessage('allure open进程已停止');
      }
      
      if (this.allureServerPort) {
        await logMessage(`正在按端口 ${this.allureServerPort} 停止Allure服务器...`);
        
        const result = await this.killProcessByPort(this.allureServerPort, 'Allure服务器');
        if (result.success && result.killedProcesses) {
          stoppedProcesses = stoppedProcesses.concat(result.killedProcesses);
        }
        
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
        await logMessage(`停止服务器完成: ${message}`);
        return { success: true, message };
      } else {
        await logMessage('没有找到需要停止的进程');
        return { success: true, message: '没有正在运行的进程需要停止' };
      }
    } catch (error) {
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
      return { 
        running: false, 
        allureOpenRunning: this.allureOpenProcess !== null && !this.allureOpenProcess.killed,
        error: error.message 
      };
    }
  }

  async clearAllureReports() {
    try {
      const allureReportsDir = path.join(this.projectRoot, 'logs', 'Allure', 'allure-reports');
      
      if (!(await asyncFs.exists(allureReportsDir))) {
        return { success: true, message: 'Allure报告目录不存在' };
      }
      
      const items = await asyncFs.readdir(allureReportsDir);
      let deletedCount = 0;
      
      for (const item of items) {
        const itemPath = path.join(allureReportsDir, item);
        try {
          const stat = await asyncFs.stat(itemPath);
          if (stat.isDirectory()) {
            await asyncFs.rm(itemPath, { recursive: true, force: true });
          } else {
            await asyncFs.unlink(itemPath);
          }
          deletedCount++;
        } catch (e) {
          console.error(`删除 ${itemPath} 失败:`, e);
        }
      }
      
      return { success: true, message: `已清空 ${deletedCount} 个报告` };
    } catch (error) {
      console.error('清空Allure报告数据失败:', error);
      return { success: false, error: error.message };
    }
  }

  async checkReportExists(testPlanName) {
    try {
      const allureReportDir = path.join(this.projectRoot, 'logs', 'Allure', 'allure-reports', testPlanName);
      const indexHtmlPath = path.join(allureReportDir, 'index.html');
      
      const dirExists = await asyncFs.exists(allureReportDir);
      const fileExists = await asyncFs.exists(indexHtmlPath);
      const exists = dirExists && fileExists;
      
      return { exists: exists };
    } catch (error) {
      console.error('检查报告存在性失败:', error);
      return { exists: false };
    }
  }

  extractPortFromAllureOpenOutput(stdoutData) {
    try {
      const lines = stdoutData.split('\n');
      for (const line of lines) {
        const patterns = [
          /http:\/\/(?:localhost|127\.0\.0\.1):(\d+)/i,
          /Server started at.*:(\d+)/i,
          /Server is started at.*:(\d+)/i,
          /Listening on port (\d+)/i,
          /Port (\d+) is used/i
        ];
        
        for (const pattern of patterns) {
          const portMatch = line.match(pattern);
          if (portMatch && portMatch[1]) {
            return parseInt(portMatch[1]);
          }
        }
      }
      return null;
    } catch (error) {
      console.error('提取端口号失败:', error);
      return null;
    }
  }

  async killProcessByPort(port, processName = 'allure open进程') {
    const logsDir = path.join(this.projectRoot, 'logs', 'XKAT');
    await asyncFs.ensureDir(logsDir);
    
    const currentTime = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const logPath = path.join(logsDir, `XKAT-${currentTime}.log`);
    
    const logMessage = async (message) => {
      const timestamp = new Date().toISOString();
      const logEntry = `[${timestamp}] [Electron] ${message}\n`;
      await asyncFs.appendFile(logPath, logEntry);
    };

    await logMessage(`开始按端口停止${processName}: ${port}`);
    
    try {
      const findCommand = `netstat -ano | findstr :${port} | findstr LISTENING`;
      await logMessage(`执行命令查找端口进程: ${findCommand}`);
      
      const result = execSync(findCommand, { encoding: 'utf8' });
      await logMessage(`查找结果: ${result}`);
      
      if (result.trim()) {
        const lines = result.trim().split('\n');
        let killedProcesses = [];
        
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 5) {
            const pid = parts[parts.length - 1];
            await logMessage(`找到进程PID: ${pid}`);
            
            const killCommand = `taskkill /PID ${pid} /F`;
            await logMessage(`执行杀死进程命令: ${killCommand}`);
            
            try {
              execSync(killCommand);
              await logMessage(`成功杀死进程PID: ${pid}`);
              killedProcesses.push(`端口${port}的进程(PID:${pid})`);
            } catch (killError) {
              await logMessage(`杀死进程失败: ${killError.message}`);
            }
          }
        }
        
        if (killedProcesses.length > 0) {
          const message = `已停止: ${killedProcesses.join(', ')}`;
          await logMessage(`停止${processName}完成: ${message}`);
          return { success: true, killedProcesses };
        } else {
          await logMessage(`未找到监听端口 ${port} 的进程`);
          return { success: false, error: this.i18nService.t('main.processNotFound') };
        }
      } else {
        await logMessage(`未找到监听端口 ${port} 的进程`);
        return { success: false, error: this.i18nService.t('main.processNotFound') };
      }
    } catch (error) {
      const errorMessage = this.i18nService.t('main.stopProcessFailed', { processName, error: error.message });
      await logMessage(errorMessage);
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
        continue;
      }
    }
    
    throw new Error(`在端口 ${startPort}-${startPort + 99} 范围内找不到可用端口`);
  }
}

module.exports = AllureService;

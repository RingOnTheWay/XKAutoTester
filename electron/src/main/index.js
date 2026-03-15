const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const axios = require('axios');
const crypto = require('crypto');

// 初始化i18next
const i18next = require('i18next');

class I18nService {
  constructor() {
    this.i18n = i18next.createInstance();
    this.initI18n();
  }

  async initI18n() {
    try {
      // 构建语言文件路径 - locales 在 electron/ 目录下
      const localesPath = path.join(__dirname, '..', '..', 'locales');
      
      // 加载语言文件
      const resources = {};
      
      // 加载中文翻译
      const zhCNPath = path.join(localesPath, 'zh-CN', 'translation.json');
      if (fs.existsSync(zhCNPath)) {
        const zhCNData = JSON.parse(fs.readFileSync(zhCNPath, 'utf8'));
        resources['zh-CN'] = {
          translation: zhCNData
        };
      }
      
      // 加载英文翻译
      const enUSPath = path.join(localesPath, 'en-US', 'translation.json');
      if (fs.existsSync(enUSPath)) {
        const enUSData = JSON.parse(fs.readFileSync(enUSPath, 'utf8'));
        resources['en-US'] = {
          translation: enUSData
        };
      }
      
      // 获取用户配置的语言 - config 在项目根目录下
      let savedLanguage = 'zh-CN';
      try {
        const configPath = path.join(__dirname, '..', '..', '..', 'config', 'config.json');
        if (fs.existsSync(configPath)) {
          const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
          if (configData.APP_SETTINGS && configData.APP_SETTINGS.language) {
            savedLanguage = configData.APP_SETTINGS.language;
          }
        }
      } catch (error) {
        console.error('读取配置文件失败:', error);
      }
      
      // 初始化i18next
      await this.i18n.init({
        lng: savedLanguage,
        fallbackLng: 'zh-CN',
        resources: resources,
        interpolation: {
          escapeValue: false
        }
      });
    } catch (error) {
      console.error('i18next初始化失败:', error);
    }
  }

  t(key, options) {
    return this.i18n.t(key, options);
  }

  changeLanguage(lng) {
    return this.i18n.changeLanguage(lng);
  }
}

const i18nService = new I18nService();

class ScheduledPlanQueue {
  constructor() {
    this.heap = [];
  }

  enqueue(plan) {
    this.heap.push(plan);
    this.bubbleUp(this.heap.length - 1);
  }

  dequeue() {
    if (this.heap.length === 0) return null;
    const min = this.heap[0];
    const last = this.heap.pop();
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.bubbleDown(0);
    }
    return min;
  }

  peek() {
    return this.heap.length > 0 ? this.heap[0] : null;
  }

  remove(planId) {
    const index = this.heap.findIndex(p => p.id === planId);
    if (index !== -1) {
      this.heap.splice(index, 1);
      this.rebuild();
      return true;
    }
    return false;
  }

  rebuild() {
    const plans = [...this.heap];
    this.heap = [];
    plans.forEach(p => this.enqueue(p));
  }

  size() {
    return this.heap.length;
  }

  getAll() {
    return [...this.heap];
  }

  bubbleUp(index) {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.compare(this.heap[index], this.heap[parentIndex]) < 0) {
        [this.heap[index], this.heap[parentIndex]] = [this.heap[parentIndex], this.heap[index]];
        index = parentIndex;
      } else {
        break;
      }
    }
  }

  bubbleDown(index) {
    const length = this.heap.length;
    while (true) {
      let smallest = index;
      const left = 2 * index + 1;
      const right = 2 * index + 2;

      if (left < length && this.compare(this.heap[left], this.heap[smallest]) < 0) {
        smallest = left;
      }
      if (right < length && this.compare(this.heap[right], this.heap[smallest]) < 0) {
        smallest = right;
      }

      if (smallest !== index) {
        [this.heap[index], this.heap[smallest]] = [this.heap[smallest], this.heap[index]];
        index = smallest;
      } else {
        break;
      }
    }
  }

  compare(a, b) {
    return new Date(a.scheduledTime) - new Date(b.scheduledTime);
  }
}

const SCHEDULE_STRATEGY = {
  PRECISE: { threshold: 60 * 60 * 1000 },
  MEDIUM: { threshold: 24 * 60 * 60 * 1000 },
  LONG_TERM: { threshold: Infinity }
};

class SmartScheduler {
  constructor(electronApp) {
    this.electronApp = electronApp;
    this.planQueue = new ScheduledPlanQueue();
    this.currentTimer = null;
    this.checkInterval = null;
    this.isExecuting = false;
    this.fileWatcher = null;
    this.mainWindow = null;
    this.state = {
      mode: 'idle',
      nextCheckTime: null,
      activePlanCount: 0
    };
  }

  setMainWindow(window) {
    this.mainWindow = window;
  }

  async initialize() {
    await this.loadPlansToQueue();
    this.setupFileWatcher();
    await this.startSmartScheduling();
  }

  async loadPlansToQueue() {
    try {
      const plans = await this.electronApp.getScheduledPlans();
      const now = new Date();

      plans.forEach(plan => {
        if (plan.status === 'pending') {
          const planTime = new Date(plan.scheduledTime);
          if (planTime > now) {
            this.planQueue.enqueue(plan);
          } else {
            this.markAsExpired(plan);
          }
        }
      });

      this.state.activePlanCount = this.planQueue.size();
    } catch (error) {
      console.error('加载计划到队列失败:', error);
    }
  }

  async startSmartScheduling() {
    const nextPlan = this.planQueue.peek();

    if (!nextPlan) {
      this.enterIdleMode();
      return;
    }

    const now = Date.now();
    const planTime = new Date(nextPlan.scheduledTime).getTime();
    const timeUntilPlan = planTime - now;

    if (timeUntilPlan <= 0) {
      await this.markAsExpired(nextPlan);
      this.planQueue.dequeue();
      await this.startSmartScheduling();
      return;
    }

    if (timeUntilPlan <= SCHEDULE_STRATEGY.PRECISE.threshold) {
      this.enterPreciseMode(nextPlan, timeUntilPlan);
    } else if (timeUntilPlan <= SCHEDULE_STRATEGY.MEDIUM.threshold) {
      this.enterMediumMode(nextPlan, timeUntilPlan);
    } else {
      this.enterLongTermMode(nextPlan, timeUntilPlan);
    }
  }

  enterIdleMode() {
    this.state.mode = 'idle';
    this.clearAllTimers();

    this.checkInterval = setInterval(() => {
      if (this.planQueue.size() > 0) {
        clearInterval(this.checkInterval);
        this.checkInterval = null;
        this.startSmartScheduling();
      }
    }, 30 * 60 * 1000);
  }

  enterPreciseMode(plan, delay) {
    this.state.mode = 'precise';
    this.clearAllTimers();

    const SAFETY_THRESHOLD = 100;
    const adjustedDelay = Math.max(0, delay - SAFETY_THRESHOLD);

    this.currentTimer = setTimeout(() => {
      this.finalCountdown(plan);
    }, adjustedDelay);

    this.state.nextCheckTime = Date.now() + adjustedDelay;
  }

  enterMediumMode(plan, timeUntilPlan) {
    this.state.mode = 'medium';
    this.clearAllTimers();

    const checkInterval = this.calculateMediumCheckInterval(timeUntilPlan);

    this.checkInterval = setInterval(() => {
      const remaining = new Date(plan.scheduledTime) - Date.now();

      if (remaining <= SCHEDULE_STRATEGY.PRECISE.threshold) {
        clearInterval(this.checkInterval);
        this.checkInterval = null;
        this.enterPreciseMode(plan, remaining);
      }
    }, checkInterval);

    this.state.nextCheckTime = Date.now() + checkInterval;
  }

  enterLongTermMode(plan, timeUntilPlan) {
    this.state.mode = 'long_term';
    this.clearAllTimers();

    const firstCheckDelay = timeUntilPlan - SCHEDULE_STRATEGY.MEDIUM.threshold;

    this.currentTimer = setTimeout(() => {
      const remaining = new Date(plan.scheduledTime) - Date.now();
      this.enterMediumMode(plan, remaining);
    }, firstCheckDelay);

    this.checkInterval = setInterval(() => {
      this.refreshSchedule();
    }, 24 * 60 * 60 * 1000);

    this.state.nextCheckTime = Date.now() + firstCheckDelay;
  }

  calculateMediumCheckInterval(timeUntilPlan) {
    if (timeUntilPlan < 2 * 60 * 60 * 1000) {
      return 10 * 60 * 1000;
    } else if (timeUntilPlan < 6 * 60 * 60 * 1000) {
      return 30 * 60 * 1000;
    } else {
      return 60 * 60 * 1000;
    }
  }

  finalCountdown(plan) {
    const now = Date.now();
    const planTime = new Date(plan.scheduledTime).getTime();
    const remaining = planTime - now;

    if (remaining <= 0) {
      this.executePlan(plan);
    } else if (remaining <= 100) {
      setImmediate(() => this.finalCountdown(plan));
    } else {
      this.currentTimer = setTimeout(() => {
        this.finalCountdown(plan);
      }, remaining);
    }
  }

  async executePlan(plan) {
    if (this.isExecuting) return;

    this.isExecuting = true;

    try {
      this.planQueue.dequeue();
      this.state.activePlanCount = this.planQueue.size();

      await this.electronApp.updateScheduledPlan({
        id: plan.id,
        status: 'running',
        lastRun: new Date().toISOString()
      });

      if (this.mainWindow) {
        this.mainWindow.webContents.send('scheduled-test-start', {
          planId: plan.id,
          planName: plan.name,
          testPlans: plan.testPlans,
          scheduledTime: plan.scheduledTime,
          executionTime: new Date().toLocaleString()
        });
      }
    } catch (error) {
      console.error('执行定时计划失败:', error);
      await this.electronApp.updateScheduledPlan({
        id: plan.id,
        status: 'completed',
        lastRun: new Date().toISOString()
      });
    } finally {
      this.isExecuting = false;
      await this.startSmartScheduling();
    }
  }

  setupFileWatcher() {
    try {
      const plansPath = this.electronApp.scheduledPlansPath;
      if (fs.existsSync(plansPath)) {
        this.fileWatcher = fs.watch(plansPath, (eventType) => {
          if (eventType === 'change') {
            this.handlePlansFileChange();
          }
        });
      }
    } catch (error) {
      console.error('设置文件监听失败:', error);
    }
  }

  async handlePlansFileChange() {
    this.planQueue = new ScheduledPlanQueue();
    await this.loadPlansToQueue();
    await this.refreshSchedule();
  }

  async refreshSchedule() {
    this.clearAllTimers();
    await this.startSmartScheduling();
  }

  addPlan(plan) {
    this.planQueue.enqueue(plan);
    this.state.activePlanCount = this.planQueue.size();

    const nextPlan = this.planQueue.peek();
    if (nextPlan && nextPlan.id === plan.id) {
      this.refreshSchedule();
    }
  }

  removePlan(planId) {
    const nextPlan = this.planQueue.peek();
    this.planQueue.remove(planId);
    this.state.activePlanCount = this.planQueue.size();

    if (nextPlan && nextPlan.id === planId) {
      this.refreshSchedule();
    }
  }

  updatePlan(planId, updates) {
    this.removePlan(planId);

    if (updates.status === 'pending') {
      const plans = this.electronApp.getScheduledPlansSync ? 
                    this.electronApp.getScheduledPlansSync() : [];
      const originalPlan = plans.find(p => p.id === planId);
      if (originalPlan) {
        const updatedPlan = { ...originalPlan, ...updates };
        this.addPlan(updatedPlan);
      }
    }
  }

  async markAsExpired(plan) {
    await this.electronApp.updateScheduledPlan({
      id: plan.id,
      status: 'expired'
    });

    if (this.mainWindow) {
      this.mainWindow.webContents.send('scheduled-plan-expired', {
        planId: plan.id,
        planName: plan.name
      });
    }
  }

  clearAllTimers() {
    if (this.currentTimer) {
      clearTimeout(this.currentTimer);
      this.currentTimer = null;
    }
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  destroy() {
    this.clearAllTimers();
    if (this.fileWatcher) {
      this.fileWatcher.close();
      this.fileWatcher = null;
    }
  }

  getStatus() {
    return {
      ...this.state,
      nextPlan: this.planQueue.peek(),
      queueSize: this.planQueue.size()
    };
  }
}

class ElectronApp {
  constructor() {
    this.mainWindow = null;
    this.splashWindow = null;
    this.isDev = process.argv.includes('--dev');
    this.isPackaged = require('electron').app.isPackaged || false;
    
    // 根据打包状态设置项目根目录
    if (this.isPackaged) {
      // 打包后，extraResources 复制到 resources/ 目录
      // .venv, src, config 等都在 resources/ 下
      this.projectRoot = process.resourcesPath;
    } else {
      // 开发环境，__dirname 是 electron/src/main/，需要向上3级到项目根目录
      this.projectRoot = path.join(__dirname, '..', '..', '..');
    }
    
    this.allureServerProcess = null;
    this.allureServerPort = null;
    this.allureServerTestPlan = null;
    this.allureServerStartTime = null;
    this.allureOpenProcess = null;  // 新增：存储allure open进程
    this.currentPythonProcess = null; // 存储当前运行的Python进程
    
    // 配置文件统一放在 config 目录
    this.scheduledPlansPath = path.join(this.projectRoot, 'config', 'scheduled_plans.json');
    this.smartScheduler = null;
  }
  
  // 获取Python执行路径（必须使用UV虚拟环境）
  getPythonCommand() {
    const venvPython = path.resolve(this.projectRoot, '.venv', 'Scripts', 'python.exe');
    if (fs.existsSync(venvPython)) {
      return { command: venvPython, args: [], useVenv: true };
    }
    return { command: null, args: [], useVenv: false, error: i18nService.t('splash.checks.uvVenvNotFound') };
  }
  
  // 获取pip命令（使用UV）
  getPipCommand() {
    // UV虚拟环境使用 uv pip 命令
    return { command: 'uv', args: ['pip'] };
  }
  
  // 检查UV是否可用
  async checkUvAvailable() {
    try {
      const result = await this.executeCommand('uv', ['--version']);
      return result.code === 0;
    } catch {
      return false;
    }
  }
  
  createSplashWindow() {
    // 创建启动页面窗口
    this.splashWindow = new BrowserWindow({
      width: 700,
      height: 740,
      frame: false,
      resizable: false,
      center: true,
      transparent: true,
      backgroundColor: "#00000000",
      hasShadow: true,
      roundedCorners: true,
      titleBarStyle: 'hidden',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
        preload: this.isPackaged 
          ? path.join(process.resourcesPath, 'app', 'src', 'preload', 'index.js') 
          : path.join(__dirname, '..', 'preload', 'index.js'),
        webSecurity: false // 允许加载本地文件
      }
    });
    
    // 加载启动页面 - splash.html 在 electron/ 目录下
    const splashPath = this.isPackaged 
      ? path.join(process.resourcesPath, 'app', 'splash.html') 
      : path.join(__dirname, '..', '..', 'splash.html');
    this.splashWindow.loadFile(splashPath);
    
    this.splashWindow.once('ready-to-show', () => {
      // 强制窗口重绘，解决透明效果不显示的问题
      if (this.splashWindow) {
        // 打开开发者工具
        // this.splashWindow.webContents.openDevTools({ mode: 'detach' });
        // 使用更平滑的方式强制重绘，避免窗口闪烁
        this.splashWindow.focus();
        // 确保窗口在最前面
        this.splashWindow.setAlwaysOnTop(true);
        // 短暂延迟后取消最前面，避免干扰用户操作
        setTimeout(() => {
          if (this.splashWindow) {
            this.splashWindow.setAlwaysOnTop(false);
          }
        }, 100);
      }
    });
    
    this.splashWindow.on('closed', () => {
      this.splashWindow = null;
    });
  }
  
  // 执行命令并返回结果
  async executeCommand(command, args = [], options = {}) {
    return new Promise((resolve, reject) => {
      const process = spawn(command, args, {
        ...options,
        windowsHide: true
      });
      
      let stdout = '';
      let stderr = '';
      
      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      process.on('close', (code) => {
        resolve({
          code,
          stdout: stdout.trim(),
          stderr: stderr.trim()
        });
      });
      
      process.on('error', (error) => {
        reject(error);
      });
    });
  }
  
  // 检查CP210x串口驱动
  async checkCP210xDriver() {
    try {
      // 使用PowerShell命令检查CP210x驱动
      const result = await this.executeCommand('powershell.exe', [
        '-Command',
        'Get-PnpDevice | Where-Object {$_.FriendlyName -like "*CP210*"} | Select-Object Status, Class, FriendlyName, InstanceId | Format-List'
      ]);
      
      if (result.code === 0 && result.stdout.includes('CP210')) {
        return {
          status: 'success',
          message: i18nService.t('splash.checks.cp210Found')
        };
      } else {
        return {
          status: 'error',
          message: i18nService.t('splash.checks.cp210NotFound')
        };
      }
    } catch (error) {
      return {
        status: 'error',
        message: `检查CP210x驱动失败: ${error.message}`
      };
    }
  }
  
  // 检查Android SDK
  async checkAndroidSDK() {
    try {
      // 检查ANDROID_HOME环境变量
      const androidHome = process.env.ANDROID_HOME;
      if (!androidHome) {
        return {
          status: 'error',
          message: 'ANDROID_HOME环境变量未设置'
        };
      }
      
      // 检查Android SDK组件
      const requiredComponents = [
        'tools/android.bat',
        'platform-tools/adb.exe',
        'build-tools',
        'extras/google/usb_driver',
        'extras/google/webdriver'
      ];
      
      let missingComponents = [];
      for (const component of requiredComponents) {
        const componentPath = path.join(androidHome, component);
        if (!fs.existsSync(componentPath)) {
          missingComponents.push(component);
        }
      }
      
      if (missingComponents.length === 0) {
        return {
          status: 'success',
          message: i18nService.t('splash.checks.androidSdkComplete')
        };
      } else {
        return {
          status: 'error',
          message: i18nService.t('splash.checks.missingAndroidSdkComponents', { components: missingComponents.join(', ') })
        };
      }
    } catch (error) {
      return {
        status: 'error',
        message: i18nService.t('splash.checks.checkAndroidSdkFailed', { error: error.message })
      };
    }
  }
  
  // 检查Java版本
  async checkJavaVersion() {
    try {
      const result = await this.executeCommand('java', ['-version']);
      
      // java -version输出到stderr
      const output = result.stderr;
      const versionMatch = output.match(/version "(\d+\.\d+\.\d+)/);
      
      if (versionMatch) {
        const version = versionMatch[1];
        // 检查是否为17.0.15
        if (version === '17.0.15') {
          return {
            status: 'success',
            message: i18nService.t('splash.checks.javaVersion', { version: version })
          };
        } else {
          return {
            status: 'warning',
            message: i18nService.t('splash.checks.javaVersionRecommended', { version: version, recommended: '17.0.15' })
          };
        }
      } else {
        return {
          status: 'error',
          message: i18nService.t('splash.checks.cannotGetJavaVersion')
        };
      }
    } catch (error) {
      return {
        status: 'error',
        message: i18nService.t('splash.checks.checkJavaVersionFailed', { error: error.message })
      };
    }
  }
  
  // 检查Python版本和依赖
  async checkPythonEnvironment() {
    try {
      // 检查UV虚拟环境是否存在
      const pythonCmd = this.getPythonCommand();
      
      if (!pythonCmd.command) {
        return {
          status: 'error',
          message: pythonCmd.error || 'UV虚拟环境不存在，请运行 "uv sync" 创建虚拟环境'
        };
      }
      
      // 使用虚拟环境Python检查版本
      const result = await this.executeCommand(pythonCmd.command, ['--version']);
      
      if (result.code !== 0) {
        return {
          status: 'error',
          message: i18nService.t('splash.checks.pythonNotFound')
        };
      }
      
      const versionMatch = result.stdout.match(/Python (\d+\.\d+\.\d+)/);
      if (!versionMatch) {
        return {
          status: 'error',
          message: i18nService.t('splash.checks.cannotGetPythonVersion')
        };
      }
      
      const version = versionMatch[1];
      let versionStatus = 'success';
      let versionMessage;
      
      // 检查是否为3.12.4，使用UV虚拟环境的国际化文本
      if (version !== '3.12.4') {
        versionStatus = 'warning';
        versionMessage = i18nService.t('splash.checks.pythonVersionRecommendedUv', { version: version, recommended: '3.12.4' });
      } else {
        versionMessage = i18nService.t('splash.checks.pythonVersionUv', { version: version });
      }
      
      // 检查依赖包
      const requirementsPath = path.join(this.projectRoot, 'requirements.txt');
      if (fs.existsSync(requirementsPath)) {
        const pipCmd = this.getPipCommand();
        const pipResult = await this.executeCommand(pipCmd.command, [...pipCmd.args, 'list', '--format=freeze']);
        const installedPackages = new Set(pipResult.stdout.split('\n').map(pkg => pkg.toLowerCase()));
        
        const requirements = fs.readFileSync(requirementsPath, 'utf8')
          .split('\n')
          .map(line => line.trim())
          .filter(line => line && !line.startsWith('#'));
        
        let missingPackages = [];
        for (const req of requirements) {
          // 处理带有版本约束的依赖
          const pkgName = req.split(/[<>=~]/)[0].toLowerCase();
          let found = false;
          for (const installedPkg of installedPackages) {
            if (installedPkg.startsWith(`${pkgName}==`) || installedPkg.startsWith(`${pkgName}>=`)) {
              found = true;
              break;
            }
          }
          if (!found) {
            missingPackages.push(req);
          }
        }
        
        if (missingPackages.length > 0) {
          return {
            status: 'warning',
            message: i18nService.t('splash.checks.missingPackages', { versionMessage: versionMessage, packages: missingPackages.join(', ') })
          };
        }
      }
      
      return {
        status: versionStatus,
        message: versionMessage
      };
    } catch (error) {
      return {
        status: 'error',
        message: i18nService.t('splash.checks.checkPythonEnvironmentFailed', { error: error.message })
      };
    }
  }
  
  // 检查Node.js版本
  async checkNodeVersion() {
    try {
      const result = await this.executeCommand('node', ['--version']);
      if (result.code !== 0) {
        return {
          status: 'error',
          message: i18nService.t('splash.checks.nodejsNotFound')
        };
      }
      
      const version = result.stdout.replace('v', '');
      if (version === '22.19.0') {
        return {
          status: 'success',
          message: i18nService.t('splash.checks.nodejsVersion', { version: version })
        };
      } else {
        return {
          status: 'warning',
          message: i18nService.t('splash.checks.nodejsVersionRecommended', { version: version, recommended: '22.19.0' })
        };
      }
    } catch (error) {
      return {
        status: 'error',
        message: i18nService.t('splash.checks.checkNodejsVersionFailed', { error: error.message })
      };
    }
  }
  
  // 执行所有环境检查
  async runEnvironmentChecks() {
    const checks = [
      {
        name: i18nService.t('splash.checks.cp210DriverCheck'),
        check: () => this.checkCP210xDriver(),
        isRequired: true
      },
      {
        name: 'Android SDK',
        check: () => this.checkAndroidSDK(),
        isRequired: true
      },
      {
        name: i18nService.t('splash.checks.javaVersionCheck'),
        check: () => this.checkJavaVersion(),
        isRequired: false
      },
      {
        name: i18nService.t('splash.checks.pythonEnvironment'),
        check: () => this.checkPythonEnvironment(),
        isRequired: true
      },
      {
        name: i18nService.t('splash.checks.nodejsVersionCheck'),
        check: () => this.checkNodeVersion(),
        isRequired: false
      }
    ];
    
    const results = {
      required: [],
      warnings: []
    };
    
    for (let i = 0; i < checks.length; i++) {
      const check = checks[i];
      const progress = Math.round(((i + 1) / checks.length) * 100);
      
      // 更新进度
      if (this.splashWindow) {
        this.splashWindow.webContents.send('check-progress', {
          percentage: progress,
          message: i18nService.t('splash.checks.checking', { name: check.name })
        });
      }
      
      try {
        const result = await check.check();
        
        // 发送检查结果
        if (this.splashWindow) {
          this.splashWindow.webContents.send('check-result', {
            name: check.name,
            status: result.status,
            message: result.message,
            isRequired: check.isRequired
          });
        }
        
        // 收集结果
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
        // 发送检查结果
        if (this.splashWindow) {
          this.splashWindow.webContents.send('check-result', {
            name: check.name,
            status: 'error',
            message: i18nService.t('splash.checks.checkFailed', { error: error.message }),
            isRequired: check.isRequired
          });
        }
        
        // 收集结果
        if (check.isRequired) {
          results.required.push(`${check.name}: ${i18nService.t('splash.checks.checkFailedShort')}`);
        } else {
          results.warnings.push(`${check.name}: ${i18nService.t('splash.checks.checkFailedShort')}`);
        }
      }
      
      // 短暂延迟，让UI有时间更新
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    return results;
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
        sandbox: false,
        preload: this.isPackaged 
          ? path.join(process.resourcesPath, 'app', 'src', 'preload', 'index.js') 
          : path.join(__dirname, '..', 'preload', 'index.js'),
        webSecurity: false // 允许加载本地文件
      },
      frame: false, // 隐藏原生标题栏
      transparent: true, // 透明窗口以实现圆角
      backgroundColor: '#00000000', // 完全透明背景
      hasShadow: true,
      roundedCorners: true,
      icon: this.isPackaged 
        ? path.join(process.resourcesPath, 'app', 'assets', 'icon.png') 
        : path.join(__dirname, '..', '..', 'assets', 'icon.png'),
      x: 100, // 设置窗口位置
      y: 100,
      autoHideMenuBar: true, // 自动隐藏菜单栏
      thickFrame: false // 禁用粗边框
    });
    
    // 完全禁用菜单栏
    this.mainWindow.setMenu(null);

    // 加载应用的index.html - renderer 在 electron/ 目录下
    const htmlPath = this.isPackaged 
      ? path.join(process.resourcesPath, 'app', 'renderer', 'index.html') 
      : path.join(__dirname, '..', '..', 'renderer', 'index.html');
    this.mainWindow.loadFile(htmlPath);

    // 窗口准备好后执行
    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow.focus();
      this.mainWindow.center(); // 居中显示窗口
      // this.mainWindow.webContents.openDevTools(); // 打开开发者工具
    });

    // 处理窗口关闭
    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });

    // 设置 SmartScheduler 的 mainWindow 引用
    if (this.smartScheduler) {
      this.smartScheduler.setMainWindow(this.mainWindow);
    }

    // 监听窗口最大化事件
    this.mainWindow.on('maximize', () => {
      this.mainWindow.webContents.send('window-maximized', true);
    });

    // 监听窗口还原事件
    this.mainWindow.on('unmaximize', () => {
      this.mainWindow.webContents.send('window-maximized', false);
    });

    // 阻止新窗口打开
    this.mainWindow.webContents.setWindowOpenHandler(() => {
      return { action: 'deny' };
    });
  }

  setupIPC() {
    // 处理启动页面的检查请求
    ipcMain.on('start-checks', async (event) => {
      try {
        const results = await this.runEnvironmentChecks();
        
        // 发送检查完成事件
        if (this.splashWindow) {
          this.splashWindow.webContents.send('check-complete', {
            requiredErrors: results.required,
            warnings: results.warnings
          });
        }
      } catch (error) {
        console.error('环境检查失败:', error);
        if (this.splashWindow) {
          this.splashWindow.webContents.send('check-complete', {
            requiredErrors: [i18nService.t('splash.checks.environmentCheckFailed', { error: error.message })],
            warnings: []
          });
        }
      }
    });
    
    // 处理启动页面准备就绪事件
    ipcMain.on('splash-ready', () => {
      // 关闭启动页面，创建主窗口
      if (this.splashWindow) {
        this.splashWindow.close();
      }
      
      this.createWindow();
    });
    
    // 窗口控制
    ipcMain.handle('window-minimize', () => {
      if (this.mainWindow) {
        this.mainWindow.minimize();
      }
    });
    
    ipcMain.handle('window-maximize', () => {
      if (this.mainWindow) {
        if (this.mainWindow.isMaximized()) {
          this.mainWindow.unmaximize();
        } else {
          this.mainWindow.maximize();
        }
        return this.mainWindow.isMaximized();
      }
      return false;
    });
    
    ipcMain.handle('window-close', () => {
      if (this.mainWindow) {
        this.mainWindow.close();
      }
    });
    
    ipcMain.handle('window-is-maximized', () => {
      if (this.mainWindow) {
        return this.mainWindow.isMaximized();
      }
      return false;
    });
    
    // 处理启动页获取配置
    ipcMain.on('get-config', (event) => {
      try {
        const config = this.config;
        event.sender.send('config-data', config);
      } catch (error) {
        console.error('获取配置失败:', error);
        event.sender.send('config-data', {});
      }
    });
    
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
        version: 'v0.1.2-dev.1',
        name: 'XKAutoTester'
      };
    });

    // 获取连接的设备列表
    ipcMain.handle('getConnectedDevices', async () => {
      try {
        // 执行adb命令获取设备列表
        const { execSync } = require('child_process');
        const result = execSync('adb devices', { encoding: 'utf8' });
        
        // 解析设备列表
        const devices = [];
        const lines = result.split('\n');
        
        for (const line of lines) {
          // 匹配设备行，格式如："设备ID    device"
          const match = line.match(/^([^\s]+)\s+device/);
          if (match) {
            devices.push(match[1]);
          }
        }
        
        return devices;
      } catch (error) {
        return [];
      }
    });

    // 获取pytest标记定义
    ipcMain.handle('get-pytest-markers', async () => {
      return this.getPytestMarkers();
    });
    
    // 执行ADB命令
    ipcMain.handle('executeAdbCommand', async (event, cmd, deviceId) => {
      try {
        // 解析命令和参数
        const cmdParts = cmd.split(/\s+/).filter(part => part.trim() !== '');
        
        // 构建spawn的参数数组
        const args = [];
        if (deviceId) {
          args.push('-s', deviceId);
        }
        
        // 对于某些ADB命令，不需要添加shell关键字
        // 这些命令是ADB本身的命令，而不是需要在设备上执行的命令
        const noShellCommands = ['connect', 'disconnect', 'devices', 'kill-server', 'start-server', 'version', 'tcpip'];
        const firstCmd = cmdParts[0];
        
        if (!noShellCommands.includes(firstCmd)) {
          args.push('shell'); // 只有需要在设备上执行的命令才添加shell关键字
        }
        
        args.push(...cmdParts);
        
        // 使用spawn执行命令
        const { spawn } = require('child_process');
        const adbProcess = spawn('adb', args, { 
          windowsHide: true
        });
        
        let stdout = '';
        let stderr = '';
        let resolved = false;
        
        return new Promise((resolve) => {
          const doResolve = (result) => {
            if (resolved) return;
            resolved = true;
            resolve(result);
          };
          
          adbProcess.stdout.on('data', (data) => {
            stdout += data.toString();
            
            // 对于tcpip命令，检测成功输出后立即返回
            if (firstCmd === 'tcpip' && stdout.includes('restarting in TCP mode port:')) {
              adbProcess.kill();
              doResolve({ success: true, output: stdout, error: stderr });
            }
          });
          
          adbProcess.stderr.on('data', (data) => {
            stderr += data.toString();
          });
          
          adbProcess.on('close', (code) => {
            // 特殊处理adb connect命令，因为即使连接失败，退出码也可能是0
            if (firstCmd === 'connect') {
              // 检查输出内容来判断连接是否成功
              if (stdout.includes('connected to') || stdout.includes('already connected')) {
                doResolve({ success: true, output: stdout, error: stderr });
              } else {
                // 连接失败，使用stderr作为错误信息，不添加额外前缀
                doResolve({ success: false, error: stderr || stdout, output: stdout });
              }
            } else if (firstCmd === 'tcpip') {
              // tcpip命令：如果已经检测到成功输出则已返回，否则检查是否有错误
              if (stdout.includes('restarting in TCP mode port:')) {
                doResolve({ success: true, output: stdout, error: stderr });
              } else if (stderr.includes('error:') || code !== 0) {
                doResolve({ success: false, error: stderr || 'Failed to restart in TCP mode', output: stdout });
              } else {
                doResolve({ success: true, output: stdout, error: stderr });
              }
            } else {
              // 其他命令使用退出码判断
              if (code !== 0) {
                doResolve({ success: false, error: stderr || i18nService.t('main.commandFailed', { code }), output: stdout });
              } else {
                doResolve({ success: true, output: stdout, error: stderr });
              }
            }
          });
          
          adbProcess.on('error', (error) => {
            doResolve({ success: false, error: error.message, output: '' });
          });
          
          // 设置超时
          setTimeout(() => {
            if (resolved) return;
            adbProcess.kill();
            // 对于tcpip命令，超时时检查是否已有成功输出
            if (firstCmd === 'tcpip' && stdout.includes('restarting in TCP mode port:')) {
              doResolve({ success: true, output: stdout, error: stderr });
            } else {
              doResolve({ success: false, error: i18nService.t('main.commandTimeout'), output: stdout });
            }
          }, 5000);
        });
      } catch (error) {
        return { success: false, error: error.message };
      }
    });
    
    // 上传文件到设备
    ipcMain.handle('uploadFile', async (event, localPath, remotePath, deviceId) => {
      try {
        // 构建ADB push命令
        const adbCmd = deviceId ? `adb -s ${deviceId} push "${localPath}" "${remotePath}"` : `adb push "${localPath}" "${remotePath}"`;
        
        // 使用exec执行命令
        const { exec } = require('child_process');
        
        return new Promise((resolve) => {
          exec(adbCmd, { windowsHide: true }, (error, stdout, stderr) => {
            if (error) {
              resolve({ success: false, error: stderr || error.message });
            } else {
              resolve({ success: true, output: stdout });
            }
          });
        });
      } catch (error) {
        return { success: false, error: error.message };
      }
    });
    
    // 从设备下载文件
    ipcMain.handle('downloadFile', async (event, remotePath, localPath, deviceId) => {
      try {
        const fs = require('fs');
        const path = require('path');
        const { spawn } = require('child_process');
        
        // 检查远程路径是文件还是文件夹
        const { execSync } = require('child_process');
        let isDir = false;
        
        try {
          // 使用ls -la命令检查远程路径是否为文件夹
          const listCmd = deviceId 
            ? `adb -s ${deviceId} shell ls -la "${remotePath}"` 
            : `adb shell ls -la "${remotePath}"`;
          
          // 执行命令，如果成功，检查输出中是否包含文件夹特征
          // 捕获标准错误输出，避免在控制台显示错误信息
          const result = execSync(listCmd, { 
            encoding: 'utf-8', 
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'ignore'] // 忽略标准错误输出
          }).trim();
          
          // 如果输出包含总用量（total），则很可能是文件夹
          isDir = result.startsWith('total') || result.includes('drwx');
        } catch (error) {
          // 如果命令执行失败，默认认为不是文件夹
          isDir = false;
        }
        
        // 处理文件名中的特殊符号，用下划线替代
        const sanitizeFileName = (name) => {
          // 替换常见的特殊字符，包括冒号
          return name.replace(/[\\/:*?"<>|]/g, '_');
        };
        
        // 处理目标路径，确保所有特殊符号都被替换
        let finalLocalPath = localPath;
        let adbCmd;
        
        if (isDir) {
          // 对于文件夹，使用ADB下载到临时目录，然后创建zip文件
          const basePath = localPath.replace(/\\/g, '/').replace(/\/[^/]+$/, '');
          const dirName = path.basename(remotePath);
          const sanitizedDirName = sanitizeFileName(dirName);
          finalLocalPath = `${basePath}/${sanitizedDirName}.zip`;
          
          // 使用Node.js内置的fs和path模块，以及adm-zip库
          const fs = require('fs');
          const AdmZip = require('adm-zip');
          const os = require('os');
          
          // 创建临时目录
          const tempDir = path.join(os.tmpdir(), `adb_download_${Date.now()}`);
          try {
            fs.mkdirSync(tempDir, { recursive: true });
          } catch (error) {
            throw new Error(`Failed to create temporary directory: ${error.message}`);
          }
          
          // 构建ADB exec-out命令，使用tar打包下载目录内容
          const adbExecOutCmd = deviceId 
            ? `adb -s ${deviceId} exec-out "cd \"${remotePath}\" && tar -chf - ./"` 
            : `adb exec-out "cd \"${remotePath}\" && tar -chf - ./"`;
          
          // 创建临时tar文件路径
          const tempTarPath = path.join(tempDir, `${sanitizedDirName}.tar`);
          const tarWriteStream = fs.createWriteStream(tempTarPath);
          
          // 显示初始进度
          event.sender.send('download-progress', {
            percentage: 0,
            transferred: 0,
            totalSize: 1,
            fileName: path.basename(finalLocalPath)
          });
          
          // 使用spawn执行命令，以便获取实时进度
          const process = spawn(adbExecOutCmd, { shell: true, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
          
          let transferred = 0;
          let errorOutput = '';
          
          // 处理标准输出，写入tar文件
          process.stdout.pipe(tarWriteStream);
          
          // 监听数据传输进度
          process.stdout.on('data', (data) => {
            transferred += data.length;
            // 由于无法获取总大小，我们使用一个估算值
            // 这里简单地显示一个递增的进度
            const percentage = Math.min(95, Math.floor((transferred / (1024 * 1024)) * 10));
            
            // 发送进度到渲染进程
            event.sender.send('download-progress', {
              percentage,
              transferred: 1,
              totalSize: 1,
              fileName: path.basename(finalLocalPath)
            });
          });
          
          // 处理错误输出，捕获详细错误信息
          process.stderr.on('data', (data) => {
            const errorStr = data.toString();
            errorOutput += errorStr;
          });
          
          // 命令完成
          process.on('close', async (code) => {
            if (code === 0) {
              try {
                // 检查写入流状态
                if (tarWriteStream.destroyed) {
                } else {
                  // 等待写入流完成
                  await new Promise((resolve, reject) => {
                    // 设置超时
                    const timeout = setTimeout(() => {
                      reject(new Error('Write stream timeout after 30 seconds'));
                    }, 30000);
                    
                    // 监听finish事件
                    tarWriteStream.on('finish', () => {
                      clearTimeout(timeout);
                      resolve();
                    });
                    
                    // 监听error事件
                    tarWriteStream.on('error', (error) => {
                      clearTimeout(timeout);
                      reject(error);
                    });
                    
                    // 结束写入流
                    tarWriteStream.end();
                  });
                }
                // 检查tar文件是否成功创建
                if (!fs.existsSync(tempTarPath) || fs.statSync(tempTarPath).size === 0) {
                  throw new Error(`tar file creation failed or is empty: ${tempTarPath}`);
                }
                // 检查临时目录是否存在
                if (!fs.existsSync(tempDir)) {
                  throw new Error(`Temporary directory does not exist: ${tempDir}`);
                }
                
                // 解压tar文件到临时目录
                const extractDir = path.join(tempDir, 'extract');
                try {
                  fs.mkdirSync(extractDir, { recursive: true });                  
                } catch (error) {
                  throw new Error(`Failed to create extract directory: ${error.message}`);
                }
                
                // 调试：检查临时tar文件大小
                const tarStats = fs.statSync(tempTarPath);
                
                // 解压tar文件（使用Node.js内置模块，模拟流处理）
                try {
                  if (!fs.existsSync(tempTarPath)) {
                    throw new Error(`Tar file does not exist: ${tempTarPath}`);
                  }
                  
                  // 创建可读流读取tar文件
                  const readStream = fs.createReadStream(tempTarPath);
                  
                  // 存储缓冲区和偏移量
                  let buffer = Buffer.alloc(0);
                  let offset = 0;
                  const blockSize = 512;
                  
                  // 处理流数据
                  await new Promise((resolve, reject) => {
                    readStream.on('data', (chunk) => {
                      // 追加数据到缓冲区
                      buffer = Buffer.concat([buffer, chunk]);
                    });
                    
                    readStream.on('end', () => {
                      try {
                        // 解析tar文件
                        while (offset < buffer.length) {
                          // 读取文件头
                          const header = buffer.slice(offset, offset + blockSize);
                          
                          // 提取文件类型（第156字节，tar文件格式标准位置）
                          const fileType = header.toString('utf8', 156, 157);
                          
                          // 提取文件名（前100字节）
                          let fileName = header.toString('utf8', 0, 100).trim();
                          if (!fileName) break; // 空文件名表示tar文件结束
                          
                          // 清理文件名，移除空字节和其他无效字符
                          fileName = fileName.replace(/\x00/g, ''); // 移除空字节
                          fileName = fileName.replace(/[<>:"|?*]/g, '_'); // 移除Windows不允许的字符
                          if (!fileName) {
                            offset += blockSize;
                            continue; // 如果文件名清理后为空，跳过这个文件
                          }
                          
                          // 构建输出文件路径
                          const outputPath = path.join(extractDir, fileName);
                          
                          // 检查是否是目录（tar文件格式中目录类型为'5'）
                          if (fileType === '5' || fileName.endsWith('/')) {
                            // 目录类型，创建目录
                            if (!fs.existsSync(outputPath)) {
                              fs.mkdirSync(outputPath, { recursive: true });
                            }
                            // 目录在tar文件中也有数据部分（通常是0字节），但我们可以跳过
                            // 计算数据大小（通常为0）
                            const sizeStr = header.toString('utf8', 124, 135).trim();
                            const fileSize = parseInt(sizeStr, 8);
                            const dataSize = Math.ceil(fileSize / blockSize) * blockSize;
                            // 跳过文件头和数据部分
                            offset += blockSize + dataSize;
                            continue;
                          }
                          
                          // 普通文件，提取文件大小（第124-135字节，八进制）
                          const sizeStr = header.toString('utf8', 124, 135).trim();
                          const fileSize = parseInt(sizeStr, 8);
                          
                          // 计算文件数据的偏移和大小
                          const dataOffset = offset + blockSize;
                          const dataSize = Math.ceil(fileSize / blockSize) * blockSize;
                          
                          // 提取文件数据
                          const fileData = buffer.slice(dataOffset, dataOffset + fileSize);
                          
                          // 确保目录存在
                          const outputDirPath = path.dirname(outputPath);
                          if (!fs.existsSync(outputDirPath)) {
                            fs.mkdirSync(outputDirPath, { recursive: true });
                          }
                          
                          // 写入文件
                          try {
                            fs.writeFileSync(outputPath, fileData);
                          } catch (error) {
                            throw new Error(`Failed to write file ${outputPath}: ${error.message}`);
                          }
                          
                          // 移动到下一个文件头
                          offset += blockSize + dataSize;
                        }
                        resolve();
                      } catch (error) {
                        reject(error);
                      }
                    });
                    
                    readStream.on('error', (error) => {
                      reject(error);
                    });
                  });
                } catch (error) {
                  throw new Error(i18nService.t('main.tarExtractFailed', { error: error.message }));
                }
                
                // 调试：检查解压后的目录结构
                const listDirectory = (dirPath, indent = '') => {
                  const files = fs.readdirSync(dirPath);
                  files.forEach(file => {
                    const filePath = path.join(dirPath, file);
                    const stats = fs.statSync(filePath);
                    const type = stats.isDirectory() ? 'DIR' : 'FILE';
                    if (stats.isDirectory()) {
                      listDirectory(filePath, indent + '  ');
                    }
                  });
                };
                listDirectory(extractDir);
                
                // 创建zip文件
                const zip = new AdmZip();
                
                // 添加解压后的文件内容到zip
                const addDirectoryToZip = (dirPath, zipPath = '') => {
                  const files = fs.readdirSync(dirPath);
                  
                  // 调试：打印当前处理的目录                  
                  files.forEach(file => {
                    const filePath = path.join(dirPath, file);
                    const zipFilePath = path.join(zipPath, file);
                    const stats = fs.statSync(filePath);
                    
                    if (stats.isDirectory()) {
                      // 即使是空目录，也要添加到zip文件中
                      // 先添加一个空文件作为目录占位符
                      zip.addFile(`${zipFilePath}/`, Buffer.alloc(0));
                      // 递归处理目录内容
                      addDirectoryToZip(filePath, zipFilePath);
                    } else {
                      zip.addFile(zipFilePath, fs.readFileSync(filePath));
                    }
                  });
                };
                
                // 直接添加解压后的文件到zip根目录，不添加额外的根目录
                addDirectoryToZip(extractDir);
                
                // 写入zip文件
                zip.writeZip(finalLocalPath);
                
                // 清理临时文件和目录
                fs.unlinkSync(tempTarPath);
                fs.rmSync(tempDir, { recursive: true, force: true });
                
                // 发送100%进度到渲染进程
                event.sender.send('download-progress', {
                  percentage: 100,
                  transferred: 1,
                  totalSize: 1,
                  fileName: path.basename(finalLocalPath)
                });
                
                return { success: true, output: i18nService.t('main.fileDownloaded', { path: finalLocalPath }), localPath: finalLocalPath };
              } catch (error) {
                // 清理临时文件和目录
                if (fs.existsSync(tempTarPath)) {
                  fs.unlinkSync(tempTarPath);
                }
                fs.rmSync(tempDir, { recursive: true, force: true });
                
                // 构建详细的错误信息
                let detailedError = i18nService.t('main.zipCreationFailed', { error: error.message });
                detailedError += `\n执行的ADB命令: ${adbExecOutCmd}`;
                detailedError += `\n临时目录: ${tempDir}`;
                detailedError += `\n目标路径: ${finalLocalPath}`;
                
                // 发送详细错误信息到渲染进程
                event.sender.send('download-progress', {
                  percentage: 0,
                  transferred: 0,
                  totalSize: 0,
                  fileName: path.basename(finalLocalPath),
                  error: detailedError
                });
                
                return { success: false, error: detailedError };
              }
            } else {
              // 清理临时文件和目录
              if (fs.existsSync(tempTarPath)) {
                fs.unlinkSync(tempTarPath);
              }
              fs.rmSync(tempDir, { recursive: true, force: true });
              
              // 构建详细的错误信息，包含执行的ADB命令
              let detailedError = `执行的ADB命令: ${adbExecOutCmd}`;
              detailedError += `\n退出码: ${code}`;
              if (errorOutput) {
                detailedError += `\n详细错误: ${errorOutput.trim()}`;
              }
              
              // 发送详细错误信息到渲染进程
              event.sender.send('download-progress', {
                percentage: 0,
                transferred: 0,
                totalSize: 0,
                fileName: path.basename(finalLocalPath),
                error: detailedError
              });
              return { success: false, error: detailedError };
            }
          });
        } else {
          // 确保文件名不包含特殊符号
          const basePath = localPath.replace(/\\/g, '/').replace(/\/[^/]+$/, '');
          const fileName = path.basename(localPath);
          const sanitizedFileName = sanitizeFileName(fileName);
          finalLocalPath = `${basePath}/${sanitizedFileName}`;
          
          // 构建ADB pull命令（添加进度显示参数）
          adbCmd = deviceId 
            ? `adb -s ${deviceId} pull -p "${remotePath}" "${finalLocalPath}"` 
            : `adb pull -p "${remotePath}" "${finalLocalPath}"`;
          
          // 使用spawn执行命令以获取实时输出
          return new Promise((resolve) => {
            const process = spawn(adbCmd, { shell: true, windowsHide: true });
            
            let totalSize = 0;
            let transferred = 0;
            let errorOutput = '';
            
            // 处理标准输出（进度信息）
            process.stdout.on('data', (data) => {
              const output = data.toString();
              
              // 解析ADB pull进度输出（格式：[x/y (z%)]）
              const progressMatch = output.match(/\[(\d+)\/(\d+)\s+\((\d+)%\)\]/);
              if (progressMatch) {
                transferred = parseInt(progressMatch[1]);
                totalSize = parseInt(progressMatch[2]);
                const percentage = parseInt(progressMatch[3]);
                
                // 发送进度到渲染进程
                event.sender.send('download-progress', {
                  percentage,
                  transferred,
                  totalSize,
                  fileName: path.basename(finalLocalPath)
                });
              }
            });
            
            // 处理错误输出，捕获详细错误信息
            process.stderr.on('data', (data) => {
              errorOutput += data.toString();
            });
            
            // 命令完成
            process.on('close', (code) => {
              if (code === 0) {
                // 发送100%进度到渲染进程
                event.sender.send('download-progress', {
                  percentage: 100,
                  transferred: totalSize || 1,
                  totalSize: totalSize || 1,
                  fileName: path.basename(finalLocalPath)
                });
                resolve({ success: true, output: `文件已成功下载到: ${finalLocalPath}`, localPath: finalLocalPath });
              } else {
                // 构建详细的错误信息，包含执行的ADB命令
                let detailedError = `执行的ADB命令: ${adbCmd}`;
                detailedError += `\n退出码: ${code}`;
                if (errorOutput) {
                  detailedError += `\n详细错误: ${errorOutput.trim()}`;
                }
                
                // 发送详细错误信息到渲染进程
                event.sender.send('download-progress', {
                  percentage: 0,
                  transferred: 0,
                  totalSize: 0,
                  fileName: path.basename(finalLocalPath),
                  error: detailedError
                });
                resolve({ success: false, error: detailedError });
              }
            });
          });
        }
      } catch (error) {
        return { success: false, error: error.message };
      }
    });
    
    // 选择多个文件
    ipcMain.handle('selectFiles', async () => {
      const result = await dialog.showOpenDialog(this.mainWindow, {
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: 'All Files', extensions: ['*'] }
        ]
      });
      return result;
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

    // 获取测试计划运行记录
    ipcMain.handle('get-test-plan-runs', async (event, testPlanName) => {
      return this.getTestPlanRuns(testPlanName);
    });

    // 通过路径打开报告
    ipcMain.handle('open-report-by-path', async (event, reportPath) => {
      return this.openReportByPath(reportPath);
    });

    // 停止Allure服务器
    ipcMain.handle('stop-allure-server', async () => {
      return this.stopAllureServer();
    });

    // 获取Allure服务器状态
    ipcMain.handle('get-allure-server-status', async () => {
      return this.getAllureServerStatus();
    });

    // 清空Allure报告数据
    ipcMain.handle('clear-allure-reports', async () => {
      return this.clearAllureReports();
    });

    // 显示弹窗消息
    ipcMain.handle('show-dialog', async (event, options) => {
      const { type, title, message, buttons } = options;
      const result = await dialog.showMessageBox(this.mainWindow, {
        type: type || 'info',
        title: title || '提示',
        message: message,
        buttons: buttons || ['确定'],
        defaultId: 0,
        cancelId: 0
      });
      return result;
    });

    // 停止Python测试
    ipcMain.handle('stop-python-tests', async () => {
      try {
        if (this.currentPythonProcess) {
          // 杀死Python进程
          this.currentPythonProcess.kill();
          this.currentPythonProcess = null;
          
          // 停止未授权弹窗监控
          this.stopUnauthorizedDialogMonitor();
          
          return { success: true, message: '测试已停止' };
        } else {
          return { success: false, message: '没有正在运行的测试' };
        }
      } catch (error) {
        console.error('停止测试失败:', error);
        return { success: false, message: '停止测试失败: ' + error.message };
      }
    });

    // 获取配置
    ipcMain.handle('get-config', async () => {
      try {
        const configPath = path.join(this.projectRoot, 'config', 'config.json');
        if (fs.existsSync(configPath)) {
          const data = fs.readFileSync(configPath, 'utf8');
          return JSON.parse(data);
        }
        return {};
      } catch (error) {
        console.error('读取配置失败:', error);
        return {};
      }
    });

    // 保存配置
    ipcMain.handle('save-config', async (event, newConfig) => {
      try {
        const configPath = path.join(this.projectRoot, 'config', 'config.json');
        let currentConfig = {};
        
        // 读取现有配置
        if (fs.existsSync(configPath)) {
          const data = fs.readFileSync(configPath, 'utf8');
          currentConfig = JSON.parse(data);
        }
        
        // 合并新配置
        const updatedConfig = { ...currentConfig, ...newConfig };
        
        // 保存到文件
        fs.writeFileSync(configPath, JSON.stringify(updatedConfig, null, 2));
        
        return { success: true };
      } catch (error) {
        console.error('保存配置失败:', error);
        return { success: false, error: error.message };
      }
    });

    // 检查路径是否存在
    ipcMain.handle('checkPathExists', async (event, pathToCheck) => {
      try {
        return fs.existsSync(pathToCheck);
      } catch (error) {
        console.error('检查路径失败:', error);
        return false;
      }
    });

    // 启动scrcpy
    ipcMain.handle('start-scrcpy', async (event, deviceId, scrcpyParams) => {
      try {
        const scrcpyPath = path.join(this.projectRoot, 'env', 'scrcpy', 'scrcpy.exe');
        const args = ['-s', deviceId];
        
        if (scrcpyParams.max_size) {
          args.push('--max-size', scrcpyParams.max_size);
        }
        if (scrcpyParams.video_bit_rate) {
          const bitRate = scrcpyParams.video_bit_rate;
          const bitRateWithUnit = typeof bitRate === 'string' && bitRate.endsWith('M') ? bitRate : `${bitRate}M`;
          args.push('--video-bit-rate', bitRateWithUnit);
        }
        if (scrcpyParams.max_fps) {
          args.push('--max-fps', scrcpyParams.max_fps);
        }
        if (scrcpyParams.video_codec) {
          args.push('--video-codec', scrcpyParams.video_codec);
        }
        if (scrcpyParams.always_on_top) {
          args.push('--always-on-top');
        }
        
        if (!fs.existsSync(scrcpyPath)) {
          return { success: false, error: i18nService.t('main.scrcpyNotFound', { path: scrcpyPath }) };
        }
        
        const { execFile } = require('child_process');
        
        if (process.platform === 'win32') {
          const argsStr = args.map(arg => `'${arg}'`).join(' ');
          const command = `powershell.exe -WindowStyle Hidden -Command "& '${scrcpyPath}' ${argsStr}"`;
          
          require('child_process').exec(command, {
            cwd: path.dirname(scrcpyPath),
            windowsHide: true
          }, (error, stdout, stderr) => {
            if (error) {
              return;
            }
          });
        } else {
          execFile(scrcpyPath, args, {
            cwd: path.dirname(scrcpyPath),
            detached: true,
            stdio: 'ignore'
          }, (error, stdout, stderr) => {
            if (error) {
              return;
            }
          });
        }
        
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('get-scheduled-plans', async () => {
      return this.getScheduledPlans();
    });

    ipcMain.handle('save-scheduled-plan', async (event, planData) => {
      const result = await this.saveScheduledPlan(planData);
      if (result.success && this.smartScheduler) {
        this.smartScheduler.addPlan(result.plan);
      }
      return result;
    });

    ipcMain.handle('update-scheduled-plan', async (event, planData) => {
      const result = await this.updateScheduledPlan(planData);
      if (result.success && this.smartScheduler) {
        this.smartScheduler.updatePlan(planData.id, planData);
      }
      return result;
    });

    ipcMain.handle('delete-scheduled-plan', async (event, planId) => {
      const result = await this.deleteScheduledPlan(planId);
      if (result.success && this.smartScheduler) {
        this.smartScheduler.removePlan(planId);
      }
      return result;
    });

    ipcMain.handle('check-time-conflict', async (event, data) => {
      const { scheduledTime, excludeId } = data || {};
      return this.checkTimeConflict(scheduledTime, excludeId);
    });

    ipcMain.handle('send-dingtalk-notification', async (event, notificationData) => {
      return this.sendDingTalkNotification(notificationData);
    });
    
    ipcMain.handle('scheduled-test-complete', async (event, planId) => {
      return this.handleScheduledTestComplete(planId);
    });

    ipcMain.handle('get-scheduler-status', async () => {
      if (this.smartScheduler) {
        return this.smartScheduler.getStatus();
      }
      return null;
    });
  }

  async runPythonTests(testConfig) {
    return new Promise((resolve, reject) => {
      const { testPaths, markers, testPlanName } = testConfig;
      
      // 检查UV虚拟环境是否存在
      const pythonCmd = this.getPythonCommand();
      if (!pythonCmd.command) {
        resolve({
          success: false,
          error: pythonCmd.error || i18nService.t('splash.checks.uvVenvNotFound')
        });
        return;
      }
      
      // 启动未授权弹窗监控
      this.startUnauthorizedDialogMonitor();
      
      // 构建Python命令 - 使用新的模块入口点
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

      // 使用虚拟环境Python运行测试
      const pythonProcess = spawn(pythonCmd.command, pythonArgs, {
        cwd: this.projectRoot,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          PYTHONIOENCODING: 'utf-8',  // 设置Python输出编码
          PYTHONUTF8: '1',  // 启用Python UTF-8模式
          PYTHONPATH: path.join(this.projectRoot, 'src')  // 添加 src 目录到 Python 路径
        },
        windowsHide: true  // 隐藏Windows下的命令行窗口
      });
      
      // 存储当前Python进程引用
      this.currentPythonProcess = pythonProcess;

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
        // 停止未授权弹窗监控
        this.stopUnauthorizedDialogMonitor();
        
        // 清除Python进程引用
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

  startUnauthorizedDialogMonitor() {
    // 监控未授权弹窗触发文件
    const fs = require('fs');
    const path = require('path');
    
    const dialogTriggerFile = path.join(this.projectRoot, 'logs', 'unauthorized_dialog.json');
    
    // 创建文件监控器
    const checkDialogTrigger = () => {
      try {
        if (fs.existsSync(dialogTriggerFile)) {
          const data = fs.readFileSync(dialogTriggerFile, 'utf8');
          const dialogData = JSON.parse(data);
          
          // 显示弹窗
          this.showUnauthorizedDialog(dialogData);
          
          // 删除触发文件
          fs.unlinkSync(dialogTriggerFile);
        }
      } catch (error) {
        console.error('检查未授权弹窗触发文件失败:', error);
      }
    };
    
    // 每2秒检查一次
    this.unauthorizedDialogInterval = setInterval(checkDialogTrigger, 2000);
    
    // 初始检查
    checkDialogTrigger();
  }

  stopUnauthorizedDialogMonitor() {
    if (this.unauthorizedDialogInterval) {
      clearInterval(this.unauthorizedDialogInterval);
      this.unauthorizedDialogInterval = null;
    }
  }

  async showUnauthorizedDialog(dialogData) {
    const { device_name, message } = dialogData;
    
    // 使用之前添加的show-dialog IPC处理程序显示弹窗
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

  async getTestPlans() {
    try {
      // 静默读取测试计划文件，避免控制台输出格式问题
      const plansPath = path.join(this.projectRoot, 'config', 'test_plans.json');
      
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

  async getTestPlanRuns(testPlanName) {
    try {
      const plansPath = path.join(this.projectRoot, 'config', 'test_plans.json');
      
      if (!fs.existsSync(plansPath)) {
        return { success: false, error: '测试计划文件不存在', runs: [] };
      }
      
      const data = fs.readFileSync(plansPath, 'utf8');
      const plans = JSON.parse(data);
      
      const plan = plans.find(p => p.name === testPlanName);
      if (!plan) {
        return { success: false, error: '未找到指定测试计划', runs: [] };
      }
      
      const runs = plan.runs || [];
      
      // 按时间降序排序
      const sortedRuns = runs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      
      const processedRuns = sortedRuns.map((run, index) => {
        const reportExists = run.report_path && fs.existsSync(run.report_path);
        return {
          index: index + 1,
          timestamp: run.timestamp,
          reportPath: run.report_path,
          available: reportExists,
          isLatest: index === 0
        };
      });
      
      return { success: true, runs: processedRuns };
    } catch (error) {
      console.error('获取测试计划运行记录失败:', error);
      return { success: false, error: error.message, runs: [] };
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

      if (!reportPath || !fs.existsSync(reportPath)) {
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
      const fs = require('fs');
      const logsDir = path.join(this.projectRoot, 'logs', 'XKAT');
      
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }

      const currentTime = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const logPath = path.join(logsDir, `XKAT-${currentTime}.log`);
      const timestamp = new Date().toISOString();
      const logMessage = `[${timestamp}] 开始打开报告: ${reportPath}\n`;
      fs.appendFileSync(logPath, logMessage, 'utf8');

      const { spawn } = require('child_process');
      
      // 优先使用项目内的allure命令
      const projectAllureBat = path.join(this.projectRoot, 'env', 'allure', 'bin', 'allure.bat');
      const projectAllure = path.join(this.projectRoot, 'env', 'allure', 'bin', 'allure');
      
      let command;
      
      if (fs.existsSync(projectAllureBat)) {
        // Windows系统：使用完整的命令行字符串，确保空格被正确处理
        command = `"${projectAllureBat}" open "${reportPath}"`;
        fs.appendFileSync(logPath, `[${new Date().toISOString()}] Using project allure.bat\n`, 'utf8');
      } else if (fs.existsSync(projectAllure)) {
        command = `"${projectAllure}" open "${reportPath}"`;
        fs.appendFileSync(logPath, `[${new Date().toISOString()}] Using project allure\n`, 'utf8');
      } else {
        command = `allure open "${reportPath}"`;
        fs.appendFileSync(logPath, `[${new Date().toISOString()}] Using system allure\n`, 'utf8');
      }
      
      fs.appendFileSync(logPath, `[${new Date().toISOString()}] Command: ${command}\n`, 'utf8');

      this.allureOpenProcess = spawn(command, {
        cwd: this.projectRoot,
        stdio: 'pipe',
        detached: false,
        shell: true,
        windowsHide: true
      });

      this.allureOpenProcess.stdout.on('data', (data) => {
        const output = data.toString();
        fs.appendFileSync(logPath, `[${new Date().toISOString()}] STDOUT: ${output}`, 'utf8');
        
        const portMatch = output.match(/http:\/\/[0-9.]+:(\d+)/);
        if (portMatch) {
          this.allureServerPort = parseInt(portMatch[1]);
        }
      });

      this.allureOpenProcess.stderr.on('data', (data) => {
        fs.appendFileSync(logPath, `[${new Date().toISOString()}] STDERR: ${data.toString()}`, 'utf8');
      });

      this.allureOpenProcess.on('close', (code) => {
        fs.appendFileSync(logPath, `[${new Date().toISOString()}] 进程退出，代码: ${code}\n`, 'utf8');
        this.allureOpenProcess = null;
        this.allureServerPort = null;
      });

      this.allureOpenProcess.on('error', (error) => {
        fs.appendFileSync(logPath, `[${new Date().toISOString()}] 进程错误: ${error.message}\n`, 'utf8');
        this.allureOpenProcess = null;
      });

      await new Promise(resolve => setTimeout(resolve, 2000));

      const message = `正在打开Allure报告...`;
      return { success: true, message };
    } catch (error) {
      const errorMessage = `打开报告失败: ${error.message}`;
      console.error(errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  async saveTestPlan(planData) {
    try {
      const plansPath = path.join(this.projectRoot, 'config', 'test_plans.json');
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
      const plansPath = path.join(this.projectRoot, 'config', 'test_plans.json');
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
        return { success: false, error: i18nService.t('main.testPlanNotFound') };
      }
    } catch (error) {
      console.error('更新测试计划失败:', error);
      return { success: false, error: error.message };
    }
  }

  async deleteTestPlan(planId) {
    try {
      const plansPath = path.join(this.projectRoot, 'config', 'test_plans.json');
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
        return { success: false, error: i18nService.t('main.testPlanNotFound') };
      }
    } catch (error) {
      console.error('删除测试计划失败:', error);
      return { success: false, error: error.message };
    }
  }

  async openAllureReport(testPlanName = null) {
    try {
      // 检查是否已经有Allure服务器在运行
      const serverStatus = await this.getAllureServerStatus();
      if (serverStatus.running || serverStatus.allureOpenRunning) {
        const serverInfo = this.allureServerPort ? `当前服务地址: http://127.0.0.1:${this.allureServerPort}` : '';
        return { 
          success: false, 
          error: `已有Allure服务器在运行，请先关闭现有服务器再尝试打开新报告。${serverInfo ? ' ' + serverInfo : ''}`
        };
      }

      // 如果没有指定测试计划名称，使用最新的测试计划
      if (!testPlanName) {
        const testPlans = await this.getTestPlans();
        if (testPlans.length > 0) {
          testPlanName = testPlans[testPlans.length - 1].name;
        } else {
          // 检查是否有任何报告目录存在
          const allureReportBaseDir = path.join(this.projectRoot, 'logs', 'Allure', 'allure-reports');
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

      const allureReportDir = path.join(this.projectRoot, 'logs', 'Allure', 'allure-reports', testPlanName);
      
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
      // 检查是否已经有Allure服务器在运行
      const serverStatus = await this.getAllureServerStatus();
      if (serverStatus.running || serverStatus.allureOpenRunning) {
        const serverInfo = this.allureServerPort ? `当前服务地址: http://127.0.0.1:${this.allureServerPort}` : '';
        return { 
          success: false, 
          error: `已有Allure服务器在运行，请先关闭现有服务器再尝试启动新服务器。${serverInfo ? ' ' + serverInfo : ''}`
        };
      }

      const allureReportDir = path.join(this.projectRoot, 'logs', 'Allure', 'allure-reports', testPlanName);
      
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


      
      // 启动allure serve进程
      this.allureServerProcess = spawn(allureCmd, args, {
        cwd: this.projectRoot,
        stdio: 'pipe',
        detached: false,
        windowsHide: true  // 隐藏Windows下的命令行窗口
      });

      this.allureServerPort = port;
      this.allureServerTestPlan = testPlanName;
      this.allureServerStartTime = Date.now();

      // 监听进程输出
      this.allureServerProcess.stdout.on('data', (data) => {

      });

      this.allureServerProcess.stderr.on('data', (data) => {
        console.error(`Allure服务器错误: ${data}`);
      });

      this.allureServerProcess.on('close', (code) => {

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
        return { success: false, error: i18nService.t('main.allureServerStartFailed') };
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
      // "http://127.0.0.1:4040"
      // "Server is started at http://localhost:4040"
      
      const lines = stdoutData.split('\n');
      for (const line of lines) {
        // 匹配多种端口号模式
        const patterns = [
          /http:\/\/(?:localhost|127\.0\.0\.1):(\d+)/i,  // 匹配http://localhost:端口或http://127.0.0.1:端口
          /Server started at.*:(\d+)/i,  // 匹配Server started at...:端口
          /Server is started at.*:(\d+)/i,  // 匹配Server is started at...:端口
          /Listening on port (\d+)/i,  // 匹配Listening on port 端口
          /Port (\d+) is used/i  // 匹配Port 端口 is used
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

  // 按端口杀死进程
  async killProcessByPort(port, processName = 'allure open进程') {
    const fs = require('fs');
    const path = require('path');
    const logsDir = path.join(this.projectRoot, 'logs', 'XKAT');
    
    // 确保XKAT日志文件夹存在
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    // 生成当前时间格式化的日志文件名
    const currentTime = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const logPath = path.join(logsDir, `XKAT-${currentTime}.log`);
    
    const logMessage = (message) => {
      const timestamp = new Date().toISOString();
      const logEntry = `[${timestamp}] [Electron] ${message}\n`;

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
          return { success: false, error: i18nService.t('main.processNotFound') };
        }
      } else {
        logMessage(`未找到监听端口 ${port} 的进程`);
        return { success: false, error: i18nService.t('main.processNotFound') };
      }
    } catch (error) {
      const errorMessage = i18nService.t('main.stopProcessFailed', { processName, error: error.message });
      logMessage(errorMessage);
      return { success: false, error: error.message };
    }
  }

  async stopAllureServer() {
    try {
      // 使用独立的XKAT日志文件，避免与Python日志文件冲突
      const fs = require('fs');
      const logsDir = path.join(this.projectRoot, 'logs', 'XKAT');
      
      // 确保XKAT日志文件夹存在
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }
      
      // 生成当前时间格式化的日志文件名
      const currentTime = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const electronLogPath = path.join(logsDir, `XKAT-${currentTime}.log`);
      
      const logMessage = (message) => {
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] [Electron] ${message}\n`;

        // 使用异步写入，避免阻塞和文件锁定问题
        fs.appendFile(electronLogPath, logEntry, 'utf8', (err) => {
          if (err) {
            console.error('写入Electron日志失败:', err);
          }
        });
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

  async clearAllureReports() {
    try {
      const allureReportsDir = path.join(this.projectRoot, 'logs', 'Allure', 'allure-reports');
      
      if (!fs.existsSync(allureReportsDir)) {
        return { success: true, message: 'Allure报告目录不存在' };
      }
      
      const items = fs.readdirSync(allureReportsDir);
      let deletedCount = 0;
      
      for (const item of items) {
        const itemPath = path.join(allureReportsDir, item);
        try {
          if (fs.statSync(itemPath).isDirectory()) {
            fs.rmSync(itemPath, { recursive: true, force: true });
          } else {
            fs.unlinkSync(itemPath);
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

  async openAllureReportDirectly(testPlanName) {
    try {
      // 使用独立的XKAT日志文件，避免与Python日志文件冲突
      const fs = require('fs');
      const logsDir = path.join(this.projectRoot, 'logs', 'XKAT');
      
      // 确保XKAT日志文件夹存在
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }
      
      // 生成当前时间格式化的日志文件名
      const currentTime = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const electronLogPath = path.join(logsDir, `XKAT-${currentTime}.log`);
      
      const logMessage = (message) => {
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] [Electron] ${message}\n`;

        // 使用异步写入，避免阻塞和文件锁定问题
        fs.appendFile(electronLogPath, logEntry, 'utf8', (err) => {
          if (err) {
            console.error('写入Electron日志失败:', err);
          }
        });
      };
      
      logMessage(`Starting to open Allure report with allure open: ${testPlanName}`);
      
      const allureReportDir = path.join(this.projectRoot, 'logs', 'Allure', 'allure-reports', testPlanName);
      
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
        shell: true,  // 使用系统shell来处理命令，自动处理路径中的空格
        windowsHide: true  // 隐藏Windows下的命令行窗口
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

        logMessage(closeMessage);
        
        const stdoutMessage = `标准输出: ${stdoutData}`;

        logMessage(stdoutMessage);
        
        const stderrMessage = `错误输出: ${stderrData}`;

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
      const errorMessage = i18nService.t('main.openReportFailed', { error: error.message });
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

      
      const allureReportDir = path.join(this.projectRoot, 'logs', 'Allure', 'allure-reports', testPlanName);
      const indexHtmlPath = path.join(allureReportDir, 'index.html');
      


      
      const dirExists = fs.existsSync(allureReportDir);
      const fileExists = fs.existsSync(indexHtmlPath);
      const exists = dirExists && fileExists;
      

      
      return { exists: exists };
    } catch (error) {
      console.error('检查报告存在性失败:', error);
      return { exists: false };
    }
  }

  async getPytestMarkers() {
    try {
      const pytestIniPath = path.join(this.projectRoot, 'config', 'pytest.ini');
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
      // 如果用户指定了目录路径，直接扫描该目录
      if (directoryPath && fs.existsSync(directoryPath) && fs.statSync(directoryPath).isDirectory()) {

        
        const files = fs.readdirSync(directoryPath);

        
        const testFiles = [];

        for (const file of files) {
          // 只处理.py文件，排除__pycache__目录
          if (file.endsWith('.py') && file !== '__pycache__') {
            const filePath = path.join(directoryPath, file);
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
                path: filePath, // 使用绝对路径而不是相对路径
                type: type
              });
            }
          }
        }


        
        // 如果用户选择的目录中有测试文件，直接返回
        if (testFiles.length > 0) {
          return testFiles;
        }
      }
      
      // 如果没有指定目录或选择的目录中没有测试文件，使用默认逻辑
      let projectRoot = this.projectRoot;
      
      // 检查用户是否选择了tests目录本身
      const testsPath = path.join(projectRoot, 'tests');
      if (fs.existsSync(testsPath) && fs.statSync(testsPath).isDirectory()) {
        // 如果tests目录存在，说明用户选择了项目根目录
      } else if (fs.existsSync(projectRoot) && fs.statSync(projectRoot).isDirectory()) {
        // 如果选择的目录存在，检查它是否是tests目录
        const dirName = path.basename(projectRoot);
        if (dirName === 'tests') {
          // 用户选择了tests目录，自动找到其父目录作为项目根目录
          projectRoot = path.dirname(projectRoot);
        }
      }
      
      // 在打包环境中，Python项目文件位于应用根目录，需要调整路径逻辑
    let finalTestsPath = path.join(projectRoot, 'tests');
    
    // 如果当前路径不存在tests目录，尝试在应用根目录查找
    if (!fs.existsSync(finalTestsPath)) {
        // 在打包环境中，Python项目文件位于与exe同级的目录
        const appRoot = process.cwd();
        const alternativeTestsPath = path.join(appRoot, 'tests');
        
        if (fs.existsSync(alternativeTestsPath)) {
            finalTestsPath = alternativeTestsPath;
            projectRoot = appRoot;
        }
    }
    
    if (!fs.existsSync(finalTestsPath)) {
        return [];
    }
 
    const files = fs.readdirSync(finalTestsPath);
       
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
                path: filePath, // 使用绝对路径而不是相对路径
                type: type
              });
          }
        }
      }

      return testFiles;
    } catch (error) {
      return [];
    }
  }

  async extractPytestMarkers(filePaths) {
    try {
      const markers = new Set();
      
      for (const filePath of filePaths) {
        // 检查filePath是否已经是绝对路径
        let fullPath = filePath;
        if (!path.isAbsolute(filePath)) {
          // 如果是相对路径，才需要拼接项目根目录
          fullPath = path.join(this.projectRoot, filePath);
        }
        
        if (!fs.existsSync(fullPath)) {
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
      
      return foundMarkers;
    } catch (error) {
      // 如果提取失败，返回空数组（不添加任何默认标记）
      return [];
    }
  }

  async getScheduledPlans() {
    try {
      if (fs.existsSync(this.scheduledPlansPath)) {
        const data = fs.readFileSync(this.scheduledPlansPath, 'utf8');
        return JSON.parse(data);
      }
      return [];
    } catch (error) {
      console.error('读取定时计划失败:', error);
      return [];
    }
  }

  getScheduledPlansSync() {
    try {
      if (fs.existsSync(this.scheduledPlansPath)) {
        const data = fs.readFileSync(this.scheduledPlansPath, 'utf8');
        return JSON.parse(data);
      }
      return [];
    } catch (error) {
      console.error('读取定时计划失败:', error);
      return [];
    }
  }

  async saveScheduledPlan(planData) {
    try {
      let existingPlans = await this.getScheduledPlans();
      
      const newPlan = {
        id: planData.id || `scheduled-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: planData.name,
        testPlans: planData.testPlans || [],
        scheduledTime: planData.scheduledTime,
        status: 'pending',
        created: planData.created || new Date().toISOString(),
        lastRun: null
      };
      
      existingPlans.push(newPlan);
      fs.writeFileSync(this.scheduledPlansPath, JSON.stringify(existingPlans, null, 2));
      
      return { success: true, plan: newPlan };
    } catch (error) {
      console.error('保存定时计划失败:', error);
      return { success: false, error: error.message };
    }
  }

  async updateScheduledPlan(planData) {
    try {
      let existingPlans = await this.getScheduledPlans();
      
      const index = existingPlans.findIndex(p => p.id === planData.id);
      
      if (index >= 0) {
        const originalPlan = existingPlans[index];
        existingPlans[index] = {
          ...originalPlan,
          ...planData,
          id: originalPlan.id,
          created: originalPlan.created
        };
        
        fs.writeFileSync(this.scheduledPlansPath, JSON.stringify(existingPlans, null, 2));
        return { success: true };
      } else {
        return { success: false, error: '未找到指定的定时计划' };
      }
    } catch (error) {
      console.error('更新定时计划失败:', error);
      return { success: false, error: error.message };
    }
  }

  async deleteScheduledPlan(planId) {
    try {
      let existingPlans = await this.getScheduledPlans();
      
      const index = existingPlans.findIndex(p => p.id === planId);
      
      if (index >= 0) {
        existingPlans.splice(index, 1);
        fs.writeFileSync(this.scheduledPlansPath, JSON.stringify(existingPlans, null, 2));
        return { success: true };
      } else {
        return { success: false, error: '未找到指定的定时计划' };
      }
    } catch (error) {
      console.error('删除定时计划失败:', error);
      return { success: false, error: error.message };
    }
  }

  async checkTimeConflict(scheduledTime, excludeId = null) {
    try {
      const existingPlans = await this.getScheduledPlans();
      
      const newTime = new Date(scheduledTime);
      const newTimeMinutes = newTime.getFullYear() + '-' + 
                            String(newTime.getMonth() + 1).padStart(2, '0') + '-' +
                            String(newTime.getDate()).padStart(2, '0') + 'T' +
                            String(newTime.getHours()).padStart(2, '0') + ':' +
                            String(newTime.getMinutes()).padStart(2, '0');
      
      for (const plan of existingPlans) {
        if (excludeId && plan.id === excludeId) {
          continue;
        }
        
        if (plan.status === 'cancelled') {
          continue;
        }
        
        const planTime = new Date(plan.scheduledTime);
        const planTimeMinutes = planTime.getFullYear() + '-' + 
                               String(planTime.getMonth() + 1).padStart(2, '0') + '-' +
                               String(planTime.getDate()).padStart(2, '0') + 'T' +
                               String(planTime.getHours()).padStart(2, '0') + ':' +
                               String(planTime.getMinutes()).padStart(2, '0');
        
        if (newTimeMinutes === planTimeMinutes) {
          return { 
            hasConflict: true, 
            conflictingPlan: plan 
          };
        }
      }
      
      return { hasConflict: false };
    } catch (error) {
      console.error('检查时间冲突失败:', error);
      return { hasConflict: false };
    }
  }

  async sendDingTalkNotification(notificationData) {
    try {
      const { accessToken, secret, message } = notificationData;
      
      if (!accessToken || !secret) {
        return { success: false, error: '钉钉配置不完整，请检查 access_token 和 secret' };
      }
      
      const timestamp = Date.now().toString();
      const stringToSign = `${timestamp}\n${secret}`;
      
      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(stringToSign);
      const hmacCode = hmac.digest();
      const sign = encodeURIComponent(hmacCode.toString('base64'));
      
      const url = `https://oapi.dingtalk.com/robot/send?access_token=${accessToken}&timestamp=${timestamp}&sign=${sign}`;
      
      const body = {
        at: {
          isAtAll: 'false',
          atUserIds: [],
          atMobiles: []
        },
        text: {
          content: message
        },
        msgtype: 'text'
      };
      
      const response = await axios.post(url, body, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      console.log('钉钉通知发送响应:', response.data);
      return { success: true, data: response.data };
    } catch (error) {
      console.error('发送钉钉通知失败:', error);
      return { success: false, error: error.message };
    }
  }

  startScheduleChecker() {
    if (this.smartScheduler) {
      return;
    }
    
    this.smartScheduler = new SmartScheduler(this);
    this.smartScheduler.initialize();
  }

  stopScheduleChecker() {
    if (this.smartScheduler) {
      this.smartScheduler.destroy();
      this.smartScheduler = null;
    }
  }

  async handleScheduledTestComplete(planId) {
    try {
      await this.updateScheduledPlan({
        id: planId,
        status: 'completed',
        lastRun: new Date().toISOString()
      });
    } catch (error) {
      console.error('更新定时计划状态失败:', error);
    }
  }

  initialize() {
    // 禁用Windows上的透明窗口透明度限制
    if (process.platform === 'win32') {
      app.disableHardwareAcceleration();
      // 禁用Windows系统上透明窗口最大化时的边框
      app.commandLine.appendSwitch('enable-transparent-visuals');
    }
    
    // 当所有窗口被关闭时退出应用
    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        this.createSplashWindow();
      }
    });

    app.whenReady().then(() => {
      this.createSplashWindow();
      this.setupIPC();
      this.startScheduleChecker();
    });

    app.on('web-contents-created', (event, contents) => {
      contents.on('new-window', (event, navigationUrl) => {
        event.preventDefault();
        shell.openExternal(navigationUrl);
      });
    });

    app.on('before-quit', () => {
      this.stopScheduleChecker();
    });
  }
}

// 启动应用
const electronApp = new ElectronApp();
electronApp.initialize();
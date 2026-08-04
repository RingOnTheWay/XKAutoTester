const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const pathHelper = require('./utils/pathHelper');
const { IPC_CHANNELS } = require('../shared/constants');

class ElectronApp {
  constructor() {
    this.mainWindow = null;
    this.splashWindow = null;
    this.allureWindow = null;
    this.isDev = process.argv.includes('--dev');
    this.isPackaged = app.isPackaged || false;
    
    this.projectRoot = pathHelper.getProjectRoot(this.isPackaged, __dirname);
    
    this.userConfigPath = null;
    this.userDataPath = null;
    this.services = {};
  }

  setServices(services) {
    this.services = services;
  }

  createSplashWindow() {
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
        preload: pathHelper.getPreloadPath(this.isPackaged, __dirname),
        webSecurity: false
      }
    });
    
    const splashPath = pathHelper.getSplashPath(this.isPackaged, __dirname);
    this.splashWindow.loadFile(splashPath);
    
    this.splashWindow.once('ready-to-show', () => {
      if (this.splashWindow) {
        this.splashWindow.focus();
        this.splashWindow.setAlwaysOnTop(true);
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

  createWindow() {
    this.mainWindow = new BrowserWindow({
      width: 1400,
      height: 900,
      minWidth: 1000,
      minHeight: 700,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
        preload: pathHelper.getPreloadPath(this.isPackaged, __dirname),
        webSecurity: false
      },
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: true,
      roundedCorners: true,
      icon: path.join(pathHelper.getAssetsPath(this.isPackaged, __dirname), 'icon.png'),
      x: 100,
      y: 100,
      autoHideMenuBar: true,
      thickFrame: false
    });
    
    this.mainWindow.setMenu(null);

    // 开发模式 (electron-vite dev): loadURL (dev server + HMR)
    // 生产/旧开发模式: loadFile (源码 renderer/ 或打包后 renderer/)
    const devServerUrl = process.env.ELECTRON_VITE_DEV_SERVER_URL;
    if (devServerUrl) {
      this.mainWindow.loadURL(devServerUrl);
    } else {
      const htmlPath = path.join(pathHelper.getRendererPath(this.isPackaged, __dirname), 'index.html');
      this.mainWindow.loadFile(htmlPath);
    }

    // 开发模式下自动打开DevTools
    if (!this.isPackaged) {
      this.mainWindow.webContents.openDevTools({ mode: 'detach' });
    }

    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow.focus();
      this.mainWindow.center();
    });

    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
      if (this.allureWindow && !this.allureWindow.isDestroyed()) {
        this.allureWindow.destroy();
        this.allureWindow = null;
      }
    });

    if (this.services.schedulerService) {
      this.services.schedulerService.setMainWindow(this.mainWindow);
    }

    if (this.services.pythonTestService) {
      // M2: PythonTestService 保留直字段赋值 (前5轮决定: 消除 setMainWindow 时序耦合, run() lazy 取 this.mainWindow)
      this.services.pythonTestService.mainWindow = this.mainWindow;
    }

    // H2: ScrcpyService 下沉 crash 检测后需 mainWindow 引用 (notifierFactory lazy 获取)
    if (this.services.scrcpyService) {
      this.services.scrcpyService.setMainWindow(this.mainWindow);
    }

    // M2: DataTransferService 集中注入 (替代 dataTransferHandlers 内 3 处重复 setMainWindow 调用)
    if (this.services.dataTransferService) {
      this.services.dataTransferService.setMainWindow(this.mainWindow);
    }

    this.mainWindow.on('maximize', () => {
      // M7: 走 IPC_CHANNELS 常量 (原硬编码 'window-maximized' 字符串)
      this.mainWindow.webContents.send(IPC_CHANNELS.WINDOW_MAXIMIZED, true);
    });

    this.mainWindow.on('unmaximize', () => {
      this.mainWindow.webContents.send(IPC_CHANNELS.WINDOW_MAXIMIZED, false);
    });

    this.mainWindow.webContents.setWindowOpenHandler(() => {
      return { action: 'deny' };
    });
  }

  createAllureWindow(url, language, isDark = false, allureService = null) {
    if (this.allureWindow && !this.allureWindow.isDestroyed()) {
      this.allureWindow.close();
      this.allureWindow = null;
    }

    const assetsPath = pathHelper.getAssetsPath(this.isPackaged, __dirname);
    const partitionName = `allure-report-${Date.now()}`;

    this.allureWindow = new BrowserWindow({
      width: 1400,
      height: 900,
      minWidth: 800,
      minHeight: 600,
      icon: path.join(assetsPath, 'icon.png'),
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
        webSecurity: false,
        partition: partitionName
      },
      autoHideMenuBar: true
    });

    const ses = this.allureWindow.webContents.session;

    ses.webRequest.onBeforeRequest(
      { urls: ['*://*.google-analytics.com/*', '*://*.googletagmanager.com/*'] },
      (details, callback) => {
        callback({ cancel: true });
      }
    );

    ses.webRequest.onHeadersReceived((details, callback) => {
      const responseHeaders = { ...details.responseHeaders };
      delete responseHeaders['content-security-policy'];
      delete responseHeaders['content-security-policy-report-only'];
      delete responseHeaders['x-content-security-policy'];
      delete responseHeaders['x-webkit-csp'];
      responseHeaders['access-control-allow-origin'] = ['*'];
      callback({ responseHeaders });
    });

    this.allureWindow.webContents.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36'
    );

    let windowShown = false;
    let showTimeout = null;

    const showWindow = () => {
      if (windowShown) return;
      windowShown = true;
      if (showTimeout) {
        clearTimeout(showTimeout);
        showTimeout = null;
      }
      if (this.allureWindow && !this.allureWindow.isDestroyed()) {
        this.allureWindow.show();
      }
    };

    showTimeout = setTimeout(() => {
      showWindow();
    }, 5000);

    this.allureWindow.webContents.on('did-navigate', async (event, navigateUrl) => {
      if (!navigateUrl.startsWith('http') || !this.allureWindow || this.allureWindow.isDestroyed()) return;
    });

    this.allureWindow.webContents.on('did-finish-load', () => {
      showWindow();
    });

    this.allureWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
      if (level >= 3) {
        console.error(`[Allure Window] ${message} (${sourceId}:${line})`);
      }
    });

    this.allureWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
      console.error(`[Allure] Failed to load: ${errorDescription} (${errorCode}) URL: ${validatedURL}`);
      showWindow();
    });

    this.allureWindow.loadURL(url);

    // 开发模式下不自动打开Allure页面控制台

    this.allureWindow.on('closed', () => {
      if (showTimeout) {
        clearTimeout(showTimeout);
        showTimeout = null;
      }
      this.allureWindow = null;
      // 窗口关闭时联动停止HTTP server
      if (allureService) {
        allureService.stopAllureServer().catch(() => {});
      }
    });
  }

  initialize() {
    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });

    app.on('before-quit', () => {
      if (this.allureWindow && !this.allureWindow.isDestroyed()) {
        this.allureWindow.destroy();
        this.allureWindow = null;
      }
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        this.createSplashWindow();
      }
    });

    app.whenReady().then(() => {
      this.createSplashWindow();

      if (this.services.registerHandlers) {
        this.services.registerHandlers(ipcMain, {
          electronApp: this,
          i18nService: this.services.i18nService,
          schedulerService: this.services.schedulerService,
          scheduledPlanService: this.services.scheduledPlanService,
          testPlanService: this.services.testPlanService,
          pythonTestService: this.services.pythonTestService,
          environmentService: this.services.environmentService,
          allureService: this.services.allureService,
          adbService: this.services.adbService,
          notificationService: this.services.notificationService,
          scrcpyService: this.services.scrcpyService,
          pagePackageService: this.services.pagePackageService,
          bleDeviceDiscoveryService: this.services.bleDeviceDiscoveryService,
          testCaseService: this.services.testCaseService,
          apkParserService: this.services.apkParserService,
          versionService: this.services.versionService,
          userDataService: this.services.userDataService,
          updateService: this.services.updateService,
          inspectorService: this.services.inspectorService,
          dataTransferService: this.services.dataTransferService,
          environmentStartupService: this.services.environmentStartupService,
        });
      }

      if (this.services.schedulerService) {
        // M1: SchedulerService facade 删除, 直接调 SmartScheduler.initialize()
        this.services.schedulerService.initialize();
      }

      this.restorePreventSleepSetting();
    });

    app.on('web-contents-created', (event, contents) => {
      contents.on('new-window', (event, navigationUrl) => {
        event.preventDefault();
        const { shell } = require('electron');
        shell.openExternal(navigationUrl);
      });
    });

    app.on('before-quit', () => {
      // S1: 持有子进程/会话的 service 必须在退出前同步释放, 避免孤儿进程
      // 对称: schedulerService.destroy() + allureService.cleanupSync() (will-quit)
      try { this.services.schedulerService && this.services.schedulerService.destroy(); } catch { /* 退出吞错 */ }
      try { this.services.scrcpyService && this.services.scrcpyService.stopScrcpy(); } catch { /* 退出吞错 */ }
      try { this.services.pythonTestService && this.services.pythonTestService.stop(); } catch { /* 退出吞错 */ }
      try { this.services.inspectorService && this.services.inspectorService.dispose(); } catch { /* 退出吞错 */ }
    });

    app.on('will-quit', () => {
      if (this.services.allureService) {
        this.services.allureService.cleanupSync();
      }
    });
  }

  async restorePreventSleepSetting() {
    try {
      const configPath = require('path').join(this.userConfigPath, 'config.json');
      const asyncFs = require('./utils/asyncFs');
      if (await asyncFs.exists(configPath)) {
        const config = await asyncFs.readJson(configPath);
        if (config && config.APP_SETTINGS && config.APP_SETTINGS.preventSleep) {
          const { startPreventSleep } = require('./handlers/powerHandlers');
          startPreventSleep();
        }
      }
    } catch (error) {
      console.error('恢复防睡眠设置失败:', error);
    }
  }
}

module.exports = ElectronApp;

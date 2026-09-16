const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const pathHelper = require('./utils/pathHelper');
const { IPC_CHANNELS } = require('../shared/constants');
const { SecurityPolicy } = require('./security/SecurityPolicy');
const { LifecycleCleanup } = require('./lifecycle/LifecycleCleanup');

/**
 * ElectronApp - 应用组合根 (R26 候选⑤: 窗口 chrome + 服务接线)
 *
 * 安全策略在 security/SecurityPolicy (CSP/webRequest/window.open 单点),
 * 退出清理链在 lifecycle/LifecycleCleanup (声明式 before-quit/will-quit 注册表)。
 * 本类只保留: 窗口创建/生命周期编排、服务注入、IPC 注册入口。
 */
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

    this.#security = new SecurityPolicy();
    this.#cleanup = new LifecycleCleanup();
  }

  #security;
  #cleanup;

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
      backgroundColor: '#00000000',
      hasShadow: true,
      roundedCorners: true,
      titleBarStyle: 'hidden',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
        preload: pathHelper.getPreloadPath(this.isPackaged, __dirname),
        // webSecurity: true — splash 仅加载本地文件; 关闭同源策略有 XSS 风险
        webSecurity: true,
      },
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
        // webSecurity: true — mainWindow 加载本地 renderer/; 关闭同源策略有 XSS 风险
        webSecurity: true,
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
      thickFrame: false,
    });

    this.mainWindow.setMenu(null);

    // 主窗口 CSP 注入 (安全策略单点, R26 候选⑤)
    this.#security.attachMainWindowCsp(this.mainWindow.webContents.session);

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
      // PythonTestService 保留直字段赋值: 消除 setMainWindow 时序耦合, run() lazy 取 this.mainWindow
      this.services.pythonTestService.mainWindow = this.mainWindow;
    }

    // ScrcpyService 需 mainWindow 引用 (notifierFactory lazy 获取)
    if (this.services.scrcpyService) {
      this.services.scrcpyService.setMainWindow(this.mainWindow);
    }

    if (this.services.dataTransferService) {
      this.services.dataTransferService.setMainWindow(this.mainWindow);
    }

    this.mainWindow.on('maximize', () => {
      // 走 IPC_CHANNELS 常量
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
        // webSecurity: true — allure 报告与 HTTP server 同源 http://localhost:PORT; 关闭同源策略有 XSS 风险
        webSecurity: true,
        partition: partitionName,
      },
      autoHideMenuBar: true,
    });

    // allure 窗口策略 (GA 拦截 + CSP 删除, 独立 partition, R26 候选⑤ 单点)
    this.#security.attachAllureWindowPolicy(this.allureWindow.webContents.session);

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
        this.services.schedulerService.initialize();
      }

      this.restorePreventSleepSetting();
    });

    app.on('web-contents-created', (event, contents) => {
      // 统一 window.open 策略 (安全策略单点, R26 候选⑤)
      this.#security.attachWindowOpenHandler(contents);
    });

    // 退出清理链 (声明式注册表, P3-3 语义: 单一 before-quit, 单步失败不阻断)
    this.#cleanup.registerStandardChain({
      getAllureWindow: () => this.allureWindow,
      clearAllureWindow: () => {
        this.allureWindow = null;
      },
      services: this.services,
    });
    app.on('before-quit', () => this.#cleanup.runBeforeQuit());
    app.on('will-quit', () => this.#cleanup.runWillQuit());
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

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const pathHelper = require('./utils/pathHelper');

class ElectronApp {
  constructor() {
    this.mainWindow = null;
    this.splashWindow = null;
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

    const htmlPath = path.join(pathHelper.getRendererPath(this.isPackaged, __dirname), 'index.html');
    this.mainWindow.loadFile(htmlPath);

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
    });

    if (this.services.schedulerService) {
      this.services.schedulerService.setMainWindow(this.mainWindow);
    }

    if (this.services.pythonTestService) {
      this.services.pythonTestService.setMainWindow(this.mainWindow);
    }

    this.mainWindow.on('maximize', () => {
      this.mainWindow.webContents.send('window-maximized', true);
    });

    this.mainWindow.on('unmaximize', () => {
      this.mainWindow.webContents.send('window-maximized', false);
    });

    this.mainWindow.webContents.setWindowOpenHandler(() => {
      return { action: 'deny' };
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
          dataTransferService: this.services.dataTransferService
        });
      }

      if (this.services.schedulerService) {
        this.services.schedulerService.start();
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
      if (this.services.schedulerService) {
        this.services.schedulerService.stop();
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

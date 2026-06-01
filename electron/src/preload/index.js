const { contextBridge, ipcRenderer, webUtils } = require('electron');
const path = require('path');
const fs = require('fs');

// 加载i18next模块
const i18next = require('i18next');

// 初始化i18next
async function initializeI18next() {
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
    
    // 获取用户配置的语言 - 通过 IPC 从主进程获取
    let savedLanguage = 'zh-CN';
    try {
      const configData = await ipcRenderer.invoke('get-config');
      if (configData && configData.APP_SETTINGS && configData.APP_SETTINGS.language) {
        savedLanguage = configData.APP_SETTINGS.language;
      }
    } catch (error) {
      console.error('读取配置文件失败:', error);
    }
    
    // 初始化i18next
    await i18next.init({
      lng: savedLanguage,
      fallbackLng: 'zh-CN',
      resources: resources
    });
  } catch (error) {
    console.error('i18next初始化失败:', error);
  }
}

// 初始化i18next
initializeI18next();

// 暴露安全的API给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 窗口控制
  minimizeWindow: () => ipcRenderer.invoke('window-minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window-maximize'),
  closeWindow: () => ipcRenderer.invoke('window-close'),
  isWindowMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  onWindowMaximized: (callback) => ipcRenderer.on('window-maximized', (event, isMaximized) => callback(isMaximized)),
  setIgnoreMouseEvents: (ignore, options, windowType) => ipcRenderer.invoke('window-set-ignore-mouse-events', ignore, options, windowType),
  
  // 窗口拖拽
  startWindowDrag: (mouseX, mouseY) => ipcRenderer.send('window-drag-start', mouseX, mouseY),
  moveWindowDrag: (mouseX, mouseY) => ipcRenderer.send('window-drag-move', mouseX, mouseY),
  endWindowDrag: () => ipcRenderer.send('window-drag-end'),
  
  // 文件操作
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  selectFile: () => ipcRenderer.invoke('select-file'),
  selectApkFile: () => ipcRenderer.invoke('select-apk-file'),
  getFilePath: (file) => webUtils.getPathForFile(file),
  
  // 测试操作
  runPythonTests: (testConfig) => ipcRenderer.invoke('run-python-tests', testConfig),
  getTestPlans: () => ipcRenderer.invoke('get-test-plans'),
  saveTestPlan: (planData) => ipcRenderer.invoke('save-test-plan', planData),
  updateTestPlan: (planData) => ipcRenderer.invoke('update-test-plan', planData),
  deleteTestPlan: (planId) => ipcRenderer.invoke('delete-test-plan', planId),
  
  // 定时计划操作
  getScheduledPlans: () => ipcRenderer.invoke('get-scheduled-plans'),
  saveScheduledPlan: (planData) => ipcRenderer.invoke('save-scheduled-plan', planData),
  updateScheduledPlan: (planData) => ipcRenderer.invoke('update-scheduled-plan', planData),
  deleteScheduledPlan: (planId) => ipcRenderer.invoke('delete-scheduled-plan', planId),
  checkTimeConflict: (data) => ipcRenderer.invoke('check-time-conflict', data),
  onScheduledTestStart: (callback) => ipcRenderer.on('scheduled-test-start', callback),
  onScheduledPlanExpired: (callback) => ipcRenderer.on('scheduled-plan-expired', callback),
  getSchedulerStatus: () => ipcRenderer.invoke('get-scheduler-status'),
  
  // 系统操作
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  getProjectInfo: () => ipcRenderer.invoke('get-project-info'),
  getPytestMarkers: () => ipcRenderer.invoke('get-pytest-markers'),
  
  // 事件监听
  onTestOutput: (callback) => ipcRenderer.on('test-output', callback),
  onTestError: (callback) => ipcRenderer.on('test-error', callback),
  
  // 渲染进程日志回写
  logTestOutput: (text, isError) => ipcRenderer.send('log-test-output', text, isError),
  
  // 扫描测试文件
  scanTestFiles: (directoryPath) => ipcRenderer.invoke('scan-test-files', directoryPath),
  
  // 保存测试用例
  saveTestCase: (data) => ipcRenderer.invoke('save-test-case', data),
  
  // 删除测试用例
  deleteTestCase: (data) => ipcRenderer.invoke('delete-test-case', data),
  
  // 提取pytest标记
  extractPytestMarkers: (filePaths) => ipcRenderer.invoke('extract-pytest-markers', filePaths),
  
  // 检查报告存在性
  checkReportExists: (testPlanName) => ipcRenderer.invoke('check-report-exists', testPlanName),
  
  // 查看报告
  viewReport: (testPlanName) => ipcRenderer.invoke('view-report', testPlanName),
  
  // 获取测试计划运行记录
  getTestPlanRuns: (testPlanName) => ipcRenderer.invoke('get-test-plan-runs', testPlanName),
  
  // 通过路径打开报告
  openReportByPath: (reportPath) => ipcRenderer.invoke('open-report-by-path', reportPath),
  
  // Allure服务器管理
  getAllureServerStatus: () => ipcRenderer.invoke('get-allure-server-status'),
  clearAllureReports: () => ipcRenderer.invoke('clear-allure-reports'),
  clearAllLogs: () => ipcRenderer.invoke('clear-all-logs'),
  
  // 弹窗功能
  showDialog: (options) => ipcRenderer.invoke('show-dialog', options),
  
  // 停止Python测试
  stopPythonTests: () => ipcRenderer.invoke('stop-python-tests'),
  
  // 获取连接的设备列表
  getConnectedDevices: () => ipcRenderer.invoke('getConnectedDevices'),
  
  // 获取串口列表
  getSerialPorts: () => ipcRenderer.invoke('getSerialPorts'),
  
  // 配置管理
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  
  // 配置存放位置
  getDataPath: () => ipcRenderer.invoke('get-data-path'),
  changeDataPath: (newPath) => ipcRenderer.invoke('change-data-path', newPath),
  resetDataPath: () => ipcRenderer.invoke('reset-data-path'),
  relaunchApp: () => ipcRenderer.invoke('relaunch-app'),
  
  // 版本信息
  getVersionInfo: () => ipcRenderer.invoke('get-version-info'),
  
  // 更新检查
  checkForUpdate: () => ipcRenderer.invoke('check-for-update'),
  downloadUpdate: (downloadUrl, fileName) => ipcRenderer.invoke('download-update', downloadUrl, fileName),
  installUpdate: (filePath) => ipcRenderer.invoke('install-update', filePath),
  onUpdateDownloadProgress: (callback) => {
    const listener = (event, progress) => callback(progress);
    ipcRenderer.on('on-download-progress', listener);
    return () => ipcRenderer.removeListener('on-download-progress', listener);
  },
  
  // 屏幕控制
  startScrcpy: (deviceId, scrcpyParams) => ipcRenderer.invoke('start-scrcpy', deviceId, scrcpyParams),
  onScrcpyError: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('scrcpy-error', listener);
    return () => ipcRenderer.removeListener('scrcpy-error', listener);
  },
  
  // 文件管理器相关
  executeAdbCommand: (cmd, deviceId) => ipcRenderer.invoke('executeAdbCommand', cmd, deviceId),
  selectFiles: () => ipcRenderer.invoke('selectFiles'),
  uploadFile: (localPath, remotePath, deviceId) => ipcRenderer.invoke('uploadFile', localPath, remotePath, deviceId),
  onUploadProgress: (callback) => {
    const listener = (event, progress) => callback(progress);
    ipcRenderer.on('upload-progress', listener);
    return () => ipcRenderer.removeListener('upload-progress', listener);
  },
  downloadFile: (remotePath, localPath, deviceId) => ipcRenderer.invoke('downloadFile', remotePath, localPath, deviceId),
  onDownloadProgress: (callback) => ipcRenderer.on('download-progress', callback),
  installApk: (apkPath, deviceId) => ipcRenderer.invoke('install-apk', { apkPath, deviceId }),
  onInstallProgress: (callback) => {
    const listener = (event, progress) => callback(progress);
    ipcRenderer.on('install-progress', listener);
    return () => ipcRenderer.removeListener('install-progress', listener);
  },
  
  // 路径检查
  checkPathExists: (path) => ipcRenderer.invoke('checkPathExists', path),
  createDirectory: (dirPath) => ipcRenderer.invoke('createDirectory', dirPath),
  
  // 钉钉通知
  sendDingTalkNotification: (notificationData) => ipcRenderer.invoke('send-dingtalk-notification', notificationData),
  
  // 定时计划测试完成
  scheduledTestComplete: (planId) => ipcRenderer.invoke('scheduled-test-complete', planId),
  
  // 移除监听器
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
  
  // 发送事件
  send: (channel, ...args) => {
    ipcRenderer.send(channel, ...args);
  },
  
  // 监听事件
  on: (channel, callback) => {
    ipcRenderer.on(channel, (event, ...args) => callback(...args));
  },
  
  // i18next相关
  i18n: {
    changeLanguage: async (language) => {
      await i18next.changeLanguage(language);
      return i18next.language;
    },
    t: (key, options) => {
      return i18next.t(key, options);
    },
    getLanguage: () => {
      return i18next.language;
    }
  },
  
  // 页面封装相关
  pagePackage: {
    // 应用管理
    getApps: () => ipcRenderer.invoke('page-package:get-apps'),
    addApp: (name) => ipcRenderer.invoke('page-package:add-app', name),
    updateApp: (appId, name) => ipcRenderer.invoke('page-package:update-app', appId, name),
    deleteApp: (appId) => ipcRenderer.invoke('page-package:delete-app', appId),
    searchApps: (keyword) => ipcRenderer.invoke('page-package:search-apps', keyword),

    // 页面管理
    getPages: (appId) => ipcRenderer.invoke('page-package:get-pages', appId),
    addPage: (appId, name) => ipcRenderer.invoke('page-package:add-page', appId, name),
    updatePage: (appId, pageId, name) => ipcRenderer.invoke('page-package:update-page', appId, pageId, name),
    deletePage: (appId, pageId) => ipcRenderer.invoke('page-package:delete-page', appId, pageId),
    searchPages: (appId, keyword) => ipcRenderer.invoke('page-package:search-pages', appId, keyword),

    // 元素管理
    getElements: (appId, pageId) => ipcRenderer.invoke('page-package:get-elements', appId, pageId),
    addElement: (appId, pageId, elementData) => ipcRenderer.invoke('page-package:add-element', appId, pageId, elementData),
    updateElement: (appId, pageId, elementId, elementData) => ipcRenderer.invoke('page-package:update-element', appId, pageId, elementId, elementData),
    deleteElement: (appId, pageId, elementId) => ipcRenderer.invoke('page-package:delete-element', appId, pageId, elementId),
    searchElements: (appId, pageId, keyword) => ipcRenderer.invoke('page-package:search-elements', appId, pageId, keyword),

    // 统计信息
    getAppStats: (appId) => ipcRenderer.invoke('page-package:get-app-stats', appId),
    getPageStats: (appId, pageId) => ipcRenderer.invoke('page-package:get-page-stats', appId, pageId)
  },

  // 测试用例管理（新版）
  testCase: {
    list: () => ipcRenderer.invoke('test-case:list'),
    get: (fileName) => ipcRenderer.invoke('test-case:get', fileName),
    save: (caseData) => ipcRenderer.invoke('test-case:save', caseData),
    delete: (param) => ipcRenderer.invoke('test-case:delete', param),
    checkJsonExists: (fileName) => ipcRenderer.invoke('test-case:check-json-exists', fileName),
    batchCheckJsonExists: (fileNames) => ipcRenderer.invoke('test-case:batch-check-json-exists', fileNames),
    generatePython: (caseData, outputDir) => ipcRenderer.invoke('test-case:generate-python', { caseData, outputDir }),
    saveAndGenerate: (caseData, outputDir) => ipcRenderer.invoke('test-case:save-and-generate', { caseData, outputDir })
  },

  // APK解析
  apk: {
    parse: (apkPath) => ipcRenderer.invoke('apk:parse', apkPath)
  },

  // BLE设备发现
  bleDeviceDiscovery: {
    getDevices: () => ipcRenderer.invoke('ble-device-discovery:get-devices'),
    getDeviceDetail: (deviceId) => ipcRenderer.invoke('ble-device-discovery:get-device-detail', deviceId)
  },

  inspector: {
    startSession: (deviceName, appPackage, appActivity, platformVersion, noReset) => ipcRenderer.invoke('inspector:start-session', deviceName, appPackage, appActivity, platformVersion, noReset),
    getScreenshot: () => ipcRenderer.invoke('inspector:get-screenshot'),
    getPageSource: () => ipcRenderer.invoke('inspector:get-page-source'),
    findElementLocators: (elementPath) => ipcRenderer.invoke('inspector:find-element-locators', elementPath),
    refreshSession: () => ipcRenderer.invoke('inspector:refresh-session'),
    stopSession: () => ipcRenderer.invoke('inspector:stop-session'),
    onProgress: (callback) => {
      const subscription = (event, stage) => callback(stage);
      ipcRenderer.on('inspector:progress', subscription);
      return () => ipcRenderer.removeListener('inspector:progress', subscription);
    }
  },

  // 驱动安装
  installDriver: (installerPath) => ipcRenderer.invoke('install-driver', installerPath),
  checkInstallerRunning: () => ipcRenderer.invoke('check-installer-running'),
  recheckCP210xDriver: () => ipcRenderer.invoke('recheck-cp210x-driver'),

  startChecks: () => ipcRenderer.invoke('start-checks'),
  splashReady: () => ipcRenderer.invoke('splash-ready'),

  setPreventSleep: (enable) => ipcRenderer.invoke('set-prevent-sleep', enable),

  selectExportPath: (options) => ipcRenderer.invoke('select-export-path', options),
  selectImportPath: () => ipcRenderer.invoke('select-import-path'),
  exportConfig: (outputPath) => ipcRenderer.invoke('export-config', outputPath),
  exportLogs: (outputPath) => ipcRenderer.invoke('export-logs', outputPath),
  importConfig: (zipPath) => ipcRenderer.invoke('import-config', zipPath),
  onExportProgress: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('on-export-progress', listener);
    return () => ipcRenderer.removeListener('on-export-progress', listener);
  },
  onImportProgress: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('on-import-progress', listener);
    return () => ipcRenderer.removeListener('on-import-progress', listener);
  }
});
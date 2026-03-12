const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');
const fs = require('fs');

// 加载i18next模块
const i18next = require('i18next');

// 初始化i18next
async function initializeI18next() {
  try {
    // 构建语言文件路径
    const localesPath = path.join(__dirname, 'locales');
    
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
    
    // 获取用户配置的语言
    let savedLanguage = 'zh-CN';
    try {
      const configPath = path.join(__dirname, '..', 'config', 'config.json');
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
  
  // 文件操作
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  selectFile: () => ipcRenderer.invoke('select-file'),
  
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
  
  // 扫描测试文件
  scanTestFiles: (directoryPath) => ipcRenderer.invoke('scan-test-files', directoryPath),
  
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
  stopAllureServer: () => ipcRenderer.invoke('stop-allure-server'),
  getAllureServerStatus: () => ipcRenderer.invoke('get-allure-server-status'),
  clearAllureReports: () => ipcRenderer.invoke('clear-allure-reports'),
  
  // 弹窗功能
  showDialog: (options) => ipcRenderer.invoke('show-dialog', options),
  
  // 停止Python测试
  stopPythonTests: () => ipcRenderer.invoke('stop-python-tests'),
  
  // 获取连接的设备列表
  getConnectedDevices: () => ipcRenderer.invoke('getConnectedDevices'),
  
  // 配置管理
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  
  // 屏幕控制
  startScrcpy: (deviceId, scrcpyParams) => ipcRenderer.invoke('start-scrcpy', deviceId, scrcpyParams),
  
  // 文件管理器相关
  executeAdbCommand: (cmd, deviceId) => ipcRenderer.invoke('executeAdbCommand', cmd, deviceId),
  selectFiles: () => ipcRenderer.invoke('selectFiles'),
  uploadFile: (localPath, remotePath, deviceId) => ipcRenderer.invoke('uploadFile', localPath, remotePath, deviceId),
  downloadFile: (remotePath, localPath, deviceId) => ipcRenderer.invoke('downloadFile', remotePath, localPath, deviceId),
  onDownloadProgress: (callback) => ipcRenderer.on('download-progress', callback),
  
  // 路径检查
  checkPathExists: (path) => ipcRenderer.invoke('checkPathExists', path),
  
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
  }
});
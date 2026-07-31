const { contextBridge, ipcRenderer, webUtils } = require('electron');
const path = require('path');
const fs = require('fs');
const { IPC_CHANNELS } = require('../shared/constants');

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
      const configData = await invokeWithCheck(IPC_CHANNELS.GET_CONFIG);
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

/**
 * 统一 IPC invoke wrapper
 * 检测 result.success === false 时抛 Error，错误信息优先取 result.error，回退 result.message
 * 成功时原样返回 result（保留 handler 原始返回结构）
 * @param {string} channel - IPC 通道名
 * @param  {...any} args - 参数
 * @returns {Promise<any>} handler 返回值
 */
async function invokeWithCheck(channel, ...args) {
  const result = await ipcRenderer.invoke(channel, ...args);
  if (result && result.success === false) {
    const err = new Error(result.error || result.message || 'Unknown IPC error');
    if (result.errorCode) err.code = result.errorCode;
    if (result.statusCode != null) err.statusCode = result.statusCode;
    throw err;
  }
  return result;
}

// 暴露安全的API给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 窗口控制
  minimizeWindow: () => invokeWithCheck(IPC_CHANNELS.WINDOW_MINIMIZE),
  maximizeWindow: () => invokeWithCheck(IPC_CHANNELS.WINDOW_MAXIMIZE),
  closeWindow: () => invokeWithCheck(IPC_CHANNELS.WINDOW_CLOSE),
  isWindowMaximized: () => invokeWithCheck(IPC_CHANNELS.WINDOW_IS_MAXIMIZED),
  onWindowMaximized: (callback) => ipcRenderer.on(IPC_CHANNELS.WINDOW_MAXIMIZED, (event, isMaximized) => callback(isMaximized)),
  setIgnoreMouseEvents: (ignore, options, windowType) => invokeWithCheck(IPC_CHANNELS.WINDOW_SET_IGNORE_MOUSE_EVENTS, ignore, options, windowType),

  // 窗口拖拽
  startWindowDrag: (mouseX, mouseY) => ipcRenderer.send(IPC_CHANNELS.WINDOW_DRAG_START, mouseX, mouseY),
  moveWindowDrag: (mouseX, mouseY) => ipcRenderer.send(IPC_CHANNELS.WINDOW_DRAG_MOVE, mouseX, mouseY),
  endWindowDrag: () => ipcRenderer.send(IPC_CHANNELS.WINDOW_DRAG_END),

  // 文件操作
  selectDirectory: () => invokeWithCheck(IPC_CHANNELS.SELECT_DIRECTORY),
  selectFile: () => invokeWithCheck(IPC_CHANNELS.SELECT_FILE),
  selectApkFile: () => invokeWithCheck(IPC_CHANNELS.SELECT_APK_FILE),
  getFilePath: (file) => webUtils.getPathForFile(file),

  // 测试操作
  // runPythonTests 不走 invokeWithCheck: 测试失败 (success=false) 是预期结果,
  // model 通过 result.success 判断, 不应抛错进 catch 块 (避免与实时 TEST_ERROR 输出重复)
  runPythonTests: (testConfig) => ipcRenderer.invoke(IPC_CHANNELS.RUN_PYTHON_TESTS, testConfig),
  getTestPlans: () => invokeWithCheck(IPC_CHANNELS.GET_TEST_PLANS),
  saveTestPlan: (planData) => invokeWithCheck(IPC_CHANNELS.SAVE_TEST_PLAN, planData),
  updateTestPlan: (planData) => invokeWithCheck(IPC_CHANNELS.UPDATE_TEST_PLAN, planData),
  deleteTestPlan: (planId) => invokeWithCheck(IPC_CHANNELS.DELETE_TEST_PLAN, planId),

  // 定时计划操作
  getScheduledPlans: () => invokeWithCheck(IPC_CHANNELS.GET_SCHEDULED_PLANS),
  saveScheduledPlan: (planData) => invokeWithCheck(IPC_CHANNELS.SAVE_SCHEDULED_PLAN, planData),
  updateScheduledPlan: (planData) => invokeWithCheck(IPC_CHANNELS.UPDATE_SCHEDULED_PLAN, planData),
  deleteScheduledPlan: (planId) => invokeWithCheck(IPC_CHANNELS.DELETE_SCHEDULED_PLAN, planId),
  checkTimeConflict: (data) => invokeWithCheck(IPC_CHANNELS.CHECK_TIME_CONFLICT, data),
  getScheduledPlanRuns: (planId) => invokeWithCheck(IPC_CHANNELS.GET_SCHEDULED_PLAN_RUNS, planId),
  onScheduledTestStart: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on(IPC_CHANNELS.SCHEDULED_TEST_START, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SCHEDULED_TEST_START, listener);
  },
  onScheduledPlanExpired: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on(IPC_CHANNELS.SCHEDULED_PLAN_EXPIRED, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SCHEDULED_PLAN_EXPIRED, listener);
  },
  getSchedulerStatus: () => invokeWithCheck(IPC_CHANNELS.GET_SCHEDULER_STATUS),

  // 系统操作
  openExternal: (url) => invokeWithCheck(IPC_CHANNELS.OPEN_EXTERNAL, url),
  openPath: (pathToOpen) => invokeWithCheck(IPC_CHANNELS.OPEN_PATH, pathToOpen),
  getProjectInfo: () => invokeWithCheck(IPC_CHANNELS.GET_PROJECT_INFO),
  getPytestMarkers: () => invokeWithCheck(IPC_CHANNELS.GET_PYTEST_MARKERS),

  // 事件监听
  onTestOutput: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on(IPC_CHANNELS.TEST_OUTPUT, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.TEST_OUTPUT, listener);
  },
  onTestError: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on(IPC_CHANNELS.TEST_ERROR, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.TEST_ERROR, listener);
  },

  // 渲染进程日志回写
  logTestOutput: (text, isError) => ipcRenderer.send(IPC_CHANNELS.LOG_TEST_OUTPUT, text, isError),

  // 扫描测试文件
  scanTestFiles: (directoryPath) => invokeWithCheck(IPC_CHANNELS.SCAN_TEST_FILES, directoryPath),

  // 保存测试用例
  saveTestCase: (data) => invokeWithCheck(IPC_CHANNELS.SAVE_TEST_CASE, data),

  // 删除测试用例
  deleteTestCase: (data) => invokeWithCheck(IPC_CHANNELS.DELETE_TEST_CASE, data),

  // 提取pytest标记
  extractPytestMarkers: (filePaths) => invokeWithCheck(IPC_CHANNELS.EXTRACT_PYTEST_MARKERS, filePaths),

  // 检查报告存在性
  checkReportExists: (testPlanName) => invokeWithCheck(IPC_CHANNELS.CHECK_REPORT_EXISTS, testPlanName),

  // 查看报告
  viewReport: (testPlanName) => invokeWithCheck(IPC_CHANNELS.VIEW_REPORT, testPlanName),

  // 获取测试计划运行记录
  getTestPlanRuns: (testPlanName) => invokeWithCheck(IPC_CHANNELS.GET_TEST_PLAN_RUNS, testPlanName),

  // 通过路径打开报告
  openReportByPath: (reportPath) => invokeWithCheck(IPC_CHANNELS.OPEN_REPORT_BY_PATH, reportPath),

  // Allure服务器管理
  getAllureServerStatus: () => invokeWithCheck(IPC_CHANNELS.GET_ALLURE_SERVER_STATUS),
  clearAllureReports: () => invokeWithCheck(IPC_CHANNELS.CLEAR_ALLURE_REPORTS),
  deleteReportRun: (testPlanName, reportPath) => invokeWithCheck(IPC_CHANNELS.DELETE_REPORT_RUN, { testPlanName, reportPath }),
  clearAllLogs: () => invokeWithCheck(IPC_CHANNELS.CLEAR_ALL_LOGS),

  // 弹窗功能
  showDialog: (options) => invokeWithCheck(IPC_CHANNELS.SHOW_DIALOG, options),

  // 停止Python测试
  stopPythonTests: () => invokeWithCheck(IPC_CHANNELS.STOP_PYTHON_TESTS),

  // 获取连接的设备列表
  getConnectedDevices: () => invokeWithCheck(IPC_CHANNELS.GET_CONNECTED_DEVICES),

  // 获取串口列表
  getSerialPorts: () => invokeWithCheck(IPC_CHANNELS.GET_SERIAL_PORTS),

  // 配置管理
  getConfig: () => invokeWithCheck(IPC_CHANNELS.GET_CONFIG),
  saveConfig: (config) => invokeWithCheck(IPC_CHANNELS.SAVE_CONFIG, config),

  // 配置存放位置
  getDataPath: () => invokeWithCheck(IPC_CHANNELS.GET_DATA_PATH),
  changeDataPath: (newPath) => invokeWithCheck(IPC_CHANNELS.CHANGE_DATA_PATH, newPath),
  resetDataPath: () => invokeWithCheck(IPC_CHANNELS.RESET_DATA_PATH),
  relaunchApp: () => invokeWithCheck(IPC_CHANNELS.RELAUNCH_APP),

  // 版本信息
  getVersionInfo: () => invokeWithCheck(IPC_CHANNELS.GET_VERSION_INFO),

  // 更新检查
  checkForUpdate: () => invokeWithCheck(IPC_CHANNELS.CHECK_FOR_UPDATE),
  checkForUpdateRaw: () => ipcRenderer.invoke(IPC_CHANNELS.CHECK_FOR_UPDATE),
  downloadUpdate: (downloadUrl, fileName) => invokeWithCheck(IPC_CHANNELS.DOWNLOAD_UPDATE, downloadUrl, fileName),
  installUpdate: (filePath) => invokeWithCheck(IPC_CHANNELS.INSTALL_UPDATE, filePath),
  onUpdateDownloadProgress: (callback) => {
    const listener = (event, progress) => callback(progress);
    ipcRenderer.on(IPC_CHANNELS.ON_DOWNLOAD_PROGRESS, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.ON_DOWNLOAD_PROGRESS, listener);
  },

  // 屏幕控制
  startScrcpy: (deviceId, scrcpyParams) => invokeWithCheck(IPC_CHANNELS.START_SCRCPY, deviceId, scrcpyParams),
  onScrcpyError: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on(IPC_CHANNELS.SCRCPY_ERROR, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SCRCPY_ERROR, listener);
  },

  // 文件管理器相关
  executeAdbCommand: (cmd, deviceId) => invokeWithCheck(IPC_CHANNELS.EXECUTE_ADB_COMMAND, cmd, deviceId),
  selectFiles: () => invokeWithCheck(IPC_CHANNELS.SELECT_FILES),
  uploadFile: (localPath, remotePath, deviceId) => invokeWithCheck(IPC_CHANNELS.UPLOAD_FILE, localPath, remotePath, deviceId),
  onUploadProgress: (callback) => {
    const listener = (event, progress) => callback(progress);
    ipcRenderer.on(IPC_CHANNELS.UPLOAD_PROGRESS, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.UPLOAD_PROGRESS, listener);
  },
  downloadFile: (remotePath, localPath, deviceId) => invokeWithCheck(IPC_CHANNELS.DOWNLOAD_FILE, remotePath, localPath, deviceId),
  onDownloadProgress: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on(IPC_CHANNELS.DOWNLOAD_PROGRESS, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.DOWNLOAD_PROGRESS, listener);
  },
  installApk: (apkPath, deviceId) => invokeWithCheck(IPC_CHANNELS.INSTALL_APK, { apkPath, deviceId }),
  onInstallProgress: (callback) => {
    const listener = (event, progress) => callback(progress);
    ipcRenderer.on(IPC_CHANNELS.INSTALL_PROGRESS, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.INSTALL_PROGRESS, listener);
  },

  // 路径检查
  checkPathExists: (path) => invokeWithCheck(IPC_CHANNELS.CHECK_PATH_EXISTS, path),
  createDirectory: (dirPath) => invokeWithCheck(IPC_CHANNELS.CREATE_DIRECTORY, dirPath),

  // 钉钉通知
  sendDingTalkNotification: (notificationData) => invokeWithCheck(IPC_CHANNELS.SEND_DINGTALK_NOTIFICATION, notificationData),

  // 定时计划测试完成
  scheduledTestComplete: (planId) => invokeWithCheck(IPC_CHANNELS.SCHEDULED_TEST_COMPLETE, planId),

  // 移除监听器
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),

  // 发送事件
  send: (channel, ...args) => {
    ipcRenderer.send(channel, ...args);
  },

  // 监听事件
  on: (channel, callback) => {
    const listener = (event, ...args) => callback(...args);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
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
    getApps: () => invokeWithCheck(IPC_CHANNELS.PAGE_PACKAGE_GET_APPS),
    addApp: (name) => invokeWithCheck(IPC_CHANNELS.PAGE_PACKAGE_ADD_APP, name),
    updateApp: (appId, name) => invokeWithCheck(IPC_CHANNELS.PAGE_PACKAGE_UPDATE_APP, appId, name),
    deleteApp: (appId) => invokeWithCheck(IPC_CHANNELS.PAGE_PACKAGE_DELETE_APP, appId),
    searchApps: (keyword) => invokeWithCheck(IPC_CHANNELS.PAGE_PACKAGE_SEARCH_APPS, keyword),

    // 页面管理
    getPages: (appId) => invokeWithCheck(IPC_CHANNELS.PAGE_PACKAGE_GET_PAGES, appId),
    addPage: (appId, name) => invokeWithCheck(IPC_CHANNELS.PAGE_PACKAGE_ADD_PAGE, appId, name),
    updatePage: (appId, pageId, name) => invokeWithCheck(IPC_CHANNELS.PAGE_PACKAGE_UPDATE_PAGE, appId, pageId, name),
    deletePage: (appId, pageId) => invokeWithCheck(IPC_CHANNELS.PAGE_PACKAGE_DELETE_PAGE, appId, pageId),
    searchPages: (appId, keyword) => invokeWithCheck(IPC_CHANNELS.PAGE_PACKAGE_SEARCH_PAGES, appId, keyword),

    // 元素管理
    getElements: (appId, pageId) => invokeWithCheck(IPC_CHANNELS.PAGE_PACKAGE_GET_ELEMENTS, appId, pageId),
    addElement: (appId, pageId, elementData) => invokeWithCheck(IPC_CHANNELS.PAGE_PACKAGE_ADD_ELEMENT, appId, pageId, elementData),
    updateElement: (appId, pageId, elementId, elementData) => invokeWithCheck(IPC_CHANNELS.PAGE_PACKAGE_UPDATE_ELEMENT, appId, pageId, elementId, elementData),
    deleteElement: (appId, pageId, elementId) => invokeWithCheck(IPC_CHANNELS.PAGE_PACKAGE_DELETE_ELEMENT, appId, pageId, elementId),
    searchElements: (appId, pageId, keyword) => invokeWithCheck(IPC_CHANNELS.PAGE_PACKAGE_SEARCH_ELEMENTS, appId, pageId, keyword),

    // 统计信息
    getAppStats: (appId) => invokeWithCheck(IPC_CHANNELS.PAGE_PACKAGE_GET_APP_STATS, appId),
    getPageStats: (appId, pageId) => invokeWithCheck(IPC_CHANNELS.PAGE_PACKAGE_GET_PAGE_STATS, appId, pageId)
  },

  // 测试用例管理（新版）
  testCase: {
    list: () => invokeWithCheck(IPC_CHANNELS.TEST_CASE_LIST),
    get: (fileName) => invokeWithCheck(IPC_CHANNELS.TEST_CASE_GET, fileName),
    save: (caseData) => invokeWithCheck(IPC_CHANNELS.TEST_CASE_SAVE, caseData),
    delete: (param) => invokeWithCheck(IPC_CHANNELS.TEST_CASE_DELETE, param),
    checkJsonExists: (fileName) => invokeWithCheck(IPC_CHANNELS.TEST_CASE_CHECK_JSON_EXISTS, fileName),
    batchCheckJsonExists: (fileNames) => invokeWithCheck(IPC_CHANNELS.TEST_CASE_BATCH_CHECK_JSON_EXISTS, fileNames),
    generatePython: (caseData, outputDir) => invokeWithCheck(IPC_CHANNELS.TEST_CASE_GENERATE_PYTHON, { caseData, outputDir }),
    saveAndGenerate: (caseData, outputDir) => invokeWithCheck(IPC_CHANNELS.TEST_CASE_SAVE_AND_GENERATE, { caseData, outputDir })
  },

  // APK解析
  apk: {
    parse: (apkPath) => invokeWithCheck(IPC_CHANNELS.APK_PARSE, apkPath)
  },

  // BLE设备发现
  bleDeviceDiscovery: {
    getDevices: () => invokeWithCheck(IPC_CHANNELS.BLE_DEVICE_DISCOVERY_GET_DEVICES),
    getDeviceDetail: (deviceId) => invokeWithCheck(IPC_CHANNELS.BLE_DEVICE_DISCOVERY_GET_DEVICE_DETAIL, deviceId)
  },

  inspector: {
    startSession: (deviceName, appPackage, appActivity, platformVersion, noReset) => invokeWithCheck(IPC_CHANNELS.INSPECTOR_START_SESSION, deviceName, appPackage, appActivity, platformVersion, noReset),
    getScreenshot: () => invokeWithCheck(IPC_CHANNELS.INSPECTOR_GET_SCREENSHOT),
    getPageSource: () => invokeWithCheck(IPC_CHANNELS.INSPECTOR_GET_PAGE_SOURCE),
    findElementLocators: (elementPath) => invokeWithCheck(IPC_CHANNELS.INSPECTOR_FIND_ELEMENT_LOCATORS, elementPath),
    refreshSession: () => invokeWithCheck(IPC_CHANNELS.INSPECTOR_REFRESH_SESSION),
    stopSession: () => invokeWithCheck(IPC_CHANNELS.INSPECTOR_STOP_SESSION),
    onProgress: (callback) => {
      const subscription = (event, stage) => callback(stage);
      ipcRenderer.on(IPC_CHANNELS.INSPECTOR_PROGRESS, subscription);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.INSPECTOR_PROGRESS, subscription);
    }
  },

  // 驱动安装
  installDriver: (installerPath) => invokeWithCheck(IPC_CHANNELS.INSTALL_DRIVER, installerPath),
  checkInstallerRunning: () => invokeWithCheck(IPC_CHANNELS.CHECK_INSTALLER_RUNNING),
  recheckCP210xDriver: () => invokeWithCheck(IPC_CHANNELS.RECHECK_CP210X_DRIVER),

  startChecks: () => invokeWithCheck(IPC_CHANNELS.START_CHECKS),
  splashReady: () => invokeWithCheck(IPC_CHANNELS.SPLASH_READY),

  setPreventSleep: (enable) => invokeWithCheck(IPC_CHANNELS.SET_PREVENT_SLEEP, enable),

  selectExportPath: (options) => invokeWithCheck(IPC_CHANNELS.SELECT_EXPORT_PATH, options),
  selectImportPath: () => invokeWithCheck(IPC_CHANNELS.SELECT_IMPORT_PATH),
  exportConfig: (outputPath) => invokeWithCheck(IPC_CHANNELS.EXPORT_CONFIG, outputPath),
  exportLogs: (outputPath) => invokeWithCheck(IPC_CHANNELS.EXPORT_LOGS, outputPath),
  importConfig: (zipPath) => invokeWithCheck(IPC_CHANNELS.IMPORT_CONFIG, zipPath),
  onExportProgress: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on(IPC_CHANNELS.ON_EXPORT_PROGRESS, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.ON_EXPORT_PROGRESS, listener);
  },
  onImportProgress: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on(IPC_CHANNELS.ON_IMPORT_PROGRESS, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.ON_IMPORT_PROGRESS, listener);
  }
});

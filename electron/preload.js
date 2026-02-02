const { contextBridge, ipcRenderer } = require('electron');

// 调试信息：确认preload.js已加载


// 暴露安全的API给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 文件操作
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  selectFile: () => ipcRenderer.invoke('select-file'),
  
  // 测试操作
  runPythonTests: (testConfig) => ipcRenderer.invoke('run-python-tests', testConfig),
  getTestPlans: () => ipcRenderer.invoke('get-test-plans'),
  saveTestPlan: (planData) => ipcRenderer.invoke('save-test-plan', planData),
  updateTestPlan: (planData) => ipcRenderer.invoke('update-test-plan', planData),
  deleteTestPlan: (planId) => ipcRenderer.invoke('delete-test-plan', planId),
  
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
  
  // Allure服务器管理
  stopAllureServer: () => ipcRenderer.invoke('stop-allure-server'),
  getAllureServerStatus: () => ipcRenderer.invoke('get-allure-server-status'),
  
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
  
  // 移除监听器
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});
const { contextBridge, ipcRenderer } = require('electron');

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
  
  // 移除监听器
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});
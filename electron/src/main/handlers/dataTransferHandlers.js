const { registerHandler } = require('./base/handlerUtils');
const { dialog } = require('electron');
const { getTimestamp } = require('../utils/pathHelper');
const { IPC_CHANNELS } = require('../../shared/constants');

function register(ipcMain, services) {
  const { electronApp, dataTransferService } = services;

  registerHandler(ipcMain, IPC_CHANNELS.SELECT_EXPORT_PATH, async (options) => {
    const type = options?.type || 'config';
    const timestamp = getTimestamp();
    const defaultName = type === 'logs'
      ? `XKAutoTester_Logs_${timestamp}.zip`
      : `XKAutoTester_Config_${timestamp}.zip`;

    const result = await dialog.showSaveDialog(electronApp.mainWindow, {
      title: type === 'logs' ? '导出日志' : '导出配置',
      defaultPath: defaultName,
      filters: [
        { name: 'ZIP Archive', extensions: ['zip'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    return result;
  });

  registerHandler(ipcMain, IPC_CHANNELS.SELECT_IMPORT_PATH, async () => {
    const result = await dialog.showOpenDialog(electronApp.mainWindow, {
      title: '导入配置',
      properties: ['openFile'],
      filters: [
        { name: 'ZIP Archive', extensions: ['zip'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    return result;
  });

  registerHandler(ipcMain, IPC_CHANNELS.EXPORT_CONFIG, async (outputPath) => {
    dataTransferService.setMainWindow(electronApp.mainWindow);
    return await dataTransferService.exportConfig(outputPath);
  });

  registerHandler(ipcMain, IPC_CHANNELS.EXPORT_LOGS, async (outputPath) => {
    dataTransferService.setMainWindow(electronApp.mainWindow);
    return await dataTransferService.exportLogs(outputPath);
  });

  registerHandler(ipcMain, IPC_CHANNELS.IMPORT_CONFIG, async (zipPath) => {
    dataTransferService.setMainWindow(electronApp.mainWindow);
    return await dataTransferService.importConfig(zipPath);
  });
}

module.exports = { register };

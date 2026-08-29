const { registerHandler } = require('./base/handlerUtils');
const { dialog } = require('electron');
const path = require('path');
const { getTimestamp } = require('../utils/pathHelper');
const { IPC_CHANNELS } = require('../../shared/constants');
const lastDialogPaths = require('./base/lastDialogPaths');

function register(ipcMain, services) {
  const { electronApp, dataTransferService } = services;

  // 文件选择器"上次选择路径"记忆
  lastDialogPaths.init(() => path.join(electronApp.userConfigPath, 'config.json'));

  registerHandler(ipcMain, IPC_CHANNELS.SELECT_EXPORT_PATH, async (options) => {
    const type = options?.type || 'config';
    const timestamp = getTimestamp();
    const defaultName = type === 'logs' ? `XKAutoTester_Logs_${timestamp}.zip` : `XKAutoTester_Config_${timestamp}.zip`;

    // 上次保存位置 (目录) + 本次文件名; 无记忆时保持原默认 (仅文件名, 系统默认目录)
    const rememberedDir = await lastDialogPaths.getDefaultPath(IPC_CHANNELS.SELECT_EXPORT_PATH);
    const defaultPath = rememberedDir ? path.join(rememberedDir, defaultName) : defaultName;

    const result = await dialog.showSaveDialog(electronApp.mainWindow, {
      title: type === 'logs' ? '导出日志' : '导出配置',
      defaultPath,
      filters: [
        { name: 'ZIP Archive', extensions: ['zip'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });

    if (!result.canceled && result.filePath) {
      await lastDialogPaths.rememberPath(IPC_CHANNELS.SELECT_EXPORT_PATH, result.filePath);
    }
    return result;
  });

  registerHandler(ipcMain, IPC_CHANNELS.SELECT_IMPORT_PATH, async () => {
    const defaultPath = await lastDialogPaths.getDefaultPath(IPC_CHANNELS.SELECT_IMPORT_PATH);
    const result = await dialog.showOpenDialog(electronApp.mainWindow, {
      title: '导入配置',
      properties: ['openFile'],
      filters: [
        { name: 'ZIP Archive', extensions: ['zip'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      ...(defaultPath ? { defaultPath } : {}),
    });

    if (!result.canceled && result.filePaths && result.filePaths[0]) {
      await lastDialogPaths.rememberPath(IPC_CHANNELS.SELECT_IMPORT_PATH, result.filePaths[0]);
    }
    return result;
  });

  registerHandler(ipcMain, IPC_CHANNELS.EXPORT_CONFIG, async (outputPath) => {
    // mainWindow 由 ElectronApp.createWindow 集中注入, handler 不再重复 setMainWindow
    return await dataTransferService.exportConfig(outputPath);
  });

  registerHandler(ipcMain, IPC_CHANNELS.EXPORT_LOGS, async (outputPath) => {
    return await dataTransferService.exportLogs(outputPath);
  });

  registerHandler(ipcMain, IPC_CHANNELS.IMPORT_CONFIG, async (zipPath) => {
    return await dataTransferService.importConfig(zipPath);
  });
}

module.exports = { register };

const { registerHandler } = require('./base/handlerUtils');
const { dialog } = require('electron');

function register(ipcMain, services) {
  const { electronApp, dataTransferService } = services;

  registerHandler(ipcMain, 'select-export-path', async (options) => {
    const type = options?.type || 'config';
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
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

  registerHandler(ipcMain, 'select-import-path', async () => {
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

  registerHandler(ipcMain, 'export-config', async (outputPath) => {
    dataTransferService.setMainWindow(electronApp.mainWindow);
    return await dataTransferService.exportConfig(outputPath);
  });

  registerHandler(ipcMain, 'export-logs', async (outputPath) => {
    dataTransferService.setMainWindow(electronApp.mainWindow);
    return await dataTransferService.exportLogs(outputPath);
  });

  registerHandler(ipcMain, 'import-config', async (zipPath) => {
    dataTransferService.setMainWindow(electronApp.mainWindow);
    return await dataTransferService.importConfig(zipPath);
  });
}

module.exports = { register };

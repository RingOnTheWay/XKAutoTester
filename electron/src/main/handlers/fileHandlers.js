const { dialog } = require('electron');

function register(ipcMain, services) {
  const { electronApp } = services;

  ipcMain.handle('select-directory', async () => {
    const result = await dialog.showOpenDialog(electronApp.mainWindow, {
      properties: ['openDirectory']
    });
    return result;
  });

  ipcMain.handle('select-file', async () => {
    const result = await dialog.showOpenDialog(electronApp.mainWindow, {
      properties: ['openFile'],
      filters: [
        { name: 'Python Files', extensions: ['py'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    return result;
  });

  ipcMain.handle('selectFiles', async () => {
    const result = await dialog.showOpenDialog(electronApp.mainWindow, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    return result;
  });

  ipcMain.handle('checkPathExists', async (event, pathToCheck) => {
    try {
      const fs = require('fs');
      return fs.existsSync(pathToCheck);
    } catch (error) {
      console.error('检查路径失败:', error);
      return false;
    }
  });

  ipcMain.handle('open-external', async (event, url) => {
    const { shell } = require('electron');
    await shell.openExternal(url);
  });
}

module.exports = { register };

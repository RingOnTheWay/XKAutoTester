function register(ipcMain, services) {
  const { electronApp } = services;

  ipcMain.handle('window-minimize', () => {
    if (electronApp.mainWindow) {
      electronApp.mainWindow.minimize();
    }
  });

  ipcMain.handle('window-maximize', () => {
    if (electronApp.mainWindow) {
      if (electronApp.mainWindow.isMaximized()) {
        electronApp.mainWindow.unmaximize();
      } else {
        electronApp.mainWindow.maximize();
      }
      return electronApp.mainWindow.isMaximized();
    }
    return false;
  });

  ipcMain.handle('window-close', () => {
    if (electronApp.mainWindow) {
      electronApp.mainWindow.close();
    }
  });

  ipcMain.handle('window-is-maximized', () => {
    if (electronApp.mainWindow) {
      return electronApp.mainWindow.isMaximized();
    }
    return false;
  });
}

module.exports = { register };

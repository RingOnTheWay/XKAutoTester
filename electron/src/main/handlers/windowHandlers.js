const { registerHandler } = require('./base/handlerUtils');

function register(ipcMain, services) {
  const { electronApp } = services;
  let dragStartPos = null;
  let winStartPos = null;

  registerHandler(ipcMain, 'window-minimize', () => {
    if (electronApp.mainWindow) {
      electronApp.mainWindow.minimize();
    }
  });

  registerHandler(ipcMain, 'window-maximize', () => {
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

  registerHandler(ipcMain, 'window-close', () => {
    if (electronApp.mainWindow) {
      electronApp.mainWindow.close();
    }
  });

  registerHandler(ipcMain, 'window-is-maximized', () => {
    if (electronApp.mainWindow) {
      return electronApp.mainWindow.isMaximized();
    }
    return false;
  });

  registerHandler(ipcMain, 'window-set-ignore-mouse-events', (ignore, options, windowType) => {
    const targetWindow = windowType === 'splash' ? electronApp.splashWindow : electronApp.mainWindow;
    if (targetWindow) {
      targetWindow.setIgnoreMouseEvents(ignore, options);
      return true;
    }
    return false;
  });

  ipcMain.on('window-drag-start', (event, mouseX, mouseY) => {
    if (electronApp.mainWindow && !electronApp.mainWindow.isMaximized()) {
      dragStartPos = { x: mouseX, y: mouseY };
      winStartPos = electronApp.mainWindow.getPosition();
    }
  });

  ipcMain.on('window-drag-move', (event, mouseX, mouseY) => {
    if (electronApp.mainWindow && dragStartPos && winStartPos) {
      const deltaX = mouseX - dragStartPos.x;
      const deltaY = mouseY - dragStartPos.y;
      const newX = winStartPos[0] + deltaX;
      const newY = winStartPos[1] + deltaY;
      electronApp.mainWindow.setPosition(newX, newY);
    }
  });

  ipcMain.on('window-drag-end', () => {
    dragStartPos = null;
    winStartPos = null;
  });
}

module.exports = { register };

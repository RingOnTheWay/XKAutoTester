const { registerHandler, assertTrustedSender } = require('./base/handlerUtils');
const { IPC_CHANNELS } = require('../../shared/constants');

function register(ipcMain, services) {
  const { electronApp } = services;
  let dragStartPos = null;
  let winStartPos = null;

  registerHandler(ipcMain, IPC_CHANNELS.WINDOW_MINIMIZE, () => {
    if (electronApp.mainWindow) {
      electronApp.mainWindow.minimize();
    }
  });

  registerHandler(ipcMain, IPC_CHANNELS.WINDOW_MAXIMIZE, () => {
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

  registerHandler(ipcMain, IPC_CHANNELS.WINDOW_CLOSE, () => {
    if (electronApp.mainWindow) {
      electronApp.mainWindow.close();
    }
  });

  registerHandler(ipcMain, IPC_CHANNELS.WINDOW_IS_MAXIMIZED, () => {
    if (electronApp.mainWindow) {
      return electronApp.mainWindow.isMaximized();
    }
    return false;
  });

  registerHandler(ipcMain, IPC_CHANNELS.WINDOW_SET_IGNORE_MOUSE_EVENTS, (ignore, options, windowType) => {
    const targetWindow = windowType === 'splash' ? electronApp.splashWindow : electronApp.mainWindow;
    if (targetWindow) {
      targetWindow.setIgnoreMouseEvents(ignore, options);
      return true;
    }
    return false;
  });

  ipcMain.on(IPC_CHANNELS.WINDOW_DRAG_START, (event, mouseX, mouseY) => {
    try {
      assertTrustedSender(event); // P0-3 补全: on 通道同样校验 sender
      if (electronApp.mainWindow && !electronApp.mainWindow.isMaximized()) {
        dragStartPos = { x: mouseX, y: mouseY };
        winStartPos = electronApp.mainWindow.getPosition();
      }
    } catch (error) {
      console.error(`IPC handler error [${IPC_CHANNELS.WINDOW_DRAG_START}]:`, error);
    }
  });

  ipcMain.on(IPC_CHANNELS.WINDOW_DRAG_MOVE, (event, mouseX, mouseY) => {
    try {
      assertTrustedSender(event); // P0-3 补全: on 通道同样校验 sender
      if (electronApp.mainWindow && dragStartPos && winStartPos) {
        const deltaX = mouseX - dragStartPos.x;
        const deltaY = mouseY - dragStartPos.y;
        const newX = winStartPos[0] + deltaX;
        const newY = winStartPos[1] + deltaY;
        electronApp.mainWindow.setPosition(newX, newY);
      }
    } catch (error) {
      console.error(`IPC handler error [${IPC_CHANNELS.WINDOW_DRAG_MOVE}]:`, error);
    }
  });

  ipcMain.on(IPC_CHANNELS.WINDOW_DRAG_END, (event) => {
    try {
      assertTrustedSender(event); // P0-3 补全: on 通道同样校验 sender
      dragStartPos = null;
      winStartPos = null;
    } catch (error) {
      console.error(`IPC handler error [${IPC_CHANNELS.WINDOW_DRAG_END}]:`, error);
    }
  });
}

module.exports = { register };

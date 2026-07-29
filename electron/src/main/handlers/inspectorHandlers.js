const { registerHandlers } = require('./base/handlerUtils');
const { IPC_CHANNELS } = require('../../shared/constants');

function register(ipcMain, services) {
  const { inspectorService, electronApp } = services;

  inspectorService.setProgressCallback((stage) => {
    const mainWindow = electronApp?.mainWindow;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.INSPECTOR_PROGRESS, stage);
    }
  });

  registerHandlers(ipcMain, {
    [IPC_CHANNELS.INSPECTOR_START_SESSION]: (deviceName, appPackage, appActivity, platformVersion, noReset) => inspectorService.startSession(deviceName, appPackage, appActivity, platformVersion, noReset),
    [IPC_CHANNELS.INSPECTOR_GET_SCREENSHOT]: () => inspectorService.getScreenshot(),
    [IPC_CHANNELS.INSPECTOR_GET_PAGE_SOURCE]: () => inspectorService.getPageSource(),
    [IPC_CHANNELS.INSPECTOR_FIND_ELEMENT_LOCATORS]: (elementPath) => inspectorService.findElementLocators(elementPath),
    [IPC_CHANNELS.INSPECTOR_REFRESH_SESSION]: () => inspectorService.refreshSession(),
    [IPC_CHANNELS.INSPECTOR_STOP_SESSION]: () => inspectorService.stopSession()
  });
}

module.exports = { register };

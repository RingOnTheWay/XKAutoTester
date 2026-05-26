const { registerHandlers } = require('./base/handlerUtils');

function register(ipcMain, services) {
  const { inspectorService, electronApp } = services;

  inspectorService.setProgressCallback((stage) => {
    const mainWindow = electronApp?.mainWindow;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('inspector:progress', stage);
    }
  });

  registerHandlers(ipcMain, {
    'inspector:start-session': (deviceName, appPackage, appActivity, platformVersion, noReset) => inspectorService.startSession(deviceName, appPackage, appActivity, platformVersion, noReset),
    'inspector:get-screenshot': () => inspectorService.getScreenshot(),
    'inspector:get-page-source': () => inspectorService.getPageSource(),
    'inspector:find-element-locators': (elementPath) => inspectorService.findElementLocators(elementPath),
    'inspector:refresh-session': () => inspectorService.refreshSession(),
    'inspector:stop-session': () => inspectorService.stopSession()
  });
}

module.exports = { register };

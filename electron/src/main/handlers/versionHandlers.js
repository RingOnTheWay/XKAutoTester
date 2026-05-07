const { registerHandler } = require('./base/handlerUtils');

function register(ipcMain, services) {
  const { versionService } = services;

  registerHandler(ipcMain, 'get-version-info', () => versionService.getVersionInfo());
  registerHandler(ipcMain, 'get-version', () => versionService.getVersion());
  registerHandler(ipcMain, 'get-display-version', () => versionService.getDisplayVersion());
}

module.exports = { register };

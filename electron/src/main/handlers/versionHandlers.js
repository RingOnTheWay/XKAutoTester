const { registerHandler } = require('./base/handlerUtils');
const { IPC_CHANNELS } = require('../../shared/constants');

function register(ipcMain, services) {
  const { versionService } = services;

  registerHandler(ipcMain, IPC_CHANNELS.GET_VERSION_INFO, () => versionService.getVersionInfo());
  registerHandler(ipcMain, IPC_CHANNELS.GET_VERSION, () => versionService.getVersion());
  registerHandler(ipcMain, IPC_CHANNELS.GET_DISPLAY_VERSION, () => versionService.getDisplayVersion());
}

module.exports = { register };

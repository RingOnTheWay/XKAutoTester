const { registerHandler } = require('./base/handlerUtils');
const { IPC_CHANNELS } = require('../../shared/constants');

function register(ipcMain, services) {
  const { environmentStartupService } = services;

  // 6 IPC 通道 → 6 service 方法 (1-liner 薄映射)
  registerHandler(ipcMain, IPC_CHANNELS.START_CHECKS, () => environmentStartupService.handleStartChecks());
  registerHandler(ipcMain, IPC_CHANNELS.SPLASH_READY, () => environmentStartupService.handleSplashReady());
  registerHandler(ipcMain, IPC_CHANNELS.INSTALL_DRIVER, (installerPath) =>
    environmentStartupService.handleInstallDriver(installerPath)
  );
  registerHandler(ipcMain, IPC_CHANNELS.CHECK_INSTALLER_RUNNING, () =>
    environmentStartupService.handleCheckInstallerRunning()
  );
  registerHandler(ipcMain, IPC_CHANNELS.RECHECK_CP210X_DRIVER, () =>
    environmentStartupService.handleRecheckCp210xDriver()
  );
  registerHandler(ipcMain, IPC_CHANNELS.GET_SERIAL_PORTS, () => environmentStartupService.handleGetSerialPorts());
}

module.exports = { register };

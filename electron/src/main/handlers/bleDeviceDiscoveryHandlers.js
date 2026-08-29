const { registerHandlers } = require('./base/handlerUtils');
const { IPC_CHANNELS } = require('../../shared/constants');

function register(ipcMain, services) {
  const { bleDeviceDiscoveryService } = services;

  registerHandlers(ipcMain, {
    [IPC_CHANNELS.BLE_DEVICE_DISCOVERY_GET_DEVICES]: () => bleDeviceDiscoveryService.getDevices(),
    [IPC_CHANNELS.BLE_DEVICE_DISCOVERY_GET_DEVICE_DETAIL]: (deviceId) =>
      bleDeviceDiscoveryService.getDeviceDetail(deviceId),
  });
}

module.exports = { register };

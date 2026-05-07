const { registerHandlers } = require('./base/handlerUtils');

function register(ipcMain, services) {
  const { bleDeviceDiscoveryService } = services;

  registerHandlers(ipcMain, {
    'ble-device-discovery:get-devices': () => bleDeviceDiscoveryService.getDevices(),
    'ble-device-discovery:get-device-detail': (deviceId) => bleDeviceDiscoveryService.getDeviceDetail(deviceId)
  });
}

module.exports = { register };

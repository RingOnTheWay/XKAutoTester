const windowHandlers = require('./windowHandlers');
const fileHandlers = require('./fileHandlers');
const testPlanHandlers = require('./testPlanHandlers');
const scheduledPlanHandlers = require('./scheduledPlanHandlers');
const deviceHandlers = require('./deviceHandlers');
const reportHandlers = require('./reportHandlers');
const configHandlers = require('./configHandlers');
const environmentHandlers = require('./environmentHandlers');
const pagePackageHandlers = require('./pagePackageHandlers');
const bleDeviceDiscoveryHandlers = require('./bleDeviceDiscoveryHandlers');
const testCaseHandlers = require('./testCaseHandlers');
const apkHandlers = require('./apkHandlers');
const adbHandlers = require('./adbHandlers');
const versionHandlers = require('./versionHandlers');
const updateHandlers = require('./updateHandlers');
const powerHandlers = require('./powerHandlers');
const inspectorHandlers = require('./inspectorHandlers');

function registerAllHandlers(ipcMain, services) {
  windowHandlers.register(ipcMain, services);
  fileHandlers.register(ipcMain, services);
  testPlanHandlers.register(ipcMain, services);
  scheduledPlanHandlers.register(ipcMain, services);
  deviceHandlers.register(ipcMain, services);
  reportHandlers.register(ipcMain, services);
  configHandlers.register(ipcMain, services);
  environmentHandlers.register(ipcMain, services);
  pagePackageHandlers.register(ipcMain, services);
  bleDeviceDiscoveryHandlers.register(ipcMain, services);
  testCaseHandlers.register(ipcMain, services);
  apkHandlers.register(ipcMain, services);
  adbHandlers.register(ipcMain, services);
  versionHandlers.register(ipcMain, services);
  updateHandlers.register(ipcMain, services);
  powerHandlers.register(ipcMain, services);
  inspectorHandlers.register(ipcMain, services);
}

module.exports = { registerAllHandlers };

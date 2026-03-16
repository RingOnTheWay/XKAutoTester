const windowHandlers = require('./windowHandlers');
const fileHandlers = require('./fileHandlers');
const testPlanHandlers = require('./testPlanHandlers');
const scheduledPlanHandlers = require('./scheduledPlanHandlers');
const deviceHandlers = require('./deviceHandlers');
const reportHandlers = require('./reportHandlers');
const configHandlers = require('./configHandlers');
const environmentHandlers = require('./environmentHandlers');

function registerAllHandlers(ipcMain, services) {
  windowHandlers.register(ipcMain, services);
  fileHandlers.register(ipcMain, services);
  testPlanHandlers.register(ipcMain, services);
  scheduledPlanHandlers.register(ipcMain, services);
  deviceHandlers.register(ipcMain, services);
  reportHandlers.register(ipcMain, services);
  configHandlers.register(ipcMain, services);
  environmentHandlers.register(ipcMain, services);
}

module.exports = { registerAllHandlers };

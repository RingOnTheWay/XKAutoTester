const { registerHandler } = require('./base/handlerUtils');
const { powerSaveBlocker } = require('electron');

let sleepBlockerId = null;

function register(ipcMain, services) {
  registerHandler(ipcMain, 'set-prevent-sleep', (enable) => {
    if (enable) {
      if (sleepBlockerId === null) {
        sleepBlockerId = powerSaveBlocker.start('prevent-display-sleep');
      }
    } else {
      if (sleepBlockerId !== null) {
        powerSaveBlocker.stop(sleepBlockerId);
        sleepBlockerId = null;
      }
    }
    return { success: true };
  });
}

function startPreventSleep() {
  if (sleepBlockerId === null) {
    sleepBlockerId = powerSaveBlocker.start('prevent-display-sleep');
  }
}

module.exports = { register, startPreventSleep };

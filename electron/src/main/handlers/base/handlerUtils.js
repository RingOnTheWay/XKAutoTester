function registerHandler(ipcMain, channel, handler) {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await handler(...args);
    } catch (error) {
      console.error(`IPC handler error [${channel}]:`, error);
      return { success: false, error: error.message };
    }
  });
}

function registerHandlers(ipcMain, handlers) {
  Object.entries(handlers).forEach(([channel, handler]) => {
    registerHandler(ipcMain, channel, handler);
  });
}

module.exports = { registerHandler, registerHandlers };

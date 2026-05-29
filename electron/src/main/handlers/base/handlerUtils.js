function registerHandler(ipcMain, channel, handler, options = {}) {
  const { withEvent = false } = options;

  ipcMain.handle(channel, async (event, ...args) => {
    try {
      if (withEvent) {
        return await handler(...args, event);
      }
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

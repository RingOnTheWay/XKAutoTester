// 测试 IPC fake - 模拟 ipcMain/ipcRenderer 调用链
// 记录 invoke 调用，返回预设响应，支持 handler 注册

class IpcFake {
  constructor() {
    this.handlers = new Map();      // channel → handler (ipcMain.handle)
    this.onHandlers = new Map();    // channel → handler[] (ipcMain.on)
    this.invokeLog = [];             // invoke 调用日志
    this.sendLog = [];               // send 调用日志
  }

  // 模拟 ipcMain.handle(channel, handler)
  handle(channel, handler) {
    this.handlers.set(channel, handler);
  }

  // 模拟 ipcMain.on(channel, handler) - 不返回值
  on(channel, handler) {
    if (!this.onHandlers.has(channel)) {
      this.onHandlers.set(channel, []);
    }
    this.onHandlers.get(channel).push(handler);
  }

  // 模拟 ipcRenderer.invoke(channel, ...args)
  async invoke(channel, ...args) {
    this.invokeLog.push({ channel, args, time: Date.now() });
    const handler = this.handlers.get(channel);
    if (handler) {
      // handler 签名: (event, ...args) - 提供最小 event mock
      const event = { sender: { send: (evt, ...rest) => this.sendLog.push({ channel: evt, args: rest }) } };
      return await handler(event, ...args);
    }
    return { success: false, error: `channel not mocked: ${channel}` };
  }

  // 模拟 ipcRenderer.send(channel, ...args) - 触发 ipcMain.on handler
  send(channel, ...args) {
    this.sendLog.push({ channel, args, time: Date.now() });
    const handlers = this.onHandlers.get(channel);
    if (handlers) {
      const event = { sender: { send: (evt, ...rest) => this.sendLog.push({ channel: evt, args: rest }) } };
      handlers.forEach(h => h(event, ...args));
    }
  }

  // 查询 invoke 调用
  getCalls(channel) {
    return this.invokeLog.filter(c => c.channel === channel);
  }

  // 查询 send 调用
  getSends(channel) {
    return this.sendLog.filter(c => c.channel === channel);
  }

  // 触发 on-handler (用于测试 ipcMain.on 注册的 handler)
  triggerOn(channel, ...args) {
    const handlers = this.onHandlers.get(channel);
    if (handlers) {
      const event = { sender: { send: (evt, ...rest) => this.sendLog.push({ channel: evt, args: rest }) } };
      handlers.forEach(h => h(event, ...args));
    }
  }

  // 重置所有状态
  reset() {
    this.handlers.clear();
    this.onHandlers.clear();
    this.invokeLog = [];
    this.sendLog = [];
  }
}

module.exports = { IpcFake };

// Handler 测试 harness - 加载 handler 模块并注入 mock service + fake ipc
// 配合 XKAutoTester 的 handler 注册模式: module.exports = { register(ipcMain, services) }

const { IpcFake } = require('./ipcFake');
const { createServiceContainer } = require('./serviceMock');

/**
 * 创建 handler 测试 harness
 * @param {string} handlerPath - handler 模块绝对路径
 * @param {Object} serviceSpec - { serviceName: { methodName: returnValue } }
 * @returns {Promise<{ ipc: IpcFake, services: Object, handlerModule: Object }>}
 *
 * @example
 * const { ipc, services } = await createHandlerTestHarness(
 *   require.resolve('../electron/src/main/handlers/testPlanHandlers.js'),
 *   { testPlanService: { getTestPlans: { success: true, data: [] } } }
 * );
 * const result = await ipc.invoke('get-test-plans');
 * services.testPlanService.__calls.getTestPlans.length === 1;
 */
async function createHandlerTestHarness(handlerPath, serviceSpec = {}) {
  const ipc = new IpcFake();
  const services = createServiceContainer(serviceSpec);

  // 清除 require cache 确保每次新建 harness 都重新加载
  delete require.cache[require.resolve(handlerPath)];

  const handlerModule = require(handlerPath);
  if (typeof handlerModule.register !== 'function') {
    throw new Error(`Handler 模块 ${handlerPath} 必须导出 register(ipcMain, services) 函数`);
  }

  handlerModule.register(ipc, services);

  return { ipc, services, handlerModule };
}

module.exports = { createHandlerTestHarness };

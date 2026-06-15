/**
 * ApiBridge - 声明式 electronAPI 绑定
 * 将 IPC 调用从业务逻辑中解耦，提供声明式 API 绑定和 IPC 事件监听
 */
export class ApiBridge {
  static #api = null;

  /**
   * 获取 electronAPI 引用（延迟初始化）
   */
  static get api() {
    if (!this.#api) {
      this.#api = window.electronAPI;
    }
    return this.#api;
  }

  /**
   * 声明式 API 方法绑定
   * @param {Object} specs - 方法映射 { localName: 'api.path.to.method' }
   * @returns {Object} 绑定后的方法集合
   *
   * @example
   * const api = ApiBridge.bind({
   *   getPlans: 'testPlan.getTestPlans',
   *   savePlan: 'testPlan.saveTestPlan',
   *   runTests: 'runPythonTests',
   * });
   * const plans = await api.getPlans();
   */
  static bind(specs) {
    const bound = {};
    for (const [key, path] of Object.entries(specs)) {
      bound[key] = async (...args) => {
        const fn = path.split('.').reduce((obj, k) => obj?.[k], this.api);
        if (!fn) {
          throw new Error(`ApiBridge: API not found: ${path}`);
        }
        return fn(...args);
      };
    }
    return bound;
  }

  /**
   * 声明式 IPC 事件监听
   * @param {Object} eventMap - 事件映射 { eventName: handler }
   * @returns {Function} 取消所有监听的函数
   *
   * @example
   * const unlisten = ApiBridge.listen({
   *   'test-output': (text) => console.log(text),
   *   'test-error': (text) => console.error(text),
   * });
   * // 清理: unlisten();
   */
  static listen(eventMap) {
    const unsubscribers = [];
    for (const [event, handler] of Object.entries(eventMap)) {
      // 事件名转换: 'test-output' -> 'onTestOutput'
      const methodName = `on${event.charAt(0).toUpperCase()}${event.slice(1)}`;
      // 将连字符形式转为驼峰: 'test-output' -> 'onTestOutput'
      const camelName = methodName.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      const fn = this.api[camelName];
      if (fn) {
        fn(handler);
        unsubscribers.push(() => {
          // IPC 事件监听器通常不支持移除，记录以便未来扩展
        });
      }
    }
    return () => unsubscribers.forEach(fn => fn());
  }

  /**
   * 直接调用 API 方法
   * @param {string} path - API 路径，如 'testPlan.getTestPlans'
   * @param  {...any} args - 参数
   * @returns {Promise<any>}
   */
  static async call(path, ...args) {
    const fn = path.split('.').reduce((obj, k) => obj?.[k], this.api);
    if (!fn) {
      throw new Error(`ApiBridge: API not found: ${path}`);
    }
    return fn(...args);
  }
}

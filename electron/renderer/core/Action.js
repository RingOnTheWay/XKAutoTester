/**
 * Action - 声明式 DOM 事件绑定
 * 将 DOM 事件绑定从 Controller 中解耦，提供声明式批量绑定
 */
export class Action {
  /**
   * 声明式批量绑定 DOM 事件
   * @param {Object} bindings - 选择器到处理函数的映射 { selector: handler }
   * @param {Object} [options] - 配置选项
   * @param {string} [options.eventType='click'] - 事件类型
   * @param {boolean} [options.passive=false] - 是否被动监听
   * @returns {Function} 取消所有绑定的函数
   *
   * @example
   * const unbind = Action.bindAll({
   *   '#run-btn': () => controller.handleRun(),
   *   '#stop-btn': () => controller.handleStop(),
   *   '#new-plan-btn': () => controller.showNewPlanModal(),
   * });
   * // 清理: unbind();
   */
  static bindAll(bindings, options = {}) {
    const cleanups = [];
    const eventType = options.eventType || 'click';

    for (const [selector, handler] of Object.entries(bindings)) {
      const el = document.querySelector(selector);
      if (!el) {
        console.warn(`Action.bindAll: element not found: ${selector}`);
        continue;
      }

      el.addEventListener(eventType, handler, { passive: !!options.passive });
      cleanups.push(() => el.removeEventListener(eventType, handler));
    }

    return () => cleanups.forEach(fn => fn());
  }

  /**
   * 绑定单个 DOM 事件
   * @param {string} selector - CSS 选择器
   * @param {string} eventType - 事件类型
   * @param {Function} handler - 处理函数
   * @returns {Function} 取消绑定函数
   */
  static bind(selector, eventType, handler) {
    const el = document.querySelector(selector);
    if (!el) {
      console.warn(`Action.bind: element not found: ${selector}`);
      return () => {};
    }
    el.addEventListener(eventType, handler);
    return () => el.removeEventListener(eventType, handler);
  }

  /**
   * 声明式批量绑定带确认的事件
   * @param {Object} bindings - 选择器到 { handler, confirm } 的映射
   * @returns {Function} 取消所有绑定的函数
   */
  static bindWithConfirm(bindings) {
    const cleanups = [];

    for (const [selector, { handler, confirm: confirmMsg }] of Object.entries(bindings)) {
      const el = document.querySelector(selector);
      if (!el) {
        console.warn(`Action.bindWithConfirm: element not found: ${selector}`);
        continue;
      }

      const wrappedHandler = () => {
        if (confirmMsg && !window.confirm(confirmMsg)) return;
        handler();
      };
      el.addEventListener('click', wrappedHandler);
      cleanups.push(() => el.removeEventListener('click', wrappedHandler));
    }

    return () => cleanups.forEach(fn => fn());
  }
}

/**
 * EventEmitter - 事件系统基类
 * 提供显式的 on/off/emit 事件机制，用于 Model -> View 通信
 */
export class EventEmitter {
  #listeners = new Map();
  // M1 修复: once wrapper 映射表, 支持 off(原始 fn) 时正确移除 wrapper
  // 结构: event → Map<originalFn, wrapper>
  #onceWrappers = new Map();

  /**
   * 注册事件监听器
   * @param {string} event - 事件名
   * @param {Function} fn - 回调函数
   * @returns {Function} 取消订阅函数
   */
  on(event, fn) {
    if (!this.#listeners.has(event)) {
      this.#listeners.set(event, new Set());
    }
    this.#listeners.get(event).add(fn);
    return () => {
      this.off(event, fn);
    };
  }

  /**
   * 注册一次性事件监听器
   * M1 修复: 维护 originalFn → wrapper 映射, off(event, 原始fn) 时能正确找到并删除 wrapper
   * @param {string} event - 事件名
   * @param {Function} fn - 回调函数
   * @returns {Function} 取消订阅函数
   */
  once(event, fn) {
    const wrapper = (...args) => {
      this._removeOnceWrapper(event, fn);
      fn(...args);
    };
    if (!this.#onceWrappers.has(event)) {
      this.#onceWrappers.set(event, new Map());
    }
    this.#onceWrappers.get(event).set(fn, wrapper);
    return this.on(event, wrapper);
  }

  /**
   * 移除 once wrapper 映射 (内部使用)
   */
  _removeOnceWrapper(event, originalFn) {
    const wrapper = this.#onceWrappers.get(event)?.get(originalFn);
    if (wrapper) {
      this.#listeners.get(event)?.delete(wrapper);
      this.#onceWrappers.get(event).delete(originalFn);
    }
  }

  /**
   * 移除事件监听器
   * M1 修复: 若 fn 是 once 注册的原始函数, 通过映射表找到并删除对应 wrapper
   * @param {string} event - 事件名
   * @param {Function} fn - 回调函数 (可能是 on 直接注册的, 也可能是 once 的原始函数)
   */
  off(event, fn) {
    // 先尝试 once wrapper 映射
    const wrapperMap = this.#onceWrappers.get(event);
    if (wrapperMap && wrapperMap.has(fn)) {
      const wrapper = wrapperMap.get(fn);
      this.#listeners.get(event)?.delete(wrapper);
      wrapperMap.delete(fn);
      return;
    }
    // 否则按普通监听器删除
    this.#listeners.get(event)?.delete(fn);
  }

  /**
   * 触发事件
   * @param {string} event - 事件名
   * @param  {...any} args - 传递给回调的参数
   */
  emit(event, ...args) {
    const listeners = this.#listeners.get(event);
    if (listeners) {
      listeners.forEach((fn) => {
        try {
          fn(...args);
        } catch (err) {
          console.error(`EventEmitter emit error [${event}]:`, err);
        }
      });
    }
  }

  /**
   * 移除指定事件的所有监听器，或移除所有事件的所有监听器
   * M1 修复: 同步清理 onceWrappers 映射表
   * @param {string} [event] - 事件名，不传则清除所有
   */
  removeAllListeners(event) {
    if (event) {
      this.#listeners.delete(event);
      this.#onceWrappers.delete(event);
    } else {
      this.#listeners.clear();
      this.#onceWrappers.clear();
    }
  }
}

/**
 * EventEmitter - 事件系统基类
 * 提供显式的 on/off/emit 事件机制，用于 Model -> View 通信
 */
export class EventEmitter {
  #listeners = new Map();

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
      this.#listeners.get(event)?.delete(fn);
    };
  }

  /**
   * 注册一次性事件监听器
   * @param {string} event - 事件名
   * @param {Function} fn - 回调函数
   * @returns {Function} 取消订阅函数
   */
  once(event, fn) {
    const wrapper = (...args) => {
      this.off(event, wrapper);
      fn(...args);
    };
    return this.on(event, wrapper);
  }

  /**
   * 移除事件监听器
   * @param {string} event - 事件名
   * @param {Function} fn - 回调函数
   */
  off(event, fn) {
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
      listeners.forEach(fn => {
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
   * @param {string} [event] - 事件名，不传则清除所有
   */
  removeAllListeners(event) {
    if (event) {
      this.#listeners.delete(event);
    } else {
      this.#listeners.clear();
    }
  }
}

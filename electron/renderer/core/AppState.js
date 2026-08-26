import { EventEmitter } from './EventEmitter.js';

/**
 * AppState - 跨 Tab 共享状态管理
 * 单例模式，提供跨 Tab 的状态共享和变更通知
 */
export class AppState extends EventEmitter {
  static #instance;

  static get instance() {
    if (!this.#instance) {
      this.#instance = new AppState();
    }
    return this.#instance;
  }

  #state = {
    config: null,
    selectedDevice: null,
    isRunning: false,
    locale: 'zh-CN',
    i18n: null,
  };

  /**
   * 获取状态值 (P2-8: 对象/数组返回浅拷贝, 防跨 Tab 拿到内部引用后原地修改,
   * 绕过 set/batchUpdate 的变更检测。文档约定: 返回值只读, 修改请走 set)
   * @param {string} key - 状态键名
   * @returns {*} 状态值
   */
  get(key) {
    const value = this.#state[key];
    if (value !== null && typeof value === 'object') {
      return Array.isArray(value) ? [...value] : { ...value };
    }
    return value;
  }

  /**
   * 设置状态值，值变化时自动触发 `${key}-changed` 事件
   * @param {string} key - 状态键名
   * @param {*} value - 新值
   */
  set(key, value) {
    const old = this.#state[key];
    if (old === value) return;
    this.#state[key] = value;
    this.emit(`${key}-changed`, value, old);
  }

  /**
   * 获取完整状态快照
   * @returns {Object} 状态副本
   */
  snapshot() {
    return { ...this.#state };
  }

  /**
   * 批量更新状态
   * @param {Object} updates - 键值对
   */
  batchUpdate(updates) {
    const changed = [];
    for (const [key, value] of Object.entries(updates)) {
      if (this.#state[key] !== value) {
        const old = this.#state[key];
        this.#state[key] = value;
        changed.push({ key, value, old });
      }
    }
    // 批量触发事件
    for (const { key, value, old } of changed) {
      this.emit(`${key}-changed`, value, old);
    }
  }
}

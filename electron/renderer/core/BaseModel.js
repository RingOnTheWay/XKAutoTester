import { EventEmitter } from './EventEmitter.js';

/**
 * BaseModel - 渲染层 Model 公共基类
 *
 * 职责（R26 架构深化, 候选②）:
 * - 状态容器: #state 私有, 子类经 get/set 访问, 不再各写各的 #state/#set 样板
 * - 变更事件: set(key, value, event) 相等短路, 默认事件名 `${key}-changed`
 * - 错误单一归口: emitError 落实 ADR-0011 契约 —— model 层错误一律
 *   emit('error'), controller 单点渲染 toast; 方法返回值只做流程控制
 * - 生命周期: destroy() 清空监听
 *
 * 注意: #state 是本类私有字段, 子类不可直接访问, 一律走 get/set —— 这也是
 * 刻意的设计: 状态读写必经事件面, 便于回归测试断言。
 */
export class BaseModel extends EventEmitter {
  /** @type {Record<string, any>} */
  #state;

  /**
   * @param {Record<string, any>} initialState - 初始状态（浅拷贝, 不与调用方共享引用）
   */
  constructor(initialState = {}) {
    super();
    this.#state = { ...initialState };
  }

  /**
   * 读状态
   * @param {string} key
   * @returns {any}
   */
  get(key) {
    return this.#state[key];
  }

  /**
   * 写状态 + 发变更事件。旧值 === 新值时短路不发。
   * @param {string} key
   * @param {any} value
   * @param {string} [event] - 自定义事件名, 缺省 `${key}-changed`
   * @returns {boolean} 是否发生了变更（即是否发了事件）
   */
  set(key, value, event) {
    const old = this.#state[key];
    if (old === value) return false;
    this.#state[key] = value;
    this.emit(event ?? `${key}-changed`, value, old);
    return true;
  }

  /**
   * 强写状态: 不做相等短路（引用语义状态每次都要发事件的场景,
   * 如 notification 配置对象重建后强制刷新）。
   */
  forceSet(key, value, event) {
    const old = this.#state[key];
    this.#state[key] = value;
    this.emit(event ?? `${key}-changed`, value, old);
  }

  /**
   * 静默写: 只写状态不发事件。
   * 用于"下游由其他事件通知"的场景 (如 page-package 删除后 UI 由
   * delete-success 驱动, 再发 selected-*-changed 反而触发旧 reset collapse)。
   * 文档化用例应注释原因, 滥用会绕过变更事件面。
   */
  silentSet(key, value) {
    this.#state[key] = value;
  }

  /**
   * 错误单一归口 (ADR-0011): model 层所有 catch 在此发 'error',
   * controller 统一订阅渲染 toast。
   * @param {string} source - 出错的方法名（供 controller 映射 i18n 键）
   * @param {Error|any} error
   * @param {Record<string, any>} [extra] - 附加字段（如 code / statusCode）
   */
  emitError(source, error, extra = {}) {
    this.emit('error', { source, error, ...extra });
  }

  /**
   * 生命周期收尾: 清空所有监听。子类覆写时必须 super.destroy()。
   */
  destroy() {
    this.removeAllListeners();
  }
}

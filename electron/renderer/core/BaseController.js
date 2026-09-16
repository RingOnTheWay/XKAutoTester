import { createBindings } from './utils/bindings.js';

/**
 * BaseController - 渲染层 Controller 公共基类
 *
 * 职责（R26 架构深化, 候选②）:
 * - 统一生命周期词汇: init() 模板方法 = bindModelEvents + bindDomEvents + onReady,
 *   子类覆写钩子而非各自手写 init 样板
 * - 统一解绑容器: #unbinds (DOM/全局) 与 #unbindModel (model 事件订阅) 双容器,
 *   destroy() 一次收口 —— 沿用既有 createBindings 机制
 * - 统一订阅入口: onModel(event, handler) 自动登记解绑
 *
 * 子类约定:
 * - 覆写 bindModelEvents() / bindDomEvents() / async onReady()
 * - DOM 绑定经 view 的 bind*ById 辅助并 push 进 bindElement()（登记解绑）
 * - 不直接操作 DOM（ADR-0008: view helper 保留, controller 不越层）
 */
export class BaseController {
  #model;
  #view;
  #unbinds = createBindings();
  #unbindModel = createBindings();
  #destroyed = false;

  /**
   * @param {import('./BaseModel.js').BaseModel} model
   * @param {object} view
   */
  constructor(model, view) {
    this.#model = model;
    this.#view = view;
  }

  get model() {
    return this.#model;
  }

  get view() {
    return this.#view;
  }

  get destroyed() {
    return this.#destroyed;
  }

  /**
   * 初始化模板方法。子类不要覆写 init, 覆写三个钩子。
   */
  async init() {
    this.bindModelEvents();
    this.bindDomEvents();
    await this.onReady();
  }

  /** 钩子: model 事件 → view 渲染订阅 */
  bindModelEvents() {}

  /** 钩子: DOM 事件 → model 方法绑定 */
  bindDomEvents() {}

  /** 钩子: 绑定完成后的异步收尾（如首屏加载） */
  async onReady() {}

  /**
   * 订阅 model 事件并自动登记解绑
   * @returns {Function} 取消订阅函数
   */
  onModel(event, handler) {
    const unsub = this.#model.on(event, handler);
    this.#unbindModel.push(unsub);
    return unsub;
  }

  /**
   * 登记 DOM/全局解绑动作（view bind* 辅助的返回值）
   * @param {Function} unsub
   */
  bindElement(unsub) {
    this.#unbinds.push(unsub);
  }

  /**
   * 生命周期收尾: 解绑全部 DOM/订阅 + model.destroy。
   * 子类覆写时必须 super.destroy()。
   */
  destroy() {
    this.#destroyed = true;
    this.#unbinds.run();
    this.#unbindModel.run();
    this.#model?.destroy?.();
  }
}

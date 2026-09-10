/**
 * createBindings - controller 生命周期绑定注册薄工厂
 *
 * 统一 5 个 tab controller 的清理词汇 (原 #unbinds/#unbindModel/#cleanups 三种各自表述):
 * - push(fn) — 注册任意解绑函数 (兼容原数组 push 调用形态, 渐进迁移)
 * - listen(el, event, handler) — DOM 事件绑定, 解绑自动配对 (消除手动 removeEventListener 成对样板)
 * - run() — destroy 时统一执行并清空
 *
 * 刻意保持薄 (不订阅、不自动追踪): 深抽象见 ADR-0008 教训 (renderer helper 极致统一 = 过度工程)。
 * @returns {{size: number, push: (fn: Function) => Function, listen: (el: EventTarget, event: string, handler: Function, options?: Object) => void, run: () => void}}
 */
export function createBindings() {
  const fns = [];

  return {
    /** 当前注册的解绑回调数 (断言/防重检查用) */
    get size() {
      return fns.length;
    },

    push(fn) {
      fns.push(fn);
      return fn;
    },

    listen(el, event, handler, options) {
      el.addEventListener(event, handler, options);
      fns.push(() => el.removeEventListener(event, handler, options));
    },

    run() {
      const copy = fns.splice(0);
      for (const fn of copy) {
        try {
          fn();
        } catch (e) {
          // 单个解绑失败不阻断其余清理
          console.warn('[bindings] 解绑回调异常:', e);
        }
      }
    },
  };
}

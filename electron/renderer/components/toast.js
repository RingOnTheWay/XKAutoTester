/**
 * Toast组件 - 可复用的消息提示组件
 * 支持多种展示类型、自定义依附容器、位置配置
 */
export class ToastManager {
  constructor() {
    this.containers = new Map();
    this.activeToasts = new Set();
    // ADR-0011 通知去重: 文本即 key, 同文本 toast 展示期内复用 (调用方无防重义务)
    this.activeToastKeys = new Map();
    this.defaultOptions = {
      type: 'info',
      duration: 3000,
      position: 'top-right',
      container: null,
    };
  }

  /**
   * 显示Toast消息
   * @param {string} message - 显示文本
   * @param {string} type - 展示类型: 'success' | 'error' | 'warning' | 'info'
   * @param {object} options - 可选配置
   * @param {HTMLElement} options.container - 依附容器，默认为body
   * @param {string} options.position - 位置: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'center'
   * @param {number} options.duration - 显示时长(ms)
   */
  show(message, type = 'info', options = {}) {
    const config = { ...this.defaultOptions, ...options, type };
    const container = this.getOrCreateContainer(config.container, config.position);

    // 通知去重: 同文本已有展示中的 toast → 复用 (重置计时), 连发只显一个
    // (fade-out 退场中的 toast 不复用, 走新建)
    const dedupKey = `${config.type}:${message}`;
    const existing = this.activeToastKeys.get(dedupKey);
    if (existing && existing.parentNode && !existing.classList.contains('fade-out')) {
      clearTimeout(parseInt(existing.dataset.timeoutId));
      const timeoutId = setTimeout(() => {
        this.removeToast(existing, config.container);
      }, config.duration);
      existing.dataset.timeoutId = timeoutId;
      return existing;
    }

    const toast = document.createElement('div');
    toast.className = `toast ${config.type}`;
    toast.textContent = message;
    toast.dataset.dedupKey = dedupKey;

    container.appendChild(toast);
    this.activeToasts.add(toast);
    this.activeToastKeys.set(dedupKey, toast);

    const timeoutId = setTimeout(() => {
      this.removeToast(toast, config.container);
    }, config.duration);

    toast.dataset.timeoutId = timeoutId;

    return toast;
  }

  removeToast(toast, container) {
    if (!toast.parentNode) {
      this.activeToasts.delete(toast);
      this.#deleteToastKey(toast);
      return;
    }

    toast.classList.add('fade-out');
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
      this.activeToasts.delete(toast);
      this.#deleteToastKey(toast);

      const containerKey = this.getContainerKey(container);
      const toastContainer = this.containers.get(containerKey);
      if (toastContainer && toastContainer.children.length === 0 && toastContainer.dataset.container !== 'default') {
        toastContainer.remove();
        this.containers.delete(containerKey);
      }
    }, 300);
  }

  /**
   * 清除所有Toast消息
   */
  clearAll() {
    this.activeToasts.forEach((toast) => {
      const timeoutId = toast.dataset.timeoutId;
      if (timeoutId) {
        clearTimeout(parseInt(timeoutId));
      }
      if (toast.parentNode) {
        toast.classList.add('fade-out');
        setTimeout(() => {
          if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
          }
        }, 300);
      }
    });
    this.activeToasts.clear();
    this.activeToastKeys.clear();
    const keysToDelete = [];
    this.containers.forEach((container, key) => {
      if (container.dataset.container !== 'default') {
        container.remove();
        keysToDelete.push(key);
      } else {
        container.innerHTML = '';
      }
    });

    // 删除已移除的容器引用
    keysToDelete.forEach((key) => {
      this.containers.delete(key);
    });

    const defaultContainer = document.getElementById('toast-container');
    if (defaultContainer) {
      defaultContainer.innerHTML = '';
    }
  }

  getOrCreateContainer(parentContainer, position) {
    if (!parentContainer) {
      let defaultContainer = document.getElementById('toast-container');
      if (!defaultContainer) {
        defaultContainer = document.createElement('div');
        defaultContainer.id = 'toast-container';
        defaultContainer.className = `toast-container ${position}`;
        defaultContainer.dataset.container = 'default';
        const appContainer = document.getElementById('app');
        appContainer.appendChild(defaultContainer);
      }
      return defaultContainer;
    }

    const key = this.getContainerKey(parentContainer);
    let container = this.containers.get(key);

    if (!container) {
      container = document.createElement('div');
      container.className = `toast-container ${position}`;
      container.dataset.container = 'custom';
      parentContainer.appendChild(container);
      this.containers.set(key, container);
    }

    return container;
  }

  /**
   * 清除 toast 在去重索引中的条目 (toast 移除时调用)
   */
  #deleteToastKey(toast) {
    const key = toast.dataset?.dedupKey;
    if (key && this.activeToastKeys.get(key) === toast) {
      this.activeToastKeys.delete(key);
    }
  }

  getContainerKey(container) {
    if (!container) return 'default';
    return container.id || container.className || `container-${Date.now()}`;
  }

  success(message, options = {}) {
    return this.show(message, 'success', options);
  }

  error(message, options = {}) {
    return this.show(message, 'error', options);
  }

  warning(message, options = {}) {
    return this.show(message, 'warning', options);
  }

  info(message, options = {}) {
    return this.show(message, 'info', options);
  }
}

export const Toast = new ToastManager();

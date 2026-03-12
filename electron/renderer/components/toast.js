/**
 * Toast组件 - 可复用的消息提示组件
 * 支持多种展示类型、自定义依附容器、位置配置
 */
class ToastManager {
    constructor() {
        this.containers = new Map();
        this.defaultOptions = {
            type: 'info',
            duration: 3000,
            position: 'top-right',
            container: null
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
        
        const toast = document.createElement('div');
        toast.className = `toast ${config.type}`;
        toast.textContent = message;
        
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.classList.add('fade-out');
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
                if (container.children.length === 0 && container.dataset.container !== 'default') {
                    container.remove();
                    this.containers.delete(this.getContainerKey(config.container));
                }
            }, 300);
        }, config.duration);
        
        return toast;
    }

    getOrCreateContainer(parentContainer, position) {
        if (!parentContainer) {
            let defaultContainer = document.getElementById('toast-container');
            if (!defaultContainer) {
                defaultContainer = document.createElement('div');
                defaultContainer.id = 'toast-container';
                defaultContainer.className = `toast-container ${position}`;
                defaultContainer.dataset.container = 'default';
                const appContainer = document.querySelector('main.main-content') || document.querySelector('.left-panel') || document.getElementById('app') || document.body;
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

const Toast = new ToastManager();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Toast;
}

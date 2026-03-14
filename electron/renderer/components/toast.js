/**
 * Toast组件 - 可复用的消息提示组件
 * 支持多种展示类型、自定义依附容器、位置配置
 */
class ToastManager {
    constructor() {
        this.containers = new Map();
        this.activeToasts = new Set();
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
        this.activeToasts.add(toast);
        
        const timeoutId = setTimeout(() => {
            this.removeToast(toast, config.container);
        }, config.duration);
        
        toast.dataset.timeoutId = timeoutId;
        
        return toast;
    }
    
    removeToast(toast, container) {
        if (!toast.parentNode) {
            this.activeToasts.delete(toast);
            return;
        }
        
        toast.classList.add('fade-out');
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
            this.activeToasts.delete(toast);
            
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
        this.activeToasts.forEach(toast => {
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
        
        // 收集需要删除的key，避免在遍历中修改Map
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
        keysToDelete.forEach(key => {
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

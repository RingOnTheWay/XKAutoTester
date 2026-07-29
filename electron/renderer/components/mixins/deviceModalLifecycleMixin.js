/**
 * DeviceModalLifecycleMixin - DeviceSelectionModal 会话生命周期与按钮事件处理。
 *
 * Extracted from device-selection-modal.js via Object.assign prototype composition.
 * NOTE: original private methods (#xxx) were converted to public so they can be
 * assigned to the prototype. Original private fields (#xxx) remain private in the
 * class body; accessors (get/set) are added for cross-mixin read/write.
 */
import { Toast } from '../toast.js';

export const deviceModalLifecycleMixin = {
    /**
     * 为本次会话绑定确认/取消/关闭按钮
     * 使用 cloneNode 移除旧监听，再绑定新监听
     */
    bindSessionButtons() {
        // 确认按钮
        if (this.confirmBtn) {
            const newConfirm = this.confirmBtn.cloneNode(true);
            this.confirmBtn.parentNode.replaceChild(newConfirm, this.confirmBtn);
            this.confirmBtn = newConfirm;
            this.boundConfirm = () => this.handleConfirm();
            this.confirmBtn.addEventListener('click', this.boundConfirm);
        }

        // 取消按钮
        if (this.cancelBtn) {
            const newCancel = this.cancelBtn.cloneNode(true);
            this.cancelBtn.parentNode.replaceChild(newCancel, this.cancelBtn);
            this.cancelBtn = newCancel;
            this.boundCancel = () => this.handleCancel();
            this.cancelBtn.addEventListener('click', this.boundCancel);
        }

        // 关闭按钮
        if (this.closeBtn) {
            const newClose = this.closeBtn.cloneNode(true);
            this.closeBtn.parentNode.replaceChild(newClose, this.closeBtn);
            this.closeBtn = newClose;
            this.boundClose = () => this.handleCancel();
            this.closeBtn.addEventListener('click', this.boundClose);
        }

        // 开放5555端口按钮
        if (this.openPortBtn) {
            const newOpenPort = this.openPortBtn.cloneNode(true);
            this.openPortBtn.parentNode.replaceChild(newOpenPort, this.openPortBtn);
            this.openPortBtn = newOpenPort;
            this.boundOpenPort = () => this.openPort5555();
            this.openPortBtn.addEventListener('click', this.boundOpenPort);
        }
    },

    // ---- 确认选择 ----
    handleConfirm() {
        const selectedElement = document.querySelector('.device-item.selected');
        if (!selectedElement) {
            const modalContainer = document.querySelector('#device-modal-overlay .modal-container');
            Toast.error(window.i18n.t('testExecution.deviceSelection.deviceRequired'), { container: modalContainer });
            return;
        }

        const deviceId = selectedElement.getAttribute('data-device-id');

        // test 模式：额外获取 android 版本
        if (this.mode === 'test') {
            this.getAndroidVersionForTest(deviceId);
        }

        // 先保存 resolve 引用，#cleanup 会将 this.#resolve 设为 null
        const resolve = this.resolve;
        this.cleanup();
        resolve(deviceId);
    },

    // ---- 取消/关闭 ----
    handleCancel() {
        // 取消按钮在 IP 输入页时，先返回设备列表
        const addDeviceInputContainer = document.getElementById('add-device-input-container');
        const deviceListElement = document.getElementById('device-list');

        if (addDeviceInputContainer && !addDeviceInputContainer.classList.contains('hidden')) {
            this.hideAddDeviceInput();
            return;
        }

        // 先保存 reject 引用，#cleanup 会将 this.#reject 设为 null
        const reject = this.reject;
        this.cleanup();
        reject(new Error('cancelled'));
    },

    // ---- 清理状态并关闭模态框 ----
    cleanup() {
        this.stopDeviceRefresh();

        // inspector 模式：恢复 z-index
        if (this.mode === 'inspector' && this.originalZIndex !== null) {
            this.overlay.style.zIndex = this.originalZIndex;
            this.originalZIndex = null;
        }

        // 关闭模态框
        const modal = window.__XKAT_MODALS__?.device;
        if (modal) modal.close();

        // 清理选中状态
        this.hideAddDeviceInput();
        const deviceListElement = document.getElementById('device-list');
        if (deviceListElement) {
            const selectedEl = deviceListElement.querySelector('.device-item.selected');
            if (selectedEl) {
                selectedEl.classList.remove('selected');
                selectedEl.style.backgroundColor = '';
            }
        }

        // 重置内部状态
        this.modalSelectedDeviceId = null;
        this.currentDeviceList = [];
        this.resolve = null;
        this.reject = null;
        this.mode = null;
    },

    // ---- test 模式：获取 Android 版本 ----
    async getAndroidVersionForTest(deviceId) {
        try {
            // wrapper 已在 success=false 时抛错，无需再判断
            const result = await window.electronAPI.executeAdbCommand('getprop ro.build.version.release', deviceId);
            // 存储到实例属性供后续使用
            this.androidVersion = result.output.trim();
        } catch {
            this.androidVersion = null;
        }
    },
};

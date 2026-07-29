/**
 * DeviceModalDeviceInfoMixin - DeviceSelectionModal 设备状态卡片信息查询与渲染。
 *
 * Extracted from device-selection-modal.js via Object.assign prototype composition.
 * NOTE: original private methods (#xxx) were converted to public so they can be
 * assigned to the prototype. Original private fields (#xxx) remain private in the
 * class body; accessors (get/set) are added for cross-mixin read/write.
 */

export const deviceModalDeviceInfoMixin = {
    // ==================== 设备信息 ====================

    async getDeviceInfo(deviceId) {
        try {
            // 显示加载动画
            const loadingElement = document.getElementById('modal-device-loading');
            const contentElement = document.getElementById('modal-device-info-content');
            if (loadingElement) loadingElement.style.display = 'flex';
            if (contentElement) contentElement.style.display = 'none';

            this.resetDeviceStatusCard();

            // 查询设备状态，未授权/离线时直接显示提示文案
            const devices = await this.getConnectedDevices();
            const device = devices.find(d => d.id === deviceId);
            const status = device?.status || 'unknown';

            if (status !== 'device') {
                const tipKey = status === 'unauthorized' ? 'deviceModal.unauthorizedTip'
                             : status === 'offline' ? 'deviceModal.offlineTip'
                             : 'deviceModal.unavailableTip';
                const tip = (window.i18n && window.i18n.t(tipKey)) || 'Device unavailable';

                const manufacturerElement = document.getElementById('modal-device-manufacturer');
                if (manufacturerElement) manufacturerElement.textContent = tip;
                const modelElement = document.getElementById('modal-device-model');
                if (modelElement) modelElement.textContent = tip;
                const androidVersionElement = document.getElementById('modal-device-android-version');
                if (androidVersionElement) androidVersionElement.textContent = tip;

                if (loadingElement) loadingElement.style.display = 'none';
                if (contentElement) contentElement.style.display = 'flex';
                return;
            }

            // 制造商
            // wrapper 已在 success=false 时抛错，失败时由外层 catch 接
            const manufacturerResult = await window.electronAPI.executeAdbCommand('getprop ro.product.manufacturer', deviceId);
            const manufacturer = manufacturerResult.output.trim() || '-';

            // 型号
            const modelResult = await window.electronAPI.executeAdbCommand('getprop ro.product.model', deviceId);
            const model = modelResult.output.trim() || '-';

            // Android版本
            const androidVersionResult = await window.electronAPI.executeAdbCommand('getprop ro.build.version.release', deviceId);
            const androidVersion = androidVersionResult.output.trim() || '-';

            // 更新UI
            const manufacturerElement = document.getElementById('modal-device-manufacturer');
            if (manufacturerElement) manufacturerElement.textContent = manufacturer;

            const modelElement = document.getElementById('modal-device-model');
            if (modelElement) modelElement.textContent = model;

            const androidVersionElement = document.getElementById('modal-device-android-version');
            if (androidVersionElement) androidVersionElement.textContent = androidVersion;

            // 隐藏加载，显示内容
            if (loadingElement) loadingElement.style.display = 'none';
            if (contentElement) contentElement.style.display = 'flex';
        } catch (error) {
            console.error('获取设备信息失败:', error);
            const loadingElement = document.getElementById('modal-device-loading');
            const contentElement = document.getElementById('modal-device-info-content');
            if (loadingElement) loadingElement.style.display = 'none';
            if (contentElement) contentElement.style.display = 'flex';
        }
    },

    resetDeviceStatusCard() {
        const elements = [
            'modal-device-manufacturer',
            'modal-device-model',
            'modal-device-android-version'
        ];
        elements.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = '-';
        });
    },
};

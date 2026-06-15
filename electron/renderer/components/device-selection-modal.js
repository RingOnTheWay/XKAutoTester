/**
 * DeviceSelectionModal - 设备选择模态框组件
 * Promise-based API，支持 select / test / inspector 三种模式
 */
class DeviceSelectionModal {
    // ---- 私有状态 ----
    #resolve = null;
    #reject = null;
    #mode = null;
    #modalSelectedDeviceId = null;
    #deviceRefreshTimer = null;
    #currentDeviceList = [];
    #isDeviceRefreshing = false;
    #originalZIndex = null;
    #androidVersion = null;

    // ---- DOM 缓存 ----
    #overlay = null;
    #confirmBtn = null;
    #cancelBtn = null;
    #closeBtn = null;
    #openPortBtn = null;

    // ---- 事件处理器引用（便于卸载） ----
    #boundConfirm = null;
    #boundCancel = null;
    #boundClose = null;
    #boundOpenPort = null;

    constructor() {
        this.#cacheDom();
    }

    // ==================== 公开 API ====================

    /**
     * 显示设备选择模态框，返回 Promise<string>（deviceId）
     * @param {{ mode: 'select' | 'test' | 'inspector' }} options
     * @returns {Promise<string>}
     */
    show({ mode = 'select' } = {}) {
        return new Promise((resolve, reject) => {
            this.#resolve = resolve;
            this.#reject = reject;
            this.#mode = mode;

            // inspector 模式：提升 z-index
            if (mode === 'inspector') {
                this.#originalZIndex = this.#overlay.style.zIndex || '';
                this.#overlay.style.zIndex = '1500';
            }

            // 打开模态框
            const modal = window.__XKAT_MODALS__?.device;
            if (modal) modal.open();

            // 扫描状态
            this.#showDeviceScanningState();

            // 扫描设备
            this.#scanDevices().then(() => {
                this.#startDeviceRefresh();
            });

            // 绑定按钮
            this.#bindSessionButtons();
        });
    }

    // ==================== 内部方法 ====================

    #cacheDom() {
        this.#overlay = document.getElementById('device-modal-overlay');
        this.#confirmBtn = document.getElementById('device-modal-confirm-btn');
        this.#cancelBtn = document.getElementById('device-modal-cancel-btn');
        this.#closeBtn = document.getElementById('device-modal-close-btn');
        this.#openPortBtn = document.getElementById('open-port-btn');
    }

    /**
     * 为本次会话绑定确认/取消/关闭按钮
     * 使用 cloneNode 移除旧监听，再绑定新监听
     */
    #bindSessionButtons() {
        // 确认按钮
        if (this.#confirmBtn) {
            const newConfirm = this.#confirmBtn.cloneNode(true);
            this.#confirmBtn.parentNode.replaceChild(newConfirm, this.#confirmBtn);
            this.#confirmBtn = newConfirm;
            this.#boundConfirm = () => this.#handleConfirm();
            this.#confirmBtn.addEventListener('click', this.#boundConfirm);
        }

        // 取消按钮
        if (this.#cancelBtn) {
            const newCancel = this.#cancelBtn.cloneNode(true);
            this.#cancelBtn.parentNode.replaceChild(newCancel, this.#cancelBtn);
            this.#cancelBtn = newCancel;
            this.#boundCancel = () => this.#handleCancel();
            this.#cancelBtn.addEventListener('click', this.#boundCancel);
        }

        // 关闭按钮
        if (this.#closeBtn) {
            const newClose = this.#closeBtn.cloneNode(true);
            this.#closeBtn.parentNode.replaceChild(newClose, this.#closeBtn);
            this.#closeBtn = newClose;
            this.#boundClose = () => this.#handleCancel();
            this.#closeBtn.addEventListener('click', this.#boundClose);
        }

        // 开放5555端口按钮
        if (this.#openPortBtn) {
            const newOpenPort = this.#openPortBtn.cloneNode(true);
            this.#openPortBtn.parentNode.replaceChild(newOpenPort, this.#openPortBtn);
            this.#openPortBtn = newOpenPort;
            this.#boundOpenPort = () => this.#openPort5555();
            this.#openPortBtn.addEventListener('click', this.#boundOpenPort);
        }
    }

    // ---- 确认选择 ----
    #handleConfirm() {
        const selectedElement = document.querySelector('.device-item.selected');
        if (!selectedElement) {
            const modalContainer = document.querySelector('#device-modal-overlay .modal-container');
            Toast.error(window.i18n.t('testExecution.deviceSelection.deviceRequired'), { container: modalContainer });
            return;
        }

        const deviceId = selectedElement.getAttribute('data-device-id');

        // test 模式：额外获取 android 版本
        if (this.#mode === 'test') {
            this.#getAndroidVersionForTest(deviceId);
        }

        // 先保存 resolve 引用，#cleanup 会将 this.#resolve 设为 null
        const resolve = this.#resolve;
        this.#cleanup();
        resolve(deviceId);
    }

    // ---- 取消/关闭 ----
    #handleCancel() {
        // 取消按钮在 IP 输入页时，先返回设备列表
        const addDeviceInputContainer = document.getElementById('add-device-input-container');
        const deviceListElement = document.getElementById('device-list');

        if (addDeviceInputContainer && !addDeviceInputContainer.classList.contains('hidden')) {
            this.#hideAddDeviceInput();
            return;
        }

        // 先保存 reject 引用，#cleanup 会将 this.#reject 设为 null
        const reject = this.#reject;
        this.#cleanup();
        reject(new Error('cancelled'));
    }

    // ---- 清理状态并关闭模态框 ----
    #cleanup() {
        this.#stopDeviceRefresh();

        // inspector 模式：恢复 z-index
        if (this.#mode === 'inspector' && this.#originalZIndex !== null) {
            this.#overlay.style.zIndex = this.#originalZIndex;
            this.#originalZIndex = null;
        }

        // 关闭模态框
        const modal = window.__XKAT_MODALS__?.device;
        if (modal) modal.close();

        // 清理选中状态
        this.#hideAddDeviceInput();
        const deviceListElement = document.getElementById('device-list');
        if (deviceListElement) {
            const selectedEl = deviceListElement.querySelector('.device-item.selected');
            if (selectedEl) {
                selectedEl.classList.remove('selected');
                selectedEl.style.backgroundColor = '';
            }
        }

        // 重置内部状态
        this.#modalSelectedDeviceId = null;
        this.#currentDeviceList = [];
        this.#resolve = null;
        this.#reject = null;
        this.#mode = null;
    }

    // ---- test 模式：获取 Android 版本 ----
    async #getAndroidVersionForTest(deviceId) {
        try {
            const result = await window.electronAPI.executeAdbCommand('getprop ro.build.version.release', deviceId);
            if (result.success) {
                // 存储到实例属性供后续使用
                this.#androidVersion = result.output.trim();
            }
        } catch {
            this.#androidVersion = null;
        }
    }

    // ==================== 设备扫描与刷新 ====================

    async #scanDevices() {
        try {
            const devices = await this.#getConnectedDevices();
            this.#displayDevices(devices);
        } catch (error) {
            console.error('扫描设备失败:', error);
            this.#displayDevices([]);
        }
    }

    async #getConnectedDevices() {
        try {
            if (window.electronAPI && window.electronAPI.getConnectedDevices) {
                return await window.electronAPI.getConnectedDevices();
            }
        } catch (error) {
            console.error('获取设备列表失败:', error);
        }
        return [];
    }

    #startDeviceRefresh() {
        this.#stopDeviceRefresh();
        this.#deviceRefreshTimer = setInterval(() => {
            this.#refreshDeviceList();
        }, 2000);
    }

    #stopDeviceRefresh() {
        if (this.#deviceRefreshTimer) {
            clearInterval(this.#deviceRefreshTimer);
            this.#deviceRefreshTimer = null;
        }
    }

    async #refreshDeviceList() {
        if (this.#isDeviceRefreshing) return;
        this.#isDeviceRefreshing = true;

        try {
            const newDevices = await this.#getConnectedDevices();
            const oldSet = new Set(this.#currentDeviceList);
            const newSet = new Set(newDevices);

            const added = newDevices.filter(d => !oldSet.has(d));
            const removed = this.#currentDeviceList.filter(d => !newSet.has(d));
            const unchanged = this.#currentDeviceList.filter(d => newSet.has(d));

            if (added.length === 0 && removed.length === 0) {
                this.#isDeviceRefreshing = false;
                return;
            }

            const orderedDevices = [...added, ...unchanged];
            this.#currentDeviceList = [...orderedDevices];

            const deviceListElement = document.getElementById('device-list');
            if (!deviceListElement) {
                this.#isDeviceRefreshing = false;
                return;
            }

            // 移除已断开的设备
            removed.forEach(deviceId => {
                const el = deviceListElement.querySelector(`.device-item[data-device-id="${deviceId}"]`);
                if (el) el.remove();
            });

            // 新增设备插入到列表顶部
            for (let i = added.length - 1; i >= 0; i--) {
                const deviceElement = this.#createDeviceItemElement(added[i]);
                // 插入到 add-device-btn 之前
                const addBtn = deviceListElement.querySelector('#add-device-btn');
                if (addBtn) {
                    deviceListElement.insertBefore(deviceElement, addBtn);
                } else {
                    deviceListElement.prepend(deviceElement);
                }
            }

            // 选中设备被移除时重置状态
            if (this.#modalSelectedDeviceId && removed.includes(this.#modalSelectedDeviceId)) {
                this.#modalSelectedDeviceId = null;
                if (this.#confirmBtn) this.#confirmBtn.disabled = true;
                if (this.#openPortBtn) this.#openPortBtn.disabled = true;
                const deviceStatusCard = document.getElementById('modal-device-status-card');
                if (deviceStatusCard) deviceStatusCard.classList.add('hidden');
            }
        } catch (error) {
            console.error('刷新设备列表失败:', error);
        } finally {
            this.#isDeviceRefreshing = false;
        }
    }

    // ==================== 设备列表渲染 ====================

    #showDeviceScanningState() {
        const scanningElement = document.getElementById('device-scanning');
        const deviceListElement = document.getElementById('device-list');
        const noDevicesElement = document.getElementById('no-devices');
        const addDeviceInputContainer = document.getElementById('add-device-input-container');
        const deviceStatusCard = document.getElementById('modal-device-status-card');

        if (scanningElement) scanningElement.classList.remove('hidden');
        if (deviceListElement) deviceListElement.classList.add('hidden');
        if (noDevicesElement) noDevicesElement.classList.add('hidden');
        if (addDeviceInputContainer) addDeviceInputContainer.classList.add('hidden');
        if (deviceStatusCard) deviceStatusCard.classList.add('hidden');
        if (this.#confirmBtn) this.#confirmBtn.disabled = true;
        if (this.#openPortBtn) this.#openPortBtn.disabled = true;
    }

    #displayDevices(devices) {
        const scanningElement = document.getElementById('device-scanning');
        const deviceListElement = document.getElementById('device-list');
        const noDevicesElement = document.getElementById('no-devices');
        const addDeviceInputContainer = document.getElementById('add-device-input-container');
        const deviceStatusCard = document.getElementById('modal-device-status-card');

        if (scanningElement) scanningElement.classList.add('hidden');
        if (addDeviceInputContainer) addDeviceInputContainer.classList.add('hidden');
        if (deviceStatusCard) deviceStatusCard.classList.add('hidden');

        // 初始禁用按钮
        if (this.#confirmBtn) this.#confirmBtn.disabled = true;
        if (this.#openPortBtn) this.#openPortBtn.disabled = true;

        if (deviceListElement) {
            deviceListElement.classList.remove('hidden');
            deviceListElement.innerHTML = '';

            // 渲染设备项
            devices.forEach(device => {
                const deviceElement = this.#createDeviceItemElement(device);
                deviceListElement.appendChild(deviceElement);
            });

            // 新增设备按钮
            const addDeviceButton = document.createElement('div');
            addDeviceButton.id = 'add-device-btn';
            addDeviceButton.className = 'device-item add-device-btn';
            addDeviceButton.style.cssText = 'padding:8px 12px;border-radius:4px;cursor:pointer;transition:background-color 0.2s;display:flex;align-items:center;justify-content:space-between;';
            const iconHtml = window.__XKAT_APP__?.getIconHtml?.bind(window.__XKAT_APP__);
            addDeviceButton.innerHTML = `
                <div style="display:flex;align-items:center;">
                    ${iconHtml ? iconHtml('add', 'vertical-align:middle;margin-right:8px;') : ''}
                    <span style="vertical-align:middle;">${window.i18n.t('deviceModal.addDevice')}</span>
                </div>
                ${iconHtml ? iconHtml('keyboard_arrow_right', 'vertical-align:middle;') : ''}
            `;
            addDeviceButton.addEventListener('mouseenter', () => {
                addDeviceButton.style.backgroundColor = 'rgba(0,0,0,0.05)';
            });
            addDeviceButton.addEventListener('mouseleave', () => {
                addDeviceButton.style.backgroundColor = '';
            });
            addDeviceButton.addEventListener('click', () => {
                this.#showAddDeviceInput();
            });
            deviceListElement.appendChild(addDeviceButton);

            // 恢复选中状态
            if (this.#modalSelectedDeviceId) {
                const deviceToSelect = deviceListElement.querySelector(`.device-item[data-device-id="${this.#modalSelectedDeviceId}"]`);
                if (deviceToSelect) {
                    deviceToSelect.classList.add('selected');
                    const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();
                    deviceToSelect.style.backgroundColor = `${primaryColor}20`;
                    if (this.#confirmBtn) this.#confirmBtn.disabled = false;
                    if (this.#openPortBtn) {
                        this.#openPortBtn.disabled = this.#modalSelectedDeviceId.includes(':');
                    }
                    if (deviceStatusCard) deviceStatusCard.classList.remove('hidden');
                    this.#getDeviceInfo(this.#modalSelectedDeviceId);
                }
            }
        }

        if (noDevicesElement) noDevicesElement.classList.add('hidden');
        this.#currentDeviceList = [...devices];
    }

    #createDeviceItemElement(device) {
        const deviceElement = document.createElement('div');
        deviceElement.className = 'device-item';
        deviceElement.setAttribute('data-device-id', device);
        deviceElement.style.cssText = 'padding:8px 12px;border-radius:4px;cursor:pointer;transition:background-color 0.2s;display:flex;align-items:flex-start;';

        const icon = device.includes(':') ? 'wifi' : 'usb';
        const iconHtml = window.__XKAT_APP__?.getIconHtml?.bind(window.__XKAT_APP__);

        deviceElement.innerHTML = `
            ${iconHtml ? iconHtml(icon, 'vertical-align:top;margin-right:8px;flex-shrink:0;margin-top:2px;') : ''}
            <span style="vertical-align:top;flex:1;min-width:0;word-wrap:break-word;overflow-wrap:break-word;white-space:normal;">${device}</span>
        `;

        // 悬停效果
        deviceElement.addEventListener('mouseenter', () => {
            if (!deviceElement.classList.contains('selected')) {
                deviceElement.style.backgroundColor = 'rgba(0,0,0,0.05)';
            }
        });
        deviceElement.addEventListener('mouseleave', () => {
            if (!deviceElement.classList.contains('selected')) {
                deviceElement.style.backgroundColor = '';
            }
        });

        // 点击选中
        deviceElement.addEventListener('click', () => {
            // 取消其他选中
            document.querySelectorAll('.device-item.selected').forEach(item => {
                item.classList.remove('selected');
                item.style.backgroundColor = '';
            });

            deviceElement.classList.add('selected');
            this.#modalSelectedDeviceId = device;
            const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();
            deviceElement.style.backgroundColor = `${primaryColor}20`;

            // 启用按钮
            if (this.#confirmBtn) this.#confirmBtn.disabled = false;
            if (this.#openPortBtn) {
                this.#openPortBtn.disabled = device.includes(':');
            }

            // 显示设备信息卡片
            const deviceStatusCard = document.getElementById('modal-device-status-card');
            if (deviceStatusCard) deviceStatusCard.classList.remove('hidden');

            this.#getDeviceInfo(device);
        });

        // 恢复选中状态
        if (this.#modalSelectedDeviceId === device) {
            deviceElement.classList.add('selected');
            const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();
            deviceElement.style.backgroundColor = `${primaryColor}20`;
        }

        return deviceElement;
    }

    // ==================== 新增设备（IP连接） ====================

    #showAddDeviceInput() {
        // 取消当前选中
        document.querySelectorAll('.device-item.selected').forEach(item => {
            item.classList.remove('selected');
            item.style.backgroundColor = '';
        });
        this.#modalSelectedDeviceId = null;

        // 禁用按钮
        if (this.#confirmBtn) this.#confirmBtn.disabled = true;
        if (this.#openPortBtn) this.#openPortBtn.disabled = true;

        // 隐藏设备信息卡片
        const deviceStatusCard = document.getElementById('modal-device-status-card');
        if (deviceStatusCard) deviceStatusCard.classList.add('hidden');

        const deviceListElement = document.getElementById('device-list');
        const addDeviceInputContainer = document.getElementById('add-device-input-container');

        if (deviceListElement) deviceListElement.classList.add('hidden');
        if (addDeviceInputContainer) addDeviceInputContainer.classList.remove('hidden');

        // 绑定输入框按钮事件
        const addDeviceCancelBtn = document.getElementById('add-device-cancel-btn');
        if (addDeviceCancelBtn) {
            const newCancel = addDeviceCancelBtn.cloneNode(true);
            addDeviceCancelBtn.parentNode.replaceChild(newCancel, addDeviceCancelBtn);
            newCancel.addEventListener('click', () => this.#hideAddDeviceInput());
        }

        const addDeviceConfirmBtn = document.getElementById('add-device-confirm-btn');
        if (addDeviceConfirmBtn) {
            const newConfirm = addDeviceConfirmBtn.cloneNode(true);
            addDeviceConfirmBtn.parentNode.replaceChild(newConfirm, addDeviceConfirmBtn);
            newConfirm.addEventListener('click', () => this.#addDeviceByIp());
        }

        const addDeviceInput = document.getElementById('add-device-input');
        if (addDeviceInput) {
            const newInput = addDeviceInput.cloneNode(true);
            addDeviceInput.parentNode.replaceChild(newInput, addDeviceInput);
            newInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.#addDeviceByIp();
            });
        }
    }

    #hideAddDeviceInput() {
        const deviceListElement = document.getElementById('device-list');
        const addDeviceInputContainer = document.getElementById('add-device-input-container');
        const addDeviceInput = document.getElementById('add-device-input');
        const addDeviceResult = document.getElementById('add-device-result');

        if (deviceListElement) deviceListElement.classList.remove('hidden');
        if (addDeviceInputContainer) addDeviceInputContainer.classList.add('hidden');
        if (addDeviceInput) addDeviceInput.value = '';
        if (addDeviceResult) addDeviceResult.classList.add('hidden');

        // 恢复设备信息卡片状态
        const selectedDevice = document.querySelector('.device-item.selected');
        const deviceStatusCard = document.getElementById('modal-device-status-card');
        if (selectedDevice && deviceStatusCard) {
            deviceStatusCard.classList.remove('hidden');
        } else if (deviceStatusCard) {
            deviceStatusCard.classList.add('hidden');
        }
    }

    async #addDeviceByIp() {
        const addDeviceInput = document.getElementById('add-device-input');
        const addDeviceResult = document.getElementById('add-device-result');

        if (!addDeviceInput || !addDeviceResult) return;

        const input = addDeviceInput.value.trim();
        if (!input) {
            this.#showAddDeviceResult(window.i18n.t('deviceModal.enterIp'), 'error');
            return;
        }

        // 校验IP格式
        let ipAddress, port = 5555;
        if (input.includes(':')) {
            const parts = input.split(':');
            ipAddress = parts[0];
            port = parseInt(parts[1]);
            if (isNaN(port)) {
                this.#showAddDeviceResult(window.i18n.t('deviceModal.portFormatError'), 'error');
                return;
            }
        } else {
            ipAddress = input;
        }

        const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        if (!ipRegex.test(ipAddress)) {
            this.#showAddDeviceResult(window.i18n.t('deviceModal.ipFormatError'), 'error');
            return;
        }

        // 执行 adb connect
        try {
            this.#showAddDeviceResult(window.i18n.t('deviceModal.connecting'), 'info');
            const deviceAddress = `${ipAddress}:${port}`;
            const result = await window.electronAPI.executeAdbCommand(`connect ${deviceAddress}`);

            if (result.success) {
                this.#showAddDeviceResult(`${window.i18n.t('deviceModal.connectSuccess')}: ${deviceAddress}`, 'success');
            } else {
                this.#showAddDeviceResult(`${window.i18n.t('deviceModal.connectFailed')}: ${result.error}`, 'error');
            }
        } catch (error) {
            this.#showAddDeviceResult(`${window.i18n.t('deviceModal.connectFailed')}: ${error.message}`, 'error');
        }
    }

    #showAddDeviceResult(message, type) {
        const addDeviceResult = document.getElementById('add-device-result');
        if (!addDeviceResult) return;

        addDeviceResult.textContent = message;
        addDeviceResult.classList.remove('hidden', 'error', 'success', 'info');
        addDeviceResult.style.backgroundColor = '';
        addDeviceResult.style.color = '';
        addDeviceResult.style.border = '';

        if (type) addDeviceResult.classList.add(type);
        addDeviceResult.classList.remove('hidden');
    }

    // ==================== 开放5555端口 ====================

    async #openPort5555() {
        const modalContainer = document.querySelector('#device-modal-overlay .modal-container');
        const selectedDeviceElement = document.querySelector('.device-item.selected');
        if (!selectedDeviceElement) {
            Toast.error(window.i18n.t('deviceModal.selectUsbDevice'), { container: modalContainer });
            return;
        }

        const deviceId = selectedDeviceElement.getAttribute('data-device-id');
        if (!deviceId || deviceId.includes(':')) {
            Toast.error(window.i18n.t('deviceModal.selectUsbDevice'), { container: modalContainer });
            return;
        }

        try {
            Toast.info(window.i18n.t('deviceModal.openingPort'), { container: modalContainer });
            const result = await window.electronAPI.executeAdbCommand('tcpip 5555', deviceId);

            if (result.success) {
                Toast.success(window.i18n.t('deviceModal.portOpenSuccess'), { container: modalContainer });
            } else {
                Toast.error(`${window.i18n.t('deviceModal.portOpenFailed')}: ${result.error}`, { container: modalContainer });
            }
        } catch (error) {
            Toast.error(`${window.i18n.t('deviceModal.portOpenFailed')}: ${error.message}`, { container: modalContainer });
        }
    }

    // ==================== 设备信息 ====================

    async #getDeviceInfo(deviceId) {
        try {
            // 显示加载动画
            const loadingElement = document.getElementById('modal-device-loading');
            const contentElement = document.getElementById('modal-device-info-content');
            if (loadingElement) loadingElement.style.display = 'flex';
            if (contentElement) contentElement.style.display = 'none';

            this.#resetDeviceStatusCard();

            // 制造商
            const manufacturerResult = await window.electronAPI.executeAdbCommand('getprop ro.product.manufacturer', deviceId);
            let manufacturer = '-';
            if (manufacturerResult.success) {
                manufacturer = manufacturerResult.output.trim() || '-';
            }

            // 型号
            const modelResult = await window.electronAPI.executeAdbCommand('getprop ro.product.model', deviceId);
            let model = '-';
            if (modelResult.success) {
                model = modelResult.output.trim() || '-';
            }

            // Android版本
            const androidVersionResult = await window.electronAPI.executeAdbCommand('getprop ro.build.version.release', deviceId);
            let androidVersion = '-';
            if (androidVersionResult.success) {
                androidVersion = androidVersionResult.output.trim() || '-';
            }

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
    }

    #resetDeviceStatusCard() {
        const elements = [
            'modal-device-manufacturer',
            'modal-device-model',
            'modal-device-android-version'
        ];
        elements.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = '-';
        });
    }
}

// 默认导出
export default DeviceSelectionModal;

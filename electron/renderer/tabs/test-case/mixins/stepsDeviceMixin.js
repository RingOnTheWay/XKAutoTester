// Steps System/BLE Config mixin for TestCaseView
// Extracted from stepsMixin.js during sub-refactor
// Provides: renderSystemConfig, renderBleConfig, renderBleOperationConfigContent, renderDeviceParams

export const stepsDeviceMixin = {
    renderSystemConfig(step) {
        const config = step.config || {};
        const systemConfig = config.systemConfig || {};
        const operationType = systemConfig.operationType || 'navigation';
        const navKey = systemConfig.navKey || 'back';
        const clickCount = systemConfig.clickCount || 1;

        const operationTypeOptions = [
            { value: 'navigation', label: window.i18n.t('testCase.navigationBar'), selected: operationType === 'navigation' }
        ];

        const navKeyOptions = [
            { value: 'back', label: window.i18n.t('testCase.navBack'), selected: navKey === 'back' },
            { value: 'home', label: window.i18n.t('testCase.navHome'), selected: navKey === 'home' },
            { value: 'recent', label: window.i18n.t('testCase.navRecent'), selected: navKey === 'recent' }
        ];

        return `
            <div class="tc-step-config tc-system-config">
                <div class="form-row">
                    <div class="form-group">
                        <label>${window.i18n.t('testCase.systemOperationType')}</label>
                        ${this.generateCustomSelect('tc-system-operation-type', operationTypeOptions, window.i18n.t('testCase.selectSystemOperationType'), step.id)}
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>${window.i18n.t('testCase.keySelect')}</label>
                        ${this.generateCustomSelect('tc-nav-key-select', navKeyOptions, window.i18n.t('testCase.selectKey'), step.id)}
                    </div>
                    <div class="form-group">
                        <label>${window.i18n.t('testCase.clickCount')}</label>
                        <input type="number" class="glass-input tc-nav-click-count" data-step-id="${step.id}"
                               value="${clickCount}" min="1" step="1">
                    </div>
                </div>
            </div>
        `;
    },

    renderBleConfig(step) {
        const config = step.config || {};
        const deviceConfig = config.deviceConfig || {};
        const bleDevices = step._bleDevices; // Controller injects

        let methodOptionsHtml = '';
        let paramsHtml = '';

        if (deviceConfig.deviceId && bleDevices && bleDevices.length > 0) {
            const device = bleDevices.find(d => d.deviceId === deviceConfig.deviceId);
            if (device && device.methods) {
                const methodOptions = device.methods.map(m => ({
                    value: m.name,
                    label: m.displayName || m.name,
                    selected: deviceConfig.methodName === m.name
                }));
                methodOptionsHtml = `
                    <div class="form-group">
                        <label>${window.i18n.t('testCase.bleMethod')}</label>
                        ${this.generateCustomSelect('tc-ble-method-select', methodOptions, window.i18n.t('testCase.bleMethodPlaceholder'), step.id)}
                    </div>
                `;

                if (deviceConfig.methodName) {
                    const method = device.methods.find(m => m.name === deviceConfig.methodName);
                    if (method && method.params) {
                        paramsHtml = this.renderDeviceParams(method.params, deviceConfig.params || {}, step.id);
                    }
                }
            }
        }

        return `
            <div class="tc-step-config tc-ble-config" data-step-id="${step.id}">
                <div class="form-group">
                    <label>${window.i18n.t('testCase.bleDeviceSelect')}</label>
                    <div class="tc-ble-device-select-container" data-step-id="${step.id}"></div>
                </div>
                ${methodOptionsHtml}
                <div class="tc-ble-params-container" data-step-id="${step.id}">
                    ${paramsHtml}
                </div>
            </div>
        `;
    },

    renderDeviceParams(params, paramValues, stepId) {
        if (!params || params.length === 0) return '';

        const fieldsHtml = params.map(param => {
            const value = paramValues[param.key] !== undefined ? paramValues[param.key] : (param.default !== undefined ? param.default : '');

            if (param.type === 'select') {
                const options = (param.options || []).map(opt => ({
                    value: String(opt.value),
                    label: opt.label,
                    selected: String(value) === String(opt.value)
                }));
                return `
                    <div class="form-group">
                        <label>${param.label}</label>
                        ${this.generateCustomSelect(`tc-ble-param-${param.key}`, options, param.placeholder || window.i18n.t('common.pleaseSelect'), stepId)}
                    </div>
                `;
            } else if (param.type === 'number') {
                const step = param.step || 'any';
                const precisionAttr = param.precision !== undefined ? ` data-precision="${param.precision}"` : '';
                return `
                    <div class="form-group">
                        <label>${param.label}</label>
                        <input type="number" class="glass-input tc-ble-param-input" data-step-id="${stepId}" data-param-key="${param.key}"
                               value="${value}" step="${step}" placeholder="${param.placeholder || ''}"${precisionAttr}>
                    </div>
                `;
            } else {
                return `
                    <div class="form-group">
                        <label>${param.label}</label>
                        <input type="text" class="glass-input tc-ble-param-input" data-step-id="${stepId}" data-param-key="${param.key}"
                               value="${value}" placeholder="${param.placeholder || ''}">
                    </div>
                `;
            }
        }).join('');

        return `<div class="tc-ble-device-params"><div class="form-row">${fieldsHtml}</div></div>`;
    },

    renderBleOperationConfigContent(step) {
        const config = step.config || {};
        const deviceConfig = config.deviceConfig || {};
        const bleDevices = step._bleDevices; // Controller injects

        let methodOptionsHtml = '';
        let paramsHtml = '';

        if (deviceConfig.deviceId && bleDevices && bleDevices.length > 0) {
            const device = bleDevices.find(d => d.deviceId === deviceConfig.deviceId);
            if (device && device.methods) {
                const methodOptions = device.methods.map(m => ({
                    value: m.name,
                    label: m.displayName || m.name,
                    selected: deviceConfig.methodName === m.name
                }));
                methodOptionsHtml = `
                    <div class="form-group">
                        <label>${window.i18n.t('testCase.bleMethod')}</label>
                        ${this.generateCustomSelect('tc-ble-method-select', methodOptions, window.i18n.t('testCase.bleMethodPlaceholder'), step.id)}
                    </div>
                `;

                if (deviceConfig.methodName) {
                    const method = device.methods.find(m => m.name === deviceConfig.methodName);
                    if (method && method.params) {
                        paramsHtml = this.renderDeviceParams(method.params, deviceConfig.params || {}, step.id);
                    }
                }
            }
        }

        return `
            <div class="tc-ble-device-select-container" data-step-id="${step.id}"></div>
            ${methodOptionsHtml}
            <div class="tc-ble-params-container" data-step-id="${step.id}">
                ${paramsHtml}
            </div>
        `;
    },
};

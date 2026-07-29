// Steps Operation Value mixin for TestCaseView
// Extracted from stepsMixin.js during sub-refactor
// Provides: renderOperationValue, renderSendTextConfig, renderInputValueArea, renderFakerConfig

export const stepsOperationMixin = {
    renderOperationValue(step) {
        const config = step.config || {};
        const operation = config.operation || 'click';

        switch (operation) {
            case 'click':
                const clickCount = config.operationValue?.clickCount || 1;
                return `
                    <label>${window.i18n.t('testCase.clickCount')}</label>
                    <input type="number" class="glass-input tc-click-count" data-step-id="${step.id}"
                           value="${clickCount}" min="1" max="10">
                `;

            case 'sendText':
                return this.renderSendTextConfig(step);

            case 'swipeUp':
            case 'swipeDown':
                const duration = config.operationValue?.swipeDuration || 500;
                return `
                    <label>${window.i18n.t('testCase.swipeDuration')}</label>
                    <input type="number" class="glass-input tc-swipe-duration" data-step-id="${step.id}"
                           value="${duration}" min="100" step="100">
                `;

            default:
                return '';
        }
    },

    renderSendTextConfig(step, index = -1, operationValue = null) {
        const isMulti = index >= 0;
        const opValue = isMulti ? (operationValue || {}) : (step.config?.operationValue || {});
        const inputType = opValue.inputType || 'custom';
        const prefix = isMulti ? 'tc-multi' : 'tc';
        const dataIndexAttr = isMulti ? ` data-index="${index}"` : '';

        const inputTypeOptions = [
            { value: 'custom', label: window.i18n.t('testCase.bleCustomData'), selected: inputType === 'custom' },
            { value: 'random', label: window.i18n.t('testCase.inputRandom'), selected: inputType === 'random' },
            { value: 'faker', label: window.i18n.t('testCase.inputFaker'), selected: inputType === 'faker' }
        ];

        return `
            <label>${window.i18n.t('testCase.inputContent')}</label>
            <div class="tc-sendtext-config">
                <div class="tc-input-type-selector">
                    ${this.generateCustomSelect(`${prefix}-input-type-select`, inputTypeOptions, window.i18n.t('testCase.inputType'), step.id, index)}
                </div>
                <div class="tc-input-value-container" data-step-id="${step.id}"${dataIndexAttr}>
                    ${this.renderInputValueArea(step, inputType, index, opValue)}
                </div>
            </div>
        `;
    },

    renderInputValueArea(step, inputType, index = -1, operationValue = null) {
        const isMulti = index >= 0;
        const opValue = isMulti ? (operationValue || {}) : (step.config?.operationValue || {});
        const prefix = isMulti ? 'tc-multi' : 'tc';
        const dataIndexAttr = isMulti ? ` data-index="${index}"` : '';

        switch (inputType) {
            case 'custom':
                return `
                    <input type="text" class="glass-input ${prefix}-custom-input" data-step-id="${step.id}"${dataIndexAttr}
                           value="${opValue.inputValue || ''}" placeholder="${window.i18n.t('testCase.inputTextContent')}">
                `;

            case 'random':
                const randomConfig = opValue.randomConfig || {};
                const precisionOptions = [
                    { value: '0', label: window.i18n.t('testCase.integer'), selected: randomConfig.precision === 0 || !randomConfig.precision },
                    { value: '1', label: window.i18n.t('testCase.decimalPlaces', { n: 1 }), selected: randomConfig.precision === 1 },
                    { value: '2', label: window.i18n.t('testCase.decimalPlaces', { n: 2 }), selected: randomConfig.precision === 2 },
                    { value: '3', label: window.i18n.t('testCase.decimalPlaces', { n: 3 }), selected: randomConfig.precision === 3 },
                    { value: '4', label: window.i18n.t('testCase.decimalPlaces', { n: 4 }), selected: randomConfig.precision === 4 },
                    { value: '5', label: window.i18n.t('testCase.decimalPlaces', { n: 5 }), selected: randomConfig.precision === 5 }
                ];
                return `
                    <div class="tc-random-config">
                        <div class="form-row">
                            <div class="form-group">
                                <label>${window.i18n.t('testCase.minValue')}</label>
                                <input type="number" class="glass-input ${prefix}-random-min" data-step-id="${step.id}"${dataIndexAttr}
                                       value="${randomConfig.minValue || 0}" step="0.1">
                            </div>
                            <div class="form-group">
                                <label>${window.i18n.t('testCase.maxValue')}</label>
                                <input type="number" class="glass-input ${prefix}-random-max" data-step-id="${step.id}"${dataIndexAttr}
                                       value="${randomConfig.maxValue || 100}" step="0.1">
                            </div>
                            <div class="form-group">
                                <label>${window.i18n.t('testCase.precision')}</label>
                                ${this.generateCustomSelect(`${prefix}-random-precision`, precisionOptions, window.i18n.t('testCase.selectPrecision'), step.id, index)}
                            </div>
                        </div>
                    </div>
                `;

            case 'faker':
                return this.renderFakerConfig(step, index, opValue);

            default:
                return '';
        }
    },

    renderFakerConfig(step, index = -1, operationValue = null) {
        const isMulti = index >= 0;
        const opValue = isMulti ? (operationValue || {}) : (step.config?.operationValue || {});
        const fakerConfig = opValue.fakerConfig || {};
        const prefix = isMulti ? 'tc-multi' : 'tc';

        const locales = [
            { value: 'zh_CN', label: window.i18n.t('testCase.fakerLocales.zh_CN') },
            { value: 'en_US', label: window.i18n.t('testCase.fakerLocales.en_US') },
            { value: 'ja_JP', label: window.i18n.t('testCase.fakerLocales.ja_JP') },
            { value: 'ko_KR', label: window.i18n.t('testCase.fakerLocales.ko_KR') }
        ];

        const providers = this._getFakerProviders();

        const selectedLocale = fakerConfig.locale || 'zh_CN';
        const selectedProvider = fakerConfig.provider || 'person.name';
        const currentProviders = providers[selectedLocale] || providers['zh_CN'];
        const currentProvider = currentProviders.find(p => p.value === selectedProvider) || currentProviders[0];

        const localeOptions = locales.map(l => ({
            value: l.value,
            label: l.label,
            selected: selectedLocale === l.value
        }));

        const providerOptions = currentProviders.map(p => ({
            value: p.value,
            label: p.label,
            selected: selectedProvider === p.value
        }));

        const languageLabel = window.i18n.t('testCase.fakerLocale');
        const typeLabel = window.i18n.t('testCase.fakerType');
        const exampleLabel = window.i18n.t('testCase.fakerExample');

        return `
            <div class="tc-faker-config">
                <div class="tc-faker-row">
                    <div class="tc-faker-field">
                        <label>${languageLabel}</label>
                        ${this.generateCustomSelect(`${prefix}-faker-locale`, localeOptions, window.i18n.t('testCase.fakerLocale'), step.id, index)}
                    </div>
                    <div class="tc-faker-field">
                        <label>${typeLabel}</label>
                        ${this.generateCustomSelect(`${prefix}-faker-provider`, providerOptions, window.i18n.t('testCase.fakerType'), step.id, index)}
                    </div>
                </div>
                <div class="tc-faker-example">
                    <span class="tc-faker-example-label">${exampleLabel}:</span>
                    <span class="tc-faker-example-value">${currentProvider?.example || ''}</span>
                </div>
            </div>
        `;
    },
};

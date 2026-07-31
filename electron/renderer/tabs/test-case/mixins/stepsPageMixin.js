// Steps Page Config mixin for TestCaseView
// Extracted from stepsMixin.js during sub-refactor
// Provides: renderPageConfig (page compare/search step card)

export const stepsPageMixin = {
    renderPageConfig(step) {
        const config = step.config || {};
        if (!config.operationType) config.operationType = 'compare';
        const operationType = config.operationType;
        const app = step._app; // Controller injects

        const operationTypeOptions = [
            { value: 'compare', label: window.i18n.t('testCase.pageCompare'), selected: operationType === 'compare' },
            { value: 'search', label: window.i18n.t('testCase.pageSearch'), selected: operationType === 'search' }
        ];

        // Compare element page options
        let compareElementPageOptions = [{ value: '', label: window.i18n.t('pagePackage.selectPage'), selected: !config.compareConfig?.pageId }];
        if (app && app.pages) {
            app.pages.forEach(page => {
                compareElementPageOptions.push({ value: page.id, label: page.name, selected: config.compareConfig?.pageId === page.id });
            });
        }

        // Compare element options
        let compareElementOptions = [{ value: '', label: window.i18n.t('pagePackage.selectElement'), selected: true }];
        if (config.compareConfig?.pageId && app) {
            const page = app.pages?.find(p => p.id === config.compareConfig.pageId);
            if (page && page.elements) {
                compareElementOptions = [{ value: '', label: window.i18n.t('pagePackage.selectElement'), selected: !config.compareConfig.elementId }];
                page.elements.forEach(element => {
                    compareElementOptions.push({ value: element.id, label: element.name, selected: config.compareConfig.elementId === element.id });
                });
            }
        }

        const compareConfig = config.compareConfig || {};
        if (!compareConfig.targetValueType) compareConfig.targetValueType = 'custom';
        const targetValueType = compareConfig.targetValueType;

        const allSteps = step._allSteps || []; // Controller injects
        const currentStepIndex = allSteps.findIndex(s => s.id === step.id);
        const hasBleSteps = allSteps.some((s, index) =>
            index < currentStepIndex &&
            s.type === 'ble' &&
            (s.config?.deviceConfig?.methodName === 'send_random_data' || s.config?.deviceConfig?.methodName === 'send_custom_data')
        );

        const targetValueOptions = [
            { value: 'custom', label: window.i18n.t('testCase.bleCustomData'), selected: targetValueType === 'custom' }
        ];
        if (hasBleSteps) {
            targetValueOptions.push({
                value: 'ble',
                label: window.i18n.t('testCase.bleOperation'),
                selected: targetValueType === 'ble'
            });
        }

        const bleStepId = compareConfig.bleStepId || '';
        const bleStepOptions = [{ value: '', label: window.i18n.t('testCase.selectStep'), selected: !bleStepId }];
        allSteps.forEach((s, index) => {
            if (index < currentStepIndex &&
                s.type === 'ble' &&
                (s.config?.deviceConfig?.methodName === 'send_random_data' || s.config?.deviceConfig?.methodName === 'send_custom_data')) {
                bleStepOptions.push({
                    value: s.id,
                    label: `${s.name} ${window.i18n.t('testCase.generatedRandomValue')}`,
                    selected: bleStepId === s.id
                });
            }
        });

        const isBleTarget = targetValueType === 'ble';
        const showCustomInput = targetValueType === 'custom';
        const showBleStepSelect = isBleTarget;
        // 仅当 targetValue 为纯数字（或空）时启用容差；非纯数字（含"阿123"等混合字符）则禁用
        const _targetVal = compareConfig.targetValue || '';
        const _isPureNumber = _targetVal !== '' && !isNaN(Number(_targetVal)) && isFinite(Number(_targetVal));
        const toleranceDisabled = !isBleTarget && _targetVal !== '' && !_isPureNumber;

        const searchConfig = config.searchConfig || {};
        if (!searchConfig.searchType) searchConfig.searchType = 'element';
        const searchType = searchConfig.searchType;
        const searchTypeOptions = [
            { value: 'element', label: window.i18n.t('testCase.searchTypeElement'), selected: searchType === 'element' },
            { value: 'text', label: window.i18n.t('testCase.searchTypeText'), selected: searchType === 'text' }
        ];
        const searchMatchType = searchConfig.matchType || 'contains';

        let searchElementPageOptions = [{ value: '', label: window.i18n.t('pagePackage.selectPage'), selected: !searchConfig.pageId }];
        if (app && app.pages) {
            app.pages.forEach(page => {
                searchElementPageOptions.push({ value: page.id, label: page.name, selected: searchConfig.pageId === page.id });
            });
        }

        let searchElementOptions = [{ value: '', label: window.i18n.t('pagePackage.selectElement'), selected: true }];
        if (searchConfig.pageId && app) {
            const page = app.pages?.find(p => p.id === searchConfig.pageId);
            if (page && page.elements) {
                searchElementOptions = [{ value: '', label: window.i18n.t('pagePackage.selectElement'), selected: !searchConfig.elementId }];
                page.elements.forEach(element => {
                    searchElementOptions.push({ value: element.id, label: element.name, selected: searchConfig.elementId === element.id });
                });
            }
        }

        return `
            <div class="tc-step-config tc-page-config">
                <div class="form-row">
                    <div class="form-group">
                        <label>${window.i18n.t('testCase.pageOperationType')}</label>
                        ${this.generateCustomSelect('tc-page-operation-type', operationTypeOptions, window.i18n.t('testCase.selectOperationType'), step.id)}
                    </div>
                </div>
                <div class="tc-page-compare-config ${operationType === 'compare' ? '' : 'hidden'}" data-step-id="${step.id}">
                    <div class="tc-compare-group">
                        <div class="form-row">
                            <div class="form-group">
                                <label>${window.i18n.t('testCase.compareSource')}</label>
                                ${this.generateCustomSelect('tc-target-value-type', targetValueOptions, window.i18n.t('testCase.selectCompareSource'), step.id)}
                            </div>
                            <div class="form-group tc-custom-target-value-group ${showCustomInput ? '' : 'hidden'}">
                                <label>${window.i18n.t('testCase.targetValue')}</label>
                                <input type="text" class="glass-input tc-compare-target-value" data-step-id="${step.id}"
                                       value="${compareConfig.targetValue || ''}" placeholder="${window.i18n.t('testCase.enterTargetValue')}">
                            </div>
                        </div>
                        <div class="form-row tc-ble-step-select-group ${showBleStepSelect ? '' : 'hidden'}">
                            <div class="form-group">
                                <label>${window.i18n.t('testCase.stepSelect')}</label>
                                ${this.generateCustomSelect('tc-ble-step-select', bleStepOptions, window.i18n.t('testCase.selectStep'), step.id)}
                            </div>
                        </div>
                    </div>
                    <div class="tc-compare-group">
                        <div class="form-row">
                            <div class="form-group">
                                <label>${window.i18n.t('testCase.compareElementPage')}</label>
                                ${this.generateCustomSelect('tc-compare-element-page', compareElementPageOptions, window.i18n.t('pagePackage.selectPage'), step.id)}
                            </div>
                            <div class="form-group">
                                <label>${window.i18n.t('testCase.compareElement')}</label>
                                ${this.generateCustomSelect('tc-compare-element-select', compareElementOptions, window.i18n.t('pagePackage.selectElement'), step.id)}
                            </div>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>${window.i18n.t('testCase.pageCompareTolerance')}</label>
                            <input type="number" class="glass-input tc-compare-tolerance" data-step-id="${step.id}"
                                   value="${compareConfig.tolerance || ''}" step="0.1" min="0"
                                   placeholder="${window.i18n.t('testCase.tolerancePlaceholder')}"
                                   ${toleranceDisabled ? 'disabled' : ''}>
                        </div>
                    </div>
                </div>
                <div class="tc-page-search-config ${operationType === 'search' ? '' : 'hidden'}" data-step-id="${step.id}">
                    <div class="form-row">
                        <div class="form-group">
                            <label>${window.i18n.t('testCase.pageSearchType')}</label>
                            ${this.generateCustomSelect('tc-search-type', searchTypeOptions, window.i18n.t('testCase.selectSearchType'), step.id)}
                        </div>
                    </div>
                    <div class="tc-search-element-group ${searchType === 'element' ? '' : 'hidden'}" data-step-id="${step.id}">
                        <div class="tc-compare-group">
                            <div class="form-row">
                                <div class="form-group">
                                    <label>${window.i18n.t('testCase.searchElementPage')}</label>
                                    ${this.generateCustomSelect('tc-search-element-page', searchElementPageOptions, window.i18n.t('pagePackage.selectPage'), step.id)}
                                </div>
                                <div class="form-group">
                                    <label>${window.i18n.t('testCase.searchElement')}</label>
                                    ${this.generateCustomSelect('tc-search-element-select', searchElementOptions, window.i18n.t('pagePackage.selectElement'), step.id)}
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="tc-search-text-group ${searchType === 'text' ? '' : 'hidden'}" data-step-id="${step.id}">
                        <div class="form-row">
                            <div class="form-group">
                                <label>${window.i18n.t('testCase.searchTextValue')}</label>
                                <input type="text" class="glass-input tc-search-text-value" data-step-id="${step.id}"
                                       value="${searchConfig.textValue || ''}" placeholder="${window.i18n.t('testCase.enterSearchText')}">
                            </div>
                        </div>
                        <div class="form-row tc-search-match-type-row">
                            <div class="form-group">
                                <label>${window.i18n.t('testCase.matchType')}</label>
                                <div class="tc-radio-group" data-step-id="${step.id}">
                                    <label class="tc-radio-option">
                                        <input type="radio" name="tc-search-match-${step.id}" value="contains" ${searchMatchType === 'contains' ? 'checked' : ''} class="tc-search-match-radio">
                                        <span>${window.i18n.t('testCase.matchContains')}</span>
                                    </label>
                                    <label class="tc-radio-option">
                                        <input type="radio" name="tc-search-match-${step.id}" value="exact" ${searchMatchType === 'exact' ? 'checked' : ''} class="tc-search-match-radio">
                                        <span>${window.i18n.t('testCase.matchExact')}</span>
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },
};

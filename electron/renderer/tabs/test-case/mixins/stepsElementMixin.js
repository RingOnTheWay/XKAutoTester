// Steps Element Config mixin for TestCaseView
// Extracted from stepsMixin.js during sub-refactor
// Provides: renderElementConfig (element step card) + renderMultiOperationValue (multi-element operations)

export const stepsElementMixin = {
    renderElementConfig(step) {
        const config = step.config || {};
        const app = step._app; // Controller injects app reference
        const multiSelect = config.multiSelect || false;
        const clickCount = config.multiClickCount || 1;
        const selectedElements = config.selectedElements || [];

        // Page options
        let pageOptions = [{ value: '', label: window.i18n.t('testCase.selectPage'), selected: !config.pageId }];
        if (app && app.pages) {
            app.pages.forEach(page => {
                pageOptions.push({ value: page.id, label: page.name, selected: config.pageId === page.id });
            });
        }

        // Element options
        let elementOptions = [{ value: '', label: window.i18n.t('testCase.selectElement'), selected: true }];
        if (config.pageId && app) {
            const page = app.pages?.find(p => p.id === config.pageId);
            if (page && page.elements) {
                elementOptions = [{ value: '', label: window.i18n.t('testCase.selectElement'), selected: !config.elementId }];
                page.elements.forEach(element => {
                    elementOptions.push({ value: element.id, label: element.name, selected: config.elementId === element.id });
                });
            }
        }

        // Operation options
        const operationOptions = this.getOperationOptionsForLocator(config.locator, config.operation);

        // Multi-element list
        let multiElementsHtml = '';
        if (multiSelect && selectedElements.length > 0) {
            selectedElements.forEach((elemConfig, index) => {
                const elemId = typeof elemConfig === 'string' ? elemConfig : elemConfig.elementId;
                const elemOperation = typeof elemConfig === 'object' ? (elemConfig.operation || 'click') : 'click';
                const elemOperationValue = typeof elemConfig === 'object' ? (elemConfig.operationValue || {}) : {};

                const elemOptions = this.getElementOptionsForPage(config.pageId, elemId, app);
                const elemLocatorType = this._getElementLocatorType(config.pageId, elemId, app);
                const elemOperationOptions = this.getOperationOptionsForLocator(elemLocatorType, elemOperation);

                multiElementsHtml += `
                    <div class="tc-multi-element-item" data-index="${index}" data-step-id="${step.id}">
                        <div class="tc-multi-element-header">
                            <span class="tc-multi-element-number">${index + 1}</span>
                            ${this.generateCustomSelect('tc-multi-element-select', elemOptions, window.i18n.t('testCase.selectElement'), step.id, index)}
                            <button type="button" class="tc-multi-element-remove-btn" data-step-id="${step.id}" data-index="${index}">
                                ${this.getIconHtml('close')}
                            </button>
                        </div>
                        <div class="tc-multi-element-body">
                            <div class="form-group">
                                <label>${window.i18n.t('testCase.operationType')}</label>
                                ${this.generateCustomSelect('tc-multi-operation-select', elemOperationOptions, window.i18n.t('testCase.selectOperation'), step.id, index)}
                            </div>
                            <div class="form-group tc-multi-operation-value-group" data-step-id="${step.id}" data-index="${index}">
                                ${this.renderMultiOperationValue(step, index, elemOperation, elemOperationValue)}
                            </div>
                        </div>
                    </div>
                `;
            });
        }

        return `
            <div class="tc-step-config tc-element-config">
                <div class="form-row">
                    <div class="form-group">
                        <label>${window.i18n.t('testCase.pageSelect')}</label>
                        ${this.generateCustomSelect('tc-page-select', pageOptions, window.i18n.t('testCase.selectPage'), step.id)}
                    </div>
                    <div class="form-group tc-element-select-group" data-step-id="${step.id}">
                        <div class="tc-element-select-header">
                            <label>${window.i18n.t('testCase.elementSelect')}</label>
                        </div>
                        <label class="tc-multi-select-toggle">
                            <input type="checkbox" class="tc-multi-select-checkbox" data-step-id="${step.id}" ${multiSelect ? 'checked' : ''}>
                            <span>${window.i18n.t('testCase.elementMulti')}</span>
                        </label>
                        <div class="tc-single-element-select ${multiSelect ? 'hidden' : ''}">
                            ${this.generateCustomSelect('tc-element-select', elementOptions, window.i18n.t('testCase.selectElement'), step.id)}
                        </div>
                        <div class="tc-multi-element-config ${multiSelect ? '' : 'hidden'}">
                            <div class="tc-multi-element-count-row">
                                <span class="tc-multi-element-count-label">${window.i18n.t('testCase.clickCountLabel')}</span>
                                <input type="number" class="glass-input tc-multi-click-count" data-step-id="${step.id}"
                                       value="${clickCount}" min="1" max="${selectedElements.length || 1}">
                                <span class="tc-multi-element-hint">${window.i18n.t('testCase.randomSelectFromElements', { count: selectedElements.length || 0 })}</span>
                            </div>
                            <div class="tc-multi-elements-list" data-step-id="${step.id}">
                                ${multiElementsHtml}
                            </div>
                            <button type="button" class="tc-add-multi-element-btn" data-step-id="${step.id}">
                                ${this.getIconHtml('add')}
                                <span>${window.i18n.t('testCase.addElement')}</span>
                            </button>
                        </div>
                    </div>
                </div>
                <div class="form-row tc-single-operation-row ${multiSelect ? 'hidden' : ''}">
                    <div class="form-group">
                        <label>${window.i18n.t('testCase.operationType')}</label>
                        ${this.generateCustomSelect('tc-operation-select', operationOptions, window.i18n.t('testCase.selectOperation'), step.id)}
                    </div>
                    <div class="form-group tc-operation-value-group" data-step-id="${step.id}">
                        ${this.renderOperationValue(step)}
                    </div>
                </div>
            </div>
        `;
    },

    renderMultiOperationValue(step, index, operation, operationValue) {
        switch (operation) {
            case 'click':
                const clickCount = operationValue.clickCount || 1;
                return `
                    <label>${window.i18n.t('testCase.clickCount')}</label>
                    <input type="number" class="glass-input tc-multi-click-count-input" data-step-id="${step.id}" data-index="${index}"
                           value="${clickCount}" min="1" max="10">
                `;

            case 'sendText':
                return this.renderSendTextConfig(step, index, operationValue);

            case 'swipeUp':
            case 'swipeDown':
                const swipeDuration = operationValue.swipeDuration || 500;
                return `
                    <label>${window.i18n.t('testCase.swipeDuration')}</label>
                    <input type="number" class="glass-input tc-multi-swipe-duration" data-step-id="${step.id}" data-index="${index}"
                           value="${swipeDuration}" min="100" step="100">
                `;

            default:
                return '';
        }
    },
};

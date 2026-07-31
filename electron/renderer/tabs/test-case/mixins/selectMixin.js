// App / Platform / Markers Select + Custom Select + Element/Operation Options mixin for TestCaseView
// Extracted from view.js during refactor (N12)
// Provides: option rendering for app/platform/markers, steps section state, custom select HTML generation, element/operation option builders

export const selectMixin = {
    // ─── App / Platform / Markers Select ───────────────────────────

    renderAppOptions(apps, selectedAppId) {
        const optionsContainer = this.els.appOptions;
        if (!optionsContainer) return;

        if (apps.length === 0) {
            optionsContainer.innerHTML = `<div class="custom-select__option disabled"><span>${window.i18n.t('pagePackage.noApps')}</span></div>`;
            return;
        }

        optionsContainer.innerHTML = apps.map(app => `
            <div class="custom-select__option${selectedAppId?.id === app.id ? ' selected' : ''}" data-value="${app.id}" data-name="${app.name}">
                <span>${app.name}</span>
            </div>
        `).join('');
    },

    renderPlatformOptions(platforms, selectedPlatform) {
        // 使用 platformSelectWrapperOptions（script.js 动态生成的 options 容器 ID 为 tc-platform-select-wrapper-options）
        const optionsContainer = this.els.platformSelectWrapperOptions;
        if (!optionsContainer) return;

        optionsContainer.innerHTML = platforms.map(platform => `
            <div class="custom-select__option${selectedPlatform === platform.value ? ' selected' : ''}" data-value="${platform.value}">
                <span>${platform.label}</span>
            </div>
        `).join('');
    },

    renderMarkersOptions(markers, selectedMarkers) {
        const optionsContainer = this.els.markersOptions;
        if (!optionsContainer) return;

        if (!markers || markers.length === 0) {
            optionsContainer.innerHTML = `<div class="custom-select__option disabled"><span>${window.i18n.t('testExecution.noMarkers')}</span></div>`;
            return;
        }

        optionsContainer.innerHTML = markers.map(marker => `
            <div class="custom-select__option${selectedMarkers.includes(marker.name) ? ' selected' : ''}" data-value="${marker.name}" data-description="${marker.description || ''}">
                <span>${marker.name}</span>
            </div>
        `).join('');
    },

    updateMarkersDisplay(selectedMarkers) {
        const selectedContainer = this.els.markersSelected;
        if (!selectedContainer) return;

        const textSpan = selectedContainer.querySelector('.custom-select__text');
        if (!textSpan) return;

        if (selectedMarkers.length === 0) {
            textSpan.textContent = window.i18n.t('placeholders.selectMarkers');
            return;
        }

        // Build badges HTML
        let badgesHtml = '';
        selectedMarkers.forEach(marker => {
            badgesHtml += `<span class="marker-badge" data-marker="${marker}">${marker}<span class="marker-badge-remove" data-marker="${marker}">x</span></span>`;
        });
        textSpan.innerHTML = badgesHtml;
    },

    updateStepsSectionState(enabled) {
        const section = this.els.stepsSection;
        const addBtn = this.els.addStepBtn;
        const addBottomBtn = this.els.addStepBottomBtn;
        const container = this.els.stepsContainer;

        if (section) {
            if (enabled) section.classList.remove('disabled');
            else section.classList.add('disabled');
        }
        if (addBtn) addBtn.disabled = !enabled;
        if (addBottomBtn) addBottomBtn.disabled = !enabled;
        if (container) {
            if (enabled) container.classList.remove('hidden');
            else container.classList.add('hidden');
        }
    },

    // ─── Custom Select ─────────────────────────────────────────────

    generateCustomSelect(selectId, options, placeholder = window.i18n.t('common.pleaseSelect'), stepId = '', index = -1) {
        const selectedOption = options.find(opt => opt.selected);
        const selectedText = selectedOption ? selectedOption.label : placeholder;

        const uniqueSuffix = index >= 0 ? `-${stepId}-${index}` : `-${stepId}`;
        const uniqueId = `${selectId}${uniqueSuffix}`;

        let optionsHtml = '';
        options.forEach(opt => {
            optionsHtml += `<div class="custom-select__option${opt.selected ? ' selected' : ''}" data-value="${opt.value}"><span>${opt.label}</span></div>`;
        });

        return `
            <div class="custom-select-wrapper tc-step-select-wrapper" data-step-id="${stepId}" data-index="${index}">
                <div class="custom-select" id="${uniqueId}" data-select-id="${selectId}" data-step-id="${stepId}" data-index="${index}">
                    <div class="custom-select__selected" id="${uniqueId}-selected">
                        <span class="custom-select__text">${selectedText}</span>
                    </div>
                    <div class="custom-select__options" id="${uniqueId}-options">
                        ${optionsHtml}
                    </div>
                </div>
            </div>
        `;
    },

    // ─── Element/Operation Options ─────────────────────────────────

    getElementOptionsForPage(pageId, selectedValue, app) {
        let elementOptions = [{ value: '', label: window.i18n.t('testCase.selectElement'), selected: !selectedValue }];
        if (pageId && app) {
            const page = app.pages?.find(p => p.id === pageId);
            if (page && page.elements) {
                page.elements.forEach(element => {
                    elementOptions.push({ value: element.id, label: element.name, selected: selectedValue === element.id });
                });
            }
        }
        return elementOptions;
    },

    getOperationOptionsForLocator(locatorType, currentOperation) {
        const isClickLocator = locatorType === 'click';
        const options = [
            { value: 'click', label: window.i18n.t('testCase.opClick'), selected: currentOperation === 'click' || !currentOperation },
            { value: 'swipeUp', label: window.i18n.t('testCase.opSwipeUp'), selected: currentOperation === 'swipeUp' },
            { value: 'swipeDown', label: window.i18n.t('testCase.opSwipeDown'), selected: currentOperation === 'swipeDown' }
        ];
        if (!isClickLocator) {
            options.splice(1, 0, { value: 'sendText', label: window.i18n.t('testCase.opSendText'), selected: currentOperation === 'sendText' });
        }
        return options;
    },
};

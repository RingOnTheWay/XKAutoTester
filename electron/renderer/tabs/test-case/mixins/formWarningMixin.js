// Warning UI + Form populate/reset mixin for TestCaseView
// Extracted from formMixin.js during sub-refactor
// Provides: JSON missing warning, file name error, form populate/reset, file name setter

export const formWarningMixin = {
    // ─── Warning / Error UI ────────────────────────────────────────

    showJsonMissingWarning(fileName) {
        this.hideJsonMissingWarning();

        const editorContent = document.querySelector('.tc-editor-content');
        if (!editorContent) return;

        const warningDiv = document.createElement('div');
        warningDiv.id = 'tc-json-missing-warning';
        warningDiv.className = 'tc-json-missing-warning';
        warningDiv.innerHTML = `
            ${this.getIconHtml('warning')}
            <span>${window.i18n.t('testCase.jsonMissingWarning', { fileName })}</span>
        `;
        editorContent.insertBefore(warningDiv, editorContent.firstChild);
    },

    hideJsonMissingWarning() {
        const existing = document.getElementById('tc-json-missing-warning');
        if (existing) existing.remove();
    },

    showFileNameError(messageKey) {
        const errorEl = this.els.fileNameError;
        if (!errorEl) return;
        const messageSpan = errorEl.querySelector('span:last-child');
        if (messageSpan) {
            messageSpan.setAttribute('data-i18n', messageKey);
            messageSpan.textContent = window.i18n.t(messageKey);
        }
        errorEl.classList.remove('error-hidden');
    },

    hideFileNameError() {
        const errorEl = this.els.fileNameError;
        if (errorEl) errorEl.classList.add('error-hidden');
    },

    // ─── Form Populate / Reset ─────────────────────────────────────

    populateForm(caseData) {
        if (this.els.caseName) this.els.caseName.value = caseData.name || '';
        if (this.els.description) this.els.description.value = caseData.description || '';

        const allure = caseData.allureConfig || {};
        if (this.els.allureEpic) this.els.allureEpic.value = allure.epic || '';
        if (this.els.allureFeature) this.els.allureFeature.value = allure.feature || '';
        if (this.els.allureStory) this.els.allureStory.value = allure.story || '';

        const wait = caseData.waitTimeConfig || {};
        if (this.els.appLoadWaitTime) this.els.appLoadWaitTime.value = wait.appLoadWaitTime ?? 10;
        if (this.els.elementWaitTimeout) this.els.elementWaitTimeout.value = wait.elementWaitTimeout ?? 30;
        if (this.els.stepInterval) this.els.stepInterval.value = wait.stepInterval ?? 2;
        if (this.els.appCloseWaitTime) this.els.appCloseWaitTime.value = wait.appCloseWaitTime ?? 2;

        // 更新 Markers 选项选中状态
        const savedMarkers = allure.markers || [];
        const markersOptionsContainer = this.els.markersOptions;
        if (markersOptionsContainer) {
            markersOptionsContainer.querySelectorAll('.custom-select__option').forEach(opt => {
                opt.classList.toggle('selected', savedMarkers.includes(opt.dataset.value));
            });
        }

        // 更新 App select 选中状态
        if (caseData.targetApp && caseData.targetApp.id) {
            const selectedSpan = document.querySelector('#tc-app-selected .custom-select__text');
            if (selectedSpan) {
                selectedSpan.textContent = caseData.targetApp.name || '';
            }
            const optionsContainer = this.els.appOptions;
            if (optionsContainer) {
                optionsContainer.querySelectorAll('.custom-select__option').forEach(opt => {
                    opt.classList.toggle('selected', opt.dataset.value === caseData.targetApp.id);
                });
            }
        }
    },

    resetForm() {
        if (this.els.caseForm) this.els.caseForm.reset();

        // Reset platform select display
        const platformSpan = this.els.platformSelectWrapperSelect?.querySelector('.custom-select__text');
        if (platformSpan) platformSpan.textContent = window.i18n.t('testCase.platforms.android');
        const platformOpts = this.els.platformSelectWrapperOptions;
        if (platformOpts) {
            platformOpts.querySelectorAll('.custom-select__option').forEach(opt => {
                opt.classList.toggle('selected', opt.getAttribute('data-value') === 'android');
            });
        }

        // Reset app select display
        const appSpan = document.querySelector('#tc-app-selected .custom-select__text');
        if (appSpan) appSpan.textContent = window.i18n.t('testCase.selectApp');
        const appOpts = this.els.appOptions;
        if (appOpts) {
            appOpts.querySelectorAll('.custom-select__option').forEach(opt => opt.classList.remove('selected'));
        }

        // Reset markers
        const markersOpts = this.els.markersOptions;
        if (markersOpts) {
            markersOpts.querySelectorAll('.custom-select__option').forEach(opt => opt.classList.remove('selected'));
        }

        // Reset steps section
        this.updateStepsSectionState(false);
        this.showStepsEmpty();
    },

    setFileName(fileName) {
        if (this.els.fileName) this.els.fileName.value = fileName || '';
    },
};

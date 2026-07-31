/**
 * TestCaseView - Test Case Tab View Layer (MVC)
 *
 * Pure DOM operations. No API calls, no state management.
 * Receives data from Controller, renders to DOM.
 */
import { Icons } from '../../icons.js';
import { DeviceCascadeSelect } from '../../components/device-cascade-select.js';
import { fileManagementMixin } from './mixins/fileManagementMixin.js';
import { selectMixin } from './mixins/selectMixin.js';
import { stepsMainMixin } from './mixins/stepsMainMixin.js';
import { stepsElementMixin } from './mixins/stepsElementMixin.js';
import { stepsOperationMixin } from './mixins/stepsOperationMixin.js';
import { stepsPageMixin } from './mixins/stepsPageMixin.js';
import { stepsDeviceMixin } from './mixins/stepsDeviceMixin.js';
import { formDropdownMixin } from './mixins/formDropdownMixin.js';
import { formEditorInitMixin } from './mixins/formEditorInitMixin.js';
import { formWarningMixin } from './mixins/formWarningMixin.js';
import { formCollectMixin } from './mixins/formCollectMixin.js';
import { formConfirmModalMixin } from './mixins/formConfirmModalMixin.js';
import { formStepBridgeMixin } from './mixins/formStepBridgeMixin.js';
import { formHelpersMixin } from './mixins/formHelpersMixin.js';

export class TestCaseView {
    constructor() {
        // Cache all static DOM element references
        this.els = {
            selectDirectoryBtn: document.getElementById('tc-select-directory-btn'),
            searchInput: document.getElementById('tc-search-input'),
            searchClear: document.getElementById('tc-search-clear'),
            searchSpinner: document.getElementById('tc-search-spinner'),
            addNewBtn: document.getElementById('tc-add-new-btn'),
            addStepBtn: document.getElementById('tc-add-step-btn'),
            addStepBottomBtn: document.getElementById('tc-add-step-bottom-btn'),
            cancelBtn: document.getElementById('tc-cancel-btn'),
            saveBtn: document.getElementById('tc-save-btn'),
            deleteBtn: document.getElementById('tc-delete-btn'),
            selectedDirectory: document.getElementById('tc-selected-directory'),
            testFilesList: document.getElementById('tc-test-files-list'),
            editorEmpty: document.getElementById('tc-editor-empty'),
            editorForm: document.getElementById('tc-editor-form'),
            fileName: document.getElementById('tc-file-name'),
            fileNameError: document.getElementById('tc-file-name-error'),
            jsonMissingWarning: document.getElementById('tc-json-missing-warning'),
            caseName: document.getElementById('tc-case-name'),
            description: document.getElementById('tc-description'),
            allureEpic: document.getElementById('tc-allure-epic'),
            allureFeature: document.getElementById('tc-allure-feature'),
            allureStory: document.getElementById('tc-allure-story'),
            appLoadWaitTime: document.getElementById('tc-app-load-wait-time'),
            elementWaitTimeout: document.getElementById('tc-element-wait-timeout'),
            stepInterval: document.getElementById('tc-step-interval'),
            appCloseWaitTime: document.getElementById('tc-app-close-wait-time'),
            markersSelect: document.getElementById('tc-markers-select'),
            markersOptions: document.getElementById('tc-markers-options'),
            markersSelected: document.getElementById('tc-markers-selected'),
            appSelect: document.getElementById('tc-app-select'),
            appSelected: document.getElementById('tc-app-selected'),
            appOptions: document.getElementById('tc-app-options'),
            platformSelectWrapperSelect: document.getElementById('tc-platform-select-wrapper-select'),
            platformSelectWrapperOptions: document.getElementById('tc-platform-select-wrapper-options'),
            platformOptions: document.getElementById('tc-platform-options'),
            platformSelected: document.getElementById('tc-platform-selected'),
            stepsSection: document.getElementById('tc-steps-section'),
            stepsContainer: document.getElementById('tc-steps-container'),
            stepsEmpty: document.getElementById('tc-steps-empty'),
            stepsList: document.getElementById('tc-steps-list'),
            caseForm: document.getElementById('tc-case-form'),
        };
    }

    // ─── Icon Helper ───────────────────────────────────────────────

    getIconHtml(iconName, style = '') {
        if (!Icons[iconName]) return '';
    return `<span class="svg-icon" data-icon="${iconName}" style="${style}">${Icons[iconName]}</span>`;
    }
}

Object.assign(
    TestCaseView.prototype,
    fileManagementMixin,
    selectMixin,
    // stepsMixin (sub-split)
    stepsMainMixin,
    stepsElementMixin,
    stepsOperationMixin,
    stepsPageMixin,
    stepsDeviceMixin,
    // formMixin (sub-split)
    formDropdownMixin,
    formEditorInitMixin,
    formWarningMixin,
    formCollectMixin,
    formConfirmModalMixin,
    formStepBridgeMixin,
    formHelpersMixin
);

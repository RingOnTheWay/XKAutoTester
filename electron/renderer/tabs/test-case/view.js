/**
 * TestCaseView - Test Case Tab View Layer (MVC)
 *
 * Pure DOM operations. No API calls, no state management.
 * Receives data from Controller, renders to DOM.
 */
import { Icons } from '../../icons.js';
import { DeviceCascadeSelect } from '../../components/device-cascade-select.js';

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

    // ─── File Management ───────────────────────────────────────────

    renderSelectedDirectory(path) {
        const el = this.els.selectedDirectory;
        if (!el) return;
        if (path) {
            const folderName = path.split(/[\\/]/).pop();
            el.textContent = folderName;
            el.title = path;
            el.removeAttribute('data-i18n');
        } else {
            el.textContent = window.i18n.t('testCase.noDirectorySelected');
            el.setAttribute('data-i18n', 'testCase.noDirectorySelected');
        }
    }

    renderTestFiles(files, jsonExistsMap, searchQuery) {
        const container = this.els.testFilesList;
        if (!container) return;

        container.innerHTML = '';

        if (!files || files.length === 0) {
            container.innerHTML = `
                <div class="placeholder-message">
                    ${this.getIconHtml('info')}
                    <span data-i18n="testCase.noTestFiles">${window.i18n.t('testCase.noTestFiles')}</span>
                </div>
            `;
            return;
        }

        let filesToDisplay = files;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filesToDisplay = files.filter(f => f.name.toLowerCase().includes(q));
        }

        if (filesToDisplay.length === 0) {
            container.innerHTML = `
                <div class="tc-no-search-results">
                    ${this.getIconHtml('search_x')}
                    <span data-i18n="testCase.noSearchResults">${window.i18n.t('testCase.noSearchResults')}</span>
                </div>
            `;
            return;
        }

        const fragment = document.createDocumentFragment();
        filesToDisplay.forEach(file => {
            const fileName = file.name.replace(/\.[^/.]+$/, '');
            const jsonMissing = jsonExistsMap[fileName] === false;
            const fileElement = document.createElement('div');
            fileElement.className = 'test-case-file-item' + (jsonMissing ? ' json-missing' : '');
            fileElement.setAttribute('data-path', file.path);
            fileElement.setAttribute('data-file-name', fileName);
            fileElement.setAttribute('data-py-file-path', file.path);
            fileElement.innerHTML = `
                ${jsonMissing ? this.getIconHtml('alert_triangle') : this.getIconHtml('description')}
                <span>${file.name}</span>
                ${jsonMissing ? '<span class="tc-json-missing-badge" data-i18n="testCase.jsonMissing">' + window.i18n.t('testCase.jsonMissing') + '</span>' : ''}
            `;
            fragment.appendChild(fileElement);
        });
        container.appendChild(fragment);
    }

    updateAddButtonState(enabled) {
        const btn = this.els.addNewBtn;
        if (!btn) return;
        if (enabled) {
            btn.classList.remove('disabled');
            btn.disabled = false;
        } else {
            btn.classList.add('disabled');
            btn.disabled = true;
        }
    }

    updateSearchState(enabled) {
        const input = this.els.searchInput;
        const clearBtn = this.els.searchClear;
        if (input) {
            input.disabled = !enabled;
            if (!enabled) {
                input.classList.add('disabled');
            } else {
                input.classList.remove('disabled');
            }
        }
        if (clearBtn) {
            clearBtn.disabled = !enabled;
        }
    }

    showSearchSpinner() {
        const el = this.els.searchSpinner;
        if (el) el.classList.remove('hidden');
    }

    hideSearchSpinner() {
        const el = this.els.searchSpinner;
        if (el) el.classList.add('hidden');
    }

    clearSearchInput() {
        const el = this.els.searchInput;
        if (el) el.value = '';
    }

    // ─── Editor State ──────────────────────────────────────────────

    showEditor() {
        if (this.els.editorEmpty) this.els.editorEmpty.classList.add('hidden');
        if (this.els.editorForm) this.els.editorForm.classList.remove('hidden');
    }

    /**
     * 显示编辑器 UI（含标题、文件名、按钮状态等）
     * @param {Object} opts - { file, isNew, jsonMissing, fileName }
     */
    showEditorUI({ file, isNew, jsonMissing, fileName }) {
        const emptyState = this.els.editorEmpty;
        const editorForm = this.els.editorForm;
        const titleElement = editorForm?.querySelector('.card-header h3');
        const deleteBtn = this.els.deleteBtn;
        const saveBtn = this.els.saveBtn;
        const fileNameInput = this.els.fileName;

        if (emptyState) emptyState.classList.add('hidden');
        if (editorForm) editorForm.classList.remove('hidden');

        if (isNew) {
            // 新建模式 — 先重置表单
            this.resetForm();
            if (titleElement) {
                titleElement.setAttribute('data-i18n', 'testCase.newCase');
                titleElement.textContent = window.i18n.t('testCase.newCase');
            }
            if (fileNameInput) {
                fileNameInput.value = '';
                fileNameInput.disabled = false;
            }
            if (deleteBtn) deleteBtn.classList.add('hidden');
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.classList.remove('disabled');
            }
            // 移除 JSON 缺失警告
            const existingWarning = document.getElementById('tc-json-missing-warning');
            if (existingWarning) existingWarning.remove();
            // 启用所有表单输入
            if (editorForm) {
                editorForm.querySelectorAll('input, select, textarea, button').forEach(el => {
                    el.disabled = false;
                    el.classList.remove('disabled');
                });
            }
        } else if (jsonMissing) {
            // JSON 缺失模式
            if (titleElement) {
                titleElement.setAttribute('data-i18n', 'testCase.editCase');
                titleElement.textContent = window.i18n.t('testCase.editCase');
            }
            if (fileNameInput) {
                fileNameInput.value = fileName;
                fileNameInput.disabled = true;
            }
            if (deleteBtn) deleteBtn.classList.remove('hidden');
            if (saveBtn) {
                saveBtn.disabled = true;
                saveBtn.classList.add('disabled');
            }
            // 禁用所有表单输入（除删除和取消按钮）
            if (editorForm) {
                editorForm.querySelectorAll('input, select, textarea, button:not(#tc-delete-btn):not(#tc-cancel-btn)').forEach(el => {
                    el.disabled = true;
                    el.classList.add('disabled');
                });
            }
            this.showJsonMissingWarning(fileName);
        } else {
            // 编辑模式
            if (titleElement) {
                titleElement.setAttribute('data-i18n', 'testCase.editCase');
                titleElement.textContent = window.i18n.t('testCase.editCase');
            }
            if (fileNameInput) {
                fileNameInput.value = fileName;
                fileNameInput.disabled = false;
            }
            if (deleteBtn) deleteBtn.classList.remove('hidden');
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.classList.remove('disabled');
            }
            // 移除 JSON 缺失警告
            const existingWarning = document.getElementById('tc-json-missing-warning');
            if (existingWarning) existingWarning.remove();
            // 启用所有表单输入
            if (editorForm) {
                editorForm.querySelectorAll('input, select, textarea, button').forEach(el => {
                    el.disabled = false;
                    el.classList.remove('disabled');
                });
            }
        }

        // 滚动到顶部
        const editorContent = document.querySelector('.tc-editor-content');
        if (editorContent) editorContent.scrollTop = 0;
    }

    hideEditor() {
        if (this.els.editorForm) this.els.editorForm.classList.add('hidden');
        if (this.els.editorEmpty) this.els.editorEmpty.classList.remove('hidden');
        // 取消文件列表选中状态
        document.querySelectorAll('.test-case-file-item.selected').forEach(item => {
            item.classList.remove('selected');
        });
    }

    selectFileItem(element) {
        // 取消旧选中
        document.querySelectorAll('.test-case-file-item.selected').forEach(item => {
            item.classList.remove('selected');
        });
        // 添加新选中
        if (element) element.classList.add('selected');
    }

    setEditingState(isEditing) {
        // 更新编辑状态相关的 UI 元素
        if (this.els.saveBtn) this.els.saveBtn.disabled = !isEditing;
        if (this.els.cancelBtn) this.els.cancelBtn.disabled = !isEditing;
        if (this.els.deleteBtn) {
            this.els.deleteBtn.style.display = isEditing ? '' : 'none';
        }
    }

    setDirtyState(isDirty) {
        // 更新未保存更改状态的 UI 提示
        if (this.els.saveBtn) {
            this.els.saveBtn.classList.toggle('has-changes', isDirty);
        }
    }

    renderSelectedApp(app) {
        // 更新选中应用的显示
        this._currentApp = app;
        if (this.els.appSelected) {
            this.els.appSelected.textContent = app?.name || '';
        }
    }

    renderSelectedPlatform(platform) {
        // 更新选中平台的显示
        this._currentPlatform = platform;
        if (this.els.platformSelected) {
            this.els.platformSelected.textContent = platform || 'android';
        }
    }

    renderSelectedMarkers(markers) {
        this.updateMarkersDisplay(markers);
    }

    renderBleDevices(devices) {
        // BLE 设备列表已存储，供步骤渲染时使用
        this._bleDevices = devices;
    }

    // ─── Dropdown Utilities ────────────────────────────────────────

    /**
     * 定位下拉框到选中区域下方
     */
    positionDropdown(selected, options) {
        const rect = selected.getBoundingClientRect();

        if (rect.width === 0 && rect.height === 0) {
            options.style.top = '50%';
            options.style.left = '50%';
            options.style.width = '200px';
            options.style.transform = 'translate(-50%, -50%)';
            return;
        }

        const viewportHeight = window.innerHeight;
        options.classList.add('show');
        const actualOptionsHeight = options.offsetHeight || 200;

        const gap = 4;
        const threshold = 2;
        let top;

        const spaceBelow = viewportHeight - rect.bottom - gap;
        const spaceAbove = rect.top - gap;
        const requiredSpaceBelow = actualOptionsHeight * threshold;

        if (spaceAbove >= actualOptionsHeight && spaceBelow < requiredSpaceBelow) {
            top = rect.top - actualOptionsHeight - gap;
        } else if (spaceBelow >= actualOptionsHeight) {
            top = rect.bottom + gap;
        } else if (spaceAbove >= actualOptionsHeight) {
            top = rect.top - actualOptionsHeight - gap;
        } else {
            top = spaceBelow >= spaceAbove ? rect.bottom + gap : Math.max(10, rect.top - actualOptionsHeight - gap);
        }

        options.style.top = `${top}px`;
        options.style.left = `${rect.left}px`;
        options.style.width = `${rect.width}px`;
        options.style.transform = '';
    }

    /**
     * 阻止页面滚动（下拉框打开时）
     */
    preventScroll = (e) => {
        const mainContent = document.querySelector('.main-content');
        if (mainContent && mainContent.classList.contains('dropdown-open')) {
            e.preventDefault();
        }
    };

    /**
     * 关闭所有下拉框
     */
    closeAllDropdowns() {
        const hadOpen = document.querySelectorAll('.custom-select__options.show').length > 0;
        document.querySelectorAll('.custom-select__options.show').forEach(opt => {
            opt.classList.remove('show');
        });
        if (hadOpen) {
            const mainContent = document.querySelector('.main-content');
            if (mainContent) {
                mainContent.classList.remove('dropdown-open');
                mainContent.removeEventListener('wheel', this.preventScroll, { passive: false });
            }
        }
    }

    /**
     * 打开下拉框
     */
    openDropdown(selected, options) {
        this.closeAllDropdowns();
        this.positionDropdown(selected, options);
        options.classList.add('show');
        const mainContent = document.querySelector('.main-content');
        if (mainContent) {
            mainContent.classList.add('dropdown-open');
            mainContent.addEventListener('wheel', this.preventScroll, { passive: false });
        }
    }

    /**
     * 关闭单个下拉框
     */
    closeDropdown(options) {
        options.classList.remove('show');
        const mainContent = document.querySelector('.main-content');
        if (mainContent) {
            mainContent.classList.remove('dropdown-open');
            mainContent.removeEventListener('wheel', this.preventScroll, { passive: false });
        }
    }

    // ─── Editor Initialization ─────────────────────────────────────

    async initEditor() {
        this.#initAppSelect();
        this.#initPlatformSelect();
        this.#initMarkersSelect();
        this.#initCollapsible();
        this.#initDirtyListener();
        // 渲染平台选项（平台列表是静态的）
        this.renderPlatformOptions(
            [{ value: 'android', label: 'Android' }],
            this._currentPlatform || 'android'
        );
    }

    /**
     * 初始化应用选择下拉框
     */
    #initAppSelect() {
        const select = this.els.appSelect;
        if (!select || select.dataset.initialized === 'true') return;

        const selected = select.querySelector('.custom-select__selected');
        const options = this.els.appOptions;
        if (!selected || !options) return;

        document.body.appendChild(options);
        select.dataset.initialized = 'true';

        selected.addEventListener('click', (e) => {
            e.stopPropagation();
            const isShowing = options.classList.contains('show');
            if (!isShowing) {
                this.openDropdown(selected, options);
            } else {
                this.closeDropdown(options);
            }
        });
    }

    /**
     * 初始化平台选择下拉框
     */
    #initPlatformSelect() {
        const select = this.els.platformSelectWrapperSelect;
        if (!select || select.dataset.initialized === 'true') return;

        const selected = select.querySelector('.custom-select__selected');
        const options = this.els.platformSelectWrapperOptions;
        if (!selected || !options) return;

        document.body.appendChild(options);
        select.dataset.initialized = 'true';

        selected.addEventListener('click', (e) => {
            e.stopPropagation();
            const isShowing = options.classList.contains('show');
            if (!isShowing) {
                this.openDropdown(selected, options);
            } else {
                this.closeDropdown(options);
            }
        });
    }

    /**
     * 初始化 Markers 多选下拉框
     */
    #initMarkersSelect() {
        const select = this.els.markersSelect;
        if (!select || select.dataset.initialized === 'true') return;

        const selected = select.querySelector('.custom-select__selected');
        const options = this.els.markersOptions;
        if (!selected || !options) return;

        document.body.appendChild(options);
        select.dataset.initialized = 'true';

        selected.addEventListener('click', (e) => {
            e.stopPropagation();
            const isShowing = options.classList.contains('show');
            if (!isShowing) {
                this.openDropdown(selected, options);
            } else {
                this.closeDropdown(options);
            }
        });
    }

    /**
     * 初始化可折叠区域
     */
    #initCollapsible() {
        const headers = document.querySelectorAll('.tc-collapsible-header');
        headers.forEach(header => {
            if (header.dataset.initialized === 'true') return;
            header.dataset.initialized = 'true';
            header.addEventListener('click', () => {
                const section = header.closest('.tc-section-collapsible');
                if (section) section.classList.toggle('collapsed');
            });
        });
    }

    /**
     * 初始化编辑器表单 dirty 监听
     */
    #initDirtyListener() {
        const editorForm = this.els.editorForm;
        if (editorForm && !editorForm._dirtyListenerAdded) {
            editorForm.addEventListener('change', (e) => {
                if (e.target.matches('input, select, textarea') && !e.target.closest('.tc-step-card')) {
                    this._onDirty?.();
                }
            });
            editorForm._dirtyListenerAdded = true;
        }
    }

    /**
     * 设置 dirty 回调（由 controller 调用）
     */
    onDirty(callback) {
        this._onDirty = callback;
    }

    /**
     * 初始化步骤卡片内的所有 custom-select 组件
     * @param {HTMLElement} container - 步骤卡片容器
     */
    initStepSelects(container) {
        const selectWrappers = container.querySelectorAll('.tc-step-select-wrapper');

        selectWrappers.forEach(wrapper => {
            const select = wrapper.querySelector('.custom-select');
            if (!select || select.dataset.initialized) return;

            const selected = select.querySelector('.custom-select__selected');
            const options = select.querySelector('.custom-select__options');
            if (!selected || !options) return;

            select.dataset.initialized = 'true';

            // 移除 body 下已有的同 ID options
            if (options.id) {
                const existing = document.body.querySelector(`#${options.id}`);
                if (existing && existing !== options) existing.remove();
            }

            // 将下拉选项移到 body 下
            if (!options.dataset.moved) {
                document.body.appendChild(options);
                options.dataset.moved = 'true';
            }

            // 点击选中区域
            selected.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                const isShowing = options.classList.contains('show');
                if (!isShowing) {
                    this.openDropdown(selected, options);
                } else {
                    this.closeDropdown(options);
                }
            });
        });
    }

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
    }

    hideJsonMissingWarning() {
        const existing = document.getElementById('tc-json-missing-warning');
        if (existing) existing.remove();
    }

    showFileNameError(messageKey) {
        const errorEl = this.els.fileNameError;
        if (!errorEl) return;
        const messageSpan = errorEl.querySelector('span:last-child');
        if (messageSpan) {
            messageSpan.setAttribute('data-i18n', messageKey);
            messageSpan.textContent = window.i18n.t(messageKey);
        }
        errorEl.classList.remove('error-hidden');
    }

    hideFileNameError() {
        const errorEl = this.els.fileNameError;
        if (errorEl) errorEl.classList.add('error-hidden');
    }

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
    }

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
    }

    setFileName(fileName) {
        if (this.els.fileName) this.els.fileName.value = fileName || '';
    }

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
    }

    renderPlatformOptions(platforms, selectedPlatform) {
        // 使用 platformSelectWrapperOptions（script.js 动态生成的 options 容器 ID 为 tc-platform-select-wrapper-options）
        const optionsContainer = this.els.platformSelectWrapperOptions;
        if (!optionsContainer) return;

        optionsContainer.innerHTML = platforms.map(platform => `
            <div class="custom-select__option${selectedPlatform === platform.value ? ' selected' : ''}" data-value="${platform.value}">
                <span>${platform.label}</span>
            </div>
        `).join('');
    }

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
    }

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
    }

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
    }

    // ─── Steps ─────────────────────────────────────────────────────

    renderSteps(steps) {
        const container = this.els.stepsList;
        if (!container) return;

        // Cleanup cascade selects and moved options
        if (DeviceCascadeSelect && DeviceCascadeSelect.destroyAll) {
            DeviceCascadeSelect.destroyAll();
        }
        document.querySelectorAll('.custom-select__options[data-moved]').forEach(opt => opt.remove());

        container.innerHTML = '';

        const sorted = [...steps].sort((a, b) => a.order - b.order);
        sorted.forEach((step, index) => {
            // 注入关联数据供步骤卡片渲染使用
            step._app = this._currentApp || null;
            step._bleDevices = this._bleDevices || [];
            step._allSteps = sorted;
            const card = this.generateStepCard(step, index + 1);
            container.appendChild(card);
        });

        return { sorted };
    }

    showStepsEmpty() {
        const emptyDiv = this.els.stepsEmpty;
        const listDiv = this.els.stepsList;
        const bottomBtn = this.els.addStepBottomBtn;
        if (emptyDiv) emptyDiv.classList.remove('hidden');
        if (listDiv) listDiv.classList.add('hidden');
        if (bottomBtn) bottomBtn.classList.add('hidden');
    }

    hideStepsEmpty() {
        const emptyDiv = this.els.stepsEmpty;
        const listDiv = this.els.stepsList;
        const bottomBtn = this.els.addStepBottomBtn;
        if (emptyDiv) emptyDiv.classList.add('hidden');
        if (listDiv) listDiv.classList.remove('hidden');
        if (bottomBtn) bottomBtn.classList.remove('hidden');
    }

    generateStepCard(step, order) {
        const card = document.createElement('div');
        card.className = 'tc-step-card';
        card.setAttribute('data-step-id', step.id);
        card.setAttribute('data-step-order', step.order);

        card.innerHTML = `
            <div class="tc-step-drag-handle tc-step-drag-handle-top" data-drag-handle="true">
                <button type="button" class="tc-step-move-btn tc-step-move-up-btn" data-step-id="${step.id}" data-move="up" title="上移">
                    ${this.getIconHtml('arrow_upward')}
                </button>
                <div class="tc-drag-grip" data-drag-grip="true">
                    <span></span><span></span><span></span>
                </div>
                <button type="button" class="tc-step-move-btn tc-step-move-down-btn" data-step-id="${step.id}" data-move="down" title="下移">
                    ${this.getIconHtml('arrow_downward')}
                </button>
            </div>
            <div class="tc-step-header">
                <div class="tc-step-number">${order}</div>
                <div class="tc-step-name">
                    <input type="text" class="glass-input tc-step-name-input"
                           value="${step.name}" data-step-id="${step.id}">
                </div>
                <div class="tc-step-actions">
                    <button type="button" class="tc-step-btn tc-step-copy-btn" data-step-id="${step.id}" title="复制">
                        ${this.getIconHtml('content_copy')}
                    </button>
                    <button type="button" class="tc-step-btn tc-step-delete-btn" data-step-id="${step.id}" title="删除">
                        ${this.getIconHtml('delete')}
                    </button>
                </div>
            </div>
            <div class="tc-step-body">
                ${this.renderStepConfig(step)}
            </div>
            <div class="tc-step-drag-handle tc-step-drag-handle-bottom" data-drag-handle="true">
                <button type="button" class="tc-step-move-btn tc-step-move-up-btn" data-step-id="${step.id}" data-move="up" title="上移">
                    ${this.getIconHtml('arrow_upward')}
                </button>
                <div class="tc-drag-grip" data-drag-grip="true">
                    <span></span><span></span><span></span>
                </div>
                <button type="button" class="tc-step-move-btn tc-step-move-down-btn" data-step-id="${step.id}" data-move="down" title="下移">
                    ${this.getIconHtml('arrow_downward')}
                </button>
            </div>
        `;

        return card;
    }

    renderStepConfig(step) {
        let configHtml = `
            <div class="tc-step-type-selector">
                <label>步骤类型</label>
                <div class="tc-type-tabs">
                    <button type="button" class="tc-type-tab ${step.type === 'element' ? 'active' : ''}" data-type="element">
                        ${this.getIconHtml('touch_app')}
                        <span>元素操作</span>
                    </button>
                    <button type="button" class="tc-type-tab ${step.type === 'page' ? 'active' : ''}" data-type="page">
                        ${this.getIconHtml('pageview')}
                        <span>页面操作</span>
                    </button>
                    <button type="button" class="tc-type-tab ${step.type === 'system' ? 'active' : ''}" data-type="system">
                        ${this.getIconHtml('smartphone')}
                        <span>系统操作</span>
                    </button>
                    <button type="button" class="tc-type-tab ${step.type === 'ble' ? 'active' : ''}" data-type="ble">
                        ${this.getIconHtml('bluetooth')}
                        <span>蓝牙操作</span>
                    </button>
                </div>
            </div>
        `;

        switch (step.type) {
            case 'element':
                configHtml += this.renderElementConfig(step);
                break;
            case 'ble':
                configHtml += this.renderBleConfig(step);
                break;
            case 'page':
                configHtml += this.renderPageConfig(step);
                break;
            case 'system':
                configHtml += this.renderSystemConfig(step);
                break;
        }

        return configHtml;
    }

    renderElementConfig(step) {
        const config = step.config || {};
        const app = step._app; // Controller injects app reference
        const multiSelect = config.multiSelect || false;
        const clickCount = config.multiClickCount || 1;
        const selectedElements = config.selectedElements || [];

        // Page options
        let pageOptions = [{ value: '', label: '请选择页面', selected: !config.pageId }];
        if (app && app.pages) {
            app.pages.forEach(page => {
                pageOptions.push({ value: page.id, label: page.name, selected: config.pageId === page.id });
            });
        }

        // Element options
        let elementOptions = [{ value: '', label: '请选择元素', selected: true }];
        if (config.pageId && app) {
            const page = app.pages?.find(p => p.id === config.pageId);
            if (page && page.elements) {
                elementOptions = [{ value: '', label: '请选择元素', selected: !config.elementId }];
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
                            ${this.generateCustomSelect('tc-multi-element-select', elemOptions, '请选择元素', step.id, index)}
                            <button type="button" class="tc-multi-element-remove-btn" data-step-id="${step.id}" data-index="${index}">
                                ${this.getIconHtml('close')}
                            </button>
                        </div>
                        <div class="tc-multi-element-body">
                            <div class="form-group">
                                <label>操作类型</label>
                                ${this.generateCustomSelect('tc-multi-operation-select', elemOperationOptions, '请选择操作', step.id, index)}
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
                        <label>页面选择</label>
                        ${this.generateCustomSelect('tc-page-select', pageOptions, '请选择页面', step.id)}
                    </div>
                    <div class="form-group tc-element-select-group" data-step-id="${step.id}">
                        <div class="tc-element-select-header">
                            <label>元素选择</label>
                        </div>
                        <label class="tc-multi-select-toggle">
                            <input type="checkbox" class="tc-multi-select-checkbox" data-step-id="${step.id}" ${multiSelect ? 'checked' : ''}>
                            <span>元素多选</span>
                        </label>
                        <div class="tc-single-element-select ${multiSelect ? 'hidden' : ''}">
                            ${this.generateCustomSelect('tc-element-select', elementOptions, '请选择元素', step.id)}
                        </div>
                        <div class="tc-multi-element-config ${multiSelect ? '' : 'hidden'}">
                            <div class="tc-multi-element-count-row">
                                <span class="tc-multi-element-count-label">点击数量</span>
                                <input type="number" class="glass-input tc-multi-click-count" data-step-id="${step.id}"
                                       value="${clickCount}" min="1" max="${selectedElements.length || 1}">
                                <span class="tc-multi-element-hint">从 ${selectedElements.length || 0} 个元素中随机选择</span>
                            </div>
                            <div class="tc-multi-elements-list" data-step-id="${step.id}">
                                ${multiElementsHtml}
                            </div>
                            <button type="button" class="tc-add-multi-element-btn" data-step-id="${step.id}">
                                ${this.getIconHtml('add')}
                                <span>添加元素</span>
                            </button>
                        </div>
                    </div>
                </div>
                <div class="form-row tc-single-operation-row ${multiSelect ? 'hidden' : ''}">
                    <div class="form-group">
                        <label>操作类型</label>
                        ${this.generateCustomSelect('tc-operation-select', operationOptions, '请选择操作', step.id)}
                    </div>
                    <div class="form-group tc-operation-value-group" data-step-id="${step.id}">
                        ${this.renderOperationValue(step)}
                    </div>
                </div>
            </div>
        `;
    }

    renderOperationValue(step) {
        const config = step.config || {};
        const operation = config.operation || 'click';

        switch (operation) {
            case 'click':
                const clickCount = config.operationValue?.clickCount || 1;
                return `
                    <label>点击次数</label>
                    <input type="number" class="glass-input tc-click-count" data-step-id="${step.id}"
                           value="${clickCount}" min="1" max="10">
                `;

            case 'sendText':
                return this.renderSendTextConfig(step);

            case 'swipeUp':
            case 'swipeDown':
                const duration = config.operationValue?.swipeDuration || 500;
                return `
                    <label>滑动时间(ms)</label>
                    <input type="number" class="glass-input tc-swipe-duration" data-step-id="${step.id}"
                           value="${duration}" min="100" step="100">
                `;

            default:
                return '';
        }
    }

    renderSendTextConfig(step) {
        const config = step.config || {};
        const opValue = config.operationValue || {};
        const inputType = opValue.inputType || 'custom';

        const inputTypeOptions = [
            { value: 'custom', label: window.i18n.t('testCase.bleCustomData'), selected: inputType === 'custom' },
            { value: 'random', label: window.i18n.t('testCase.inputRandom'), selected: inputType === 'random' },
            { value: 'faker', label: window.i18n.t('testCase.inputFaker'), selected: inputType === 'faker' }
        ];

        return `
            <label>${window.i18n.t('testCase.inputContent')}</label>
            <div class="tc-sendtext-config">
                <div class="tc-input-type-selector">
                    ${this.generateCustomSelect('tc-input-type-select', inputTypeOptions, window.i18n.t('testCase.inputType'), step.id)}
                </div>
                <div class="tc-input-value-container" data-step-id="${step.id}">
                    ${this.renderInputValueArea(step, inputType)}
                </div>
            </div>
        `;
    }

    renderInputValueArea(step, inputType) {
        const opValue = step.config?.operationValue || {};

        switch (inputType) {
            case 'custom':
                return `
                    <input type="text" class="glass-input tc-custom-input" data-step-id="${step.id}"
                           value="${opValue.inputValue || ''}" placeholder="输入文本内容">
                `;

            case 'random':
                const randomConfig = opValue.randomConfig || {};
                const precisionOptions = [
                    { value: '0', label: '整数', selected: randomConfig.precision === 0 || !randomConfig.precision },
                    { value: '1', label: '1位小数', selected: randomConfig.precision === 1 },
                    { value: '2', label: '2位小数', selected: randomConfig.precision === 2 },
                    { value: '3', label: '3位小数', selected: randomConfig.precision === 3 },
                    { value: '4', label: '4位小数', selected: randomConfig.precision === 4 },
                    { value: '5', label: '5位小数', selected: randomConfig.precision === 5 }
                ];
                return `
                    <div class="tc-random-config">
                        <div class="form-row">
                            <div class="form-group">
                                <label>最小值</label>
                                <input type="number" class="glass-input tc-random-min" data-step-id="${step.id}"
                                       value="${randomConfig.minValue || 0}" step="0.1">
                            </div>
                            <div class="form-group">
                                <label>最大值</label>
                                <input type="number" class="glass-input tc-random-max" data-step-id="${step.id}"
                                       value="${randomConfig.maxValue || 100}" step="0.1">
                            </div>
                            <div class="form-group">
                                <label>精度</label>
                                ${this.generateCustomSelect('tc-random-precision', precisionOptions, '请选择精度', step.id)}
                            </div>
                        </div>
                    </div>
                `;

            case 'faker':
                return this.renderFakerConfig(step);

            default:
                return '';
        }
    }

    renderFakerConfig(step) {
        const opValue = step.config?.operationValue || {};
        const fakerConfig = opValue.fakerConfig || {};

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
                        ${this.generateCustomSelect('tc-faker-locale', localeOptions, window.i18n.t('testCase.fakerLocale'), step.id)}
                    </div>
                    <div class="tc-faker-field">
                        <label>${typeLabel}</label>
                        ${this.generateCustomSelect('tc-faker-provider', providerOptions, window.i18n.t('testCase.fakerType'), step.id)}
                    </div>
                </div>
                <div class="tc-faker-example">
                    <span class="tc-faker-example-label">${exampleLabel}:</span>
                    <span class="tc-faker-example-value">${currentProvider?.example || ''}</span>
                </div>
            </div>
        `;
    }

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
    }

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
    }

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
        const toleranceDisabled = !isBleTarget && compareConfig.targetValue && isNaN(parseFloat(compareConfig.targetValue));

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
    }

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
                        ${this.generateCustomSelect(`tc-ble-param-${param.key}`, options, param.placeholder || '请选择', stepId)}
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
    }

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
    }

    renderMultiOperationValue(step, index, operation, operationValue) {
        switch (operation) {
            case 'click':
                const clickCount = operationValue.clickCount || 1;
                return `
                    <label>点击次数</label>
                    <input type="number" class="glass-input tc-multi-click-count-input" data-step-id="${step.id}" data-index="${index}"
                           value="${clickCount}" min="1" max="10">
                `;

            case 'sendText':
                return this.renderMultiSendTextConfig(step, index, operationValue);

            case 'swipeUp':
            case 'swipeDown':
                const swipeDuration = operationValue.swipeDuration || 500;
                return `
                    <label>滑动时间(ms)</label>
                    <input type="number" class="glass-input tc-multi-swipe-duration" data-step-id="${step.id}" data-index="${index}"
                           value="${swipeDuration}" min="100" step="100">
                `;

            default:
                return '';
        }
    }

    renderMultiSendTextConfig(step, index, operationValue) {
        const inputType = operationValue.inputType || 'custom';
        const inputOptions = [
            { value: 'custom', label: window.i18n.t('testCase.bleCustomData'), selected: inputType === 'custom' },
            { value: 'random', label: window.i18n.t('testCase.inputRandom'), selected: inputType === 'random' },
            { value: 'faker', label: window.i18n.t('testCase.inputFaker'), selected: inputType === 'faker' }
        ];

        return `
            <label>${window.i18n.t('testCase.inputContent')}</label>
            <div class="tc-sendtext-config">
                <div class="tc-input-type-selector">
                    ${this.generateCustomSelect('tc-multi-input-type-select', inputOptions, window.i18n.t('testCase.inputType'), step.id, index)}
                </div>
                <div class="tc-input-value-container" data-step-id="${step.id}" data-index="${index}">
                    ${this.renderMultiInputValueArea(step, index, inputType, operationValue)}
                </div>
            </div>
        `;
    }

    renderMultiInputValueArea(step, index, inputType, operationValue) {
        switch (inputType) {
            case 'custom':
                return `
                    <input type="text" class="glass-input tc-multi-custom-input" data-step-id="${step.id}" data-index="${index}"
                           value="${operationValue.inputValue || ''}" placeholder="输入文本内容">
                `;

            case 'random':
                const randomConfig = operationValue.randomConfig || {};
                const precisionOptions = [
                    { value: '0', label: '整数', selected: randomConfig.precision === 0 || !randomConfig.precision },
                    { value: '1', label: '1位小数', selected: randomConfig.precision === 1 },
                    { value: '2', label: '2位小数', selected: randomConfig.precision === 2 },
                    { value: '3', label: '3位小数', selected: randomConfig.precision === 3 },
                    { value: '4', label: '4位小数', selected: randomConfig.precision === 4 },
                    { value: '5', label: '5位小数', selected: randomConfig.precision === 5 }
                ];
                return `
                    <div class="tc-random-config">
                        <div class="form-row">
                            <div class="form-group">
                                <label>最小值</label>
                                <input type="number" class="glass-input tc-multi-random-min" data-step-id="${step.id}" data-index="${index}"
                                       value="${randomConfig.minValue || 0}" step="0.1">
                            </div>
                            <div class="form-group">
                                <label>最大值</label>
                                <input type="number" class="glass-input tc-multi-random-max" data-step-id="${step.id}" data-index="${index}"
                                       value="${randomConfig.maxValue || 100}" step="0.1">
                            </div>
                            <div class="form-group">
                                <label>精度</label>
                                ${this.generateCustomSelect('tc-multi-random-precision', precisionOptions, '请选择精度', step.id, index)}
                            </div>
                        </div>
                    </div>
                `;

            case 'faker':
                return this.renderMultiFakerConfig(step, index, operationValue);

            default:
                return '';
        }
    }

    renderMultiFakerConfig(step, index, operationValue) {
        const fakerConfig = operationValue.fakerConfig || {};

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
                        ${this.generateCustomSelect('tc-multi-faker-locale', localeOptions, window.i18n.t('testCase.fakerLocale'), step.id, index)}
                    </div>
                    <div class="tc-faker-field">
                        <label>${typeLabel}</label>
                        ${this.generateCustomSelect('tc-multi-faker-provider', providerOptions, window.i18n.t('testCase.fakerType'), step.id, index)}
                    </div>
                </div>
                <div class="tc-faker-example">
                    <span class="tc-faker-example-label">${exampleLabel}:</span>
                    <span class="tc-faker-example-value">${currentProvider?.example || ''}</span>
                </div>
            </div>
        `;
    }

    // ─── Custom Select ─────────────────────────────────────────────

    generateCustomSelect(selectId, options, placeholder = '请选择', stepId = '', index = -1) {
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
    }

    // ─── Element/Operation Options ─────────────────────────────────

    getElementOptionsForPage(pageId, selectedValue, app) {
        let elementOptions = [{ value: '', label: '请选择元素', selected: !selectedValue }];
        if (pageId && app) {
            const page = app.pages?.find(p => p.id === pageId);
            if (page && page.elements) {
                page.elements.forEach(element => {
                    elementOptions.push({ value: element.id, label: element.name, selected: selectedValue === element.id });
                });
            }
        }
        return elementOptions;
    }

    getOperationOptionsForLocator(locatorType, currentOperation) {
        const isClickLocator = locatorType === 'click';
        const options = [
            { value: 'click', label: '点击', selected: currentOperation === 'click' || !currentOperation },
            { value: 'swipeUp', label: '向上滑动(页面向下)', selected: currentOperation === 'swipeUp' },
            { value: 'swipeDown', label: '向下滑动(页面向上)', selected: currentOperation === 'swipeDown' }
        ];
        if (!isClickLocator) {
            options.splice(1, 0, { value: 'sendText', label: '发送文本', selected: currentOperation === 'sendText' });
        }
        return options;
    }

    // ─── Collect Form Data ─────────────────────────────────────────

    collectFormData() {
        const fileName = this.els.fileName?.value?.trim() || '';
        const caseName = this.els.caseName?.value?.trim() || '';
        const description = this.els.description?.value?.trim() || '';
        const epic = this.els.allureEpic?.value?.trim() || '';
        const feature = this.els.allureFeature?.value?.trim() || '';
        const story = this.els.allureStory?.value?.trim() || '';

        return {
            fileName,
            name: caseName || fileName,
            description,
            allureConfig: { epic, feature, story },
            waitTimeConfig: {
                appLoadWaitTime: parseFloat(this.els.appLoadWaitTime?.value) || 10,
                elementWaitTimeout: parseFloat(this.els.elementWaitTimeout?.value) || 30,
                stepInterval: parseFloat(this.els.stepInterval?.value) || 2,
                appCloseWaitTime: parseFloat(this.els.appCloseWaitTime?.value) || 2
            }
        };
    }

    // ─── Private Helpers ───────────────────────────────────────────

    _getElementLocatorType(pageId, elementId, app) {
        if (pageId && elementId && app) {
            const page = app.pages?.find(p => p.id === pageId);
            const element = page?.elements?.find(el => el.id === elementId);
            return element?.locator || null;
        }
        return null;
    }

    _getFakerProviders() {
        return {
            'zh_CN': [
                { value: 'person.name', label: window.i18n.t('testCase.fakerProviders.personName'), example: '张三' },
                { value: 'person.phone', label: window.i18n.t('testCase.fakerProviders.personPhone'), example: '13812345678' },
                { value: 'person.email', label: window.i18n.t('testCase.fakerProviders.personEmail'), example: 'zhangsan@example.com' },
                { value: 'address.city', label: window.i18n.t('testCase.fakerProviders.addressCity'), example: '北京市' },
                { value: 'address.address', label: window.i18n.t('testCase.fakerProviders.addressAddress'), example: '朝阳区xxx街道' },
                { value: 'company.name', label: window.i18n.t('testCase.fakerProviders.companyName'), example: '科技有限公司' }
            ],
            'en_US': [
                { value: 'person.name', label: window.i18n.t('testCase.fakerProviders.personName'), example: 'John Smith' },
                { value: 'person.phone', label: window.i18n.t('testCase.fakerProviders.personPhone'), example: '+1-555-123-4567' },
                { value: 'person.email', label: window.i18n.t('testCase.fakerProviders.personEmail'), example: 'john@example.com' },
                { value: 'address.city', label: window.i18n.t('testCase.fakerProviders.addressCity'), example: 'New York' },
                { value: 'address.address', label: window.i18n.t('testCase.fakerProviders.addressAddress'), example: '123 Main St' },
                { value: 'company.name', label: window.i18n.t('testCase.fakerProviders.companyName'), example: 'Tech Corp' }
            ],
            'ja_JP': [
                { value: 'person.name', label: window.i18n.t('testCase.fakerProviders.personName'), example: '田中太郎' },
                { value: 'person.phone', label: window.i18n.t('testCase.fakerProviders.personPhone'), example: '090-1234-5678' },
                { value: 'person.email', label: window.i18n.t('testCase.fakerProviders.personEmail'), example: 'tanaka@example.jp' },
                { value: 'address.city', label: window.i18n.t('testCase.fakerProviders.addressCity'), example: '東京都' },
                { value: 'address.address', label: window.i18n.t('testCase.fakerProviders.addressAddress'), example: '渋谷区xxx' },
                { value: 'company.name', label: window.i18n.t('testCase.fakerProviders.companyName'), example: '株式会社テック' }
            ],
            'ko_KR': [
                { value: 'person.name', label: window.i18n.t('testCase.fakerProviders.personName'), example: '김철수' },
                { value: 'person.phone', label: window.i18n.t('testCase.fakerProviders.personPhone'), example: '010-1234-5678' },
                { value: 'person.email', label: window.i18n.t('testCase.fakerProviders.personEmail'), example: 'kim@example.kr' },
                { value: 'address.city', label: window.i18n.t('testCase.fakerProviders.addressCity'), example: '서울특별시' },
                { value: 'address.address', label: window.i18n.t('testCase.fakerProviders.addressAddress'), example: '강남구 xxx' },
                { value: 'company.name', label: window.i18n.t('testCase.fakerProviders.companyName'), example: '테크주식회사' }
            ]
        };
    }
}

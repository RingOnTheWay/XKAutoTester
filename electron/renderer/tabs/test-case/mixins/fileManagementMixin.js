// File Management + Editor State mixin for TestCaseView
// Extracted from view.js during refactor (N12)
// Provides: file list rendering, search state, editor show/hide, selection state, app/platform/markers display

export const fileManagementMixin = {
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
    },

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
    },

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
    },

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
    },

    showSearchSpinner() {
        const el = this.els.searchSpinner;
        if (el) el.classList.remove('hidden');
    },

    hideSearchSpinner() {
        const el = this.els.searchSpinner;
        if (el) el.classList.add('hidden');
    },

    clearSearchInput() {
        const el = this.els.searchInput;
        if (el) el.value = '';
    },

    renderSearchLoading() {
        const container = this.els.testFilesList;
        if (!container) return;
        container.innerHTML = `
            <div class="tc-search-loading">
                <div class="tc-search-loading-spinner"></div>
                <span data-i18n="testCase.searchingFiles">${window.i18n.t('testCase.searchingFiles')}</span>
            </div>
        `;
    },

    // ─── Editor State ──────────────────────────────────────────────

    showEditor() {
        if (this.els.editorEmpty) this.els.editorEmpty.classList.add('hidden');
        if (this.els.editorForm) this.els.editorForm.classList.remove('hidden');
    },

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
            // JSON 缺失模式 — 先重置表单,避免残留前一个用例的值
            this.resetForm();
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
    },

    hideEditor() {
        if (this.els.editorForm) this.els.editorForm.classList.add('hidden');
        if (this.els.editorEmpty) this.els.editorEmpty.classList.remove('hidden');
        // 取消文件列表选中状态
        document.querySelectorAll('.test-case-file-item.selected').forEach(item => {
            item.classList.remove('selected');
        });
    },

    selectFileItem(element) {
        // 取消旧选中
        document.querySelectorAll('.test-case-file-item.selected').forEach(item => {
            item.classList.remove('selected');
        });
        // 添加新选中
        if (element) element.classList.add('selected');
    },

    setEditingState(isEditing) {
        // 更新编辑状态相关的 UI 元素
        if (this.els.saveBtn) this.els.saveBtn.disabled = !isEditing;
        if (this.els.cancelBtn) this.els.cancelBtn.disabled = !isEditing;
        if (this.els.deleteBtn) {
            this.els.deleteBtn.style.display = isEditing ? '' : 'none';
        }
    },

    setDirtyState(isDirty) {
        // 更新未保存更改状态的 UI 提示
        if (this.els.saveBtn) {
            this.els.saveBtn.classList.toggle('has-changes', isDirty);
        }
    },

    renderSelectedApp(app) {
        // 更新选中应用的显示
        this._currentApp = app;
        if (this.els.appSelected) {
            this.els.appSelected.textContent = app?.name || '';
        }
    },

    renderSelectedPlatform(platform) {
        // 更新选中平台的显示
        this._currentPlatform = platform;
        if (this.els.platformSelected) {
            this.els.platformSelected.textContent = platform || 'android';
        }
    },

    renderSelectedMarkers(markers) {
        this.updateMarkersDisplay(markers);
    },

    renderBleDevices(devices) {
        // BLE 设备列表已存储，供步骤渲染时使用
        this._bleDevices = devices;
    },
};

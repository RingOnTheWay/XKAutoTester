// filePanelRenderer — TestCaseView 文件面板渲染域 (R28 候选③ 拆分)
// 从 tabs/test-case/view.js 拆出: 文件列表/搜索状态 + 编辑器显隐/编辑态渲染 + 绑定入口。
// 保持方法体 / this 引用不变 (this 指向 TestCaseView 实例), 由 view.js 在类后
// Object.assign 到 TestCaseView.prototype。
export const filePanelRenderer = {
  // ═════════════════════════════════════════════════════════════════
  // ─── File Management + Editor State (原 fileManagementMixin) ─────
  // ═════════════════════════════════════════════════════════════════

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
      filesToDisplay = files.filter((f) => f.name.toLowerCase().includes(q));
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
    filesToDisplay.forEach((file) => {
      const fileName = file.name.replace(/\.[^/.]+$/, '');
      const jsonMissing = jsonExistsMap[fileName] === false;
      const fileElement = document.createElement('div');
      fileElement.className = 'test-case-file-item' + (jsonMissing ? ' json-missing' : '');
      fileElement.setAttribute('data-path', file.path);
      fileElement.setAttribute('data-file-name', fileName);
      fileElement.setAttribute('data-py-file-path', file.path);
      fileElement.innerHTML = `
                ${jsonMissing ? this.getIconHtml('alert_triangle') : this.getIconHtml('description')}
                <span>${this.escapeHtml(file.name)}</span>
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
      // 启用所有表单输入 (含 div 自绘 custom-select, R27: jsonMissing 曾残留禁用态须清)
      if (editorForm) {
        editorForm.querySelectorAll('input, select, textarea, button, .custom-select-wrapper').forEach((el) => {
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
      // 禁用所有表单输入（除删除和取消按钮）— 含 div 自绘 custom-select (platform/app
      // 下拉), R27: 原 selector 只覆盖 input/select/textarea/button, 平台/应用卡片漏禁
      if (editorForm) {
        editorForm
          .querySelectorAll(
            'input, select, textarea, button:not(#tc-delete-btn):not(#tc-cancel-btn), .custom-select-wrapper'
          )
          .forEach((el) => {
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
      // 启用所有表单输入 (含 div 自绘 custom-select)
      if (editorForm) {
        editorForm.querySelectorAll('input, select, textarea, button, .custom-select-wrapper').forEach((el) => {
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
    document.querySelectorAll('.test-case-file-item.selected').forEach((item) => {
      item.classList.remove('selected');
    });
  },

  selectFileItem(element) {
    // 取消旧选中
    document.querySelectorAll('.test-case-file-item.selected').forEach((item) => {
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

  /**
   * 绑定搜索输入框 input 事件
   * @param {Function} handler - (query: string) => void
   * @returns {Function} unbind
   */
  bindSearchInput(handler) {
    const { searchInput } = this.els;
    if (!searchInput) return () => {};
    const listener = (e) => handler(e.target.value.trim());
    searchInput.addEventListener('input', listener);
    return () => searchInput.removeEventListener('input', listener);
  },

  /**
   * 绑定文件列表委托 click 事件
   * @param {Function} handler - (file: {name, pyFilePath}, fileItem: Element) => void
   * @returns {Function} unbind
   */
  bindFileListClick(handler) {
    const container = this.els.testFilesList;
    if (!container) return () => {};
    const clickHandler = (e) => {
      const fileItem = e.target.closest('.test-case-file-item');
      if (!fileItem) return;
      const fileName = fileItem.dataset.fileName;
      const pyFilePath = fileItem.dataset.pyFilePath;
      if (fileName) {
        handler({ name: fileName, pyFilePath }, fileItem);
      }
    };
    if (!container.__tcClickBound) {
      container.addEventListener('click', clickHandler);
      container.__tcClickBound = true;
      return () => {
        container.removeEventListener('click', clickHandler);
        container.__tcClickBound = false;
      };
    }
    return () => {};
  },
};

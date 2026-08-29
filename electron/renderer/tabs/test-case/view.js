/**
 * TestCaseView - Test Case Tab View Layer (MVC)
 *
 * Pure DOM operations. No API calls, no state management.
 * Receives data from Controller, renders to DOM.
 *
 * R10: 原 14 个 view mixin (fileManagement/select/stepsMain/stepsElement/stepsOperation/
 * stepsPage/stepsDevice/formDropdown/formEditorInit/formWarning/formCollect/
 * formConfirmModal/formStepBridge/formHelpers) 已内联到本类，移除 Object.assign prototype 注入。
 * 方法体保持不变，this 引用不变 (mixin 中 this 指实例，内联到 class 后仍指实例)。
 */
import { Icons } from '../../icons.js';
import { escapeHtml as escapeHtmlUtil } from '../../core/utils/html.js';
import { DeviceCascadeSelect } from '../../components/device-cascade-select.js';
import { applySelectRoute } from './modules/selectFieldRoutes.js';

// P3-13: 魔法数字命名常量
const DROPDOWN_GAP_PX = 4; // 下拉框与触发器间距
const DROPDOWN_SPACE_THRESHOLD = 2; // 上下空间判定阈值倍数
const DROPDOWN_MIN_TOP_OFFSET_PX = 10; // 顶部最小偏移
const DROPDOWN_FALLBACK_WIDTH_PX = 200; // 隐藏时兜底宽度
const DEFAULT_SWIPE_DURATION_MS = 500; // 滑动默认时长
const SWIPE_DURATION_MIN_MS = 100; // 滑动时长下限
const SWIPE_DURATION_STEP_MS = 100; // 滑动时长步进
const RANDOM_PRECISION_MAX = 5; // 随机数最大小数位

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

  renderSearchLoading() {
    const container = this.els.testFilesList;
    if (!container) return;
    container.innerHTML = `
            <div class="tc-search-loading">
                <div class="tc-search-loading-spinner"></div>
                <span data-i18n="testCase.searchingFiles">${window.i18n.t('testCase.searchingFiles')}</span>
            </div>
        `;
  }

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
        editorForm.querySelectorAll('input, select, textarea, button').forEach((el) => {
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
        editorForm
          .querySelectorAll('input, select, textarea, button:not(#tc-delete-btn):not(#tc-cancel-btn)')
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
      // 启用所有表单输入
      if (editorForm) {
        editorForm.querySelectorAll('input, select, textarea, button').forEach((el) => {
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
    document.querySelectorAll('.test-case-file-item.selected').forEach((item) => {
      item.classList.remove('selected');
    });
  }

  selectFileItem(element) {
    // 取消旧选中
    document.querySelectorAll('.test-case-file-item.selected').forEach((item) => {
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

  // P2-4: 公开访问器 (controller 不再直读私有 _currentApp/_bleDevices)
  getCurrentApp() {
    return this._currentApp || null;
  }

  getBleDevices() {
    return this._bleDevices || [];
  }

  /**
   * P2-4: 步骤渲染上下文统一注入 (controller.rerenderStepCard 与 renderSteps 共用)
   * 临时字段由本方法统一管理, 防散落注入
   * @param {Object} step
   * @param {Array} steps
   */
  injectStepContext(step, steps) {
    step._app = this.getCurrentApp();
    step._bleDevices = this.getBleDevices();
    step._allSteps = [...steps].sort((a, b) => a.order - b.order);
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

  // ═════════════════════════════════════════════════════════════════
  // ─── App/Platform/Markers Select + Custom Select (原 selectMixin) ─
  // ═════════════════════════════════════════════════════════════════

  renderAppOptions(apps, selectedAppId) {
    const optionsContainer = this.els.appOptions;
    if (!optionsContainer) return;

    if (apps.length === 0) {
      optionsContainer.innerHTML = `<div class="custom-select__option disabled"><span>${window.i18n.t('pagePackage.noApps')}</span></div>`;
      return;
    }

    optionsContainer.innerHTML = apps
      .map((app) => {
        const safeName = this.escapeHtml(app.name);
        const safeId = this.escapeHtml(app.id);
        return `
            <div class="custom-select__option${selectedAppId?.id === app.id ? ' selected' : ''}" data-value="${safeId}" data-name="${safeName}">
                <span>${safeName}</span>
            </div>
        `;
      })
      .join('');
  }

  renderPlatformOptions(platforms, selectedPlatform) {
    // 使用 platformSelectWrapperOptions（script.js 动态生成的 options 容器 ID 为 tc-platform-select-wrapper-options）
    const optionsContainer = this.els.platformSelectWrapperOptions;
    if (!optionsContainer) return;

    optionsContainer.innerHTML = platforms
      .map(
        (platform) => `
            <div class="custom-select__option${selectedPlatform === platform.value ? ' selected' : ''}" data-value="${platform.value}">
                <span>${platform.label}</span>
            </div>
        `
      )
      .join('');
  }

  renderMarkersOptions(markers, selectedMarkers) {
    const optionsContainer = this.els.markersOptions;
    if (!optionsContainer) return;

    if (!markers || markers.length === 0) {
      optionsContainer.innerHTML = `<div class="custom-select__option disabled"><span>${window.i18n.t('testExecution.noMarkers')}</span></div>`;
      return;
    }

    optionsContainer.innerHTML = markers
      .map((marker) => {
        const safeName = this.escapeHtml(marker.name);
        const safeDescription = this.escapeHtml(marker.description || '');
        return `
            <div class="custom-select__option${selectedMarkers.includes(marker.name) ? ' selected' : ''}" data-value="${safeName}" data-description="${safeDescription}">
                <span>${safeName}</span>
            </div>
        `;
      })
      .join('');
  }

  // R10: 转义用户可控文本，防止 XSS（marker 名称来自用户配置）
  escapeHtml(str) {
    // P2-5: 统一实现 (renderer/core/utils/html.js)
    return escapeHtmlUtil(str);
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
    selectedMarkers.forEach((marker) => {
      const safe = this.escapeHtml(marker);
      badgesHtml += `<span class="marker-badge" data-marker="${safe}">${safe}<span class="marker-badge-remove" data-marker="${safe}">x</span></span>`;
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

  generateCustomSelect(selectId, options, placeholder = window.i18n.t('common.pleaseSelect'), stepId = '', index = -1) {
    const selectedOption = options.find((opt) => opt.selected);
    const selectedText = selectedOption ? selectedOption.label : placeholder;

    const uniqueSuffix = index >= 0 ? `-${stepId}-${index}` : `-${stepId}`;
    const uniqueId = `${selectId}${uniqueSuffix}`;

    let optionsHtml = '';
    options.forEach((opt) => {
      optionsHtml += `<div class="custom-select__option${opt.selected ? ' selected' : ''}" data-value="${this.escapeHtml(opt.value)}"><span>${this.escapeHtml(opt.label)}</span></div>`;
    });

    return `
            <div class="custom-select-wrapper tc-step-select-wrapper" data-step-id="${stepId}" data-index="${index}">
                <div class="custom-select" id="${uniqueId}" data-select-id="${selectId}" data-step-id="${stepId}" data-index="${index}">
                    <div class="custom-select__selected" id="${uniqueId}-selected">
                        <span class="custom-select__text">${this.escapeHtml(selectedText)}</span>
                    </div>
                    <div class="custom-select__options" id="${uniqueId}-options">
                        ${optionsHtml}
                    </div>
                </div>
            </div>
        `;
  }

  getElementOptionsForPage(pageId, selectedValue, app) {
    let elementOptions = [
      {
        value: '',
        label: window.i18n.t('testCase.selectElement'),
        selected: !selectedValue,
      },
    ];
    if (pageId && app) {
      const page = app.pages?.find((p) => p.id === pageId);
      if (page && page.elements) {
        page.elements.forEach((element) => {
          elementOptions.push({
            value: element.id,
            label: element.name,
            selected: selectedValue === element.id,
          });
        });
      }
    }
    return elementOptions;
  }

  getOperationOptionsForLocator(locatorType, currentOperation) {
    const isClickLocator = locatorType === 'click';
    const options = [
      {
        value: 'click',
        label: window.i18n.t('testCase.opClick'),
        selected: currentOperation === 'click' || !currentOperation,
      },
      {
        value: 'swipeUp',
        label: window.i18n.t('testCase.opSwipeUp'),
        selected: currentOperation === 'swipeUp',
      },
      {
        value: 'swipeDown',
        label: window.i18n.t('testCase.opSwipeDown'),
        selected: currentOperation === 'swipeDown',
      },
    ];
    if (!isClickLocator) {
      options.splice(1, 0, {
        value: 'sendText',
        label: window.i18n.t('testCase.opSendText'),
        selected: currentOperation === 'sendText',
      });
    }
    return options;
  }

  // ═════════════════════════════════════════════════════════════════
  // ─── Steps Main (原 stepsMainMixin) ───────────────────────────────
  // ═════════════════════════════════════════════════════════════════

  renderSteps(steps) {
    const container = this.els.stepsList;
    if (!container) return;

    // Cleanup cascade selects and moved options (only test-case's own options)
    if (DeviceCascadeSelect && DeviceCascadeSelect.destroyAll) {
      DeviceCascadeSelect.destroyAll();
    }
    document.querySelectorAll('.custom-select__options[data-moved]').forEach((opt) => {
      // 只移除 test-case 的 options（ID 以 tc- 开头），避免误删其他 tab 的 options
      if (opt.id && opt.id.startsWith('tc-')) {
        opt.remove();
      }
    });

    container.innerHTML = '';

    const sorted = [...steps].sort((a, b) => a.order - b.order);
    sorted.forEach((step, index) => {
      // P2-4: 注入统一收敛到 injectStepContext
      this.injectStepContext(step, sorted);
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
                <button type="button" class="tc-step-move-btn tc-step-move-up-btn" data-step-id="${step.id}" data-move="up" title="${window.i18n.t('common.moveUp')}">
                    ${this.getIconHtml('arrow_upward')}
                </button>
                <div class="tc-drag-grip" data-drag-grip="true">
                    <span></span><span></span><span></span>
                </div>
                <button type="button" class="tc-step-move-btn tc-step-move-down-btn" data-step-id="${step.id}" data-move="down" title="${window.i18n.t('common.moveDown')}">
                    ${this.getIconHtml('arrow_downward')}
                </button>
            </div>
            <div class="tc-step-header">
                <div class="tc-step-number">${order}</div>
                <div class="tc-step-name">
                    <input type="text" class="glass-input tc-step-name-input"
                           value="${this.escapeHtml(step.name)}" data-step-id="${step.id}">
                </div>
                <div class="tc-step-actions">
                    <button type="button" class="tc-step-btn tc-step-copy-btn" data-step-id="${step.id}" title="${window.i18n.t('common.copy')}">
                        ${this.getIconHtml('content_copy')}
                    </button>
                    <button type="button" class="tc-step-btn tc-step-delete-btn" data-step-id="${step.id}" title="${window.i18n.t('common.delete')}">
                        ${this.getIconHtml('delete')}
                    </button>
                </div>
            </div>
            <div class="tc-step-body">
                ${this.renderStepConfig(step)}
            </div>
            <div class="tc-step-drag-handle tc-step-drag-handle-bottom" data-drag-handle="true">
                <button type="button" class="tc-step-move-btn tc-step-move-up-btn" data-step-id="${step.id}" data-move="up" title="${window.i18n.t('common.moveUp')}">
                    ${this.getIconHtml('arrow_upward')}
                </button>
                <div class="tc-drag-grip" data-drag-grip="true">
                    <span></span><span></span><span></span>
                </div>
                <button type="button" class="tc-step-move-btn tc-step-move-down-btn" data-step-id="${step.id}" data-move="down" title="${window.i18n.t('common.moveDown')}">
                    ${this.getIconHtml('arrow_downward')}
                </button>
            </div>
        `;

    return card;
  }

  renderStepConfig(step) {
    let configHtml = `
            <div class="tc-step-type-selector">
                <label>${window.i18n.t('testCase.stepType')}</label>
                <div class="tc-type-tabs">
                    <button type="button" class="tc-type-tab ${step.type === 'element' ? 'active' : ''}" data-type="element">
                        ${this.getIconHtml('touch_app')}
                        <span>${window.i18n.t('testCase.elementOperation')}</span>
                    </button>
                    <button type="button" class="tc-type-tab ${step.type === 'page' ? 'active' : ''}" data-type="page">
                        ${this.getIconHtml('pageview')}
                        <span>${window.i18n.t('testCase.pageOperation')}</span>
                    </button>
                    <button type="button" class="tc-type-tab ${step.type === 'system' ? 'active' : ''}" data-type="system">
                        ${this.getIconHtml('smartphone')}
                        <span>${window.i18n.t('testCase.systemOperation')}</span>
                    </button>
                    <button type="button" class="tc-type-tab ${step.type === 'ble' ? 'active' : ''}" data-type="ble">
                        ${this.getIconHtml('bluetooth')}
                        <span>${window.i18n.t('testCase.bleOperation')}</span>
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

  // ═════════════════════════════════════════════════════════════════
  // ─── Steps Element Config (原 stepsElementMixin) ──────────────────
  // ═════════════════════════════════════════════════════════════════

  renderElementConfig(step) {
    const config = step.config || {};
    const app = step._app; // Controller injects app reference
    const multiSelect = config.multiSelect || false;
    const clickCount = config.multiClickCount || 1;
    const selectedElements = config.selectedElements || [];

    // Page options
    let pageOptions = [
      {
        value: '',
        label: window.i18n.t('testCase.selectPage'),
        selected: !config.pageId,
      },
    ];
    if (app && app.pages) {
      app.pages.forEach((page) => {
        pageOptions.push({
          value: page.id,
          label: page.name,
          selected: config.pageId === page.id,
        });
      });
    }

    // Element options
    let elementOptions = [
      {
        value: '',
        label: window.i18n.t('testCase.selectElement'),
        selected: true,
      },
    ];
    if (config.pageId && app) {
      const page = app.pages?.find((p) => p.id === config.pageId);
      if (page && page.elements) {
        elementOptions = [
          {
            value: '',
            label: window.i18n.t('testCase.selectElement'),
            selected: !config.elementId,
          },
        ];
        page.elements.forEach((element) => {
          elementOptions.push({
            value: element.id,
            label: element.name,
            selected: config.elementId === element.id,
          });
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
        const elemOperation = typeof elemConfig === 'object' ? elemConfig.operation || 'click' : 'click';
        const elemOperationValue = typeof elemConfig === 'object' ? elemConfig.operationValue || {} : {};

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
  }

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
        // P3-13: 命名常量 (原魔法数字 500/100)
        const swipeDuration = operationValue.swipeDuration || DEFAULT_SWIPE_DURATION_MS;
        return `
                    <label>${window.i18n.t('testCase.swipeDuration')}</label>
                    <input type="number" class="glass-input tc-multi-swipe-duration" data-step-id="${step.id}" data-index="${index}"
                           value="${swipeDuration}" min="${SWIPE_DURATION_MIN_MS}" step="${SWIPE_DURATION_STEP_MS}">
                `;

      default:
        return '';
    }
  }

  // ═════════════════════════════════════════════════════════════════
  // ─── Steps Operation Value (原 stepsOperationMixin) ───────────────
  // ═════════════════════════════════════════════════════════════════

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
  }

  renderSendTextConfig(step, index = -1, operationValue = null) {
    const isMulti = index >= 0;
    const opValue = isMulti ? operationValue || {} : step.config?.operationValue || {};
    const inputType = opValue.inputType || 'custom';
    const prefix = isMulti ? 'tc-multi' : 'tc';
    const dataIndexAttr = isMulti ? ` data-index="${index}"` : '';

    const inputTypeOptions = [
      {
        value: 'custom',
        label: window.i18n.t('testCase.bleCustomData'),
        selected: inputType === 'custom',
      },
      {
        value: 'random',
        label: window.i18n.t('testCase.inputRandom'),
        selected: inputType === 'random',
      },
      {
        value: 'faker',
        label: window.i18n.t('testCase.inputFaker'),
        selected: inputType === 'faker',
      },
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
  }

  renderInputValueArea(step, inputType, index = -1, operationValue = null) {
    const isMulti = index >= 0;
    const opValue = isMulti ? operationValue || {} : step.config?.operationValue || {};
    const prefix = isMulti ? 'tc-multi' : 'tc';
    const dataIndexAttr = isMulti ? ` data-index="${index}"` : '';

    switch (inputType) {
      case 'custom':
        return `
                    <input type="text" class="glass-input ${prefix}-custom-input" data-step-id="${step.id}"${dataIndexAttr}
                           value="${this.escapeHtml(opValue.inputValue || '')}" placeholder="${window.i18n.t('testCase.inputTextContent')}">
                `;

      case 'random':
        const randomConfig = opValue.randomConfig || {};
        // P3-13: 精度档位动态生成 (原 0-5 硬编码 6 组)
        const precisionOptions = Array.from({ length: RANDOM_PRECISION_MAX + 1 }, (_, n) => ({
          value: String(n),
          label: n === 0 ? window.i18n.t('testCase.integer') : window.i18n.t('testCase.decimalPlaces', { n }),
          selected: randomConfig.precision === n || (n === 0 && !randomConfig.precision),
        }));
        return `
                    <div class="tc-random-config">
                        <div class="form-row">
                            <div class="form-group">
                                <label>${window.i18n.t('testCase.minValue')}</label>
                                <input type="number" class="glass-input ${prefix}-random-min" data-step-id="${step.id}"${dataIndexAttr}
                                       value="${this.escapeHtml(randomConfig.minValue || 0)}" step="0.1">
                            </div>
                            <div class="form-group">
                                <label>${window.i18n.t('testCase.maxValue')}</label>
                                <input type="number" class="glass-input ${prefix}-random-max" data-step-id="${step.id}"${dataIndexAttr}
                                       value="${this.escapeHtml(randomConfig.maxValue || 100)}" step="0.1">
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
  }

  renderFakerConfig(step, index = -1, operationValue = null) {
    const isMulti = index >= 0;
    const opValue = isMulti ? operationValue || {} : step.config?.operationValue || {};
    const fakerConfig = opValue.fakerConfig || {};
    const prefix = isMulti ? 'tc-multi' : 'tc';

    const locales = [
      { value: 'zh_CN', label: window.i18n.t('testCase.fakerLocales.zh_CN') },
      { value: 'en_US', label: window.i18n.t('testCase.fakerLocales.en_US') },
      { value: 'ja_JP', label: window.i18n.t('testCase.fakerLocales.ja_JP') },
      { value: 'ko_KR', label: window.i18n.t('testCase.fakerLocales.ko_KR') },
    ];

    const providers = this._getFakerProviders();

    const selectedLocale = fakerConfig.locale || 'zh_CN';
    const selectedProvider = fakerConfig.provider || 'person.name';
    const currentProviders = providers[selectedLocale] || providers['zh_CN'];
    const currentProvider = currentProviders.find((p) => p.value === selectedProvider) || currentProviders[0];

    const localeOptions = locales.map((l) => ({
      value: l.value,
      label: l.label,
      selected: selectedLocale === l.value,
    }));

    const providerOptions = currentProviders.map((p) => ({
      value: p.value,
      label: p.label,
      selected: selectedProvider === p.value,
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
  }

  // ═════════════════════════════════════════════════════════════════
  // ─── Steps Page Config (原 stepsPageMixin) ────────────────────────
  // ═════════════════════════════════════════════════════════════════

  renderPageConfig(step) {
    const config = step.config || {};
    if (!config.operationType) config.operationType = 'compare';
    const operationType = config.operationType;
    const app = step._app; // Controller injects

    const operationTypeOptions = [
      {
        value: 'compare',
        label: window.i18n.t('testCase.pageCompare'),
        selected: operationType === 'compare',
      },
      {
        value: 'search',
        label: window.i18n.t('testCase.pageSearch'),
        selected: operationType === 'search',
      },
    ];

    // Compare element page options
    let compareElementPageOptions = [
      {
        value: '',
        label: window.i18n.t('pagePackage.selectPage'),
        selected: !config.compareConfig?.pageId,
      },
    ];
    if (app && app.pages) {
      app.pages.forEach((page) => {
        compareElementPageOptions.push({
          value: page.id,
          label: page.name,
          selected: config.compareConfig?.pageId === page.id,
        });
      });
    }

    // Compare element options
    let compareElementOptions = [
      {
        value: '',
        label: window.i18n.t('pagePackage.selectElement'),
        selected: true,
      },
    ];
    if (config.compareConfig?.pageId && app) {
      const page = app.pages?.find((p) => p.id === config.compareConfig.pageId);
      if (page && page.elements) {
        compareElementOptions = [
          {
            value: '',
            label: window.i18n.t('pagePackage.selectElement'),
            selected: !config.compareConfig.elementId,
          },
        ];
        page.elements.forEach((element) => {
          compareElementOptions.push({
            value: element.id,
            label: element.name,
            selected: config.compareConfig.elementId === element.id,
          });
        });
      }
    }

    const compareConfig = config.compareConfig || {};
    if (!compareConfig.targetValueType) compareConfig.targetValueType = 'custom';
    const targetValueType = compareConfig.targetValueType;

    const allSteps = step._allSteps || []; // Controller injects
    const currentStepIndex = allSteps.findIndex((s) => s.id === step.id);
    const hasBleSteps = allSteps.some(
      (s, index) =>
        index < currentStepIndex &&
        s.type === 'ble' &&
        (s.config?.deviceConfig?.methodName === 'send_random_data' ||
          s.config?.deviceConfig?.methodName === 'send_custom_data')
    );

    const targetValueOptions = [
      {
        value: 'custom',
        label: window.i18n.t('testCase.bleCustomData'),
        selected: targetValueType === 'custom',
      },
    ];
    if (hasBleSteps) {
      targetValueOptions.push({
        value: 'ble',
        label: window.i18n.t('testCase.bleOperation'),
        selected: targetValueType === 'ble',
      });
    }

    const bleStepId = compareConfig.bleStepId || '';
    const bleStepOptions = [
      {
        value: '',
        label: window.i18n.t('testCase.selectStep'),
        selected: !bleStepId,
      },
    ];
    allSteps.forEach((s, index) => {
      if (
        index < currentStepIndex &&
        s.type === 'ble' &&
        (s.config?.deviceConfig?.methodName === 'send_random_data' ||
          s.config?.deviceConfig?.methodName === 'send_custom_data')
      ) {
        bleStepOptions.push({
          value: s.id,
          label: `${s.name} ${window.i18n.t('testCase.generatedRandomValue')}`,
          selected: bleStepId === s.id,
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
      {
        value: 'element',
        label: window.i18n.t('testCase.searchTypeElement'),
        selected: searchType === 'element',
      },
      {
        value: 'text',
        label: window.i18n.t('testCase.searchTypeText'),
        selected: searchType === 'text',
      },
    ];
    const searchMatchType = searchConfig.matchType || 'contains';

    let searchElementPageOptions = [
      {
        value: '',
        label: window.i18n.t('pagePackage.selectPage'),
        selected: !searchConfig.pageId,
      },
    ];
    if (app && app.pages) {
      app.pages.forEach((page) => {
        searchElementPageOptions.push({
          value: page.id,
          label: page.name,
          selected: searchConfig.pageId === page.id,
        });
      });
    }

    let searchElementOptions = [
      {
        value: '',
        label: window.i18n.t('pagePackage.selectElement'),
        selected: true,
      },
    ];
    if (searchConfig.pageId && app) {
      const page = app.pages?.find((p) => p.id === searchConfig.pageId);
      if (page && page.elements) {
        searchElementOptions = [
          {
            value: '',
            label: window.i18n.t('pagePackage.selectElement'),
            selected: !searchConfig.elementId,
          },
        ];
        page.elements.forEach((element) => {
          searchElementOptions.push({
            value: element.id,
            label: element.name,
            selected: searchConfig.elementId === element.id,
          });
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
                                       value="${this.escapeHtml(compareConfig.targetValue || '')}" placeholder="${window.i18n.t('testCase.enterTargetValue')}">
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
                                       value="${this.escapeHtml(searchConfig.textValue || '')}" placeholder="${window.i18n.t('testCase.enterSearchText')}">
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

  // ═════════════════════════════════════════════════════════════════
  // ─── Steps System/BLE Config (原 stepsDeviceMixin) ────────────────
  // ═════════════════════════════════════════════════════════════════

  renderSystemConfig(step) {
    const config = step.config || {};
    const systemConfig = config.systemConfig || {};
    const operationType = systemConfig.operationType || 'navigation';
    const navKey = systemConfig.navKey || 'back';
    const clickCount = systemConfig.clickCount || 1;

    const operationTypeOptions = [
      {
        value: 'navigation',
        label: window.i18n.t('testCase.navigationBar'),
        selected: operationType === 'navigation',
      },
    ];

    const navKeyOptions = [
      {
        value: 'back',
        label: window.i18n.t('testCase.navBack'),
        selected: navKey === 'back',
      },
      {
        value: 'home',
        label: window.i18n.t('testCase.navHome'),
        selected: navKey === 'home',
      },
      {
        value: 'recent',
        label: window.i18n.t('testCase.navRecent'),
        selected: navKey === 'recent',
      },
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

    // P3-12: 抽公共 method/params 构建 (原与 renderBleOperationConfigContent 约 40 行重复)
    const { methodOptionsHtml, paramsHtml } = this._buildBleMethodSection(deviceConfig, bleDevices, step.id);

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

  /**
   * P3-12: BLE method 下拉 + params 渲染公共逻辑 (renderBleConfig / renderBleOperationConfigContent 共用)
   * @param {Object} deviceConfig
   * @param {Array} bleDevices
   * @param {string} stepId
   * @returns {{methodOptionsHtml: string, paramsHtml: string}}
   */
  _buildBleMethodSection(deviceConfig, bleDevices, stepId) {
    let methodOptionsHtml = '';
    let paramsHtml = '';

    if (deviceConfig.deviceId && bleDevices && bleDevices.length > 0) {
      const device = bleDevices.find((d) => d.deviceId === deviceConfig.deviceId);
      if (device && device.methods) {
        const methodOptions = device.methods.map((m) => ({
          value: m.name,
          label: m.displayName || m.name,
          selected: deviceConfig.methodName === m.name,
        }));
        methodOptionsHtml = `
                    <div class="form-group">
                        <label>${window.i18n.t('testCase.bleMethod')}</label>
                        ${this.generateCustomSelect('tc-ble-method-select', methodOptions, window.i18n.t('testCase.bleMethodPlaceholder'), stepId)}
                    </div>
                `;

        if (deviceConfig.methodName) {
          const method = device.methods.find((m) => m.name === deviceConfig.methodName);
          if (method && method.params) {
            paramsHtml = this.renderDeviceParams(method.params, deviceConfig.params || {}, stepId);
          }
        }
      }
    }

    return { methodOptionsHtml, paramsHtml };
  }

  renderDeviceParams(params, paramValues, stepId) {
    if (!params || params.length === 0) return '';

    const fieldsHtml = params
      .map((param) => {
        const value =
          paramValues[param.key] !== undefined
            ? paramValues[param.key]
            : param.default !== undefined
              ? param.default
              : '';

        if (param.type === 'select') {
          const options = (param.options || []).map((opt) => ({
            value: String(opt.value),
            label: opt.label,
            selected: String(value) === String(opt.value),
          }));
          return `
                    <div class="form-group">
                        <label>${this.escapeHtml(param.label)}</label>
                        ${this.generateCustomSelect(`tc-ble-param-${param.key}`, options, param.placeholder || window.i18n.t('common.pleaseSelect'), stepId)}
                    </div>
                `;
        } else if (param.type === 'number') {
          const step = param.step || 'any';
          const precisionAttr = param.precision !== undefined ? ` data-precision="${param.precision}"` : '';
          return `
                    <div class="form-group">
                        <label>${this.escapeHtml(param.label)}</label>
                        <input type="number" class="glass-input tc-ble-param-input" data-step-id="${stepId}" data-param-key="${param.key}"
                               value="${this.escapeHtml(value)}" step="${step}" placeholder="${this.escapeHtml(param.placeholder || '')}"${precisionAttr}>
                    </div>
                `;
        } else {
          return `
                    <div class="form-group">
                        <label>${this.escapeHtml(param.label)}</label>
                        <input type="text" class="glass-input tc-ble-param-input" data-step-id="${stepId}" data-param-key="${param.key}"
                               value="${this.escapeHtml(value)}" placeholder="${this.escapeHtml(param.placeholder || '')}">
                    </div>
                `;
        }
      })
      .join('');

    return `<div class="tc-ble-device-params"><div class="form-row">${fieldsHtml}</div></div>`;
  }

  renderBleOperationConfigContent(step) {
    const config = step.config || {};
    const deviceConfig = config.deviceConfig || {};
    const bleDevices = step._bleDevices; // Controller injects

    // P3-12: 复用公共 method/params 构建
    const { methodOptionsHtml, paramsHtml } = this._buildBleMethodSection(deviceConfig, bleDevices, step.id);

    return `
            <div class="tc-ble-device-select-container" data-step-id="${step.id}"></div>
            ${methodOptionsHtml}
            <div class="tc-ble-params-container" data-step-id="${step.id}">
                ${paramsHtml}
            </div>
        `;
  }

  // ═════════════════════════════════════════════════════════════════
  // ─── Dropdown Utilities (原 formDropdownMixin) ────────────────────
  // ═════════════════════════════════════════════════════════════════

  /**
   * 定位下拉框到选中区域下方
   */
  positionDropdown(selected, options) {
    const rect = selected.getBoundingClientRect();

    if (rect.width === 0 && rect.height === 0) {
      options.style.top = '50%';
      options.style.left = '50%';
      options.style.width = `${DROPDOWN_FALLBACK_WIDTH_PX}px`;
      options.style.transform = 'translate(-50%, -50%)';
      return;
    }

    const viewportHeight = window.innerHeight;
    options.classList.add('show');
    const actualOptionsHeight = options.offsetHeight || DROPDOWN_FALLBACK_WIDTH_PX;

    const gap = DROPDOWN_GAP_PX;
    const threshold = DROPDOWN_SPACE_THRESHOLD;
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
      top =
        spaceBelow >= spaceAbove
          ? rect.bottom + gap
          : Math.max(DROPDOWN_MIN_TOP_OFFSET_PX, rect.top - actualOptionsHeight - gap);
    }

    options.style.top = `${top}px`;
    options.style.left = `${rect.left}px`;
    options.style.width = `${rect.width}px`;
    options.style.transform = '';
  }

  /**
   * 阻止页面滚动（下拉框打开时）
   */
  preventScroll(e) {
    const mainContent = document.querySelector('.main-content');
    if (mainContent && mainContent.classList.contains('dropdown-open')) {
      e.preventDefault();
    }
  }

  /**
   * 关闭所有下拉框
   */
  closeAllDropdowns() {
    const hadOpen = document.querySelectorAll('.custom-select__options.show').length > 0;
    document.querySelectorAll('.custom-select__options.show').forEach((opt) => {
      opt.classList.remove('show');
    });
    if (hadOpen) {
      const mainContent = document.querySelector('.main-content');
      if (mainContent) {
        mainContent.classList.remove('dropdown-open');
        mainContent.removeEventListener('wheel', this.preventScroll, {
          passive: false,
        });
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
      mainContent.addEventListener('wheel', this.preventScroll, {
        passive: false,
      });
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
      mainContent.removeEventListener('wheel', this.preventScroll, {
        passive: false,
      });
    }
  }

  // ═════════════════════════════════════════════════════════════════
  // ─── Editor Initialization (原 formEditorInitMixin) ───────────────
  // ═════════════════════════════════════════════════════════════════

  async initEditor() {
    this.initAppSelect();
    this.initPlatformSelect();
    this.initMarkersSelect();
    this.initCollapsible();
    this.initDirtyListener();
    // 渲染平台选项（平台列表是静态的）
    this.renderPlatformOptions([{ value: 'android', label: 'Android' }], this._currentPlatform || 'android');
  }

  /**
   * 初始化应用选择下拉框
   */
  initAppSelect() {
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
  initPlatformSelect() {
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
  initMarkersSelect() {
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
  initCollapsible() {
    const headers = document.querySelectorAll('.tc-collapsible-header');
    headers.forEach((header) => {
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
  initDirtyListener() {
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

    selectWrappers.forEach((wrapper) => {
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

  /**
   * 初始化步骤列表内的 custom-select（默认使用缓存的 #tc-steps-list）
   * @param {Element} [container] - 可选容器，默认使用 this.els.stepsList
   */
  initStepSelectsSafe(container) {
    const target = container || this.els.stepsList;
    if (target) this.initStepSelects(target);
  }

  // ═════════════════════════════════════════════════════════════════
  // ─── Warning UI + Form populate/reset (原 formWarningMixin) ───────
  // ═════════════════════════════════════════════════════════════════

  showJsonMissingWarning(fileName) {
    this.hideJsonMissingWarning();

    const editorContent = document.querySelector('.tc-editor-content');
    if (!editorContent) return;

    const warningDiv = document.createElement('div');
    warningDiv.id = 'tc-json-missing-warning';
    warningDiv.className = 'tc-json-missing-warning';
    warningDiv.innerHTML = `
            ${this.getIconHtml('warning')}
            <span>${window.i18n.t('testCase.jsonMissingWarning', { fileName: this.escapeHtml(fileName) })}</span>
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
      markersOptionsContainer.querySelectorAll('.custom-select__option').forEach((opt) => {
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
        optionsContainer.querySelectorAll('.custom-select__option').forEach((opt) => {
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
      platformOpts.querySelectorAll('.custom-select__option').forEach((opt) => {
        opt.classList.toggle('selected', opt.getAttribute('data-value') === 'android');
      });
    }

    // Reset app select display
    const appSpan = document.querySelector('#tc-app-selected .custom-select__text');
    if (appSpan) appSpan.textContent = window.i18n.t('testCase.selectApp');
    const appOpts = this.els.appOptions;
    if (appOpts) {
      appOpts.querySelectorAll('.custom-select__option').forEach((opt) => opt.classList.remove('selected'));
    }

    // Reset markers
    const markersOpts = this.els.markersOptions;
    if (markersOpts) {
      markersOpts.querySelectorAll('.custom-select__option').forEach((opt) => opt.classList.remove('selected'));
    }

    // Reset steps section
    this.updateStepsSectionState(false);
    this.showStepsEmpty();
  }

  setFileName(fileName) {
    if (this.els.fileName) this.els.fileName.value = fileName || '';
  }

  // ═════════════════════════════════════════════════════════════════
  // ─── Collect Form Data (原 formCollectMixin) ──────────────────────
  // ═════════════════════════════════════════════════════════════════

  /**
   * 收集表单顶部输入 (文件名/用例名/描述/Allure/等待时间)
   * @returns {Object} 输入数据
   */
  collectFormInputs() {
    return {
      fileName: document.getElementById('tc-file-name')?.value?.trim() || '',
      caseName: document.getElementById('tc-case-name')?.value?.trim() || '',
      description: document.getElementById('tc-description')?.value?.trim() || '',
      epic: document.getElementById('tc-allure-epic')?.value?.trim() || '',
      feature: document.getElementById('tc-allure-feature')?.value?.trim() || '',
      story: document.getElementById('tc-allure-story')?.value?.trim() || '',
      appLoadWaitTime: document.getElementById('tc-app-load-wait-time')?.value ?? 10,
      elementWaitTimeout: document.getElementById('tc-element-wait-timeout')?.value ?? 30,
      stepInterval: document.getElementById('tc-step-interval')?.value ?? 2,
      appCloseWaitTime: document.getElementById('tc-app-close-wait-time')?.value ?? 2,
    };
  }

  /**
   * 从 DOM 读取步骤卡片数据，合并 model 中的步骤基础信息
   * @param {Array} modelSteps - model 中的步骤数组
   * @returns {Array} 合并后的步骤数据
   */
  collectStepCardsData(modelSteps) {
    const container = document.getElementById('tc-steps-list');
    if (!container) return modelSteps;

    const cards = container.querySelectorAll('.tc-step-card');
    if (cards.length === 0) return modelSteps;

    const result = [];
    cards.forEach((card, index) => {
      const stepId = card.dataset.stepId;
      const modelStep = modelSteps.find((s) => s.id === stepId);
      if (!modelStep) return;

      // 以 model step 为基础，从 DOM 覆盖可编辑字段
      // 删除渲染注入的临时属性（_app/_bleDevices/_allSteps），避免循环引用
      // eslint-disable-next-line no-unused-vars -- 解构丢弃临时字段 (P2-4 注入)
      const { _app, _bleDevices, _allSteps, ...stepData } = modelStep;
      const step = JSON.parse(JSON.stringify(stepData));
      step.order = index + 1;

      // 步骤名称
      const nameInput = card.querySelector('.tc-step-name-input');
      if (nameInput) step.name = nameInput.value;

      // 步骤类型
      const activeTab = card.querySelector('.tc-type-tab.active');
      if (activeTab) step.type = activeTab.dataset.type;

      // 从 DOM 读取 config 中的值
      const config = step.config || {};

      // 读取 custom-select 的当前选中值
      // 注意：options 已被移到 body，需要通过 ID 在 document 上查找
      card.querySelectorAll('.custom-select').forEach((select) => {
        const selectId = select.dataset.selectId;
        if (!selectId) return;

        let optionsEl = null;
        if (select.id) {
          optionsEl = document.getElementById(`${select.id}-options`);
        }
        if (!optionsEl) {
          optionsEl = select.querySelector('.custom-select__options');
        }

        const selectedOpt = optionsEl?.querySelector('.custom-select__option.selected');
        if (selectedOpt) {
          const value = selectedOpt.dataset.value;
          // P2-1: 统一走公共路由表 (与 StepEditor.updateStepSelect 同一 schema, 原 22 分支 if/else)
          applySelectRoute(config, selectId, value);
        }
      });

      // 读取 input 值
      const customInput = card.querySelector('.tc-custom-input');
      if (customInput) {
        config.operationValue = config.operationValue || {};
        config.operationValue.inputValue = customInput.value;
      }

      const randomMin = card.querySelector('.tc-random-min');
      if (randomMin) {
        config.operationValue = config.operationValue || {};
        config.operationValue.randomConfig = config.operationValue.randomConfig || {};
        config.operationValue.randomConfig.minValue = parseFloat(randomMin.value) || 0;
      }
      const randomMax = card.querySelector('.tc-random-max');
      if (randomMax) {
        config.operationValue = config.operationValue || {};
        config.operationValue.randomConfig = config.operationValue.randomConfig || {};
        config.operationValue.randomConfig.maxValue = parseFloat(randomMax.value) || 100;
      }

      // 点击次数
      const clickCount = card.querySelector('.tc-click-count');
      if (clickCount) {
        config.operationValue = config.operationValue || {};
        config.operationValue.clickCount = parseInt(clickCount.value) || 1;
      }

      // 滑动时长
      const swipeDuration = card.querySelector('.tc-swipe-duration');
      if (swipeDuration) {
        config.operationValue = config.operationValue || {};
        config.operationValue.swipeDuration = parseInt(swipeDuration.value) || 500;
      }

      // 比较目标值
      const compareTargetValue = card.querySelector('.tc-compare-target-value');
      if (compareTargetValue) {
        config.compareConfig = config.compareConfig || {};
        config.compareConfig.targetValue = compareTargetValue.value;
      }
      const compareTolerance = card.querySelector('.tc-compare-tolerance');
      if (compareTolerance) {
        config.compareConfig = config.compareConfig || {};
        if (compareTolerance.value.trim() !== '') {
          config.compareConfig.tolerance = parseFloat(compareTolerance.value);
        } else {
          delete config.compareConfig.tolerance;
        }
      }

      // 搜索文本
      const searchTextValue = card.querySelector('.tc-search-text-value');
      if (searchTextValue) {
        config.searchConfig = config.searchConfig || {};
        config.searchConfig.textValue = searchTextValue.value;
      }

      // 搜索匹配类型
      const searchMatchRadio = card.querySelector('.tc-search-match-radio:checked');
      if (searchMatchRadio) {
        config.searchConfig = config.searchConfig || {};
        config.searchConfig.matchType = searchMatchRadio.value;
      }

      // 系统导航点击次数
      const navClickCount = card.querySelector('.tc-nav-click-count');
      if (navClickCount) {
        config.systemConfig = config.systemConfig || {};
        config.systemConfig.clickCount = parseInt(navClickCount.value) || 1;
      }

      // BLE 参数
      const bleParamInputs = card.querySelectorAll('.tc-ble-param-input');
      if (bleParamInputs.length > 0) {
        config.deviceConfig = config.deviceConfig || {};
        config.deviceConfig.params = config.deviceConfig.params || {};
        bleParamInputs.forEach((input) => {
          const paramKey = input.dataset.paramKey;
          if (paramKey) {
            config.deviceConfig.params[paramKey] = input.type === 'number' ? parseFloat(input.value) : input.value;
          }
        });
      }

      // 多选元素
      const multiCheckbox = card.querySelector('.tc-multi-select-checkbox');
      if (multiCheckbox) {
        config.multiSelect = multiCheckbox.checked;
      }

      // 多选点击数量
      const multiClickCount = card.querySelector('.tc-multi-click-count');
      if (multiClickCount) {
        config.multiClickCount = parseInt(multiClickCount.value) || 1;
      }

      // 多选元素列表
      const multiElementItems = card.querySelectorAll('.tc-multi-element-item');
      if (multiElementItems.length > 0) {
        config.selectedElements = [];
        multiElementItems.forEach((item) => {
          const elem = {};
          const getSelectedValue = (selectEl) => {
            if (!selectEl) return null;
            let optionsEl = null;
            if (selectEl.id) {
              optionsEl = document.getElementById(`${selectEl.id}-options`);
            }
            if (!optionsEl) {
              optionsEl = selectEl.querySelector('.custom-select__options');
            }
            const selectedOpt = optionsEl?.querySelector('.custom-select__option.selected');
            return selectedOpt?.dataset.value || null;
          };
          const elemSelect = item.querySelector('.custom-select[data-select-id="tc-multi-element-select"]');
          const elemValue = getSelectedValue(elemSelect);
          if (elemValue) elem.elementId = elemValue;
          const opSelect = item.querySelector('.custom-select[data-select-id="tc-multi-operation-select"]');
          const opValue = getSelectedValue(opSelect);
          if (opValue) elem.operation = opValue;
          const inputTypeSelect = item.querySelector('.custom-select[data-select-id="tc-multi-input-type-select"]');
          const inputTypeValue = getSelectedValue(inputTypeSelect);
          if (inputTypeValue) elem.inputType = inputTypeValue;
          const customInput = item.querySelector('.tc-multi-custom-input');
          if (customInput) elem.inputValue = customInput.value;
          const randomMin = item.querySelector('.tc-multi-random-min');
          const randomMax = item.querySelector('.tc-multi-random-max');
          if (randomMin || randomMax) {
            elem.randomConfig = elem.randomConfig || {};
            if (randomMin) elem.randomConfig.minValue = parseFloat(randomMin.value) || 0;
            if (randomMax) elem.randomConfig.maxValue = parseFloat(randomMax.value) || 100;
          }
          const fakerLocaleSelect = item.querySelector('.custom-select[data-select-id="tc-multi-faker-locale"]');
          const fakerProviderSelect = item.querySelector('.custom-select[data-select-id="tc-multi-faker-provider"]');
          const fakerLocaleValue = getSelectedValue(fakerLocaleSelect);
          const fakerProviderValue = getSelectedValue(fakerProviderSelect);
          if (fakerLocaleValue || fakerProviderValue) {
            elem.fakerConfig = elem.fakerConfig || {};
            if (fakerLocaleValue) elem.fakerConfig.locale = fakerLocaleValue;
            if (fakerProviderValue) elem.fakerConfig.provider = fakerProviderValue;
          }
          config.selectedElements.push(elem);
        });
      }

      step.config = config;
      result.push(step);
    });

    return result.length > 0 ? result : modelSteps;
  }

  // ═════════════════════════════════════════════════════════════════
  // ─── Confirm Modal (原 formConfirmModalMixin) ─────────────────────
  // ═════════════════════════════════════════════════════════════════

  /**
   * 显示自定义确认弹窗（复用全局 confirm modal，回调存全局）
   * @param {string} title - 标题
   * @param {string} message - 提示消息
   * @param {Function} onConfirm - 确认回调
   */
  showConfirmModal(title, message, onConfirm) {
    const titleElement = document.getElementById('confirm-modal-title');
    const messageElement = document.getElementById('confirm-modal-message');

    if (titleElement) titleElement.textContent = title;
    if (messageElement) messageElement.textContent = message;

    // 保存回调到全局，供 settings controller 的事件委托读取
    window.__XKAT_CONFIRM_CALLBACK__ = onConfirm;

    // 重置确认按钮状态
    const confirmBtn = document.getElementById('confirm-modal-confirm-btn');
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.classList.remove('loading');
      // 清除旧的 originalText，使用当前语言重新翻译
      delete confirmBtn.dataset.originalText;
      const i18nKey = confirmBtn.getAttribute('data-i18n');
      confirmBtn.innerHTML = i18nKey ? window.i18n.t(i18nKey) || confirmBtn.textContent : confirmBtn.textContent;
    }

    const confirmModal = window.__XKAT_MODALS__?.confirm;
    if (confirmModal) {
      confirmModal.open();
    } else {
      // fallback 到原生确认框
      if (window.confirm(message)) {
        onConfirm();
      }
    }
  }

  /**
   * 显示「未保存更改」确认弹窗（3 按钮：取消 / 放弃 / 保存）
   * P2-3: 委托 app.js 全局 save-confirm 机制 (原本地 cloneNode 重建按钮,
   * 与 app.js 静态按钮处理并存, 存在竞态/重复实现)
   * @param {Object} params - { title, message, onSave, onDiscard, onCancel }
   */
  showSaveConfirmModal({ title, message, onSave, onDiscard, onCancel } = {}) {
    const appShow = window.__XKAT_APP__?.showSaveConfirmModal;
    if (typeof appShow === 'function') {
      // 取消按钮由 app.js 统一处理 (close + 清状态), onCancel 无附加语义
      appShow(title, message, onSave, onDiscard);
      return;
    }
    // 降级 (app 未初始化): 原生 confirm, onSave 走"是", 否则 onDiscard
    if (window.confirm(message || '')) {
      onSave?.();
    } else if (onDiscard) {
      onDiscard();
    } else {
      onCancel?.();
    }
  }

  // ═════════════════════════════════════════════════════════════════
  // ─── Step List / Search / File List Event Bridge (原 formStepBridgeMixin)
  // ═════════════════════════════════════════════════════════════════

  /**
   * 绑定对比目标值输入与容差输入框的联动
   * - 当对比来源为"手动输入"(custom)时，targetValue 为非数字字符串则禁用容差输入框
   * - 当 targetValue 转为纯数字（或为空）时，恢复容差输入框可用
   * @param {Element} card - 步骤卡片元素
   * @returns {Function} unbind 函数
   */
  bindCompareToleranceToggle(card) {
    if (!card) return () => {};
    const targetValueInput = card.querySelector('.tc-compare-target-value');
    const toleranceInput = card.querySelector('.tc-compare-tolerance');
    if (!targetValueInput || !toleranceInput) return () => {};

    const updateToleranceState = () => {
      const val = targetValueInput.value;
      // 仅当 targetValue 为空或纯数字时启用容差；包含非数字字符（含"阿123"等混合）则禁用
      const isPureNumber = val !== '' && !isNaN(Number(val)) && isFinite(Number(val));
      const shouldDisable = val !== '' && !isPureNumber;
      toleranceInput.disabled = shouldDisable;
      // targetValue 从纯数字变为字符串时，清空已输入的容差值
      if (shouldDisable && toleranceInput.value) {
        toleranceInput.value = '';
      }
    };

    targetValueInput.addEventListener('input', updateToleranceState);
    return () => targetValueInput.removeEventListener('input', updateToleranceState);
  }

  /**
   * 获取所有步骤卡片元素
   * @returns {Element[]}
   */
  getStepCards() {
    if (!this.els.stepsList) return [];
    return Array.from(this.els.stepsList.querySelectorAll('.tc-step-card'));
  }

  /**
   * 查找指定 stepId 对应的步骤卡片
   * @param {string} stepId
   * @returns {Element|null}
   */
  findStepCard(stepId) {
    if (!this.els.stepsList) return null;
    return this.els.stepsList.querySelector(`[data-step-id="${stepId}"].tc-step-card`);
  }

  /**
   * 用新卡片替换指定 stepId 的旧卡片
   * @param {string} stepId
   * @param {Element} newCard
   * @returns {boolean} 是否成功替换
   */
  replaceStepCard(stepId, newCard) {
    const oldCard = this.findStepCard(stepId);
    if (!oldCard) return false;
    oldCard.replaceWith(newCard);
    return true;
  }

  /**
   * 清理某 step 移动到 body 的 options 元素
   * @param {string} stepId
   */
  cleanupMovedOptionsForStep(stepId) {
    document.querySelectorAll(`.custom-select__options[data-moved][id*="${stepId}"]`).forEach((opt) => opt.remove());
  }

  /**
   * 按 DOM 顺序重排步骤卡片序号显示，并返回 [{stepId, order}] 供 Controller 同步 model
   * @returns {Array<{stepId: string, order: number}>}
   */
  renumberStepCards() {
    const cards = this.getStepCards();
    const result = [];
    cards.forEach((card, index) => {
      const stepId = card.getAttribute('data-step-id');
      const numberEl = card.querySelector('.tc-step-number');
      if (numberEl) numberEl.textContent = index + 1;
      if (stepId) result.push({ stepId, order: index + 1 });
    });
    return result;
  }

  /**
   * 更新步骤卡片上下移动按钮的禁用状态
   */
  updateMoveButtonsState() {
    const cards = this.getStepCards();
    cards.forEach((card, index) => {
      const upBtns = card.querySelectorAll('.tc-step-move-up-btn');
      const downBtns = card.querySelectorAll('.tc-step-move-down-btn');
      upBtns.forEach((btn) => {
        btn.disabled = index === 0;
        btn.classList.toggle('tc-step-move-btn-disabled', index === 0);
      });
      downBtns.forEach((btn) => {
        btn.disabled = index === cards.length - 1;
        btn.classList.toggle('tc-step-move-btn-disabled', index === cards.length - 1);
      });
    });
  }

  /**
   * 查找 select 对应的 options 元素（可能仍在 select 内或已移到 body）
   * @param {Element} select
   * @returns {Element|null}
   */
  findOptionsForSelect(select) {
    if (!select) return null;
    let options = select.querySelector('.custom-select__options');
    if (!options && select.id) {
      options = document.getElementById(`${select.id}-options`);
    }
    return options;
  }

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
  }

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
  }

  /**
   * 绑定步骤卡片拖拽排序事件（View 内部维护 dragged 状态）
   * @param {Function} onDragEnd - 拖拽结束时回调（无参数），由 Controller 触发 model 同步
   * @returns {Function} unbind
   */
  bindStepDragDrop(onDragEnd) {
    const container = this.els.stepsList;
    if (!container) return () => {};
    const cards = Array.from(container.querySelectorAll('.tc-step-card'));
    const unbinds = [];
    let draggedCard = null;

    cards.forEach((card) => {
      const grips = card.querySelectorAll('.tc-drag-grip[data-drag-grip]');
      grips.forEach((grip) => {
        grip.draggable = true;

        const dragstartHandler = (e) => {
          draggedCard = card;
          card.classList.add('dragging');
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setDragImage(card, 0, 0);
        };
        grip.addEventListener('dragstart', dragstartHandler);
        unbinds.push(() => grip.removeEventListener('dragstart', dragstartHandler));

        const dragendHandler = () => {
          card.classList.remove('dragging');
          draggedCard = null;
          if (onDragEnd) onDragEnd();
        };
        grip.addEventListener('dragend', dragendHandler);
        unbinds.push(() => grip.removeEventListener('dragend', dragendHandler));
      });

      const dragoverHandler = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (draggedCard && draggedCard !== card) {
          const allCards = Array.from(container.querySelectorAll('.tc-step-card:not(.dragging)'));
          const nextCard = allCards.find((c) => {
            const rect = c.getBoundingClientRect();
            return e.clientY < rect.top + rect.height / 2;
          });
          if (nextCard) {
            container.insertBefore(draggedCard, nextCard);
          } else {
            container.appendChild(draggedCard);
          }
        }
      };
      card.addEventListener('dragover', dragoverHandler);
      unbinds.push(() => card.removeEventListener('dragover', dragoverHandler));
    });

    return () => unbinds.forEach((fn) => fn());
  }

  // ─── Select State Helpers (MVC: classList 归 view) ────────────

  /**
   * 标记 custom-select 某选项为选中态（清除其他选项的 selected）
   * MVC: 选中态 classList 管理归 view
   * @param {Element} optionsContainer - .custom-select__options 容器
   * @param {Element} selectedOption - 被点击的 .custom-select__option
   */
  markOptionSelected(optionsContainer, selectedOption) {
    if (!optionsContainer || !selectedOption) return;
    optionsContainer.querySelectorAll('.custom-select__option').forEach((opt) => opt.classList.remove('selected'));
    selectedOption.classList.add('selected');
  }

  /**
   * 更新 custom-select 选中显示文本（通用版，适用于 step card 内的 select）
   * MVC: 选中态文本显示归 view
   * @param {Element} selectEl - .custom-select 元素
   * @param {string} text - 显示文本
   */
  setSelectSelectedText(selectEl, text) {
    if (!selectEl) return;
    const selectedSpan = selectEl.querySelector('.custom-select__text');
    if (selectedSpan) selectedSpan.textContent = text;
  }

  /**
   * 截断数字 input 的小数位数（蓝牙参数精度限制）
   * MVC: DOM value 写入归 view
   * @param {HTMLInputElement} inputEl - input 元素
   * @param {number} precision - 最大小数位数
   */
  truncateDecimalInput(inputEl, precision) {
    if (!inputEl || precision === undefined || inputEl.type !== 'number') return;
    const value = inputEl.value;
    if (value.includes('.')) {
      const parts = value.split('.');
      const maxDecimals = parseInt(precision);
      if (parts[1] && parts[1].length > maxDecimals) {
        parts[1] = parts[1].substring(0, maxDecimals);
        inputEl.value = parts.join('.');
      }
    }
  }

  /**
   * 切换 marker 选项的选中态（多选 toggle）
   * MVC: classList.toggle 归 view
   * @param {Element} optionEl - .custom-select__option 元素
   */
  toggleMarkerOption(optionEl) {
    if (!optionEl) return;
    optionEl.classList.toggle('selected');
  }

  /**
   * 批量同步 markers 选项的选中态
   * MVC: classList.toggle 批量归 view
   * @param {Element} optionsContainer - markers options 容器
   * @param {Array<string>} markers - 已选中的 marker 值列表
   */
  syncMarkerOptionsState(optionsContainer, markers) {
    if (!optionsContainer) return;
    optionsContainer.querySelectorAll('.custom-select__option').forEach((opt) => {
      opt.classList.toggle('selected', markers.includes(opt.dataset.value));
    });
  }

  // ─── BLE Cascade Select ────────────────────────────────────────

  /**
   * 在 step card 内初始化蓝牙设备级联选择器
   * MVC: UI 组件实例化归 view，controller 仅传数据 + 回调
   * @param {string|number} stepId - 步骤 ID
   * @param {Array} bleDevices - 蓝牙设备列表
   * @param {string|null} currentDeviceId - 当前已选设备 ID（用于回显）
   * @param {Function} onSelect - (device: {deviceId, name}) => void
   */
  showDeviceCascadeSelect(stepId, bleDevices, currentDeviceId, onSelect) {
    const container = document.querySelector(`.tc-ble-device-select-container[data-step-id="${stepId}"]`);
    if (!container) return;

    if (!container.id) {
      container.id = `ble-select-${stepId}`;
    }

    // 销毁旧实例
    if (DeviceCascadeSelect?.instances?.[container.id]) {
      DeviceCascadeSelect.instances[container.id].destroy();
    }

    const cascadeSelect = new DeviceCascadeSelect(container.id, {
      placeholder: window.i18n.t('testCase.bleDeviceSelect'),
      typePlaceholder: window.i18n.t('testCase.bleDeviceType'),
      modelPlaceholder: window.i18n.t('testCase.bleDeviceModel'),
      onSelect: onSelect,
    });

    cascadeSelect.render(bleDevices);

    // 回显已选设备
    if (currentDeviceId) {
      const device = bleDevices.find((d) => d.deviceId === currentDeviceId);
      if (device) {
        cascadeSelect.select(device, true);
      }
    }
  }

  // ─── App / Platform Selected Text ─────────────────────────────

  /**
   * 更新 App 选中显示文本
   * @param {string} name
   */
  setAppSelectedText(name) {
    const selectedSpan = this.els.appSelected?.querySelector('.custom-select__text');
    if (selectedSpan) selectedSpan.textContent = name;
  }

  /**
   * 更新 Platform 选中显示文本
   * @param {string} label
   */
  setPlatformSelectedText(label) {
    const selectedSpan = this.els.platformSelected?.querySelector('.custom-select__text');
    if (selectedSpan) selectedSpan.textContent = label;
  }

  // ═════════════════════════════════════════════════════════════════
  // ─── Private Helpers (原 formHelpersMixin) ────────────────────────
  // ═════════════════════════════════════════════════════════════════

  _getElementLocatorType(pageId, elementId, app) {
    if (pageId && elementId && app) {
      const page = app.pages?.find((p) => p.id === pageId);
      const element = page?.elements?.find((el) => el.id === elementId);
      return element?.locator || null;
    }
    return null;
  }

  _getFakerProviders() {
    return {
      zh_CN: [
        {
          value: 'person.name',
          label: window.i18n.t('testCase.fakerProviders.personName'),
          example: '张三',
        },
        {
          value: 'person.phone',
          label: window.i18n.t('testCase.fakerProviders.personPhone'),
          example: '13812345678',
        },
        {
          value: 'person.email',
          label: window.i18n.t('testCase.fakerProviders.personEmail'),
          example: 'zhangsan@example.com',
        },
        {
          value: 'address.city',
          label: window.i18n.t('testCase.fakerProviders.addressCity'),
          example: '北京市',
        },
        {
          value: 'address.address',
          label: window.i18n.t('testCase.fakerProviders.addressAddress'),
          example: '朝阳区xxx街道',
        },
        {
          value: 'company.name',
          label: window.i18n.t('testCase.fakerProviders.companyName'),
          example: '科技有限公司',
        },
      ],
      en_US: [
        {
          value: 'person.name',
          label: window.i18n.t('testCase.fakerProviders.personName'),
          example: 'John Smith',
        },
        {
          value: 'person.phone',
          label: window.i18n.t('testCase.fakerProviders.personPhone'),
          example: '+1-555-123-4567',
        },
        {
          value: 'person.email',
          label: window.i18n.t('testCase.fakerProviders.personEmail'),
          example: 'john@example.com',
        },
        {
          value: 'address.city',
          label: window.i18n.t('testCase.fakerProviders.addressCity'),
          example: 'New York',
        },
        {
          value: 'address.address',
          label: window.i18n.t('testCase.fakerProviders.addressAddress'),
          example: '123 Main St',
        },
        {
          value: 'company.name',
          label: window.i18n.t('testCase.fakerProviders.companyName'),
          example: 'Tech Corp',
        },
      ],
      ja_JP: [
        {
          value: 'person.name',
          label: window.i18n.t('testCase.fakerProviders.personName'),
          example: '田中太郎',
        },
        {
          value: 'person.phone',
          label: window.i18n.t('testCase.fakerProviders.personPhone'),
          example: '090-1234-5678',
        },
        {
          value: 'person.email',
          label: window.i18n.t('testCase.fakerProviders.personEmail'),
          example: 'tanaka@example.jp',
        },
        {
          value: 'address.city',
          label: window.i18n.t('testCase.fakerProviders.addressCity'),
          example: '東京都',
        },
        {
          value: 'address.address',
          label: window.i18n.t('testCase.fakerProviders.addressAddress'),
          example: '渋谷区xxx',
        },
        {
          value: 'company.name',
          label: window.i18n.t('testCase.fakerProviders.companyName'),
          example: '株式会社テック',
        },
      ],
      ko_KR: [
        {
          value: 'person.name',
          label: window.i18n.t('testCase.fakerProviders.personName'),
          example: '김철수',
        },
        {
          value: 'person.phone',
          label: window.i18n.t('testCase.fakerProviders.personPhone'),
          example: '010-1234-5678',
        },
        {
          value: 'person.email',
          label: window.i18n.t('testCase.fakerProviders.personEmail'),
          example: 'kim@example.kr',
        },
        {
          value: 'address.city',
          label: window.i18n.t('testCase.fakerProviders.addressCity'),
          example: '서울특별시',
        },
        {
          value: 'address.address',
          label: window.i18n.t('testCase.fakerProviders.addressAddress'),
          example: '강남구 xxx',
        },
        {
          value: 'company.name',
          label: window.i18n.t('testCase.fakerProviders.companyName'),
          example: '테크주식회사',
        },
      ],
    };
  }
}

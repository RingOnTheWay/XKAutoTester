import { Action } from '../../core/Action.js';
import { ApiBridge } from '../../core/ApiBridge.js';
import { DeviceCascadeSelect } from '../../components/device-cascade-select.js';
import { Toast } from '../../components/toast.js';

/**
 * TestCaseController - 测试用例 Tab 控制器
 * 职责：绑定 Model 事件到 View 渲染，绑定 DOM 事件到 Model 方法
 * 不直接操作 DOM（通过 View），不直接调用 API（通过 Model）
 */
export class TestCaseController {
  #model;
  #view;
  #unbinds = [];
  #stepCardUnbinds = []; // 步骤卡片专用事件清理
  #draggedStepCard = null; // 拖拽中的步骤卡片 DOM
  #unbindModel = [];
  #searchDebounceTimer = null;
  #searchLoadingTimer = null;
  #isSearchLoading = false;
  #destroyed = false;

  /**
   * @param {import('./model.js').TestCaseModel} model
   * @param {import('./view.js').TestCaseView} view
   */
  constructor(model, view) {
    this.#model = model;
    this.#view = view;
  }

  // ─── 生命周期 ────────────────────────────────────────────

  async init() {
    this.#bindModelEvents();
    this.#bindDomEvents();
    await this.#model.load();
  }

  destroy() {
    this.#destroyed = true;
    clearTimeout(this.#searchDebounceTimer);
    this.#unbinds.forEach(fn => fn());
    this.#unbinds = [];
    this.#stepCardUnbinds.forEach(fn => fn());
    this.#stepCardUnbinds = [];
    this.#unbindModel.forEach(fn => fn());
    this.#unbindModel = [];
    this.#model.destroy();
  }

  // ─── Model 事件 → View 渲染 ──────────────────────────────

  #bindModelEvents() {
    const model = this.#model;

    this.#on(model, 'directory-changed', (path) => {
      this.#view.renderSelectedDirectory(path);
    });

    this.#on(model, 'files-changed', () => {
      // 搜索loading期间跳过列表渲染，等待loading动画结束后再渲染
      if (this.#isSearchLoading) {
        const hasDirectory = !!model.get('selectedDirectory');
        this.#view.updateAddButtonState(hasDirectory);
        this.#view.updateSearchState(hasDirectory);
        return;
      }
      this.#view.renderTestFiles(
        model.get('testFiles'),
        model.get('jsonExistsMap'),
        model.get('searchQuery')
      );
      // 选择目录后启用添加按钮和搜索框
      const hasDirectory = !!model.get('selectedDirectory');
      this.#view.updateAddButtonState(hasDirectory);
      this.#view.updateSearchState(hasDirectory);
      // 绑定文件列表点击事件
      this.#bindFileListEvents();
    });

    this.#on(model, 'selected-file-changed', (file) => {
      if (file) {
        this.#view.showEditor();
      } else {
        this.#view.hideEditor();
      }
    });

    this.#on(model, 'editing-changed', (isEditing) => {
      this.#view.setEditingState(isEditing);
    });

    this.#on(model, 'cancel-edit', () => {
      this.#view.hideEditor();
      this.#view.resetForm();
      this.#view.selectFileItem(null);
    });

    this.#on(model, 'show-editor', ({ file, isNew, jsonMissing, fileName }) => {
      this.#view.showEditorUI({ file, isNew, jsonMissing, fileName });
      // 初始化编辑器组件（apps, markers, platform select 等）
      this.#view.initEditor();
      // 绑定 dirty 回调
      this.#view.onDirty(() => this.handleMarkDirty());
      // 绑定 app/platform/markers 选项点击事件
      this.#bindAppOptionClicks();
      this.#bindPlatformOptionClicks();
      this.#bindMarkersOptionClicks();
    });

    this.#on(model, 'dirty-changed', (isDirty) => {
      this.#view.setDirtyState(isDirty);
    });

    this.#on(model, 'steps-changed', (steps) => {
      this.#view.renderSteps(steps);
      // 根据步骤是否为空显示/隐藏空状态
      if (steps && steps.length > 0) {
        this.#view.hideStepsEmpty();
      } else {
        this.#view.showStepsEmpty();
      }
      // 初始化步骤卡片内的 custom-select 组件
      const stepsList = document.querySelector('#tc-steps-list');
      if (stepsList) {
        this.#view.initStepSelects(stepsList);
      }
      // 清理旧的步骤卡片事件，重新绑定
      this.#unbindStepCardEvents();
      this.#bindStepCardEvents();
    });

    this.#on(model, 'app-changed', (app) => {
      this.#view.renderSelectedApp(app);
      // 选中应用后启用步骤区域
      if (app) {
        this.#view.updateStepsSectionState(true);
        this.#view.hideStepsEmpty();
        // 重新渲染步骤卡片以更新页面/元素选项
        const steps = this.#model.get('steps');
        if (steps && steps.length > 0) {
          this.#view.renderSteps(steps);
          const stepsList = document.querySelector('#tc-steps-list');
          if (stepsList) this.#view.initStepSelects(stepsList);
          this.#unbindStepCardEvents();
          this.#bindStepCardEvents();
        }
      }
    });

    this.#on(model, 'platform-changed', (platform) => {
      this.#view.renderSelectedPlatform(platform);
    });

    this.#on(model, 'markers-changed', (markers) => {
      this.#view.renderSelectedMarkers(markers);
      this.#syncMarkerOptionsState(markers);
      this.#bindMarkerBadgeRemove();
    });

    this.#on(model, 'apps-changed', (apps) => {
      this.#view.renderAppOptions(apps, this.#model.get('selectedApp'));
      this.#bindAppOptionClicks();
    });

    this.#on(model, 'ble-devices-changed', (devices) => {
      this.#view.renderBleDevices(devices);
    });

    this.#on(model, 'markers-list-changed', (markers) => {
      this.#view.renderMarkersOptions(markers, this.#model.get('selectedMarkers'));
      this.#bindMarkersOptionClicks();
    });

    this.#on(model, 'case-loaded', (data) => {
      this.#view.populateForm(data);
      // 确保步骤卡片 custom-select 已初始化
      const stepsList = document.querySelector('#tc-steps-list');
      if (stepsList) this.#view.initStepSelects(stepsList);
      this.#unbindStepCardEvents();
      this.#bindStepCardEvents();
    });

    this.#on(model, 'step-updated', ({ stepId, selectId, value, index }) => {
      // 需要级联渲染的 selectId：页面/元素/操作/输入类型/比较目标值类型/页面操作类型/搜索类型/BLE方法
      const cascadeSelects = [
        'tc-page-select', 'tc-element-select', 'tc-operation-select',
        'tc-input-type-select', 'tc-target-value-type', 'tc-page-operation-type',
        'tc-search-type', 'tc-ble-method-select', 'tc-ble-device-select',
        'tc-compare-element-page', 'tc-compare-element-select',
        'tc-search-element-page', 'tc-search-element-select',
        'tc-multi-element-select', 'tc-multi-operation-select',
        'tc-multi-input-type-select', 'tc-multi-faker-locale',
        'tc-faker-locale', 'tc-faker-provider', 'tc-faker-category', 'tc-faker-method',
        'tc-random-precision', 'tc-nav-key-select', 'tc-ble-step-select',
      ];
      const needsRerender = cascadeSelects.some(cs => selectId.startsWith(cs));
      if (needsRerender) {
        // 先同步 DOM 数据到 model，避免重新渲染时丢失用户编辑的值
        this.#model.syncStepsFromDOM();
        this.#rerenderStepCard(stepId);
      }
    });

    this.#on(model, 'case-saved', (result) => {
      this.#view.hideEditor();
      Toast.success(window.i18n?.t('testCase.saveSuccess') || '保存成功');
    });

    this.#on(model, 'case-deleted', () => {
      this.#view.hideEditor();
      Toast.success(window.i18n?.t('testCase.deleteSuccess') || '删除成功');
    });

    this.#on(model, 'error', (err) => {
      const msgKey = err.message || err.source || String(err);
      const translated = window.i18n?.t(`testCase.${msgKey}`) || window.i18n?.t(msgKey) || msgKey;
      Toast.error(translated);
    });
  }

  // ─── DOM 事件绑定 ────────────────────────────────────────

  #bindDomEvents() {
    const unbind = Action.bindAll({
      '#tc-select-directory-btn': () => this.handleSelectDirectory(),
      '#tc-add-new-btn': () => this.handleAddNew(),
      '#tc-add-step-btn': () => this.handleAddStep(),
      '#tc-add-step-bottom-btn': () => this.handleAddStep(),
      '#tc-cancel-btn': () => this.handleCancel(),
      '#tc-save-btn': () => this.handleSave(),
      '#tc-delete-btn': () => this.handleDelete(),
      '#tc-search-clear': () => this.handleSearchClear(),
    });
    this.#unbinds.push(unbind);

    // 搜索输入（防抖）
    const searchInput = document.querySelector('#tc-search-input');
    if (searchInput) {
      const handler = (e) => {
        const query = e.target.value.trim();
        this.handleSearchInput(query);
      };
      searchInput.addEventListener('input', handler);
      this.#unbinds.push(() => searchInput.removeEventListener('input', handler));
    }
  }

  // ─── 步骤卡片事件绑定 ────────────────────────────────────

  #unbindStepCardEvents() {
    this.#stepCardUnbinds.forEach(fn => fn());
    this.#stepCardUnbinds = [];
  }

  // ─── 文件列表事件绑定 ────────────────────────────────────

  #bindFileListEvents() {
    const listContainer = document.querySelector('#tc-test-files-list');
    if (!listContainer) return;

    // 使用事件委托，避免每次重新渲染后重新绑定
    const clickHandler = (e) => {
      const fileItem = e.target.closest('.test-case-file-item');
      if (!fileItem) return;
      const fileName = fileItem.dataset.fileName;
      const pyFilePath = fileItem.dataset.pyFilePath;
      if (fileName) {
        this.handleFileSelect({ name: fileName, pyFilePath }, fileItem);
      }
    };

    // 先移除旧的监听器（通过克隆节点方式不可行，用标记判断）
    if (!listContainer.__tcClickBound) {
      listContainer.addEventListener('click', clickHandler);
      this.#unbinds.push(() => {
        listContainer.removeEventListener('click', clickHandler);
        listContainer.__tcClickBound = false;
      });
      listContainer.__tcClickBound = true;
    }
  }

  #bindStepCardEvents() {
    const container = document.querySelector('#tc-steps-list');
    if (!container) return;

    const cards = container.querySelectorAll('.tc-step-card');
    cards.forEach((card) => {
      const stepId = card.dataset.stepId;
      if (!stepId) return;
      this.#bindSingleStepCardEvents(card, stepId);
    });

    // 拖拽排序
    this.#bindStepDragDrop(container);
    // 更新移动按钮状态
    this.#updateMoveButtonsState();
  }

  /**
   * 绑定步骤卡片拖拽排序事件
   */
  #bindStepDragDrop(container) {
    const cards = container.querySelectorAll('.tc-step-card');

    cards.forEach((card) => {
      const grips = card.querySelectorAll('.tc-drag-grip[data-drag-grip]');

      grips.forEach((grip) => {
        grip.draggable = true;

        const dragstartHandler = (e) => {
          this.#draggedStepCard = card;
          card.classList.add('dragging');
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setDragImage(card, 0, 0);
        };
        grip.addEventListener('dragstart', dragstartHandler);
        this.#stepCardUnbinds.push(() => grip.removeEventListener('dragstart', dragstartHandler));

        const dragendHandler = () => {
          card.classList.remove('dragging');
          this.#draggedStepCard = null;
          this.#syncStepOrdersFromDOM();
          this.#updateMoveButtonsState();
        };
        grip.addEventListener('dragend', dragendHandler);
        this.#stepCardUnbinds.push(() => grip.removeEventListener('dragend', dragendHandler));
      });

      const dragoverHandler = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        if (this.#draggedStepCard && this.#draggedStepCard !== card) {
          const allCards = [...container.querySelectorAll('.tc-step-card:not(.dragging)')];
          const nextCard = allCards.find((c) => {
            const rect = c.getBoundingClientRect();
            return e.clientY < rect.top + rect.height / 2;
          });

          if (nextCard) {
            container.insertBefore(this.#draggedStepCard, nextCard);
          } else {
            container.appendChild(this.#draggedStepCard);
          }
        }
      };
      card.addEventListener('dragover', dragoverHandler);
      this.#stepCardUnbinds.push(() => card.removeEventListener('dragover', dragoverHandler));
    });
  }

  /**
   * 从 DOM 顺序同步步骤 order 到 model
   */
  #syncStepOrdersFromDOM() {
    const container = document.querySelector('#tc-steps-list');
    if (!container) return;

    const cards = container.querySelectorAll('.tc-step-card');
    const steps = this.#model.get('steps');

    cards.forEach((card, index) => {
      const stepId = card.getAttribute('data-step-id');
      const step = steps.find((s) => s.id === stepId);
      if (step) {
        step.order = index + 1;
      }
      // 更新显示的序号
      const numberEl = card.querySelector('.tc-step-number');
      if (numberEl) {
        numberEl.textContent = index + 1;
      }
    });

    this.#model.markDirty();
  }

  /**
   * 更新移动按钮的禁用状态
   */
  #updateMoveButtonsState() {
    const container = document.querySelector('#tc-steps-list');
    if (!container) return;
    const cards = [...container.querySelectorAll('.tc-step-card')];

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
   * 绑定步骤内 custom-select 组件的变更事件
   */
  #bindStepSelectEvents(card, stepId) {
    const selectWrappers = card.querySelectorAll('.tc-step-select-wrapper');

    selectWrappers.forEach((wrapper) => {
      const select = wrapper.querySelector('.custom-select');
      if (!select || select.dataset.controllerBound) return;
      select.dataset.controllerBound = 'true';

      // options 可能已被 initStepSelects 移到 body 下，需要通过 ID 查找
      let options = select.querySelector('.custom-select__options');
      if (!options && select.id) {
        options = document.getElementById(`${select.id}-options`);
      }
      if (!options) return;

      const selectedEl = select.querySelector('.custom-select__selected');
      const optionItems = options.querySelectorAll('.custom-select__option');
      optionItems.forEach((option) => {
        const optionHandler = (e) => {
          e.stopPropagation();
          const value = option.dataset.value;
          const selectId = select.dataset.selectId;
          const index = wrapper.dataset.index !== undefined ? parseInt(wrapper.dataset.index) : -1;

          // 更新选中状态
          optionItems.forEach(opt => opt.classList.remove('selected'));
          option.classList.add('selected');

          // 更新显示文本
          const selectedSpan = selectedEl?.querySelector('.custom-select__text');
          if (selectedSpan) {
            selectedSpan.textContent = option.querySelector('span')?.textContent || value;
          }

          // 隐藏下拉框
          this.#view.closeDropdown(options);

          // 通知 model
          this.handleSelectChange(selectId, value, stepId, index);
        };
        option.addEventListener('click', optionHandler);
        this.#stepCardUnbinds.push(() => option.removeEventListener('click', optionHandler));
      });
    });
  }

  /**
   * 绑定步骤子类型事件（元素操作/蓝牙/页面/系统）
   */
  #bindStepSubtypeEvents(card, stepId) {
    // 元素操作值事件
    this.#bindOperationValueEvents(card, stepId);

    // 蓝牙级联选择器初始化
    this.#initBleCascadeSelect(card, stepId);

    // 蓝牙参数输入
    const bleParamInputs = card.querySelectorAll('.tc-ble-param-input');
    bleParamInputs.forEach((input) => {
      // input 事件：限制小数位数（截断，不格式化）
      const inputHandler = (e) => {
        const precision = e.target.dataset.precision;
        if (precision !== undefined && e.target.type === 'number') {
          const value = e.target.value;
          if (value.includes('.')) {
            const parts = value.split('.');
            const maxDecimals = parseInt(precision);
            if (parts[1] && parts[1].length > maxDecimals) {
              parts[1] = parts[1].substring(0, maxDecimals);
              e.target.value = parts.join('.');
            }
          }
        }
      };
      input.addEventListener('input', inputHandler);
      this.#stepCardUnbinds.push(() => input.removeEventListener('input', inputHandler));

      // change 事件：保存参数值
      const changeHandler = (e) => {
        const paramKey = e.target.dataset.paramKey;
        if (paramKey) {
          const value = e.target.type === 'number' ? parseFloat(e.target.value) : e.target.value;
          this.handleSelectChange(`tc-ble-param-${paramKey}`, value, stepId, -1);
        }
      };
      input.addEventListener('change', changeHandler);
      this.#stepCardUnbinds.push(() => input.removeEventListener('change', changeHandler));
    });

    // 页面操作 - 比较目标值类型切换
    const compareTargetValue = card.querySelector('.tc-compare-target-value');
    if (compareTargetValue) {
      const compareHandler = (e) => {
        this.handleMarkDirty();
      };
      compareTargetValue.addEventListener('input', compareHandler);
      this.#stepCardUnbinds.push(() => compareTargetValue.removeEventListener('input', compareHandler));
    }

    // 系统操作 - 点击次数
    const clickCountInput = card.querySelector('.tc-nav-click-count');
    if (clickCountInput) {
      const clickCountHandler = (e) => {
        this.handleSelectChange('tc-system-operation-type', stepId, e.target.value, -1);
      };
      clickCountInput.addEventListener('change', clickCountHandler);
      this.#stepCardUnbinds.push(() => clickCountInput.removeEventListener('change', clickCountHandler));
    }

    // 搜索匹配类型 radio
    const searchMatchRadios = card.querySelectorAll('.tc-search-match-radio');
    searchMatchRadios.forEach((radio) => {
      const radioHandler = () => {
        this.handleMarkDirty();
      };
      radio.addEventListener('change', radioHandler);
      this.#stepCardUnbinds.push(() => radio.removeEventListener('change', radioHandler));
    });

    // 元素多选 checkbox
    const multiSelectCheckbox = card.querySelector('.tc-multi-select-checkbox');
    if (multiSelectCheckbox) {
      const multiSelectHandler = (e) => {
        this.handleMultiSelectToggle(stepId, e.target.checked);
      };
      multiSelectCheckbox.addEventListener('change', multiSelectHandler);
      this.#stepCardUnbinds.push(() => multiSelectCheckbox.removeEventListener('change', multiSelectHandler));
    }

    // 添加多选元素按钮
    const addMultiElementBtn = card.querySelector('.tc-add-multi-element-btn');
    if (addMultiElementBtn) {
      const addHandler = () => {
        this.handleAddMultiElement(stepId);
      };
      addMultiElementBtn.addEventListener('click', addHandler);
      this.#stepCardUnbinds.push(() => addMultiElementBtn.removeEventListener('click', addHandler));
    }

    // 删除多选元素按钮
    const removeMultiElementBtns = card.querySelectorAll('.tc-multi-element-remove-btn');
    removeMultiElementBtns.forEach((btn) => {
      const removeHandler = () => {
        const index = parseInt(btn.dataset.index);
        this.handleRemoveMultiElement(stepId, index);
      };
      btn.addEventListener('click', removeHandler);
      this.#stepCardUnbinds.push(() => btn.removeEventListener('click', removeHandler));
    });

    // 多选点击数量
    const multiClickCount = card.querySelector('.tc-multi-click-count');
    if (multiClickCount) {
      const countHandler = (e) => {
        this.handleMarkDirty();
      };
      multiClickCount.addEventListener('change', countHandler);
      this.#stepCardUnbinds.push(() => multiClickCount.removeEventListener('change', countHandler));
    }
  }

  /**
   * 初始化蓝牙设备级联选择器
   */
  #initBleCascadeSelect(card, stepId) {
    const container = card.querySelector(`.tc-ble-device-select-container[data-step-id="${stepId}"]`);
    if (!container) return;

    if (!DeviceCascadeSelect) {
      console.warn('[TestCase] DeviceCascadeSelect not available, skipping BLE cascade init');
      return;
    }

    const bleDevices = this.#model.get('bleDevices');
    if (!bleDevices || bleDevices.length === 0) return;

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
      onSelect: (device) => {
        const steps = this.#model.get('steps');
        const step = steps.find(s => s.id === stepId);
        if (step) {
          step.config = step.config || {};
          step.config.deviceConfig = {
            deviceId: device.deviceId,
            deviceName: device.name
          };
          this.#model.updateStepSelect('tc-ble-device-select', device.deviceId, stepId, -1);
        }
      }
    });

    cascadeSelect.render(bleDevices);

    // 回显已选设备
    const steps = this.#model.get('steps');
    const step = steps.find(s => s.id === stepId);
    if (step?.config?.deviceConfig?.deviceId) {
      const device = bleDevices.find(d => d.deviceId === step.config.deviceConfig.deviceId);
      if (device) {
        cascadeSelect.select(device, true);
      }
    }
  }

  /**
   * 绑定元素操作值相关事件
   */
  #bindOperationValueEvents(card, stepId) {
    // 文本输入
    const textInputs = card.querySelectorAll('.tc-operation-text-input');
    textInputs.forEach((input) => {
      const handler = () => this.handleMarkDirty();
      input.addEventListener('input', handler);
      this.#stepCardUnbinds.push(() => input.removeEventListener('input', handler));
    });

    // 多选元素操作
    const multiAddBtn = card.querySelector('.tc-multi-element-add-btn');
    if (multiAddBtn) {
      const handler = () => {
        this.handleMarkDirty();
      };
      multiAddBtn.addEventListener('click', handler);
      this.#stepCardUnbinds.push(() => multiAddBtn.removeEventListener('click', handler));
    }

    const multiRemoveBtns = card.querySelectorAll('.tc-multi-element-remove-btn');
    multiRemoveBtns.forEach((btn) => {
      const handler = () => {
        this.handleMarkDirty();
      };
      btn.addEventListener('click', handler);
      this.#stepCardUnbinds.push(() => btn.removeEventListener('click', handler));
    });
  }

  // ─── Handler 方法 ────────────────────────────────────────

  async handleSelectDirectory() {
    await this.#model.selectDirectory();
  }

  handleSearchInput(query) {
    clearTimeout(this.#searchDebounceTimer);
    clearTimeout(this.#searchLoadingTimer);
    this.#isSearchLoading = false;
    if (!query) {
      this.#model.setSearchQuery('');
      return;
    }
    this.#searchDebounceTimer = setTimeout(() => {
      this.#isSearchLoading = true;
      this.#view.renderSearchLoading();
      const startTime = Date.now();
      this.#model.setSearchQuery(query);
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 1000 - elapsed);
      this.#searchLoadingTimer = setTimeout(() => {
        this.#isSearchLoading = false;
        this.#view.renderTestFiles(
          this.#model.get('testFiles'),
          this.#model.get('jsonExistsMap'),
          this.#model.get('searchQuery')
        );
        this.#bindFileListEvents();
      }, remaining);
    }, 1000);
  }

  handleSearchClear() {
    const searchInput = document.querySelector('#tc-search-input');
    if (searchInput) searchInput.value = '';
    clearTimeout(this.#searchDebounceTimer);
    clearTimeout(this.#searchLoadingTimer);
    this.#isSearchLoading = false;
    this.#model.setSearchQuery('');
  }

  handleAddNew() {
    if (!this.#model.get('selectedDirectory')) return;
    this.#model.showEditor(null);
  }

  handleFileSelect(file, element) {
    const isDirty = this.#model.get('hasUnsavedChanges');

    if (element && element.classList.contains('selected')) {
      if (isDirty) {
        if (!this.#confirmUnsavedChanges()) return;
      }
      this.#model.deselectFile();
      return;
    }

    const doSelect = () => {
      this.#view.selectFileItem(element);
      this.#model.selectFile(file);
    };

    if (isDirty) {
      this.#confirmUnsavedChangesWithCallbacks(
        () => { this.handleSave().then(doSelect); },
        doSelect,
      );
      return;
    }

    doSelect();
  }

  handleCancel() {
    const isDirty = this.#model.get('hasUnsavedChanges');
    if (isDirty) {
      this.#confirmUnsavedChangesWithCallbacks(
        () => { this.handleSave().then(() => this.#model.cancelEdit()); },
        () => this.#model.cancelEdit(),
      );
      return;
    }
    this.#model.cancelEdit();
  }

  async handleSave() {
    const caseData = this.#model.collectFormData();
    await this.#model.saveCase(caseData);
  }

  handleDelete() {
    const selectedFile = this.#model.get('selectedFile');
    if (!selectedFile) {
      Toast.error(window.i18n?.t('testCase.noFileSelected') || '未选择文件');
      return;
    }

    const title = window.i18n?.t('testCase.deleteConfirmTitle') || '确认删除';
    const message = window.i18n?.t('testCase.deleteConfirmMessage', { name: selectedFile.name })
      || `确定要删除 "${selectedFile.name}" 吗？`;

    if (!window.confirm(message)) return;
    const file = this.#model.get('selectedFile');
    this.#model.deleteCase(file?.name, file?.pyFilePath);
  }

  handleAddStep() {
    this.#model.addStep();
  }

  handleSelectChange(selectId, value, stepId, index) {
    this.#model.updateStepSelect(selectId, value, stepId, index);
  }

  handleStepTypeChange(stepId, type) {
    this.#model.changeStepType(stepId, type);
  }

  handleStepNameChange(stepId, name) {
    this.#model.updateStepName(stepId, name);
  }

  handleStepCopy(stepId) {
    this.#model.copyStep(stepId);
  }

  handleStepDelete(stepId) {
    this.#model.deleteStep(stepId);
  }

  handleMultiSelectToggle(stepId, checked) {
    this.#model.syncStepsFromDOM();

    const steps = this.#model.get('steps');
    const step = steps.find(s => s.id === stepId);
    if (!step) return;

    step.config = step.config || {};
    step.config.multiSelect = checked;
    if (checked) {
      step.config.selectedElements = step.config.selectedElements || [];
      if (step.config.selectedElements.length === 0) {
        step.config.selectedElements = [{}];
      }
      step.config.multiClickCount = 1;
    } else {
      step.config.selectedElements = [];
      step.config.multiClickCount = 1;
    }

    // 重新渲染步骤卡片
    this.#rerenderStepCard(stepId);
  }

  handleAddMultiElement(stepId) {
    // 先同步 DOM 数据到 model，避免覆盖用户编辑
    this.#model.syncStepsFromDOM();

    const steps = this.#model.get('steps');
    const step = steps.find(s => s.id === stepId);
    if (!step) return;

    step.config = step.config || {};
    step.config.selectedElements = step.config.selectedElements || [];
    step.config.selectedElements.push({});

    this.#rerenderStepCard(stepId);
  }

  handleRemoveMultiElement(stepId, index) {
    this.#model.syncStepsFromDOM();

    const steps = this.#model.get('steps');
    const step = steps.find(s => s.id === stepId);
    if (!step) return;

    step.config = step.config || {};
    step.config.selectedElements = step.config.selectedElements || [];
    if (step.config.selectedElements.length > 1) {
      step.config.selectedElements.splice(index, 1);
    }

    this.#rerenderStepCard(stepId);
  }

  handleStepMove(stepId, direction) {
    this.#model.moveStep(stepId, direction);
  }

  handleAppSelect(appId) {
    const apps = this.#model.get('apps');
    const app = apps?.find(a => a.id === appId);
    if (app) this.#model.selectApp(app);
  }

  handlePlatformSelect(platform) {
    this.#model.selectPlatform(platform);
  }

  handleMarkerToggle(marker) {
    this.#model.toggleMarker(marker);
  }

  handleMarkDirty() {
    this.#model.markDirty();
  }

  // ─── 未保存更改确认 ──────────────────────────────────────

  #confirmUnsavedChanges() {
    const message = window.i18n?.t('testCase.unsavedChangesMessage') || '当前编辑有未保存的更改，是否放弃？';
    return window.confirm(message);
  }

  #confirmUnsavedChangesWithCallbacks(onSave, onDiscard) {
    const title = window.i18n?.t('testCase.unsavedChangesTitle') || '未保存的更改';
    const message = window.i18n?.t('testCase.unsavedChangesMessage') || '当前编辑有未保存的更改，是否保存？';

    const overlay = document.getElementById('save-confirm-modal-overlay');
    const titleEl = document.getElementById('save-confirm-modal-title');
    const messageEl = document.getElementById('save-confirm-modal-message');
    const cancelBtn = document.getElementById('save-confirm-cancel-btn');
    const discardBtn = document.getElementById('save-confirm-discard-btn');
    const saveBtn = document.getElementById('save-confirm-save-btn');

    if (!overlay || !cancelBtn || !discardBtn || !saveBtn) {
      // 降级为原生 confirm
      if (window.confirm(message)) {
        onSave();
      } else {
        onDiscard();
      }
      return;
    }

    if (titleEl) titleEl.textContent = title;
    if (messageEl) messageEl.textContent = message;

    // 清理旧的事件监听器（克隆节点方式）
    const newCancelBtn = cancelBtn.cloneNode(true);
    const newDiscardBtn = discardBtn.cloneNode(true);
    const newSaveBtn = saveBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
    discardBtn.parentNode.replaceChild(newDiscardBtn, discardBtn);
    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);

    const hide = () => {
      overlay.classList.add('hidden');
    };

    newCancelBtn.addEventListener('click', () => {
      hide();
    });

    newDiscardBtn.addEventListener('click', () => {
      hide();
      onDiscard();
    });

    newSaveBtn.addEventListener('click', () => {
      hide();
      onSave();
    });

    overlay.classList.remove('hidden');
  }

  // ─── App / Platform / Markers 选项点击绑定 ────────────────

  #bindAppOptionClicks() {
    const optionsContainer = this.#view.els.appOptions;
    if (!optionsContainer) return;

    // 使用事件委托（避免每次重新渲染后重新绑定）
    if (optionsContainer.__tcAppOptionBound) return;
    optionsContainer.__tcAppOptionBound = true;

    optionsContainer.addEventListener('click', (e) => {
      const option = e.target.closest('.custom-select__option:not(.disabled)');
      if (!option) return;
      e.stopPropagation();

      const appId = option.dataset.value;
      const appName = option.dataset.name || option.querySelector('span')?.textContent || '';

      // 更新选中状态
      optionsContainer.querySelectorAll('.custom-select__option').forEach(opt => opt.classList.remove('selected'));
      option.classList.add('selected');

      // 更新显示文本
      const selectedSpan = document.querySelector('#tc-app-selected .custom-select__text');
      if (selectedSpan) selectedSpan.textContent = appName;

      // 隐藏下拉框
      this.#view.closeDropdown(optionsContainer);

      // 通知 model
      const apps = this.#model.get('apps');
      const app = apps?.find(a => a.id === appId);
      if (app) this.handleAppSelect(appId);
    });
  }

  #bindPlatformOptionClicks() {
    const optionsContainer = this.#view.els.platformSelectWrapperOptions;
    if (!optionsContainer) return;

    if (optionsContainer.__tcPlatformOptionBound) return;
    optionsContainer.__tcPlatformOptionBound = true;

    optionsContainer.addEventListener('click', (e) => {
      const option = e.target.closest('.custom-select__option');
      if (!option) return;
      e.stopPropagation();

      const platformValue = option.dataset.value;

      // 更新选中状态
      optionsContainer.querySelectorAll('.custom-select__option').forEach(opt => opt.classList.remove('selected'));
      option.classList.add('selected');

      // 更新显示文本
      const selectedSpan = document.querySelector('#tc-platform-selected .custom-select__text');
      if (selectedSpan) {
        const label = option.querySelector('span')?.textContent || platformValue;
        selectedSpan.textContent = label;
      }

      // 隐藏下拉框
      this.#view.closeDropdown(optionsContainer);

      // 通知 model
      this.handlePlatformSelect(platformValue);
    });
  }

  #bindMarkersOptionClicks() {
    const optionsContainer = this.#view.els.markersOptions;
    if (!optionsContainer) return;

    if (optionsContainer.__tcMarkersOptionBound) return;
    optionsContainer.__tcMarkersOptionBound = true;

    optionsContainer.addEventListener('click', (e) => {
      const option = e.target.closest('.custom-select__option:not(.disabled)');
      if (!option) return;
      e.stopPropagation();

      const value = option.dataset.value;

      // Markers 是多选，toggle 选中状态
      option.classList.toggle('selected');

      // 通知 model（会触发 markers-changed → renderSelectedMarkers + bindMarkerBadgeRemove）
      this.handleMarkerToggle(value);
    });
  }

  /**
   * 同步 markers 下拉框选项的选中状态
   */
  #syncMarkerOptionsState(markers) {
    const optionsContainer = this.#view.els.markersOptions;
    if (!optionsContainer) return;
    optionsContainer.querySelectorAll('.custom-select__option').forEach(opt => {
      opt.classList.toggle('selected', markers.includes(opt.dataset.value));
    });
  }

  /**
   * 绑定 marker 徽章的移除点击事件
   */
  #bindMarkerBadgeRemove() {
    const selectedContainer = this.#view.els.markersSelected;
    if (!selectedContainer) return;

    selectedContainer.querySelectorAll('.marker-badge-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const marker = btn.dataset.marker;
        if (marker) {
          this.handleMarkerToggle(marker);
        }
      });
    });
  }

  // ─── 步骤卡片级联渲染 ──────────────────────────────────────

  /**
   * 重新渲染单个步骤卡片（级联更新时使用）
   */
  #rerenderStepCard(stepId) {
    const steps = this.#model.get('steps');
    const step = steps.find(s => s.id === stepId);
    if (!step) return;

    const oldCard = document.querySelector(`[data-step-id="${stepId}"].tc-step-card`);
    if (!oldCard) return;

    // 注入关联数据
    step._app = this.#view._currentApp || null;
    step._bleDevices = this.#view._bleDevices || [];
    step._allSteps = [...steps].sort((a, b) => a.order - b.order);

    // 计算步骤序号
    const sortedSteps = [...steps].sort((a, b) => a.order - b.order);
    const orderIndex = sortedSteps.findIndex(s => s.id === stepId);

    // 生成新卡片
    const newCard = this.#view.generateStepCard(step, orderIndex + 1);

    // 替换旧卡片
    oldCard.replaceWith(newCard);

    // 清理旧卡片中移到 body 的 options
    document.querySelectorAll(`.custom-select__options[data-moved][id*="${stepId}"]`).forEach(opt => opt.remove());

    // 初始化新卡片内的 custom-select
    this.#view.initStepSelects(newCard);

    // 只绑定新卡片的事件（不清理其他卡片的事件）
    this.#bindSingleStepCardEvents(newCard, stepId);
  }

  /**
   * 绑定单个步骤卡片的事件
   */
  #bindSingleStepCardEvents(card, stepId) {
    // 通用 change 监听（标记 dirty）
    const changeHandler = (e) => {
      if (e.target.matches('input, select, textarea')) {
        this.handleMarkDirty();
      }
    };
    card.addEventListener('change', changeHandler);
    this.#stepCardUnbinds.push(() => card.removeEventListener('change', changeHandler));

    // 步骤名称变更
    const nameInput = card.querySelector('.tc-step-name-input');
    if (nameInput) {
      const nameHandler = (e) => this.handleStepNameChange(stepId, e.target.value);
      nameInput.addEventListener('change', nameHandler);
      this.#stepCardUnbinds.push(() => nameInput.removeEventListener('change', nameHandler));
    }

    // 步骤类型切换
    const typeTabs = card.querySelectorAll('.tc-type-tab');
    typeTabs.forEach((tab) => {
      const typeHandler = () => this.handleStepTypeChange(stepId, tab.dataset.type);
      tab.addEventListener('click', typeHandler);
      this.#stepCardUnbinds.push(() => tab.removeEventListener('click', typeHandler));
    });

    // 复制按钮
    const copyBtn = card.querySelector('.tc-step-copy-btn');
    if (copyBtn) {
      const copyHandler = () => this.handleStepCopy(stepId);
      copyBtn.addEventListener('click', copyHandler);
      this.#stepCardUnbinds.push(() => copyBtn.removeEventListener('click', copyHandler));
    }

    // 删除按钮
    const deleteBtn = card.querySelector('.tc-step-delete-btn');
    if (deleteBtn) {
      const deleteHandler = () => this.handleStepDelete(stepId);
      deleteBtn.addEventListener('click', deleteHandler);
      this.#stepCardUnbinds.push(() => deleteBtn.removeEventListener('click', deleteHandler));
    }

    // 移动按钮（上/下）
    const moveBtns = card.querySelectorAll('.tc-step-move-btn');
    moveBtns.forEach((btn) => {
      const moveHandler = (e) => {
        e.stopPropagation();
        const direction = btn.dataset.move;
        this.handleStepMove(stepId, direction);
      };
      btn.addEventListener('click', moveHandler);
      this.#stepCardUnbinds.push(() => btn.removeEventListener('click', moveHandler));
    });

    // custom-select 下拉框变更
    this.#bindStepSelectEvents(card, stepId);

    // 子类型事件（元素/蓝牙/页面/系统）
    this.#bindStepSubtypeEvents(card, stepId);
  }

  // ─── 工具方法 ────────────────────────────────────────────

  /**
   * 注册 Model 事件监听，自动收集取消函数
   */
  #on(model, event, handler) {
    const unsub = model.on(event, handler);
    this.#unbindModel.push(unsub);
  }
}

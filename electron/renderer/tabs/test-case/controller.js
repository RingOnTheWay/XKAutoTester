import { Action } from '../../core/Action.js';
import { Toast } from '../../components/toast.js';

/**
 * TestCaseController - 测试用例 Tab 控制器
 * 职责：绑定 Model 事件到 View 渲染，绑定 DOM 事件到 Model 方法
 * 不直接操作 DOM（通过 View），不直接调用 API（通过 Model）
 *
 * R10: 原 6 个 controller mixin (ModelEvents/DomBinding/Handler/Confirm/OptionBinding/StepRender)
 *      已内联到本类，移除 Object.assign prototype 注入。方法体保持不变，this.model/this.view
 *      经 getter 暴露，this.unbinds/this.stepCardUnbinds/this.unbindModel 同理。
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
    this.bindModelEvents();
    this.bindDomEvents();
    await this.#model.load();
  }

  // 切换到本 tab 时重新加载应用列表，确保新增/删除的应用立即可见
  async onTabActivated() {
    if (this.#destroyed) return;
    await this.#model.loadApps();
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

  // ─── 访问器（暴露私有字段给内联方法） ────────────────────

  get model() { return this.#model; }
  get view() { return this.#view; }
  get unbinds() { return this.#unbinds; }
  get stepCardUnbinds() { return this.#stepCardUnbinds; }
  set stepCardUnbinds(v) { this.#stepCardUnbinds = v; }
  get unbindModel() { return this.#unbindModel; }
  get isSearchLoading() { return this.#isSearchLoading; }
  set isSearchLoading(v) { this.#isSearchLoading = v; }
  get searchDebounceTimer() { return this.#searchDebounceTimer; }
  set searchDebounceTimer(v) { this.#searchDebounceTimer = v; }
  get searchLoadingTimer() { return this.#searchLoadingTimer; }
  set searchLoadingTimer(v) { this.#searchLoadingTimer = v; }

  // ─── Model 事件 → View 渲染 ──────────────────────────────

  bindModelEvents() {
    const model = this.model;

    this.on(model, 'directory-changed', (path) => {
      this.view.renderSelectedDirectory(path);
    });

    this.on(model, 'files-changed', () => {
      // 搜索loading期间跳过列表渲染，等待loading动画结束后再渲染
      if (this.isSearchLoading) {
        const hasDirectory = !!model.get('selectedDirectory');
        this.view.updateAddButtonState(hasDirectory);
        this.view.updateSearchState(hasDirectory);
        return;
      }
      this.view.renderTestFiles(
        model.get('testFiles'),
        model.get('jsonExistsMap'),
        model.get('searchQuery')
      );
      // 选择目录后启用添加按钮和搜索框
      const hasDirectory = !!model.get('selectedDirectory');
      this.view.updateAddButtonState(hasDirectory);
      this.view.updateSearchState(hasDirectory);
      // 绑定文件列表点击事件
      this.bindFileListEvents();
    });

    this.on(model, 'selected-file-changed', (file) => {
      if (file) {
        this.view.showEditor();
      } else {
        this.view.hideEditor();
      }
    });

    this.on(model, 'editing-changed', (isEditing) => {
      this.view.setEditingState(isEditing);
    });

    this.on(model, 'cancel-edit', () => {
      this.view.hideEditor();
      this.view.resetForm();
      this.view.selectFileItem(null);
    });

    this.on(model, 'show-editor', ({ file, isNew, jsonMissing, fileName }) => {
      this.view.showEditorUI({ file, isNew, jsonMissing, fileName });
      // 初始化编辑器组件（apps, markers, platform select 等）
      this.view.initEditor();
      // 绑定 dirty 回调
      this.view.onDirty(() => this.handleMarkDirty());
      // 绑定 app/platform/markers 选项点击事件
      this.bindAppOptionClicks();
      this.bindPlatformOptionClicks();
      this.bindMarkersOptionClicks();
    });

    this.on(model, 'dirty-changed', (isDirty) => {
      this.view.setDirtyState(isDirty);
    });

    this.on(model, 'steps-changed', (steps) => {
      this.view.renderSteps(steps);
      // 根据步骤是否为空显示/隐藏空状态
      if (steps && steps.length > 0) {
        this.view.hideStepsEmpty();
      } else {
        this.view.showStepsEmpty();
      }
      // 初始化步骤卡片内的 custom-select 组件
      this.view.initStepSelectsSafe();
      // 清理旧的步骤卡片事件，重新绑定
      this.unbindStepCardEvents();
      this.bindStepCardEvents();
    });

    this.on(model, 'app-changed', (app) => {
      this.view.renderSelectedApp(app);
      // 选中应用后启用步骤区域
      if (app) {
        this.view.updateStepsSectionState(true);
        this.view.hideStepsEmpty();
        // 重新渲染步骤卡片以更新页面/元素选项
        const steps = this.model.get('steps');
        if (steps && steps.length > 0) {
          this.view.renderSteps(steps);
          this.view.initStepSelectsSafe();
          this.unbindStepCardEvents();
          this.bindStepCardEvents();
        }
      }
    });

    this.on(model, 'platform-changed', (platform) => {
      this.view.renderSelectedPlatform(platform);
    });

    this.on(model, 'markers-changed', (markers) => {
      this.view.renderSelectedMarkers(markers);
      this.syncMarkerOptionsState(markers);
      this.bindMarkerBadgeRemove();
    });

    this.on(model, 'apps-changed', (apps) => {
      this.view.renderAppOptions(apps, this.model.get('selectedApp'));
      this.bindAppOptionClicks();
      // 同步选中的应用引用并重渲染步骤卡片: page-package 中新增/删除元素后,
      // 应用列表刷新但 selectedApp 仍是旧引用, 步骤卡片的页面/元素下拉不会更新,
      // 导致新元素要重启程序才可见; selectApp 触发 app-changed → renderSteps 重渲染
      const selectedApp = this.model.get('selectedApp');
      if (selectedApp) {
        const freshApp = (apps || []).find(a => a.id === selectedApp.id);
        if (freshApp && freshApp !== selectedApp) {
          this.model.optionPanel.selectApp(freshApp);
        }
      }
    });

    this.on(model, 'ble-devices-changed', (devices) => {
      this.view.renderBleDevices(devices);
    });

    this.on(model, 'markers-list-changed', (markers) => {
      this.view.renderMarkersOptions(markers, this.model.get('selectedMarkers'));
      this.bindMarkersOptionClicks();
    });

    this.on(model, 'case-loaded', (data) => {
      this.view.populateForm(data);
      // 确保步骤卡片 custom-select 已初始化
      this.view.initStepSelectsSafe();
      this.unbindStepCardEvents();
      this.bindStepCardEvents();
    });

    this.on(model, 'step-updated', ({ stepId, selectId, value, index }) => {
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
        this.model.syncStepsFromDOM(this.view.collectStepCardsData(this.model.get('steps')));
        this.rerenderStepCard(stepId);
      }
    });

    this.on(model, 'case-saved', (result) => {
      this.view.hideEditor();
      Toast.success(window.i18n.t('testCase.saveSuccess'));
    });

    this.on(model, 'case-deleted', () => {
      this.view.hideEditor();
      Toast.success(window.i18n.t('testCase.deleteSuccess'));
    });

    this.on(model, 'error', (err) => {
      const msgKey = err.message || err.source || String(err);
      const translated = window.i18n.t(`testCase.${msgKey}`) || window.i18n.t(msgKey) || msgKey;
      Toast.error(translated);
    });
  }

  /**
   * 注册 Model 事件监听，自动收集取消函数
   */
  on(model, event, handler) {
    const unsub = model.on(event, handler);
    this.unbindModel.push(unsub);
  }

  // ─── DOM 事件绑定 ────────────────────────────────────────

  bindDomEvents() {
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
    this.unbinds.push(unbind);

    // 搜索输入（防抖）
    this.unbinds.push(
      this.view.bindSearchInput((query) => this.handleSearchInput(query))
    );
  }

  // ─── 步骤卡片事件绑定 ────────────────────────────────────

  unbindStepCardEvents() {
    this.stepCardUnbinds.forEach(fn => fn());
    this.stepCardUnbinds = [];
  }

  // ─── 文件列表事件绑定 ────────────────────────────────────

  bindFileListEvents() {
    this.unbinds.push(
      this.view.bindFileListClick((file, fileItem) => this.handleFileSelect(file, fileItem))
    );
  }

  bindStepCardEvents() {
    const cards = this.view.getStepCards();

    cards.forEach((card) => {
      const stepId = card.dataset.stepId;
      if (!stepId) return;
      this.bindSingleStepCardEvents(card, stepId);
    });

    // 拖拽排序
    this.unbinds.push(
      this.view.bindStepDragDrop(() => {
        this.syncStepOrdersFromDOM();
        this.view.updateMoveButtonsState();
      })
    );
    // 更新移动按钮状态
    this.view.updateMoveButtonsState();
  }

  /**
   * 从 DOM 顺序同步到 model：重排 steps 数组顺序 + 更新 step.order 字段
   * 拖拽仅改 DOM 顺序，必须同步数组顺序，否则 moveStep 按数组索引判断会失效
   */
  syncStepOrdersFromDOM() {
    const orderMap = this.view.renumberStepCards();
    if (!orderMap.length) return;
    const steps = this.model.get('steps');
    // 按 DOM 顺序重建数组，同时更新 order 字段
    const reordered = [];
    orderMap.forEach(({ stepId, order }) => {
      const step = steps.find((s) => s.id === stepId);
      if (step) {
        step.order = order;
        reordered.push(step);
      }
    });
    // 防御：若 DOM 缺失某些 step（异常情况），追加原数组中剩余的 step
    steps.forEach((s) => {
      if (!reordered.includes(s)) reordered.push(s);
    });
    // 原地替换数组内容（保持引用，避免 emit 触发 renderSteps 重渲染导致拖拽后界面闪烁）
    steps.splice(0, steps.length, ...reordered);
    this.model.markDirty();
  }

  /**
   * 绑定步骤内 custom-select 组件的变更事件
   */
  bindStepSelectEvents(card, stepId) {
    const selectWrappers = card.querySelectorAll('.tc-step-select-wrapper');

    selectWrappers.forEach((wrapper) => {
      const select = wrapper.querySelector('.custom-select');
      if (!select || select.dataset.controllerBound) return;
      select.dataset.controllerBound = 'true';

      // options 可能已被 initStepSelects 移到 body 下，由 View 统一查找
      const options = this.view.findOptionsForSelect(select);
      if (!options) return;

      const optionItems = options.querySelectorAll('.custom-select__option');
        optionItems.forEach((option) => {
          const optionHandler = (e) => {
            e.stopPropagation();
            const value = option.dataset.value;
            const selectId = select.dataset.selectId;
            const index = wrapper.dataset.index !== undefined ? parseInt(wrapper.dataset.index) : -1;

            // MVC: 选中态 classList + 文本通过 view 方法
            this.view.markOptionSelected(options, option);
            this.view.setSelectSelectedText(select, option.querySelector('span')?.textContent || value);

            // 隐藏下拉框
            this.view.closeDropdown(options);

            // 通知 model
            this.handleSelectChange(selectId, value, stepId, index);
          };
          option.addEventListener('click', optionHandler);
          this.stepCardUnbinds.push(() => option.removeEventListener('click', optionHandler));
        });
    });
  }

  /**
   * 绑定步骤子类型事件（元素操作/蓝牙/页面/系统）
   */
  bindStepSubtypeEvents(card, stepId) {
    // 元素操作值事件
    this.bindOperationValueEvents(card, stepId);

    // 蓝牙级联选择器初始化
    this.initBleCascadeSelect(card, stepId);

    // 蓝牙参数输入
    const bleParamInputs = card.querySelectorAll('.tc-ble-param-input');
    bleParamInputs.forEach((input) => {
      // input 事件：限制小数位数（截断，不格式化）
      // MVC: DOM value 写入通过 view.truncateDecimalInput
      const inputHandler = (e) => {
        const precision = e.target.dataset.precision;
        if (precision !== undefined && e.target.type === 'number') {
          this.view.truncateDecimalInput(e.target, precision);
        }
      };
      input.addEventListener('input', inputHandler);
      this.stepCardUnbinds.push(() => input.removeEventListener('input', inputHandler));

      // change 事件：保存参数值
      const changeHandler = (e) => {
        const paramKey = e.target.dataset.paramKey;
        if (paramKey) {
          const value = e.target.type === 'number' ? parseFloat(e.target.value) : e.target.value;
          this.handleSelectChange(`tc-ble-param-${paramKey}`, value, stepId, -1);
        }
      };
      input.addEventListener('change', changeHandler);
      this.stepCardUnbinds.push(() => input.removeEventListener('change', changeHandler));
    });

    // 页面操作 - 比较目标值类型切换
    const compareTargetValue = card.querySelector('.tc-compare-target-value');
    if (compareTargetValue) {
      const compareHandler = (e) => {
        this.handleMarkDirty();
      };
      compareTargetValue.addEventListener('input', compareHandler);
      this.stepCardUnbinds.push(() => compareTargetValue.removeEventListener('input', compareHandler));
    }

    // 系统操作 - 点击次数
    const clickCountInput = card.querySelector('.tc-nav-click-count');
    if (clickCountInput) {
      const clickCountHandler = (e) => {
        // P1-1: 修复参数错位 (此前 stepId 传给 value, e.target.value 传给 stepId,
        // 导致 operationType 被污染为步骤 ID, 点击次数被丢弃)
        this.handleSelectChange('tc-system-operation-type', e.target.value, stepId, -1);
      };
      clickCountInput.addEventListener('change', clickCountHandler);
      this.stepCardUnbinds.push(() => clickCountInput.removeEventListener('change', clickCountHandler));
    }

    // 搜索匹配类型 radio
    const searchMatchRadios = card.querySelectorAll('.tc-search-match-radio');
    searchMatchRadios.forEach((radio) => {
      const radioHandler = () => {
        this.handleMarkDirty();
      };
      radio.addEventListener('change', radioHandler);
      this.stepCardUnbinds.push(() => radio.removeEventListener('change', radioHandler));
    });

    // 元素多选 checkbox
    const multiSelectCheckbox = card.querySelector('.tc-multi-select-checkbox');
    if (multiSelectCheckbox) {
      const multiSelectHandler = (e) => {
        this.handleMultiSelectToggle(stepId, e.target.checked);
      };
      multiSelectCheckbox.addEventListener('change', multiSelectHandler);
      this.stepCardUnbinds.push(() => multiSelectCheckbox.removeEventListener('change', multiSelectHandler));
    }

    // 添加多选元素按钮
    const addMultiElementBtn = card.querySelector('.tc-add-multi-element-btn');
    if (addMultiElementBtn) {
      const addHandler = () => {
        this.handleAddMultiElement(stepId);
      };
      addMultiElementBtn.addEventListener('click', addHandler);
      this.stepCardUnbinds.push(() => addMultiElementBtn.removeEventListener('click', addHandler));
    }

    // 删除多选元素按钮
    const removeMultiElementBtns = card.querySelectorAll('.tc-multi-element-remove-btn');
    removeMultiElementBtns.forEach((btn) => {
      const removeHandler = () => {
        const index = parseInt(btn.dataset.index);
        this.handleRemoveMultiElement(stepId, index);
      };
      btn.addEventListener('click', removeHandler);
      this.stepCardUnbinds.push(() => btn.removeEventListener('click', removeHandler));
    });

    // 多选点击数量
    const multiClickCount = card.querySelector('.tc-multi-click-count');
    if (multiClickCount) {
      const countHandler = (e) => {
        this.handleMarkDirty();
      };
      multiClickCount.addEventListener('change', countHandler);
      this.stepCardUnbinds.push(() => multiClickCount.removeEventListener('change', countHandler));
    }
  }

  /**
   * 初始化蓝牙设备级联选择器
   * MVC: UI 组件实例化委托给 view.showDeviceCascadeSelect，controller 仅传数据 + 回调
   */
  initBleCascadeSelect(card, stepId) {
    const bleDevices = this.model.get('bleDevices');
    if (!bleDevices || bleDevices.length === 0) return;

    const steps = this.model.get('steps');
    const step = steps.find(s => s.id === stepId);
    const currentDeviceId = step?.config?.deviceConfig?.deviceId || null;

    this.view.showDeviceCascadeSelect(stepId, bleDevices, currentDeviceId, (device) => {
      const targetStep = steps.find(s => s.id === stepId);
      if (targetStep) {
        targetStep.config = targetStep.config || {};
        targetStep.config.deviceConfig = {
          deviceId: device.deviceId,
          deviceName: device.name
        };
        this.model.updateStepSelect('tc-ble-device-select', device.deviceId, stepId, -1);
      }
    });
  }

  /**
   * 绑定元素操作值相关事件
   */
  bindOperationValueEvents(card, stepId) {
    // 文本输入
    const textInputs = card.querySelectorAll('.tc-operation-text-input');
    textInputs.forEach((input) => {
      const handler = () => this.handleMarkDirty();
      input.addEventListener('input', handler);
      this.stepCardUnbinds.push(() => input.removeEventListener('input', handler));
    });

    // 多选元素操作
    const multiAddBtn = card.querySelector('.tc-multi-element-add-btn');
    if (multiAddBtn) {
      const handler = () => {
        this.handleMarkDirty();
      };
      multiAddBtn.addEventListener('click', handler);
      this.stepCardUnbinds.push(() => multiAddBtn.removeEventListener('click', handler));
    }

    const multiRemoveBtns = card.querySelectorAll('.tc-multi-element-remove-btn');
    multiRemoveBtns.forEach((btn) => {
      const handler = () => {
        this.handleMarkDirty();
      };
      btn.addEventListener('click', handler);
      this.stepCardUnbinds.push(() => btn.removeEventListener('click', handler));
    });
  }

  // ─── 步骤卡片级联渲染 ──────────────────────────────────────

  /**
   * 重新渲染单个步骤卡片（级联更新时使用）
   */
  rerenderStepCard(stepId) {
    const steps = this.model.get('steps');
    const step = steps.find(s => s.id === stepId);
    if (!step) return;

    // 注入关联数据
    step._app = this.view._currentApp || null;
    step._bleDevices = this.view._bleDevices || [];
    step._allSteps = [...steps].sort((a, b) => a.order - b.order);

    // 计算步骤序号
    const sortedSteps = [...steps].sort((a, b) => a.order - b.order);
    const orderIndex = sortedSteps.findIndex(s => s.id === stepId);

    // 生成新卡片
    const newCard = this.view.generateStepCard(step, orderIndex + 1);

    // 替换旧卡片
    if (!this.view.replaceStepCard(stepId, newCard)) return;

    // 清理旧卡片中移到 body 的 options
    this.view.cleanupMovedOptionsForStep(stepId);

    // 初始化新卡片内的 custom-select
    this.view.initStepSelects(newCard);

    // 只绑定新卡片的事件（不清理其他卡片的事件）
    this.bindSingleStepCardEvents(newCard, stepId);
  }

  /**
   * 绑定单个步骤卡片的事件
   */
  bindSingleStepCardEvents(card, stepId) {
    // 通用 change 监听（标记 dirty）
    const changeHandler = (e) => {
      if (e.target.matches('input, select, textarea')) {
        this.handleMarkDirty();
      }
    };
    card.addEventListener('change', changeHandler);
    this.stepCardUnbinds.push(() => card.removeEventListener('change', changeHandler));

    // 步骤名称变更
    const nameInput = card.querySelector('.tc-step-name-input');
    if (nameInput) {
      const nameHandler = (e) => this.handleStepNameChange(stepId, e.target.value);
      nameInput.addEventListener('change', nameHandler);
      this.stepCardUnbinds.push(() => nameInput.removeEventListener('change', nameHandler));
    }

    // 步骤类型切换
    const typeTabs = card.querySelectorAll('.tc-type-tab');
    typeTabs.forEach((tab) => {
      const typeHandler = () => this.handleStepTypeChange(stepId, tab.dataset.type);
      tab.addEventListener('click', typeHandler);
      this.stepCardUnbinds.push(() => tab.removeEventListener('click', typeHandler));
    });

    // 复制按钮
    const copyBtn = card.querySelector('.tc-step-copy-btn');
    if (copyBtn) {
      const copyHandler = () => this.handleStepCopy(stepId);
      copyBtn.addEventListener('click', copyHandler);
      this.stepCardUnbinds.push(() => copyBtn.removeEventListener('click', copyHandler));
    }

    // 删除按钮
    const deleteBtn = card.querySelector('.tc-step-delete-btn');
    if (deleteBtn) {
      const deleteHandler = () => this.handleStepDelete(stepId);
      deleteBtn.addEventListener('click', deleteHandler);
      this.stepCardUnbinds.push(() => deleteBtn.removeEventListener('click', deleteHandler));
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
      this.stepCardUnbinds.push(() => btn.removeEventListener('click', moveHandler));
    });

    // custom-select 下拉框变更
    this.bindStepSelectEvents(card, stepId);

    // 对比目标值与容差输入框联动
    this.stepCardUnbinds.push(this.view.bindCompareToleranceToggle(card));

    // 子类型事件（元素/蓝牙/页面/系统）
    this.bindStepSubtypeEvents(card, stepId);
  }

  // ─── Handler 方法 ────────────────────────────────────────

  async handleSelectDirectory() {
    await this.model.selectDirectory();
  }

  handleSearchInput(query) {
    clearTimeout(this.searchDebounceTimer);
    clearTimeout(this.searchLoadingTimer);
    this.isSearchLoading = false;
    if (!query) {
      this.model.setSearchQuery('');
      return;
    }
    this.searchDebounceTimer = setTimeout(() => {
      this.isSearchLoading = true;
      this.view.renderSearchLoading();
      const startTime = Date.now();
      this.model.setSearchQuery(query);
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 1000 - elapsed);
      this.searchLoadingTimer = setTimeout(() => {
        this.isSearchLoading = false;
        this.view.renderTestFiles(
          this.model.get('testFiles'),
          this.model.get('jsonExistsMap'),
          this.model.get('searchQuery')
        );
        this.bindFileListEvents();
      }, remaining);
    }, 1000);
  }

  handleSearchClear() {
    this.view.clearSearchInput();
    clearTimeout(this.searchDebounceTimer);
    clearTimeout(this.searchLoadingTimer);
    this.isSearchLoading = false;
    this.model.setSearchQuery('');
  }

  handleAddNew() {
    if (!this.model.get('selectedDirectory')) return;
    this.model.showEditor(null);
  }

  handleFileSelect(file, element) {
    const isDirty = this.model.get('hasUnsavedChanges');

    if (element && element.classList.contains('selected')) {
      if (isDirty) {
        if (!this.confirmUnsavedChanges()) return;
      }
      this.model.deselectFile();
      return;
    }

    const doSelect = () => {
      this.view.selectFileItem(element);
      this.model.selectFile(file);
    };

    if (isDirty) {
      this.confirmUnsavedChangesWithCallbacks(
        () => { this.handleSave().then(doSelect); },
        doSelect,
      );
      return;
    }

    doSelect();
  }

  handleCancel() {
    const isDirty = this.model.get('hasUnsavedChanges');
    if (isDirty) {
      this.confirmUnsavedChangesWithCallbacks(
        () => { this.handleSave().then(() => this.model.cancelEdit()); },
        () => this.model.cancelEdit(),
      );
      return;
    }
    this.model.cancelEdit();
  }

  async handleSave() {
    const caseData = this.model.collectFormData({
      inputs: this.view.collectFormInputs(),
      steps: this.view.collectStepCardsData(this.model.get('steps')),
    });
    await this.model.saveCase(caseData);
  }

  handleDelete() {
    const selectedFile = this.model.get('selectedFile');
    if (!selectedFile) {
      Toast.error(window.i18n.t('testCase.noFileSelected'));
      return;
    }

    const title = window.i18n.t('testCase.deleteConfirmTitle');
    const message = window.i18n.t('testCase.deleteConfirmMessage', { name: selectedFile.name });

    this.view.showConfirmModal(title, message, () => {
      const file = this.model.get('selectedFile');
      this.model.deleteCase(file?.name, file?.pyFilePath);
    });
  }

  handleAddStep() {
    // 先同步 DOM 数据到 model，避免新增步骤触发重渲染时丢失用户在 input 中未提交的值（如随机数 min/max）
    this.model.syncStepsFromDOM(this.view.collectStepCardsData(this.model.get('steps')));
    this.model.addStep();
  }

  handleSelectChange(selectId, value, stepId, index) {
    this.model.updateStepSelect(selectId, value, stepId, index);
  }

  handleStepTypeChange(stepId, type) {
    this.model.changeStepType(stepId, type);
  }

  handleStepNameChange(stepId, name) {
    this.model.updateStepName(stepId, name);
  }

  handleStepCopy(stepId) {
    this.model.copyStep(stepId);
  }

  handleStepDelete(stepId) {
    this.model.deleteStep(stepId);
  }

  handleMultiSelectToggle(stepId, checked) {
    this.model.syncStepsFromDOM(this.view.collectStepCardsData(this.model.get('steps')));

    const steps = this.model.get('steps');
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
    this.rerenderStepCard(stepId);
  }

  handleAddMultiElement(stepId) {
    // 先同步 DOM 数据到 model，避免覆盖用户编辑
    this.model.syncStepsFromDOM(this.view.collectStepCardsData(this.model.get('steps')));

    const steps = this.model.get('steps');
    const step = steps.find(s => s.id === stepId);
    if (!step) return;

    step.config = step.config || {};
    step.config.selectedElements = step.config.selectedElements || [];
    step.config.selectedElements.push({});

    this.rerenderStepCard(stepId);
  }

  handleRemoveMultiElement(stepId, index) {
    this.model.syncStepsFromDOM(this.view.collectStepCardsData(this.model.get('steps')));

    const steps = this.model.get('steps');
    const step = steps.find(s => s.id === stepId);
    if (!step) return;

    step.config = step.config || {};
    step.config.selectedElements = step.config.selectedElements || [];
    if (step.config.selectedElements.length > 1) {
      step.config.selectedElements.splice(index, 1);
    }

    this.rerenderStepCard(stepId);
  }

  handleStepMove(stepId, direction) {
    this.model.moveStep(stepId, direction);
  }

  handleAppSelect(appId) {
    const apps = this.model.get('apps');
    const app = apps?.find(a => a.id === appId);
    if (app) this.model.selectApp(app);
  }

  handlePlatformSelect(platform) {
    this.model.selectPlatform(platform);
  }

  handleMarkerToggle(marker) {
    this.model.toggleMarker(marker);
  }

  handleMarkDirty() {
    this.model.markDirty();
  }

  // ─── App / Platform / Markers 选项点击绑定 ────────────────

  bindAppOptionClicks() {
    const optionsContainer = this.view.els.appOptions;
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

      // MVC: 选中态 classList 通过 view.markOptionSelected
      this.view.markOptionSelected(optionsContainer, option);

      // 更新显示文本
      this.view.setAppSelectedText(appName);

      // 隐藏下拉框
      this.view.closeDropdown(optionsContainer);

      // 通知 model
      const apps = this.model.get('apps');
      const app = apps?.find(a => a.id === appId);
      if (app) this.handleAppSelect(appId);
    });
  }

  bindPlatformOptionClicks() {
    const optionsContainer = this.view.els.platformSelectWrapperOptions;
    if (!optionsContainer) return;

    if (optionsContainer.__tcPlatformOptionBound) return;
    optionsContainer.__tcPlatformOptionBound = true;

    optionsContainer.addEventListener('click', (e) => {
      const option = e.target.closest('.custom-select__option');
      if (!option) return;
      e.stopPropagation();

      const platformValue = option.dataset.value;

      // MVC: 选中态 classList 通过 view.markOptionSelected
      this.view.markOptionSelected(optionsContainer, option);

      // 更新显示文本
      const label = option.querySelector('span')?.textContent || platformValue;
      this.view.setPlatformSelectedText(label);

      // 隐藏下拉框
      this.view.closeDropdown(optionsContainer);

      // 通知 model
      this.handlePlatformSelect(platformValue);
    });
  }

  bindMarkersOptionClicks() {
    const optionsContainer = this.view.els.markersOptions;
    if (!optionsContainer) return;

    if (optionsContainer.__tcMarkersOptionBound) return;
    optionsContainer.__tcMarkersOptionBound = true;

    optionsContainer.addEventListener('click', (e) => {
      const option = e.target.closest('.custom-select__option:not(.disabled)');
      if (!option) return;
      e.stopPropagation();

      const value = option.dataset.value;

      // MVC: markers 多选 toggle 通过 view.toggleMarkerOption
      this.view.toggleMarkerOption(option);

      // 通知 model（会触发 markers-changed → renderSelectedMarkers + bindMarkerBadgeRemove）
      this.handleMarkerToggle(value);
    });
  }

  /**
   * 同步 markers 下拉框选项的选中状态
   * MVC: 批量 classList 操作委托给 view
   */
  syncMarkerOptionsState(markers) {
    const optionsContainer = this.view.els.markersOptions;
    if (!optionsContainer) return;
    this.view.syncMarkerOptionsState(optionsContainer, markers);
  }

  /**
   * 绑定 marker 徽章的移除点击事件
   */
  bindMarkerBadgeRemove() {
    const selectedContainer = this.view.els.markersSelected;
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

  // ─── 未保存更改确认 ──────────────────────────────────────

  confirmUnsavedChanges() {
    const message = window.i18n.t('testCase.unsavedChangesMessage');
    return window.confirm(message);
  }

  confirmUnsavedChangesWithCallbacks(onSave, onDiscard) {
    const title = window.i18n.t('testCase.unsavedChangesTitle');
    const message = window.i18n.t('testCase.unsavedChangesMessage');

    this.view.showSaveConfirmModal({
      title,
      message,
      onSave,
      onDiscard,
    });
  }
}

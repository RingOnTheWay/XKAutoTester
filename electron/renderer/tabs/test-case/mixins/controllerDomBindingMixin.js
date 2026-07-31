// DOM binding mixin for TestCaseController
// Extracted from controller.js during refactor
// Provides: top-level DOM event wiring + step card / file list event binding + BLE cascade + operation value events
// (bindDomEvents, unbindStepCardEvents, bindFileListEvents, bindStepCardEvents, syncStepOrdersFromDOM,
//  bindStepSelectEvents, bindStepSubtypeEvents, initBleCascadeSelect, bindOperationValueEvents)

import { Action } from '../../../core/Action.js';

export const controllerDomBindingMixin = {
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
  },

  // ─── 步骤卡片事件绑定 ────────────────────────────────────

  unbindStepCardEvents() {
    this.stepCardUnbinds.forEach(fn => fn());
    this.stepCardUnbinds = [];
  },

  // ─── 文件列表事件绑定 ────────────────────────────────────

  bindFileListEvents() {
    this.unbinds.push(
      this.view.bindFileListClick((file, fileItem) => this.handleFileSelect(file, fileItem))
    );
  },

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
  },

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
  },

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
  },

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
        this.handleSelectChange('tc-system-operation-type', stepId, e.target.value, -1);
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
  },

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
  },

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
  },
};

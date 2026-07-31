/**
 * Model Mixin - 步骤操作与变更辅助
 * 提供 addStep / deleteStep / copyStep / moveStep / updateStepOrders /
 *   setSearchQuery / updateStepSelect / changeStepType / updateStepName /
 *   toggleMarker 方法
 * 通过 Object.assign 挂载到 TestCaseModel.prototype
 */
export const modelStepMixin = {
  // ── Step Operations ────────────────────────────────────────────

  /**
   * 添加新步骤
   * @returns {Object} 新创建的步骤
   */
  addStep() {
    const stepId = `step_${Date.now()}`;
    const newStep = {
      id: stepId,
      order: this._state.steps.length + 1,
      name: window.i18n.t('testCase.defaultStepName', { n: this._state.steps.length + 1 }),
      type: 'element',
      config: {
        pageId: null,
        pageName: null,
        elementId: null,
        elementName: null,
        locator: null,
        locatorValue: null,
        operation: 'click',
        operationValue: {},
      },
    };
    this._state.steps.push(newStep);
    this._set('hasUnsavedChanges', true, 'dirty-changed');
    this.emit('steps-changed', this._state.steps);
    return newStep;
  },

  /**
   * 删除步骤
   * @param {string} stepId - 步骤 ID
   */
  deleteStep(stepId) {
    this._state.steps = this._state.steps.filter(s => s.id !== stepId);
    this.updateStepOrders();
    this._set('hasUnsavedChanges', true, 'dirty-changed');
    this.emit('steps-changed', this._state.steps);
  },

  /**
   * 深拷贝步骤并追加到末尾
   * @param {string} stepId - 源步骤 ID
   * @returns {Object} 新步骤
   */
  copyStep(stepId) {
    const original = this._state.steps.find(s => s.id === stepId);
    if (!original) return null;

    const newStepId = `step_${Date.now()}`;
    const newStep = {
      ...JSON.parse(JSON.stringify(original)),
      id: newStepId,
      name: window.i18n.t('testCase.copySuffix', { name: original.name }),
      order: this._state.steps.length + 1,
    };

    this._state.steps.push(newStep);
    this._set('hasUnsavedChanges', true, 'dirty-changed');
    this.emit('steps-changed', this._state.steps);
    return newStep;
  },

  /**
   * 上下移动步骤
   * @param {string} stepId - 步骤 ID
   * @param {'up'|'down'} direction - 移动方向
   */
  moveStep(stepId, direction) {
    const idx = this._state.steps.findIndex(s => s.id === stepId);
    if (idx === -1) return;
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === this._state.steps.length - 1) return;

    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    const temp = this._state.steps[idx];
    this._state.steps[idx] = this._state.steps[targetIdx];
    this._state.steps[targetIdx] = temp;

    this.updateStepOrders();
    this._set('hasUnsavedChanges', true, 'dirty-changed');
    this.emit('steps-changed', this._state.steps);
  },

  /**
   * 根据 steps 数组索引同步 step.order
   */
  updateStepOrders() {
    this._state.steps.forEach((step, index) => {
      step.order = index + 1;
    });
  },

  // ── Step Mutation Helpers ──────────────────────────────────────

  /**
   * 设置搜索查询并触发文件列表重新渲染
   * @param {string} query - 搜索关键词
   */
  setSearchQuery(query) {
    this._set('searchQuery', query, 'files-changed');
  },

  /**
   * 更新步骤中下拉选择器的值
   * @param {string} selectId - 选择器 ID
   * @param {string} value - 新值
   * @param {string} stepId - 步骤 ID
   * @param {number} [index] - 多元素索引
   */
  updateStepSelect(selectId, value, stepId, index) {
    const step = this._state.steps.find(s => s.id === stepId);
    if (!step) return;

    // 根据 selectId 前缀更新步骤配置
    const config = step.config || {};
    if (selectId.startsWith('tc-page-select')) {
      config.pageId = value;
    } else if (selectId.startsWith('tc-element-select')) {
      config.elementId = value;
    } else if (selectId.startsWith('tc-operation-select')) {
      config.operation = value;
    } else if (selectId.startsWith('tc-input-type-select')) {
      config.operationValue = config.operationValue || {};
      config.operationValue.inputType = value;
    } else if (selectId.startsWith('tc-ble-method-select')) {
      config.deviceConfig = config.deviceConfig || {};
      config.deviceConfig.methodName = value;
      delete config.deviceConfig.params;
    } else if (selectId.startsWith('tc-system-operation-type')) {
      config.systemConfig = config.systemConfig || {};
      config.systemConfig.operationType = value;
    } else if (selectId.startsWith('tc-page-operation-type')) {
      config.operationType = value;
    } else if (selectId.startsWith('tc-target-value-type')) {
      config.compareConfig = config.compareConfig || {};
      config.compareConfig.targetValueType = value;
      if (value === 'custom') {
        config.compareConfig.targetValue = '';
        delete config.compareConfig.bleStepId;
      } else if (value === 'ble') {
        delete config.compareConfig.targetValue;
        config.compareConfig.bleStepId = '';
      }
    } else if (selectId.startsWith('tc-search-type')) {
      config.searchConfig = config.searchConfig || {};
      config.searchConfig.searchType = value;
    } else if (selectId.startsWith('tc-faker-locale')) {
      config.operationValue = config.operationValue || {};
      config.operationValue.fakerConfig = config.operationValue.fakerConfig || {};
      config.operationValue.fakerConfig.locale = value;
    } else if (selectId.startsWith('tc-faker-provider')) {
      config.operationValue = config.operationValue || {};
      config.operationValue.fakerConfig = config.operationValue.fakerConfig || {};
      config.operationValue.fakerConfig.provider = value;
    } else if (selectId.startsWith('tc-faker-method')) {
      config.operationValue = config.operationValue || {};
      config.operationValue.fakerConfig = config.operationValue.fakerConfig || {};
      config.operationValue.fakerConfig.method = value;
    } else if (selectId.startsWith('tc-faker-category')) {
      config.operationValue = config.operationValue || {};
      config.operationValue.fakerConfig = config.operationValue.fakerConfig || {};
      config.operationValue.fakerConfig.category = value;
    } else if (selectId.startsWith('tc-nav-key-select')) {
      config.systemConfig = config.systemConfig || {};
      config.systemConfig.navKey = value;
    } else if (selectId.startsWith('tc-random-precision')) {
      config.operationValue = config.operationValue || {};
      config.operationValue.randomConfig = config.operationValue.randomConfig || {};
      config.operationValue.randomConfig.precision = parseInt(value);
    } else if (selectId.startsWith('tc-multi-element-select') && index !== undefined) {
      if (!config.selectedElements) config.selectedElements = [];
      if (!config.selectedElements[index]) config.selectedElements[index] = {};
      config.selectedElements[index].elementId = value;
    } else if (selectId.startsWith('tc-multi-operation-select') && index !== undefined) {
      if (!config.selectedElements) config.selectedElements = [];
      if (!config.selectedElements[index]) config.selectedElements[index] = {};
      config.selectedElements[index].operation = value;
    } else if (selectId.startsWith('tc-multi-input-type-select') && index !== undefined) {
      if (!config.selectedElements) config.selectedElements = [];
      if (!config.selectedElements[index]) config.selectedElements[index] = {};
      config.selectedElements[index].inputType = value;
    } else if (selectId.startsWith('tc-multi-faker-locale') && index !== undefined) {
      if (!config.selectedElements) config.selectedElements = [];
      if (!config.selectedElements[index]) config.selectedElements[index] = {};
      config.selectedElements[index].fakerLocale = value;
    } else if (selectId.startsWith('tc-multi-faker-provider') && index !== undefined) {
      if (!config.selectedElements) config.selectedElements = [];
      if (!config.selectedElements[index]) config.selectedElements[index] = {};
      config.selectedElements[index].fakerProvider = value;
    } else if (selectId.startsWith('tc-compare-element-page')) {
      config.compareConfig = config.compareConfig || {};
      config.compareConfig.pageId = value;
      config.compareConfig.elementId = '';
    } else if (selectId.startsWith('tc-compare-element-select')) {
      config.compareConfig = config.compareConfig || {};
      config.compareConfig.elementId = value;
      // 更新 element locator
      const app = this._state.selectedApp;
      if (app && config.compareConfig.pageId) {
        const page = app.pages?.find(p => p.id === config.compareConfig.pageId);
        const element = page?.elements?.find(el => el.id === value);
        if (element) {
          config.compareConfig.elementName = element.name;
          config.compareConfig.locator = element.locator;
          config.compareConfig.locatorValue = element.value;
        }
      }
    } else if (selectId.startsWith('tc-search-element-page')) {
      config.searchConfig = config.searchConfig || {};
      config.searchConfig.pageId = value;
      config.searchConfig.elementId = '';
      config.searchConfig.elementName = '';
    } else if (selectId.startsWith('tc-search-element-select')) {
      config.searchConfig = config.searchConfig || {};
      config.searchConfig.elementId = value;
      const app = this._state.selectedApp;
      if (app && config.searchConfig?.pageId) {
        const page = app.pages?.find(p => p.id === config.searchConfig.pageId);
        const element = page?.elements?.find(el => el.id === value);
        if (element) {
          config.searchConfig.elementName = element.name;
          config.searchConfig.locator = element.locator;
          config.searchConfig.locatorValue = element.value;
        }
      }
    } else if (selectId.startsWith('tc-ble-step-select')) {
      config.compareConfig = config.compareConfig || {};
      config.compareConfig.bleStepId = value;
    }

    step.config = config;
    this._set('hasUnsavedChanges', true, 'dirty-changed');

    // 级联更新：页面变更时清空元素和操作
    if (selectId.startsWith('tc-page-select')) {
      config.elementId = '';
      config.elementName = null;
      config.locator = null;
      config.locatorValue = null;
      config.operation = 'click';
      config.operationValue = {};
      const app = this._state.selectedApp;
      if (app) {
        const page = app.pages?.find(p => p.id === value);
        config.pageName = page?.name || '';
      }
    }

    // 元素变更时更新 locator
    if (selectId.startsWith('tc-element-select')) {
      const app = this._state.selectedApp;
      if (app && config.pageId) {
        const page = app.pages?.find(p => p.id === config.pageId);
        const element = page?.elements?.find(el => el.id === value);
        if (element) {
          config.elementName = element.name;
          config.locator = element.locator;
          config.locatorValue = element.value;
          if (element.locator === 'click' && config.operation === 'sendText') {
            config.operation = 'click';
            config.operationValue = {};
          }
        }
      }
    }

    // 操作变更时清空操作值
    if (selectId.startsWith('tc-operation-select')) {
      config.operationValue = {};
    }

    this.emit('step-updated', { stepId, selectId, value, index });
  },

  /**
   * 更改步骤类型
   * @param {string} stepId - 步骤 ID
   * @param {string} type - 新类型
   */
  changeStepType(stepId, type) {
    const step = this._state.steps.find(s => s.id === stepId);
    if (!step) return;

    step.type = type;
    // 重置类型特定配置
    step.config = { type };
    this._set('hasUnsavedChanges', true, 'dirty-changed');
    this.emit('steps-changed', this._state.steps);
  },

  /**
   * 更新步骤名称
   * @param {string} stepId - 步骤 ID
   * @param {string} name - 新名称
   */
  updateStepName(stepId, name) {
    const step = this._state.steps.find(s => s.id === stepId);
    if (!step) return;

    step.name = name;
    this._set('hasUnsavedChanges', true, 'dirty-changed');
  },

  /**
   * 切换 Marker 选中状态
   * @param {string} marker - Marker 名称
   */
  toggleMarker(marker) {
    const markers = [...this._state.selectedMarkers];
    const idx = markers.indexOf(marker);
    if (idx === -1) {
      markers.push(marker);
    } else {
      markers.splice(idx, 1);
    }
    this._set('selectedMarkers', markers, 'markers-changed');
  },
};

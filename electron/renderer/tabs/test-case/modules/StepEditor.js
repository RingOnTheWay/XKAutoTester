/**
 * StepEditor - 测试用例步骤编辑器深模块 (R10 renderer mixin → deep module)
 *
 * 领域边界：步骤数组 CRUD / 拖拽状态 / 步骤字段更新 (含 selectId 路由)
 * 不负责：文件浏览 (FileBrowser)、引用数据 (OptionPanel)、编辑器状态机 (TestCaseEditor)、
 *         hasUnsavedChanges 标记 (Model 通过 markDirty 编排)
 *
 * 取自原 modelStepMixin 全部 8 方法。
 * Model 持有实例并委托方法，事件经 Model 转发给 Controller (保持现有 Controller 监听不变)。
 *
 * 依赖注入：构造时注入 getApp 回调，避免与 OptionPanel 硬耦合，
 *           updateStepSelect 中需要 selectedApp 来解析 element locator。
 *
 * R10 阶段 3 接口收紧：_getApp/_state/_set 全部转为 #private。
 *
 * 事件：
 *   - steps-changed(steps)           步骤数组变更 (增/删/复制/移动/类型切换/加载/重置)
 *   - step-updated({stepId, selectId, value, index})  单步字段变更 (updateStepSelect)
 *   - dragged-step-changed(step)     拖拽中步骤变更
 */
import { EventEmitter } from '../../../core/EventEmitter.js';

// 模块级计数器，避免同毫秒内 Date.now() 碰撞导致 stepId 重复
let _stepSeq = 0;
function nextStepId() {
  _stepSeq += 1;
  return `step_${Date.now()}_${_stepSeq}`;
}

export class StepEditor extends EventEmitter {
  /** @type {() => Object|null} 返回当前选中应用 (从 OptionPanel 注入) */
  #getApp;
  /** @type {Object} 内部状态容器 */
  #state = {
    steps: [],
    draggedStep: null,
  };

  /**
   * @param {Object} opts
   * @param {() => Object|null} [opts.getApp] - 返回当前选中应用 (从 OptionPanel 注入)
   */
  constructor({ getApp } = {}) {
    super();
    this.#getApp = getApp || (() => null);
  }

  // ── State Getters ──────────────────────────────────────────────

  /** @returns {Array} 步骤数组 */
  get steps() { return this.#state.steps; }
  /** @returns {Object|null} 当前拖拽中的步骤 */
  get draggedStep() { return this.#state.draggedStep; }

  /**
   * 通用状态获取（供 Model.get 委托）
   * @param {string} key - 状态键名
   * @returns {*} 状态值，键不存在返回 undefined
   */
  get(key) { return this.#state[key]; }

  /**
   * 更新状态并触发对应事件 (内部方法)
   * @param {string} key - 状态键名
   * @param {*} value - 新值
   * @param {string} [event] - 事件名，默认 `${key}-changed`
   */
  #set(key, value, event) {
    const old = this.#state[key];
    if (old === value) return;
    this.#state[key] = value;
    this.emit(event || `${key}-changed`, value, old);
  }

  // ── Load / Reset / Sync (不触发 dirty) ─────────────────────────

  /**
   * 设置步骤数组 (从已保存用例加载)
   * 注：不触发 dirty-requested，由 Model 调用方决定是否标记 dirty
   * @param {Array} steps - 步骤数组
   */
  setSteps(steps) {
    this.#state.steps = Array.isArray(steps) ? [...steps] : [];
    this.emit('steps-changed', this.#state.steps);
  }

  /**
   * 重置步骤为空数组
   */
  reset() {
    this.#state.steps = [];
    this.emit('steps-changed', this.#state.steps);
  }

  /**
   * 从 DOM 收集的步骤数据静默同步 (不触发事件)
   * 保留原 syncStepsFromDOM 行为：直接覆盖 #state.steps，无 emit
   * @param {Array} steps - View 收集的步骤数据
   */
  syncFromDOM(steps) {
    if (!Array.isArray(steps) || steps.length === 0) return;
    this.#state.steps = steps;
  }

  /**
   * 设置拖拽中的步骤
   * @param {Object|null} step - 步骤对象或 null
   */
  setDraggedStep(step) {
    this.#set('draggedStep', step, 'dragged-step-changed');
  }

  // ── Step Operations (用户编辑，由 Model 包装标记 dirty) ────────

  /**
   * 添加新步骤
   * @returns {Object} 新创建的步骤
   */
  addStep() {
    const stepId = nextStepId();
    const newStep = {
      id: stepId,
      order: this.#state.steps.length + 1,
      name: window.i18n.t('testCase.defaultStepName', { n: this.#state.steps.length + 1 }),
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
    this.#state.steps.push(newStep);
    this.emit('steps-changed', this.#state.steps);
    return newStep;
  }

  /**
   * 删除步骤
   * @param {string} stepId - 步骤 ID
   */
  deleteStep(stepId) {
    this.#state.steps = this.#state.steps.filter(s => s.id !== stepId);
    this.updateStepOrders();
    this.emit('steps-changed', this.#state.steps);
  }

  /**
   * 深拷贝步骤并追加到末尾
   * @param {string} stepId - 源步骤 ID
   * @returns {Object|null} 新步骤
   */
  copyStep(stepId) {
    const original = this.#state.steps.find(s => s.id === stepId);
    if (!original) return null;

    const newStepId = nextStepId();
    const newStep = {
      ...JSON.parse(JSON.stringify(original)),
      id: newStepId,
      name: window.i18n.t('testCase.copySuffix', { name: original.name }),
      order: this.#state.steps.length + 1,
    };

    this.#state.steps.push(newStep);
    this.emit('steps-changed', this.#state.steps);
    return newStep;
  }

  /**
   * 上下移动步骤
   * @param {string} stepId - 步骤 ID
   * @param {'up'|'down'} direction - 移动方向
   */
  moveStep(stepId, direction) {
    const idx = this.#state.steps.findIndex(s => s.id === stepId);
    if (idx === -1) return;
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === this.#state.steps.length - 1) return;

    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    const temp = this.#state.steps[idx];
    this.#state.steps[idx] = this.#state.steps[targetIdx];
    this.#state.steps[targetIdx] = temp;

    this.updateStepOrders();
    this.emit('steps-changed', this.#state.steps);
  }

  /**
   * 根据 steps 数组索引同步 step.order
   */
  updateStepOrders() {
    this.#state.steps.forEach((step, index) => {
      step.order = index + 1;
    });
  }

  /**
   * 更新步骤中下拉选择器的值
   * @param {string} selectId - 选择器 ID
   * @param {string} value - 新值
   * @param {string} stepId - 步骤 ID
   * @param {number} [index] - 多元素索引
   */
  updateStepSelect(selectId, value, stepId, index) {
    const step = this.#state.steps.find(s => s.id === stepId);
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
      const app = this.#getApp();
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
      const app = this.#getApp();
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

    // 级联更新：页面变更时清空元素和操作
    if (selectId.startsWith('tc-page-select')) {
      config.elementId = '';
      config.elementName = null;
      config.locator = null;
      config.locatorValue = null;
      config.operation = 'click';
      config.operationValue = {};
      const app = this.#getApp();
      if (app) {
        const page = app.pages?.find(p => p.id === value);
        config.pageName = page?.name || '';
      }
    }

    // 元素变更时更新 locator
    if (selectId.startsWith('tc-element-select')) {
      const app = this.#getApp();
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
  }

  /**
   * 更改步骤类型
   * @param {string} stepId - 步骤 ID
   * @param {string} type - 新类型
   */
  changeStepType(stepId, type) {
    const step = this.#state.steps.find(s => s.id === stepId);
    if (!step) return;

    step.type = type;
    // 重置类型特定配置
    step.config = { type };
    this.emit('steps-changed', this.#state.steps);
  }

  /**
   * 更新步骤名称
   * @param {string} stepId - 步骤 ID
   * @param {string} name - 新名称
   */
  updateStepName(stepId, name) {
    const step = this.#state.steps.find(s => s.id === stepId);
    if (!step) return;

    step.name = name;
  }
}

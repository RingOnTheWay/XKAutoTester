import { controllerModelEventsMixin } from './mixins/controllerModelEventsMixin.js';
import { controllerDomBindingMixin } from './mixins/controllerDomBindingMixin.js';
import { controllerTestPlansMixin } from './mixins/controllerTestPlansMixin.js';
import { controllerScheduledPlansMixin } from './mixins/controllerScheduledPlansMixin.js';
import { controllerDevicePortMixin } from './mixins/controllerDevicePortMixin.js';

/**
 * TestExecutionController - 测试执行 Tab 控制器
 * 绑定 Model 事件到 View 渲染，绑定 DOM 事件到 Model 方法
 */
export class TestExecutionController {
  #model;
  #view;
  #cleanups = [];

  constructor(model, view) {
    this.#model = model;
    this.#view = view;
  }

  // ─── 生命周期 ────────────────────────────────────────────

  async init() {
    this.bindModelEvents();
    this.bindUserActions();
    this.bindIpcEvents();
    await this.#model.load();
    // 显示测试计划和定时计划区域（HTML 中默认 hidden）
    this.#view.showTestPlanSection();
    this.#view.showScheduledPlanSection();
    // 设置初始视图状态
    this.#view.updateRunButtonState(false, false);
    this.#view.updatePlanButtons(false, false);
    this.#view.updateScheduledPlanButtons(false);
    this.#view.updateViewReportButton(false);
  }

  destroy() {
    this.#cleanups.forEach(fn => fn());
    this.#cleanups = [];
    this.#model.destroy();
  }

  // ─── Tab 生命周期 ──────────────────────────────────────────

  onTabActivated() {
    // 刷新数据
    this.#model.loadTestPlans();
    this.#model.loadScheduledPlans();
  }

  onTabDeactivated() {
    // 无特殊处理
  }

  // ─── Mixin 访问器（暴露私有字段给 mixin 方法） ────────────

  get model() { return this.#model; }
  get view() { return this.#view; }
  get cleanups() { return this.#cleanups; }
}

Object.assign(
  TestExecutionController.prototype,
  controllerModelEventsMixin,
  controllerDomBindingMixin,
  controllerTestPlansMixin,
  controllerScheduledPlansMixin,
  controllerDevicePortMixin,
);

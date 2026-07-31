import { controllerModelEventsMixin } from './mixins/controllerModelEventsMixin.js';
import { controllerDomBindingMixin } from './mixins/controllerDomBindingMixin.js';
import { controllerHandlerMixin } from './mixins/controllerHandlerMixin.js';
import { controllerConfirmMixin } from './mixins/controllerConfirmMixin.js';
import { controllerOptionBindingMixin } from './mixins/controllerOptionBindingMixin.js';
import { controllerStepRenderMixin } from './mixins/controllerStepRenderMixin.js';

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

  // ─── Mixin 访问器（暴露私有字段给 mixin 方法） ────────────

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
}

Object.assign(
  TestCaseController.prototype,
  controllerModelEventsMixin,
  controllerDomBindingMixin,
  controllerHandlerMixin,
  controllerConfirmMixin,
  controllerOptionBindingMixin,
  controllerStepRenderMixin,
);

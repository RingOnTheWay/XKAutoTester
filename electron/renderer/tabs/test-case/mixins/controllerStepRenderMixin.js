// Step render mixin for TestCaseController
// Extracted from controller.js during refactor
// Provides: single step card cascade re-rendering + per-card event binding
// (rerenderStepCard, bindSingleStepCardEvents)

export const controllerStepRenderMixin = {
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
  },

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
  },
};

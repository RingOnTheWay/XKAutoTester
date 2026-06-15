import { Action } from '../../core/Action.js';

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
    this.#bindModelEvents();
    this.#bindUserActions();
    this.#bindIpcEvents();
    await this.#model.load();
    // 显示测试计划和定时计划区域（HTML 中默认 hidden）
    const testPlanSection = document.getElementById('test-plan-section');
    const scheduledPlanSection = document.getElementById('scheduled-plan-section');
    if (testPlanSection) testPlanSection.classList.remove('hidden');
    if (scheduledPlanSection) scheduledPlanSection.classList.remove('hidden');
    // 设置初始视图状态
    this.#view.updateRunButtonState(false, false);
    this.#view.updatePlanButtons(false, false);
    this.#view.updateScheduledPlanButtons(false);
  }

  destroy() {
    this.#cleanups.forEach(fn => fn());
    this.#cleanups = [];
    this.#model.destroy();
  }

  // ─── Model 事件 → View 渲染 ──────────────────────────────

  #bindModelEvents() {
    const model = this.#model;
    const view = this.#view;

    // 测试计划列表变更
    this.#onModel(model, 'testPlans-changed', (plans) => {
      view.renderTestPlans(plans, model.currentTestPlan?.id, (plan) => {
        // toggle: 再次点击已选中的计划则取消选中
        if (model.currentTestPlan?.id === plan.id) {
          model.deselectTestPlan();
        } else {
          model.selectTestPlan(plan);
        }
      });
    });

    // 当前测试计划变更
    this.#onModel(model, 'currentTestPlan-changed', (plan) => {
      view.selectTestPlanItem(plan?.id);
      // 选中测试计划时取消定时计划选中
      if (plan && model.currentScheduledPlan) {
        model.deselectScheduledPlan();
      }
      view.updatePlanButtons(!!plan, model.isRunning);
      view.updateRunButtonState(!!plan, model.isRunning);
    });

    // 定时计划列表变更
    this.#onModel(model, 'scheduledPlans-changed', (plans) => {
      view.renderScheduledPlansList(plans, model.currentScheduledPlan?.id, (plan) => {
        // toggle: 再次点击已选中的计划则取消选中
        if (model.currentScheduledPlan?.id === plan.id) {
          model.deselectScheduledPlan();
        } else {
          model.selectScheduledPlan(plan);
        }
      });
    });

    // 当前定时计划变更
    this.#onModel(model, 'currentScheduledPlan-changed', (plan) => {
      view.selectScheduledPlanItem(plan?.id);
      // 选中定时计划时取消测试计划选中
      if (plan && model.currentTestPlan) {
        model.deselectTestPlan();
      }
      view.updateScheduledPlanButtons(!!plan);
    });

    // 运行状态变更
    this.#onModel(model, 'isRunning-changed', (isRunning) => {
      view.updateUIForRunning(isRunning);
      view.updateRunButtonState(!!model.currentTestPlan, isRunning);
    });

    // 选中目录变更
    this.#onModel(model, 'selectedDirectory-changed', (path) => {
      const displayName = path ? path.split(/[\\/]/).pop() : '';
      view.updateSelectedDirectory(path, displayName);
    });

    // 选中测试文件变更（由测试类型更新处理）
    this.#onModel(model, 'selectedTestFiles-changed', () => {
      // 测试文件变更后重新加载标记
      model.loadPytestMarkers();
    });

    // 当前标记（测试类型）变更
    this.#onModel(model, 'currentMarkers-changed', (markers) => {
      view.displayTestTypes(markers, null, false, (selectedTypes) => {
        // 测试类型选择变更回调
        model.emit('test-types-selection-changed', selectedTypes);
      });
    });

    // 输出刷新（批量缓冲）
    this.#onModel(model, 'output-flushed', (bufferedItems) => {
      for (const item of bufferedItems) {
        view.appendOutputToDOM(item.text, item.isError);
      }
    });

    // 进度变更
    this.#onModel(model, 'progress-changed', ({ status, percentage }) => {
      view.updateProgress(status, percentage);
    });

    // 循环进度变更
    this.#onModel(model, 'loop-progress-changed', ({ current, total }) => {
      view.updateLoopProgress(current, total);
    });

    // 测试运行完成
    this.#onModel(model, 'test-run-complete', () => {
      view.updateRunButtonState(!!model.currentTestPlan, false);
      view.updatePlanButtons(!!model.currentTestPlan, false);
    });

    // 通用错误
    this.#onModel(model, 'error', (err) => {
      const msg = typeof err === 'string' ? err : (err?.error?.message || err?.message || err?.source || String(err));
      view.showError(msg);
    });

    // 编辑测试计划弹窗
    this.#onModel(model, 'show-edit-plan-modal', (plan) => {
      view.openPlanModal();
      view.preselectModalItems(plan);
    });

    // 编辑定时计划弹窗
    this.#onModel(model, 'show-edit-scheduled-plan-modal', (plan) => {
      view.openScheduledPlanModal();
      // 填充定时计划表单数据
      const nameInput = document.getElementById('scheduled-plan-name-input');
      const timeInput = document.getElementById('scheduled-plan-time-input');
      if (nameInput) nameInput.value = plan.name || '';
      if (timeInput) timeInput.value = plan.scheduledTime || '';
      // 渲染测试计划列表并预选
      const plans = model.testPlans;
      view.renderScheduledPlanTestPlansList(plans, plan.testPlanIds || [], () => {});
    });

    // 定时计划弹窗的测试计划列表
    this.#onModel(model, 'test-plans-for-scheduled-modal', (plans) => {
      view.renderScheduledPlanTestPlansList(plans, [], () => {});
    });
  }

  // ─── DOM 事件绑定 ──────────────────────────────────────────

  #bindUserActions() {
    // ── 目录选择 ─────────────────────────────────────────────
    this.#addAction('#select-directory-btn', () => this.handleSelectDirectory());

    // ── 测试执行控制 ─────────────────────────────────────────
    this.#addAction('#run-tests-btn', () => this.handleRunTests());
    this.#addAction('#stop-tests-btn', () => this.handleStopTests());
    this.#addAction('#view-report-btn', () => this.handleViewReport());
    this.#addAction('#clear-output-btn', () => this.#model.clearOutput());
    this.#addAction('#open-xkat-folder-btn', () => this.handleOpenXkatFolder());

    // ── 测试计划 CRUD ────────────────────────────────────────
    this.#addAction('#new-plan-btn', () => this.handleShowNewPlanModal());
    this.#addAction('#edit-plan-btn', () => this.handleEditTestPlan());
    this.#addAction('#delete-plan-btn', () => this.handleDeleteTestPlan());
    this.#addAction('#modal-close-btn', () => this.#view.closePlanModal());
    this.#addAction('#modal-cancel-btn', () => this.#view.closePlanModal());
    this.#addAction('#update-plan-btn', () => this.handleUpdateTestPlan());

    // 测试计划表单提交
    const testPlanForm = document.getElementById('test-plan-form');
    if (testPlanForm) {
      const submitHandler = (e) => {
        e.preventDefault();
        this.handleSaveTestPlan();
      };
      testPlanForm.addEventListener('submit', submitHandler);
      this.#cleanups.push(() => testPlanForm.removeEventListener('submit', submitHandler));
    }

    // ── 定时计划 CRUD ────────────────────────────────────────
    this.#addAction('#new-scheduled-plan-btn', () => this.handleShowNewScheduledPlanModal());
    this.#addAction('#edit-scheduled-plan-btn', () => this.handleEditScheduledPlan());
    this.#addAction('#delete-scheduled-plan-btn', () => this.handleDeleteScheduledPlan());
    this.#addAction('#scheduled-plan-modal-close-btn', () => this.#view.closeScheduledPlanModal());
    this.#addAction('#scheduled-plan-cancel-btn', () => this.#view.closeScheduledPlanModal());
    this.#addAction('#update-scheduled-plan-btn', () => this.handleUpdateScheduledPlan());

    // 定时计划表单提交
    const scheduledPlanForm = document.getElementById('scheduled-plan-form');
    if (scheduledPlanForm) {
      const submitHandler = (e) => {
        e.preventDefault();
        this.handleSaveScheduledPlan();
      };
      scheduledPlanForm.addEventListener('submit', submitHandler);
      this.#cleanups.push(() => scheduledPlanForm.removeEventListener('submit', submitHandler));
    }

    // ── 报告弹窗 ─────────────────────────────────────────────
    this.#addAction('#report-modal-close-btn', () => this.#view.closeReportModal());
  }

  // ─── IPC 事件绑定 ──────────────────────────────────────────

  #bindIpcEvents() {
    // 测试输出
    if (window.electronAPI?.onTestOutput) {
      const unsub = window.electronAPI.onTestOutput((data) => {
        this.#model.appendOutput(data);
      });
      if (typeof unsub === 'function') this.#cleanups.push(unsub);
    }

    // 测试错误输出
    if (window.electronAPI?.onTestError) {
      const unsub = window.electronAPI.onTestError((data) => {
        this.#model.appendError(data);
      });
      if (typeof unsub === 'function') this.#cleanups.push(unsub);
    }

    // 定时计划触发执行
    if (window.electronAPI?.onScheduledTestStart) {
      const unsub = window.electronAPI.onScheduledTestStart((data) => {
        this.#model.handleScheduledTestStart(data);
      });
      if (typeof unsub === 'function') this.#cleanups.push(unsub);
    }

    // 定时计划过期
    if (window.electronAPI?.onScheduledPlanExpired) {
      const unsub = window.electronAPI.onScheduledPlanExpired((data) => {
        this.#model.handleScheduledPlanExpired(data);
      });
      if (typeof unsub === 'function') this.#cleanups.push(unsub);
    }
  }

  // ─── Handler 方法 ──────────────────────────────────────────

  handleSelectDirectory() {
    this.#model.selectDirectory();
  }

  handleRunTests() {
    this.#model.runTests();
  }

  handleStopTests() {
    this.#model.stopTests();
  }

  handleViewReport() {
    this.#model.viewReport(this.#model.currentTestPlan);
  }

  async handleOpenXkatFolder() {
    try {
      const dataPath = await window.electronAPI?.getDataPath?.();
      if (dataPath) {
        window.electronAPI?.openExternal?.(`file:///${dataPath.replace(/\\/g, '/')}`);
      }
    } catch (error) {
      console.error('[TestExecution] 打开日志目录失败:', error);
    }
  }

  async handleShowNewPlanModal() {
    this.#view.openPlanModal();
    const files = await this.#model.scanTestFiles();
    const markers = await this.#model.loadPytestMarkers();
    this.#view.renderModalTestFiles(files || [], [], (file, checked) => {
      // 文件选择变更回调
    });
    this.#view.renderModalTestTypes(markers || [], [], (type, checked) => {
      // 类型选择变更回调
    });
  }

  handleEditTestPlan() {
    if (!this.#model.currentTestPlan) return;
    this.#model.showEditPlanModal(this.#model.currentTestPlan);
  }

  async handleSaveTestPlan() {
    const planData = this.#view.collectPlanFormData();
    await this.#model.saveTestPlan(planData);
    this.#view.closePlanModal();
    await this.#model.loadTestPlans();
  }

  async handleUpdateTestPlan() {
    if (!this.#model.currentTestPlan) return;
    const planData = this.#view.collectPlanFormData();
    await this.#model.updateTestPlan(this.#model.currentTestPlan.id, planData);
    this.#view.closePlanModal();
    await this.#model.loadTestPlans();
  }

  async handleDeleteTestPlan() {
    if (!this.#model.currentTestPlan) return;
    const confirmed = await this.#showConfirmDialog(
      window.i18n?.t('testExecution.deletePlan') || '删除测试计划',
      window.i18n?.t('testExecution.deletePlanConfirm') || '确定要删除该测试计划吗？',
    );
    if (!confirmed) return;
    await this.#model.deleteTestPlan(this.#model.currentTestPlan.id);
    await this.#model.loadTestPlans();
  }

  async handleShowNewScheduledPlanModal() {
    this.#view.openScheduledPlanModal();
    await this.#model.loadTestPlansForScheduledModal();
  }

  handleEditScheduledPlan() {
    if (!this.#model.currentScheduledPlan) return;
    this.#model.showEditScheduledPlanModal(this.#model.currentScheduledPlan);
  }

  async handleSaveScheduledPlan() {
    const planData = this.#view.collectScheduledPlanFormData();
    // 检查时间冲突
    const conflictResult = await this.#model.checkTimeConflict(
      planData.scheduledTime,
      planData.excludeId || null
    );
    if (conflictResult?.hasConflict) {
      const override = await this.#showConfirmDialog(
        window.i18n?.t('scheduledPlan.timeConflict') || '时间冲突',
        window.i18n?.t('scheduledPlan.timeConflictMessage') || '该时间段已有定时计划，是否继续？',
      );
      if (!override) return;
    }
    await this.#model.saveScheduledPlan(planData);
    this.#view.closeScheduledPlanModal();
    await this.#model.loadScheduledPlans();
  }

  async handleUpdateScheduledPlan() {
    if (!this.#model.currentScheduledPlan) return;
    const planData = this.#view.collectScheduledPlanFormData();
    await this.#model.updateScheduledPlan(this.#model.currentScheduledPlan.id, planData);
    this.#view.closeScheduledPlanModal();
    await this.#model.loadScheduledPlans();
  }

  async handleDeleteScheduledPlan() {
    if (!this.#model.currentScheduledPlan) return;
    const confirmed = await this.#showConfirmDialog(
      window.i18n?.t('testExecution.deleteScheduledPlan') || '删除定时计划',
      window.i18n?.t('testExecution.deleteScheduledPlanConfirm') || '确定要删除该定时计划吗？',
    );
    if (!confirmed) return;
    await this.#model.deleteScheduledPlan(this.#model.currentScheduledPlan.id);
    await this.#model.loadScheduledPlans();
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

  // ─── 辅助方法 ──────────────────────────────────────────────

  #onModel(emitter, event, handler) {
    const unsub = emitter.on(event, handler);
    this.#cleanups.push(unsub);
  }

  #addAction(selector, handler) {
    const unbind = Action.bind(selector, 'click', handler);
    this.#cleanups.push(unbind);
  }

  async #showConfirmDialog(title, message) {
    const result = await window.electronAPI?.showDialog?.({
      type: 'question',
      title,
      message,
      buttons: [window.i18n?.t('common.confirm') || '确认', window.i18n?.t('common.cancel') || '取消'],
      defaultId: 0,
      cancelId: 1,
    });
    return result?.response === 0;
  }
}

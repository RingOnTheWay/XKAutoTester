// DOM binding mixin for TestExecutionController
// Extracted from controller.js during refactor
// Provides: top-level DOM event wiring (bindUserActions) + IPC event wiring (bindIpcEvents)
//           + action bind helper (addAction)

import { Action } from '../../../core/Action.js';

export const controllerDomBindingMixin = {
  // ─── DOM 事件绑定 ──────────────────────────────────────────

  bindUserActions() {
    // ── 目录选择 ─────────────────────────────────────────────
    this.addAction('#select-directory-btn', () => this.handleSelectDirectory());

    // ── 测试执行控制 ─────────────────────────────────────────
    this.addAction('#run-tests-btn', () => this.handleRunTests());
    this.addAction('#stop-tests-btn', () => this.handleStopTests());
    this.addAction('#view-report-btn', () => this.handleViewReport());
    this.addAction('#clear-output-btn', () => this.model.clearOutput());
    this.addAction('#open-xkat-folder-btn', () => this.handleOpenXkatFolder());

    // ── 测试计划 CRUD ────────────────────────────────────────
    this.addAction('#new-plan-btn', () => this.handleShowNewPlanModal());
    this.addAction('#edit-plan-btn', () => this.handleEditTestPlan());
    this.addAction('#delete-plan-btn', () => this.handleDeleteTestPlan());
    this.addAction('#modal-close-btn', () => this.view.closePlanModal());
    this.addAction('#modal-cancel-btn', () => this.view.closePlanModal());
    this.addAction('#update-plan-btn', () => this.handleUpdateTestPlan());

    // 测试计划表单提交
    this.cleanups.push(
      this.view.bindTestPlanFormSubmit(() => this.handleSaveTestPlan())
    );

    // ── 定时计划 CRUD ────────────────────────────────────────
    this.addAction('#new-scheduled-plan-btn', () => this.handleShowNewScheduledPlanModal());
    this.addAction('#edit-scheduled-plan-btn', () => this.handleEditScheduledPlan());
    this.addAction('#delete-scheduled-plan-btn', () => this.handleDeleteScheduledPlan());
    this.addAction('#scheduled-plan-modal-close-btn', () => this.view.closeScheduledPlanModal());
    this.addAction('#scheduled-plan-cancel-btn', () => this.view.closeScheduledPlanModal());
    this.addAction('#update-scheduled-plan-btn', () => this.handleUpdateScheduledPlan());

    // 定时计划表单提交
    this.cleanups.push(
      this.view.bindScheduledPlanFormSubmit(() => this.handleSaveScheduledPlan())
    );

    // ── 报告弹窗 ─────────────────────────────────────────────
    this.addAction('#report-modal-close-btn', () => this.view.closeReportModal());
    this.addAction('#report-modal-cancel-btn', () => this.view.closeReportModal());
    this.addAction('#report-modal-open-btn', () => this.model.openSelectedReport(this.model.currentTestPlan));

    // 全局确认弹窗按钮由 settings tab 绑定 (document 级事件委托, 所有 tab 共享)
    // test-execution 不重复绑定, 避免 callback 执行两次导致 toast 重复

    // ── 编辑设备连接标识弹窗 ─────────────────────────────────
    // 使用 addEventListener 直接绑定（避免和 android-connection controller 的 Action.bind 冲突）
    this.cleanups.push(
      this.view.bindEditDeviceModalButtons({
        onClose: () => this.view.closeEditDeviceIdModal(),
        onCancel: () => this.view.closeEditDeviceIdModal(),
        onConfirm: () => this.handleConfirmEditDeviceId(),
        onManageDevice: async () => {
          // 保存当前弹窗中的蓝牙端口数据
          const currentData = this.view.getEditDeviceIdFormData();
          this._editDeviceBlePortBackup = currentData.blePort;
          this._editDeviceHasBleBackup = this.view.isBleMockPortGroupVisible();

          // 先关闭编辑设备弹窗（解决z-index问题）
          this.view.closeEditDeviceIdModal();

          const result = await this.model.selectDeviceForEdit();
          // 重新打开编辑弹窗
          this.view.openEditDeviceIdModal({
            blePort: this._editDeviceBlePortBackup || '',
            hasBleSteps: this._editDeviceHasBleBackup,
          });
          if (result) {
            this.view.fillEditDeviceIdFields(result);
          }
        },
        onManagePort: async () => {
          // 打开端口管理弹窗 + 扫描端口（不依赖 android-connection controller）
          await this.handleShowPortModal();
        },
      })
    );

    // ── 端口管理弹窗按钮（android-connection 可能延迟初始化，需独立绑定） ──
    this.cleanups.push(
      this.view.bindPortModalButtons({
        onClose: () => window.__XKAT_MODALS__?.port?.close(),
        onCancel: () => window.__XKAT_MODALS__?.port?.close(),
        onConfirm: () => this.handleConfirmPortSelection(),
      })
    );
  },

  // ─── IPC 事件绑定 ──────────────────────────────────────────

  bindIpcEvents() {
    // 测试输出
    if (window.electronAPI?.onTestOutput) {
      const unsub = window.electronAPI.onTestOutput((data) => {
        // 清理 ANSI 转义码和 \r 字符
        const cleaned = typeof data === 'string' ? data.replace(/\x1b\[[0-9;]*m/g, '').replace(/\r/g, '') : data;
        this.model.appendOutput(cleaned);
      });
      if (typeof unsub === 'function') this.cleanups.push(unsub);
    }

    // 测试错误输出
    if (window.electronAPI?.onTestError) {
      const unsub = window.electronAPI.onTestError((data) => {
        // 清理 ANSI 转义码和 \r 字符
        const cleaned = typeof data === 'string' ? data.replace(/\x1b\[[0-9;]*m/g, '').replace(/\r/g, '') : data;
        this.model.appendError(cleaned);
      });
      if (typeof unsub === 'function') this.cleanups.push(unsub);
    }

    // 定时计划触发执行
    if (window.electronAPI?.onScheduledTestStart) {
      const unsub = window.electronAPI.onScheduledTestStart((data) => {
        this.model.handleScheduledTestStart(data);
      });
      if (typeof unsub === 'function') this.cleanups.push(unsub);
    }

    // 定时计划过期
    if (window.electronAPI?.onScheduledPlanExpired) {
      const unsub = window.electronAPI.onScheduledPlanExpired((data) => {
        this.model.handleScheduledPlanExpired(data);
      });
      if (typeof unsub === 'function') this.cleanups.push(unsub);
    }
  },

  // ─── 辅助方法（DOM 绑定） ──────────────────────────────────

  addAction(selector, handler) {
    const unbind = Action.bind(selector, 'click', handler);
    this.cleanups.push(unbind);
  },
};

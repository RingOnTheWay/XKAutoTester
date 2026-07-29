// Test plans mixin for TestExecutionController
// Extracted from controller.js during refactor
// Provides: test execution control handlers + test plan CRUD handlers
//   (handleSelectDirectory, handleRunTests, handleStopTests, handleViewReport,
//    handleOpenXkatFolder, handleShowNewPlanModal, refreshModalTestTypes,
//    handleEditTestPlan, handleSaveTestPlan, handleUpdateTestPlan, handleDeleteTestPlan)

import { Toast } from '../../../components/toast.js';

export const controllerTestPlansMixin = {
  // ─── Handler 方法（测试计划） ─────────────────────────────

  handleSelectDirectory() {
    this.model.selectDirectory();
  },

  handleRunTests() {
    this.model.runTests();
  },

  handleStopTests() {
    this.model.stopTests();
  },

  handleViewReport() {
    this.model.showReportModal(this.model.currentTestPlan);
  },

  async handleOpenXkatFolder() {
    try {
      const result = await window.electronAPI?.getDataPath?.();
      const dataPath = result?.currentPath || (typeof result === 'string' ? result : '');
      if (dataPath) {
        window.electronAPI?.openExternal?.(`file:///${dataPath.replace(/\\/g, '/')}`);
        Toast.success(window.i18n.t('testExecution.openFolderSuccess'));
      } else {
        Toast.error(window.i18n.t('testExecution.openFolderFailed'));
      }
    } catch (error) {
      console.error('[TestExecution] 打开日志目录失败:', error);
      Toast.error(window.i18n.t('testExecution.openFolderFailed'));
    }
  },

  async handleShowNewPlanModal() {
    this.view.openPlanModal();
    // 重置弹窗为"新建"模式：标题 + 清空表单 + 显示保存按钮、隐藏更新按钮
    this.view.setPlanModalTitle(window.i18n.t('testExecution.newTestPlan'));
    this.view.resetPlanModalForNew();
    const files = await this.model.scanTestFiles();
    // 初始渲染文件列表（无选中）和测试类型占位符（未选文件时提示）
    await this.view.renderModalTestFiles(files || [], [], (file, checked) => {
      // 文件选择变更时重新提取测试类型
      this.refreshModalTestTypes();
    }, (fileName, filePath) => {
      // 编辑设备按钮回调
      this.model.showEditDeviceIdModal(fileName, filePath);
    }, (fileName) => this.model.getTestCase(fileName));
    this.view.renderModalTestTypesPlaceholder();
  },

  /**
   * 根据弹窗内当前选中的测试文件重新提取并渲染测试类型
   */
  async refreshModalTestTypes() {
    const selectedFiles = this.view.getModalSelectedTestFiles();
    if (selectedFiles.length === 0) {
      this.view.renderModalTestTypesPlaceholder();
      return;
    }
    const markers = await this.model.extractMarkersFromFiles(selectedFiles);
    // 保留当前已选中的测试类型
    const previouslySelected = this.view.getModalSelectedTestTypes();
    this.view.renderModalTestTypes(markers, previouslySelected, (type, checked) => {
      // 类型选择变更回调（无需重新提取）
    });
  },

  handleEditTestPlan() {
    if (!this.model.currentTestPlan) return;
    this.model.showEditPlanModal(this.model.currentTestPlan);
  },

  async handleSaveTestPlan() {
    const planData = this.view.collectPlanFormData();
    await this.model.saveTestPlan(planData);
    this.view.closePlanModal();
    await this.model.loadTestPlans();
  },

  async handleUpdateTestPlan() {
    if (!this.model.currentTestPlan) return;
    const planData = this.view.collectPlanFormData();
    await this.model.updateTestPlan(this.model.currentTestPlan.id, planData);
    this.view.closePlanModal();
    await this.model.loadTestPlans();
  },

  async handleDeleteTestPlan() {
    if (!this.model.currentTestPlan) return;
    this.view.showConfirmModal(
      window.i18n.t('testExecution.deletePlan'),
      window.i18n.t('testExecution.deletePlanConfirm'),
      async () => {
        await this.model.deleteTestPlan(this.model.currentTestPlan.id);
        await this.model.loadTestPlans();
      },
    );
  },
};

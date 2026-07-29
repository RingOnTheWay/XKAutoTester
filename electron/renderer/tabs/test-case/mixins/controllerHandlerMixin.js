// Handler mixin for TestCaseController
// Extracted from controller.js during refactor
// Provides: user action handlers (directory/search/file/cancel/save/delete/step/app/platform/marker)
// (handleSelectDirectory, handleSearchInput, handleSearchClear, handleAddNew, handleFileSelect,
//  handleCancel, handleSave, handleDelete, handleAddStep, handleSelectChange, handleStepTypeChange,
//  handleStepNameChange, handleStepCopy, handleStepDelete, handleMultiSelectToggle,
//  handleAddMultiElement, handleRemoveMultiElement, handleStepMove, handleAppSelect,
//  handlePlatformSelect, handleMarkerToggle, handleMarkDirty)

import { Toast } from '../../../components/toast.js';

export const controllerHandlerMixin = {
  // ─── Handler 方法 ────────────────────────────────────────

  async handleSelectDirectory() {
    await this.model.selectDirectory();
  },

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
  },

  handleSearchClear() {
    this.view.clearSearchInput();
    clearTimeout(this.searchDebounceTimer);
    clearTimeout(this.searchLoadingTimer);
    this.isSearchLoading = false;
    this.model.setSearchQuery('');
  },

  handleAddNew() {
    if (!this.model.get('selectedDirectory')) return;
    this.model.showEditor(null);
  },

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
  },

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
  },

  async handleSave() {
    const caseData = this.model.collectFormData({
      inputs: this.view.collectFormInputs(),
      steps: this.view.collectStepCardsData(this.model.get('steps')),
    });
    await this.model.saveCase(caseData);
  },

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
  },

  handleAddStep() {
    this.model.addStep();
  },

  handleSelectChange(selectId, value, stepId, index) {
    this.model.updateStepSelect(selectId, value, stepId, index);
  },

  handleStepTypeChange(stepId, type) {
    this.model.changeStepType(stepId, type);
  },

  handleStepNameChange(stepId, name) {
    this.model.updateStepName(stepId, name);
  },

  handleStepCopy(stepId) {
    this.model.copyStep(stepId);
  },

  handleStepDelete(stepId) {
    this.model.deleteStep(stepId);
  },

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
  },

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
  },

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
  },

  handleStepMove(stepId, direction) {
    this.model.moveStep(stepId, direction);
  },

  handleAppSelect(appId) {
    const apps = this.model.get('apps');
    const app = apps?.find(a => a.id === appId);
    if (app) this.model.selectApp(app);
  },

  handlePlatformSelect(platform) {
    this.model.selectPlatform(platform);
  },

  handleMarkerToggle(marker) {
    this.model.toggleMarker(marker);
  },

  handleMarkDirty() {
    this.model.markDirty();
  },
};

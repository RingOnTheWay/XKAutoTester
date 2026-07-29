// Unsaved changes confirmation mixin for TestCaseController
// Extracted from controller.js during refactor
// Provides: unsaved-changes confirm dialog helpers (confirmUnsavedChanges, confirmUnsavedChangesWithCallbacks)

export const controllerConfirmMixin = {
  // ─── 未保存更改确认 ──────────────────────────────────────

  confirmUnsavedChanges() {
    const message = window.i18n.t('testCase.unsavedChangesMessage');
    return window.confirm(message);
  },

  confirmUnsavedChangesWithCallbacks(onSave, onDiscard) {
    const title = window.i18n.t('testCase.unsavedChangesTitle');
    const message = window.i18n.t('testCase.unsavedChangesMessage');

    this.view.showSaveConfirmModal({
      title,
      message,
      onSave,
      onDiscard,
    });
  },
};

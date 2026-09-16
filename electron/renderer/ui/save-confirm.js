/**
 * SaveConfirmController - 保存确认弹窗状态机 (R26 候选③, 自 app.js 拆出)
 *
 * 职责: show/hide/execute 保存确认弹窗, 持有 onSave/onDiscard 回调。
 * 拆分动机: 三按钮 + 双回调的状态机可独立单测 (原活在世界面最大的 App 类里)。
 */
export class SaveConfirmController {
  #modal;
  #onSave = null;
  #onDiscard = null;

  /**
   * @param {import('../components/modal.js').Modal} modal - save-confirm 弹窗实例
   */
  constructor(modal) {
    this.#modal = modal;
  }

  show(title, message, onSave, onDiscard) {
    const titleElement = document.getElementById('save-confirm-modal-title');
    const messageElement = document.getElementById('save-confirm-modal-message');

    if (titleElement) titleElement.textContent = title;
    if (messageElement) messageElement.textContent = message;

    this.#onSave = onSave;
    this.#onDiscard = onDiscard;
    this.#modal.open();
  }

  hide() {
    this.#modal.close();
    this.#onSave = null;
    this.#onDiscard = null;
  }

  executeSave() {
    if (this.#onSave) {
      this.#onSave();
    }
    this.hide();
  }

  executeDiscard() {
    if (this.#onDiscard) {
      this.#onDiscard();
    }
    this.hide();
  }
}

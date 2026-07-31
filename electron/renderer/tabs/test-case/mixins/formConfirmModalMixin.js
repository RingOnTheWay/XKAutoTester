// Confirm Modal mixin for TestCaseView
// Extracted from formMixin.js during sub-refactor
// Provides: showConfirmModal (reuse global confirm modal) + showSaveConfirmModal (3-button unsaved changes)

export const formConfirmModalMixin = {
    // ─── Confirm Modal (复用全局 confirm-modal) ───────────────────

    /**
     * 显示自定义确认弹窗（复用全局 confirm modal，回调存全局）
     * @param {string} title - 标题
     * @param {string} message - 提示消息
     * @param {Function} onConfirm - 确认回调
     */
    showConfirmModal(title, message, onConfirm) {
        const titleElement = document.getElementById('confirm-modal-title');
        const messageElement = document.getElementById('confirm-modal-message');

        if (titleElement) titleElement.textContent = title;
        if (messageElement) messageElement.textContent = message;

        // 保存回调到全局，供 settings controller 的事件委托读取
        window.__XKAT_CONFIRM_CALLBACK__ = onConfirm;

        // 重置确认按钮状态
        const confirmBtn = document.getElementById('confirm-modal-confirm-btn');
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.classList.remove('loading');
            // 清除旧的 originalText，使用当前语言重新翻译
            delete confirmBtn.dataset.originalText;
            const i18nKey = confirmBtn.getAttribute('data-i18n');
            confirmBtn.innerHTML = i18nKey ? window.i18n.t(i18nKey) || confirmBtn.textContent : confirmBtn.textContent;
        }

        const confirmModal = window.__XKAT_MODALS__?.confirm;
        if (confirmModal) {
            confirmModal.open();
        } else {
            // fallback 到原生确认框
            if (window.confirm(message)) {
                onConfirm();
            }
        }
    },

    /**
     * 显示「未保存更改」确认弹窗（3 按钮：取消 / 放弃 / 保存）
     * @param {Object} params - { title, message, onSave, onDiscard, onCancel }
     */
    showSaveConfirmModal({ title, message, onSave, onDiscard, onCancel } = {}) {
        const overlay = document.getElementById('save-confirm-modal-overlay');
        const titleEl = document.getElementById('save-confirm-modal-title');
        const messageEl = document.getElementById('save-confirm-modal-message');
        const cancelBtn = document.getElementById('save-confirm-cancel-btn');
        const discardBtn = document.getElementById('save-confirm-discard-btn');
        const saveBtn = document.getElementById('save-confirm-save-btn');

        if (!overlay || !cancelBtn || !discardBtn || !saveBtn) {
            // 降级为原生 confirm：onSave 走"是"，否则 onDiscard
            if (window.confirm(message)) {
                onSave?.();
            } else if (onDiscard) {
                onDiscard();
            } else {
                onCancel?.();
            }
            return;
        }

        if (titleEl) titleEl.textContent = title || '';
        if (messageEl) messageEl.textContent = message || '';

        // 清理旧的事件监听器（克隆节点方式）
        const newCancelBtn = cancelBtn.cloneNode(true);
        const newDiscardBtn = discardBtn.cloneNode(true);
        const newSaveBtn = saveBtn.cloneNode(true);
        cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
        discardBtn.parentNode.replaceChild(newDiscardBtn, discardBtn);
        saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);

        const hide = () => overlay.classList.add('hidden');

        newCancelBtn.addEventListener('click', () => {
            hide();
            onCancel?.();
        });
        newDiscardBtn.addEventListener('click', () => {
            hide();
            onDiscard?.();
        });
        newSaveBtn.addEventListener('click', () => {
            hide();
            onSave?.();
        });

        overlay.classList.remove('hidden');
    },
};

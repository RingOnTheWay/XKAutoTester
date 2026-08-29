// 通用确认弹窗工具 (P2-3 收敛)
// 统一三套实现: window.confirm (test-case) / Electron showDialog (test-execution) /
// cloneNode 重建 (test-case save-confirm) → 全局 confirm-modal + 回调通道。
// 语义: 确认 → true; 取消 / Esc / 遮罩 → false。

/**
 * 打开通用确认弹窗, 返回 Promise<boolean>
 * @param {string} title
 * @param {string} message
 * @returns {Promise<boolean>}
 */
export function showConfirmModal(title, message) {
  return new Promise((resolve) => {
    const titleEl = document.getElementById('confirm-modal-title');
    const messageEl = document.getElementById('confirm-modal-message');
    if (titleEl) titleEl.textContent = title || '';
    if (messageEl) messageEl.textContent = message || '';

    const overlay = document.getElementById('confirm-modal-overlay');
    const confirmBtn = document.getElementById('confirm-modal-confirm-btn');
    const cancelBtn = document.getElementById('confirm-modal-cancel-btn');

    let resolved = false;
    const resolveOnce = (value) => {
      if (!resolved) {
        resolved = true;
        resolve(value);
      }
    };

    // P1-8 模式: 直接绑按钮 + 全局回调通道防 app.js 抢先 close
    const cbRef = () => {
      cleanup();
      window.__XKAT_MODALS__?.confirm?.close();
      resolveOnce(true);
    };
    const cancelRef = () => {
      cleanup();
      window.__XKAT_MODALS__?.confirm?.close();
      resolveOnce(false);
    };
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        cleanup();
        resolveOnce(false);
      }
    };
    const overlayClickHandler = (e) => {
      if (e.target === overlay) {
        cleanup();
        window.__XKAT_MODALS__?.confirm?.close();
        resolveOnce(false);
      }
    };
    const confirmClickHandler = () => cbRef();
    const cancelClickHandler = () => cancelRef();

    // P2-2: cleanup 统一移除监听, 防累积泄漏
    const cleanup = () => {
      document.removeEventListener('keydown', escHandler);
      if (overlay) overlay.removeEventListener('click', overlayClickHandler);
      if (confirmBtn) confirmBtn.removeEventListener('click', confirmClickHandler);
      if (cancelBtn) cancelBtn.removeEventListener('click', cancelClickHandler);
      if (window.__XKAT_CONFIRM_CALLBACK__ === cbRef) window.__XKAT_CONFIRM_CALLBACK__ = null;
      if (window.__XKAT_CONFIRM_CANCEL_CALLBACK__ === cancelRef) window.__XKAT_CONFIRM_CANCEL_CALLBACK__ = null;
    };

    document.addEventListener('keydown', escHandler);
    if (overlay) overlay.addEventListener('click', overlayClickHandler);
    if (confirmBtn) confirmBtn.addEventListener('click', confirmClickHandler);
    if (cancelBtn) cancelBtn.addEventListener('click', cancelClickHandler);

    window.__XKAT_CONFIRM_CALLBACK__ = cbRef;
    window.__XKAT_CONFIRM_CANCEL_CALLBACK__ = cancelRef;

    window.__XKAT_MODALS__?.confirm?.open();
  });
}

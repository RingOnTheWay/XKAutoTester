// 通用确认弹窗工具 (P2-3 收敛)
// 统一三套实现: window.confirm (test-case) / Electron showDialog (test-execution) /
// cloneNode 重建 (test-case save-confirm) → 全局 confirm-modal + 回调通道。
// 语义: 确认 → true; 取消 / Esc / 遮罩 → false。

// R24 P1-6: 模块级未决 Promise — 单弹窗串行化。
// 前一次弹窗未关闭时再次调用 showConfirmModal, 先 resolve(false) 旧弹窗,
// 防止旧 keydown/click 监听器泄漏 + 旧 Promise 永久挂起
// (两版 API 并存期全局回调被覆盖导致前者永不 resolve 的同类问题)。
let _pendingResolve = null;

/**
 * 打开通用确认弹窗, 返回 Promise<boolean>
 * @param {string} title
 * @param {string} message
 * @returns {Promise<boolean>}
 */
export function showConfirmModal(title, message) {
  if (_pendingResolve) {
    _pendingResolve(false);
    _pendingResolve = null;
  }
  return new Promise((resolve) => {
    const titleEl = document.getElementById('confirm-modal-title');
    const messageEl = document.getElementById('confirm-modal-message');
    if (titleEl) titleEl.textContent = title || '';
    if (messageEl) messageEl.textContent = message || '';

    const overlay = document.getElementById('confirm-modal-overlay');
    const confirmBtn = document.getElementById('confirm-modal-confirm-btn');
    const cancelBtn = document.getElementById('confirm-modal-cancel-btn');

    // R26 P2-7: modal DOM 缺失 (页面未含 confirm-modal) → 立即 resolve(false):
    // 原实现 Promise 仅靠按钮/Esc 解析, DOM 缺失则永久挂起 + _pendingResolve 被占用,
    // 后续所有 confirm 立即返 false。缺失时不占 _pendingResolve。
    if (!overlay || !confirmBtn || !cancelBtn) {
      resolve(false);
      return;
    }
    _pendingResolve = resolve;

    let resolved = false;
    const resolveOnce = (value) => {
      if (!resolved) {
        resolved = true;
        _pendingResolve = null;
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
        // R24 P1-6: 补 close — 此前 Esc 只 resolve 不关弹窗, DOM 残留
        window.__XKAT_MODALS__?.confirm?.close();
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

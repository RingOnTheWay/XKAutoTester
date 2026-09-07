// 统一 HTML 转义工具 (P2-5)
// 原 7 处重复实现 (test-execution/test-case/android-connection/page-package view、
// device-cascade-select、TreeMixin、deviceModalRenderMixin), 且空值处理行为有差异。
// 统一为: null/undefined → ''；转义 & < > " ' 五个字符。

const HTML_ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * HTML 转义 (防 XSS)
 * @param {*} str
 * @returns {string}
 */
export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, (ch) => HTML_ESCAPE_MAP[ch]);
}

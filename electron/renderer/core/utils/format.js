/**
 * 格式化工具 - 显示层数值格式化
 *
 * R26 架构深化 (候选②④): 原挂在 SettingsModel 上的 formatDownloadSpeed
 * 迁至 core/utils —— 速度显示是 view 关注, 不经 model 转手。
 */

/**
 * 下载速度格式化: B/s / KB/s / MB/s。
 * 非正数返回空串 (下载完成或无数据时不显示)。
 * @param {number} bytesPerSecond
 * @returns {string}
 */
export function formatDownloadSpeed(bytesPerSecond) {
  if (!bytesPerSecond || bytesPerSecond <= 0) return '';
  if (bytesPerSecond < 1024) return `${bytesPerSecond.toFixed(0)} B/s`;
  if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSecond / (1024 * 1024)).toFixed(2)} MB/s`;
}

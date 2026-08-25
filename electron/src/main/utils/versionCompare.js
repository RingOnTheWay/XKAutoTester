/**
 * versionCompare - 语义化版本比较 (共享工具)
 *
 * 原 EnvironmentService / UpdateService 各有近似重复实现, 抽取为统一入口。
 * 仅比较数字段 (如 '3.12.4' / 'v2.0.0'), 可容忍但不兼容预发布/构建标识。
 */

/**
 * 比较语义化版本号
 * @param {string} a
 * @param {string} b
 * @returns {number} -1 (a<b) / 0 (a==b) / 1 (a>b)
 */
function compareVersions(a, b) {
  const pa = String(a).replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na < nb) return -1;
    if (na > nb) return 1;
  }
  return 0;
}

module.exports = { compareVersions };
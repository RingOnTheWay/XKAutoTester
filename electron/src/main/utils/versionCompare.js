/**
 * versionCompare - 语义化版本比较 (共享工具)
 *
 * 原 EnvironmentService / UpdateService 各有近似重复实现, 抽取为统一入口。
 * 仅比较数字段 (如 '3.12.4' / 'v2.0.0'), 可容忍但不兼容预发布/构建标识。
 * 也收敛版本 tag 归一化 (剥 v 前缀) — 单一权威, 消除 checkForUpdate 处
 * `/^v/` (大小写敏感) 与 compareVersions 处 `/^v/i` 的规则漂移。
 */

/**
 * 归一化版本 tag: 剥离大小写 v 前缀。
 * compareVersions 内部 + 业务 (checkForUpdate) 共用, 保证比较/展示口径一致。
 * @param {string} tag
 * @returns {string}
 */
function normalizeVersionTag(tag) {
  return String(tag).replace(/^v/i, '');
}

/**
 * 比较语义化版本号
 * R25 P2-1: 剥离预发布段后比较数字段; 数字段相等时按 semver 规则判权重
 * (无 prerelease > 有 prerelease, 即 0.1.6 > 0.1.6-dev.1)。
 * 修复前 '0.1.6-dev.1' 被 split('.') 解析成 [0,1,6,1] → 误判比 0.1.6 新,
 * 导致 dev 渠道用户永远检测不到同号正式 release (UpdateService.checkForUpdate)。
 * @param {string} a
 * @param {string} b
 * @returns {number} -1 (a<b) / 0 (a==b) / 1 (a>b)
 */
function compareVersions(a, b) {
  const norm = (v) =>
    normalizeVersionTag(v)
      .split('-')[0] // 剥离 prerelease 段 (dev/beta/rc)
      .split('.')
      .map((n) => parseInt(n, 10) || 0);
  const pa = norm(a);
  const pb = norm(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na < nb) return -1;
    if (na > nb) return 1;
  }
  // 数字段相等: semver 规则 release > prerelease (dev/beta/rc)
  const preA = normalizeVersionTag(a).split('-')[1] || '';
  const preB = normalizeVersionTag(b).split('-')[1] || '';
  if (preA === '' && preB === '') return 0;
  if (preA === '') return 1; // release > prerelease
  if (preB === '') return -1;
  if (preA === preB) return 0; // prerelease 段完全相同
  // 都带 prerelease: 按数字部分比较 (dev.2 > dev.1), 数字相同按字符串
  const numA = parseInt((preA.match(/\d+/) || ['0'])[0], 10);
  const numB = parseInt((preB.match(/\d+/) || ['0'])[0], 10);
  if (numA !== numB) return numA < numB ? -1 : 1;
  return preA < preB ? -1 : 1;
}

module.exports = { compareVersions, normalizeVersionTag };

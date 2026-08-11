// urlGuard — openExternal URL 安全校验。
//
// P1 修复: shell.openExternal 若被 XSS 注入危险协议 (javascript:/data:/file:) 或
// 任意 host, 可触发 RCE/本地文件读取。本模块强制 https: + 白名单 host。
//
// 用法:
//   const { isAllowedExternalUrl } = require('./utils/urlGuard');
//   if (!isAllowedExternalUrl(url)) return { success: false, error: '不允许的 URL' };
//   shell.openExternal(url);

/**
 * 允许的外部 URL 协议 (仅 https:)
 * http: 明文不安全, file:/javascript:/data:/vbscript: 等危险协议全部拒绝。
 */
const ALLOWED_PROTOCOLS = new Set(['https:']);

/**
 * 允许的外部 URL host 白名单。
 * 当前应用唯一合法外链场景: GitHub 仓库/Release/Issue (settings 页 "项目主页" 按钮)。
 * 新增 host 需在此处登记, 避免任意域外跳。
 */
const ALLOWED_HOSTS = new Set([
  'github.com',
  'www.github.com',
]);

/**
 * 校验 URL 是否允许 shell.openExternal 打开。
 * 规则: 协议必须 https: + host 必须在白名单。
 * @param {string} url - 待校验 URL
 * @returns {{ allowed: boolean, reason?: string }}
 */
function isAllowedExternalUrl(url) {
  if (typeof url !== 'string' || url.length === 0) {
    return { allowed: false, reason: 'URL 为空或非字符串' };
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { allowed: false, reason: 'URL 格式无效' };
  }
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    return { allowed: false, reason: `不允许的协议: ${parsed.protocol} (仅允许 https:)` };
  }
  const host = parsed.hostname.toLowerCase();
  if (!ALLOWED_HOSTS.has(host)) {
    return { allowed: false, reason: `不允许的 host: ${host} (未在白名单)` };
  }
  return { allowed: true };
}

module.exports = { isAllowedExternalUrl, ALLOWED_PROTOCOLS, ALLOWED_HOSTS };

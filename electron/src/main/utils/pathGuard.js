//
// pathGuard — 统一路径安全守卫 (ADR-0010)。
// 单一严格语义: 双端 path.resolve 规范化 → 拒相等 / 拒 `..` 段 / 拒绝对 / 拒字面 `..foo` /
// 非字符串或空 → false。防目录穿越 (directory traversal)。
//
// 取代原 TestPlanService / TestCaseService / UpdateService 3 处各自实现的 isPathInside。
// 调用方约束: baseDir / targetPath 建议传绝对路径, 守卫内部已 resolve, 非规范输入同样被归一化处理。
// 另收口"系统关键目录"保护 (原 fileHandlers sysRootRe + TestCaseCodeGenerator SYSTEM_PROTECTED_DIRS),
// 使所有路径安全谓词集中于此。

const path = require('path');

/**
 * 校验 targetPath 是否严格位于 baseDir 内部 (防目录穿越)。
 * @param {string} baseDir - 限定根目录
 * @param {string} targetPath - 待校验路径
 * @returns {boolean}
 */
function isPathInside(baseDir, targetPath) {
  if (typeof baseDir !== 'string' || !baseDir) return false;
  if (typeof targetPath !== 'string' || !targetPath) return false;
  const rel = path.relative(path.resolve(baseDir), path.resolve(targetPath));
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

// 系统关键目录黑名单 (Windows + POSIX): 防渲染层被攻破时向系统分区写/触碰关键路径。
// 原分布于 TestCaseCodeGenerator.SYSTEM_PROTECTED_DIRS, fileHandlers sysRootRe 为其子集。
const SYSTEM_PROTECTED_DIRS = new Set([
  // Windows
  'windows',
  'system32',
  'syswow64',
  'program files',
  'program files (x86)',
  'programdata',
  'recovery',
  '$recycle.bin',
  'system volume information',
  // POSIX
  'etc',
  'usr',
  'bin',
  'sbin',
  'boot',
  'dev',
  'proc',
  'sys',
  'var',
]);

/**
 * 判断 resolvedPath 是否位于系统关键根 (盘符根/POSIX 根) 或其一级受保护目录下。
 * 供 mkdir / 安全写路径前拦截, 防污染系统分区。
 * @param {string} resolvedPath - 已 resolve 或任意待规范化的路径
 * @returns {boolean}
 */
function isSystemProtectedPath(resolvedPath) {
  if (typeof resolvedPath !== 'string' || !resolvedPath) return false;
  const segments = path
    .resolve(resolvedPath)
    .replace(/[\\/]+$/, '')
    .split(/[\\/]/)
    .filter(Boolean);
  if (segments.length <= 1) return true; // 盘符根 (C:) / POSIX 根 (/)
  const rootSeg = segments[1] ? segments[1].toLowerCase() : '';
  return Boolean(rootSeg && SYSTEM_PROTECTED_DIRS.has(rootSeg));
}

module.exports = { isPathInside, isSystemProtectedPath };

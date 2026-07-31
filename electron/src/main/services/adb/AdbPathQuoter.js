/**
 * AdbPathQuoter - adb shell 命令路径参数的单引号转义工具
 *
 * 设计:
 * - 单引号内的内容不会被 shell 解释 (除单引号本身)
 * - 内部单引号通过 '\\'' 转义 (闭合单引号 → 转义单引号 → 重新开启单引号)
 * - 等价于 shell-quote 包的 quote() 函数,但零依赖
 *
 * 用法:
 *   const quoted = AdbPathQuoter.quote('/sdcard/my file.txt');
 *   // → "'/sdcard/my file.txt'"
 *   const args = ['-s', deviceId, 'shell', `stat -c %s ${quoted}`];
 *   spawn(adbPath, args, ...);
 */
class AdbPathQuoter {
  /**
   * 对路径进行单引号转义
   * @param {string} rawPath - 原始路径
   * @returns {string} 转义后的路径 (含外层单引号)
   */
  static quote(rawPath) {
    if (typeof rawPath !== 'string' || rawPath.length === 0) {
      return "''";
    }
    return "'" + rawPath.replace(/'/g, "'\\''") + "'";
  }
}

module.exports = AdbPathQuoter;

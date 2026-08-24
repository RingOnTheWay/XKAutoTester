/**
 * RemoteStatService - 查询远程文件/目录大小
 *
 * 设计:
 * - 依赖 AdbCommandExecutor 执行命令 (统一 spawn + timeout)
 * - 路径用 AdbPathQuoter 单引号转义,防止 shell 注入
 * - getDirSize 采用 du -sk / du -s / du / ls -laR fallback 链,兼容不同 Android 版本 (toybox/busybox)
 * - 所有命令 timeoutMs=30000 (大小查询可能耗时)
 * - 失败/非数字输出返回 0,不抛异常 (调用方按 0 处理)
 */
const AdbPathQuoter = require('./AdbPathQuoter');

class RemoteStatService {
  /**
   * @param {object} deps
   * @param {object} deps.commandExecutor - AdbCommandExecutor 实例
   */
  constructor({ commandExecutor }) {
    if (!commandExecutor) {
      throw new Error('RemoteStatService: commandExecutor is required');
    }
    this._executor = commandExecutor;
  }

  /**
   * 构造 adb 命令 args (统一 deviceId 注入)
   * @param {string} shellCmd - shell 命令字符串 (已含转义路径)
   * @param {string|null} deviceId
   * @returns {string[]} adb args
   */
  _buildArgs(shellCmd, deviceId) {
    const quoted = AdbPathQuoter.quote(shellCmd.rawPath);
    const fullCmd = shellCmd.prefix + ' ' + quoted;
    if (deviceId) {
      return ['-s', deviceId, 'shell', fullCmd];
    }
    return ['shell', fullCmd];
  }

  /**
   * 查询远程文件大小 (字节)
   * @param {string} remotePath
   * @param {string|null} deviceId
   * @returns {Promise<number>} 字节数,失败返回 0
   */
  async getFileSize(remotePath, deviceId) {
    const args = this._buildArgs(
      { prefix: 'stat -c %s', rawPath: remotePath },
      deviceId
    );
    const result = await this._executor.execute(args, { timeoutMs: 30000 });

    if (!result.success) {
      return 0;
    }
    return this._parseNumericOutput(result.output);
  }

  /**
   * 查询远程目录总大小 (字节)
   * @param {string} remotePath
   * @param {string|null} deviceId
   * @returns {Promise<number>} 字节数,失败返回 0
   */
  async getDirSize(remotePath, deviceId) {
    // du fallback 链: -sk (显式 KB) → -s (默认 KB) → 无 flag (兼容老 toybox)
    const duCommands = [
      { prefix: 'du -sk', rawPath: remotePath },
      { prefix: 'du -s', rawPath: remotePath },
      { prefix: 'du', rawPath: remotePath },
    ];

    for (const cmd of duCommands) {
      const args = this._buildArgs(cmd, deviceId);
      const result = await this._executor.execute(args, { timeoutMs: 30000 });

      if (result.success && result.output) {
        const bytes = this._parseDuOutput(result.output);
        if (bytes > 0) {
          return bytes;
        }
      }
    }

    // 最终 fallback: ls -laR 解析每行第 5 字段求和
    const lsArgs = this._buildArgs(
      { prefix: 'ls -laR', rawPath: remotePath },
      deviceId
    );
    const lsResult = await this._executor.execute(lsArgs, { timeoutMs: 30000 });

    if (lsResult.success && lsResult.output) {
      return this._parseLsOutput(lsResult.output);
    }

    return 0;
  }

  /**
   * 解析 stat 输出为数字
   * @param {string} output
   * @returns {number}
   */
  _parseNumericOutput(output) {
    if (!output) return 0;
    // 严格匹配整行数字 (允许首尾空白)
    const m = output.trim().match(/^(\d+)$/);
    if (!m) return 0;
    const n = parseInt(m[1], 10);
    return Number.isFinite(n) ? n : 0;
  }

  /**
   * 解析 du 输出 (KB → 字节)
   * 取最后一行 (避免子目录大小),匹配第一个数字
   * @param {string} output
   * @returns {number} 字节数,无效返回 0
   */
  _parseDuOutput(output) {
    const lines = output.trim().split('\n').filter(l => l.length > 0);
    if (lines.length === 0) return 0;
    const lastLine = lines[lines.length - 1];
    const m = lastLine.match(/(\d+)/);
    if (!m) return 0;
    const kb = parseInt(m[1], 10);
    if (!Number.isFinite(kb) || kb <= 0) return 0;
    // 假设所有 du 变体返回 KB (toybox 默认 KB)
    return kb * 1024;
  }

  /**
   * 解析 ls -laR 输出,匹配文件行 (- 开头) 第 5 字段求和
   * @param {string} output
   * @returns {number} 字节总和
   */
  _parseLsOutput(output) {
    let total = 0;
    const lines = output.split('\n');
    for (const line of lines) {
      // 匹配 "-rw-r--r-- 1 root root 1234 ..." 这样的行,第 5 字段是字节数
      const m = line.match(/^\-\S+\s+\d+\s+\S+\s+\S+\s+(\d+)\s/);
      if (m) {
        const bytes = parseInt(m[1], 10);
        if (Number.isFinite(bytes) && bytes > 0) {
          total += bytes;
        }
      }
    }
    return total;
  }
}

module.exports = RemoteStatService;

/**
 * AdbCommandExecutor - adb 命令统一执行器
 *
 * 设计:
 * - 所有 adb 命令通过 ProcessRunner.execute({ windowsHide: true }) 执行,无 shell=True
 * - 注入 spawnFn (透传给 ProcessRunner, 默认 child_process.spawn),便于单元测试
 * - 统一 timeout 管理 (默认 5000ms)
 * - 统一 stdout/stderr 拼接 + i18n 错误消息
 *
 * 接口:
 *   const exec = new AdbCommandExecutor({ projectRoot, i18nService, spawnFn });
 *   const result = await exec.execute(['-s', deviceId, 'shell', 'ls'], { timeoutMs: 10000, onStdout });
 *   // result: { success: bool, output: string, error: string }
 */
const pathHelper = require('../../utils/pathHelper');
const { ProcessRunner } = require('../spawnHelper');

class AdbCommandExecutor {
  /**
   * @param {object} opts
   * @param {string} opts.projectRoot - 项目根 (用于 pathHelper 解析 adb 路径)
   * @param {object} opts.i18nService - i18n 服务 (用于错误消息)
   * @param {function} [opts.spawnFn] - spawn 函数 (透传给 ProcessRunner, 默认 child_process.spawn)
   */
  constructor({ projectRoot, i18nService, spawnFn }) {
    this.projectRoot = projectRoot;
    this.i18nService = i18nService;
    this._runner = new ProcessRunner({ spawnFn });
  }

  /**
   * 执行 adb 命令
   * @param {string[]} args - 参数列表 (含 -s deviceId / shell / 业务参数)
   * @param {object} [opts]
   * @param {number} [opts.timeoutMs=5000] - 超时毫秒
   * @param {function} [opts.onStdout] - stdout 数据回调 (chunk: string)
   * @returns {Promise<{success: boolean, output: string, error: string}>}
   */
  async execute(args, { timeoutMs = 5000, onStdout } = {}) {
    try {
      const adbPath = pathHelper.getAdbPath(this.projectRoot, true);
      const r = await this._runner.execute({
        command: adbPath,
        args,
        timeout: timeoutMs,
        onStdout,
      });

      // spawn 同步抛错 / error 事件 (ENOENT 等)
      if (r.errorObject) {
        return {
          success: false,
          output: r.stdout,
          error: r.errorObject.message,
        };
      }
      // 超时
      if (r.timedOut) {
        return {
          success: false,
          output: r.stdout,
          error: this.i18nService.t('main.commandTimeout'),
        };
      }
      // 正常退出
      if (r.code !== 0) {
        const error = r.stderr || this.i18nService.t('main.commandFailed', { code: r.code });
        return { success: false, output: r.stdout, error };
      }
      return { success: true, output: r.stdout, error: r.stderr };
    } catch (error) {
      return { success: false, output: '', error: error.message };
    }
  }
}

module.exports = AdbCommandExecutor;

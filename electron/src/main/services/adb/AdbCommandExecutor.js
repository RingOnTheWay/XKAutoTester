/**
 * AdbCommandExecutor - adb 命令统一执行器
 *
 * 设计:
 * - 所有 adb 命令通过 spawn(adbPath, args[], { windowsHide: true }) 执行,无 shell=True
 * - 注入 spawnFn (默认 child_process.spawn),便于单元测试
 * - 统一 timeout 管理 (默认 5000ms)
 * - 统一 stdout/stderr 拼接 + i18n 错误消息
 *
 * 接口:
 *   const exec = new AdbCommandExecutor({ projectRoot, i18nService, spawnFn });
 *   const result = await exec.execute(['-s', deviceId, 'shell', 'ls'], { timeoutMs: 10000, onStdout });
 *   // result: { success: bool, output: string, error: string }
 */
const { spawn } = require('child_process');
const pathHelper = require('../../utils/pathHelper');

class AdbCommandExecutor {
  /**
   * @param {object} opts
   * @param {string} opts.projectRoot - 项目根 (用于 pathHelper 解析 adb 路径)
   * @param {object} opts.i18nService - i18n 服务 (用于错误消息)
   * @param {function} [opts.spawnFn] - spawn 函数 (默认 child_process.spawn)
   */
  constructor({ projectRoot, i18nService, spawnFn }) {
    this.projectRoot = projectRoot;
    this.i18nService = i18nService;
    this._spawn = spawnFn || spawn;
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
      const proc = this._spawn(adbPath, args, { windowsHide: true });

      let stdout = '';
      let stderr = '';
      let resolved = false;
      let timeoutHandle = null;

      return new Promise((resolve) => {
        const doResolve = (result) => {
          if (resolved) return;
          resolved = true;
          if (timeoutHandle) clearTimeout(timeoutHandle);
          resolve(result);
        };

        proc.stdout.on('data', (data) => {
          const chunk = data.toString();
          stdout += chunk;
          if (typeof onStdout === 'function') {
            try { onStdout(chunk); } catch { /* 回调失败不影响主流程 */ }
          }
        });

        proc.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        proc.on('close', (code) => {
          if (code !== 0) {
            const error = stderr || this.i18nService.t('main.commandFailed', { code });
            doResolve({ success: false, output: stdout, error });
          } else {
            doResolve({ success: true, output: stdout, error: stderr });
          }
        });

        proc.on('error', (error) => {
          doResolve({ success: false, output: stdout, error: error.message });
        });

        timeoutHandle = setTimeout(() => {
          try { proc.kill(); } catch { /* 进程已退出 */ }
          doResolve({
            success: false,
            output: stdout,
            error: this.i18nService.t('main.commandTimeout'),
          });
        }, timeoutMs);
      });
    } catch (error) {
      return { success: false, output: '', error: error.message };
    }
  }
}

module.exports = AdbCommandExecutor;

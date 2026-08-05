/**
 * ApkInstaller - APK 安装
 *
 * 设计:
 * - 依赖 AdbCommandExecutor (rm cleanup) + AdbProgressMonitor + ProcessRunner
 * - 消除 shell=True: 全改 ProcessRunner.execute({ args }) 形式
 * - 流程: stat → push (monitor start/stop) → pm install -r → rm cleanup
 * - 所有外部依赖通过构造注入, 便于单元测试; spawnFn 透传给 ProcessRunner
 * - install 超时: 默认 10 分钟 (大 APK 安装可能耗时)
 */
const path = require('path');
const fs = require('fs');
const AdbProgressMonitor = require('../AdbProgressMonitor');
const pathHelper = require('../../utils/pathHelper');
const { ProcessRunner } = require('../spawnHelper');

const DEFAULT_INSTALL_TIMEOUT_MS = 600000;  // 10 分钟

class ApkInstaller {
  /**
   * @param {object} deps
   * @param {object} deps.commandExecutor - AdbCommandExecutor 实例 (用于 rm cleanup)
   * @param {object} deps.i18nService - 国际化服务
   * @param {Function} [deps.spawnFn] - spawn 函数 (透传给 ProcessRunner)
   * @param {object} [deps.fs] - fs 模块
   * @param {Function} [deps.progressMonitorFactory] - AdbProgressMonitor 工厂
   * @param {number} [deps.installTimeoutMs] - install 超时 (默认 600000)
   */
  constructor({
    commandExecutor,
    i18nService,
    spawnFn,
    fs: fsDep,
    progressMonitorFactory,
    installTimeoutMs,
  }) {
    if (!commandExecutor) throw new Error('ApkInstaller: commandExecutor is required');
    if (!i18nService) throw new Error('ApkInstaller: i18nService is required');

    this._executor = commandExecutor;
    this._i18n = i18nService;
    this._runner = new ProcessRunner({ spawnFn });
    this._fs = fsDep || fs;
    this._monitorFactory = progressMonitorFactory || ((opts) => new AdbProgressMonitor(opts));
    this._installTimeoutMs = installTimeoutMs || DEFAULT_INSTALL_TIMEOUT_MS;
  }

  /**
   * 安装 APK: push + pm install + cleanup
   * @param {string} apkPath
   * @param {string|null} deviceId
   * @param {object|null} eventSender
   * @returns {Promise<{success: boolean, error?: string, output?: string}>}
   */
  async install(apkPath, deviceId, eventSender) {
    try {
      const stats = this._fs.statSync(apkPath);
      const fileSizeInBytes = stats.size;
      const fileSizeInMB = (fileSizeInBytes / (1024 * 1024)).toFixed(2);

      const tempFileName = `temp_${Date.now()}.apk`;
      const tempRemotePath = `/data/local/tmp/${tempFileName}`;

      const monitor = this._monitorFactory({
        remotePath: tempRemotePath,
        deviceId,
        fileStats: { size: fileSizeInBytes, name: path.basename(apkPath), sizeInMB: fileSizeInMB },
        eventSender,
        i18nService: this._i18n,
        executeStat: (statArgs) => this._executor.execute(statArgs),
        channel: 'install-progress',
        maxPercentage: 80,
        pollingStatus: 'transferring',
        pollingMessageKey: 'fileManager.transferring',
      });

      monitor.emit(0, 'preparing', this._i18n.t('fileManager.preparingInstall'));

      // 步骤1: adb push
      const pushArgs = deviceId
        ? ['-s', deviceId, 'push', apkPath, tempRemotePath]
        : ['push', apkPath, tempRemotePath];

      const adbPath = pathHelper.getAdbPath(process.resourcesPath || process.cwd(), true);

      monitor.start(500);

      let pushStdout = '';
      let pushStderr = '';
      const pushRaw = await this._runner.execute({
        command: adbPath,
        args: pushArgs,
        onStdout: (chunk) => { pushStdout += chunk; },
        onStderr: (chunk) => { pushStderr += chunk; },
      });
      monitor.stop();

      // 还原原 pushResult 结构: close → {success, stdout, stderr, code}; error → {success:false, stdout, stderr, error}
      const pushResult = pushRaw.errorObject
        ? { success: false, stdout: pushStdout, stderr: pushStderr, error: pushRaw.errorObject.message }
        : {
            success: pushRaw.code === 0 || pushStderr.includes('file pushed') || pushStdout.includes('file pushed'),
            stdout: pushStdout,
            stderr: pushStderr,
            code: pushRaw.code,
          };

      if (!pushResult.success) {
        const errorMsg = pushResult.stderr || pushResult.error || 'Failed to push APK to device';
        monitor.emit(100, 'error', this._i18n.t('fileManager.installFailed'), errorMsg);
        return { success: false, error: errorMsg, output: pushResult.stdout };
      }

      // 步骤2: pm install -r
      monitor.emit(80, 'installing', this._i18n.t('fileManager.installing'));

      const installArgs = deviceId
        ? ['-s', deviceId, 'shell', 'pm', 'install', '-r', tempRemotePath]
        : ['shell', 'pm', 'install', '-r', tempRemotePath];

      let installStdout = '';
      let installStderr = '';
      const installRaw = await this._runner.execute({
        command: adbPath,
        args: installArgs,
        timeout: this._installTimeoutMs,
        onStdout: (chunk) => { installStdout += chunk; },
        onStderr: (chunk) => { installStderr += chunk; },
      });

      // 步骤3: 清理临时文件 (无论成功失败都尝试)
      try {
        const rmArgs = deviceId
          ? ['-s', deviceId, 'shell', 'rm', tempRemotePath]
          : ['shell', 'rm', tempRemotePath];
        await this._executor.execute(rmArgs, { timeoutMs: 5000 });
      } catch {
        // 清理失败不影响主流程
      }

      // 判断结果 (保持原 close/error/timeout 三分支行为 + monitor.emit 序列)
      if (installRaw.errorObject) {
        // spawn error 事件
        monitor.emit(100, 'error', this._i18n.t('fileManager.installFailed'), installRaw.errorObject.message);
        return { success: false, error: installRaw.errorObject.message };
      }
      if (installRaw.timedOut) {
        const errorMsg = this._i18n.t('main.commandTimeout');
        monitor.emit(100, 'error', this._i18n.t('fileManager.installFailed'), errorMsg);
        return { success: false, error: errorMsg, output: installStdout };
      }
      const isSuccess = installStdout.toLowerCase().includes('success');
      if (isSuccess) {
        monitor.emit(100, 'success', this._i18n.t('fileManager.installSuccess'));
        return { success: true, output: installStdout, error: installStderr };
      }
      const errorMsg = installStderr || installStdout || this._i18n.t('fileManager.installFailed');
      monitor.emit(100, 'error', this._i18n.t('fileManager.installFailed'), errorMsg);
      return { success: false, error: errorMsg, output: installStdout };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = ApkInstaller;

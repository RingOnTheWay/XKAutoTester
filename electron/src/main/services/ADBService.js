/**
 * ADBService - facade
 *
 * 设计:
 * - 深模块架构: facade 持有 4 collaborator (AdbCommandExecutor + RemoteStatService + FileTransferService + ApkInstaller)
 * - 公共 API 2 方法: getConnectedDevices / executeAdbCommand (其余通过属性暴露 collaborator)
 * - M4: 删 3 pass-through wrapper (uploadFile/downloadFile/installApk), 调用方直接持 .fileTransfer / .apkInstaller / .remoteStat
 * - M4: TarExtractor 改 factory-or-default 注入 (原硬编码 new TarExtractor())
 * - 消除 shell=True: 全改 spawn(adbPath, args, {}) 形式
 * - 路径解析委托 pathHelper.getAdbPath
 * - 调试 console.log 全删
 */
const { spawn } = require('child_process');
const pathHelper = require('../utils/pathHelper');
const AdbCommandExecutor = require('./adb/AdbCommandExecutor');
const RemoteStatService = require('./adb/RemoteStatService');
const FileTransferService = require('./adb/FileTransferService');
const ApkInstaller = require('./adb/ApkInstaller');
const TarExtractor = require('./TarExtractor');

// 不需要 shell 前缀的 adb 子命令 (直接 adb <cmd>, 不经过 device shell)
const NO_SHELL_COMMANDS = ['connect', 'disconnect', 'devices', 'kill-server', 'start-server', 'version', 'tcpip'];

class ADBService {
  /**
   * @param {string} projectRoot
   * @param {object} i18nService
   * @param {object} [collaborators] - 可选注入 (测试用)
   * @param {object} [collaborators.commandExecutor]
   * @param {object} [collaborators.fileTransferService]
   * @param {object} [collaborators.apkInstaller]
   * @param {object} [collaborators.remoteStatService]
   * @param {object} [collaborators.tarExtractor] - M4: TarExtractor 注入 (默认 new TarExtractor())
   * @param {Function} [collaborators.spawnFn] - spawn 函数 (测试用)
   */
  constructor(projectRoot, i18nService, collaborators = {}) {
    this.projectRoot = projectRoot;
    this.i18nService = i18nService;
    this._spawn = collaborators.spawnFn || spawn;

    this._executor = collaborators.commandExecutor || new AdbCommandExecutor({
      projectRoot,
      i18nService,
      spawnFn: this._spawn,
    });

    this._remoteStat = collaborators.remoteStatService || new RemoteStatService({
      commandExecutor: this._executor,
      i18nService,
    });

    // M4: TarExtractor factory-or-default (原硬编码 new TarExtractor())
    this._tarExtractor = collaborators.tarExtractor || new TarExtractor();

    this._fileTransfer = collaborators.fileTransferService || new FileTransferService({
      commandExecutor: this._executor,
      remoteStatService: this._remoteStat,
      i18nService,
      tarExtractor: this._tarExtractor,
      spawnFn: this._spawn,
    });

    this._apkInstaller = collaborators.apkInstaller || new ApkInstaller({
      commandExecutor: this._executor,
      i18nService,
      spawnFn: this._spawn,
    });
  }

  /** M4: collaborator 属性暴露 (调用方直接持属性, 消除 pass-through wrapper) */
  get fileTransfer() {
    return this._fileTransfer;
  }

  /** M4: collaborator 属性暴露 */
  get apkInstaller() {
    return this._apkInstaller;
  }

  /** M4: collaborator 属性暴露 */
  get remoteStat() {
    return this._remoteStat;
  }

  /** M4: collaborator 属性暴露 (供测试/扩展访问) */
  get tarExtractor() {
    return this._tarExtractor;
  }

  /** M4: collaborator 属性暴露 (供测试/扩展访问) */
  get commandExecutor() {
    return this._executor;
  }

  /**
   * 获取已连接设备列表
   * @returns {Promise<Array<{id: string, status: string}>>}
   */
  async getConnectedDevices() {
    try {
      const result = await this._executor.execute(['devices'], { timeoutMs: 5000 });
      if (!result.success) {
        return [];
      }

      const devices = [];
      const lines = (result.output || '').split('\n');

      for (const line of lines) {
        // 匹配格式: "<serial> <status>"，status ∈ device|unauthorized|offline
        const match = line.match(/^([^\s]+)\s+(device|unauthorized|offline)\s*$/);
        if (match) {
          devices.push({ id: match[1], status: match[2] });
        }
      }

      return devices;
    } catch {
      return [];
    }
  }

  /**
   * 执行 adb 命令 (含 connect/tcpip 业务路由)
   * @param {string} cmd - 命令字符串 (如 'pm list packages', 'connect 192.168.1.100:5555')
   * @param {string|null} deviceId
   * @returns {Promise<{success: boolean, output?: string, error?: string}>}
   */
  async executeAdbCommand(cmd, deviceId) {
    try {
      const adbPath = pathHelper.getAdbPath(this.projectRoot, true);
      const cmdParts = cmd.split(/\s+/).filter(part => part.trim() !== '');

      const args = [];
      if (deviceId) {
        args.push('-s', deviceId);
      }

      const firstCmd = cmdParts[0];

      if (!NO_SHELL_COMMANDS.includes(firstCmd)) {
        args.push('shell');
      }

      args.push(...cmdParts);

      const adbProcess = this._spawn(adbPath, args, { windowsHide: true });

      let stdout = '';
      let stderr = '';
      let resolved = false;

      return new Promise((resolve) => {
        const doResolve = (result) => {
          if (resolved) return;
          resolved = true;
          resolve(result);
        };

        adbProcess.stdout.on('data', (data) => {
          stdout += data.toString();

          // tcpip 特殊: 检测到 'restarting in TCP mode port:' 立即成功返回
          if (firstCmd === 'tcpip' && stdout.includes('restarting in TCP mode port:')) {
            try { adbProcess.kill(); } catch { /* 已退出 */ }
            doResolve({ success: true, output: stdout, error: stderr });
          }
        });

        adbProcess.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        adbProcess.on('close', (code) => {
          if (firstCmd === 'connect') {
            if (stdout.includes('connected to') || stdout.includes('already connected')) {
              doResolve({ success: true, output: stdout, error: stderr });
            } else {
              doResolve({ success: false, error: stderr || stdout, output: stdout });
            }
          } else if (firstCmd === 'tcpip') {
            if (stdout.includes('restarting in TCP mode port:')) {
              doResolve({ success: true, output: stdout, error: stderr });
            } else if (stderr.includes('error:') || code !== 0) {
              doResolve({ success: false, error: stderr || 'Failed to restart in TCP mode', output: stdout });
            } else {
              doResolve({ success: true, output: stdout, error: stderr });
            }
          } else {
            if (code !== 0) {
              doResolve({ success: false, error: stderr || this.i18nService.t('main.commandFailed', { code }), output: stdout });
            } else {
              doResolve({ success: true, output: stdout, error: stderr });
            }
          }
        });

        adbProcess.on('error', (error) => {
          doResolve({ success: false, error: error.message, output: '' });
        });

        setTimeout(() => {
          if (resolved) return;
          try { adbProcess.kill(); } catch { /* 已退出 */ }
          if (firstCmd === 'tcpip' && stdout.includes('restarting in TCP mode port:')) {
            doResolve({ success: true, output: stdout, error: stderr });
          } else {
            doResolve({ success: false, error: this.i18nService.t('main.commandTimeout'), output: stdout });
          }
        }, 5000);
      });
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = ADBService;

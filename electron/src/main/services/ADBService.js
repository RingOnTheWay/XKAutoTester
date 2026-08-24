/**
 * ADBService - ADB 聚合根 (collaborator 协调器)
 *
 * 设计:
 * - 深模块架构: 聚合根持有 4 collaborator (AdbCommandExecutor + RemoteStatService + FileTransferService + ApkInstaller)
 * - 公共 API 2 方法: getConnectedDevices / executeAdbCommand (其余通过属性暴露 collaborator)
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

// 危险命令黑名单: 阻止 XSS 攻击者通过 executeAdbCommand 执行破坏性操作
// 命中黑名单的命令直接拒绝, 不执行
const DANGEROUS_COMMAND_PATTERNS = [
  /\brm\s+-rf?\s+\/(data|system|sdcard|)/i,  // rm -rf /data 等
  /\breboot\b/i,                                // 重启设备
  /\bflash\s+/i,                                // 刷机
  /\boem\s+unlock\b/i,                          // 解锁 bootloader
  /\bfactory\s*reset\b/i,                       // 恢复出厂
  /\bwipe\s+/i,                                 // wipe 分区
];

// 超时阈值 (模块级常量, 避免魔法数)
const ADB_DEVICES_TIMEOUT_MS = 5000;    // getConnectedDevices
const ADB_COMMAND_TIMEOUT_MS = 5000;    // executeAdbCommand

class ADBService {
  /**
   * @param {string} projectRoot
   * @param {object} i18nService
   * @param {object} [collaborators] - 可选注入 (测试用)
   * @param {object} [collaborators.commandExecutor]
   * @param {object} [collaborators.fileTransferService]
   * @param {object} [collaborators.apkInstaller]
   * @param {object} [collaborators.remoteStatService]
   * @param {object} [collaborators.tarExtractor] - TarExtractor 注入 (默认 new TarExtractor())
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
    });

    // TarExtractor factory-or-default
    this._tarExtractor = collaborators.tarExtractor || new TarExtractor();

    this._fileTransfer = collaborators.fileTransferService || new FileTransferService({
      commandExecutor: this._executor,
      remoteStatService: this._remoteStat,
      i18nService,
      tarExtractor: this._tarExtractor,
      projectRoot,
      spawnFn: this._spawn,
    });

    this._apkInstaller = collaborators.apkInstaller || new ApkInstaller({
      commandExecutor: this._executor,
      i18nService,
      projectRoot,
      spawnFn: this._spawn,
    });
  }

  /** collaborator 属性暴露: 调用方直接持属性 */
  get fileTransfer() {
    return this._fileTransfer;
  }

  /** collaborator 属性暴露 */
  get apkInstaller() {
    return this._apkInstaller;
  }

  /** collaborator 属性暴露 */
  get remoteStat() {
    return this._remoteStat;
  }

  /** collaborator 属性暴露 (供测试访问) */
  get tarExtractor() {
    return this._tarExtractor;
  }

  /**
   * 获取已连接设备列表
   * @returns {Promise<Array<{id: string, status: string}>>}
   */
  async getConnectedDevices() {
    try {
      const result = await this._executor.execute(['devices'], { timeoutMs: ADB_DEVICES_TIMEOUT_MS });
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
      // 危险命令黑名单校验: 防 XSS 攻击者执行破坏性 adb 命令
      for (const pattern of DANGEROUS_COMMAND_PATTERNS) {
        if (pattern.test(cmd)) {
          // 无现成 i18n key (locales 只读), 保守改为英文报错 + 英文日志, 不崩即可
          console.warn(`[ADBService] Dangerous command rejected by security policy: ${cmd}`);
          return { success: false, error: `Command rejected by security policy: ${cmd}` };
        }
      }

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
        let timeoutId = null;
        const doResolve = (result) => {
          if (resolved) return;
          resolved = true;
          // 提前收尾 (close/error/tcpip 成功) 时清理超时定时器, 避免定时器泄漏
          if (timeoutId) clearTimeout(timeoutId);
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

        timeoutId = setTimeout(() => {
          if (resolved) return;
          try { adbProcess.kill(); } catch { /* 已退出 */ }
          if (firstCmd === 'tcpip' && stdout.includes('restarting in TCP mode port:')) {
            doResolve({ success: true, output: stdout, error: stderr });
          } else {
            doResolve({ success: false, error: this.i18nService.t('main.commandTimeout'), output: stdout });
          }
        }, ADB_COMMAND_TIMEOUT_MS);
      });
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = ADBService;

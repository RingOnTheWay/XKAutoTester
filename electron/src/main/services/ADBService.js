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
const ADB_DEVICES_TIMEOUT_MS = 5000;          // getConnectedDevices 常规 devices
const ADB_DEVICES_FIRST_TIMEOUT_MS = 10000;   // 首次 devices (可能触发 daemon 冷启动, 给足时间)
const ADB_COMMAND_TIMEOUT_MS = 5000;          // executeAdbCommand
const ADB_START_SERVER_TIMEOUT_MS = 20000;    // adb start-server (daemon 冷启动可能较慢)
const ADB_KILL_SERVER_TIMEOUT_MS = 5000;      // adb kill-server (清理损坏 server)
const ADB_DEVICES_RETRY_COUNT = 3;            // server 就绪后 devices 轮询重试次数
const ADB_DEVICES_RETRY_DELAY_MS = 800;       // 轮询重试间隔

// daemon 未运行/启动失败/server 损坏的典型输出特征 (命中则自动修复 server)
// 注意: "daemon not running" 是正常冷启动提示(成功输出也含), 不作为错误特征
// protocol fault / connection reset / failed to check server version 表示
// 客户端与现有 server 协议不匹配(版本冲突或半启动的坏 server), 需 kill-server 重建
const ADB_DAEMON_ERROR_PATTERNS = [
  /cannot connect to daemon/i,
  /cannot bind/i,
  /failed to start/i,
  /server not running/i,
  /connection refused/i,
  /cannot reach daemon/i,
  /adb server is not running/i,
  /failed to check daemon/i,
  /unable to start/i,
  /failed to check server version/i,
  /protocol fault/i,
  /couldn't read status/i,
  /connection reset/i,
];

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
   *
   * daemon 未运行/损坏时自动恢复:
   * - 首次 `adb devices` 若 daemon 未运行会尝试自动拉起, 给足冷启动时间 (10s)
   * - 失败或输出含 daemon/server 错误时, 调 _ensureAdbServer() 修复:
   *   start-server 幂等; 检测到协议错误/损坏 server 时 kill-server 重建
   * - 修复后轮询重试 `adb devices` 直到 daemon 就绪 (冷启动后设备枚举需几秒)
   * @returns {Promise<Array<{id: string, status: string}>>}
   */
  async getConnectedDevices() {
    try {
      // 首次查询: 若 daemon 未运行, adb 客户端会自动拉起, 给足冷启动时间
      let result = await this._executor.execute(['devices'], { timeoutMs: ADB_DEVICES_FIRST_TIMEOUT_MS });

      // daemon 未运行/server 损坏: 自动修复后轮询重试
      if (!result.success || this._isDaemonError(result)) {
        await this._ensureAdbServer();

        for (let attempt = 0; attempt < ADB_DEVICES_RETRY_COUNT; attempt++) {
          result = await this._executor.execute(['devices'], { timeoutMs: ADB_DEVICES_TIMEOUT_MS });
          if (result.success && !this._isDaemonError(result)) break;
          await this._sleep(ADB_DEVICES_RETRY_DELAY_MS);
        }
      }

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
   * 确保 adb server 干净运行
   *
   * 背景: 首次 `adb devices` 自动拉起 daemon 时若客户端被中断/超时,
   * server 可能处于"半死"状态继续占用 5037 端口, 此后所有 adb 命令
   * (含外部控制台) 都会报 protocol fault / connection reset, 只有杀掉
   * 这个坏 server 重新启动才能恢复。
   *
   * 策略:
   * - 先 start-server (幂等: daemon 正常则快速返回)
   * - 若 start-server 失败或输出含协议/daemon 错误 (server 损坏或版本冲突),
   *   先 kill-server 清理占用 5037 的坏 server, 再重新 start-server
   */
  async _ensureAdbServer() {
    let startResult = await this._executor.execute(['start-server'], { timeoutMs: ADB_START_SERVER_TIMEOUT_MS });
    if (!startResult.success || this._isDaemonError(startResult)) {
      // server 损坏: 清理后重建
      await this._executor.execute(['kill-server'], { timeoutMs: ADB_KILL_SERVER_TIMEOUT_MS });
      await this._executor.execute(['start-server'], { timeoutMs: ADB_START_SERVER_TIMEOUT_MS });
    }
  }

  /**
   * 判断 adb 输出是否为 daemon 未运行/启动失败类错误
   * @param {{output?: string, error?: string}} result
   * @returns {boolean}
   */
  _isDaemonError(result) {
    const text = `${result.output || ''}\n${result.error || ''}`;
    return ADB_DAEMON_ERROR_PATTERNS.some(pattern => pattern.test(text));
  }

  /**
   * 延迟辅助 (测试友好, 可被替换)
   * @param {number} ms
   * @returns {Promise<void>}
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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

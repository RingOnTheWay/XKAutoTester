// ── 默认轮询间隔 ────────────────────────────────────────────
const DEFAULT_POLL_INTERVAL_MS = 500;

/**
 * AdbProgressMonitor - ADB 文件传输进度监控
 *
 * 双模式:
 * 1. start()/stop() 模式: 内部 setInterval + adb stat 轮询 (upload/install)
 * 2. emit(percentage, status, message, error?) 模式: 调用方主动触发 (download stdout 解析)
 *
 * 通用 payload: { percentage, status, message, fileName, fileSize, error? }
 */
class AdbProgressMonitor {
  /**
   * @param {Object} options
   * @param {string} options.remotePath - 远程文件路径 (用于 stat 查询)
   * @param {string|null} options.deviceId - 设备 ID (null 表示不指定)
   * @param {{size: number, name: string}} options.fileStats - 文件元信息
   * @param {Object|null} options.eventSender - IPC 发送器 (需 send 方法), null 时不发送
   * @param {Object} options.i18nService - 国际化服务 (需 t 方法)
   * @param {Function} options.executeStat - async (statArgs) => {success, output, error}
   * @param {string} options.channel - IPC 通道名 ('upload-progress' / 'download-progress' / 'install-progress')
   * @param {number} [options.maxPercentage=80] - 进度上限 (upload=95, install=80, download=100)
   * @param {string} [options.pollingStatus='transferring'] - 轮询期间 status 字段
   * @param {string} [options.pollingMessageKey='fileManager.uploading'] - 轮询期间 i18n 消息 key
   */
  constructor({
    remotePath,
    deviceId,
    fileStats,
    eventSender,
    i18nService,
    executeStat,
    channel,
    maxPercentage = 80,
    pollingStatus = 'transferring',
    pollingMessageKey = 'fileManager.uploading',
  }) {
    this.remotePath = remotePath;
    this.deviceId = deviceId;
    this.fileStats = fileStats;
    this.eventSender = eventSender;
    this.i18nService = i18nService;
    this.executeStat = executeStat;
    this.channel = channel;
    this.maxPercentage = maxPercentage;
    this.pollingStatus = pollingStatus;
    this.pollingMessageKey = pollingMessageKey;

    this.intervalId = null;
    this.stopped = false;
  }

  /**
   * 启动 setInterval 轮询 adb stat 获取已传输字节数
   * @param {number} intervalMs - 轮询间隔 (默认 500ms)
   */
  start(intervalMs = DEFAULT_POLL_INTERVAL_MS) {
    if (!this.eventSender) return;
    this.stopped = false; // 允许 stop 后重启
    this.intervalId = setInterval(() => {
      this._pollStat().catch(() => {
        /* 忽略监控错误 */
      });
    }, intervalMs);
  }

  /**
   * 停止轮询 + 清 interval (幂等)
   */
  stop() {
    this.stopped = true;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * 智能文件大小格式化 (B/KB/MB/GB), 避免小文件显示 0.00MB
   * @param {number} bytes
   * @returns {string}
   */
  formatFileSize(bytes) {
    if (!bytes || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    const value = bytes / Math.pow(1024, i);
    const digits = i === 0 ? 0 : value >= 100 ? 0 : value >= 10 ? 1 : 2;
    return value.toFixed(digits) + ' ' + units[i];
  }

  /**
   * 主动发送进度事件 (download stdout 解析模式)
   * @param {number} percentage - 0-100
   * @param {string} status - preparing/transferring/downloading/installing/success/error
   * @param {string} message - 已翻译的消息
   * @param {string} [error=null] - 错误信息 (status='error' 时附带)
   */
  emit(percentage, status, message, error = null) {
    if (!this.eventSender) return;
    const payload = {
      percentage,
      status,
      message,
      fileName: this.fileStats.name,
      fileSize: this.formatFileSize(this.fileStats.size),
    };
    if (error) payload.error = error;
    this.eventSender.send(this.channel, payload);
  }

  /**
   * 内部: 轮询 adb stat 查询远程文件大小
   * 解析 "Size: 12345" 格式, 计算 percentage = min(max, transferred/total * max)
   */
  async _pollStat() {
    if (this.stopped) return;
    const statArgs = this.deviceId
      ? ['-s', this.deviceId, 'shell', 'stat', this.remotePath]
      : ['shell', 'stat', this.remotePath];
    const statResult = await this.executeStat(statArgs);
    if (this.stopped) return;
    if (!statResult.success || !statResult.output) return;

    const sizeMatch = statResult.output.match(/Size:\s*(\d+)/);
    if (!sizeMatch) return;

    const transferredBytes = parseInt(sizeMatch[1], 10);
    const ratio = transferredBytes / this.fileStats.size;
    const percentage = Math.min(this.maxPercentage, Math.round(ratio * this.maxPercentage));
    this.emit(percentage, this.pollingStatus, this.i18nService.t(this.pollingMessageKey));
  }
}

module.exports = AdbProgressMonitor;

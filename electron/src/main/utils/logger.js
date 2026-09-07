const fs = require('fs');
const path = require('path');
const asyncFs = require('./asyncFs');

// P3-5: 单条日志长度上限 — PythonTestService 对每个 stdout chunk 调 logger,
// 巨行高频写入时 WriteStream 内部缓冲无界增长 → 内存泄漏。超长截断。
// R27 P3-1: 截断后不补写尾部 — 超限部分永久丢失 (防御内存泄漏的取舍, 高频 stdout
// 场景尾部多为重复行, 可接受; 需要完整日志时应调低输出频率)。
const MAX_LOG_ENTRY_LENGTH = 8192;

class Logger {
  constructor(baseLogDir, serviceName = 'Electron') {
    this.baseLogDir = baseLogDir;
    this.serviceName = serviceName;
    this.currentLogPath = null;
    this._stream = null; // P2-6: 持久 WriteStream
    this._droppedEntries = 0; // P3-5: 背压丢弃计数 (可观测, 防内存无界增长)
  }

  async ensureLogDir() {
    await asyncFs.ensureDir(this.baseLogDir);
  }

  _resolveLogPath() {
    if (!this.currentLogPath) {
      // 本地时间格式 YYYY-MM-DD-HH-MM-SS, 与 Appium 日志一致 (appium_server.py L250)
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const currentTime = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
      this.currentLogPath = path.join(this.baseLogDir, `XKAT-${currentTime}.log`);
    }
    return this.currentLogPath;
  }

  /**
   * P2-6: 懒创建持久 WriteStream — 原实现每次 log 调 asyncFs.appendFile
   * (open/write/close 三连), PythonTestService 对每个 stdout chunk 调 logger,
   * 高频输出时文件句柄抖动严重。持久流 + error 兜底 (目录缺失/权限错误不 crash)。
   */
  _getStream() {
    if (!this._stream) {
      const logPath = this._resolveLogPath();
      this._stream = fs.createWriteStream(logPath, { flags: 'a' });
      this._stream.on('error', (err) => {
        console.error('日志流错误:', err);
        this._stream = null; // 下次 log 重建
      });
    }
    return this._stream;
  }

  async log(message, level = 'INFO') {
    try {
      const timestamp = new Date().toISOString();
      const raw = `[${timestamp}] [${this.serviceName}] [${level}] ${message}`;
      // P3-5: 超长截断 (防高频 stdout 巨行撑爆 WriteStream 内部缓冲)
      const entry =
        raw.length > MAX_LOG_ENTRY_LENGTH
          ? `${raw.slice(0, MAX_LOG_ENTRY_LENGTH)}...[truncated]`
          : raw;
      const stream = this._getStream();
      // P3-5: write 返回 false = 背压 (Node 内部缓冲超过 highWaterMark)。
      // 高频 stdout 场景继续写只会让缓冲无界增长 → 内存泄漏; 日志流是尽力而为,
      // 此处丢弃本条并计数 (恢复后可继续写, 不丢后续日志)。
      if (!stream.write(entry + '\n')) {
        this._droppedEntries++;
      }
    } catch (err) {
      console.error('写入日志失败:', err);
    }
  }

  async info(message) {
    return this.log(message, 'INFO');
  }

  async error(message) {
    return this.log(message, 'ERROR');
  }

  async warn(message) {
    return this.log(message, 'WARN');
  }

  async stdout(message) {
    return this.log(`STDOUT: ${message}`, 'DEBUG');
  }

  async stderr(message) {
    return this.log(`STDERR: ${message}`, 'ERROR');
  }

  resetLogPath() {
    this.currentLogPath = null;
    // 路径重置时关闭旧流, 下次 log 写新文件
    if (this._stream) {
      this._stream.end();
      this._stream = null;
    }
  }

  /** 关闭持久流 (应用退出时调用) */
  close() {
    // R26 P3-6: 背压丢弃计数上报 — 原 _droppedEntries 从不读取, 丢日志不可观测
    if (this._droppedEntries > 0) {
      console.warn(`[logger] 背压期间丢弃 ${this._droppedEntries} 条日志 (请检查日志输出频率)`);
    }
    if (this._stream) {
      this._stream.end();
      this._stream = null;
    }
  }
}

module.exports = Logger;

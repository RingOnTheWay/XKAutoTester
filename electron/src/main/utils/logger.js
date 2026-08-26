const fs = require('fs');
const path = require('path');
const asyncFs = require('./asyncFs');

class Logger {
  constructor(baseLogDir, serviceName = 'Electron') {
    this.baseLogDir = baseLogDir;
    this.serviceName = serviceName;
    this.currentLogPath = null;
    this._stream = null;  // P2-6: 持久 WriteStream
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
        this._stream = null;  // 下次 log 重建
      });
    }
    return this._stream;
  }

  async log(message, level = 'INFO') {
    try {
      const timestamp = new Date().toISOString();
      const logEntry = `[${timestamp}] [${this.serviceName}] [${level}] ${message}\n`;
      this._getStream().write(logEntry);
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
    if (this._stream) {
      this._stream.end();
      this._stream = null;
    }
  }
}

module.exports = Logger;

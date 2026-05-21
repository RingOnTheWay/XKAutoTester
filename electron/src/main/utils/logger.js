const path = require('path');
const asyncFs = require('./asyncFs');

class Logger {
  constructor(baseLogDir, serviceName = 'Electron') {
    this.baseLogDir = baseLogDir;
    this.serviceName = serviceName;
    this.currentLogPath = null;
  }

  async ensureLogDir() {
    await asyncFs.ensureDir(this.baseLogDir);
  }

  _resolveLogPath() {
    if (!this.currentLogPath) {
      const currentTime = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      this.currentLogPath = path.join(this.baseLogDir, `XKAT-${currentTime}.log`);
    }
    return this.currentLogPath;
  }

  async log(message, level = 'INFO') {
    try {
      const timestamp = new Date().toISOString();
      const logEntry = `[${timestamp}] [${this.serviceName}] [${level}] ${message}\n`;
      const logPath = this._resolveLogPath();
      await asyncFs.appendFile(logPath, logEntry);
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
  }
}

module.exports = Logger;

// Aapt2Invoker: 封装 aapt2 子进程调用
// 职责: 1) 路径解析委托 pathHelper 2) ProcessRunner 执行 (无 shell 注入) 3) 错误分类 + 超时管理
// 设计: 构造注入 spawnFn/i18nService/timeoutMs/maxBuffer 便于单元测试; spawnFn 透传给 ProcessRunner
const pathHelper = require('../../utils/pathHelper');
const { ProcessRunner } = require('../spawnHelper');

const DEFAULT_MAX_BUFFER = 10 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 30000;

class Aapt2Invoker {
  constructor({ projectRoot, i18nService, spawnFn, timeoutMs, maxBuffer } = {}) {
    this._projectRoot = projectRoot;
    this._i18n = i18nService || null;
    this._runner = new ProcessRunner({ spawnFn });
    this._timeoutMs = timeoutMs != null ? timeoutMs : DEFAULT_TIMEOUT_MS;
    this._maxBuffer = maxBuffer != null ? maxBuffer : DEFAULT_MAX_BUFFER;
  }

  async resolvePath() {
    return pathHelper.getAapt2Path(this._projectRoot);
  }

  async dumpBadging(aapt2Path, apkPath) {
    const args = ['dump', 'badging', apkPath];
    const env = {
      LANG: 'en_US.UTF-8',
      LC_ALL: 'en_US.UTF-8',
    };

    const r = await this._runner.execute({
      command: aapt2Path,
      args,
      env,
      maxBuffer: this._maxBuffer,
      timeout: this._timeoutMs,
    });

    // spawn 同步抛错 / error 事件 (ENOENT/EACCES 等) → 走既有错误分类
    if (r.errorObject) {
      return this._classifySpawnError(r.errorObject);
    }
    // 超时
    if (r.timedOut) {
      return { success: false, error: this._t('main.commandTimeout') };
    }
    // stdout 超 maxBuffer (与原 proc.kill + parseFailed code:-1 一致)
    if (r.maxBufferExceeded) {
      return {
        success: false,
        error: this._t('apkErrors.parseFailed', { code: -1 }),
      };
    }
    // 正常退出
    if (r.code === 0) {
      return { success: true, output: r.stdout };
    }
    if (r.stderr && r.stderr.includes('ERROR:')) {
      return { success: false, error: this._t('apkErrors.fileCorrupted') };
    }
    return {
      success: false,
      error: this._t('apkErrors.parseFailed', { code: r.code }),
    };
  }

  _classifySpawnError(err) {
    const code = err && err.code;
    if (code === 'ENOENT') {
      return { success: false, error: this._t('apkErrors.aapt2NotFound') };
    }
    if (code === 'EACCES' || code === 'EPERM') {
      return { success: false, error: this._t('apkErrors.permissionDenied') };
    }
    return {
      success: false,
      error: this._t('apkErrors.parseFailed', { code: code || -1 }),
    };
  }

  _t(key, params) {
    if (!this._i18n) return key;
    if (typeof this._i18n.t === 'function') return this._i18n.t(key, params);
    return key;
  }
}

module.exports = Aapt2Invoker;

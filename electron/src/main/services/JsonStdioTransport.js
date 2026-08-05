const { spawn } = require('child_process');

/**
 * @typedef {Object} SpawnConfig
 * @property {string} command
 * @property {string[]} args
 * @property {string} [cwd]
 * @property {Object} [env]
 */
/**
 * @typedef {Object} RequestOptions
 * @property {number} [timeoutMs=60000]
 * @property {AbortSignal} [signal]
 */
/**
 * @typedef {Object} InspectorResponse
 * @property {boolean} success
 * @property {string} [error] - success=false 时附带, i18n key 或原始错误信息
 * @property {string} [session_id] - start-session 成功返回, Appium driver.session_id
 * @property {string} [screenshot] - get-screenshot/refresh 返回, data URI (data:image/png;base64,...)
 * @property {string} [source] - get-source/refresh 返回, XML page source 字符串
 * @property {Object} [elements] - get-source/refresh 返回, 解析后的根节点树对象
 * @property {Array<Object>} [locators] - find-locators 返回, locator dict 数组 (type/value/description)
 * @property {string} [warning] - start-session 端口冲突等非致命附带信息
 */
/**
 * @typedef {{type:string, payload?:Object, stage?:string}} InspectorNotification
 */

class JsonStdioTransport {
  /**
   * @param {SpawnConfig} spawnConfig
   * @param {Object} [deps]
   * @param {Function} [deps.spawn]  // 默认 require('child_process').spawn,测试可注入
   * @param {number} [deps.handshakeTimeoutMs=10000]
   * @param {number} [deps.defaultTimeoutMs=60000]
   */
  constructor(spawnConfig, deps = {}) {
    this._spawnConfig = spawnConfig;
    this._spawn = deps.spawn || spawn;
    this._handshakeTimeoutMs = deps.handshakeTimeoutMs || 10000;
    this._defaultTimeoutMs = deps.defaultTimeoutMs || 60000;

    this._process = null;
    this._buffer = '';
    this._pendingRequests = new Map();
    this._requestCounter = 0;
    this._notificationHandlers = new Set();
    this._exitHandlers = new Set();
    this._readyPromise = null;
    this._readyReject = null;
    this._disposed = false;
  }

  /** @returns {boolean} */
  isActive() {
    return this._process !== null && !this._disposed;
  }

  /**
   * 发 Request 等 Response。首调内部 spawn + 等 ready notification 握手。
   * @param {string} command
   * @param {Object} [params={}]
   * @param {RequestOptions} [opts={}]
   * @returns {Promise<InspectorResponse>}
   */
  async request(command, params = {}, opts = {}) {
    if (this._disposed) {
      throw new Error('Transport has been disposed');
    }

    // 首调:spawn + 等 ready 握手
    if (!this._process) {
      this._spawnProcess();
    }
    await this._waitForReady();

    return this._sendRequest(command, params, opts);
  }

  /**
   * 订阅 Notification。多 listener fan-out。
   * @param {(n:InspectorNotification)=>void} handler
   * @returns {()=>void}
   */
  onNotification(handler) {
    this._notificationHandlers.add(handler);
    return () => this._notificationHandlers.delete(handler);
  }

  /**
   * 订阅进程退出。默认:transport 自动 reject 所有 pending (无需注册)。
   * @param {(code:number|null, signal:string|null)=>void} handler
   * @returns {()=>void}
   */
  onExit(handler) {
    this._exitHandlers.add(handler);
    return () => this._exitHandlers.delete(handler);
  }

  /** 杀进程 + 清 pending。幂等。 */
  dispose() {
    if (this._disposed) return;
    this._disposed = true;

    if (this._process) {
      try { this._process.kill(); } catch (e) { /* ignore */ }
    }

    this._rejectAllPending('Transport disposed');
    if (this._readyReject) {
      this._readyReject(new Error('Transport disposed'));
    }

    this._process = null;
    this._buffer = '';
  }

  // ---- 内部实现 ----

  _spawnProcess() {
    const { command, args, cwd, env } = this._spawnConfig;
    this._process = this._spawn(command, args, {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf8',
      windowsHide: true,
    });

    this._process.stdout.on('data', (data) => this._handleStdoutData(data));
    this._process.stderr.on('data', (data) => {
      console.error('[JsonStdioTransport] stderr:', data.toString('utf8'));
    });
    this._process.on('close', (code, signal) => this._handleProcessExit(code, signal));
    this._process.on('error', (err) => {
      console.error('[JsonStdioTransport] process error:', err);
      this._handleProcessExit(null, null);
    });
  }

  _waitForReady() {
    if (!this._readyPromise) {
      this._readyPromise = new Promise((resolve, reject) => {
        this._readyResolve = resolve;
        this._readyReject = reject;
        // M4 修复: 握手超时兜底 - 超时后杀进程 + dispose, 避免进程泄漏
        const timeout = setTimeout(() => {
          if (this._readyReject) {
            this._readyReject(new Error(`Handshake timeout after ${this._handshakeTimeoutMs}ms`));
            // 超时后清理进程, 避免泄漏 (与 dispose 一致, 但不设 _disposed 标志, 允许后续重试)
            if (this._process) {
              try { this._process.kill(); } catch (e) { /* ignore */ }
              this._process = null;
            }
            this._buffer = '';
            this._readyPromise = null;
            this._readyResolve = null;
            this._readyReject = null;
          }
        }, this._handshakeTimeoutMs);
        this._readyTimeout = timeout;
      });
    }
    return this._readyPromise;
  }

  _sendRequest(command, params, opts) {
    return new Promise((resolve, reject) => {
      if (!this._process || !this._process.stdin.writable) {
        reject(new Error('Inspector process is not running'));
        return;
      }

      const requestId = ++this._requestCounter;
      const payload = JSON.stringify({ kind: 'request', id: requestId, command, params });
      const timeoutMs = opts.timeoutMs || this._defaultTimeoutMs;

      const timeout = setTimeout(() => {
        this._pendingRequests.delete(requestId);
        reject(new Error(`Command '${command}' timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this._pendingRequests.set(requestId, { resolve, reject, timeout });

      try {
        this._process.stdin.write(payload + '\n');
      } catch (error) {
        clearTimeout(timeout);
        this._pendingRequests.delete(requestId);
        reject(new Error(`Failed to send command '${command}': ${error.message}`));
      }
    });
  }

  _handleStdoutData(data) {
    this._buffer += data.toString('utf8');
    const lines = this._buffer.split('\n');
    this._buffer = lines.pop();

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      this._handleFrame(trimmed);
    }
  }

  _handleFrame(line) {
    let frame;
    try {
      frame = JSON.parse(line);
    } catch (e) {
      console.error('[JsonStdioTransport] Failed to parse stdout line:', line);
      return;
    }

    if (frame.kind === 'notification') {
      this._handleNotification(frame);
    } else if (frame.kind === 'response') {
      this._handleResponse(frame);
    } else {
      console.error('[JsonStdioTransport] Unknown frame kind:', frame.kind);
    }
  }

  _handleNotification(frame) {
    if (frame.type === 'ready') {
      if (this._readyResolve) {
        clearTimeout(this._readyTimeout);
        this._readyResolve();
        this._readyResolve = null;
        this._readyReject = null;
      }
      return;
    }
    // 其他 notification (progress 等) 转发给订阅者
    const notification = { type: frame.type, payload: frame, stage: frame.stage };
    this._notificationHandlers.forEach(h => {
      try { h(notification); } catch (e) { /* ignore */ }
    });
  }

  _handleResponse(frame) {
    const pending = this._pendingRequests.get(frame.id);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this._pendingRequests.delete(frame.id);
    pending.resolve(frame);
  }

  _handleProcessExit(code, signal) {
    this._rejectAllPending(`Inspector process exited (code: ${code}, signal: ${signal})`);
    if (this._readyReject) {
      clearTimeout(this._readyTimeout);
      this._readyReject(new Error(`Inspector process exited before ready (code: ${code}, signal: ${signal})`));
    }
    this._process = null;
    this._buffer = '';
    this._exitHandlers.forEach(h => {
      try { h(code, signal); } catch (e) { /* ignore */ }
    });
  }

  _rejectAllPending(reason) {
    for (const [id, pending] of this._pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(reason));
    }
    this._pendingRequests.clear();
  }
}

module.exports = { JsonStdioTransport };

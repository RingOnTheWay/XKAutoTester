// spawn 通过懒 require 获取 (executeCommand / ProcessRunner._getSpawn 均懒加载),
// 便于测试通过 Module._load mock child_process 模块

/**
 * 执行命令并返回结果 (Promise 包装)
 *
 * 强制 windowsHide: true (避免弹出控制台窗口), 合并 process.env + options.env
 *
 * @param {string} command - 命令 (如 'python', 'where', 'reg.exe')
 * @param {string[]} [args=[]] - 参数数组
 * @param {Object} [options={}] - spawn 选项 (env / cwd 等)
 * @returns {Promise<{code: number, stdout: string, stderr: string}>}
 */
async function executeCommand(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    // 懒 require: 测试通过 Module._load mock child_process 时能生效 (与 ProcessRunner 一致)
    const { spawn: spawnFn } = require('child_process');
    const proc = spawnFn(command, args, {
      ...options,
      windowsHide: true,
      env: { ...process.env, ...(options.env || {}) },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      resolve({
        code,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    });

    proc.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * 通用子进程执行器 — 归一项目内 "spawn + stdout/stderr 累积 + close/error + timeout/maxBuffer + settled 守护" 样板.
 *
 * 设计目标:
 *  - 消除 Aapt2Invoker / AdbCommandExecutor / AllureCliInvoker / ApkInstaller 等多处重复 spawn 样板
 *  - 统一 windowsHide: true + env 合并 + settled 守护
 *  - 通过 onStdout / onStderr 流式回调支持进度回调场景 (chunk: string, 不含累积 buffer)
 *  - timeout / maxBuffer 触发时自动 kill 并返回带 timedOut / maxBufferExceeded 标记的结果
 *  - error 事件 (ENOENT/EACCES 等) 返回 errorObject 字段供调用方做错误分类 (如 Aapt2Invoker._classifySpawnError)
 *  - 不吞错误: 与 executeCommand 不同, execute 不 reject, 全部 resolve (与既有调用方一致 — 它们也是 resolve 失败结果)
 *
 * 返回值约定:
 *  - close 正常退出: { code, stdout, stderr }
 *  - error 事件:    { code: -1, stdout, stderr, error: err.message, errorObject: err }
 *  - timeout:       { code: -1, stdout, stderr, error: 'timeout', timedOut: true }
 *  - maxBuffer:     { code: -1, stdout, stderr, error: 'maxBuffer', maxBufferExceeded: true }
 *  - spawn 同步抛错: { code: -1, stdout: '', stderr: '', error: err.message, errorObject: err }
 *
 * 注: stdout/stderr 累积由 runner 自动维护; 调用方若需要原始 chunk (如进度正则解析) 可用 onStdout/onStderr.
 *     maxBuffer 仅限制 stdout (与 Aapt2Invoker 既有行为一致).
 */
class ProcessRunner {
  /**
   * @param {Object} [deps={}]
   * @param {Function} [deps.spawnFn] - spawn 函数 (默认 child_process.spawn, 测试可注入)
   */
  constructor({ spawnFn } = {}) {
    // 存储 spawnFn, 不在构造期 resolve: 测试通过 Module._load mock child_process 时,
    // 懒 require 能在 execute() 调用时拿到 mock (spawnHelper 模块缓存不阻碍 mock)
    this._spawnFn = spawnFn;
  }

  /** 解析 spawn 函数: 注入优先, 否则懒 require child_process.spawn */
  _getSpawn() {
    return this._spawnFn || require('child_process').spawn;
  }

  /**
   * 执行命令并返回结果.
   *
   * @param {Object} params
   * @param {string} params.command - 命令路径
   * @param {string[]} [params.args=[]] - 参数数组
   * @param {Object} [params.options={}] - spawn 选项 (会与 windowsHide: true / env 合并)
   * @param {Function} [params.onStdout] - stdout chunk 回调 (chunk: string)
   * @param {Function} [params.onStderr] - stderr chunk 回调 (chunk: string)
   * @param {number} [params.timeout=0] - 超时毫秒 (0 = 不超时)
   * @param {number} [params.maxBuffer=0] - stdout 字节上限 (0 = 不限制)
   * @param {string} [params.cwd] - 工作目录 (覆盖 options.cwd)
   * @param {Object} [params.env] - 环境变量 (与 process.env + options.env 合并)
   * @returns {Promise<{code: number, stdout: string, stderr: string, error?: string, errorObject?: Error, timedOut?: boolean, maxBufferExceeded?: boolean}>}
   */
  execute({ command, args = [], options = {}, onStdout, onStderr, timeout = 0, maxBuffer = 0, cwd, env } = {}) {
    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let settled = false;
      let timer = null;

      const finish = (result) => {
        if (settled) return;
        settled = true;
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        resolve(result);
      };

      const spawnOpts = {
        ...options,
        windowsHide: true,
        env: { ...process.env, ...(options.env || {}), ...(env || {}) },
      };
      if (cwd) spawnOpts.cwd = cwd;
      // maxBuffer 透传到 spawnOpts (Node spawn 原生不限制, 但保留字段供测试断言 + 调用方观察)
      if (maxBuffer > 0) spawnOpts.maxBuffer = maxBuffer;

      let proc;
      try {
        proc = this._getSpawn()(command, args, spawnOpts);
      } catch (err) {
        finish({ code: -1, stdout: '', stderr: '', error: err && err.message, errorObject: err });
        return;
      }

      if (!proc) {
        finish({ code: -1, stdout: '', stderr: '', error: 'spawn returned null' });
        return;
      }

      proc.stdout.on('data', (chunk) => {
        const text = chunk.toString();
        stdout += text;
        if (typeof onStdout === 'function') {
          try { onStdout(text); } catch { /* 回调失败不影响主流程 */ }
        }
        if (maxBuffer > 0 && stdout.length > maxBuffer) {
          try { proc.kill(); } catch { /* noop */ }
          finish({ code: -1, stdout, stderr, error: 'maxBuffer', maxBufferExceeded: true });
        }
      });

      proc.stderr.on('data', (chunk) => {
        const text = chunk.toString();
        stderr += text;
        if (typeof onStderr === 'function') {
          try { onStderr(text); } catch { /* 回调失败不影响主流程 */ }
        }
      });

      proc.on('close', (code) => {
        finish({ code, stdout, stderr });
      });

      proc.on('error', (err) => {
        finish({ code: -1, stdout, stderr, error: err && err.message, errorObject: err });
      });

      if (timeout > 0) {
        timer = setTimeout(() => {
          try { proc.kill(); } catch { /* noop */ }
          finish({ code: -1, stdout, stderr, error: 'timeout', timedOut: true });
        }, timeout);
      }
    });
  }
}

module.exports = { executeCommand, ProcessRunner };

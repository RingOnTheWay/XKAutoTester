// Service mock 工厂 - 生成带调用记录的 service stub
// 支持: 预设返回值、异步方法、调用记录查询

/**
 * 创建 service mock
 * @param {Object} methodReturns - { methodName: returnValue | (...args) => returnValue }
 * @returns {Object} mock service，带 __calls (调用记录) 和 __reset (重置) 元方法
 *
 * @example
 * const svc = createServiceMock({
 *   getTestPlans: { success: true, data: [{ id: 1, name: 'plan1' }] },
 *   saveTestPlan: (data) => ({ success: true, id: data.id }),
 * });
 * await svc.getTestPlans();
 * svc.__calls.getTestPlans.length === 1;
 */
function createServiceMock(methodReturns = {}) {
  const calls = {};

  const mock = {};
  for (const [method, ret] of Object.entries(methodReturns)) {
    calls[method] = [];
    mock[method] = async (...args) => {
      calls[method].push(args);
      return typeof ret === 'function' ? await ret(...args) : ret;
    };
  }

  // 元方法
  Object.defineProperty(mock, '__calls', {
    value: calls,
    enumerable: false,
    writable: false,
  });

  Object.defineProperty(mock, '__reset', {
    value: () => {
      Object.keys(calls).forEach(k => { calls[k].length = 0; });
    },
    enumerable: false,
    writable: false,
  });

  return mock;
}

/**
 * 创建组合 service 容器 (模拟 index.js 的 services 对象)
 * @param {Object} serviceSpec - { serviceName: { methodName: returnValue } }
 * @returns {Object} services 容器，每个 service 都是 mock
 *
 * @example
 * const services = createServiceContainer({
 *   testPlanService: { getTestPlans: { success: true, data: [] } },
 *   pythonTestService: { run: { success: true } },
 * });
 */
function createServiceContainer(serviceSpec = {}) {
  const services = {};
  for (const [name, methods] of Object.entries(serviceSpec)) {
    services[name] = createServiceMock(methods);
  }
  return services;
}


// ── child_process mock 工厂 ─────────────────────────────────

/**
 * 创建 spawn mock
 *
 * mock 进程对象支持:
 * - stdout.on('data', cb) / stderr.on('data', cb)
 * - on('close', cb) / on('error', cb)
 * - kill() / stdin.write()
 *
 * @param {Object} options - { stdout: string|Buffer, stderr: string|Buffer, code: number, autoClose: boolean }
 * @param {boolean} autoClose - 是否自动触发 close 事件 (默认 true,通过 emitClose 可手动控制)
 * @returns {Function} spawn mock 函数,带 .instance (最近一次创建的进程 mock)
 *
 * @example
 * const spawnMock = createSpawnMock({ stdout: 'device list\n', code: 0 });
 * // 拦截 child_process.spawn
 * const restore = setupChildProcessMock({ spawn: spawnMock });
 * // ... 测试代码 ...
 * restore();
 */
function createSpawnMock(options = {}) {
  const {
    stdout = '',
    stderr = '',
    code = 0,
    autoClose = true,
    delay = 0,
  } = options;

  let lastInstance = null;

  const mockFn = function (cmd, args, opts) {
    const handlers = { data: [], close: [], error: [] };
    const stderrHandlers = { data: [], close: [], error: [] };
    const stdinHandlers = { data: [], end: [] };

    const proc = {
      stdout: {
        on: (evt, cb) => { if (evt === 'data') handlers.data.push(cb); },
        pipe: () => {},
      },
      stderr: {
        on: (evt, cb) => { if (evt === 'data') stderrHandlers.data.push(cb); },
      },
      stdin: {
        on: (evt, cb) => { if (evt === 'data') stdinHandlers.data.push(cb); },
        write: () => {},
        end: () => {},
      },
      on: (evt, cb) => {
        if (evt === 'close') handlers.close.push(cb);
        else if (evt === 'error') handlers.error.push(cb);
      },
      kill: () => {},
      pid: 12345,
      // 测试辅助: 手动触发事件
      _emit: (evt, payload) => {
        if (evt === 'data') handlers.data.forEach(cb => cb(Buffer.from(payload)));
        else if (evt === 'close') handlers.close.forEach(cb => cb(payload));
        else if (evt === 'error') handlers.error.forEach(cb => cb(payload));
      },
      _emitStderr: (payload) => {
        stderrHandlers.data.forEach(cb => cb(Buffer.from(payload)));
      },
    };

    lastInstance = proc;

    // 自动触发事件
    if (autoClose) {
      const emitAll = () => {
        if (stdout) handlers.data.forEach(cb => cb(Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout)));
        if (stderr) stderrHandlers.data.forEach(cb => cb(Buffer.isBuffer(stderr) ? stderr : Buffer.from(stderr)));
        handlers.close.forEach(cb => cb(code));
      };
      if (delay > 0) {
        setTimeout(emitAll, delay);
      } else {
        emitAll();
      }
    }

    return proc;
  };

  Object.defineProperty(mockFn, 'instance', {
    get: () => lastInstance,
    enumerable: false,
  });

  return mockFn;
}

/**
 * 创建 exec mock
 *
 * @param {string} stdout - 默认 stdout
 * @param {string} stderr - 默认 stderr
 * @param {number|null} error - 非 null 时回调接收 Error
 * @returns {Function} exec mock 函数
 *
 * @example
 * const execMock = createExecMock('device list\n', '', null);
 * const restore = setupChildProcessMock({ exec: execMock });
 */
function createExecMock(stdout = '', stderr = '', error = null) {
  return function (cmd, opts, cb) {
    // 兼容 exec(cmd, cb) 和 exec(cmd, opts, cb) 两种签名
    if (typeof opts === 'function') {
      cb = opts;
      opts = {};
    }
    // 异步回调 (模拟真实 exec 行为)
    setImmediate(() => {
      cb(error, stdout, stderr);
    });
  };
}

/**
 * 拦截 child_process 模块,注入 spawn/exec mock
 *
 * 必须在 require service 之前调用 (因为 service 在 require 时解构 spawn/exec)
 *
 * @param {Object} mocks - { spawn?: Function, exec?: Function, execSync?: Function }
 * @returns {Function} restore 函数,调用后恢复原始 child_process
 *
 * @example
 * const restore = setupChildProcessMock({
 *   spawn: createSpawnMock({ stdout: '...', code: 0 }),
 *   exec: createExecMock('output', '', null),
 * });
 * const ADBService = require('.../ADBService.js');
 * // ... 测试 ...
 * restore();
 */
function setupChildProcessMock(mocks = {}) {
  const Module = require('module');
  const origLoad = Module._load;

  const mockCp = {
    spawn: mocks.spawn || function () { return { on: () => {}, stdout: { on: () => {} }, stderr: { on: () => {} }, kill: () => {} }; },
    exec: mocks.exec || function (cmd, opts, cb) { if (typeof opts === 'function') cb = opts; cb(null, '', ''); },
    execSync: mocks.execSync || function () { return ''; },
    fork: mocks.fork || function () { return { on: () => {}, send: () => {}, kill: () => {} }; },
  };

  Module._load = function (request, parent, isMain) {
    if (request === 'child_process') return mockCp;
    return origLoad.call(this, request, parent, isMain);
  };

  return () => { Module._load = origLoad; };
}

module.exports = { createServiceMock, createServiceContainer, createSpawnMock, createExecMock, setupChildProcessMock };

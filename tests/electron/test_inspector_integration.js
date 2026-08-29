// Inspector 集成测试: InspectorService + JsonStdioTransport + mock Python proto 往返
// 验证: 6 命令 (start-session/get-screenshot/get-source/find-locators/refresh/stop-session)
//      端到端往返 + ready 握手 + progress 通知分流 + stop-session 后进程清理
//
// 策略: mock child_process.spawn 为 Python proto 模拟器 (发 ready + 解析 request + 发 response)
//       mock pathHelper 返回有效 pythonConfig,使 InspectorService._buildSpawnConfig 不报错
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const Module = require('module');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const INSPECTOR_SERVICE_PATH = path.join(
  PROJECT_ROOT, 'electron', 'src', 'main', 'services', 'InspectorService.js'
);

function loadInspectorService(spawnSimulator) {
  delete require.cache[require.resolve(INSPECTOR_SERVICE_PATH)];
  delete require.cache[require.resolve(path.join(PROJECT_ROOT, 'electron', 'src', 'main', 'services', 'JsonStdioTransport.js'))];

  const origLoad = Module._load;

  // mock pathHelper + child_process
  Module._load = function (request, parent, isMain) {
    if (request === 'child_process') {
      return { spawn: spawnSimulator };
    }
    // 拦截 pathHelper (相对路径,InspectorService 用 ../utils/pathHelper)
    if (request === '../utils/pathHelper' || request === './pathHelper' ||
        request.endsWith('/utils/pathHelper') || request.endsWith('\\utils\\pathHelper')) {
      return {
        getPythonConfig: () => ({
          pythonPath: 'python',
          isSystem: true,
          isEmbedded: false,
          sitePackagesPath: '',
        }),
        getLocalesPath: () => '/fake/locales',
        getAdbPath: () => '/fake/adb',
      };
    }
    return origLoad.call(this, request, parent, isMain);
  };

  try {
    return require(INSPECTOR_SERVICE_PATH);
  } finally {
    Module._load = origLoad;
  }
}

// Python proto 模拟器: 模拟 StdioProtocol.run() 行为
// - spawn 后立即发 ready notification
// - stdin 收到 request 帧 -> 解析 command -> 发 progress (仅 start-session) + response
// - stop-session 后发 close 事件
function createPythonProtoSimulator(commandHandlers = {}) {
  const calls = [];
  let procRef = null;

  const spawnMock = function (cmd, args, options) {
    calls.push({ cmd, args, options });
    const stdoutCbs = [];
    const stderrCbs = [];
    const closeCbs = [];
    const errorCbs = [];
    const stdinWrites = [];

    const proc = {
      stdout: { on: (evt, cb) => { if (evt === 'data') stdoutCbs.push(cb); } },
      stderr: { on: (evt, cb) => { if (evt === 'data') stderrCbs.push(cb); } },
      on: (evt, cb) => {
        if (evt === 'close') closeCbs.push(cb);
        else if (evt === 'error') errorCbs.push(cb);
      },
      kill: () => {},
      stdin: {
        writable: true,
        write: (data) => {
          stdinWrites.push(data);
          // 解析 request 帧,下一 tick 发 response (handler 可返回 Promise 模拟慢响应)
          const frame = JSON.parse(data.toString());
          setImmediate(() => {
            const handler = commandHandlers[frame.command];
            if (handler) {
              Promise.resolve(handler(frame.params, frame.id)).then((result) => {
                if (!result) return;
                // 发 progress 通知 (如果有)
                if (result.notifications) {
                  for (const n of result.notifications) {
                    stdoutCbs.forEach(cb => cb(Buffer.from(JSON.stringify(
                      { kind: 'notification', type: 'progress', stage: n }
                    ) + '\n')));
                  }
                }
                // 发 response
                const response = { kind: 'response', id: frame.id, ...result.response };
                stdoutCbs.forEach(cb => cb(Buffer.from(JSON.stringify(response) + '\n')));
                // stop-session 后发 close
                if (frame.command === 'stop-session') {
                  setImmediate(() => {
                    closeCbs.forEach(cb => cb(0, null));
                  });
                }
              });
            }
          });
          return true;
        },
      },
    };

    procRef = {
      proc,
      emitReady: () => stdoutCbs.forEach(cb => cb(Buffer.from(JSON.stringify(
        { kind: 'notification', type: 'ready' }
      ) + '\n'))),
      emitClose: (code, signal) => closeCbs.forEach(cb => cb(code, signal)),
      stdinWrites,
    };

    // spawn 后立即发 ready (模拟 StdioProtocol.run() 入口)
    setImmediate(() => procRef.emitReady());

    return proc;
  };

  spawnMock.calls = calls;
  spawnMock.getProc = () => procRef;
  return spawnMock;
}

// 模拟 i18nService
function createI18nMock() {
  return {
    getLanguage: () => 'zh-CN',
    t: (key) => key,
  };
}

// ===== 测试 1: start-session 往返 + progress 通知分流 =====
test('start-session round-trip with progress notifications', async () => {
  const simulator = createPythonProtoSimulator({
    'start-session': (params) => ({
      notifications: ['appium-starting', 'session-creating', 'session-created'],
      response: { success: true, session_id: 'test-session-1' },
    }),
  });
  const InspectorService = loadInspectorService(simulator);
  const service = new InspectorService(PROJECT_ROOT, createI18nMock(), '/fake/userdata');

  const progressStages = [];
  service.setProgressCallback((stage) => progressStages.push(stage));

  const res = await service.startSession('device1', 'com.example', '.MainActivity', '11', true);

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.session_id, 'test-session-1');
  assert.strictEqual(service.activeSessionId, 'test-session-1');
  // 验证 progress 通知分流
  assert.deepStrictEqual(progressStages, ['appium-starting', 'session-creating', 'session-created']);
});

// ===== 测试 2: get-screenshot 往返 =====
test('get-screenshot round-trip', async () => {
  const simulator = createPythonProtoSimulator({
    'start-session': () => ({ response: { success: true, session_id: 's1' } }),
    'get-screenshot': () => ({ response: { success: true, screenshot: 'data:image/png;base64,abc' } }),
  });
  const InspectorService = loadInspectorService(simulator);
  const service = new InspectorService(PROJECT_ROOT, createI18nMock(), '/fake/userdata');

  await service.startSession('d1', 'com.x', '.Main');
  const res = await service.getScreenshot();

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.screenshot, 'data:image/png;base64,abc');
});

// ===== 测试 3: get-source 往返 =====
test('get-source round-trip', async () => {
  const simulator = createPythonProtoSimulator({
    'start-session': () => ({ response: { success: true, session_id: 's1' } }),
    'get-source': () => ({ response: { success: true, source: '<hierarchy/>', elements: { tagName: 'hierarchy' } } }),
  });
  const InspectorService = loadInspectorService(simulator);
  const service = new InspectorService(PROJECT_ROOT, createI18nMock(), '/fake/userdata');

  await service.startSession('d1', 'com.x', '.Main');
  const res = await service.getPageSource();

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.source, '<hierarchy/>');
  assert.strictEqual(res.elements.tagName, 'hierarchy');
});

// ===== 测试 4: find-locators 往返 =====
test('find-locators round-trip', async () => {
  const simulator = createPythonProtoSimulator({
    'start-session': () => ({ response: { success: true, session_id: 's1' } }),
    'find-locators': (params) => ({
      response: { success: true, locators: [{ type: 'id', value: 'btn1', description: 'Resource ID: btn1' }] },
    }),
  });
  const InspectorService = loadInspectorService(simulator);
  const service = new InspectorService(PROJECT_ROOT, createI18nMock(), '/fake/userdata');

  await service.startSession('d1', 'com.x', '.Main');
  const res = await service.findElementLocators('0.1.2');

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.locators.length, 1);
  assert.strictEqual(res.locators[0].type, 'id');
  assert.strictEqual(res.locators[0].value, 'btn1');
});

// ===== 测试 5: refresh 往返 =====
test('refresh round-trip', async () => {
  const simulator = createPythonProtoSimulator({
    'start-session': () => ({ response: { success: true, session_id: 's1' } }),
    'refresh': () => ({
      response: { success: true, screenshot: 'data:image/png;base64,refreshed', source: '<hierarchy/>', elements: {} },
    }),
  });
  const InspectorService = loadInspectorService(simulator);
  const service = new InspectorService(PROJECT_ROOT, createI18nMock(), '/fake/userdata');

  await service.startSession('d1', 'com.x', '.Main');
  const res = await service.refreshSession();

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.screenshot, 'data:image/png;base64,refreshed');
});

// ===== 测试 6: stop-session 往返 + 进程清理 =====
test('stop-session round-trip and cleanup', async () => {
  const simulator = createPythonProtoSimulator({
    'start-session': () => ({ response: { success: true, session_id: 's1' } }),
    'stop-session': () => ({ response: { success: true } }),
  });
  const InspectorService = loadInspectorService(simulator);
  const service = new InspectorService(PROJECT_ROOT, createI18nMock(), '/fake/userdata');

  await service.startSession('d1', 'com.x', '.Main');
  assert.strictEqual(service.activeSessionId, 's1');

  const res = await service.stopSession();

  assert.strictEqual(res.success, true);
  // stop-session 后 activeSessionId 应清空 (cleanup 调 dispose)
  assert.strictEqual(service.activeSessionId, null);
});

// ===== 测试 7: 6 命令完整往返序列 =====
test('full 6-command sequence round-trip', async () => {
  const simulator = createPythonProtoSimulator({
    'start-session': () => ({
      notifications: ['appium-starting'],
      response: { success: true, session_id: 'seq-1' },
    }),
    'get-screenshot': () => ({ response: { success: true, screenshot: 'shot1' } }),
    'get-source': () => ({ response: { success: true, source: '<xml/>', elements: {} } }),
    'find-locators': () => ({ response: { success: true, locators: [{ type: 'id', value: 'v' }] } }),
    'refresh': () => ({ response: { success: true, screenshot: 'shot2', source: '<xml2/>', elements: {} } }),
    'stop-session': () => ({ response: { success: true } }),
  });
  const InspectorService = loadInspectorService(simulator);
  const service = new InspectorService(PROJECT_ROOT, createI18nMock(), '/fake/userdata');

  // 完整序列: start -> screenshot -> source -> find-locators -> refresh -> stop
  const r1 = await service.startSession('d', 'com.x', '.Main');
  assert.strictEqual(r1.success, true);

  const r2 = await service.getScreenshot();
  assert.strictEqual(r2.screenshot, 'shot1');

  const r3 = await service.getPageSource();
  assert.strictEqual(r3.source, '<xml/>');

  const r4 = await service.findElementLocators('0');
  assert.strictEqual(r4.locators[0].value, 'v');

  const r5 = await service.refreshSession();
  assert.strictEqual(r5.screenshot, 'shot2');

  const r6 = await service.stopSession();
  assert.strictEqual(r6.success, true);
});

// ===== 测试 8: 无 active session 时 getScreenshot 返回错误 =====
test('getScreenshot without active session returns error', async () => {
  const simulator = createPythonProtoSimulator({});
  const InspectorService = loadInspectorService(simulator);
  const service = new InspectorService(PROJECT_ROOT, createI18nMock(), '/fake/userdata');

  const res = await service.getScreenshot();
  assert.strictEqual(res.success, false);
  assert.match(res.error, /No active inspector session/);
});

// ===== 测试 9: 并发 stopSession 串行化 (关闭窗口 + 重开竞态) =====
test('concurrent stopSession calls are serialized (single stop-session request)', async () => {
  let stopRequests = 0;
  const simulator = createPythonProtoSimulator({
    'start-session': () => ({ response: { success: true, session_id: 's1' } }),
    'stop-session': () => {
      stopRequests += 1;
      return { response: { success: true } };
    },
  });
  const InspectorService = loadInspectorService(simulator);
  const service = new InspectorService(PROJECT_ROOT, createI18nMock(), '/fake/userdata');

  await service.startSession('d1', 'com.x', '.Main');
  // 渲染端 close() 不 await + 重开窗口 startSession 会再次触发 stopSession → 并发
  const [r1, r2] = await Promise.all([service.stopSession(), service.stopSession()]);

  assert.strictEqual(r1.success, true);
  assert.strictEqual(r2.success, true);
  // 串行锁: 只发一次 stop-session 请求, 避免并发写 stdin 协议错乱
  assert.strictEqual(stopRequests, 1);
});

// ===== 测试 10: startSession 等待进行中的 stopSession 完成 =====
test('startSession waits for in-flight stopSession before creating new session', async () => {
  let resolveStop;
  const stopGate = new Promise(r => { resolveStop = r; });
  let stopRequests = 0;
  let startRequests = 0;
  const simulator = createPythonProtoSimulator({
    'start-session': () => {
      startRequests += 1;
      return { response: { success: true, session_id: `s${startRequests}` } };
    },
    'stop-session': () => {
      stopRequests += 1;
      return stopGate.then(() => ({ response: { success: true } }));
    },
  });
  const InspectorService = loadInspectorService(simulator);
  const service = new InspectorService(PROJECT_ROOT, createI18nMock(), '/fake/userdata');

  await service.startSession('d1', 'com.x', '.Main');
  // 触发 stopSession (close 路径, 不 await), 随后立即 startSession (重开路径)
  const stopPromise = service.stopSession();
  const startPromise = service.startSession('d2', 'com.y', '.Main2');
  // 先让 stop 完成, 再放行 start
  // R24: 固定 20ms → 条件等待 stop-session 请求发出 (CI 慢机器不 flaky)
  const deadline = Date.now() + 1000;
  while (stopRequests < 1) {
    if (Date.now() > deadline) throw new Error('等待 stop-session 请求超时');
    await new Promise((r) => setTimeout(r, 5));
  }
  assert.strictEqual(stopRequests, 1, 'stop-session 应只请求一次');
  resolveStop();
  await stopPromise;
  const startRes = await startPromise;

  assert.strictEqual(startRes.success, true);
  assert.strictEqual(startRequests, 2, 'stop 完成后应成功创建新 session');
});


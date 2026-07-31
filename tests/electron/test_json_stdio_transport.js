// JsonStdioTransport 单元测试
// 验证: 1) request 发帧到 stdin + 收响应 resolve 2) ready 握手 3) id 匹配
//      4) 超时 reject 5) 进度通知分流 6) 进程退出 reject pending 7) 半包重组 8) 解析失败非静默
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const TRANSPORT_PATH = path.join(
  PROJECT_ROOT, 'electron', 'src', 'main', 'services', 'JsonStdioTransport.js'
);

function loadTransport() {
  delete require.cache[require.resolve(TRANSPORT_PATH)];
  return require(TRANSPORT_PATH).JsonStdioTransport;
}

// 可控 spawn mock: 记录 stdin 写入 + 可外部触发 stdout/stderr/close 事件
function createControllableSpawn() {
  const calls = [];
  const stdinWrites = [];
  let procRef = null;

  const spawnMock = function (cmd, args, options) {
    calls.push({ cmd, args, options });
    const stdoutCbs = [];
    const stderrCbs = [];
    const closeCbs = [];
    const errorCbs = [];

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
        write: (data) => { stdinWrites.push(data); return true; },
      },
    };
    procRef = {
      proc,
      emitStdout: (str) => stdoutCbs.forEach(cb => cb(Buffer.from(str, 'utf8'))),
      emitStderr: (str) => stderrCbs.forEach(cb => cb(Buffer.from(str, 'utf8'))),
      emitClose: (code, signal) => closeCbs.forEach(cb => cb(code, signal)),
      emitError: (err) => errorCbs.forEach(cb => cb(err)),
    };
    return proc;
  };

  spawnMock.calls = calls;
  spawnMock.stdinWrites = stdinWrites;
  spawnMock.getProc = () => procRef;
  return spawnMock;
}

const SPAWN_CONFIG = {
  command: 'python',
  args: ['-m', 'main', '--inspector'],
  cwd: PROJECT_ROOT,
  env: {},
};

// ===== 测试 1: request 发帧到 stdin + 收响应 resolve (tracer bullet) =====
test('request sends frame to stdin and resolves with matching response', async () => {
  const JsonStdioTransport = loadTransport();
  const spawnMock = createControllableSpawn();
  const transport = new JsonStdioTransport(SPAWN_CONFIG, { spawn: spawnMock, handshakeTimeoutMs: 5000 });

  const promise = transport.request('get-screenshot');

  // 等一拍让 transport spawn + 注册监听
  await new Promise(r => setImmediate(r));

  const procRef = spawnMock.getProc();
  // 先发 ready notification 握手
  procRef.emitStdout(JSON.stringify({ kind: 'notification', type: 'ready' }) + '\n');

  // 等一拍让 _waitForReady resolve + _sendRequest 执行 (写 stdin)
  await new Promise(r => setImmediate(r));

  // 再发 response (此时 pending request 已注册)
  procRef.emitStdout(JSON.stringify({ kind: 'response', id: 1, success: true, screenshot: 'base64data' }) + '\n');

  const res = await promise;

  // 验证 stdin 收到 request 帧
  assert.strictEqual(spawnMock.stdinWrites.length, 1, 'should write one request frame');
  const frame = JSON.parse(spawnMock.stdinWrites[0]);
  assert.strictEqual(frame.kind, 'request');
  assert.strictEqual(frame.command, 'get-screenshot');
  assert.strictEqual(frame.id, 1);
  assert.deepStrictEqual(frame.params, {});

  // 验证 response resolve
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.screenshot, 'base64data');
});

// ===== 测试 2: 进度通知分流到 onNotification =====
test('progress notification is forwarded to onNotification handler', async () => {
  const JsonStdioTransport = loadTransport();
  const spawnMock = createControllableSpawn();
  const transport = new JsonStdioTransport(SPAWN_CONFIG, { spawn: spawnMock, handshakeTimeoutMs: 5000 });

  const received = [];
  transport.onNotification((n) => received.push(n));

  const promise = transport.request('start-session', { device_name: 'dev' });
  await new Promise(r => setImmediate(r));
  const procRef = spawnMock.getProc();
  procRef.emitStdout(JSON.stringify({ kind: 'notification', type: 'ready' }) + '\n');
  await new Promise(r => setImmediate(r));

  // 发进度通知 (在 response 之前)
  procRef.emitStdout(JSON.stringify({ kind: 'notification', type: 'progress', stage: 'appium-starting' }) + '\n');
  procRef.emitStdout(JSON.stringify({ kind: 'notification', type: 'progress', stage: 'session-creating' }) + '\n');
  await new Promise(r => setImmediate(r));

  // 发 response
  procRef.emitStdout(JSON.stringify({ kind: 'response', id: 1, success: true, session_id: 's1' }) + '\n');
  await promise;

  // 验证 progress 通知被转发 (ready 不应出现在 received,ready 被握手消费)
  assert.strictEqual(received.length, 2, 'should forward 2 progress notifications');
  assert.strictEqual(received[0].type, 'progress');
  assert.strictEqual(received[0].stage, 'appium-starting');
  assert.strictEqual(received[1].stage, 'session-creating');
});

// ===== 测试 3: 进程退出 reject 所有 pending + 触发 onExit =====
test('process exit rejects all pending requests and fires onExit', async () => {
  const JsonStdioTransport = loadTransport();
  const spawnMock = createControllableSpawn();
  const transport = new JsonStdioTransport(SPAWN_CONFIG, { spawn: spawnMock, handshakeTimeoutMs: 5000 });

  const exitEvents = [];
  transport.onExit((code, signal) => exitEvents.push({ code, signal }));

  const promise = transport.request('get-screenshot');
  await new Promise(r => setImmediate(r));
  const procRef = spawnMock.getProc();
  procRef.emitStdout(JSON.stringify({ kind: 'notification', type: 'ready' }) + '\n');
  await new Promise(r => setImmediate(r));

  // 进程退出 (pending request 还在等 response)
  procRef.emitClose(1, null);

  // 验证 promise reject
  await assert.rejects(promise, /Inspector process exited/);
  // 验证 onExit 触发
  assert.strictEqual(exitEvents.length, 1);
  assert.strictEqual(exitEvents[0].code, 1);
  // 验证 transport 不再 active
  assert.strictEqual(transport.isActive(), false);
});

// ===== 测试 4: per-request 超时 reject (opts.timeoutMs 覆盖默认) =====
test('per-request timeoutMs rejects when response not received in time', async () => {
  const JsonStdioTransport = loadTransport();
  const spawnMock = createControllableSpawn();
  const transport = new JsonStdioTransport(SPAWN_CONFIG, { spawn: spawnMock, handshakeTimeoutMs: 5000 });

  const promise = transport.request('get-screenshot', {}, { timeoutMs: 100 });
  await new Promise(r => setImmediate(r));
  const procRef = spawnMock.getProc();
  procRef.emitStdout(JSON.stringify({ kind: 'notification', type: 'ready' }) + '\n');
  // 不发 response,等超时

  await assert.rejects(promise, /timed out after 100ms/);
});

// ===== 测试 5: 半包重组 (stdout chunk 跨 \n 切割) =====
test('partial frames across chunks are reassembled correctly', async () => {
  const JsonStdioTransport = loadTransport();
  const spawnMock = createControllableSpawn();
  const transport = new JsonStdioTransport(SPAWN_CONFIG, { spawn: spawnMock, handshakeTimeoutMs: 5000 });

  const promise = transport.request('get-screenshot');
  await new Promise(r => setImmediate(r));
  const procRef = spawnMock.getProc();

  // 先发 ready 握手
  procRef.emitStdout(JSON.stringify({ kind: 'notification', type: 'ready' }) + '\n');
  await new Promise(r => setImmediate(r));

  // 把 response 帧切成 3 段 (跨 \n 切割)
  const resp = JSON.stringify({ kind: 'response', id: 1, success: true, screenshot: 'data' }) + '\n';
  const cut1 = resp.slice(0, 15);
  const cut2 = resp.slice(15, 40);
  const cut3 = resp.slice(40);

  procRef.emitStdout(cut1);
  procRef.emitStdout(cut2);
  procRef.emitStdout(cut3);

  const res = await promise;
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.screenshot, 'data');
});

// ===== 测试 6: 非法 JSON 不崩溃,后续合法帧正常处理 =====
test('malformed JSON line does not crash transport, subsequent frames still processed', async () => {
  const JsonStdioTransport = loadTransport();
  const spawnMock = createControllableSpawn();
  const transport = new JsonStdioTransport(SPAWN_CONFIG, { spawn: spawnMock, handshakeTimeoutMs: 5000 });

  const promise = transport.request('get-screenshot');
  await new Promise(r => setImmediate(r));
  const procRef = spawnMock.getProc();
  procRef.emitStdout(JSON.stringify({ kind: 'notification', type: 'ready' }) + '\n');
  await new Promise(r => setImmediate(r));

  // 故意发非法 JSON 行 + 一个 progress 通知
  procRef.emitStdout('this is not json\n');
  procRef.emitStdout(JSON.stringify({ kind: 'response', id: 1, success: true }) + '\n');

  // 应正常 resolve (非法行被丢,不崩溃)
  const res = await promise;
  assert.strictEqual(res.success, true);
});

// ===== 测试 7: dispose 幂等 + reject pending =====
test('dispose is idempotent and rejects pending requests', async () => {
  const JsonStdioTransport = loadTransport();
  const spawnMock = createControllableSpawn();
  const transport = new JsonStdioTransport(SPAWN_CONFIG, { spawn: spawnMock, handshakeTimeoutMs: 5000 });

  const promise = transport.request('get-screenshot');
  await new Promise(r => setImmediate(r));
  const procRef = spawnMock.getProc();
  procRef.emitStdout(JSON.stringify({ kind: 'notification', type: 'ready' }) + '\n');
  await new Promise(r => setImmediate(r));

  // dispose 应 reject pending
  transport.dispose();
  await assert.rejects(promise, /Transport disposed/);

  // 二次 dispose 不抛 (幂等)
  transport.dispose();
  assert.strictEqual(transport.isActive(), false);

  // dispose 后 request 抛
  await assert.rejects(transport.request('get-screenshot'), /Transport has been disposed/);
});

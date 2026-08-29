// AdbProgressMonitor 单元测试
// 验证: 1) 构造函数存储参数 2) emit 双模式 (主动 + 轮询) 3) start/stop 生命周期
//      4) percentage 计算 + maxPercentage 上限 5) eventSender null 时 noop
//      6) stat 输出解析 7) stop 后轮询停止 8) 异常吞掉
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const AdbProgressMonitor = require(path.join(
  __dirname, '..', '..', 'electron', 'src', 'main', 'services', 'AdbProgressMonitor.js'
));

// ── 工具: 构造 mock ──────────────────────────────────────────

function createMonitorOpts(overrides = {}) {
  const defaults = {
    remotePath: '/data/local/tmp/test.apk',
    deviceId: 'device123',
    fileStats: { size: 1000, name: 'test.apk', sizeInMB: '0.00' },
    eventSender: { send: () => {} },
    i18nService: { t: (key) => `i18n:${key}` },
    executeStat: async () => ({ success: false, output: '', error: '' }),
    channel: 'install-progress',
    maxPercentage: 80,
    pollingStatus: 'transferring',
    pollingMessageKey: 'fileManager.uploading',
  };
  return { ...defaults, ...overrides };
}

function captureSends() {
  const sends = [];
  return {
    eventSender: { send: (channel, payload) => sends.push({ channel, payload }) },
    sends,
  };
}

function createExecuteStatMock(responses = []) {
  // responses: [{ output, success, error? }] 按顺序返回
  let callIdx = 0;
  const calls = [];
  const executeStat = async (args) => {
    calls.push(args);
    const response = responses[callIdx] || { success: false, output: '', error: 'no more responses' };
    callIdx++;
    return response;
  };
  return { executeStat, calls };
}


// ─── 构造函数 ────────────────────────────────────────────────

test('构造函数存储所有参数', () => {
  const opts = createMonitorOpts();
  const monitor = new AdbProgressMonitor(opts);

  assert.strictEqual(monitor.remotePath, '/data/local/tmp/test.apk');
  assert.strictEqual(monitor.deviceId, 'device123');
  assert.strictEqual(monitor.fileStats.size, 1000);
  assert.strictEqual(monitor.eventSender, opts.eventSender);
  assert.strictEqual(monitor.i18nService, opts.i18nService);
  assert.strictEqual(monitor.executeStat, opts.executeStat);
  assert.strictEqual(monitor.channel, 'install-progress');
  assert.strictEqual(monitor.maxPercentage, 80);
  assert.strictEqual(monitor.pollingStatus, 'transferring');
  assert.strictEqual(monitor.pollingMessageKey, 'fileManager.uploading');
  assert.strictEqual(monitor.intervalId, null);
  assert.strictEqual(monitor.stopped, false);
});

test('构造函数应用默认值', () => {
  const monitor = new AdbProgressMonitor({
    remotePath: '/r',
 deviceId: null, fileStats: { size: 1, name: 'a', sizeInMB: '0' },
    eventSender: null, i18nService: { t: () => '' }, executeStat: async () => ({}),
    channel: 'c',
  });
  assert.strictEqual(monitor.maxPercentage, 80);
  assert.strictEqual(monitor.pollingStatus, 'transferring');
  assert.strictEqual(monitor.pollingMessageKey, 'fileManager.uploading');
});


// ─── emit 模式 (download stdout 解析) ──────────────────────────

test('emit 发送完整 payload 到 eventSender.send', () => {
  const { eventSender, sends } = captureSends();
  const monitor = new AdbProgressMonitor(createMonitorOpts({
    eventSender, channel: 'download-progress',
  }));

  monitor.emit(50, 'downloading', 'i18n:fileManager.downloading');

  assert.strictEqual(sends.length, 1);
  assert.strictEqual(sends[0].channel, 'download-progress');
  assert.strictEqual(sends[0].payload.percentage, 50);
  assert.strictEqual(sends[0].payload.status, 'downloading');
  assert.strictEqual(sends[0].payload.message, 'i18n:fileManager.downloading');
  assert.strictEqual(sends[0].payload.fileName, 'test.apk');
  // 智能格式化: 1000 B < 1KB 直接显示字节, 不降级为 0.00 MB
  assert.strictEqual(sends[0].payload.fileSize, '1000 B');
});

test('emit 带 error 参数时 payload 含 error 字段', () => {
  const { eventSender, sends } = captureSends();
  const monitor = new AdbProgressMonitor(createMonitorOpts({ eventSender }));

  monitor.emit(100, 'error', 'failed', 'push error: timeout');

  assert.strictEqual(sends[0].payload.error, 'push error: timeout');
});

test('emit error=null 时 payload 不含 error 字段', () => {
  const { eventSender, sends } = captureSends();
  const monitor = new AdbProgressMonitor(createMonitorOpts({ eventSender }));

  monitor.emit(100, 'success', 'ok');

  assert.ok(!('error' in sends[0].payload));
});

test('emit eventSender 为 null 时 noop', () => {
  const monitor = new AdbProgressMonitor(createMonitorOpts({ eventSender: null }));

  // 不应抛错
  monitor.emit(50, 'downloading', 'msg');
});


// ─── start/stop 生命周期 ─────────────────────────────────────

test('start 启动 setInterval 触发 _pollStat', async () => {
  const { executeStat, calls } = createExecuteStatMock([
    { success: true, output: 'Size: 500' },
  ]);
  const { eventSender, sends } = captureSends();
  const monitor = new AdbProgressMonitor(createMonitorOpts({
    executeStat, eventSender,
    fileStats: { size: 1000, name: 'a', sizeInMB: '0' },
    maxPercentage: 80,
  }));

  monitor.start(10);  // 10ms 间隔
  await new Promise(resolve => setTimeout(resolve, 50));
  monitor.stop();

  assert.ok(calls.length >= 1, 'executeStat 应被调用');
  assert.ok(sends.length >= 1, '应发送进度事件');
  // 500/1000 * 80 = 40
  assert.strictEqual(sends[0].payload.percentage, 40);
  assert.strictEqual(sends[0].payload.status, 'transferring');
});

test('start eventSender 为 null 时不启动', async () => {
  const { executeStat, calls } = createExecuteStatMock([]);
  const monitor = new AdbProgressMonitor(createMonitorOpts({
    executeStat, eventSender: null,
  }));

  monitor.start(10);
  await new Promise(resolve => setTimeout(resolve, 30));
  monitor.stop();

  assert.strictEqual(calls.length, 0, 'executeStat 不应被调用');
});

test('stop 清 interval 不再触发 _pollStat', async () => {
  const { executeStat, calls } = createExecuteStatMock([
    { success: true, output: 'Size: 100' },
    { success: true, output: 'Size: 200' },
  ]);
  const monitor = new AdbProgressMonitor(createMonitorOpts({ executeStat }));

  monitor.start(10);
  await new Promise(resolve => setTimeout(resolve, 15));
  monitor.stop();
  const callCountAfterStop = calls.length;
  await new Promise(resolve => setTimeout(resolve, 30));

  assert.strictEqual(calls.length, callCountAfterStop, 'stop 后 executeStat 不应再被调用');
});

test('stop 幂等 (重复调用不抛错)', () => {
  const monitor = new AdbProgressMonitor(createMonitorOpts());

  monitor.stop();
  monitor.stop();
  monitor.stop();
  // 不抛错即通过
});

test('start 后 stop 后再 start 重新启动', async () => {
  // 提供足够 responses: 第一次 start 可能多次轮询, 第二次 start 也需 response
  const { executeStat, calls } = createExecuteStatMock([
    { success: true, output: 'Size: 100' },
    { success: true, output: 'Size: 200' },
    { success: true, output: 'Size: 300' },
    { success: true, output: 'Size: 400' },
    { success: true, output: 'Size: 500' },
    { success: true, output: 'Size: 600' },
  ]);
  const monitor = new AdbProgressMonitor(createMonitorOpts({ executeStat }));

  monitor.start(10);
  await new Promise(resolve => setTimeout(resolve, 15));
  monitor.stop();
  const callsAfterFirst = calls.length;
  monitor.start(10);
  await new Promise(resolve => setTimeout(resolve, 30));
  monitor.stop();

  assert.ok(calls.length > callsAfterFirst, '第二次 start 后应继续触发');
});


// ─── _pollStat stat 解析 ──────────────────────────────────────

test('_pollStat 解析 "Size: N" 格式 + 计算 percentage', async () => {
  const { executeStat } = createExecuteStatMock([
    { success: true, output: 'File: /data/test\nSize: 750      Blocks: 2' },
  ]);
  const { eventSender, sends } = captureSends();
  const monitor = new AdbProgressMonitor(createMonitorOpts({
    executeStat, eventSender,
    fileStats: { size: 1000, name: 'a', sizeInMB: '0' },
    maxPercentage: 80,
  }));

  await monitor._pollStat();

  // 750/1000 * 80 = 60
  assert.strictEqual(sends[0].payload.percentage, 60);
});

test('_pollStat percentage 不超过 maxPercentage', async () => {
  const { executeStat } = createExecuteStatMock([
    { success: true, output: 'Size: 2000' },  // 超过 fileSize
  ]);
  const { eventSender, sends } = captureSends();
  const monitor = new AdbProgressMonitor(createMonitorOpts({
    executeStat, eventSender,
    fileStats: { size: 1000, name: 'a', sizeInMB: '0' },
    maxPercentage: 80,
  }));

  await monitor._pollStat();

  // 2000/1000 * 80 = 160 → min(80, 160) = 80
  assert.strictEqual(sends[0].payload.percentage, 80);
});

test('_pollStat executeStat 返回 success=false → 不 emit', async () => {
  const { executeStat } = createExecuteStatMock([
    { success: false, output: '', error: 'no such file' },
  ]);
  const { eventSender, sends } = captureSends();
  const monitor = new AdbProgressMonitor(createMonitorOpts({ executeStat, eventSender }));

  await monitor._pollStat();

  assert.strictEqual(sends.length, 0);
});

test('_pollStat output 不含 "Size: N" → 不 emit', async () => {
  const { executeStat } = createExecuteStatMock([
    { success: true, output: 'some other text' },
  ]);
  const { eventSender, sends } = captureSends();
  const monitor = new AdbProgressMonitor(createMonitorOpts({ executeStat, eventSender }));

  await monitor._pollStat();

  assert.strictEqual(sends.length, 0);
});

test('_pollStat executeStat 抛异常 → 不抛错, 不 emit', async () => {
  const executeStat = async () => { throw new Error('stat failed'); };
  const { eventSender, sends } = captureSends();
  const monitor = new AdbProgressMonitor(createMonitorOpts({ executeStat, eventSender }));

  // 注意: _pollStat 本身不吞异常, 调用方 (setInterval 包装) 吞
  await assert.rejects(() => monitor._pollStat(), /stat failed/);
});

test('_pollStat stop 后被调用 → noop', async () => {
  const { executeStat, calls } = createExecuteStatMock([
    { success: true, output: 'Size: 100' },
  ]);
  const { eventSender, sends } = captureSends();
  const monitor = new AdbProgressMonitor(createMonitorOpts({ executeStat, eventSender }));

  monitor.stop();
  await monitor._pollStat();

  assert.strictEqual(calls.length, 0, 'stop 后不应调 executeStat');
  assert.strictEqual(sends.length, 0);
});

test('_pollStat deviceId=null 时 statArgs 不含 -s', async () => {
  const { executeStat, calls } = createExecuteStatMock([
    { success: true, output: 'Size: 100' },
  ]);
  const monitor = new AdbProgressMonitor(createMonitorOpts({
    executeStat, deviceId: null,
  }));

  await monitor._pollStat();

  assert.deepStrictEqual(calls[0], ['shell', 'stat', '/data/local/tmp/test.apk']);
});

test('_pollStat deviceId 非空时 statArgs 含 -s deviceId', async () => {
  const { executeStat, calls } = createExecuteStatMock([
    { success: true, output: 'Size: 100' },
  ]);
  const monitor = new AdbProgressMonitor(createMonitorOpts({
    executeStat, deviceId: 'emulator-5554',
  }));

  await monitor._pollStat();

  assert.deepStrictEqual(calls[0], ['-s', 'emulator-5554', 'shell', 'stat', '/data/local/tmp/test.apk']);
});

test('_pollStat 自定义 pollingStatus + pollingMessageKey', async () => {
  const { executeStat } = createExecuteStatMock([
    { success: true, output: 'Size: 500' },
  ]);
  const { eventSender, sends } = captureSends();
  const monitor = new AdbProgressMonitor(createMonitorOpts({
    executeStat, eventSender,
    pollingStatus: 'installing',
    pollingMessageKey: 'fileManager.installing',
  }));

  await monitor._pollStat();

  assert.strictEqual(sends[0].payload.status, 'installing');
  assert.strictEqual(sends[0].payload.message, 'i18n:fileManager.installing');
});

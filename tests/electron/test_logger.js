// utils/logger.js 单元测试 (R24 P2-9 补测试缺口)
// 覆盖日志文件路径格式 / 写入内容 / resetLogPath / close 幂等

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

const Logger = require('../../electron/src/main/utils/logger.js');

async function readLogFile(logPath) {
  await new Promise((resolve) => setTimeout(resolve, 50)); // 等 WriteStream flush
  return fsp.readFile(logPath, 'utf8');
}

// R27: 条件轮询等待 — WriteStream 写入是异步缓冲, 固定 sleep 在全量并发慢机下不足 → 间歇 fail
async function waitForContent(logPath, pattern, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const content = await fsp.readFile(logPath, 'utf8');
      if (pattern.test(content)) return content;
    } catch (e) {
      /* 文件可能尚未创建/秒级滚动 */
    }
    await new Promise((r) => setTimeout(r, 25));
  }
  return fsp.readFile(logPath, 'utf8');
}

test('Logger _resolveLogPath 生成 XKAT-YYYY-MM-DD-HH-MM-SS.log', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'xkat-logger-'));
  const logger = new Logger(dir, 'Test');
  const logPath = logger._resolveLogPath();
  assert.match(path.basename(logPath), /^XKAT-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.log$/);
  assert.strictEqual(logger._resolveLogPath(), logPath, '路径缓存, 不重复生成');
  await fsp.rm(dir, { recursive: true, force: true });
});

test('Logger log/info/error 写入文件 (serviceName + level + message)', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'xkat-logger-'));
  const logger = new Logger(dir, 'TestSvc');
  await logger.log('hello world');
  await logger.info('info msg');
  await logger.error('err msg');
  await logger.warn('warn msg');
  const content = await readLogFile(logger._resolveLogPath());
  assert.match(content, /\[TestSvc\] \[INFO\] hello world/);
  assert.match(content, /\[TestSvc\] \[INFO\] info msg/);
  assert.match(content, /\[TestSvc\] \[ERROR\] err msg/);
  assert.match(content, /\[TestSvc\] \[WARN\] warn msg/);
  await fsp.rm(dir, { recursive: true, force: true });
});

test('Logger resetLogPath 重置路径并关旧流 (下次 log 可继续写)', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'xkat-logger-'));
  const logger = new Logger(dir, 'Test');
  await logger.log('first');
  const firstPath = logger._resolveLogPath();
  logger.resetLogPath();
  // 秒级时间戳: 同秒内 reset 后路径可能相同, 关键在旧流已关、可继续写入
  await logger.log('second');
  const content = await waitForContent(firstPath, /second/);
  assert.match(content, /second/, 'reset 后日志仍能写入');
  await fsp.rm(dir, { recursive: true, force: true });
});

test('Logger close 幂等 (重复调用不抛)', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'xkat-logger-'));
  const logger = new Logger(dir, 'Test');
  await logger.log('x');
  assert.doesNotThrow(() => logger.close());
  assert.doesNotThrow(() => logger.close());
  await fsp.rm(dir, { recursive: true, force: true });
});

test('Logger 目录缺失时 log 不抛 (流错误兜底不 crash)', async () => {
  const dir = path.join(os.tmpdir(), 'xkat-logger-missing-dir', 'sub');
  const logger = new Logger(dir, 'Test');
  // createWriteStream 对不存在目录不抛同步异常, error 异步触发 → log 本身不抛
  await logger.log('no crash');
  await new Promise((r) => setTimeout(r, 30));
  logger.close();
});

// ── P3-5: 超长截断 + 背压丢弃 ─────────────────────────────

test('P3-5 超长消息截断 (防巨行撑爆缓冲)', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'xkat-logger-'));
  const logger = new Logger(dir, 'Test');
  await logger.log('x'.repeat(20000));
  const content = await readLogFile(logger._resolveLogPath());
  assert.match(content, /\[truncated\]/, '超长消息应带截断标记');
  assert.ok(content.length < 10000, `截断后总长受限, 实际 ${content.length}`);
  await fsp.rm(dir, { recursive: true, force: true });
});

test('P3-5 背压 (write 返回 false) → 丢弃计数, 不抛错', async () => {
  const logger = new Logger('/tmp/xkat-logger-backpressure', 'Test');
  // mock WriteStream: write 返回 false 模拟背压
  logger._getStream = () => ({
    write: () => false,
  });

  await logger.log('high frequency stdout line');
  await logger.log('another line');

  assert.strictEqual(logger._droppedEntries, 2, '两条背压日志均被丢弃计数');
  logger.close();
});

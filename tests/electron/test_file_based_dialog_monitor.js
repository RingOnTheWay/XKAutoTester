// FileBasedDialogMonitor 单元测试
// 需用 --require tests/electron/_setup.js 预加载 electron mock
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const FileBasedDialogMonitor = require('../../electron/src/main/services/FileBasedDialogMonitor');

/**
 * 构造临时目录
 */
function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'xkat-test-'));
}

/**
 * 构造 mock deps
 */
function createMockDeps(userDataPath) {
  return {
    mainWindow: { id: 1 },  // 模拟 BrowserWindow
    i18nService: {
      t: (key, opts) => key + (opts ? JSON.stringify(opts) : '')
    },
    userDataPath
  };
}

describe('FileBasedDialogMonitor 构造', () => {
  test('应存储 deps 字段', () => {
    const monitor = new FileBasedDialogMonitor(createMockDeps('/fake/userdata'));
    assert.ok(monitor.mainWindow);
    assert.ok(monitor.i18nService);
    assert.strictEqual(monitor.userDataPath, '/fake/userdata');
  });

  test('应计算 _dialogTriggerFile 路径', () => {
    const monitor = new FileBasedDialogMonitor(createMockDeps('/fake/userdata'));
    assert.strictEqual(
      monitor._dialogTriggerFile,
      path.join('/fake/userdata', 'logs', 'unauthorized_dialog.json')
    );
  });

  test('watcher 和 interval 初始化为 null', () => {
    const monitor = new FileBasedDialogMonitor(createMockDeps('/fake/userdata'));
    assert.strictEqual(monitor._watcher, null);
    assert.strictEqual(monitor._interval, null);
  });
});

describe('FileBasedDialogMonitor.start', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    // 清理可能残留的 watcher
  });

  test('应创建 logs 目录（如不存在）', () => {
    const monitor = new FileBasedDialogMonitor(createMockDeps(tempDir));
    monitor.start();
    assert.ok(fs.existsSync(path.join(tempDir, 'logs')));
    monitor.stop();
  });

  test('应创建 watcher 实例', () => {
    const monitor = new FileBasedDialogMonitor(createMockDeps(tempDir));
    monitor.start();
    assert.ok(monitor._watcher);
    monitor.stop();
  });

  test('启动时文件已存在应触发 dialog', async () => {
    const dialogFile = path.join(tempDir, 'logs', 'unauthorized_dialog.json');
    fs.mkdirSync(path.dirname(dialogFile), { recursive: true });
    fs.writeFileSync(dialogFile, JSON.stringify({
      device_name: 'device123',
      message: 'unauthorized'
    }));

    const monitor = new FileBasedDialogMonitor(createMockDeps(tempDir));
    monitor.start();

    // 等待异步处理
    await new Promise(resolve => setTimeout(resolve, 200));

    assert.ok(global.__dialogMock.lastOptions !== null);
    assert.strictEqual(global.__dialogMock.lastOptions.type, 'warning');
    // 触发文件应被删除
    assert.strictEqual(fs.existsSync(dialogFile), false);

    monitor.stop();
  });

  test('无触发文件时不应弹 dialog', async () => {
    const monitor = new FileBasedDialogMonitor(createMockDeps(tempDir));
    global.__dialogMock.lastOptions = null;
    monitor.start();
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.strictEqual(global.__dialogMock.lastOptions, null);
    monitor.stop();
  });

  test('watcher 错误时应回退到轮询', () => {
    const monitor = new FileBasedDialogMonitor(createMockDeps(tempDir));
    monitor.start();
    // 模拟 watcher error
    monitor._watcher.emit('error', new Error('watch failed'));
    // 应创建 interval
    assert.ok(monitor._interval);
    assert.strictEqual(monitor._watcher, null);
    monitor.stop();
  });
});

describe('FileBasedDialogMonitor.stop', () => {
  test('应关闭 watcher', () => {
    const tempDir = createTempDir();
    const monitor = new FileBasedDialogMonitor(createMockDeps(tempDir));
    monitor.start();
    assert.ok(monitor._watcher);
    monitor.stop();
    assert.strictEqual(monitor._watcher, null);
  });

  test('应清除 interval', () => {
    const tempDir = createTempDir();
    const monitor = new FileBasedDialogMonitor(createMockDeps(tempDir));
    monitor._interval = setInterval(() => {}, 1000);
    monitor.stop();
    assert.strictEqual(monitor._interval, null);
  });

  test('未 start 时 stop 不应抛异常', () => {
    const tempDir = createTempDir();
    const monitor = new FileBasedDialogMonitor(createMockDeps(tempDir));
    // 不应抛异常
    assert.doesNotThrow(() => monitor.stop());
  });

  test('重复 stop 不应抛异常', () => {
    const tempDir = createTempDir();
    const monitor = new FileBasedDialogMonitor(createMockDeps(tempDir));
    monitor.start();
    monitor.stop();
    assert.doesNotThrow(() => monitor.stop());
  });
});

describe('FileBasedDialogMonitor._showDialog', () => {
  test('应调用 electron dialog.showMessageBox', async () => {
    const tempDir = createTempDir();
    const monitor = new FileBasedDialogMonitor(createMockDeps(tempDir));
    global.__dialogMock.lastOptions = null;
    await monitor._showDialog({ device_name: 'device1', message: 'test message' });
    assert.ok(global.__dialogMock.lastOptions);
    assert.strictEqual(global.__dialogMock.lastOptions.type, 'warning');
    assert.ok(global.__dialogMock.lastOptions.buttons.length > 0);
  });

  test('应使用 dialogData.message（如提供）', async () => {
    const tempDir = createTempDir();
    const monitor = new FileBasedDialogMonitor(createMockDeps(tempDir));
    global.__dialogMock.lastOptions = null;
    await monitor._showDialog({ device_name: 'd1', message: 'custom msg' });
    assert.strictEqual(global.__dialogMock.lastOptions.message, 'custom msg');
  });

  test('无 message 时应使用 i18n 默认消息', async () => {
    const tempDir = createTempDir();
    const monitor = new FileBasedDialogMonitor(createMockDeps(tempDir));
    global.__dialogMock.lastOptions = null;
    await monitor._showDialog({ device_name: 'd1' });
    // i18nService.t 返回 key + opts，应包含 device name
    assert.ok(global.__dialogMock.lastOptions.message.includes('device'));
  });
});

/**
 * FileBasedDialogMonitor 单元测试
 *
 * 运行前提：cd electron && npm install jest --save-dev
 * 运行命令：cd electron && npx jest ../tests/electron/services/FileBasedDialogMonitor.test.js
 */

const path = require('path');
const fs = require('fs');

// ---- Mock 依赖 ----

const mockDialog = {
  showMessageBox: jest.fn().mockResolvedValue({})
};

jest.mock('electron', () => ({
  dialog: mockDialog
}));

const mockI18nService = {
  t: jest.fn((key) => key)
};

const mockMainWindow = {
  id: 1
};

// Mock asyncFs
const mockAsyncFs = {
  readFile: jest.fn()
};

jest.mock('../../electron/src/main/utils/asyncFs', () => mockAsyncFs, { virtual: true });

const FileBasedDialogMonitor = require('../../electron/src/main/services/FileBasedDialogMonitor');

/**
 * 工厂：创建 FileBasedDialogMonitor 实例
 */
function createMonitor(overrides = {}) {
  return new FileBasedDialogMonitor({
    mainWindow: mockMainWindow,
    i18nService: mockI18nService,
    userDataPath: '/fake/data',
    ...overrides
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ============================================================

describe('FileBasedDialogMonitor', () => {

  describe('constructor', () => {
    test('应正确赋值依赖', () => {
      const monitor = createMonitor();
      expect(monitor.mainWindow).toBe(mockMainWindow);
      expect(monitor.i18nService).toBe(mockI18nService);
      expect(monitor.userDataPath).toBe('/fake/data');
    });

    test('应计算 dialogTriggerFile 路径', () => {
      const monitor = createMonitor();
      expect(monitor._dialogTriggerFile).toBe(
        path.join('/fake/data', 'logs', 'unauthorized_dialog.json')
      );
    });

    test('初始状态：watcher 和 interval 为 null', () => {
      const monitor = createMonitor();
      expect(monitor._watcher).toBeNull();
      expect(monitor._interval).toBeNull();
    });
  });

  describe('stop()', () => {
    test('watcher 存在时 → close 并置 null', () => {
      const monitor = createMonitor();
      const mockWatcher = { close: jest.fn() };
      monitor._watcher = mockWatcher;

      monitor.stop();

      expect(mockWatcher.close).toHaveBeenCalledTimes(1);
      expect(monitor._watcher).toBeNull();
    });

    test('interval 存在时 → clearInterval 并置 null', () => {
      const monitor = createMonitor();
      const mockIntervalId = 12345;
      monitor._interval = mockIntervalId;

      jest.spyOn(global, 'clearInterval');
      monitor.stop();

      expect(clearInterval).toHaveBeenCalledWith(mockIntervalId);
      expect(monitor._interval).toBeNull();
      clearInterval.mockRestore();
    });

    test('watcher 和 interval 都不存在 → 不报错', () => {
      const monitor = createMonitor();
      expect(() => monitor.stop()).not.toThrow();
    });
  });

  describe('start()', () => {
    test('触发文件已存在 → 读取并处理', (done) => {
      const monitor = createMonitor();

      // 模拟文件存在
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      mockAsyncFs.readFile.mockResolvedValue(JSON.stringify({
        device_name: 'TestDevice',
        message: 'Unauthorized'
      }));

      // 模拟目录存在，watcher 创建成功
      const mockWatcher = new EventEmitter();
      mockWatcher.close = jest.fn();
      jest.spyOn(fs, 'watch').mockReturnValue(mockWatcher);

      monitor.start();

      // 等待异步处理
      setTimeout(() => {
        expect(mockAsyncFs.readFile).toHaveBeenCalled();
        done();
      }, 50);
    });

    test('目录不存在 → 创建目录', () => {
      const monitor = createMonitor();

      let existsCallCount = 0;
      jest.spyOn(fs, 'existsSync').mockImplementation(() => {
        existsCallCount++;
        // 第一次调用检查触发文件，返回 false
        // 第二次调用检查目录，返回 false
        return false;
      });

      jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {});

      const mockWatcher = new EventEmitter();
      mockWatcher.close = jest.fn();
      jest.spyOn(fs, 'watch').mockReturnValue(mockWatcher);

      monitor.start();

      expect(fs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('logs'),
        { recursive: true }
      );
    });

    test('fs.watch 创建失败 → 回退到轮询', () => {
      const monitor = createMonitor();

      jest.spyOn(fs, 'existsSync').mockReturnValue(false);
      jest.spyOn(fs, 'watch').mockImplementation(() => {
        throw new Error('watch failed');
      });
      jest.spyOn(global, 'setInterval').mockReturnValue(99999);

      monitor.start();

      expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 2000);
      expect(monitor._interval).toBe(99999);

      setInterval.mockRestore();
    });

    test('watcher 触发 error 事件 → 回退到轮询', () => {
      const monitor = createMonitor();

      jest.spyOn(fs, 'existsSync').mockReturnValue(false);

      const mockWatcher = new EventEmitter();
      mockWatcher.close = jest.fn();
      jest.spyOn(fs, 'watch').mockReturnValue(mockWatcher);
      jest.spyOn(global, 'setInterval').mockReturnValue(99999);

      monitor.start();

      // 模拟 watcher error
      mockWatcher.emit('error', new Error('watcher error'));

      expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 2000);
      expect(monitor._watcher).toBeNull();
      expect(monitor._interval).toBe(99999);

      setInterval.mockRestore();
    });
  });

  describe('_showDialog()', () => {
    test('应调用 dialog.showMessageBox 并传递正确参数', async () => {
      const monitor = createMonitor();

      await monitor._showDialog({
        device_name: 'Pixel_7',
        message: 'Device not authorized'
      });

      expect(mockDialog.showMessageBox).toHaveBeenCalledWith(
        mockMainWindow,
        expect.objectContaining({
          type: 'warning',
          buttons: [expect.any(String)]
        })
      );
    });

    test('无自定义 message → 使用 i18n 默认消息', async () => {
      const monitor = createMonitor();

      await monitor._showDialog({
        device_name: 'Pixel_7'
      });

      expect(mockI18nService.t).toHaveBeenCalledWith(
        'testExecution.deviceSelection.deviceUnauthorizedMessage',
        { device: 'Pixel_7' }
      );
    });
  });

  describe('生命周期', () => {
    test('start → stop 完整流程', () => {
      const monitor = createMonitor();

      jest.spyOn(fs, 'existsSync').mockReturnValue(false);

      const mockWatcher = new EventEmitter();
      mockWatcher.close = jest.fn();
      jest.spyOn(fs, 'watch').mockReturnValue(mockWatcher);

      monitor.start();
      expect(monitor._watcher).toBe(mockWatcher);

      monitor.stop();
      expect(mockWatcher.close).toHaveBeenCalledTimes(1);
      expect(monitor._watcher).toBeNull();
    });
  });
});

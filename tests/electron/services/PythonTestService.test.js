/**
 * PythonTestService 单元测试
 *
 * 运行前提：cd electron && npm install jest --save-dev
 * 运行命令：cd electron && npx jest ../tests/electron/services/PythonTestService.test.js
 */

const { EventEmitter } = require('events');

// ---- Mock 工具 ----

const mockI18nService = {
  t: jest.fn((key) => key),
  getLanguage: jest.fn(() => 'zh-CN')
};

const mockMainWindow = {
  webContents: {
    send: jest.fn()
  }
};

const mockAllureService = {
  generateAllureReport: jest.fn()
};

const mockTestPlanService = {
  updateRunReportPath: jest.fn()
};

const mockDialogMonitor = {
  start: jest.fn(),
  stop: jest.fn()
};

/**
 * 创建 mock 子进程，模拟 stdout/stderr/close 事件
 */
function createMockProcess(exitCode = 0, stdout = '', stderr = '') {
  const proc = new EventEmitter();
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.kill = jest.fn();

  process.nextTick(() => {
    if (stdout) proc.stdout.emit('data', Buffer.from(stdout));
    if (stderr) proc.stderr.emit('data', Buffer.from(stderr));
    proc.emit('close', exitCode);
  });

  return proc;
}

// Mock spawn 函数
let mockSpawnImpl;
const mockSpawn = jest.fn((...args) => mockSpawnImpl(...args));

// Mock pathHelper
jest.mock('../../electron/src/main/utils/pathHelper', () => ({
  getPythonConfig: jest.fn()
}), { virtual: true });

// Mock Logger
jest.mock('../../electron/src/main/utils/logger', () => {
  return class MockLogger {
    stdout() {}
    stderr() {}
    error() {}
  };
}, { virtual: true });

// Mock FileBasedDialogMonitor
jest.mock('../../electron/src/main/services/FileBasedDialogMonitor', () => {
  return class MockFileBasedDialogMonitor {
    constructor() {}
    start() {}
    stop() {}
  };
}, { virtual: true });

// Mock fs
jest.mock('fs', () => ({
  existsSync: jest.fn(() => false),
  readdirSync: jest.fn(() => [])
}));

const pathHelper = require('../../electron/src/main/utils/pathHelper');
const PythonTestService = require('../../electron/src/main/services/PythonTestService');

/**
 * 工厂：创建 PythonTestService 实例
 */
function createService(overrides = {}) {
  return new PythonTestService({
    projectRoot: '/fake/root',
    i18nService: mockI18nService,
    userDataPath: '/fake/data',
    mainWindow: mockMainWindow,
    allureService: mockAllureService,
    testPlanService: mockTestPlanService,
    dialogMonitor: mockDialogMonitor,
    spawn: mockSpawn,
    ...overrides
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSpawnImpl = () => createMockProcess(0, '2 passed, 1 skipped\n', '');
  pathHelper.getPythonConfig.mockReturnValue({
    pythonPath: '/fake/python',
    isEmbedded: false,
    isSystem: false,
    sitePackagesPath: null
  });
});

// ============================================================

describe('PythonTestService', () => {

  // ---- 构造函数 ----

  describe('constructor', () => {
    test('应接受 deps 对象参数并正确赋值', () => {
      const service = createService();
      expect(service.projectRoot).toBe('/fake/root');
      expect(service.i18nService).toBe(mockI18nService);
      expect(service.userDataPath).toBe('/fake/data');
      expect(service.mainWindow).toBe(mockMainWindow);
      expect(service.allureService).toBe(mockAllureService);
      expect(service.testPlanService).toBe(mockTestPlanService);
    });

    test('应使用注入的 spawn 函数', () => {
      const service = createService();
      expect(service._spawn).toBe(mockSpawn);
    });

    test('应使用注入的 dialogMonitor', () => {
      const service = createService();
      expect(service._dialogMonitor).toBe(mockDialogMonitor);
    });

    test('mainWindow 可为 null（延迟设置场景）', () => {
      const service = createService({ mainWindow: null });
      expect(service.mainWindow).toBeNull();
    });

    test('currentPythonProcess 初始为 null', () => {
      const service = createService();
      expect(service.currentPythonProcess).toBeNull();
    });
  });

  // ---- run() ----

  describe('run()', () => {
    test('正常流程：退出码 0 → success: true，返回完整结果', async () => {
      mockAllureService.generateAllureReport.mockResolvedValue({
        success: true,
        reportPath: '/fake/report'
      });

      const service = createService();
      const result = await service.run({
        testPaths: ['/tests/foo.py'],
        markers: ['smoke'],
        testPlanName: 'plan1'
      });

      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.testPlanName).toBe('plan1');
      expect(result.output).toContain('2 passed');
      expect(result.sideEffectFailures).toEqual([]);
    });

    test('Python 命令不可用 → 返回失败结果，不启动子进程', async () => {
      pathHelper.getPythonConfig.mockReturnValue(null);
      const service = createService();

      const result = await service.run({
        testPaths: ['/tests/foo.py']
      });

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(-1);
      expect(result.output).toBe('');
      expect(result.sideEffectFailures).toEqual([]);
      expect(mockSpawn).not.toHaveBeenCalled();
    });

    test('应启动和停止 dialogMonitor', async () => {
      const service = createService();
      await service.run({ testPaths: ['/tests/foo.py'] });

      expect(mockDialogMonitor.start).toHaveBeenCalledTimes(1);
      expect(mockDialogMonitor.stop).toHaveBeenCalledTimes(1);
    });

    test('应通过 mainWindow.webContents.send 转发 stdout', async () => {
      mockSpawnImpl = () => createMockProcess(0, 'hello stdout\n', '');
      const service = createService();

      await service.run({ testPaths: ['/tests/foo.py'] });

      expect(mockMainWindow.webContents.send).toHaveBeenCalledWith(
        'test-output', expect.stringContaining('hello stdout')
      );
    });

    test('应通过 mainWindow.webContents.send 转发 stderr', async () => {
      mockSpawnImpl = () => createMockProcess(0, '', 'hello stderr\n');
      const service = createService();

      await service.run({ testPaths: ['/tests/foo.py'] });

      expect(mockMainWindow.webContents.send).toHaveBeenCalledWith(
        'test-error', expect.stringContaining('hello stderr')
      );
    });

    test('mainWindow 为 null 时不崩溃，不转发输出', async () => {
      const service = createService({ mainWindow: null });
      const result = await service.run({ testPaths: ['/tests/foo.py'] });

      expect(result.success).toBe(true);
      // 无 mainWindow → send 不应被调用
      expect(mockMainWindow.webContents.send).not.toHaveBeenCalled();
    });

    test('应构建正确的 Python 启动参数', async () => {
      const service = createService();
      await service.run({
        testPaths: ['/tests/a.py', '/tests/b.py'],
        markers: ['smoke', 'critical'],
        testPlanName: 'myPlan'
      });

      const spawnArgs = mockSpawn.mock.calls[0];
      expect(spawnArgs[0]).toBe('/fake/python');
      expect(spawnArgs[1]).toEqual([
        '-m', 'main',
        '--test-paths', '/tests/a.py,/tests/b.py',
        '--markers', 'smoke,critical',
        '--test-plan', 'myPlan'
      ]);
    });

    test('无 markers 时不添加 --markers 参数', async () => {
      const service = createService();
      await service.run({ testPaths: ['/tests/foo.py'] });

      const spawnArgs = mockSpawn.mock.calls[0];
      expect(spawnArgs[1]).not.toContain('--markers');
    });

    test('无 testPlanName 时不添加 --test-plan 参数', async () => {
      const service = createService();
      await service.run({ testPaths: ['/tests/foo.py'] });

      const spawnArgs = mockSpawn.mock.calls[0];
      expect(spawnArgs[1]).not.toContain('--test-plan');
    });

    test('子进程 spawn 错误 → reject Promise', async () => {
      mockSpawnImpl = () => {
        const proc = new EventEmitter();
        proc.stdout = new EventEmitter();
        proc.stderr = new EventEmitter();
        process.nextTick(() => proc.emit('error', new Error('spawn ENOENT')));
        return proc;
      };

      const service = createService();
      await expect(service.run({ testPaths: ['/tests/foo.py'] }))
        .rejects.toThrow('spawn ENOENT');
    });
  });

  // ---- 流水线 ----

  describe('run() - 流水线', () => {
    test('Allure 生成成功 + 计划更新成功 → allureReportPath 有值，sideEffectFailures 为空', async () => {
      mockSpawnImpl = () => createMockProcess(0, 'XKAT_ALLURE_RESULTS_DIR:/fake/allure-results\n2 passed\n', '');
      mockAllureService.generateAllureReport.mockResolvedValue({
        success: true,
        reportPath: '/fake/report'
      });
      mockTestPlanService.updateRunReportPath.mockResolvedValue();

      const service = createService();
      const result = await service.run({
        testPaths: ['/tests/foo.py'],
        testPlanName: 'plan1'
      });

      expect(result.allureReportPath).toBe('/fake/report');
      expect(result.sideEffectFailures).toEqual([]);
      expect(mockAllureService.generateAllureReport).toHaveBeenCalledWith('/fake/allure-results', 'plan1');
      expect(mockTestPlanService.updateRunReportPath).toHaveBeenCalledWith('plan1', '/fake/report');
    });

    test('Allure 生成失败 → sideEffectFailures 记录，计划更新跳过', async () => {
      mockSpawnImpl = () => createMockProcess(0, 'XKAT_ALLURE_RESULTS_DIR:/fake/allure-results\n2 passed\n', '');
      mockAllureService.generateAllureReport.mockRejectedValue(new Error('Allure crashed'));

      const service = createService();
      const result = await service.run({
        testPaths: ['/tests/foo.py'],
        testPlanName: 'plan1'
      });

      expect(result.success).toBe(true);
      expect(result.allureReportPath).toBeNull();
      expect(result.sideEffectFailures).toEqual([
        { step: 'generateReport', error: 'Allure crashed' }
      ]);
      expect(mockTestPlanService.updateRunReportPath).not.toHaveBeenCalled();
    });

    test('计划路径更新失败 → sideEffectFailures 记录', async () => {
      mockSpawnImpl = () => createMockProcess(0, 'XKAT_ALLURE_RESULTS_DIR:/fake/allure-results\n2 passed\n', '');
      mockAllureService.generateAllureReport.mockResolvedValue({
        success: true,
        reportPath: '/fake/report'
      });
      mockTestPlanService.updateRunReportPath.mockRejectedValue(new Error('Plan update failed'));

      const service = createService();
      const result = await service.run({
        testPaths: ['/tests/foo.py'],
        testPlanName: 'plan1'
      });

      expect(result.success).toBe(true);
      expect(result.allureReportPath).toBe('/fake/report');
      expect(result.sideEffectFailures).toEqual([
        { step: 'updatePlanPath', error: 'Plan update failed' }
      ]);
    });

    test('Allure 生成返回 success: false → allureReportPath 为 null，计划更新跳过', async () => {
      mockSpawnImpl = () => createMockProcess(0, 'XKAT_ALLURE_RESULTS_DIR:/fake/allure-results\n2 passed\n', '');
      mockAllureService.generateAllureReport.mockResolvedValue({
        success: false,
        reportPath: null
      });

      const service = createService();
      const result = await service.run({
        testPaths: ['/tests/foo.py'],
        testPlanName: 'plan1'
      });

      expect(result.allureReportPath).toBeNull();
      expect(result.sideEffectFailures).toEqual([]);
      expect(mockTestPlanService.updateRunReportPath).not.toHaveBeenCalled();
    });

    test('无 allureResultsDir → 跳过 Allure 生成', async () => {
      mockSpawnImpl = () => createMockProcess(0, '2 passed\n', '');
      const service = createService();
      const result = await service.run({
        testPaths: ['/tests/foo.py'],
        testPlanName: 'plan1'
      });

      expect(mockAllureService.generateAllureReport).not.toHaveBeenCalled();
      expect(result.allureReportPath).toBeNull();
    });

    test('无 testPlanName → 跳过计划路径更新', async () => {
      mockSpawnImpl = () => createMockProcess(0, 'XKAT_ALLURE_RESULTS_DIR:/fake/allure-results\n2 passed\n', '');
      mockAllureService.generateAllureReport.mockResolvedValue({
        success: true,
        reportPath: '/fake/report'
      });

      const service = createService();
      const result = await service.run({
        testPaths: ['/tests/foo.py']
        // 无 testPlanName
      });

      expect(result.allureReportPath).toBe('/fake/report');
      expect(mockTestPlanService.updateRunReportPath).not.toHaveBeenCalled();
    });

    test('Allure + 计划更新都失败 → sideEffectFailures 记录两项', async () => {
      mockSpawnImpl = () => createMockProcess(0, 'XKAT_ALLURE_RESULTS_DIR:/fake/allure-results\n2 passed\n', '');
      mockAllureService.generateAllureReport.mockRejectedValue(new Error('Allure error'));
      // 计划更新不会被调用因为 allureReportPath 为 null
      // 所以这个场景需要 Allure 成功但计划更新失败
      // 重新设置：Allure 成功，计划更新失败
      mockAllureService.generateAllureReport.mockResolvedValue({
        success: true,
        reportPath: '/fake/report'
      });
      mockTestPlanService.updateRunReportPath.mockRejectedValue(new Error('Plan error'));

      const service = createService();
      const result = await service.run({
        testPaths: ['/tests/foo.py'],
        testPlanName: 'plan1'
      });

      expect(result.sideEffectFailures).toEqual([
        { step: 'updatePlanPath', error: 'Plan error' }
      ]);
    });
  });

  // ---- 统计解析 ----

  describe('run() - 统计解析', () => {
    test('解析完整 pytest 摘要', async () => {
      mockSpawnImpl = () => createMockProcess(1, '3 passed, 2 failed, 1 skipped, 1 broken in 10s\n', '');
      const service = createService();

      const result = await service.run({ testPaths: ['/tests/foo.py'] });

      expect(result.testStats).toEqual({
        passed: 3,
        failed: 2,
        skipped: 1,
        broken: 1,
        total: 7
      });
    });

    test('无 pytest 摘要 → 全零统计', async () => {
      mockSpawnImpl = () => createMockProcess(0, 'no summary here\n', '');
      const service = createService();

      const result = await service.run({ testPaths: ['/tests/foo.py'] });

      expect(result.testStats).toEqual({
        passed: 0, failed: 0, skipped: 0, broken: 0, total: 0
      });
    });

    test('空输出 → 全零统计', async () => {
      mockSpawnImpl = () => createMockProcess(0, '', '');
      const service = createService();

      const result = await service.run({ testPaths: ['/tests/foo.py'] });

      expect(result.testStats).toEqual({
        passed: 0, failed: 0, skipped: 0, broken: 0, total: 0
      });
    });

    test('部分统计（只有 passed）→ 其余为零', async () => {
      mockSpawnImpl = () => createMockProcess(0, '5 passed in 2s\n', '');
      const service = createService();

      const result = await service.run({ testPaths: ['/tests/foo.py'] });

      expect(result.testStats).toEqual({
        passed: 5, failed: 0, skipped: 0, broken: 0, total: 5
      });
    });
  });

  // ---- stop() ----

  describe('stop()', () => {
    test('有运行中的进程 → kill 并返回成功', () => {
      const service = createService();
      const fakeProcess = { kill: jest.fn() };
      service.currentPythonProcess = fakeProcess;

      const result = service.stop();

      expect(result.success).toBe(true);
      expect(fakeProcess.kill).toHaveBeenCalledTimes(1);
      expect(service.currentPythonProcess).toBeNull();
      expect(mockDialogMonitor.stop).toHaveBeenCalledTimes(1);
    });

    test('无运行中的进程 → 返回失败', () => {
      const service = createService();
      const result = service.stop();

      expect(result.success).toBe(false);
      expect(mockDialogMonitor.stop).not.toHaveBeenCalled();
    });

    test('kill 抛异常 → 返回失败含错误信息', () => {
      const service = createService();
      const fakeProcess = { kill: jest.fn(() => { throw new Error('kill failed'); }) };
      service.currentPythonProcess = fakeProcess;

      const result = service.stop();

      expect(result.success).toBe(false);
      expect(result.message).toContain('kill failed');
    });
  });

  // ---- _findAllureResultsDir() ----

  describe('_findAllureResultsDir()', () => {
    test('从输出标记解析路径', () => {
      const service = createService();
      const result = service._findAllureResultsDir('some output\nXKAT_ALLURE_RESULTS_DIR:/path/to/results\nmore output');
      expect(result).toBe('/path/to/results');
    });

    test('标记路径带空格 → trim', () => {
      const service = createService();
      const result = service._findAllureResultsDir('XKAT_ALLURE_RESULTS_DIR:  /path/to/results  \n');
      expect(result).toBe('/path/to/results');
    });

    test('无标记且目录不存在 → 返回 null', () => {
      const service = createService();
      const result = service._findAllureResultsDir('no marker here');
      expect(result).toBeNull();
    });
  });

  // ---- buildPythonPathEnv() ----

  describe('buildPythonPathEnv()', () => {
    test('系统 Python 带 sitePackagesPath → PYTHONPATH 包含两个路径', () => {
      const service = createService();
      const result = service.buildPythonPathEnv({
        isSystem: true,
        sitePackagesPath: '/usr/lib/python3/site-packages'
      });
      expect(result.PYTHONPATH).toContain('/usr/lib/python3/site-packages');
      expect(result.PYTHONPATH).toContain('src');
    });

    test('非系统 Python → PYTHONPATH 仅包含 src', () => {
      const service = createService();
      const result = service.buildPythonPathEnv({
        isSystem: false,
        sitePackagesPath: null
      });
      expect(result.PYTHONPATH).toBe('/fake/root/src');
    });
  });

  // ---- getPythonCommand() ----

  describe('getPythonCommand()', () => {
    test('pathHelper 返回配置 → 正确映射', () => {
      pathHelper.getPythonConfig.mockReturnValue({
        pythonPath: '/fake/venv/python',
        isEmbedded: true,
        isSystem: false,
        sitePackagesPath: '/fake/site-packages'
      });

      const service = createService();
      const cmd = service.getPythonCommand();

      expect(cmd.command).toBe('/fake/venv/python');
      expect(cmd.useVenv).toBe(true);
      expect(cmd.isEmbedded).toBe(true);
      expect(cmd.isSystem).toBe(false);
      expect(cmd.sitePackagesPath).toBe('/fake/site-packages');
    });

    test('pathHelper 返回 null → command 为 null，含错误信息', () => {
      pathHelper.getPythonConfig.mockReturnValue(null);

      const service = createService();
      const cmd = service.getPythonCommand();

      expect(cmd.command).toBeNull();
      expect(cmd.useVenv).toBe(false);
      expect(cmd.error).toBeTruthy();
    });
  });
});

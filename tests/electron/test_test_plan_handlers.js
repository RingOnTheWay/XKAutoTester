// 示例 handler 测试 - 验证 harness 可用
// 覆盖 testPlanHandlers.js 的 IPC 注册 + invoke 转发

const { test, describe } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { createHandlerTestHarness } = require('./helpers/harness');

const HANDLER_PATH = path.resolve(__dirname, '../../electron/src/main/handlers/testPlanHandlers.js');

describe('testPlanHandlers harness 示例', () => {
  test('register 注册所有 IPC channel', async () => {
    const { ipc } = await createHandlerTestHarness(HANDLER_PATH, {
      testPlanService: {
        getTestPlans: { success: true, data: [] },
        saveTestPlan: { success: true },
        deleteTestPlan: { success: true },
        updateTestPlan: { success: true },
        getTestPlanRuns: { success: true, runs: [] },
        scanTestFiles: [],
        extractPytestMarkers: [],
        getPytestMarkers: [],
      },
      pythonTestService: {
        run: { success: true },
        stop: { success: true },
      },
    });

    // 验证 handler 注册 (invoke 路径存在)
    const channels = [
      'run-python-tests',
      'stop-python-tests',
      'get-test-plans',
      'save-test-plan',
      'delete-test-plan',
      'update-test-plan',
      'get-test-plan-runs',
      'scan-test-files',
      'extract-pytest-markers',
      'get-pytest-markers',
    ];
    for (const ch of channels) {
      assert.ok(ipc.handlers.has(ch), `channel ${ch} 应被注册`);
    }
  });

  test('invoke get-test-plans 调用 testPlanService.getTestPlans', async () => {
    const { ipc, services } = await createHandlerTestHarness(HANDLER_PATH, {
      testPlanService: {
        getTestPlans: { success: true, data: [{ id: 'p1', name: 'plan1' }] },
      },
      pythonTestService: {},
    });

    const result = await ipc.invoke('get-test-plans');

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data.length, 1);
    assert.strictEqual(result.data[0].name, 'plan1');
    // 验证 service 被调用
    assert.strictEqual(services.testPlanService.__calls.getTestPlans.length, 1);
  });

  test('invoke save-test-plan 转发参数到 service', async () => {
    const { ipc, services } = await createHandlerTestHarness(HANDLER_PATH, {
      testPlanService: {
        saveTestPlan: { success: true, id: 'new-id' },
      },
      pythonTestService: {},
    });

    const planData = { name: 'newPlan', testFiles: [] };
    const result = await ipc.invoke('save-test-plan', planData);

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.id, 'new-id');
    // 验证参数转发
    const calls = services.testPlanService.__calls.saveTestPlan;
    assert.strictEqual(calls.length, 1);
    assert.deepStrictEqual(calls[0][0], planData);
  });

  test('invoke 未注册 channel 返回错误', async () => {
    const { ipc } = await createHandlerTestHarness(HANDLER_PATH, {
      testPlanService: {},
      pythonTestService: {},
    });

    const result = await ipc.invoke('non-existent-channel');
    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('not mocked'));
  });

  test('handler 错误返回 {success: false}', async () => {
    const { ipc } = await createHandlerTestHarness(HANDLER_PATH, {
      testPlanService: {
        // 模拟 service 抛错
        getTestPlans: () => { throw new Error('DB connection failed'); },
      },
      pythonTestService: {},
    });

    const result = await ipc.invoke('get-test-plans');
    // handlerUtils.js 捕获错误返回 {success: false, error}
    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('DB connection failed'));
  });
});

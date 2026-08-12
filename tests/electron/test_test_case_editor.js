// TestCaseEditor 深模块单元测试 (R10 renderer mixin → deep module)
// 验证：编辑器状态机 + 文件→编辑器转换 + CRUD + 表单收集 + 编排四个深模块

const { test, describe } = require('node:test');
const assert = require('node:assert');

let TestCaseEditorClass;
async function loadTestCaseEditor() {
  if (!TestCaseEditorClass) {
    const mod = await import('../../electron/renderer/tabs/test-case/modules/TestCaseEditor.js');
    TestCaseEditorClass = mod.TestCaseEditor;
  }
  return TestCaseEditorClass;
}

// 构造四个 mock 依赖模块
function makeFakeDeps(overrides = {}) {
  const events = { fb: [], op: [], se: [] };
  const fileBrowser = {
    selectedDirectory: '/fake/dir',
    selectedFile: null,
    selectFile: (f) => { fileBrowser.selectedFile = f; events.fb.push(['selectFile', f]); },
    deselectFile: () => { fileBrowser.selectedFile = null; events.fb.push(['deselectFile']); },
    scanTestFiles: async (dir) => { events.fb.push(['scanTestFiles', dir]); },
  };
  const optionPanel = {
    selectedApp: null,
    selectedPlatform: 'android',
    selectedMarkers: [],
    bleDevices: [],
    selectApp: (app) => { optionPanel.selectedApp = app; events.op.push(['selectApp', app]); },
    selectPlatform: (p) => { optionPanel.selectedPlatform = p; events.op.push(['selectPlatform', p]); },
    replaceSelectedMarkers: (m) => { optionPanel.selectedMarkers = m; events.op.push(['replaceSelectedMarkers', m]); },
  };
  const stepEditor = {
    steps: [],
    reset: () => { stepEditor.steps = []; events.se.push(['reset']); },
    setSteps: (s) => { stepEditor.steps = s; events.se.push(['setSteps', s]); },
  };
  const api = {
    checkJsonExists: async (name) => overrides.checkJsonExists ?? { exists: true },
    getCase: async (name) => overrides.getCase ?? { data: { fileName: name, steps: [], allureConfig: {}, targetApp: null } },
    saveAndGenerate: async (data, dir) => overrides.saveAndGenerate ?? { success: true, data: {} },
    deleteCase: async (payload) => overrides.deleteCase ?? { success: true },
  };
  return { fileBrowser, optionPanel, stepEditor, api, events };
}

describe('TestCaseEditor 初始状态', () => {
  test('初始状态所有字段为默认值', async () => {
    const TestCaseEditor = await loadTestCaseEditor();
    const deps = makeFakeDeps();
    const ed = new TestCaseEditor(deps);
    assert.strictEqual(ed.isEditing, false);
    assert.strictEqual(ed.hasUnsavedChanges, false);
    assert.strictEqual(ed.loadedDeviceConfig, null);
    assert.strictEqual(ed.loadedBleDevice, null);
  });

  test('get(key) 读取状态', async () => {
    const TestCaseEditor = await loadTestCaseEditor();
    const ed = new TestCaseEditor(makeFakeDeps());
    assert.strictEqual(ed.get('isEditing'), false);
    assert.strictEqual(ed.get('hasUnsavedChanges'), false);
    assert.strictEqual(ed.get('unknown'), undefined);
  });
});

describe('TestCaseEditor markDirty / clearDirty', () => {
  test('markDirty 设置 hasUnsavedChanges=true 并触发 dirty-changed', async () => {
    const TestCaseEditor = await loadTestCaseEditor();
    const ed = new TestCaseEditor(makeFakeDeps());
    let emitted = null;
    ed.on('dirty-changed', (v) => { emitted = v; });

    ed.markDirty();
    assert.strictEqual(ed.hasUnsavedChanges, true);
    assert.strictEqual(emitted, true);
  });

  test('clearDirty 设置 hasUnsavedChanges=false 并触发 dirty-changed', async () => {
    const TestCaseEditor = await loadTestCaseEditor();
    const ed = new TestCaseEditor(makeFakeDeps());
    ed.markDirty();
    let emitted = null;
    ed.on('dirty-changed', (v) => { emitted = v; });

    ed.clearDirty();
    assert.strictEqual(ed.hasUnsavedChanges, false);
    assert.strictEqual(emitted, false);
  });

  test('markDirty 同值不触发', async () => {
    const TestCaseEditor = await loadTestCaseEditor();
    const ed = new TestCaseEditor(makeFakeDeps());
    ed.markDirty();
    let emitCount = 0;
    ed.on('dirty-changed', () => { emitCount++; });

    ed.markDirty();
    assert.strictEqual(emitCount, 0);
  });
});

describe('TestCaseEditor resetEditor', () => {
  test('resetEditor 编排 StepEditor.reset + OptionPanel 重置 + 清空 loadedConfigs', async () => {
    const TestCaseEditor = await loadTestCaseEditor();
    const deps = makeFakeDeps();
    const ed = new TestCaseEditor(deps);
    // 设置非默认值
    deps.stepEditor.steps = [{ id: 's1' }];
    deps.optionPanel.selectedApp = { id: 'x' };
    deps.optionPanel.selectedPlatform = 'ios';
    deps.optionPanel.selectedMarkers = ['smoke'];
    ed._set('loadedDeviceConfig', { dev: 1 });
    ed._set('loadedBleDevice', { ble: 2 });

    ed.resetEditor();

    assert.deepStrictEqual(deps.stepEditor.steps, []);
    assert.strictEqual(deps.optionPanel.selectedApp, null);
    assert.strictEqual(deps.optionPanel.selectedPlatform, 'android');
    assert.deepStrictEqual(deps.optionPanel.selectedMarkers, []);
    assert.strictEqual(ed.loadedDeviceConfig, null);
    assert.strictEqual(ed.loadedBleDevice, null);
  });

  test('resetEditor 触发 loaded-*-changed 事件', async () => {
    const TestCaseEditor = await loadTestCaseEditor();
    const ed = new TestCaseEditor(makeFakeDeps());
    ed._set('loadedDeviceConfig', { dev: 1 });
    ed._set('loadedBleDevice', { ble: 2 });
    const events = [];
    ed.on('loaded-device-config-changed', (v) => events.push(['dev', v]));
    ed.on('loaded-ble-device-changed', (v) => events.push(['ble', v]));

    ed.resetEditor();
    assert.ok(events.some(([t, v]) => t === 'dev' && v === null));
    assert.ok(events.some(([t, v]) => t === 'ble' && v === null));
  });
});

describe('TestCaseEditor selectFile', () => {
  test('selectFile 委托 FileBrowser + 清除 dirty + 触发 showEditor', async () => {
    const TestCaseEditor = await loadTestCaseEditor();
    const deps = makeFakeDeps();
    const ed = new TestCaseEditor(deps);
    ed.markDirty();
    let showEditorEmitted = null;
    ed.on('show-editor', (p) => { showEditorEmitted = p; });
    ed.on('editing-changed', () => {}); // 监听避免未捕获

    await new Promise((resolve) => {
      ed.on('show-editor', () => resolve());
      ed.selectFile({ name: 'test.py' });
    });

    assert.strictEqual(deps.fileBrowser.selectedFile.name, 'test.py');
    assert.strictEqual(ed.hasUnsavedChanges, false);
    assert.ok(showEditorEmitted);
  });

  test('selectFile 同步部分: 立即设置 selectedFile + clearDirty', async () => {
    const TestCaseEditor = await loadTestCaseEditor();
    const deps = makeFakeDeps();
    const ed = new TestCaseEditor(deps);
    ed.markDirty();

    // selectFile 是同步触发 fileBrowser.selectFile + clearDirty，然后异步 showEditor
    ed.selectFile({ name: 'x.py' });
    assert.strictEqual(deps.fileBrowser.selectedFile.name, 'x.py');
    assert.strictEqual(ed.hasUnsavedChanges, false);
  });
});

describe('TestCaseEditor deselectFile', () => {
  test('deselectFile 委托 FileBrowser + 清空 loadedConfigs + clearDirty', async () => {
    const TestCaseEditor = await loadTestCaseEditor();
    const deps = makeFakeDeps();
    const ed = new TestCaseEditor(deps);
    deps.fileBrowser.selectedFile = { name: 'x.py' };
    ed._set('loadedDeviceConfig', { dev: 1 });
    ed._set('loadedBleDevice', { ble: 2 });
    ed.markDirty();

    ed.deselectFile();
    assert.strictEqual(deps.fileBrowser.selectedFile, null);
    assert.strictEqual(ed.loadedDeviceConfig, null);
    assert.strictEqual(ed.loadedBleDevice, null);
    assert.strictEqual(ed.hasUnsavedChanges, false);
  });
});

describe('TestCaseEditor cancelEdit', () => {
  test('cancelEdit 编排 resetEditor + FileBrowser.deselectFile + isEditing=false + emit cancel-edit', async () => {
    const TestCaseEditor = await loadTestCaseEditor();
    const deps = makeFakeDeps();
    const ed = new TestCaseEditor(deps);
    deps.fileBrowser.selectedFile = { name: 'x.py' };
    ed._set('isEditing', true);
    ed.markDirty();
    ed._set('loadedDeviceConfig', { dev: 1 });

    let cancelEmitted = false;
    ed.on('cancel-edit', () => { cancelEmitted = true; });

    ed.cancelEdit();
    assert.strictEqual(ed.isEditing, false);
    assert.strictEqual(ed.hasUnsavedChanges, false);
    assert.strictEqual(ed.loadedDeviceConfig, null);
    assert.strictEqual(deps.fileBrowser.selectedFile, null);
    assert.strictEqual(deps.optionPanel.selectedApp, null);
    assert.ok(cancelEmitted);
  });
});

describe('TestCaseEditor showEditor', () => {
  test('showEditor(null) 新建模式: isEditing=false + resetEditor + emit show-editor isNew=true', async () => {
    const TestCaseEditor = await loadTestCaseEditor();
    const deps = makeFakeDeps();
    const ed = new TestCaseEditor(deps);
    let payload = null;
    ed.on('show-editor', (p) => { payload = p; });

    await ed.showEditor(null);
    assert.strictEqual(ed.isEditing, false);
    assert.deepStrictEqual(deps.stepEditor.steps, []);
    assert.strictEqual(deps.optionPanel.selectedApp, null);
    assert.ok(payload.isNew);
    assert.strictEqual(payload.fileName, '');
  });

  test('showEditor(file) JSON 存在: isEditing=true + emit show-editor + loadCaseData', async () => {
    const TestCaseEditor = await loadTestCaseEditor();
    const deps = makeFakeDeps({
      getCase: { data: { fileName: 'test', steps: [{ id: 's1' }], allureConfig: { markers: ['smoke'] }, targetApp: { id: 'a1' } } },
    });
    const ed = new TestCaseEditor(deps);
    let showPayload = null;
    let loadedPayload = null;
    ed.on('show-editor', (p) => { showPayload = p; });
    ed.on('case-loaded', (p) => { loadedPayload = p; });

    await ed.showEditor({ name: 'test.py' });
    assert.strictEqual(ed.isEditing, true);
    assert.ok(showPayload);
    assert.strictEqual(showPayload.fileName, 'test');
    assert.strictEqual(showPayload.jsonMissing, false);
    assert.ok(loadedPayload);
    assert.deepStrictEqual(deps.optionPanel.selectedMarkers, ['smoke']);
    assert.deepStrictEqual(deps.optionPanel.selectedApp, { id: 'a1' });
    assert.deepStrictEqual(deps.stepEditor.steps, [{ id: 's1' }]);
  });

  test('showEditor(file) JSON 缺失: isEditing=false + resetEditor + emit jsonMissing', async () => {
    const TestCaseEditor = await loadTestCaseEditor();
    const deps = makeFakeDeps({ checkJsonExists: { exists: false } });
    const ed = new TestCaseEditor(deps);
    let payload = null;
    ed.on('show-editor', (p) => { payload = p; });

    await ed.showEditor({ name: 'test.py' });
    assert.strictEqual(ed.isEditing, false);
    assert.ok(payload.jsonMissing);
    assert.deepStrictEqual(deps.stepEditor.steps, []);
  });

  test('showEditor API 抛错: emit error', async () => {
    const TestCaseEditor = await loadTestCaseEditor();
    const deps = makeFakeDeps({ checkJsonExists: Promise.reject(new Error('boom')) });
    const ed = new TestCaseEditor(deps);
    let errEvt = null;
    ed.on('error', (e) => { errEvt = e; });

    await ed.showEditor({ name: 'test.py' });
    assert.ok(errEvt);
    assert.strictEqual(errEvt.source, 'showEditor');
  });
});

describe('TestCaseEditor saveCase', () => {
  test('saveCase 验证 fileName 必填', async () => {
    const TestCaseEditor = await loadTestCaseEditor();
    const ed = new TestCaseEditor(makeFakeDeps());
    let errEvt = null;
    ed.on('error', (e) => { errEvt = e; });

    await ed.saveCase({ fileName: '' });
    assert.ok(errEvt);
    assert.strictEqual(errEvt.message, 'fileNameRequired');
  });

  test('saveCase 验证 fileName 字符集', async () => {
    const TestCaseEditor = await loadTestCaseEditor();
    const ed = new TestCaseEditor(makeFakeDeps());
    let errEvt = null;
    ed.on('error', (e) => { errEvt = e; });

    await ed.saveCase({ fileName: 'bad-name!' });
    assert.strictEqual(errEvt.message, 'fileNameInvalidChars');
  });

  test('saveCase 验证 selectedDirectory 必填', async () => {
    const TestCaseEditor = await loadTestCaseEditor();
    const deps = makeFakeDeps();
    deps.fileBrowser.selectedDirectory = null;
    const ed = new TestCaseEditor(deps);
    let errEvt = null;
    ed.on('error', (e) => { errEvt = e; });

    await ed.saveCase({ fileName: 'valid_name' });
    assert.strictEqual(errEvt.message, 'selectCaseFirst');
  });

  test('saveCase 验证 selectedApp 必填', async () => {
    const TestCaseEditor = await loadTestCaseEditor();
    const deps = makeFakeDeps();
    deps.optionPanel.selectedApp = null;
    const ed = new TestCaseEditor(deps);
    let errEvt = null;
    ed.on('error', (e) => { errEvt = e; });

    await ed.saveCase({ fileName: 'valid_name' });
    assert.strictEqual(errEvt.message, 'selectAppFirst');
  });

  test('saveCase 成功: clearDirty + emit case-saved + scanTestFiles', async () => {
    const TestCaseEditor = await loadTestCaseEditor();
    const deps = makeFakeDeps();
    deps.optionPanel.selectedApp = { id: 'app1' };
    const ed = new TestCaseEditor(deps);
    ed.markDirty();
    let savedPayload = null;
    ed.on('case-saved', (r) => { savedPayload = r; });

    await ed.saveCase({ fileName: 'valid_name', steps: [] });
    assert.strictEqual(ed.hasUnsavedChanges, false);
    assert.ok(savedPayload);
    assert.ok(deps.events.fb.some(([t]) => t === 'scanTestFiles'));
  });

  test('saveCase API 失败: emit error', async () => {
    const TestCaseEditor = await loadTestCaseEditor();
    const deps = makeFakeDeps({ saveAndGenerate: Promise.reject(new Error('save fail')) });
    deps.optionPanel.selectedApp = { id: 'app1' };
    const ed = new TestCaseEditor(deps);
    let errEvt = null;
    ed.on('error', (e) => { errEvt = e; });

    await ed.saveCase({ fileName: 'valid_name' });
    assert.ok(errEvt);
    assert.strictEqual(errEvt.message, 'saveFailed');
  });
});

describe('TestCaseEditor deleteCase', () => {
  test('deleteCase 成功: emit case-deleted + scanTestFiles', async () => {
    const TestCaseEditor = await loadTestCaseEditor();
    const deps = makeFakeDeps();
    const ed = new TestCaseEditor(deps);
    let deletedPayload = null;
    ed.on('case-deleted', (p) => { deletedPayload = p; });

    await ed.deleteCase('test', '/path/to/test.py');
    assert.ok(deletedPayload);
    assert.strictEqual(deletedPayload.fileName, 'test');
    assert.ok(deps.events.fb.some(([t]) => t === 'scanTestFiles'));
  });

  test('deleteCase API 失败: emit error', async () => {
    const TestCaseEditor = await loadTestCaseEditor();
    const deps = makeFakeDeps({ deleteCase: Promise.reject(new Error('del fail')) });
    const ed = new TestCaseEditor(deps);
    let errEvt = null;
    ed.on('error', (e) => { errEvt = e; });

    await ed.deleteCase('test', '/path/to/test.py');
    assert.ok(errEvt);
    assert.strictEqual(errEvt.message, 'deleteFailed');
  });
});

describe('TestCaseEditor loadCaseData', () => {
  test('loadCaseData 编排 OptionPanel + StepEditor + loadedConfigs', async () => {
    const TestCaseEditor = await loadTestCaseEditor();
    const deps = makeFakeDeps({
      getCase: { data: {
        fileName: 'test',
        steps: [{ id: 's1' }, { id: 's2' }],
        allureConfig: { markers: ['smoke', 'regression'] },
        targetApp: { id: 'app1' },
        deviceConfig: { deviceId: 'dev1' },
        bleDevice: { deviceId: 'ble1' },
      } },
    });
    const ed = new TestCaseEditor(deps);
    let loadedPayload = null;
    ed.on('case-loaded', (p) => { loadedPayload = p; });

    await ed.loadCaseData('test');
    assert.deepStrictEqual(deps.optionPanel.selectedMarkers, ['smoke', 'regression']);
    assert.deepStrictEqual(deps.optionPanel.selectedApp, { id: 'app1' });
    assert.deepStrictEqual(deps.stepEditor.steps, [{ id: 's1' }, { id: 's2' }]);
    assert.deepStrictEqual(ed.loadedDeviceConfig, { deviceId: 'dev1' });
    assert.deepStrictEqual(ed.loadedBleDevice, { deviceId: 'ble1' });
    assert.ok(loadedPayload);
  });

  test('loadCaseData 无 markers/app 时使用默认值', async () => {
    const TestCaseEditor = await loadTestCaseEditor();
    const deps = makeFakeDeps({
      getCase: { data: { fileName: 'test', steps: [] } },
    });
    const ed = new TestCaseEditor(deps);

    await ed.loadCaseData('test');
    assert.deepStrictEqual(deps.optionPanel.selectedMarkers, []);
    assert.strictEqual(deps.optionPanel.selectedApp, null);
    assert.deepStrictEqual(deps.stepEditor.steps, []);
    assert.strictEqual(ed.loadedDeviceConfig, null);
    assert.strictEqual(ed.loadedBleDevice, null);
  });

  test('loadCaseData API 失败: emit error', async () => {
    const TestCaseEditor = await loadTestCaseEditor();
    const deps = makeFakeDeps({ getCase: Promise.reject(new Error('load fail')) });
    const ed = new TestCaseEditor(deps);
    let errEvt = null;
    ed.on('error', (e) => { errEvt = e; });

    await ed.loadCaseData('test');
    assert.ok(errEvt);
    assert.strictEqual(errEvt.source, 'loadCaseData');
  });
});

describe('TestCaseEditor collectFormData', () => {
  test('collectFormData 收集 inputs + steps + markers + platform + app', async () => {
    const TestCaseEditor = await loadTestCaseEditor();
    const deps = makeFakeDeps();
    deps.optionPanel.selectedApp = { id: 'app1' };
    deps.optionPanel.selectedPlatform = 'android';
    deps.optionPanel.selectedMarkers = ['smoke'];
    const ed = new TestCaseEditor(deps);

    const data = ed.collectFormData({
      inputs: {
        fileName: 'test_case',
        caseName: '测试用例',
        description: '描述',
        epic: 'Epic1',
        feature: 'Feature1',
        story: 'Story1',
        appLoadWaitTime: '15',
        elementWaitTimeout: '30',
        stepInterval: '2',
        appCloseWaitTime: '3',
      },
      steps: [{ id: 's1', type: 'element' }],
    });

    assert.strictEqual(data.fileName, 'test_case');
    assert.strictEqual(data.name, '测试用例');
    assert.strictEqual(data.description, '描述');
    assert.strictEqual(data.platform, 'android');
    assert.deepStrictEqual(data.targetApp, { id: 'app1' });
    assert.deepStrictEqual(data.steps, [{ id: 's1', type: 'element' }]);
    assert.deepStrictEqual(data.allureConfig.markers, ['smoke']);
    assert.deepStrictEqual(data.allureConfig.epic, 'Epic1');
    assert.strictEqual(data.waitTimeConfig.appLoadWaitTime, 15);
    assert.strictEqual(data.waitTimeConfig.appCloseWaitTime, 3);
  });

  test('collectFormData inputs 缺失字段使用默认值', async () => {
    const TestCaseEditor = await loadTestCaseEditor();
    const ed = new TestCaseEditor(makeFakeDeps());

    const data = ed.collectFormData({ inputs: { fileName: 'x' }, steps: [] });

    assert.strictEqual(data.fileName, 'x');
    assert.strictEqual(data.name, 'x'); // caseName 缺失回退到 fileName
    assert.strictEqual(data.description, '');
    assert.strictEqual(data.platform, 'android');
    assert.strictEqual(data.waitTimeConfig.appLoadWaitTime, 10);
    assert.strictEqual(data.waitTimeConfig.elementWaitTimeout, 30);
  });

  test('collectFormData domData 为空对象使用全默认值', async () => {
    const TestCaseEditor = await loadTestCaseEditor();
    const ed = new TestCaseEditor(makeFakeDeps());

    const data = ed.collectFormData();

    assert.strictEqual(data.fileName, '');
    assert.strictEqual(data.platform, 'android');
    assert.deepStrictEqual(data.steps, []);
  });

  test('collectFormData 从 BLE 步骤提取 bleDevice', async () => {
    const TestCaseEditor = await loadTestCaseEditor();
    const deps = makeFakeDeps();
    deps.optionPanel.bleDevices = [{
      deviceId: 'ble1',
      name: 'BLE Dev',
      bleConfig: { uuids: 's1', uuidn: 'n1', uuidw: 'w1', bleName: 'Name', advData: 'adv' },
    }];
    const ed = new TestCaseEditor(deps);

    const data = ed.collectFormData({
      inputs: { fileName: 'x' },
      steps: [{
        type: 'ble',
        config: {
          deviceConfig: {
            deviceId: 'ble1',
            port: 'COM3',
            methodName: 'method1',
            params: { foo: 'bar' },
          },
        },
      }],
    });

    assert.ok(data.bleDevice);
    assert.strictEqual(data.bleDevice.deviceId, 'ble1');
    assert.strictEqual(data.bleDevice.port, 'COM3');
    assert.strictEqual(data.bleDevice.methodName, 'method1');
    assert.deepStrictEqual(data.bleDevice.methodParams, { foo: 'bar' });
    assert.strictEqual(data.bleDevice.uuids, 's1');
  });

  test('collectFormData 无 BLE 步骤时保留 loadedBleDevice', async () => {
    const TestCaseEditor = await loadTestCaseEditor();
    const ed = new TestCaseEditor(makeFakeDeps());
    ed._set('loadedBleDevice', { deviceId: 'loaded', port: 'COM5' });

    const data = ed.collectFormData({
      inputs: { fileName: 'x' },
      steps: [{ type: 'element' }],
    });

    assert.ok(data.bleDevice);
    assert.strictEqual(data.bleDevice.deviceId, 'loaded');
    assert.strictEqual(data.bleDevice.port, 'COM5');
  });

  test('collectFormData BLE 步骤优先使用 loadedBleDevice.port', async () => {
    const TestCaseEditor = await loadTestCaseEditor();
    const deps = makeFakeDeps();
    deps.optionPanel.bleDevices = [{
      deviceId: 'ble1',
      name: 'BLE',
      bleConfig: {},
    }];
    const ed = new TestCaseEditor(deps);
    ed._set('loadedBleDevice', { port: 'COM9' });

    const data = ed.collectFormData({
      inputs: { fileName: 'x' },
      steps: [{
        type: 'ble',
        config: { deviceConfig: { deviceId: 'ble1', port: 'COM3' } },
      }],
    });

    assert.strictEqual(data.bleDevice.port, 'COM9');
  });

  test('collectFormData deviceConfig 来自 loadedDeviceConfig', async () => {
    const TestCaseEditor = await loadTestCaseEditor();
    const ed = new TestCaseEditor(makeFakeDeps());
    ed._set('loadedDeviceConfig', { platform: 'android', version: '12' });

    const data = ed.collectFormData({ inputs: { fileName: 'x' }, steps: [] });
    assert.deepStrictEqual(data.deviceConfig, { platform: 'android', version: '12' });
  });
});

describe('TestCaseEditor _set 通用机制', () => {
  test('_set 同值不触发事件', async () => {
    const TestCaseEditor = await loadTestCaseEditor();
    const ed = new TestCaseEditor(makeFakeDeps());
    let emitCount = 0;
    ed.on('isEditing-changed', () => { emitCount++; });

    ed._set('isEditing', false); // 同 false
    assert.strictEqual(emitCount, 0);
  });

  test('_set 默认事件名', async () => {
    const TestCaseEditor = await loadTestCaseEditor();
    const ed = new TestCaseEditor(makeFakeDeps());
    let emitted = null;
    ed.on('isEditing-changed', (v) => { emitted = v; });

    ed._set('isEditing', true);
    assert.strictEqual(emitted, true);
  });
});

describe('TestCaseEditor destroy', () => {
  test('destroy 移除所有监听器', async () => {
    const TestCaseEditor = await loadTestCaseEditor();
    const ed = new TestCaseEditor(makeFakeDeps());
    let called = false;
    ed.on('test-event', () => { called = true; });

    ed.destroy();
    ed.emit('test-event');
    assert.strictEqual(called, false);
  });
});

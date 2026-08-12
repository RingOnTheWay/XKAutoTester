// TestCaseModel ↔ FileBrowser 集成测试 (R10)
// 验证 Model 正确委托 FileBrowser 状态/方法/事件转发

const { test, describe } = require('node:test');
const assert = require('node:assert');

let ModelClass;
async function loadModel() {
  if (!ModelClass) {
    const mod = await import('../../electron/renderer/tabs/test-case/model.js');
    ModelClass = mod.TestCaseModel;
  }
  return ModelClass;
}

describe('TestCaseModel FileBrowser 集成 (R10)', () => {
  test('Model 持有 FileBrowser 实例', async () => {
    const Model = await loadModel();
    const m = new Model();
    assert.ok(m.fileBrowser);
    assert.strictEqual(m.fileBrowser.constructor.name, 'FileBrowser');
  });

  test('FileBrowser 状态经 Model getter 暴露', async () => {
    const Model = await loadModel();
    const m = new Model();
    assert.strictEqual(m.selectedDirectory, null);
    assert.strictEqual(m.selectedFile, null);
    assert.deepStrictEqual(m.testFiles, []);
    assert.deepStrictEqual(m.jsonExistsMap, {});
    assert.strictEqual(m.searchQuery, '');
  });

  test('Model.get(key) 优先读 FileBrowser 状态', async () => {
    const Model = await loadModel();
    const m = new Model();
    m.fileBrowser._set('selectedDirectory', '/fake');
    assert.strictEqual(m.get('selectedDirectory'), '/fake');
    // Model 自有状态
    assert.strictEqual(m.get('isEditing'), false);
  });

  test('FileBrowser 事件转发到 Model', async () => {
    const Model = await loadModel();
    const m = new Model();
    const events = [];
    m.on('directory-changed', (p) => events.push(['dir', p]));
    m.on('files-changed', () => events.push(['files']));
    m.on('json-exists-changed', (map) => events.push(['json', map]));
    m.on('selected-file-changed', (f) => events.push(['file', f]));

    m.fileBrowser._set('selectedDirectory', '/x', 'directory-changed');
    m.fileBrowser._set('testFiles', [{ name: 'a.py' }], 'files-changed');
    m.fileBrowser._set('jsonExistsMap', { a: true }, 'json-exists-changed');
    m.fileBrowser.selectFile({ name: 'b.py' });

    assert.ok(events.some(([t, p]) => t === 'dir' && p === '/x'));
    assert.ok(events.some(([t]) => t === 'files'));
    assert.ok(events.some(([t, map]) => t === 'json' && map.a === true));
    assert.ok(events.some(([t, f]) => t === 'file' && f?.name === 'b.py'));
  });

  test('FileBrowser error 事件转发到 Model error', async () => {
    const Model = await loadModel();
    const m = new Model();
    let errEvt = null;
    m.on('error', (e) => { errEvt = e; });
    m.fileBrowser.emit('error', { source: 'test', error: new Error('boom') });
    assert.ok(errEvt);
    assert.strictEqual(errEvt.source, 'test');
  });

  test('Model.selectDirectory 委托 FileBrowser', async () => {
    const Model = await loadModel();
    const m = new Model();
    let called = false;
    m.fileBrowser.selectDirectory = async () => { called = true; };
    await m.selectDirectory();
    assert.strictEqual(called, true);
  });

  test('Model.scanTestFiles 委托 FileBrowser', async () => {
    const Model = await loadModel();
    const m = new Model();
    let calledWith = null;
    m.fileBrowser.scanTestFiles = async (dir) => { calledWith = dir; };
    await m.scanTestFiles('/fake');
    assert.strictEqual(calledWith, '/fake');
  });

  test('Model.batchCheckJsonExists 委托 FileBrowser', async () => {
    const Model = await loadModel();
    const m = new Model();
    let calledWith = null;
    m.fileBrowser.batchCheckJsonExists = async (names) => { calledWith = names; };
    await m.batchCheckJsonExists(['a', 'b']);
    assert.deepStrictEqual(calledWith, ['a', 'b']);
  });

  test('Model.setSearchQuery 委托 FileBrowser', async () => {
    const Model = await loadModel();
    const m = new Model();
    let calledWith = null;
    m.fileBrowser.setSearchQuery = (q) => { calledWith = q; };
    m.setSearchQuery('kw');
    assert.strictEqual(calledWith, 'kw');
  });

  test('Model.selectFile 编排 FileBrowser + 编辑器状态', async () => {
    const Model = await loadModel();
    const m = new Model();
    // Stub showEditor 避免 async API 调用
    m.showEditor = () => {};
    // 先标记为脏，selectFile 应重置为 false 并触发 dirty-changed
    m.markDirty();
    const file = { name: 'x.py' };
    let fileChangedEmitted = false;
    let dirtyChangedEmitted = false;
    m.on('selected-file-changed', () => { fileChangedEmitted = true; });
    m.on('dirty-changed', () => { dirtyChangedEmitted = true; });

    m.selectFile(file);
    assert.strictEqual(m.selectedFile, file);
    assert.strictEqual(m.hasUnsavedChanges, false);
    assert.ok(fileChangedEmitted);
    assert.ok(dirtyChangedEmitted);
  });

  test('Model.deselectFile 编排 FileBrowser + 编辑器状态', async () => {
    const Model = await loadModel();
    const m = new Model();
    m.showEditor = () => {};
    m.selectFile({ name: 'x.py' });
    m.testCaseEditor._set('loadedDeviceConfig', { dev: 1 }, 'loaded-device-config-changed');
    m.testCaseEditor._set('loadedBleDevice', { ble: 2 }, 'loaded-ble-device-changed');
    m.markDirty();

    m.deselectFile();
    assert.strictEqual(m.selectedFile, null);
    assert.strictEqual(m.loadedDeviceConfig, null);
    assert.strictEqual(m.loadedBleDevice, null);
    assert.strictEqual(m.hasUnsavedChanges, false);
  });

  test('Model.cancelEdit 编排 FileBrowser + 编辑器状态', async () => {
    const Model = await loadModel();
    const m = new Model();
    m.showEditor = () => {};
    m.selectFile({ name: 'x.py' });
    m.testCaseEditor._set('isEditing', true, 'editing-changed');
    m.markDirty();

    let cancelEmitted = false;
    m.on('cancel-edit', () => { cancelEmitted = true; });
    m.cancelEdit();
    assert.strictEqual(m.selectedFile, null);
    assert.strictEqual(m.isEditing, false);
    assert.strictEqual(m.hasUnsavedChanges, false);
    assert.strictEqual(m.loadedDeviceConfig, null);
    assert.strictEqual(m.loadedBleDevice, null);
    assert.ok(cancelEmitted);
  });
});

describe('TestCaseModel OptionPanel 集成 (R10)', () => {
  test('Model 持有 OptionPanel 实例', async () => {
    const Model = await loadModel();
    const m = new Model();
    assert.ok(m.optionPanel);
    assert.strictEqual(m.optionPanel.constructor.name, 'OptionPanel');
  });

  test('OptionPanel 状态经 Model getter 暴露', async () => {
    const Model = await loadModel();
    const m = new Model();
    assert.deepStrictEqual(m.apps, []);
    assert.strictEqual(m.selectedApp, null);
    assert.strictEqual(m.selectedPlatform, 'android');
    assert.deepStrictEqual(m.bleDevices, []);
    assert.deepStrictEqual(m.markers, []);
    assert.deepStrictEqual(m.selectedMarkers, []);
  });

  test('Model.get(key) 读 OptionPanel 状态', async () => {
    const Model = await loadModel();
    const m = new Model();
    m.optionPanel._set('selectedApp', { id: 'x' });
    assert.deepStrictEqual(m.get('selectedApp'), { id: 'x' });
    assert.strictEqual(m.get('selectedPlatform'), 'android');
  });

  test('OptionPanel 事件转发到 Model', async () => {
    const Model = await loadModel();
    const m = new Model();
    const events = [];
    m.on('apps-changed', (a) => events.push(['apps', a]));
    m.on('app-changed', (a) => events.push(['app', a]));
    m.on('platform-changed', (p) => events.push(['platform', p]));
    m.on('markers-changed', (mk) => events.push(['markers', mk]));
    m.on('markers-list-changed', (mk) => events.push(['markers-list', mk]));
    m.on('ble-devices-changed', (d) => events.push(['ble', d]));

    m.optionPanel._set('apps', [{ id: 'a' }], 'apps-changed');
    m.optionPanel.selectApp({ id: 'a' });
    m.optionPanel.selectPlatform('ios');
    m.optionPanel.toggleMarker('smoke');
    m.optionPanel._set('markers', [{ name: 'x' }], 'markers-list-changed');
    m.optionPanel._set('bleDevices', [{ deviceId: 'd' }], 'ble-devices-changed');

    assert.ok(events.some(([t, v]) => t === 'apps' && v.length === 1));
    assert.ok(events.some(([t, v]) => t === 'app' && v?.id === 'a'));
    assert.ok(events.some(([t, v]) => t === 'platform' && v === 'ios'));
    assert.ok(events.some(([t, v]) => t === 'markers' && v.includes('smoke')));
    assert.ok(events.some(([t, v]) => t === 'markers-list'));
    assert.ok(events.some(([t, v]) => t === 'ble'));
  });

  test('OptionPanel error 事件转发到 Model error', async () => {
    const Model = await loadModel();
    const m = new Model();
    let errEvt = null;
    m.on('error', (e) => { errEvt = e; });
    m.optionPanel.emit('error', { source: 'test', error: new Error('boom') });
    assert.ok(errEvt);
    assert.strictEqual(errEvt.source, 'test');
  });

  test('Model.loadApps 委托 OptionPanel', async () => {
    const Model = await loadModel();
    const m = new Model();
    let called = false;
    m.optionPanel.loadApps = async () => { called = true; };
    await m.loadApps();
    assert.strictEqual(called, true);
  });

  test('Model.loadBleDevices 委托 OptionPanel', async () => {
    const Model = await loadModel();
    const m = new Model();
    let called = false;
    m.optionPanel.loadBleDevices = async () => { called = true; };
    await m.loadBleDevices();
    assert.strictEqual(called, true);
  });

  test('Model.loadMarkers 委托 OptionPanel', async () => {
    const Model = await loadModel();
    const m = new Model();
    let called = false;
    m.optionPanel.loadMarkers = async () => { called = true; };
    await m.loadMarkers();
    assert.strictEqual(called, true);
  });

  test('Model.load 委托 OptionPanel.load', async () => {
    const Model = await loadModel();
    const m = new Model();
    let called = false;
    m.optionPanel.load = async () => { called = true; };
    await m.load();
    assert.strictEqual(called, true);
  });

  test('Model.selectApp 委托 OptionPanel', async () => {
    const Model = await loadModel();
    const m = new Model();
    let calledWith = null;
    m.optionPanel.selectApp = (app) => { calledWith = app; };
    const app = { id: 'x' };
    m.selectApp(app);
    assert.strictEqual(calledWith, app);
  });

  test('Model.selectPlatform 委托 OptionPanel', async () => {
    const Model = await loadModel();
    const m = new Model();
    let calledWith = null;
    m.optionPanel.selectPlatform = (p) => { calledWith = p; };
    m.selectPlatform('ios');
    assert.strictEqual(calledWith, 'ios');
  });

  test('Model.toggleMarker 委托 OptionPanel', async () => {
    const Model = await loadModel();
    const m = new Model();
    let calledWith = null;
    m.optionPanel.toggleMarker = (mk) => { calledWith = mk; };
    m.toggleMarker('smoke');
    assert.strictEqual(calledWith, 'smoke');
  });

  test('Model.replaceSelectedMarkers 委托 OptionPanel', async () => {
    const Model = await loadModel();
    const m = new Model();
    let calledWith = null;
    m.optionPanel.replaceSelectedMarkers = (mk) => { calledWith = mk; };
    m.replaceSelectedMarkers(['a', 'b']);
    assert.deepStrictEqual(calledWith, ['a', 'b']);
  });

  test('resetEditor 经 OptionPanel/StepEditor 重置选中状态', async () => {
    const Model = await loadModel();
    const m = new Model();
    // 设置非默认值
    m.selectApp({ id: 'x' });
    m.selectPlatform('ios');
    m.toggleMarker('smoke');
    m.setSteps([{ id: 's1' }]);
    m.testCaseEditor._set('loadedDeviceConfig', { dev: 1 }, 'loaded-device-config-changed');
    m.testCaseEditor._set('loadedBleDevice', { ble: 2 }, 'loaded-ble-device-changed');

    m.resetEditor();
    assert.strictEqual(m.selectedApp, null);
    assert.strictEqual(m.selectedPlatform, 'android');
    assert.deepStrictEqual(m.selectedMarkers, []);
    assert.deepStrictEqual(m.steps, []);
    assert.strictEqual(m.loadedDeviceConfig, null);
    assert.strictEqual(m.loadedBleDevice, null);
  });
});

describe('TestCaseModel StepEditor 集成 (R10)', () => {
  // i18n 桩 (addStep/copyStep 调用 window.i18n.t)
  if (!global.window) global.window = {};
  if (!global.window.i18n) {
    global.window.i18n = {
      t: (key, opts = {}) => {
        if (key === 'testCase.defaultStepName') return `步骤 ${opts.n || 1}`;
        if (key === 'testCase.copySuffix') return `${opts.name} 副本`;
        return key;
      },
    };
  }

  test('Model 持有 StepEditor 实例', async () => {
    const Model = await loadModel();
    const m = new Model();
    assert.ok(m.stepEditor);
    assert.strictEqual(m.stepEditor.constructor.name, 'StepEditor');
  });

  test('StepEditor 状态经 Model getter 暴露', async () => {
    const Model = await loadModel();
    const m = new Model();
    assert.deepStrictEqual(m.steps, []);
    assert.strictEqual(m.draggedStep, null);
  });

  test('Model.get(key) 读 StepEditor 状态', async () => {
    const Model = await loadModel();
    const m = new Model();
    m.stepEditor._set('draggedStep', { id: 'x' }, 'dragged-step-changed');
    assert.deepStrictEqual(m.get('draggedStep'), { id: 'x' });
    assert.deepStrictEqual(m.get('steps'), []);
  });

  test('StepEditor 事件转发到 Model', async () => {
    const Model = await loadModel();
    const m = new Model();
    const events = [];
    m.on('steps-changed', (s) => events.push(['steps', s]));
    m.on('step-updated', (p) => events.push(['updated', p]));
    m.on('dragged-step-changed', (s) => events.push(['dragged', s]));

    m.stepEditor.setSteps([{ id: 'a' }]);
    m.stepEditor.setDraggedStep({ id: 'x' });
    m.stepEditor._set('steps', [{ id: 'b' }], 'steps-changed');

    assert.ok(events.some(([t, v]) => t === 'steps' && v.length === 1));
    assert.ok(events.some(([t, v]) => t === 'dragged' && v?.id === 'x'));
  });

  test('Model.addStep 委托 StepEditor + 标记 dirty', async () => {
    const Model = await loadModel();
    const m = new Model();
    let stepsChangedEmitted = false;
    let dirtyChangedEmitted = false;
    m.on('steps-changed', () => { stepsChangedEmitted = true; });
    m.on('dirty-changed', () => { dirtyChangedEmitted = true; });

    const step = m.addStep();
    assert.ok(step);
    assert.strictEqual(m.steps.length, 1);
    assert.strictEqual(m.hasUnsavedChanges, true);
    assert.ok(stepsChangedEmitted);
    assert.ok(dirtyChangedEmitted);
  });

  test('Model.deleteStep 委托 StepEditor + 标记 dirty', async () => {
    const Model = await loadModel();
    const m = new Model();
    const s = m.addStep();
    m.clearDirty();

    let dirtyCount = 0;
    m.on('dirty-changed', () => { dirtyCount++; });

    m.deleteStep(s.id);
    assert.deepStrictEqual(m.steps, []);
    assert.strictEqual(m.hasUnsavedChanges, true);
    assert.ok(dirtyCount >= 1);
  });

  test('Model.copyStep 委托 StepEditor + 标记 dirty', async () => {
    const Model = await loadModel();
    const m = new Model();
    const orig = m.addStep();
    m.clearDirty();

    const copy = m.copyStep(orig.id);
    assert.ok(copy);
    assert.notStrictEqual(copy.id, orig.id);
    assert.strictEqual(m.steps.length, 2);
    assert.strictEqual(m.hasUnsavedChanges, true);
  });

  test('Model.moveStep 委托 StepEditor + 标记 dirty', async () => {
    const Model = await loadModel();
    const m = new Model();
    const s1 = m.addStep();
    const s2 = m.addStep();
    m.clearDirty();

    m.moveStep(s2.id, 'up');
    assert.strictEqual(m.steps[0].id, s2.id);
    assert.strictEqual(m.hasUnsavedChanges, true);
  });

  test('Model.changeStepType 委托 StepEditor + 标记 dirty', async () => {
    const Model = await loadModel();
    const m = new Model();
    const s = m.addStep();
    m.clearDirty();

    m.changeStepType(s.id, 'ble');
    assert.strictEqual(s.type, 'ble');
    assert.strictEqual(m.hasUnsavedChanges, true);
  });

  test('Model.updateStepName 委托 StepEditor + 标记 dirty', async () => {
    const Model = await loadModel();
    const m = new Model();
    const s = m.addStep();
    m.clearDirty();

    m.updateStepName(s.id, '新名');
    assert.strictEqual(s.name, '新名');
    assert.strictEqual(m.hasUnsavedChanges, true);
  });

  test('Model.updateStepSelect 委托 StepEditor + 标记 dirty + 触发 step-updated', async () => {
    const Model = await loadModel();
    const m = new Model();
    const s = m.addStep();
    m.clearDirty();

    let updatedPayload = null;
    m.on('step-updated', (p) => { updatedPayload = p; });

    m.updateStepSelect('tc-operation-select-1', 'sendText', s.id);
    assert.strictEqual(s.config.operation, 'sendText');
    assert.strictEqual(m.hasUnsavedChanges, true);
    assert.ok(updatedPayload);
    assert.strictEqual(updatedPayload.stepId, s.id);
  });

  test('Model.setSteps 不标记 dirty (加载场景)', async () => {
    const Model = await loadModel();
    const m = new Model();
    let dirtyCount = 0;
    m.on('dirty-changed', () => { dirtyCount++; });

    m.setSteps([{ id: 'a' }, { id: 'b' }]);
    assert.strictEqual(m.steps.length, 2);
    assert.strictEqual(m.hasUnsavedChanges, false);
    assert.strictEqual(dirtyCount, 0);
  });

  test('Model.resetSteps 不标记 dirty', async () => {
    const Model = await loadModel();
    const m = new Model();
    m.setSteps([{ id: 'a' }]);
    let dirtyCount = 0;
    m.on('dirty-changed', () => { dirtyCount++; });

    m.resetSteps();
    assert.deepStrictEqual(m.steps, []);
    assert.strictEqual(dirtyCount, 0);
  });

  test('Model.syncStepsFromDOM 静默同步 (无事件)', async () => {
    const Model = await loadModel();
    const m = new Model();
    let emitCount = 0;
    m.on('steps-changed', () => { emitCount++; });

    m.syncStepsFromDOM([{ id: 'a' }]);
    assert.strictEqual(m.steps.length, 1);
    assert.strictEqual(emitCount, 0);
  });

  test('Model.setDraggedStep 委托 StepEditor', async () => {
    const Model = await loadModel();
    const m = new Model();
    let emitted = null;
    m.on('dragged-step-changed', (s) => { emitted = s; });

    const step = { id: 'x' };
    m.setDraggedStep(step);
    assert.strictEqual(m.draggedStep, step);
    assert.strictEqual(emitted, step);
  });

  test('StepEditor.getApp 注入 OptionPanel.selectedApp', async () => {
    const Model = await loadModel();
    const m = new Model();
    m.optionPanel._set('selectedApp', { id: 'app1', name: 'App1' });
    assert.strictEqual(m.stepEditor._getApp()?.id, 'app1');
  });

  test('resetEditor 经 StepEditor 重置 steps', async () => {
    const Model = await loadModel();
    const m = new Model();
    m.setSteps([{ id: 'a' }, { id: 'b' }]);
    assert.strictEqual(m.steps.length, 2);

    m.resetEditor();
    assert.deepStrictEqual(m.steps, []);
  });
});

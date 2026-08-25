// OptionPanel 深模块单元测试 (R10 renderer mixin → deep module)
// 验证：应用列表/蓝牙设备/markers 加载、平台/应用/markers 选择、事件触发

const { test, describe } = require('node:test');
const assert = require('node:assert');

let OptionPanelClass;
async function loadOptionPanel() {
  if (!OptionPanelClass) {
    const mod = await import('../../electron/renderer/tabs/test-case/modules/OptionPanel.js');
    OptionPanelClass = mod.OptionPanel;
  }
  return OptionPanelClass;
}

function makeFakeApi(overrides = {}) {
  const calls = [];
  const api = {
    getApps: async () => {
      calls.push({ method: 'getApps' });
      return overrides.getApps ?? { success: true, data: [{ id: 'app1', name: 'App1' }] };
    },
    getBleDevices: async () => {
      calls.push({ method: 'getBleDevices' });
      return overrides.getBleDevices ?? { success: true, data: [{ deviceId: 'dev1', name: 'Dev1' }] };
    },
    getPytestMarkers: async () => {
      calls.push({ method: 'getPytestMarkers' });
      return overrides.getPytestMarkers ?? [{ name: 'smoke', description: 'Smoke test' }];
    },
  };
  return { api, calls };
}

describe('OptionPanel 初始状态', () => {
  test('初始状态所有字段为默认值', async () => {
    const OptionPanel = await loadOptionPanel();
    const op = new OptionPanel({});
    assert.deepStrictEqual(op.apps, []);
    assert.strictEqual(op.selectedApp, null);
    assert.strictEqual(op.selectedPlatform, 'android');
    assert.deepStrictEqual(op.bleDevices, []);
    assert.deepStrictEqual(op.markers, []);
    assert.deepStrictEqual(op.selectedMarkers, []);
  });

  test('get(key) 读取状态', async () => {
    const OptionPanel = await loadOptionPanel();
    const op = new OptionPanel({});
    assert.deepStrictEqual(op.get('apps'), []);
    assert.strictEqual(op.get('selectedPlatform'), 'android');
    assert.strictEqual(op.get('nonexistent'), undefined);
  });
});

describe('OptionPanel loadApps', () => {
  test('加载应用列表并触发 apps-changed', async () => {
    const OptionPanel = await loadOptionPanel();
    const { api } = makeFakeApi();
    const op = new OptionPanel(api);
    let emitted = null;
    op.on('apps-changed', (apps) => { emitted = apps; });
    await op.loadApps();
    assert.strictEqual(op.apps.length, 1);
    assert.strictEqual(op.apps[0].id, 'app1');
    assert.deepStrictEqual(emitted, op.apps);
  });

  test('API 抛错时触发 error 不修改 apps', async () => {
    const OptionPanel = await loadOptionPanel();
    const api = { getApps: async () => { throw new Error('boom'); } };
    const op = new OptionPanel(api);
    let errEvt = null;
    op.on('error', (e) => { errEvt = e; });
    await op.loadApps();
    assert.deepStrictEqual(op.apps, []);
    assert.strictEqual(errEvt.source, 'loadApps');
  });
});

describe('OptionPanel loadBleDevices', () => {
  test('加载蓝牙设备并触发 ble-devices-changed', async () => {
    const OptionPanel = await loadOptionPanel();
    const { api } = makeFakeApi();
    const op = new OptionPanel(api);
    let emitted = null;
    op.on('ble-devices-changed', (devs) => { emitted = devs; });
    await op.loadBleDevices();
    assert.strictEqual(op.bleDevices.length, 1);
    assert.strictEqual(op.bleDevices[0].deviceId, 'dev1');
    assert.deepStrictEqual(emitted, op.bleDevices);
  });
});

describe('OptionPanel loadMarkers', () => {
  test('加载 markers 列表并触发 markers-list-changed', async () => {
    const OptionPanel = await loadOptionPanel();
    const { api } = makeFakeApi();
    const op = new OptionPanel(api);
    let emitted = null;
    op.on('markers-list-changed', (m) => { emitted = m; });
    await op.loadMarkers();
    assert.strictEqual(op.markers.length, 1);
    assert.strictEqual(op.markers[0].name, 'smoke');
    assert.deepStrictEqual(emitted, op.markers);
  });

  test('API 抛错时 markers 回退为空 + error 事件', async () => {
    const OptionPanel = await loadOptionPanel();
    const api = { getPytestMarkers: async () => { throw new Error('boom'); } };
    const op = new OptionPanel(api);
    let errEvt = null;
    op.on('error', (e) => { errEvt = e; });
    await op.loadMarkers();
    assert.deepStrictEqual(op.markers, []);
    assert.strictEqual(errEvt.source, 'loadMarkers');
  });
});

describe('OptionPanel load (并行)', () => {
  test('并行加载 3 种引用数据', async () => {
    const OptionPanel = await loadOptionPanel();
    const { api, calls } = makeFakeApi();
    const op = new OptionPanel(api);
    await op.load();
    assert.strictEqual(calls.length, 3);
    assert.ok(calls.some(c => c.method === 'getApps'));
    assert.ok(calls.some(c => c.method === 'getBleDevices'));
    assert.ok(calls.some(c => c.method === 'getPytestMarkers'));
    assert.strictEqual(op.apps.length, 1);
    assert.strictEqual(op.bleDevices.length, 1);
    assert.strictEqual(op.markers.length, 1);
  });
});

describe('OptionPanel selectApp / selectPlatform', () => {
  test('selectApp 更新 selectedApp 并触发 app-changed', async () => {
    const OptionPanel = await loadOptionPanel();
    const op = new OptionPanel({});
    let emitted = null;
    op.on('app-changed', (app) => { emitted = app; });
    const app = { id: 'a1', name: 'App1' };
    op.selectApp(app);
    assert.strictEqual(op.selectedApp, app);
    assert.strictEqual(emitted, app);
  });

  test('selectApp 相同引用不重复触发', async () => {
    const OptionPanel = await loadOptionPanel();
    const op = new OptionPanel({});
    const app = { id: 'a1' };
    op.selectApp(app);
    let count = 0;
    op.on('app-changed', () => { count++; });
    op.selectApp(app);
    assert.strictEqual(count, 0);
  });

  test('selectPlatform 更新并触发 platform-changed', async () => {
    const OptionPanel = await loadOptionPanel();
    const op = new OptionPanel({});
    let emitted = null;
    op.on('platform-changed', (p) => { emitted = p; });
    op.selectPlatform('ios');
    assert.strictEqual(op.selectedPlatform, 'ios');
    assert.strictEqual(emitted, 'ios');
  });
});

describe('OptionPanel toggleMarker', () => {
  test('添加 marker 并触发 markers-changed', async () => {
    const OptionPanel = await loadOptionPanel();
    const op = new OptionPanel({});
    let emitted = null;
    op.on('markers-changed', (m) => { emitted = m; });
    op.toggleMarker('smoke');
    assert.deepStrictEqual(op.selectedMarkers, ['smoke']);
    assert.deepStrictEqual(emitted, ['smoke']);
  });

  test('再次 toggle 移除 marker', async () => {
    const OptionPanel = await loadOptionPanel();
    const op = new OptionPanel({});
    op.toggleMarker('smoke');
    op.toggleMarker('regression');
    assert.deepStrictEqual(op.selectedMarkers, ['smoke', 'regression']);
    op.toggleMarker('smoke');
    assert.deepStrictEqual(op.selectedMarkers, ['regression']);
  });
});

describe('OptionPanel replaceSelectedMarkers', () => {
  test('批量替换并触发 markers-changed', async () => {
    const OptionPanel = await loadOptionPanel();
    const op = new OptionPanel({});
    op.toggleMarker('a');
    let emitted = null;
    op.on('markers-changed', (m) => { emitted = m; });
    op.replaceSelectedMarkers(['x', 'y']);
    assert.deepStrictEqual(op.selectedMarkers, ['x', 'y']);
    assert.deepStrictEqual(emitted, ['x', 'y']);
  });

  test('空数组/null 安全处理', async () => {
    const OptionPanel = await loadOptionPanel();
    const op = new OptionPanel({});
    op.replaceSelectedMarkers(null);
    assert.deepStrictEqual(op.selectedMarkers, []);
  });
});

describe('OptionPanel 事件独立于 Model', () => {
  test('OptionPanel 是独立 EventEmitter', async () => {
    const OptionPanel = await loadOptionPanel();
    const { api } = makeFakeApi();
    const op = new OptionPanel(api);
    const received = [];
    op.on('apps-changed', () => received.push('apps'));
    op.on('app-changed', () => received.push('app'));
    op.on('markers-changed', () => received.push('markers'));

    await op.loadApps();
    op.selectApp({ id: 'x' });
    op.toggleMarker('m');

    assert.ok(received.includes('apps'));
    assert.ok(received.includes('app'));
    assert.ok(received.includes('markers'));
  });
});

// android-connection model 路径安全回归 (R25 P3-11)
// 回归覆盖:
// - loadFileList 前 sanitizeRemotePath 拒绝 shell 元字符 (ls 命令拼接面)
// - sanitizeRemotePath 合法路径放行
// - downloadFile 设备文件名 basename 清洗 (防 ../../ 路径穿越写本地任意位置)
// 注意: model._state/_api 是只读 getter, 状态经 _set() 设置, API 经 window.electronAPI mock。

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const { JSDOM } = require(path.join(__dirname, '..', '..', 'electron', 'node_modules', 'jsdom'));

let dom;
const savedGlobals = {};

function setupJsdom() {
  dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { pretendToBeVisual: true });
  const { window } = dom;
  for (const k of ['document', 'window']) {
    savedGlobals[k] = global[k];
    global[k] = window[k];
  }
  global.window.electronAPI = {};
  global.window.i18n = { t: (k) => k };
}

function teardownJsdom() {
  for (const k of Object.keys(savedGlobals)) {
    if (savedGlobals[k] === undefined) delete global[k];
    else global[k] = savedGlobals[k];
  }
  if (dom) dom.window.close();
  dom = null;
}

let ModelClass;
async function loadModel() {
  if (!ModelClass) {
    const mod = await import('../../electron/renderer/tabs/android-connection/model.js');
    ModelClass = mod.AndroidConnectionModel;
  }
  return ModelClass;
}

before(setupJsdom);
after(teardownJsdom);

function createModel(state = {}) {
  const model = new ModelClass();
  model._set('selectedDevice', 'dev1');
  model._set('currentPath', '/sdcard');
  model._set('fileList', []);
  model._set('selectedFiles', []);
  for (const [k, v] of Object.entries(state)) {
    model._set(k, v);
  }
  return model;
}

test('P3-11 sanitizeRemotePath 拒绝 shell 元字符/控制字符', async () => {
  await loadModel();
  const model = createModel();

  const bad = ['/sdcard;rm -rf /', '/sdcard`id`', '/sdcard$(reboot)', '/sdcard|ls', '/sd\ncard', '/sd\\card', '/sd"quote'];
  for (const p of bad) {
    assert.strictEqual(model.sanitizeRemotePath(p), null, `应拒绝: ${p}`);
  }
});

test('P3-11 sanitizeRemotePath 合法路径放行', async () => {
  await loadModel();
  const model = createModel();

  assert.strictEqual(model.sanitizeRemotePath('/sdcard/DCIM'), '/sdcard/DCIM');
  assert.strictEqual(model.sanitizeRemotePath('/sdcard/my folder'), '/sdcard/my folder', '空格路径合法');
  assert.strictEqual(model.sanitizeRemotePath(''), null, '空串拒绝');
  assert.strictEqual(model.sanitizeRemotePath(null), null, 'null 拒绝');
});

test('P3-11 loadFileList 非法路径 → 不执行命令 + emit error', async () => {
  await loadModel();
  const model = createModel({ currentPath: '/sdcard;reboot' });
  let execCalled = false;
  model.executeAdbCommand = async () => {
    execCalled = true;
    return { output: '' };
  };
  const errors = [];
  model.on('file-list-error', (e) => errors.push(e));
  model.on('error', (e) => errors.push(e));

  await model.loadFileList();

  assert.strictEqual(execCalled, false, '非法路径不得执行 adb 命令');
  assert.ok(errors.length >= 1, '应 emit 错误');
});

test('P3-11 downloadFile 设备文件名 basename 清洗 (防路径穿越)', async () => {
  await loadModel();
  const model = createModel();
  const calledLocalPaths = [];
  global.window.electronAPI.downloadFile = async (remotePath, localPath, deviceId) => {
    calledLocalPaths.push(localPath);
    return { success: true };
  };

  // 恶意文件名: ../../ 穿越 + 反斜杠穿越 + 绝对路径形态
  const evilCases = [
    { name: '../../evil.sh', expect: 'evil.sh' },
    { name: '..\\..\\evil.sh', expect: 'evil.sh' },
    { name: '/etc/passwd', expect: 'passwd' },
    { name: 'normal.txt', expect: 'normal.txt' },
  ];
  for (const c of evilCases) {
    const result = await model.downloadFile({ path: '/sdcard/x', name: c.name }, '/downloads');
    assert.strictEqual(result.success, true);
    assert.strictEqual(
      calledLocalPaths[calledLocalPaths.length - 1],
      `/downloads/${c.expect}`,
      `${c.name} 应清洗为 ${c.expect}`
    );
  }
});

test('P3-11 downloadFile 特殊名 (./.. / 空) 拒绝下载', async () => {
  await loadModel();
  const model = createModel();
  let downloadCalled = false;
  global.window.electronAPI.downloadFile = async () => {
    downloadCalled = true;
    return { success: true };
  };

  const r1 = await model.downloadFile({ path: '/sdcard/x', name: '..' }, '/downloads');
  assert.strictEqual(r1.success, false, '.. 拒绝');
  const r2 = await model.downloadFile({ path: '/sdcard/x', name: '.' }, '/downloads');
  assert.strictEqual(r2.success, false, '. 拒绝');
  const r3 = await model.downloadFile({ path: '/sdcard/x', name: '' }, '/downloads');
  assert.strictEqual(r3.success, false, '空名拒绝');
  assert.strictEqual(downloadCalled, false, '特殊名不得触发下载');
});

// ── R27: bind specs 缺 deleteRemoteFile/renameRemoteFile → "is not a function" ──

test('R27 deleteFile 经 _api.deleteRemoteFile 转发 (bind specs 完备)', async () => {
  const calls = [];
  // ApiBridge #api 首次访问缓存 electronAPI 引用 — 须在既有对象上加属性 (整体替换无效)
  global.window.electronAPI.deleteRemoteFile = async (...args) => {
    calls.push(args);
    return { success: true };
  };
  const model = new (await loadModel())();
  try {
    const result = await model.deleteFile({ path: '/sdcard/a.txt', isDirectory: false });
    assert.strictEqual(result.success, true);
    assert.strictEqual(calls.length, 1, 'bind specs 含 deleteRemoteFile');
    assert.strictEqual(calls[0][0], '/sdcard/a.txt');
  } finally {
    delete global.window.electronAPI.deleteRemoteFile;
  }
});

test('R27 renameFile 经 _api.renameRemoteFile 转发 (bind specs 完备)', async () => {
  const calls = [];
  global.window.electronAPI.renameRemoteFile = async (...args) => {
    calls.push(args);
    return { success: true };
  };
  const model = new (await loadModel())();
  try {
    const result = await model.renameFile({ path: '/sdcard/a.txt', name: 'a.txt' }, 'b.txt');
    assert.strictEqual(result.success, true);
    assert.strictEqual(calls.length, 1, 'bind specs 含 renameRemoteFile');
    assert.strictEqual(calls[0][0], '/sdcard/a.txt');
    assert.strictEqual(calls[0][1], 'b.txt');
  } finally {
    delete global.window.electronAPI.renameRemoteFile;
  }
});

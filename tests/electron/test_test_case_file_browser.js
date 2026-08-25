// FileBrowser 深模块单元测试 (R10 renderer mixin → deep module)
// 验证：目录选择/文件扫描/JSON 存在性/搜索/文件选中/事件转发

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');

// 动态 import ESM 模块
let FileBrowserClass;
async function loadFileBrowser() {
  if (!FileBrowserClass) {
    const mod = await import('../../electron/renderer/tabs/test-case/modules/FileBrowser.js');
    FileBrowserClass = mod.FileBrowser;
  }
  return FileBrowserClass;
}

// 构造 fake api，记录调用并返回受控结果
function makeFakeApi(overrides = {}) {
  const calls = [];
  const api = {
    selectDirectory: async () => {
      calls.push({ method: 'selectDirectory' });
      return overrides.selectDirectory ?? { canceled: false, filePaths: ['/fake/dir'] };
    },
    scanTestFiles: async (dir) => {
      calls.push({ method: 'scanTestFiles', dir });
      return overrides.scanTestFiles ?? [
        { name: 'test_a.py', path: '/fake/dir/test_a.py' },
        { name: 'test_b.py', path: '/fake/dir/test_b.py' },
      ];
    },
    batchCheckJsonExists: async (names) => {
      calls.push({ method: 'batchCheckJsonExists', names });
      return overrides.batchCheckJsonExists ?? { success: true, data: { test_a: true, test_b: false } };
    },
  };
  return { api, calls };
}

describe('FileBrowser 初始状态', () => {
  test('初始状态所有字段为默认值', async () => {
    const FileBrowser = await loadFileBrowser();
    const fb = new FileBrowser({});
    assert.strictEqual(fb.selectedDirectory, null);
    assert.strictEqual(fb.selectedFile, null);
    assert.deepStrictEqual(fb.testFiles, []);
    assert.deepStrictEqual(fb.jsonExistsMap, {});
    assert.strictEqual(fb.searchQuery, '');
  });

  test('get(key) 读取状态', async () => {
    const FileBrowser = await loadFileBrowser();
    const fb = new FileBrowser({});
    assert.strictEqual(fb.get('selectedDirectory'), null);
    assert.strictEqual(fb.get('nonexistent'), undefined);
  });
});

describe('FileBrowser selectDirectory', () => {
  test('用户取消选择时不更新状态', async () => {
    const FileBrowser = await loadFileBrowser();
    const { api } = makeFakeApi({ selectDirectory: { canceled: true, filePaths: [] } });
    const fb = new FileBrowser(api);
    let emitted = false;
    fb.on('directory-changed', () => { emitted = true; });
    await fb.selectDirectory();
    assert.strictEqual(fb.selectedDirectory, null);
    assert.strictEqual(emitted, false);
  });

  test('选择目录后更新 selectedDirectory 并触发扫描', async () => {
    const FileBrowser = await loadFileBrowser();
    const { api, calls } = makeFakeApi();
    const fb = new FileBrowser(api);
    const events = [];
    fb.on('directory-changed', (p) => events.push(['directory-changed', p]));
    fb.on('files-changed', () => events.push(['files-changed']));
    fb.on('json-exists-changed', (m) => events.push(['json-exists-changed', m]));

    await fb.selectDirectory();

    assert.strictEqual(fb.selectedDirectory, '/fake/dir');
    assert.ok(calls.some(c => c.method === 'scanTestFiles' && c.dir === '/fake/dir'));
    assert.ok(calls.some(c => c.method === 'batchCheckJsonExists'));
    // 事件顺序: directory-changed → files-changed (testFiles set) → json-exists-changed → files-changed (jsonExists updated)
    assert.ok(events.some(([t]) => t === 'directory-changed'));
    assert.ok(events.filter(([t]) => t === 'files-changed').length >= 2);
    assert.ok(events.some(([t]) => t === 'json-exists-changed'));
    assert.deepStrictEqual(fb.jsonExistsMap, { test_a: true, test_b: false });
  });

  test('selectDirectory 抛错时触发 error 事件', async () => {
    const FileBrowser = await loadFileBrowser();
    const api = {
      selectDirectory: async () => { throw new Error('boom'); },
    };
    const fb = new FileBrowser(api);
    let errEvt = null;
    fb.on('error', (e) => { errEvt = e; });
    await fb.selectDirectory();
    assert.ok(errEvt);
    assert.strictEqual(errEvt.source, 'selectDirectory');
    assert.match(errEvt.error.message, /boom/);
  });
});

describe('FileBrowser scanTestFiles', () => {
  test('空目录直接返回不扫描', async () => {
    const FileBrowser = await loadFileBrowser();
    const { api, calls } = makeFakeApi();
    const fb = new FileBrowser(api);
    await fb.scanTestFiles('');
    assert.strictEqual(calls.length, 0);
  });

  test('扫描后更新 testFiles + 清空 searchQuery + 批量检查 JSON', async () => {
    const FileBrowser = await loadFileBrowser();
    const { api, calls } = makeFakeApi();
    const fb = new FileBrowser(api);
    fb.setSearchQuery('old-query'); // 模拟旧查询 (公共 API)
    await fb.scanTestFiles('/fake/dir');
    assert.strictEqual(fb.testFiles.length, 2);
    assert.strictEqual(fb.searchQuery, '');
    assert.ok(calls.some(c => c.method === 'batchCheckJsonExists' && c.names.length === 2));
  });

  test('扫描抛错时触发 error', async () => {
    const FileBrowser = await loadFileBrowser();
    const api = {
      scanTestFiles: async () => { throw new Error('scan-fail'); },
    };
    const fb = new FileBrowser(api);
    let errEvt = null;
    fb.on('error', (e) => { errEvt = e; });
    await fb.scanTestFiles('/fake/dir');
    assert.strictEqual(errEvt.source, 'scanTestFiles');
  });
});

describe('FileBrowser batchCheckJsonExists', () => {
  test('空列表清空 jsonExistsMap 并触发 files-changed', async () => {
    const FileBrowser = await loadFileBrowser();
    // 先用非空结果建立非空 baseline (公共 API 路径)
    const { api } = makeFakeApi({ batchCheckJsonExists: { success: true, data: { old: true } } });
    const fb = new FileBrowser(api);
    await fb.batchCheckJsonExists(['old']);
    assert.deepStrictEqual(fb.jsonExistsMap, { old: true });
    let filesChanged = 0;
    fb.on('files-changed', () => { filesChanged++; });
    await fb.batchCheckJsonExists([]);
    assert.deepStrictEqual(fb.jsonExistsMap, {});
    assert.ok(filesChanged >= 1);
  });

  test('API 抛错时回退为空 map 并触发 error', async () => {
    const FileBrowser = await loadFileBrowser();
    const api = {
      batchCheckJsonExists: async () => { throw new Error('batch-fail'); },
    };
    const fb = new FileBrowser(api);
    let errEvt = null;
    fb.on('error', (e) => { errEvt = e; });
    await fb.batchCheckJsonExists(['a', 'b']);
    assert.deepStrictEqual(fb.jsonExistsMap, {});
    assert.strictEqual(errEvt.source, 'batchCheckJsonExists');
  });
});

describe('FileBrowser setSearchQuery', () => {
  test('更新 searchQuery 并触发 files-changed', async () => {
    const FileBrowser = await loadFileBrowser();
    const { api } = makeFakeApi();
    const fb = new FileBrowser(api);
    let emitted = null;
    fb.on('files-changed', () => { emitted = true; });
    fb.setSearchQuery('keyword');
    assert.strictEqual(fb.searchQuery, 'keyword');
    assert.strictEqual(emitted, true);
  });

  test('相同值不重复触发事件', async () => {
    const FileBrowser = await loadFileBrowser();
    const { api } = makeFakeApi();
    const fb = new FileBrowser(api);
    fb.setSearchQuery('kw');
    let count = 0;
    fb.on('files-changed', () => { count++; });
    fb.setSearchQuery('kw'); // 同值
    assert.strictEqual(count, 0);
  });
});

describe('FileBrowser selectFile / deselectFile', () => {
  test('selectFile 更新 selectedFile 并触发 selected-file-changed', async () => {
    const FileBrowser = await loadFileBrowser();
    const fb = new FileBrowser({});
    let emitted = null;
    fb.on('selected-file-changed', (f) => { emitted = f; });
    const file = { name: 'test_a.py', path: '/x/test_a.py' };
    fb.selectFile(file);
    assert.strictEqual(fb.selectedFile, file);
    assert.strictEqual(emitted, file);
  });

  test('deselectFile 清空 selectedFile 并触发 selected-file-changed (null)', async () => {
    const FileBrowser = await loadFileBrowser();
    const fb = new FileBrowser({});
    fb.selectFile({ name: 'x.py' });
    let emitted = 'not-null';
    fb.on('selected-file-changed', (f) => { emitted = f; });
    fb.deselectFile();
    assert.strictEqual(fb.selectedFile, null);
    assert.strictEqual(emitted, null);
  });

  test('selectFile 相同引用不重复触发事件', async () => {
    const FileBrowser = await loadFileBrowser();
    const fb = new FileBrowser({});
    const file = { name: 'x.py' };
    fb.selectFile(file);
    let count = 0;
    fb.on('selected-file-changed', () => { count++; });
    fb.selectFile(file); // 同引用
    assert.strictEqual(count, 0);
  });
});

describe('FileBrowser 事件独立于 Model', () => {
  test('FileBrowser 是独立 EventEmitter，不依赖 Model', async () => {
    const FileBrowser = await loadFileBrowser();
    const { api } = makeFakeApi();
    const fb = new FileBrowser(api);
    const received = [];
    fb.on('directory-changed', (p) => received.push(['dir', p]));
    fb.on('files-changed', () => received.push(['files']));
    fb.on('json-exists-changed', (m) => received.push(['json', m]));

    await fb.selectDirectory();
    assert.ok(received.some(([t]) => t === 'dir'));
    assert.ok(received.some(([t]) => t === 'files'));
    assert.ok(received.some(([t]) => t === 'json'));
  });
});

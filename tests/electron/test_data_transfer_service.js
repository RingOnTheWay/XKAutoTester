// DataTransferService 单测 — 3 factory 注入 + 懒初始化 + 3 纯函数 + _exportPath 统一。
// 验证: constructor 收 3 factory + 懒初始化 + exportConfig (config 路径不存在/空目录/正常打包) +
//      exportLogs (委托 _exportPath) + importConfig (zip 不存在/无 manifest/无效 manifest/正常解压) +
//      buildManifest + buildProgress + isValidManifest + mainWindow 双路径。
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const SERVICE_PATH = path.join(
  __dirname, '..', '..', 'electron', 'src', 'main', 'services', 'DataTransferService.js'
);
const { DataTransferService, buildManifest, buildProgress, isValidManifest } = require(SERVICE_PATH);

// ── Fakes ──────────────────────────────────────────────

function makeFakeFileSystem(opts = {}) {
  const calls = { exists: [], readdir: [], mkdir: [], writeFile: [] };
  const normalizePath = (p) => path.normalize(p);
  const dirs = {};
  for (const k in (opts.dirs || {})) dirs[normalizePath(k)] = opts.dirs[k];
  const files = {};
  for (const k in (opts.files || {})) files[normalizePath(k)] = opts.files[k];
  return {
    calls,
    exists: async (p) => {
      calls.exists.push(p);
      const np = normalizePath(p);
      return dirs[np] !== undefined || files[np] !== undefined;
    },
    readdir: async (d) => {
      calls.readdir.push(d);
      const nd = normalizePath(d);
      return dirs[nd] || [];
    },
    mkdir: async (d) => { calls.mkdir.push(d); },
    writeFile: async (p, content) => {
      calls.writeFile.push({ path: p, content });
      files[normalizePath(p)] = content;
    },
  };
}

function makeFakeZip(opts = {}) {
  const createCalls = { addFile: [], addLocalFile: [], writeZip: [] };
  const openCalls = { getEntries: 0 };
  return {
    createCalls,
    openCalls,
    create: () => ({
      addFile: (name, content) => { createCalls.addFile.push({ name, content }); },
      addLocalFile: (fullPath, dirInZip) => { createCalls.addLocalFile.push({ fullPath, dirInZip }); },
      writeZip: (out) => { createCalls.writeZip.push(out); },
    }),
    open: (zipPath) => ({
      getEntries: () => {
        openCalls.getEntries++;
        return opts.entries || [];
      },
    }),
  };
}

function makeFakeMainWindow() {
  const sent = [];
  return {
    sent,
    isDestroyed: () => false,
    webContents: { send: (channel, data) => sent.push({ channel, data }) },
  };
}

function makeFakeI18n() {
  return { t: (key, opts) => key + (opts ? `:${JSON.stringify(opts)}` : '') };
}

function makeFakeVersion() {
  return { getVersion: () => '0.1.3-test' };
}

function makeFakeApp(opts = {}) {
  const fileSystem = makeFakeFileSystem(opts.fileSystem || {});
  const zip = makeFakeZip(opts.zip || {});
  const mainWindow = opts.mainWindow || null;
  const mainWindowProvider = opts.mainWindowProvider || (() => mainWindow);
  const userDataService = opts.userDataService || {
    userConfigPath: '/fake/config',
    userDataPath: '/fake/data',
  };
  const i18nService = makeFakeI18n();
  const versionService = makeFakeVersion();

  const svc = new DataTransferService(userDataService, i18nService, versionService, {
    fileSystemFactory: () => fileSystem,
    zipFactory: () => zip,
    mainWindowProvider,
  });

  return { svc, fileSystem, zip, mainWindow, userDataService, i18nService, versionService };
}

// ── 纯函数测试 ────────────────────────────────────────────

test('buildManifest 构造标准 manifest', () => {
  const fileEntries = [{ relativePath: 'a.json' }, { relativePath: 'b.json' }];
  const m = buildManifest('config', '0.1.3', fileEntries);
  assert.strictEqual(m.type, 'config');
  assert.strictEqual(m.version, '0.1.3');
  assert.strictEqual(m.app, 'XKAutoTester');
  assert.deepStrictEqual(m.files, ['a.json', 'b.json']);
  assert.ok(m.exportDate, 'exportDate 存在');
});

test('buildProgress percentage 计算 (total>0)', () => {
  const p = buildProgress('packing', 2, 5, 'a.json', 'msg');
  assert.strictEqual(p.phase, 'packing');
  assert.strictEqual(p.current, 2);
  assert.strictEqual(p.total, 5);
  assert.strictEqual(p.percentage, 40, 'Math.round(2/5*100)=40');
  assert.strictEqual(p.currentFile, 'a.json');
  assert.strictEqual(p.message, 'msg');
});

test('buildProgress percentage=0 when total=0', () => {
  const p = buildProgress('reading', 0, 0, '', 'msg');
  assert.strictEqual(p.percentage, 0, 'total=0 时 percentage=0');
});

test('isValidManifest 合法 manifest 返 true', () => {
  assert.strictEqual(isValidManifest({ app: 'XKAutoTester', type: 'config' }, 'config'), true);
  assert.strictEqual(isValidManifest({ app: 'XKAutoTester', type: 'logs' }, 'logs'), true);
});

test('isValidManifest 非法 manifest 返 false', () => {
  assert.strictEqual(isValidManifest(null, 'config'), false, 'null 返 false');
  assert.strictEqual(isValidManifest({ app: 'Other', type: 'config' }, 'config'), false, 'app 不符');
  assert.strictEqual(isValidManifest({ app: 'XKAutoTester', type: 'logs' }, 'config'), false, 'type 不符');
});

// ── constructor + 懒初始化 ────────────────────────────────

test('constructor 收 3 factory + _initialized=false', () => {
  const { svc, fileSystem, zip } = makeFakeApp();
  assert.strictEqual(svc._initialized, false, '懒初始化 flag 初始 false');
  assert.strictEqual(typeof svc._fileSystemFactory, 'function');
  assert.strictEqual(typeof svc._zipFactory, 'function');
  assert.strictEqual(typeof svc._mainWindowProvider, 'function');
  assert.strictEqual(svc._fs, undefined, 'constructor 不触发 fs 实例化');
});

test('懒初始化: 首次 exportConfig 触发 _ensureInitialized', async () => {
  const { svc, fileSystem } = makeFakeApp({
    fileSystem: { dirs: { '/fake/config': [] } }
  });
  assert.strictEqual(svc._initialized, false);
  // config 路径存在但空目录 → 返 empty 错误, 但 _ensureInitialized 已触发
  await svc.exportConfig('/out.zip');
  assert.strictEqual(svc._initialized, true, '首次调用触发懒初始化');
  assert.ok(svc._fs, '_fs 已实例化');
  assert.ok(svc._zip, '_zip 已实例化');
});

test('懒初始化幂等: 重复调用仅初始化一次', async () => {
  const { svc, fileSystem } = makeFakeApp({
    fileSystem: { dirs: { '/fake/config': [] } }
  });
  await svc.exportConfig('/out1.zip');
  const fs1 = svc._fs;
  await svc.exportConfig('/out2.zip');
  assert.strictEqual(svc._fs, fs1, '_fs 实例不变');
});

// ── exportConfig ────────────────────────────────────────────

test('exportConfig config 路径不存在 → notFound 错误', async () => {
  const { svc } = makeFakeApp();
  const result = await svc.exportConfig('/out.zip');
  assert.strictEqual(result.success, false);
  assert.ok(result.error.includes('exportConfigFailed'), '返 notFound 错误');
});

test('exportConfig 空目录 → empty 错误', async () => {
  const { svc } = makeFakeApp({
    fileSystem: { dirs: { '/fake/config': [] } }
  });
  const result = await svc.exportConfig('/out.zip');
  assert.strictEqual(result.success, false);
  assert.ok(result.error.includes('exportConfigFailed'), '返 empty 错误');
});

test('exportConfig 正常打包: 调 zip.create + addFile + addLocalFile + writeZip', async () => {
  const configDir = '/fake/config';
  const { svc, zip, mainWindow } = makeFakeApp({
    fileSystem: {
      dirs: { [configDir]: [
        { name: 'config.json', isDirectory: () => false },
        { name: 'sub', isDirectory: () => true },
      ] },
      files: {
        [path.join(configDir, 'config.json')]: '{"k":"v"}',
      },
    },
    mainWindow: makeFakeMainWindow(),
  });

  // 子目录存在但空 (readdir 返 [])
  const result = await svc.exportConfig('/out.zip');

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.path, '/out.zip');
  assert.strictEqual(zip.createCalls.addFile.length, 1, 'addFile 1 次 (manifest)');
  assert.strictEqual(zip.createCalls.addFile[0].name, 'manifest.json');
  assert.ok(zip.createCalls.addLocalFile.length >= 1, 'addLocalFile 至少 1 次 (config.json)');
  assert.strictEqual(zip.createCalls.writeZip.length, 1, 'writeZip 1 次');
  assert.strictEqual(zip.createCalls.writeZip[0], '/out.zip');
  // 进度发送到 mainWindow
  assert.ok(mainWindow.sent.length > 0, 'mainWindow 收到进度事件');
  assert.strictEqual(mainWindow.sent[0].channel, 'on-export-progress');
});

// ── exportLogs ──────────────────────────────────────────────

test('exportLogs logs 路径不存在 → noLogsToExport 错误', async () => {
  const { svc } = makeFakeApp();
  // userDataPath=/fake/data, logsPath=/fake/data/logs, 不存在
  const result = await svc.exportLogs('/out.zip');
  assert.strictEqual(result.success, false);
  assert.ok(result.error.includes('noLogsToExport'));
});

test('exportLogs 正常打包 (委托 _exportPath, type=logs)', async () => {
  const logsDir = '/fake/data/logs';
  const { svc, zip, mainWindow } = makeFakeApp({
    fileSystem: {
      dirs: { [logsDir]: [{ name: 'app.log', isDirectory: () => false }] },
      files: { [path.join(logsDir, 'app.log')]: 'log content' },
    },
    mainWindow: makeFakeMainWindow(),
  });

  const result = await svc.exportLogs('/logs.zip');

  assert.strictEqual(result.success, true);
  assert.strictEqual(zip.createCalls.writeZip[0], '/logs.zip');
  // manifest 是 logs 类型 (通过 addFile 内容验证)
  const manifestContent = JSON.parse(zip.createCalls.addFile[0].content.toString('utf8'));
  assert.strictEqual(manifestContent.type, 'logs', 'manifest.type=logs');
});

// ── importConfig ────────────────────────────────────────────

test('importConfig zip 不存在 → file not found 错误', async () => {
  const { svc } = makeFakeApp();
  const result = await svc.importConfig('/missing.zip');
  assert.strictEqual(result.success, false);
  assert.ok(result.error.includes('importConfigFailed'));
  assert.ok(result.error.includes('file not found'));
});

test('importConfig 无 manifest.json → importConfigInvalid 错误', async () => {
  const { svc } = makeFakeApp({
    fileSystem: { files: { '/test.zip': 'fake-zip' } },
    zip: { entries: [{ entryName: 'other.json', isDirectory: false, getData: () => Buffer.from('{}') }] },
  });
  const result = await svc.importConfig('/test.zip');
  assert.strictEqual(result.success, false);
  assert.ok(result.error.includes('importConfigInvalid'));
});

test('importConfig 无效 manifest (app 不符) → importConfigInvalid', async () => {
  const badManifest = Buffer.from(JSON.stringify({ app: 'Other', type: 'config' }));
  const { svc } = makeFakeApp({
    fileSystem: { files: { '/test.zip': 'fake-zip' } },
    zip: { entries: [{ entryName: 'manifest.json', isDirectory: false, getData: () => badManifest }] },
  });
  const result = await svc.importConfig('/test.zip');
  assert.strictEqual(result.success, false);
  assert.ok(result.error.includes('importConfigInvalid'));
});

test('importConfig 空归档 (仅 manifest) → empty archive 错误', async () => {
  const manifest = Buffer.from(JSON.stringify({ app: 'XKAutoTester', type: 'config' }));
  const { svc } = makeFakeApp({
    fileSystem: { files: { '/test.zip': 'fake-zip' } },
    zip: { entries: [{ entryName: 'manifest.json', isDirectory: false, getData: () => manifest }] },
  });
  const result = await svc.importConfig('/test.zip');
  assert.strictEqual(result.success, false);
  assert.ok(result.error.includes('empty archive'));
});

test('importConfig 正常解压: 调 fs.writeFile + 返 needRestart', async () => {
  const manifest = Buffer.from(JSON.stringify({ app: 'XKAutoTester', type: 'config' }));
  const fileContent = Buffer.from('{"k":"v"}');
  const { svc, fileSystem, mainWindow } = makeFakeApp({
    fileSystem: {
      dirs: { '/fake/config': [] },
      files: { '/test.zip': 'fake-zip' },
    },
    zip: {
      entries: [
        { entryName: 'manifest.json', isDirectory: false, getData: () => manifest },
        { entryName: 'config.json', isDirectory: false, getData: () => fileContent },
      ],
    },
    mainWindow: makeFakeMainWindow(),
  });

  const result = await svc.importConfig('/test.zip');

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.needRestart, true, '返 needRestart=true');
  assert.strictEqual(fileSystem.calls.writeFile.length, 1, 'writeFile 1 次 (config.json)');
  assert.ok(fileSystem.calls.writeFile[0].path.includes('config.json'));
  assert.ok(mainWindow.sent.length > 0, 'mainWindow 收到进度');
  assert.strictEqual(mainWindow.sent[0].channel, 'on-import-progress');
});

// ── mainWindow 双路径 ───────────────────────────────────────

test('mainWindow 双路径: setMainWindow 优先于 mainWindowProvider', async () => {
  const setWindow = makeFakeMainWindow();
  const providerWindow = makeFakeMainWindow();
  const { svc } = makeFakeApp({
    fileSystem: { dirs: { '/fake/config': [] } },
    mainWindowProvider: () => providerWindow,
  });

  svc.setMainWindow(setWindow);
  await svc.exportConfig('/out.zip');  // 触发 empty 错误, 但已发送 reading 进度

  assert.ok(setWindow.sent.length > 0, 'setMainWindow 收到进度 (优先)');
  assert.strictEqual(providerWindow.sent.length, 0, 'providerWindow 未收到 (fallback 跳过)');
});

test('mainWindow 双路径: 无 setMainWindow 时用 mainWindowProvider', async () => {
  const providerWindow = makeFakeMainWindow();
  const { svc } = makeFakeApp({
    fileSystem: { dirs: { '/fake/config': [] } },
    mainWindowProvider: () => providerWindow,
  });

  await svc.exportConfig('/out.zip');

  assert.ok(providerWindow.sent.length > 0, 'providerWindow 收到进度 (fallback)');
});

test('mainWindow 双路径: 两者均 null 时静默 (不抛错)', async () => {
  const { svc } = makeFakeApp({
    fileSystem: { dirs: { '/fake/config': [] } },
    mainWindowProvider: () => null,
  });

  // 无 setMainWindow, provider 返 null → 不应抛错
  const result = await svc.exportConfig('/out.zip');
  assert.strictEqual(result.success, false, '返 empty 错误 (不因 mainWindow null 抛错)');
});

// ── 错误处理 ────────────────────────────────────────────────

test('_exportPath catch 错误 → 发 error phase 进度 + 返 {success:false}', async () => {
  const failingFs = {
    exists: async () => { throw new Error('disk failure'); },
    readdir: async () => [],
    mkdir: async () => {},
    writeFile: async () => {},
  };
  const mainWindow = makeFakeMainWindow();
  const svc = new DataTransferService(
    { userConfigPath: '/fake/config', userDataPath: '/fake/data' },
    makeFakeI18n(),
    makeFakeVersion(),
    {
      fileSystemFactory: () => failingFs,
      zipFactory: () => makeFakeZip(),
      mainWindowProvider: () => mainWindow,
    }
  );

  const result = await svc.exportConfig('/out.zip');

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.error, 'disk failure');
  // 验证 error phase 进度已发送
  const errorEvents = mainWindow.sent.filter(s => s.data.phase === 'error');
  assert.ok(errorEvents.length > 0, '发了 error phase 进度');
  assert.strictEqual(errorEvents[0].data.message, 'disk failure');
});

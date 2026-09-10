// base/dialogWithMemory 单元测试 — 「记忆 → 弹窗 → 记忆」模板收敛
// 覆盖:
// - 选中文件 → rememberPath 持久化 (LAST_DIALOG_PATHS)
// - 已记忆路径 → showOpenDialog 收到 defaultPath (文件→父目录)
// - 取消 → 不记忆
// - dialogProps 函数形式 → 每次调用求值
// 需用 --require tests/electron/_setup.js 预加载 electron mock (dialog 用 __dialogMock)。

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { IpcFake } = require('./helpers/ipcFake');

const { registerOpenDialogWithMemory } = require('../../electron/src/main/handlers/base/dialogWithMemory');
const lastDialogPaths = require('../../electron/src/main/handlers/base/lastDialogPaths');

const CHANNEL = 'test:select-file';

function makeIpc(tmpDir) {
  const ipc = new IpcFake();
  const configPath = path.join(tmpDir, 'config.json');
  lastDialogPaths.init(() => configPath);
  registerOpenDialogWithMemory(ipc, CHANNEL, () => null, {
    properties: ['openFile'],
    filters: [{ name: 'All Files', extensions: ['*'] }],
  });
  return ipc;
}

function mockDialog(result) {
  global.__dialogMock.showOpenDialog = async (_win, options) => {
    global.__dialogMock.lastOpenOptions = options;
    return result;
  };
}

describe('dialogWithMemory (记忆→弹窗→记忆模板)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xkat-dialog-mem-'));

  beforeEach(() => {
    fs.rmSync(path.join(tmpDir, 'config.json'), { force: true });
  });

  test('选中文件 → rememberPath 持久化到 config.json', async () => {
    const ipc = makeIpc(tmpDir);
    const selected = path.join(tmpDir, 'data.zip');
    fs.writeFileSync(selected, '');
    mockDialog({ canceled: false, filePaths: [selected] });

    const result = await ipc.invoke(CHANNEL);

    assert.strictEqual(result.canceled, false);
    const cfg = JSON.parse(fs.readFileSync(path.join(tmpDir, 'config.json'), 'utf8'));
    assert.strictEqual(cfg.LAST_DIALOG_PATHS[CHANNEL], selected, '应按 channel key 记忆');
  });

  test('已记忆路径 → showOpenDialog 收到 defaultPath (文件→父目录)', async () => {
    const ipc = makeIpc(tmpDir);
    const selected = path.join(tmpDir, 'data.zip');
    fs.writeFileSync(selected, '');
    mockDialog({ canceled: false, filePaths: [selected] });
    await ipc.invoke(CHANNEL); // 第一次: 记忆

    mockDialog({ canceled: true, filePaths: [] });
    await ipc.invoke(CHANNEL); // 第二次: 应带 defaultPath

    const options = global.__dialogMock.lastOpenOptions;
    assert.strictEqual(options.defaultPath, tmpDir, 'defaultPath 应为已记忆文件的父目录');
  });

  test('取消 → 不记忆 (config.json 不产出)', async () => {
    const ipc = makeIpc(tmpDir);
    mockDialog({ canceled: true, filePaths: [] });

    await ipc.invoke(CHANNEL);

    assert.ok(!fs.existsSync(path.join(tmpDir, 'config.json')), '取消时不应写记忆');
  });

  test('dialogProps 函数形式 → 每次调用求值 (支持 i18n 动态 title)', async () => {
    const ipc = new IpcFake();
    let counter = 0;
    registerOpenDialogWithMemory(
      ipc,
      CHANNEL,
      () => null,
      () => {
        counter++;
        return { title: `t-${counter}`, properties: ['openFile'] };
      }
    );
    mockDialog({ canceled: true, filePaths: [] });

    await ipc.invoke(CHANNEL);
    await ipc.invoke(CHANNEL);

    assert.strictEqual(counter, 2, '函数 props 每次调用求值');
    assert.strictEqual(global.__dialogMock.lastOpenOptions.title, 't-2');
  });

  test('handler 异常经 registerHandler 统一包装 (success:false)', async () => {
    const ipc = makeIpc(tmpDir);
    global.__dialogMock.showOpenDialog = async () => {
      throw new Error('boom');
    };

    const result = await ipc.invoke(CHANNEL);

    assert.strictEqual(result.success, false);
    assert.ok(String(result.error).includes('boom'));
  });
});

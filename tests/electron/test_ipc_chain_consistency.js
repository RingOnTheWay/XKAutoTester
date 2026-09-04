// IPC 链一致性静态契约 (R27 防漏配复发)
// 背景: cancelUpdateDownload 三层 (constants/preload handler/渲染 bind) 已加,
// 唯独 preload expose 层漏 → ApiBridge: API not found。此测试校验关键通道在
// constants/preload/handlers/renderer bind specs 四层齐备, 防止同类漏配再发。
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const constantsPath = path.join(ROOT, 'electron', 'src', 'shared', 'constants.js');
const preloadPath = path.join(ROOT, 'electron', 'src', 'preload', 'index.js');
const updateHandlersPath = path.join(ROOT, 'electron', 'src', 'main', 'handlers', 'updateHandlers.js');
const settingsModelPath = path.join(ROOT, 'electron', 'renderer', 'tabs', 'settings', 'model.js');
const androidModelPath = path.join(ROOT, 'electron', 'renderer', 'tabs', 'android-connection', 'model.js');

function read(p) {
  return fs.readFileSync(p, 'utf8');
}

// 待校验链: [通道常量名, preload expose 方法名, handler 引用, 渲染层 bind key]
const CHAINS = [
  // 更新取消: 曾只漏 preload 层
  ['CANCEL_UPDATE_DOWNLOAD', 'cancelUpdateDownload', 'CANCEL_UPDATE_DOWNLOAD', 'cancelUpdateDownload', settingsModelPath],
  // 历史教训链: android 文件操作曾漏渲染层 bind
  ['DELETE_REMOTE_FILE', 'deleteRemoteFile', 'DELETE_REMOTE_FILE', 'deleteRemoteFile', androidModelPath],
  ['RENAME_REMOTE_FILE', 'renameRemoteFile', 'RENAME_REMOTE_FILE', 'renameRemoteFile', androidModelPath],
];

test('IPC 四层链一致: constants / preload expose / main handler / renderer bind', () => {
  const constantsSrc = read(constantsPath);
  const preloadSrc = read(preloadPath);
  const handlersSrc = read(updateHandlersPath);

  for (const [constKey, exposeName, handlerKey, bindKey, modelPath] of CHAINS) {
    const modelSrc = read(modelPath);
    // 1) constants 定义通道
    assert.ok(
      new RegExp(`${constKey}\\s*:\\s*'[^']+'`).test(constantsSrc),
      `constants 缺 ${constKey}`
    );
    // 2) preload 用该通道 expose (invokeWithCheck(IPC_CHANNELS.X))
    assert.ok(
      new RegExp(`${exposeName}\\s*:\\s*\\(?[^)]*\\)?\\s*=>\\s*invokeWithCheck\\(IPC_CHANNELS\\.${handlerKey}`).test(preloadSrc),
      `preload 缺 ${exposeName} (通道 ${handlerKey})`
    );
    // 3) main handler 注册该通道
    assert.ok(
      new RegExp(`IPC_CHANNELS\\.${handlerKey}`).test(handlersSrc) ||
        fs.readdirSync(path.join(ROOT, 'electron', 'src', 'main', 'handlers')).some(
          (f) => f.endsWith('.js') && new RegExp(`IPC_CHANNELS\\.${handlerKey}`).test(read(path.join(ROOT, 'electron', 'src', 'main', 'handlers', f)))
        ),
      `handlers 缺通道 ${handlerKey}`
    );
    // 4) 渲染层 ApiBridge.bind specs 含 key
    assert.ok(
      new RegExp(`${bindKey}\\s*:\\s*'${bindKey}'`).test(modelSrc),
      `${path.basename(modelPath)} bind 缺 ${bindKey}`
    );
  }
});

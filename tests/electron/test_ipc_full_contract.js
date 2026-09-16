// R26 候选⑥ IPC 全量契约测试 (生成式断言)
//
// 背景: 每加 IPC 能力需 4 处手改 (constants/preload/handler/renderer), 曾漏
// cancelUpdateDownload 的 preload 层 → 运行时 "API not found"。既有
// test_ipc_chain_consistency 只锁 3 条历史链, 本测试生成式锁全量:
//
// 1. 每个 IPC_CHANNELS key (仅解析 IPC_CHANNELS 块, 不含 UPDATE_DOWNLOAD_STATE
//    等兄弟常量) 必须被 preload 引用 (invokeWithCheck 或 ipcRenderer.on)
// 2. 每个通道必须在 main 进程有落点: key 引用 (registerHandler/send) 或通道
//    值字符串 (宽容既有字面量发送, 如 'upload-progress')
//
// 漏配从"运行时炸"变为"测试期红"。

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const constantsSrc = fs.readFileSync(path.join(ROOT, 'electron', 'src', 'shared', 'constants.js'), 'utf8');
const preloadSrc = fs.readFileSync(path.join(ROOT, 'electron', 'src', 'preload', 'index.js'), 'utf8');

/** 递归收集目录下全部 .js 源 */
function collectJs(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) collectJs(p, acc);
    else if (entry.name.endsWith('.js')) acc.push(fs.readFileSync(p, 'utf8'));
  }
  return acc;
}

const mainSrc = collectJs(path.join(ROOT, 'electron', 'src', 'main')).join('\n');

/** 解析 IPC_CHANNELS 对象块内的 key → value 映射 (不含兄弟常量) */
function parseIpcChannels(src) {
  const start = src.indexOf('const IPC_CHANNELS');
  assert.ok(start >= 0, 'constants.js 应定义 IPC_CHANNELS');
  const open = src.indexOf('{', start);
  // 括号配平截取对象块
  let depth = 0;
  let end = -1;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const block = src.slice(open, end);
  const map = new Map();
  for (const m of block.matchAll(/^\s*([A-Z][A-Z0-9_]+)\s*:\s*'([^']+)'/gm)) {
    map.set(m[1], m[2]);
  }
  return map;
}

test('IPC 全量契约: 每个通道必有 preload 引用 (invoke 或 on)', () => {
  const channels = parseIpcChannels(constantsSrc);
  assert.ok(channels.size >= 100, `通道数异常偏少: ${channels.size}`);

  const missing = [];
  for (const key of channels.keys()) {
    if (!preloadSrc.includes(`IPC_CHANNELS.${key}`)) missing.push(key);
  }
  assert.deepStrictEqual(
    missing,
    [],
    `以下通道 constants 已定义但 preload 未引用 (renderer 无法触达):\n${missing.join('\n')}`
  );
});

test('IPC 全量契约: 每个通道必须在 main 进程有落点 (key 引用或值字符串)', () => {
  const channels = parseIpcChannels(constantsSrc);

  const missing = [];
  for (const [key, value] of channels) {
    const keyRef = `IPC_CHANNELS.${key}`;
    const valueRef = `'${value}'`;
    if (!mainSrc.includes(keyRef) && !mainSrc.includes(valueRef)) missing.push(key);
  }
  assert.deepStrictEqual(
    missing,
    [],
    `以下通道 main 进程零引用 (handler 未注册且无发送点 — 死通道或漏配):\n${missing.join('\n')}`
  );
});

test('GET_DISPLAY_VERSION 回归: preload 已暴露 (曾漏, renderer 调不到)', () => {
  assert.ok(
    /getDisplayVersion:\s*\(\)\s*=>\s*invokeWithCheck\(IPC_CHANNELS\.GET_DISPLAY_VERSION/.test(preloadSrc),
    'preload 应暴露 getDisplayVersion'
  );
  assert.ok(mainSrc.includes('IPC_CHANNELS.GET_DISPLAY_VERSION'), 'main 应注册 GET_DISPLAY_VERSION');
});

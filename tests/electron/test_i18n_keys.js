// i18n key 完整性测试 (R24 P1-5)
// 防回潮: 渲染层 t('key') 静态调用 / data-i18n 属性引用的 key 必须存在于 locale JSON;
// zh-CN 与 en-US key 集合必须一致 (漏翻/多翻即失败)。
// 排除: 模板串/变量动态 key (如 t(`...`)、data-i18n="${opt.label}") — 运行时由调用方提供。

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RENDERER_DIR = path.join(__dirname, '..', '..', 'electron', 'renderer');
const LOCALES_DIR = path.join(__dirname, '..', '..', 'electron', 'locales');

function flattenKeys(obj, prefix = '', out = new Set()) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object') flattenKeys(v, key, out);
    else out.add(key);
  }
  return out;
}

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function collectUsedKeys() {
  const files = walk(RENDERER_DIR).filter((f) => f.endsWith('.js') || f.endsWith('.html'));
  const used = new Set();
  // t('key') / t("key") — 静态字符串参数; 模板串 t(`...) 不被匹配 (反引号), 天然排除动态 key
  const reCall = /\bt\(\s*(['"])([^'"]+)\1\s*\)/g;
  // data-i18n="key" — 排除 ${...} 动态模板
  const reAttr = /data-i18n="([^"]+)"/g;
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    for (const m of content.matchAll(reCall)) used.add(m[2]);
    for (const m of content.matchAll(reAttr)) {
      if (!m[1].includes('${')) used.add(m[1]);
    }
  }
  return used;
}

test('R24 P1-5 zh-CN 与 en-US key 集合一致 (漏翻/多翻即失败)', () => {
  const zh = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, 'zh-CN', 'translation.json'), 'utf8'));
  const en = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, 'en-US', 'translation.json'), 'utf8'));
  const zhKeys = flattenKeys(zh);
  const enKeys = flattenKeys(en);
  const zhOnly = [...zhKeys].filter((k) => !enKeys.has(k));
  const enOnly = [...enKeys].filter((k) => !zhKeys.has(k));
  assert.deepStrictEqual(zhOnly, [], `zh-CN 有但 en-US 缺失的 key: ${zhOnly.join(', ')}`);
  assert.deepStrictEqual(enOnly, [], `en-US 有但 zh-CN 缺失的 key: ${enOnly.join(', ')}`);
});

test('R24 P1-5 渲染层静态引用的 key 均存在于 locale (防新漏翻回潮)', () => {
  const zh = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, 'zh-CN', 'translation.json'), 'utf8'));
  const zhKeys = flattenKeys(zh);
  const used = collectUsedKeys();
  const missing = [...used].filter((k) => !zhKeys.has(k));
  assert.deepStrictEqual(missing, [], `渲染层引用但 locale 缺失的 key: ${missing.join(', ')}`);
  assert.ok(used.size > 400, `静态 key 数量异常偏低: ${used.size}`);
});

test('R24 P1-5 曾缺失的 10 个 key 已补齐 (回归锚点)', () => {
  const zh = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, 'zh-CN', 'translation.json'), 'utf8'));
  const zhKeys = flattenKeys(zh);
  const anchors = [
    'android.selectUsbDevice',
    'android.ipFormatError',
    'environment.preparing',
    'inspector.noElements',
    'inspector.startFailed',
    'inspector.refreshFailed',
    'inspector.screenshotFailed',
    'settings.exporting',
    'settings.importing',
    'settings.installUpdate',
  ];
  for (const key of anchors) {
    assert.ok(zhKeys.has(key), `锚点 key 缺失: ${key}`);
  }
});

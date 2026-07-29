// LocaleLabelResolver 单元测试
// 验证: 1) locale 优先级解析 2) _fixGarbledUtf8 乱码修复
// 策略: 纯函数测试, mock i18nService.getLanguage()
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const LocaleLabelResolver = require(path.join(
  __dirname, '..', '..', 'electron', 'src', 'main', 'services', 'apk', 'LocaleLabelResolver.js'
));

function createI18nMock(language) {
  return { getLanguage: () => language };
}

// ── slice 1: 空 localeLabels 返回 defaultLabel ────────────

test('resolve localeLabels 为空对象时返回 defaultLabel', () => {
  const resolver = new LocaleLabelResolver({ i18nService: createI18nMock('zh-CN') });

  const result = resolver.resolve({}, 'DefaultApp');

  assert.strictEqual(result, 'DefaultApp');
});

// ── slice 2: 精确 locale 匹配优先 ─────────────────────────

test('resolve 精确 locale 匹配优先返回', () => {
  const resolver = new LocaleLabelResolver({ i18nService: createI18nMock('zh-CN') });
  const localeLabels = { 'zh-CN': '中文', 'en-US': 'English', default: 'Default' };

  const result = resolver.resolve(localeLabels, 'Default');

  assert.strictEqual(result, '中文');
});

// ── slice 3: base lang fallback ───────────────────────────

test('resolve 无精确匹配时回退到 base lang (zh 回退 zh-CN)', () => {
  const resolver = new LocaleLabelResolver({ i18nService: createI18nMock('zh-TW') });
  const localeLabels = { 'zh-CN': '中文', 'en-US': 'English', default: 'Default' };

  const result = resolver.resolve(localeLabels, 'Default');

  assert.strictEqual(result, '中文');
});

// ── slice 4: 多级 fallback 链 (appLocale → base → zh-CN → en-US → en → default) ──

test('resolve 无匹配时按 zh-CN → en-US → en → default 顺序回退', () => {
  const resolver = new LocaleLabelResolver({ i18nService: createI18nMock('fr-FR') });
  const localeLabels = { 'en-US': 'English', default: 'Default' };

  const result = resolver.resolve(localeLabels, 'FallbackDefault');

  assert.strictEqual(result, 'English');
});

test('resolve 所有 locale 都不匹配时返回 default', () => {
  const resolver = new LocaleLabelResolver({ i18nService: createI18nMock('fr-FR') });
  const localeLabels = { default: 'DefaultLabel' };

  const result = resolver.resolve(localeLabels, 'FallbackDefault');

  assert.strictEqual(result, 'DefaultLabel');
});

// ── slice 5: i18nService 缺失时默认 zh-CN ─────────────────

test('resolve i18nService 为 null 时默认 zh-CN locale', () => {
  const resolver = new LocaleLabelResolver({ i18nService: null });
  const localeLabels = { 'zh-CN': '中文', 'en-US': 'English', default: 'Default' };

  const result = resolver.resolve(localeLabels, 'Default');

  assert.strictEqual(result, '中文');
});

// ── slice 6: _fixGarbledUtf8 修复 latin1 误编码的中文 ─────

test('_fixGarbledUtf8 正常 UTF-8 中文保持不变', () => {
  const resolver = new LocaleLabelResolver({ i18nService: createI18nMock('zh-CN') });

  const fixed = resolver._fixGarbledUtf8('我的应用');

  assert.strictEqual(fixed, '我的应用');
});

test('_fixGarbledUtf8 空串返回空串', () => {
  const resolver = new LocaleLabelResolver({ i18nService: createI18nMock('zh-CN') });

  const fixed = resolver._fixGarbledUtf8('');

  assert.strictEqual(fixed, '');
});

test('_fixGarbledUtf8 null 返回 null', () => {
  const resolver = new LocaleLabelResolver({ i18nService: createI18nMock('zh-CN') });

  const fixed = resolver._fixGarbledUtf8(null);

  assert.strictEqual(fixed, null);
});

test('_fixGarbledUtf8 latin1 误编码的中文被修复为正确 UTF-8', () => {
  const resolver = new LocaleLabelResolver({ i18nService: createI18nMock('zh-CN') });
  // 模拟 latin1 误编码: '我的应用' 的 UTF-8 字节被当作 latin1 字符读取
  const garbled = Buffer.from('我的应用', 'utf8').toString('latin1');

  const fixed = resolver._fixGarbledUtf8(garbled);

  assert.strictEqual(fixed, '我的应用');
});

// ── slice 7: resolve 集成 _fixGarbledUtf8 ────────────────

test('resolve 返回的标签经过 _fixGarbledUtf8 修复', () => {
  const resolver = new LocaleLabelResolver({ i18nService: createI18nMock('zh-CN') });
  const garbled = Buffer.from('演示应用', 'utf8').toString('latin1');
  const localeLabels = { 'zh-CN': garbled, default: 'Default' };

  const result = resolver.resolve(localeLabels, 'Default');

  assert.strictEqual(result, '演示应用');
});

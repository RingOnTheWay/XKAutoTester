// selectFieldRoutes 单一 schema 测试 (P2-1 读写方向收敛)
const test = require('node:test');
const assert = require('node:assert');

async function loadRoutes() {
  const mod = await import('../../electron/renderer/tabs/test-case/modules/selectFieldRoutes.js');
  return mod;
}

test('P2-1 applySelectRoute 基础字段写入 (深路径)', async () => {
  const { applySelectRoute } = await loadRoutes();
  const config = {};

  assert.strictEqual(applySelectRoute(config, 'tc-page-select-1', 'page1'), true);
  assert.strictEqual(config.pageId, 'page1');

  assert.strictEqual(applySelectRoute(config, 'tc-input-type-select-1', 'faker'), true);
  assert.deepStrictEqual(config.operationValue, { inputType: 'faker' });

  assert.strictEqual(applySelectRoute(config, 'tc-faker-locale-1', 'zh_CN'), true);
  assert.deepStrictEqual(config.operationValue.fakerConfig, { locale: 'zh_CN' });
});

test('P2-1 applySelectRoute parse 语义 (clickCount 非法回退 1 / precision 整数化)', async () => {
  const { applySelectRoute } = await loadRoutes();
  const config = {};

  applySelectRoute(config, 'tc-nav-click-count-1', '3');
  assert.strictEqual(config.systemConfig.clickCount, 3);

  applySelectRoute(config, 'tc-nav-click-count-1', 'abc');
  assert.strictEqual(config.systemConfig.clickCount, 1);

  applySelectRoute(config, 'tc-random-precision-1', '2.7');
  assert.strictEqual(config.operationValue.randomConfig.precision, 2);
});

test('P2-1 applySelectRoute multi 路由按 index 写入 / 缺 index 不写', async () => {
  const { applySelectRoute } = await loadRoutes();
  const config = {};

  assert.strictEqual(applySelectRoute(config, 'tc-multi-element-select-1', 'el1', 0), true);
  assert.strictEqual(config.selectedElements[0].elementId, 'el1');

  assert.strictEqual(applySelectRoute(config, 'tc-multi-element-select-1', 'el2', 1), true);
  assert.strictEqual(config.selectedElements[1].elementId, 'el2');

  // 缺 index → false 且不写
  assert.strictEqual(applySelectRoute(config, 'tc-multi-element-select-1', 'el3'), false);
  assert.strictEqual(config.selectedElements.length, 2);
});

test('P2-1 未知 selectId 返回 false 无副作用', async () => {
  const { applySelectRoute, findSelectRoute } = await loadRoutes();
  const config = { pageId: 'p1' };
  assert.strictEqual(applySelectRoute(config, 'tc-unknown-1', 'x'), false);
  assert.deepStrictEqual(config, { pageId: 'p1' });
  assert.strictEqual(findSelectRoute('tc-unknown'), null);
  assert.strictEqual(findSelectRoute(null), null);
});

test('P2-1 路由覆盖完整性: 所有已知前缀均可匹配', async () => {
  const { findSelectRoute } = await loadRoutes();
  const knownPrefixes = [
    'tc-page-select', 'tc-element-select', 'tc-operation-select', 'tc-input-type-select',
    'tc-ble-method-select', 'tc-system-operation-type', 'tc-nav-click-count',
    'tc-page-operation-type', 'tc-target-value-type', 'tc-search-type',
    'tc-faker-locale', 'tc-faker-provider', 'tc-faker-method', 'tc-faker-category',
    'tc-nav-key-select', 'tc-random-precision',
    'tc-multi-element-select', 'tc-multi-operation-select', 'tc-multi-input-type-select',
    'tc-multi-faker-locale', 'tc-multi-faker-provider',
    'tc-compare-element-page', 'tc-compare-element-select',
    'tc-search-element-page', 'tc-search-element-select', 'tc-ble-step-select',
  ];
  for (const prefix of knownPrefixes) {
    assert.ok(findSelectRoute(`${prefix}-1`), `应匹配: ${prefix}`);
  }
});

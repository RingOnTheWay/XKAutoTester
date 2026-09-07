// StepEditor 深模块单元测试 (R10 renderer mixin → deep module)
// 验证：步骤 CRUD、移动、类型切换、字段更新、selectId 路由、load/reset/sync、拖拽状态

const { test, describe } = require('node:test');
const assert = require('node:assert');

let StepEditorClass;
async function loadStepEditor() {
  if (!StepEditorClass) {
    const mod = await import('../../electron/renderer/tabs/test-case/modules/StepEditor.js');
    StepEditorClass = mod.StepEditor;
  }
  return StepEditorClass;
}

// 全局 i18n 桩（addStep/copyStep 调用 window.i18n.t）
function setupI18n() {
  if (!global.window) global.window = {};
  global.window.i18n = {
    t: (key, opts = {}) => {
      if (key === 'testCase.defaultStepName') return `步骤 ${opts.n || 1}`;
      if (key === 'testCase.copySuffix') return `${opts.name} 副本`;
      return key;
    },
  };
}

function makeFakeApp() {
  return {
    id: 'app1',
    name: 'App1',
    pages: [
      {
        id: 'page1',
        name: 'Page1',
        elements: [
          { id: 'el1', name: 'Element1', locator: 'id', value: 'btn1' },
          { id: 'el2', name: 'Element2', locator: 'click', value: 'btn2' },
        ],
      },
    ],
  };
}

describe('StepEditor 初始状态', () => {
  test('初始状态为空数组 + draggedStep=null', async () => {
    const StepEditor = await loadStepEditor();
    const se = new StepEditor();
    assert.deepStrictEqual(se.steps, []);
    assert.strictEqual(se.draggedStep, null);
  });

  test('get(key) 读取状态', async () => {
    const StepEditor = await loadStepEditor();
    const se = new StepEditor();
    assert.deepStrictEqual(se.get('steps'), []);
    assert.strictEqual(se.get('draggedStep'), null);
    assert.strictEqual(se.get('unknown'), undefined);
  });

  test('未注入 getApp 时 updateStepSelect 不抛错 (内部默认返回 null)', async () => {
    setupI18n();
    const StepEditor = await loadStepEditor();
    const se = new StepEditor(); // 无 getApp 注入
    const s = se.addStep();
    s.config.compareConfig = { pageId: 'p1' };
    // 走 tc-compare-element-select 路径会调用 #getApp()，未注入时应安全返回 null 不抛错
    se.updateStepSelect('tc-compare-element-select-1', 'el1', s.id);
    assert.strictEqual(s.config.compareConfig.elementId, 'el1');
    // 因 getApp 返回 null，elementName/locator 不会被填充
    assert.ok(!('elementName' in s.config.compareConfig));
  });
});

describe('StepEditor addStep', () => {
  test('addStep 创建默认 element 类型步骤', async () => {
    setupI18n();
    const StepEditor = await loadStepEditor();
    const se = new StepEditor();
    const step = se.addStep();

    assert.ok(step.id.startsWith('step_'));
    assert.strictEqual(step.order, 1);
    assert.strictEqual(step.name, '步骤 1');
    assert.strictEqual(step.type, 'element');
    assert.deepStrictEqual(step.config.operation, 'click');
    assert.deepStrictEqual(step.config.operationValue, {});
    assert.strictEqual(se.steps.length, 1);
  });

  test('addStep 触发 steps-changed 事件', async () => {
    setupI18n();
    const StepEditor = await loadStepEditor();
    const se = new StepEditor();
    let emitted = null;
    se.on('steps-changed', (steps) => { emitted = steps; });

    se.addStep();
    assert.ok(emitted);
    assert.strictEqual(emitted.length, 1);
  });

  test('连续 addStep order 递增', async () => {
    setupI18n();
    const StepEditor = await loadStepEditor();
    const se = new StepEditor();
    se.addStep();
    se.addStep();
    se.addStep();
    assert.strictEqual(se.steps[0].order, 1);
    assert.strictEqual(se.steps[1].order, 2);
    assert.strictEqual(se.steps[2].order, 3);
  });
});

describe('StepEditor deleteStep', () => {
  test('deleteStep 移除指定步骤', async () => {
    setupI18n();
    const StepEditor = await loadStepEditor();
    const se = new StepEditor();
    const s1 = se.addStep();
    const s2 = se.addStep();
    const s3 = se.addStep();

    se.deleteStep(s2.id);
    assert.strictEqual(se.steps.length, 2);
    assert.strictEqual(se.steps[0].id, s1.id);
    assert.strictEqual(se.steps[1].id, s3.id);
  });

  test('deleteStep 后 order 重新索引', async () => {
    setupI18n();
    const StepEditor = await loadStepEditor();
    const se = new StepEditor();
    se.addStep();
    const s2 = se.addStep();
    se.addStep();

    se.deleteStep(s2.id);
    assert.strictEqual(se.steps[0].order, 1);
    assert.strictEqual(se.steps[1].order, 2);
  });

  test('deleteStep 触发 steps-changed', async () => {
    setupI18n();
    const StepEditor = await loadStepEditor();
    const se = new StepEditor();
    const s = se.addStep();
    let emitted = null;
    se.on('steps-changed', (steps) => { emitted = steps; });

    se.deleteStep(s.id);
    assert.deepStrictEqual(emitted, []);
  });

  test('deleteStep 不存在的 ID 静默无操作', async () => {
    setupI18n();
    const StepEditor = await loadStepEditor();
    const se = new StepEditor();
    se.addStep();
    let emitCount = 0;
    se.on('steps-changed', () => { emitCount++; });

    se.deleteStep('nonexistent');
    assert.strictEqual(se.steps.length, 1);
    assert.strictEqual(emitCount, 1); // deleteStep 仍触发（无筛选变化但调用 updateStepOrders + emit）
  });
});

describe('StepEditor copyStep', () => {
  test('copyStep 深拷贝并追加到末尾', async () => {
    setupI18n();
    const StepEditor = await loadStepEditor();
    const se = new StepEditor();
    const orig = se.addStep();
    orig.config.pageId = 'page1';

    const copy = se.copyStep(orig.id);
    assert.notStrictEqual(copy.id, orig.id);
    assert.strictEqual(copy.name, '步骤 1 副本');
    assert.strictEqual(copy.config.pageId, 'page1');
    assert.strictEqual(se.steps.length, 2);
    assert.strictEqual(copy.order, 2);
  });

  test('copyStep 修改副本不影响原件', async () => {
    setupI18n();
    const StepEditor = await loadStepEditor();
    const se = new StepEditor();
    const orig = se.addStep();
    orig.config.elementId = 'el1';

    const copy = se.copyStep(orig.id);
    copy.config.elementId = 'el2';
    assert.strictEqual(orig.config.elementId, 'el1');
    assert.strictEqual(copy.config.elementId, 'el2');
  });

  test('copyStep 不存在 ID 返回 null', async () => {
    setupI18n();
    const StepEditor = await loadStepEditor();
    const se = new StepEditor();
    const result = se.copyStep('nonexistent');
    assert.strictEqual(result, null);
    assert.strictEqual(se.steps.length, 0);
  });
});

describe('StepEditor moveStep', () => {
  test('moveStep up 向上移动', async () => {
    setupI18n();
    const StepEditor = await loadStepEditor();
    const se = new StepEditor();
    const s1 = se.addStep();
    const s2 = se.addStep();
    const s3 = se.addStep();

    se.moveStep(s2.id, 'up');
    assert.strictEqual(se.steps[0].id, s2.id);
    assert.strictEqual(se.steps[1].id, s1.id);
    assert.strictEqual(se.steps[2].id, s3.id);
  });

  test('moveStep down 向下移动', async () => {
    setupI18n();
    const StepEditor = await loadStepEditor();
    const se = new StepEditor();
    const s1 = se.addStep();
    const s2 = se.addStep();
    const s3 = se.addStep();

    se.moveStep(s2.id, 'down');
    assert.strictEqual(se.steps[0].id, s1.id);
    assert.strictEqual(se.steps[1].id, s3.id);
    assert.strictEqual(se.steps[2].id, s2.id);
  });

  test('moveStep 第一个 up 边界无操作', async () => {
    setupI18n();
    const StepEditor = await loadStepEditor();
    const se = new StepEditor();
    const s1 = se.addStep();
    se.addStep();

    se.moveStep(s1.id, 'up');
    assert.strictEqual(se.steps[0].id, s1.id);
  });

  test('moveStep 最后一个 down 边界无操作', async () => {
    setupI18n();
    const StepEditor = await loadStepEditor();
    const se = new StepEditor();
    se.addStep();
    const s2 = se.addStep();

    se.moveStep(s2.id, 'down');
    assert.strictEqual(se.steps[1].id, s2.id);
  });

  test('moveStep 后 order 重新索引', async () => {
    setupI18n();
    const StepEditor = await loadStepEditor();
    const se = new StepEditor();
    se.addStep();
    const s2 = se.addStep();
    se.addStep();

    se.moveStep(s2.id, 'up');
    assert.strictEqual(se.steps[0].order, 1);
    assert.strictEqual(se.steps[1].order, 2);
    assert.strictEqual(se.steps[2].order, 3);
  });
});

describe('StepEditor changeStepType', () => {
  test('changeStepType 切换类型并重置 config', async () => {
    setupI18n();
    const StepEditor = await loadStepEditor();
    const se = new StepEditor();
    const s = se.addStep();
    s.config.pageId = 'page1';

    se.changeStepType(s.id, 'ble');
    assert.strictEqual(s.type, 'ble');
    assert.deepStrictEqual(s.config, { type: 'ble' });
  });

  test('changeStepType 触发 steps-changed', async () => {
    setupI18n();
    const StepEditor = await loadStepEditor();
    const se = new StepEditor();
    const s = se.addStep();
    let emitted = null;
    se.on('steps-changed', (steps) => { emitted = steps; });

    se.changeStepType(s.id, 'system');
    assert.ok(emitted);
  });
});

describe('StepEditor updateStepName', () => {
  test('updateStepName 更新名称', async () => {
    setupI18n();
    const StepEditor = await loadStepEditor();
    const se = new StepEditor();
    const s = se.addStep();

    se.updateStepName(s.id, '新名称');
    assert.strictEqual(s.name, '新名称');
  });

  test('updateStepName 不触发 steps-changed (精细事件由 Model 编排)', async () => {
    setupI18n();
    const StepEditor = await loadStepEditor();
    const se = new StepEditor();
    const s = se.addStep();
    let emitCount = 0;
    se.on('steps-changed', () => { emitCount++; });

    se.updateStepName(s.id, '新名称');
    assert.strictEqual(emitCount, 0);
  });
});

describe('StepEditor updateStepSelect - 基础前缀路由', () => {
  test('tc-page-select 更新 pageId', async () => {
    setupI18n();
    const StepEditor = await loadStepEditor();
    const se = new StepEditor({ getApp: () => makeFakeApp() });
    const s = se.addStep();

    se.updateStepSelect('tc-page-select-1', 'page1', s.id);
    assert.strictEqual(s.config.pageId, 'page1');
    assert.strictEqual(s.config.pageName, 'Page1');
    // 级联清空
    assert.strictEqual(s.config.elementId, '');
    assert.strictEqual(s.config.operation, 'click');
  });

  test('tc-element-select 更新 elementId + locator', async () => {
    setupI18n();
    const StepEditor = await loadStepEditor();
    const se = new StepEditor({ getApp: () => makeFakeApp() });
    const s = se.addStep();
    s.config.pageId = 'page1';

    se.updateStepSelect('tc-element-select-1', 'el1', s.id);
    assert.strictEqual(s.config.elementId, 'el1');
    assert.strictEqual(s.config.elementName, 'Element1');
    assert.strictEqual(s.config.locator, 'id');
    assert.strictEqual(s.config.locatorValue, 'btn1');
  });

  test('tc-operation-select 更新 operation 并清空 operationValue', async () => {
    setupI18n();
    const StepEditor = await loadStepEditor();
    const se = new StepEditor();
    const s = se.addStep();
    s.config.operationValue = { foo: 'bar' };

    se.updateStepSelect('tc-operation-select-1', 'sendText', s.id);
    assert.strictEqual(s.config.operation, 'sendText');
    assert.deepStrictEqual(s.config.operationValue, {});
  });

  test('tc-input-type-select 更新 operationValue.inputType', async () => {
    setupI18n();
    const StepEditor = await loadStepEditor();
    const se = new StepEditor();
    const s = se.addStep();

    se.updateStepSelect('tc-input-type-select-1', 'faker', s.id);
    assert.strictEqual(s.config.operationValue.inputType, 'faker');
  });

  test('tc-ble-method-select 更新 deviceConfig.methodName 并清空 params', async () => {
    setupI18n();
    const StepEditor = await loadStepEditor();
    const se = new StepEditor();
    const s = se.addStep();
    s.config.deviceConfig = { methodName: 'old', params: { x: 1 } };

    se.updateStepSelect('tc-ble-method-select-1', 'newMethod', s.id);
    assert.strictEqual(s.config.deviceConfig.methodName, 'newMethod');
    assert.ok(!('params' in s.config.deviceConfig));
  });

  test('tc-system-operation-type 更新 systemConfig.operationType', async () => {
    setupI18n();
    const StepEditor = await loadStepEditor();
    const se = new StepEditor();
    const s = se.addStep();

    se.updateStepSelect('tc-system-operation-type-1', 'pressBack', s.id);
    assert.strictEqual(s.config.systemConfig.operationType, 'pressBack');
  });

  test('P1-1 tc-nav-click-count 更新 systemConfig.clickCount 且不污染 operationType', async () => {
    setupI18n();
    const StepEditor = await loadStepEditor();
    const se = new StepEditor();
    const s = se.addStep();
    s.config.systemConfig = { operationType: 'navigation' };

    se.updateStepSelect('tc-nav-click-count-1', '3', s.id);
    assert.strictEqual(s.config.systemConfig.clickCount, 3);
    assert.strictEqual(s.config.systemConfig.operationType, 'navigation'); // 不再被覆盖
  });

  test('P1-1 tc-nav-click-count 非法值回退 1', async () => {
    setupI18n();
    const StepEditor = await loadStepEditor();
    const se = new StepEditor();
    const s = se.addStep();

    se.updateStepSelect('tc-nav-click-count-1', 'abc', s.id);
    assert.strictEqual(s.config.systemConfig.clickCount, 1);

    se.updateStepSelect('tc-nav-click-count-1', '0', s.id);
    assert.strictEqual(s.config.systemConfig.clickCount, 1);
  });

  test('tc-page-operation-type 更新 operationType', async () => {
    setupI18n();
    const StepEditor = await loadStepEditor();
    const se = new StepEditor();
    const s = se.addStep();

    se.updateStepSelect('tc-page-operation-type-1', 'wait', s.id);
    assert.strictEqual(s.config.operationType, 'wait');
  });

  test('tc-target-value-type custom 模式设置 targetValue 清空 bleStepId', async () => {
    setupI18n();
    const StepEditor = await loadStepEditor();
    const se = new StepEditor();
    const s = se.addStep();
    s.config.compareConfig = { bleStepId: 'step_x' };

    se.updateStepSelect('tc-target-value-type-1', 'custom', s.id);
    assert.strictEqual(s.config.compareConfig.targetValueType, 'custom');
    assert.strictEqual(s.config.compareConfig.targetValue, '');
    assert.ok(!('bleStepId' in s.config.compareConfig));
  });

  test('tc-target-value-type ble 模式设置 bleStepId 清空 targetValue', async () => {
    setupI18n();
    const StepEditor = await loadStepEditor();
    const se = new StepEditor();
    const s = se.addStep();
    s.config.compareConfig = { targetValue: 'abc' };

    se.updateStepSelect('tc-target-value-type-1', 'ble', s.id);
    assert.strictEqual(s.config.compareConfig.targetValueType, 'ble');
    assert.strictEqual(s.config.compareConfig.bleStepId, '');
    assert.ok(!('targetValue' in s.config.compareConfig));
  });

  test('tc-search-type 更新 searchConfig.searchType', async () => {
    setupI18n();
    const StepEditor = await loadStepEditor();
    const se = new StepEditor();
    const s = se.addStep();

    se.updateStepSelect('tc-search-type-1', 'element', s.id);
    assert.strictEqual(s.config.searchConfig.searchType, 'element');
  });

  test('tc-faker-locale 更新 fakerConfig.locale', async () => {
    setupI18n();
    const StepEditor = await loadStepEditor();
    const se = new StepEditor();
    const s = se.addStep();

    se.updateStepSelect('tc-faker-locale-1', 'zh_CN', s.id);
    assert.strictEqual(s.config.operationValue.fakerConfig.locale, 'zh_CN');
  });

  test('tc-faker-provider 更新 fakerConfig.provider', async () => {
    setupI18n();
    const StepEditor = await loadStepEditor();
    const se = new StepEditor();
    const s = se.addStep();

    se.updateStepSelect('tc-faker-provider-1', 'internet', s.id);
    assert.strictEqual(s.config.operationValue.fakerConfig.provider, 'internet');
  });

  test('tc-faker-method 更新 fakerConfig.method', async () => {
    setupI18n();
    const StepEditor = await loadStepEditor();
    const se = new StepEditor();
    const s = se.addStep();

    se.updateStepSelect('tc-faker-method-1', 'email', s.id);
    assert.strictEqual(s.config.operationValue.fakerConfig.method, 'email');
  });

  test('tc-faker-category 更新 fakerConfig.category', async () => {
    setupI18n();
    const StepEditor = await loadStepEditor();
    const se = new StepEditor();
    const s = se.addStep();

    se.updateStepSelect('tc-faker-category-1', 'person', s.id);
    assert.strictEqual(s.config.operationValue.fakerConfig.category, 'person');
  });

  test('tc-nav-key-select 更新 systemConfig.navKey', async () => {
    setupI18n();
    const StepEditor = await loadStepEditor();
    const se = new StepEditor();
    const s = se.addStep();

    se.updateStepSelect('tc-nav-key-select-1', 'KEYCODE_HOME', s.id);
    assert.strictEqual(s.config.systemConfig.navKey, 'KEYCODE_HOME');
  });

  test('tc-random-precision 解析为整数', async () => {
    setupI18n();
    const StepEditor = await loadStepEditor();
    const se = new StepEditor();
    const s = se.addStep();

    se.updateStepSelect('tc-random-precision-1', '3', s.id);
    assert.strictEqual(s.config.operationValue.randomConfig.precision, 3);
  });

  test('tc-ble-step-select 更新 compareConfig.bleStepId', async () => {
    setupI18n();
    const StepEditor = await loadStepEditor();
    const se = new StepEditor();
    const s = se.addStep();

    se.updateStepSelect('tc-ble-step-select-1', 'step_123', s.id);
    assert.strictEqual(s.config.compareConfig.bleStepId, 'step_123');
  });
});

describe('StepEditor updateStepSelect - 多元素', () => {
  test('tc-multi-element-select 按 index 写入 selectedElements', async () => {
    setupI18n();
    const StepEditor = await loadStepEditor();
    const se = new StepEditor();
    const s = se.addStep();

    se.updateStepSelect('tc-multi-element-select-1', 'el1', s.id, 0);
    se.updateStepSelect('tc-multi-element-select-1', 'el2', s.id, 1);
    assert.strictEqual(s.config.selectedElements[0].elementId, 'el1');
    assert.strictEqual(s.config.selectedElements[1].elementId, 'el2');
  });

  test('tc-multi-operation-select 按 index 写入 operation', async () => {
    setupI18n();
    const StepEditor = await loadStepEditor();
    const se = new StepEditor();
    const s = se.addStep();

    se.updateStepSelect('tc-multi-operation-select-1', 'click', s.id, 0);
    assert.strictEqual(s.config.selectedElements[0].operation, 'click');
  });

  test('tc-multi-input-type-select 按 index 写入 operationValue.inputType (R24 P1-1)', async () => {
    setupI18n();
    const StepEditor = await loadStepEditor();
    const se = new StepEditor();
    const s = se.addStep();

    se.updateStepSelect('tc-multi-input-type-select-1', 'faker', s.id, 2);
    assert.strictEqual(s.config.selectedElements[2].operationValue.inputType, 'faker');
  });

  test('tc-multi-faker-locale/provider 写入 operationValue.fakerConfig (R24 P1-1)', async () => {
    setupI18n();
    const StepEditor = await loadStepEditor();
    const se = new StepEditor();
    const s = se.addStep();

    se.updateStepSelect('tc-multi-faker-locale-1', 'zh_CN', s.id, 0);
    se.updateStepSelect('tc-multi-faker-provider-1', 'person.name', s.id, 0);
    assert.strictEqual(s.config.selectedElements[0].operationValue.fakerConfig.locale, 'zh_CN');
    assert.strictEqual(s.config.selectedElements[0].operationValue.fakerConfig.provider, 'person.name');
  });
});

describe('StepEditor updateStepSelect - compare/search element', () => {
  test('tc-compare-element-page 更新 pageId 并清空 elementId', async () => {
    setupI18n();
    const StepEditor = await loadStepEditor();
    const se = new StepEditor({ getApp: () => makeFakeApp() });
    const s = se.addStep();
    s.config.compareConfig = { pageId: 'oldPage', elementId: 'oldEl' };

    se.updateStepSelect('tc-compare-element-page-1', 'page1', s.id);
    assert.strictEqual(s.config.compareConfig.pageId, 'page1');
    assert.strictEqual(s.config.compareConfig.elementId, '');
  });

  test('tc-compare-element-select 更新 elementId + locator (依赖 getApp)', async () => {
    setupI18n();
    const StepEditor = await loadStepEditor();
    const se = new StepEditor({ getApp: () => makeFakeApp() });
    const s = se.addStep();
    s.config.compareConfig = { pageId: 'page1' };

    se.updateStepSelect('tc-compare-element-select-1', 'el1', s.id);
    assert.strictEqual(s.config.compareConfig.elementId, 'el1');
    assert.strictEqual(s.config.compareConfig.elementName, 'Element1');
    assert.strictEqual(s.config.compareConfig.locator, 'id');
    assert.strictEqual(s.config.compareConfig.locatorValue, 'btn1');
  });

  test('tc-search-element-page 更新 pageId 并清空 elementId/Name', async () => {
    setupI18n();
    const StepEditor = await loadStepEditor();
    const se = new StepEditor();
    const s = se.addStep();
    s.config.searchConfig = { pageId: 'old', elementId: 'old', elementName: 'Old' };

    se.updateStepSelect('tc-search-element-page-1', 'page1', s.id);
    assert.strictEqual(s.config.searchConfig.pageId, 'page1');
    assert.strictEqual(s.config.searchConfig.elementId, '');
    assert.strictEqual(s.config.searchConfig.elementName, '');
  });

  test('tc-search-element-select 更新 elementId + locator (依赖 getApp)', async () => {
    setupI18n();
    const StepEditor = await loadStepEditor();
    const se = new StepEditor({ getApp: () => makeFakeApp() });
    const s = se.addStep();
    s.config.searchConfig = { pageId: 'page1' };

    se.updateStepSelect('tc-search-element-select-1', 'el2', s.id);
    assert.strictEqual(s.config.searchConfig.elementId, 'el2');
    assert.strictEqual(s.config.searchConfig.elementName, 'Element2');
  });

  test('tc-element-select 在 click locator 下强制 operation=click', async () => {
    setupI18n();
    const StepEditor = await loadStepEditor();
    const se = new StepEditor({ getApp: () => makeFakeApp() });
    const s = se.addStep();
    s.config.pageId = 'page1';
    s.config.operation = 'sendText';
    s.config.operationValue = { text: 'abc' };

    se.updateStepSelect('tc-element-select-1', 'el2', s.id);
    assert.strictEqual(s.config.operation, 'click');
    assert.deepStrictEqual(s.config.operationValue, {});
  });
});

describe('StepEditor updateStepSelect - 事件', () => {
  test('触发 step-updated 事件携带 stepId/selectId/value/index', async () => {
    setupI18n();
    const StepEditor = await loadStepEditor();
    const se = new StepEditor();
    const s = se.addStep();
    let payload = null;
    se.on('step-updated', (p) => { payload = p; });

    se.updateStepSelect('tc-operation-select-1', 'click', s.id, 3);
    assert.deepStrictEqual(payload, {
      stepId: s.id,
      selectId: 'tc-operation-select-1',
      value: 'click',
      index: 3,
    });
  });

  test('不存在的 stepId 静默无操作', async () => {
    setupI18n();
    const StepEditor = await loadStepEditor();
    const se = new StepEditor();
    let emitCount = 0;
    se.on('step-updated', () => { emitCount++; });

    se.updateStepSelect('tc-operation-select-1', 'click', 'nonexistent');
    assert.strictEqual(emitCount, 0);
  });
});

describe('StepEditor setSteps / reset / syncFromDOM', () => {
  test('setSteps 设置数组并触发 steps-changed', async () => {
    const StepEditor = await loadStepEditor();
    const se = new StepEditor();
    let emitted = null;
    se.on('steps-changed', (s) => { emitted = s; });

    se.setSteps([{ id: 'a', order: 1 }, { id: 'b', order: 2 }]);
    assert.strictEqual(se.steps.length, 2);
    assert.strictEqual(emitted.length, 2);
  });

  test('setSteps 非数组转为空数组', async () => {
    const StepEditor = await loadStepEditor();
    const se = new StepEditor();
    se.setSteps(null);
    assert.deepStrictEqual(se.steps, []);
  });

  test('setSteps 拷贝输入数组 (避免外部修改)', async () => {
    const StepEditor = await loadStepEditor();
    const se = new StepEditor();
    const input = [{ id: 'a', order: 1 }];
    se.setSteps(input);

    input.push({ id: 'b', order: 2 });
    assert.strictEqual(se.steps.length, 1);
  });

  test('reset 清空数组并触发 steps-changed', async () => {
    setupI18n();
    const StepEditor = await loadStepEditor();
    const se = new StepEditor();
    se.addStep();
    let emitCount = 0;
    se.on('steps-changed', () => { emitCount++; });

    se.reset();
    assert.deepStrictEqual(se.steps, []);
    assert.strictEqual(emitCount, 1);
  });

  test('syncFromDOM 静默覆盖 (无事件)', async () => {
    const StepEditor = await loadStepEditor();
    const se = new StepEditor();
    let emitCount = 0;
    se.on('steps-changed', () => { emitCount++; });

    se.syncFromDOM([{ id: 'a', order: 1 }]);
    assert.strictEqual(se.steps.length, 1);
    assert.strictEqual(emitCount, 0);
  });

  test('syncFromDOM 空数组或非数组无操作', async () => {
    const StepEditor = await loadStepEditor();
    const se = new StepEditor();
    se.syncFromDOM([]);
    assert.deepStrictEqual(se.steps, []);

    se.syncFromDOM(null);
    assert.deepStrictEqual(se.steps, []);
  });
});

describe('StepEditor setDraggedStep', () => {
  test('setDraggedStep 更新并触发 dragged-step-changed', async () => {
    const StepEditor = await loadStepEditor();
    const se = new StepEditor();
    let emitted = null;
    se.on('dragged-step-changed', (s) => { emitted = s; });

    const step = { id: 'step_x' };
    se.setDraggedStep(step);
    assert.strictEqual(se.draggedStep, step);
    assert.strictEqual(emitted, step);
  });

  test('setDraggedStep null 清空', async () => {
    const StepEditor = await loadStepEditor();
    const se = new StepEditor();
    se.setDraggedStep({ id: 'x' });
    se.setDraggedStep(null);
    assert.strictEqual(se.draggedStep, null);
  });

  test('setDraggedStep 同值不触发', async () => {
    const StepEditor = await loadStepEditor();
    const se = new StepEditor();
    const step = { id: 'x' };
    se.setDraggedStep(step);
    let emitCount = 0;
    se.on('dragged-step-changed', () => { emitCount++; });

    se.setDraggedStep(step);
    assert.strictEqual(emitCount, 0);
  });
});

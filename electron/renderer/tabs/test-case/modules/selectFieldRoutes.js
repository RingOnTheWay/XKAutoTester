// P2-1: selectId 前缀 → 字段路由 单一 schema (读写方向共用)
// 收敛: StepEditor.updateStepSelect (写方向) 与 view.collectStepCardsData (读方向)
// 原两套 25+ 分支 if/else 前缀映射, 新增字段需双改易漂移。
// 此处定义唯一路由, 两方向经 applySelectRoute 统一写字段;
// 级联副作用 (page 清空 element / element 更新 locator 等) 由调用方按前缀附加。

/**
 * @typedef {{prefix: string, path: (string|'<index>')[], parse?: (v: string) => any}} SelectRoute
 */

/** @type {SelectRoute[]} */
export const SELECT_FIELD_ROUTES = [
  { prefix: 'tc-page-select', path: ['pageId'] },
  { prefix: 'tc-element-select', path: ['elementId'] },
  { prefix: 'tc-operation-select', path: ['operation'] },
  { prefix: 'tc-input-type-select', path: ['operationValue', 'inputType'] },
  { prefix: 'tc-ble-method-select', path: ['deviceConfig', 'methodName'] },
  {
    prefix: 'tc-system-operation-type',
    path: ['systemConfig', 'operationType'],
  },
  {
    prefix: 'tc-nav-click-count',
    path: ['systemConfig', 'clickCount'],
    // P1-1: 非法回退 1 (原误写 operationType 的历史 bug 防护)
    parse: (v) => {
      const n = parseInt(v, 10);
      return Number.isInteger(n) && n > 0 ? n : 1;
    },
  },
  { prefix: 'tc-page-operation-type', path: ['operationType'] },
  {
    prefix: 'tc-target-value-type',
    path: ['compareConfig', 'targetValueType'],
  },
  { prefix: 'tc-search-type', path: ['searchConfig', 'searchType'] },
  {
    prefix: 'tc-faker-locale',
    path: ['operationValue', 'fakerConfig', 'locale'],
  },
  {
    prefix: 'tc-faker-provider',
    path: ['operationValue', 'fakerConfig', 'provider'],
  },
  {
    prefix: 'tc-faker-method',
    path: ['operationValue', 'fakerConfig', 'method'],
  },
  {
    prefix: 'tc-faker-category',
    path: ['operationValue', 'fakerConfig', 'category'],
  },
  { prefix: 'tc-nav-key-select', path: ['systemConfig', 'navKey'] },
  {
    prefix: 'tc-random-precision',
    path: ['operationValue', 'randomConfig', 'precision'],
    parse: (v) => parseInt(v, 10),
  },
  {
    prefix: 'tc-multi-element-select',
    path: ['selectedElements', '<index>', 'elementId'],
  },
  {
    prefix: 'tc-multi-operation-select',
    path: ['selectedElements', '<index>', 'operation'],
  },
  // R24 P1-1: multi 输入类配置统一收敛到 operationValue 下 (与渲染回填 renderMultiOperationValue
  // / renderSendTextConfig / renderFakerConfig 及 Python 生成器 op_value 读取路径对齐)。
  // 原写方向存 selectedElements[i].inputType / fakerLocale, 渲染/收集分别读写
  // operationValue.* / elem.fakerConfig → 三处漂移, 保存后配置不回显且生成器读不到。
  {
    prefix: 'tc-multi-input-type-select',
    path: ['selectedElements', '<index>', 'operationValue', 'inputType'],
  },
  {
    prefix: 'tc-multi-faker-locale',
    path: ['selectedElements', '<index>', 'operationValue', 'fakerConfig', 'locale'],
  },
  {
    prefix: 'tc-multi-faker-provider',
    path: ['selectedElements', '<index>', 'operationValue', 'fakerConfig', 'provider'],
  },
  { prefix: 'tc-compare-element-page', path: ['compareConfig', 'pageId'] },
  { prefix: 'tc-compare-element-select', path: ['compareConfig', 'elementId'] },
  { prefix: 'tc-search-element-page', path: ['searchConfig', 'pageId'] },
  { prefix: 'tc-search-element-select', path: ['searchConfig', 'elementId'] },
  { prefix: 'tc-ble-step-select', path: ['compareConfig', 'bleStepId'] },
];

/**
 * 查找 selectId 对应的路由
 * @param {string} selectId
 * @returns {SelectRoute|null}
 */
export function findSelectRoute(selectId) {
  if (typeof selectId !== 'string') return null;
  return SELECT_FIELD_ROUTES.find((r) => selectId.startsWith(r.prefix)) || null;
}

/**
 * 按路由深路径写入 config 字段 (multi 路由需要 index)
 * @param {Object} config
 * @param {string} selectId
 * @param {string} value
 * @param {number} [index] - multi 元素索引
 * @returns {boolean} 是否命中路由并写入
 */
export function applySelectRoute(config, selectId, value, index) {
  const route = findSelectRoute(selectId);
  if (!route) {
    // R24 P2-8: 未知前缀不再静默 — 调用方忽略返回值时 (如 StepEditor 通用分支)
    // 打 warn 便于发现新字段漏登记 / 前缀拼错 (正常路径不应出现)
    console.warn(`[selectFieldRoutes] 未登记的路由前缀: ${selectId}`);
    return false;
  }

  // multi 路由缺 index 时不写入
  if (route.path.includes('<index>')) {
    if (index === undefined) return false;
    if (!config.selectedElements) config.selectedElements = [];
    if (!config.selectedElements[index]) config.selectedElements[index] = {};
  }

  const finalValue = typeof route.parse === 'function' ? route.parse(value) : value;
  let target = config;
  for (const seg of route.path) {
    if (seg === '<index>') {
      target = target[index];
      continue;
    }
    if (seg === route.path[route.path.length - 1]) {
      target[seg] = finalValue;
      return true;
    }
    if (typeof target[seg] !== 'object' || target[seg] === null) target[seg] = {};
    target = target[seg];
  }
  return true;
}

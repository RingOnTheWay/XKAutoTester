// TestCaseCodeGenerator 单元测试
// 覆盖 5 个 helper + 15 个 generate 方法
// 需用 --require tests/electron/_setup.js 预加载 electron mock (本测试不直接用 electron，但保持一致)
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs/promises');
const fss = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const TestCaseCodeGenerator = require('../../electron/src/main/services/TestCaseCodeGenerator');

// ─── 构造 ────────────────────────────────────────────────────
describe('TestCaseCodeGenerator 构造', () => {
  test('应存储 userConfigPath 和 projectRoot', () => {
    const gen = new TestCaseCodeGenerator('/fake/config', '/fake/project');
    assert.strictEqual(gen.userConfigPath, '/fake/config');
    assert.strictEqual(gen.projectRoot, '/fake/project');
  });

  test('应派生 testCasesDir / templatePath / pagePackagePath', () => {
    const gen = new TestCaseCodeGenerator('/fake/config', '/fake/project');
    assert.ok(gen.testCasesDir.includes(path.join('fake', 'config', 'test_cases')));
    assert.ok(gen.templatePath.endsWith(path.join('templates', 'test_case_template.py')));
    assert.ok(gen.pagePackagePath.endsWith(path.join('fake', 'config', 'page_package.json')));
  });
});

// ─── Helper 方法 ────────────────────────────────────────────
describe('toClassName', () => {
  const gen = new TestCaseCodeGenerator('/fake', '/fake');
  test('转换 test_login_success → TestLoginSuccess', () => {
    assert.strictEqual(gen.toClassName('test_login_success'), 'TestLoginSuccess');
  });
  test('处理无 test_ 前缀', () => {
    assert.strictEqual(gen.toClassName('login'), 'TestLogin');
  });
  test('处理 .py 后缀', () => {
    assert.strictEqual(gen.toClassName('test_login.py'), 'TestLogin');
  });
});

describe('replaceTemplateVars', () => {
  const gen = new TestCaseCodeGenerator('/fake', '/fake');
  test('替换单个变量', () => {
    const result = gen.replaceTemplateVars('Hello {{NAME}}', { NAME: 'World' });
    assert.strictEqual(result, 'Hello World');
  });
  test('替换多个变量', () => {
    const result = gen.replaceTemplateVars('{{A}} and {{B}}', { A: '1', B: '2' });
    assert.strictEqual(result, '1 and 2');
  });
  test('同变量多次出现全部替换', () => {
    const result = gen.replaceTemplateVars('{{X}} {{X}}', { X: 'Y' });
    assert.strictEqual(result, 'Y Y');
  });
});

describe('findElementById', () => {
  const gen = new TestCaseCodeGenerator('/fake', '/fake');
  const targetApp = {
    pages: [
      { elements: [{ id: 'e1', locator: 'id', value: 'btn1' }] },
      { elements: [{ id: 'e2', locator: 'xpath', value: '//x' }] }
    ]
  };
  test('找到元素返回元素对象', () => {
    const el = gen.findElementById('e2', targetApp);
    assert.strictEqual(el?.value, '//x');
  });
  test('未找到返回 null', () => {
    assert.strictEqual(gen.findElementById('nope', targetApp), null);
  });
  test('targetApp 为 null 返回 null', () => {
    assert.strictEqual(gen.findElementById('e1', null), null);
  });
});

describe('findElementByIdFromPackage', () => {
  const gen = new TestCaseCodeGenerator('/fake', '/fake');
  const pkg = {
    apps: [
      { pages: [{ elements: [{ id: 'p1e1', locator: 'id', value: 'pkgBtn' }] }] }
    ]
  };
  test('找到元素', () => {
    assert.strictEqual(gen.findElementByIdFromPackage('p1e1', pkg)?.value, 'pkgBtn');
  });
  test('未找到返回 null', () => {
    assert.strictEqual(gen.findElementByIdFromPackage('nope', pkg), null);
  });
  test('pagePackageData 为 null 返回 null', () => {
    assert.strictEqual(gen.findElementByIdFromPackage('p1e1', null), null);
  });
});

describe('loadPagePackageData', () => {
  let tmpDir, gen;
  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xkat-gen-'));
    gen = new TestCaseCodeGenerator(tmpDir, '/fake');
  });
  after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test('文件存在时返回解析后的对象', async () => {
    await fs.writeFile(path.join(tmpDir, 'page_package.json'), JSON.stringify({ apps: [{ name: 'A' }] }));
    const data = await gen.loadPagePackageData();
    assert.strictEqual(data.apps[0].name, 'A');
  });

  test('文件不存在时返回 { apps: [] }', async () => {
    const tmpDir2 = await fs.mkdtemp(path.join(os.tmpdir(), 'xkat-gen-empty-'));
    const gen2 = new TestCaseCodeGenerator(tmpDir2, '/fake');
    const data = await gen2.loadPagePackageData();
    assert.deepStrictEqual(data, { apps: [] });
    await fs.rm(tmpDir2, { recursive: true, force: true });
  });
});

// ─── 模板配置生成 ──────────────────────────────────────────
describe('generateWaitTimeConfig', () => {
  const gen = new TestCaseCodeGenerator('/fake', '/fake');
  test('使用默认值 (无 waitTimeConfig)', () => {
    const tpl = 'APP_LOAD_WAIT_TIME = 10\nELEMENT_WAIT_TIMEOUT = 30\nSTEP_INTERVAL = 2\nAPP_CLOSE_WAIT_TIME = 2\n';
    const out = gen.generateWaitTimeConfig(tpl, {});
    assert.match(out, /APP_LOAD_WAIT_TIME = 10/);
    assert.match(out, /ELEMENT_WAIT_TIMEOUT = 30/);
  });
  test('使用自定义值', () => {
    const tpl = 'APP_LOAD_WAIT_TIME = 10\nELEMENT_WAIT_TIMEOUT = 30\nSTEP_INTERVAL = 2\nAPP_CLOSE_WAIT_TIME = 2\n';
    const out = gen.generateWaitTimeConfig(tpl, { waitTimeConfig: { appLoadWaitTime: 20, elementWaitTimeout: 60, stepInterval: 5, appCloseWaitTime: 10 } });
    assert.match(out, /APP_LOAD_WAIT_TIME = 20/);
    assert.match(out, /ELEMENT_WAIT_TIMEOUT = 60/);
    assert.match(out, /STEP_INTERVAL = 5/);
    assert.match(out, /APP_CLOSE_WAIT_TIME = 10/);
  });
});

describe('generateBleConfig', () => {
  const gen = new TestCaseCodeGenerator('/fake', '/fake');
  test('无 ble 步骤时清空占位符', () => {
    const tpl = '{{BLE_CONFIG}}{{BLE_CONFIG_INIT}}{{BLE_IMPORT}}';
    const out = gen.generateBleConfig(tpl, { steps: [{ type: 'element' }] });
    assert.strictEqual(out, '');
  });
  test('有 ble 步骤时填充 BLE 常量', () => {
    const tpl = '{{BLE_CONFIG}}\n{{BLE_CONFIG_INIT}}\n{{BLE_IMPORT}}';
    const out = gen.generateBleConfig(tpl, {
      steps: [{ type: 'ble' }],
      bleDevice: { uuids: 'UUID-S', bleName: 'DevX', port: 'COM3' }
    });
    assert.match(out, /BLE_UUIDS = "UUID-S"/);
    assert.match(out, /BLE_NAME = "DevX"/);
    assert.match(out, /BLE_PORT = "COM3"/);
    assert.match(out, /ble_config = BLEConfig\(/);
    assert.match(out, /, BLEConfig/);
  });
});

describe('generateAllureDecorators', () => {
  const gen = new TestCaseCodeGenerator('/fake', '/fake');
  test('同时有 epic 和 feature', () => {
    const out = gen.generateAllureDecorators('{{ALLURE_DECORATORS}}', { allureConfig: { epic: 'E1', feature: 'F1' } });
    assert.match(out, /@allure\.epic\("E1"\)/);
    assert.match(out, /@allure\.feature\("F1"\)/);
  });
  test('无 allureConfig 时为空', () => {
    const out = gen.generateAllureDecorators('{{ALLURE_DECORATORS}}', {});
    assert.strictEqual(out, '');
  });
});

describe('generateAllureAttachCode', () => {
  const gen = new TestCaseCodeGenerator('/fake', '/fake');
  test('默认选项: JSON 序列化内容 + TEXT 类型 + 默认缩进', () => {
    const out = gen.generateAllureAttachCode('hello', 'Tag');
    assert.match(out, /allure\.attach\(/);
    assert.match(out, /"hello"/);
    assert.match(out, /name="Tag"/);
    assert.match(out, /allure\.attachment_type\.TEXT/);
    assert.ok(out.startsWith('                '));
  });
  test('isFString=true 时内容包成 f"..."', () => {
    const out = gen.generateAllureAttachCode('val={x}', 'V', { isFString: true });
    assert.match(out, /f"val=\{x\}"/);
  });
  test('isVariable=true 时内容直接使用 (不引号)', () => {
    const out = gen.generateAllureAttachCode('screenshot', 'Shot', { isVariable: true, type: 'PNG' });
    assert.match(out, /screenshot,/);
    assert.match(out, /allure\.attachment_type\.PNG/);
  });
  test('自定义 indent 生效', () => {
    const out = gen.generateAllureAttachCode('x', 'N', { indent: '    ' });
    assert.ok(out.startsWith('    allure.attach('));
  });
});

describe('generateInputValueCode', () => {
  const gen = new TestCaseCodeGenerator('/fake', '/fake');
  test('null operationValue 返回 \'\'', () => {
    assert.strictEqual(gen.generateInputValueCode(null), "''");
  });
  test('custom 类型: 单引号包裹 + 转义反斜杠和单引号', () => {
    const out = gen.generateInputValueCode({ inputType: 'custom', inputValue: "a'b\\c" });
    assert.strictEqual(out, "'a\\'b\\\\c'");
  });
  test('random 类型 precision=0: randint(0,100)', () => {
    const out = gen.generateInputValueCode({ inputType: 'random', randomConfig: { precision: 0 } });
    assert.strictEqual(out, 'str(random.randint(0, 100))');
  });
  test('random 类型 precision=2: round(uniform(0,100), 2)', () => {
    const out = gen.generateInputValueCode({ inputType: 'random', randomConfig: { precision: 2 } });
    assert.strictEqual(out, 'str(round(random.uniform(0, 100), 2))');
  });
  test('faker 类型 person.name → fake.name()', () => {
    const out = gen.generateInputValueCode({ inputType: 'faker', fakerConfig: { provider: 'person.name' } });
    assert.strictEqual(out, 'self.fake.name()');
  });
  test('faker 类型 单段 provider → fake.provider()', () => {
    const out = gen.generateInputValueCode({ inputType: 'faker', fakerConfig: { provider: 'email' } });
    assert.strictEqual(out, 'self.fake.email()');
  });
  test('未知 inputType 返回 \'\'', () => {
    assert.strictEqual(gen.generateInputValueCode({ inputType: 'unknown' }), "''");
  });
});

describe('generateBleStepCode', () => {
  const gen = new TestCaseCodeGenerator('/fake', '/fake');
  test('无 config 返回 pass', () => {
    const out = gen.generateBleStepCode({ config: null });
    assert.match(out, /pass  # 无配置/);
  });
  test('send_random_data 调用 temperature_bioland_gen(min_value, max_value, precision)', () => {
    const out = gen.generateBleStepCode({
      config: { deviceConfig: { methodName: 'send_random_data', params: { min_value: 36.0, max_value: 37.5, precision: 1 } } },
      name: 'BLE随机'
    });
    assert.match(out, /temperature_bioland_gen\(/);
    assert.match(out, /min_value=36/);
    assert.match(out, /max_value=37.5/);
    assert.match(out, /precision=1/);
    assert.match(out, /self\.test_ble_value = test_value/);
  });
  test('send_custom_data 调用 temperature_bioland_gen(temperature=)', () => {
    const out = gen.generateBleStepCode({
      config: { deviceConfig: { methodName: 'send_custom_data', params: { temperature: 36.5 } } },
      name: 'BLE定制'
    });
    assert.match(out, /temperature=36\.5/);
  });
  test('其他 methodName 直接使用 hexData', () => {
    const out = gen.generateBleStepCode({
      config: { deviceConfig: { methodName: 'send_hex', params: { hexData: 'ABCD' } } },
      name: 'BLE原始'
    });
    assert.match(out, /hex_data = "ABCD"/);
  });
});

describe('generateSystemStepCode', () => {
  const gen = new TestCaseCodeGenerator('/fake', '/fake');
  test('back 单次按下 KEYCODE_BACK', () => {
    const out = gen.generateSystemStepCode({
      config: { systemConfig: { operationType: 'navigation', navKey: 'back', clickCount: 1 } },
      name: '返回'
    });
    assert.match(out, /self\.driver\.press_keycode\(KEYCODE_BACK\)/);
    assert.ok(!out.includes('for _ in range'));
  });
  test('home 多次按下 KEYCODE_HOME', () => {
    const out = gen.generateSystemStepCode({
      config: { systemConfig: { operationType: 'navigation', navKey: 'home', clickCount: 3 } },
      name: '主页'
    });
    assert.match(out, /KEYCODE_HOME/);
    assert.match(out, /for _ in range\(3\)/);
  });
  test('未知 navKey 回退到 back', () => {
    const out = gen.generateSystemStepCode({
      config: { systemConfig: { operationType: 'navigation', navKey: 'unknown', clickCount: 1 } },
      name: 'X'
    });
    assert.match(out, /KEYCODE_BACK/);
  });
});

describe('generateSetupMethodContent', () => {
  const gen = new TestCaseCodeGenerator('/fake', '/fake');
  test('有 BLE 随机步骤返回注释', () => {
    const out = gen.generateSetupMethodContent({
      steps: [{ type: 'ble', config: { deviceConfig: { methodName: 'send_random_data' } } }]
    });
    assert.match(out, /蓝牙随机数据会在步骤中动态生成/);
  });
  test('无 BLE 随机步骤返回 pass', () => {
    const out = gen.generateSetupMethodContent({ steps: [{ type: 'element' }] });
    assert.strictEqual(out, 'pass');
  });
});

describe('generateAdditionalImports', () => {
  const gen = new TestCaseCodeGenerator('/fake', '/fake');
  test('有 BLE 随机步骤返回 import 语句', () => {
    const out = gen.generateAdditionalImports({
      steps: [{ type: 'ble', config: { deviceConfig: { methodName: 'send_custom_data' } } }]
    });
    assert.match(out, /from main\.device\.bioland\.E127B import temperature_bioland_gen/);
  });
  test('无 BLE 步骤返回空字符串', () => {
    const out = gen.generateAdditionalImports({ steps: [{ type: 'element' }] });
    assert.strictEqual(out, '');
  });
});

// ─── 步骤代码生成 ──────────────────────────────────────────
describe('generateStepCode', () => {
  const gen = new TestCaseCodeGenerator('/fake', '/fake');
  test('element 类型调度到 generateElementStepCode', () => {
    const out = gen.generateStepCode({
      type: 'element',
      name: '点',
      config: { operation: 'click', locator: 'id', locatorValue: 'btn', operationValue: { clickCount: 1 } }
    }, 0, {}, [], { apps: [] });
    assert.match(out, /1\. 点/);
    assert.match(out, /with allure\.step\("点"\):/);
    assert.match(out, /element\.click\(\)/);
  });
  test('ble 类型调度到 generateBleStepCode', () => {
    const out = gen.generateStepCode({
      type: 'ble', name: 'BLE', config: { deviceConfig: { methodName: 'send_random_data', params: {} } }
    }, 0, {}, [], { apps: [] });
    assert.match(out, /temperature_bioland_gen/);
  });
  test('system 类型调度到 generateSystemStepCode', () => {
    const out = gen.generateStepCode({
      type: 'system', name: 'SYS', config: { systemConfig: { operationType: 'navigation', navKey: 'back', clickCount: 1 } }
    }, 0, {}, [], { apps: [] });
    assert.match(out, /KEYCODE_BACK/);
  });
  test('page 类型调度到 generatePageStepCode', () => {
    const out = gen.generateStepCode({
      type: 'page', name: 'PG',
      config: { operationType: 'compare', compareConfig: { locator: 'id', locatorValue: 'v', targetValue: 'x' } }
    }, 0, {}, [], { apps: [] });
    assert.match(out, /expected_value/);
  });
  test('未知类型输出 pass', () => {
    const out = gen.generateStepCode({ type: 'mystery', name: 'X', config: {} }, 0, {}, [], { apps: [] });
    assert.match(out, /pass  # 未知步骤类型/);
  });
});

describe('generateElementStepCode', () => {
  const gen = new TestCaseCodeGenerator('/fake', '/fake');
  test('无 config 返回 pass', () => {
    assert.match(gen.generateElementStepCode({ config: null }, {}, null), /pass  # 无配置/);
  });
  test('multiSelect 调度到 generateMultiElementStepCode', () => {
    const out = gen.generateElementStepCode({
      config: { multiSelect: true, selectedElements: [{ elementId: 'e1' }] }
    }, { pages: [{ elements: [{ id: 'e1', locator: 'id', value: 'v' }] }] }, { apps: [] });
    assert.match(out, /multi_elements = \[/);
  });
  test('click 操作生成 element.click()', () => {
    const out = gen.generateElementStepCode({
      config: { operation: 'click', locator: 'id', locatorValue: 'btn', operationValue: { clickCount: 2 } },
      name: '点2次'
    }, {}, { apps: [] });
    assert.match(out, /element\.click\(\)/);
    // clickCount=2 -> 两行 element.click()
    const matches = out.match(/element\.click\(\)/g);
    assert.strictEqual(matches.length, 2);
  });
  test('click locator 类型走 driver.tap 路径', () => {
    const out = gen.generateElementStepCode({
      config: { operation: 'click', locator: 'click', locatorValue: '100,200', operationValue: { clickCount: 1 } },
      name: '坐标点击'
    }, {}, { apps: [] });
    assert.match(out, /self\.driver\.tap\(\[\(100, 200\)\]\)/);
  });
});

describe('generateMultiElementStepCode', () => {
  const gen = new TestCaseCodeGenerator('/fake', '/fake');
  test('从 pagePackageData 查找元素信息', () => {
    const out = gen.generateMultiElementStepCode({
      config: {
        selectedElements: [{ elementId: 'e1', operation: 'click', operationValue: { clickCount: 1 } }],
        multiClickCount: 1
      }
    }, {}, { apps: [{ pages: [{ elements: [{ id: 'e1', locator: 'id', value: 'btn1' }] }] }] });
    assert.match(out, /'locator_value': 'btn1'/);
    assert.match(out, /random\.sample\(multi_elements, selected_count\)/);
  });
  test('pagePackageData 未找到时回退到 targetApp', () => {
    const out = gen.generateMultiElementStepCode({
      config: {
        selectedElements: [{ elementId: 'e2', operation: 'click', operationValue: { clickCount: 1 } }],
        multiClickCount: 1
      }
    }, { pages: [{ elements: [{ id: 'e2', locator: 'xpath', value: '//x' }] }] }, { apps: [] });
    assert.match(out, /'locator_value': '\/\/x'/);
    assert.match(out, /'locator_type': 'XPATH'/);
  });
});

describe('generatePageStepCode', () => {
  const gen = new TestCaseCodeGenerator('/fake', '/fake');
  test('无 config 返回 pass', () => {
    assert.match(gen.generatePageStepCode({ config: null }, [], null), /pass  # 无配置/);
  });
  test('search + text 类型生成 XPATH 查找', () => {
    const out = gen.generatePageStepCode({
      config: { operationType: 'search', searchConfig: { searchType: 'text', textValue: '登录', matchType: 'contains' } }
    }, [], { apps: [] });
    assert.match(out, /AppiumBy\.XPATH/);
    assert.match(out, /contains\(@text, "登录"\)/);
    assert.match(out, /while waited_time < ELEMENT_WAIT_TIMEOUT/);
  });
  test('search + element 类型生成定位器查找', () => {
    const out = gen.generatePageStepCode({
      config: { operationType: 'search', searchConfig: { searchType: 'element', locator: 'id', locatorValue: 'btn' } }
    }, [], { apps: [] });
    assert.match(out, /AppiumBy\.ID/);
    assert.match(out, /'btn'/);
  });
  test('compare 有 tolerance 走数值对比路径', () => {
    const out = gen.generatePageStepCode({
      config: {
        operationType: 'compare',
        compareConfig: { locator: 'id', locatorValue: 'valEl', targetValue: '36.5', tolerance: 0.5 }
      }
    }, [], { apps: [] });
    assert.match(out, /displayed_num = float\(displayed_value\)/);
    assert.match(out, /if diff <= 0\.5:/);
  });
  test('compare 无 tolerance 走字符串对比路径', () => {
    const out = gen.generatePageStepCode({
      config: {
        operationType: 'compare',
        compareConfig: { locator: 'id', locatorValue: 'valEl', targetValue: 'abc' }
      }
    }, [], { apps: [] });
    assert.match(out, /if displayed_value == expected_value:/);
  });
  test('compare + targetValueType=ble 使用 self.test_ble_value', () => {
    const out = gen.generatePageStepCode({
      config: {
        operationType: 'compare',
        compareConfig: { locator: 'id', locatorValue: 'el', targetValueType: 'ble', bleStepId: 's1', tolerance: 0.2 }
      }
    }, [{ id: 's1', name: 'BLE步骤' }], { apps: [] });
    assert.match(out, /expected_value = str\(self\.test_ble_value\)/);
    assert.match(out, /使用步骤"BLE步骤"生成的随机值/);
  });
});

describe('generateTestMethods', () => {
  const gen = new TestCaseCodeGenerator('/fake', '/fake');
  test('生成方法定义 + 装饰器 + 步骤代码', () => {
    const tpl = '{{TEST_METHODS}}\n{{SETUP_METHOD_CONTENT}}\n{{ADDITIONAL_IMPORTS}}';
    const out = gen.generateTestMethods(tpl, {
      fileName: 'test_login',
      name: '登录测试',
      description: '测试登录流程',
      allureConfig: { story: 'S', markers: ['smoke'] },
      steps: [
        { type: 'system', name: '返回', config: { systemConfig: { operationType: 'navigation', navKey: 'back', clickCount: 1 } } }
      ]
    }, { apps: [] });
    assert.match(out, /def test_login\(self\):/);
    assert.match(out, /@allure\.story\("S"\)/);
    assert.match(out, /@allure\.title\("登录测试"\)/);
    assert.match(out, /@pytest\.mark\.smoke/);
    assert.match(out, /KEYCODE_BACK/);
    assert.match(out, /用例执行结束/);
  });
});

// ─── 端到端 generatePythonFile ─────────────────────────────
describe('generatePythonFile 端到端', () => {
  let tmpDir, outputDir, gen;
  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xkat-e2e-'));
    outputDir = path.join(tmpDir, 'output');
    await fs.mkdir(outputDir, { recursive: true });
    // 写 page_package.json
    await fs.writeFile(
      path.join(tmpDir, 'page_package.json'),
      JSON.stringify({ apps: [{ pages: [{ elements: [{ id: 'e1', locator: 'id', value: 'btn' }] }] }] })
    );
    // 写最小模板 (覆盖使用的占位符)
    const tplPath = path.join(__dirname, '..', '..', 'electron', 'templates', 'test_case_template.py');
    const tplExists = fss.existsSync(tplPath);
    gen = tplExists ? new TestCaseCodeGenerator(tmpDir, '/fake') : null;
  });
  after(async () => {
    if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test('生成 .py 文件 + 返回 {success, path} (H3: 不返 jsonPath, 不 mutation caseData)', async (t) => {
    if (!gen) return t.skip('模板文件不存在，跳过 e2e');
    const caseData = {
      fileName: 'test_e2e_case',
      name: 'E2E',
      description: '端到端',
      targetApp: { name: 'App', packageName: 'com.app', activityName: 'Main' },
      deviceConfig: { deviceName: 'D1', platformVersion: '12' },
      platform: 'Android',
      allureConfig: { epic: 'E', feature: 'F' },
      waitTimeConfig: { appLoadWaitTime: 15, elementWaitTimeout: 30, stepInterval: 2, appCloseWaitTime: 2 },
      steps: [
        { type: 'system', name: '返回', config: { systemConfig: { operationType: 'navigation', navKey: 'back', clickCount: 1 } } }
      ]
    };
    const result = await gen.generatePythonFile(caseData, outputDir);
    assert.strictEqual(result.success, true);
    assert.ok(result.path.endsWith('test_e2e_case.py'));
    // H3: generator 不再回写 JSON, 不返 jsonPath (由 TestCaseService 单源写)
    assert.strictEqual(result.jsonPath, undefined);

    const pyContent = await fs.readFile(result.path, 'utf8');
    assert.match(pyContent, /class TestE2eCase/);
    assert.match(pyContent, /def test_e2e_case\(self\):/);
    assert.match(pyContent, /KEYCODE_BACK/);
    assert.match(pyContent, /APP_LOAD_WAIT_TIME = 15/);

    // H3: generator 不再 mutation caseData (pyFilePath/pyOutputDir 由 TestCaseService 设置)
    assert.strictEqual(caseData.pyFilePath, undefined);
    assert.strictEqual(caseData.pyOutputDir, undefined);
  });

  test('输出目录不存在时返回失败', async (t) => {
    if (!gen) return t.skip('模板文件不存在，跳过 e2e');
    const result = await gen.generatePythonFile({ fileName: 'x', name: 'X' }, '/nonexistent/path/xyz');
    assert.strictEqual(result.success, false);
    assert.ok(result.error);
  });

  // R24 P1-3: 生成入口路径安全 (渲染进程可控 fileName/outputDir)
  test('R24 P1-3 fileName 空/非字符串拒绝', async (t) => {
    if (!gen) return t.skip('模板文件不存在，跳过 e2e');
    for (const name of ['', '   ', null, undefined, 123, {}]) {
      const result = await gen.generatePythonFile({ fileName: name, name: 'X' }, outputDir);
      assert.strictEqual(result.success, false, `应拒绝 fileName: ${String(name)}`);
      assert.strictEqual(result.error, 'invalid_file_name');
    }
  });

  test('R24 P1-3 fileName 目录穿越被 basename 剥离后安全落在 outputDir 内', async (t) => {
    if (!gen) return t.skip('模板文件不存在，跳过 e2e');
    const names = ['../../evil', '../x', '..\\..\\evil', 'a/b', 'a\\b', '..\\..\\config\\config.json', 'x;rm', 'a"b'];
    for (const name of names) {
      const result = await gen.generatePythonFile(
        { fileName: name, name: 'X', targetApp: { name: 'A', packageName: 'c', activityName: 'M' } },
        outputDir
      );
      assert.strictEqual(result.success, true, `应放行并安全生成: ${name} (${result.error || ''})`);
      assert.ok(result.path.startsWith(outputDir), `路径必须落在 outputDir 内: ${name} → ${result.path}`);
      assert.ok(!result.path.includes('..'), `不得含 .. 组件: ${result.path}`);
    }
  });

  test('R24 P1-3 outputDir 相对路径/缺失拒绝', async (t) => {
    if (!gen) return t.skip('模板文件不存在，跳过 e2e');
    const r1 = await gen.generatePythonFile({ fileName: 'test_a' }, 'relative/dir');
    assert.strictEqual(r1.success, false);
    assert.strictEqual(r1.error, 'invalid_output_dir');
    const r2 = await gen.generatePythonFile({ fileName: 'test_a' });
    assert.strictEqual(r2.success, false);
    assert.strictEqual(r2.error, 'invalid_output_dir');
  });

  test('R24 P1-3 caseData 非对象拒绝', async (t) => {
    if (!gen) return t.skip('模板文件不存在，跳过 e2e');
    const r = await gen.generatePythonFile(null, outputDir);
    assert.strictEqual(r.success, false);
    assert.strictEqual(r.error, 'invalid_case_data');
  });
});


// ─── P0-1 代码注入回归测试 ─────────────────────────────────
describe('P0-1 转义函数族', () => {
  test('escapePyStringLiteral 转义双引号/反斜杠/换行', () => {
    const { escapePyStringLiteral } = TestCaseCodeGenerator;
    const out = escapePyStringLiteral('a"b\\c\nd');
    assert.strictEqual(out, '"a\\"b\\\\c\\nd"');
  });

  test('escapePyFStringPart 双括号化 { } 并转义 "', () => {
    const { escapePyFStringPart } = TestCaseCodeGenerator;
    const out = escapePyFStringPart('{x} "y" \\z');
    assert.ok(out.includes('{{x}}'));
    assert.ok(out.includes('\\"y\\"'));
    assert.ok(out.includes('\\\\z'));
  });

  test('escapePySingleQuoteStr 转义单引号/反斜杠/换行', () => {
    const { escapePySingleQuoteStr } = TestCaseCodeGenerator;
    const out = escapePySingleQuoteStr("a'b\\c\nd");
    assert.ok(out.includes("a\\'b\\\\c"));
    assert.ok(!out.includes('\n'));
  });

  test('escapePyDocstring 防 """ 提前终止', () => {
    const { escapePyDocstring } = TestCaseCodeGenerator;
    const out = escapePyDocstring('x """ y');
    assert.ok(!out.includes('"""'));
    assert.ok(out.includes("'''"));
  });

  test('toPythonIdentifier 清洗非法字符并保底', () => {
    const { toPythonIdentifier } = TestCaseCodeGenerator;
    assert.strictEqual(toPythonIdentifier('test_login'), 'login');
    assert.strictEqual(toPythonIdentifier('a b!c'), 'a_b_c');
    assert.strictEqual(toPythonIdentifier('!!!"\n'), 'case');
    assert.strictEqual(toPythonIdentifier(undefined), 'case');
  });

  test('clampInt 限制展开循环上限 (DoS 防线)', () => {
    const { clampInt } = TestCaseCodeGenerator;
    assert.strictEqual(clampInt(999999, 1, 100, 1), 100);
    assert.strictEqual(clampInt(-5, 1, 100, 1), 1);
    assert.strictEqual(clampInt('abc', 1, 100, 1), 1);
    assert.strictEqual(clampInt(7, 1, 100, 1), 7);
  });

  test('safeNumber 拒绝 NaN/字符串注入数字位', () => {
    const { safeNumber } = TestCaseCodeGenerator;
    assert.strictEqual(safeNumber('abc', 10), 10);
    assert.strictEqual(safeNumber('15', 10), 15);
    assert.strictEqual(safeNumber(NaN, 10), 10);
  });
});

describe('generatePythonFile P0-1 注入防护 端到端', () => {
  let tmpDir, outputDir, gen;
  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xkat-p0-'));
    outputDir = path.join(tmpDir, 'output');
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'page_package.json'), JSON.stringify({ apps: [] }));
    gen = new TestCaseCodeGenerator(tmpDir, '/fake');
  });
  after(async () => {
    if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test('恶意用例名/步骤名不产生裸注入代码, 且生成文件可编译', async () => {
    const payload = 'x"); import os; os.system("calc"); print("';
    const caseData = {
      fileName: 'inject_case',
      name: payload,
      description: 'desc """' + payload,
      steps: [
        { id: 's1', type: 'system', name: payload, config: { systemConfig: { operationType: 'navigation', navKey: 'back' } } },
        { id: 's2', type: 'element', name: payload + '"suffix', config: { operation: 'click', locator: 'id', locatorValue: 'btn' } }
      ],
      targetApp: { name: payload, packageName: payload },
      allureConfig: { story: payload, epic: payload, feature: payload, markers: ['smoke' + payload] },
      deviceConfig: { deviceName: payload, platformVersion: payload },
    };
    const result = await gen.generatePythonFile(caseData, outputDir);
    assert.strictEqual(result.success, true, result.error || '');

    const pyContent = await fs.readFile(result.path, 'utf8');

    // 语义级验证: 用 Python AST 解析生成文件, 确认不存在 os.system 调用节点。
    // 转义后的 payload 只是字符串字面量 (AST Str 节点), 无法产生 Call 节点;
    // 若转义失败 payload 逃逸为语句, AST 中会出现 Call(func=os.system) → 测试失败。
    assert.ok(pyContent.includes('\\"'), 'payload 中的引号必须被转义');

    if (process.env.SKIP_PY_COMPILE !== '1') {
      const { execFileSync } = require('node:child_process');
      // 1) 语法校验
      try {
        execFileSync('python', ['-m', 'py_compile', result.path], { stdio: 'pipe' });
      } catch (e) {
        assert.fail('生成文件未通过 py_compile: ' + (e.stderr || e.message));
      }
      // 2) 语义级注入扫描: AST 中不得出现 os.system / os.popen / subprocess 调用
      const astScript = [
        'import ast, sys',
        'tree = ast.parse(open(sys.argv[1], encoding="utf-8").read())',
        'bad = []',
        'for n in ast.walk(tree):',
        '    if (isinstance(n, ast.Call)',
        '            and isinstance(n.func, ast.Attribute)',
        '            and n.func.attr in ("system", "popen", "Popen")):',
        '        bad.append(n.lineno)',
        'if bad: sys.exit("发现注入调用: " + str(bad))',
      ].join('\n');
      try {
        execFileSync('python', ['-c', astScript, result.path], { stdio: 'pipe' });
      } catch (e) {
        assert.fail('AST 扫描发现注入调用: ' + (e.stderr || e.message));
      }
    }
  });

  test('非法 fileName 被清洗为合法标识符', async () => {
    const caseData = { fileName: 'test_a b!c', name: 'ok', steps: [] };
    const result = await gen.generatePythonFile(caseData, outputDir);
    assert.strictEqual(result.success, true, result.error || '');
    const pyContent = await fs.readFile(result.path, 'utf8');
    assert.match(pyContent, /def test_a_b_c\(self\):/);
  });
});


// ── R24 P2-3: toPyLiteral Python 字面量 (JSON 布尔/null → Python 关键字) ──

describe('R24 P2-3 toPyLiteral', () => {
  const { toPyLiteral } = TestCaseCodeGenerator;

  test('布尔/null/undefined 映射 Python 关键字', () => {
    assert.strictEqual(toPyLiteral(true), 'True');
    assert.strictEqual(toPyLiteral(false), 'False');
    assert.strictEqual(toPyLiteral(null), 'None');
    assert.strictEqual(toPyLiteral(undefined), 'None');
  });

  test('字符串转义单引号/反斜杠', () => {
    assert.strictEqual(toPyLiteral("a'b"), "'a\\'b'");
    assert.strictEqual(toPyLiteral('a\\b'), "'a\\\\b'");
  });

  test('数字/数组/嵌套对象递归', () => {
    assert.strictEqual(toPyLiteral(42), '42');
    assert.strictEqual(toPyLiteral([1, true, null]), '[1, True, None]');
    assert.strictEqual(toPyLiteral({ a: 1, b: false, c: { d: 'x' } }), "{'a': 1, 'b': False, 'c': {'d': 'x'}}");
  });

  test('对象 key 含注入字符被转义', () => {
    assert.strictEqual(toPyLiteral({ "k'ey": 1 }), "{'k\\'ey': 1}");
  });

  test('multi 元素 operationValue 含布尔时生成合法 Python (此前 NameError)', async () => {
    // 用真实模板生成, 断言生成代码含 True/False 而非 true/false
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xkat-pylit-'));
    const outDir = path.join(tmpDir, 'out');
    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'page_package.json'), JSON.stringify({ apps: [] }));
    const tplPath = path.join(__dirname, '..', '..', 'electron', 'templates', 'test_case_template.py');
    if (!fss.existsSync(tplPath)) {
      await fs.rm(tmpDir, { recursive: true, force: true });
      return;
    }
    const gen = new TestCaseCodeGenerator(tmpDir, '/fake');
    const result = await gen.generatePythonFile(
      {
        fileName: 'test_bool_op',
        name: 'B',
        targetApp: { name: 'A', packageName: 'c', activityName: 'M' },
        steps: [
          {
            type: 'element',
            name: '多选',
            config: {
              pageId: 'p1',
              multiSelect: true,
              selectedElements: [
                {
                  elementId: 'e1',
                  operation: 'sendText',
                  operationValue: { inputType: 'faker', fakerConfig: { provider: 'person.name' }, checked: true, enabled: false, note: null },
                },
              ],
            },
          },
        ],
      },
      outDir
    );
    assert.strictEqual(result.success, true, result.error || '');
    const py = await fs.readFile(result.path, 'utf8');
    assert.ok(!/\btrue\b/.test(py), '不得含 JSON 风格 true');
    assert.ok(!/\bfalse\b/.test(py), '不得含 JSON 风格 false');
    assert.ok(!/\bnull\b/.test(py), '不得含 JSON 风格 null');
    assert.match(py, /'checked': True/);
    assert.match(py, /'enabled': False/);
    assert.match(py, /'note': None/);
    await fs.rm(tmpDir, { recursive: true, force: true });
  });
});

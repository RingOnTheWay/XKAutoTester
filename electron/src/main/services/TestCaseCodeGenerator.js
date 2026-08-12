/**
 * 测试用例 Python 代码生成器 (单文件, 原 5 mixin 合回)
 *
 * 职责:
 *  - 读取 test_case_template.py 模板
 *  - 根据 caseData + pagePackageData 填充模板
 *  - 写出 .py 测试文件
 *
 * 不负责:
 *  - 测试用例 CRUD (由 TestCaseService 处理)
 *  - 目录创建 (由 TestCaseService.ensureDirectories 处理)
 *  - case JSON 持久化 (SSOT 由 TestCaseService 单源写)
 *  - caseData 字段更新 (TestCaseService 自己 set pyFilePath)
 *
 * 加 fileSystemFactory + templateLoaderFactory (factory-or-default 模式)
 *
 * 架构说明 (合回单文件, 原 mixins/ 目录已删):
 *  - 原 5 mixin (Helpers/TemplateConfig/CodeBuilders/TestMethods/Steps) 通过
 *    Object.assign 合到原型链, 跨 mixin this 调用无契约, 删任一 mixin 运行期才崩。
 *  - 合回单文件后方法解析在类内可见, locality + 可测性大涨, depth 不变。
 *  - 区块按生成阶段分隔 (// ─── 区块名 ───)。
 */
const fs = require('fs').promises;
const path = require('path');

// 默认 fileSystem factory: 包装 fs.promises 4 方法
const defaultFileSystemFactory = () => ({
    mkdir: (dir, opts) => fs.mkdir(dir, opts),
    readFile: (p, enc) => fs.readFile(p, enc),
    writeFile: (p, content, enc) => fs.writeFile(p, content, enc),
});

// 默认 templateLoader factory: 返 async () => string, 闭包捕获 templatePath
const defaultTemplateLoaderFactory = (templatePath) => async () => fs.readFile(templatePath, 'utf8');

class TestCaseCodeGenerator {
    /**
     * 加 opts 参数 (factory-or-default, 全可选, 生产不传)
     * @param {string} userConfigPath
     * @param {string} projectRoot
     * @param {Object} [opts]
     * @param {Function} [opts.fileSystemFactory] - 默认包装 fs.promises {mkdir, readFile, writeFile}
     * @param {Function} [opts.templateLoaderFactory] - (templatePath) => async () => templateString
     */
    constructor(userConfigPath, projectRoot, opts = {}) {
        this.userConfigPath = userConfigPath;
        this.projectRoot = projectRoot;
        this.testCasesDir = path.join(userConfigPath, 'test_cases');
        this.templatePath = path.join(__dirname, '..', '..', '..', 'templates', 'test_case_template.py');
        this.pagePackagePath = path.join(userConfigPath, 'page_package.json');
        // factory-or-default 模式
        this._fileSystemFactory = opts.fileSystemFactory || defaultFileSystemFactory;
        this._templateLoaderFactory = opts.templateLoaderFactory || defaultTemplateLoaderFactory;
        this._fileSystem = this._fileSystemFactory();
        this._loadTemplate = this._templateLoaderFactory(this.templatePath);
    }

    // ─── 入口方法 ──────────────────────────────────────────────

    /**
     * 生成 Python 测试文件
     * 不回写 .json, 不 mutation caseData (SSOT 由 TestCaseService)
     * @returns {Promise<{success: boolean, path?: string, error?: string}>}
     */
    async generatePythonFile(caseData, outputDir) {
        try {
            const pagePackageData = await this.loadPagePackageData();

            let template = await this._loadTemplate();

            template = this.replaceTemplateVars(template, {
                APP_NAME: caseData.targetApp?.name || '未知应用',
                PACKAGE_NAME: caseData.targetApp?.packageName || '',
                ACTIVITY_NAME: caseData.targetApp?.activityName || '',
                DESCRIPTION: caseData.description || '',
                DEVICE_NAME: caseData.deviceConfig?.deviceName || '',
                PLATFORM_NAME: caseData.platform || 'Android',
                PLATFORM_VERSION: caseData.deviceConfig?.platformVersion || '',
                CLASS_NAME: this.toClassName(caseData.fileName)
            });

            template = this.generateBleConfig(template, caseData);

            template = this.generateWaitTimeConfig(template, caseData);

            template = this.generateAllureDecorators(template, caseData);

            template = this.generateTestMethods(template, caseData, pagePackageData);

            const pyFileName = `${caseData.fileName}.py`;
            const pyPath = path.join(outputDir, pyFileName);
            await this._fileSystem.writeFile(pyPath, template, 'utf8');

            return { success: true, path: pyPath };
        } catch (error) {
            console.error('生成Python文件失败:', error);
            return { success: false, error: error.message };
        }
    }

    // ─── Helper 方法 (原 generatorHelpersMixin) ──────────────────────────────────────────

    /**
     * 加载最新的页面封装数据
     * 用 this._fileSystem.readFile (factory-or-default 模式)
     */
    async loadPagePackageData() {
        try {
            const content = await this._fileSystem.readFile(this.pagePackagePath, 'utf8');
            return JSON.parse(content);
        } catch (error) {
            console.error('加载页面封装数据失败:', error);
            return { apps: [] };
        }
    }

    /**
     * 从最新的页面封装数据中查找元素
     */
    findElementByIdFromPackage(elementId, pagePackageData) {
        if (!pagePackageData || !pagePackageData.apps) return null;

        for (const app of pagePackageData.apps) {
            if (app.pages) {
                for (const page of app.pages) {
                    if (page.elements) {
                        const element = page.elements.find(el => el.id === elementId);
                        if (element) {
                            return element;
                        }
                    }
                }
            }
        }
        return null;
    }

    /**
     * 解析元素定位信息 (优先从最新页面封装数据刷新, 回退 config.locator/locatorValue)。
     * 消除 generateElementStepCode/generatePageStepCode/generatePageStepCode.compare 3 处重复。
     * @param {{locator?:string, locatorValue?:string, elementId?:string}} config - 步骤配置 (含 elementId + fallback 定位)
     * @param {Object} pagePackageData - 页面封装数据
     * @returns {{locatorType: string, locatorValue: string}}
     */
    _resolveLocator(config, pagePackageData) {
        let locatorType = config.locator || 'id';
        let locatorValue = config.locatorValue || '';
        if (config.elementId && pagePackageData) {
            const latestElement = this.findElementByIdFromPackage(config.elementId, pagePackageData);
            if (latestElement) {
                locatorType = latestElement.locator || locatorType;
                locatorValue = latestElement.value || locatorValue;
            }
        }
        return { locatorType, locatorValue };
    }

    /**
     * 从 targetApp 中查找元素信息 (兼容旧数据)
     */
    findElementById(elementId, targetApp) {
        if (!targetApp || !targetApp.pages) return null;

        for (const page of targetApp.pages) {
            if (page.elements) {
                const element = page.elements.find(el => el.id === elementId);
                if (element) {
                    return element;
                }
            }
        }
        return null;
    }

    /**
     * 替换模板变量
     */
    replaceTemplateVars(template, vars) {
        let result = template;
        for (const [key, value] of Object.entries(vars)) {
            const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
            result = result.replace(regex, value);
        }
        return result;
    }

    /**
     * 转换为类名
     */
    toClassName(fileName) {
        let name = fileName.replace(/^test_/, '').replace(/\.py$/, '');
        const parts = name.split('_');
        return 'Test' + parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
    }

    // ─── 模板配置生成 (原 generatorTemplateConfigMixin) ──────────────────────────────────────────

    generateWaitTimeConfig(template, caseData) {
        const waitTimeConfig = caseData.waitTimeConfig || {};
        template = template.replace('APP_LOAD_WAIT_TIME = 10', `APP_LOAD_WAIT_TIME = ${waitTimeConfig.appLoadWaitTime ?? 10}`);
        template = template.replace('ELEMENT_WAIT_TIMEOUT = 30', `ELEMENT_WAIT_TIMEOUT = ${waitTimeConfig.elementWaitTimeout ?? 30}`);
        template = template.replace('STEP_INTERVAL = 2', `STEP_INTERVAL = ${waitTimeConfig.stepInterval ?? 2}`);
        template = template.replace('APP_CLOSE_WAIT_TIME = 2', `APP_CLOSE_WAIT_TIME = ${waitTimeConfig.appCloseWaitTime ?? 2}`);
        return template;
    }

    /**
     * 生成蓝牙配置
     */
    generateBleConfig(template, caseData) {
        const steps = caseData.steps || [];
        const bleDevice = caseData.bleDevice || {};

        const hasBleSteps = steps.some(step => step.type === 'ble');

        if (!hasBleSteps) {
            template = template.replace('{{BLE_CONFIG}}', '');
            template = template.replace('{{BLE_CONFIG_INIT}}', '');
            template = template.replace('{{BLE_IMPORT}}', '');
        } else {
            const bleConfig = `# 蓝牙设备配置常量
BLE_UUIDS = "${bleDevice.uuids || ''}"  # 主服务UUID
BLE_UUIDN = "${bleDevice.uuidn || ''}"  # 读服务UUID
BLE_UUIDW = "${bleDevice.uuidw || ''}"  # 写服务UUID
BLE_NAME = "${bleDevice.bleName || ''}"  # 蓝牙设备名称
BLE_ADV_DATA = "${bleDevice.advData || ''}"  # 自定义广播数据
BLE_PORT = "${bleDevice.port || ''}"  # 蓝牙设备串口端口`;

            const bleConfigInit = `ble_config = BLEConfig(
            port=BLE_PORT,
            ble_name=BLE_NAME,
            adv_data=BLE_ADV_DATA,
            uuids=BLE_UUIDS,
            uuidn=BLE_UUIDN,
            uuidw=BLE_UUIDW
        )`;

            template = template.replace('{{BLE_CONFIG}}', bleConfig);
            template = template.replace('{{BLE_CONFIG_INIT}}', bleConfigInit);
            template = template.replace('{{BLE_IMPORT}}', ', BLEConfig');
        }

        return template;
    }

    /**
     * 生成 Allure 装饰器
     */
    generateAllureDecorators(template, caseData) {
        const allureConfig = caseData.allureConfig || {};

        let decorators = '';
        if (allureConfig.epic) {
            decorators += `@allure.epic("${allureConfig.epic}")\n`;
        }
        if (allureConfig.feature) {
            decorators += `@allure.feature("${allureConfig.feature}")\n`;
        }

        template = template.replace('{{ALLURE_DECORATORS}}', decorators);
        return template;
    }

    // ─── 代码片段构建 (原 generatorCodeBuildersMixin) ──────────────────────────────────────────

    /**
     * 生成 allure.attach 调用代码
     */
    generateAllureAttachCode(content, name, options = {}) {
        const {
            type = 'TEXT',
            isFString = false,
            isVariable = false,
            indent = '                '
        } = options;

        let contentStr;
        if (isVariable) {
            contentStr = content;
        } else if (isFString) {
            contentStr = `f"${content}"`;
        } else {
            contentStr = JSON.stringify(content);
        }

        return `${indent}allure.attach(\n` +
               `${indent}    ${contentStr},\n` +
               `${indent}    name=${JSON.stringify(name)},\n` +
               `${indent}    attachment_type=allure.attachment_type.${type}\n` +
               `${indent})\n`;
    }

    /**
     * 生成输入值代码
     */
    generateInputValueCode(operationValue) {
        if (!operationValue) return "''";

        const inputType = operationValue.inputType;

        switch (inputType) {
            case 'custom':
                const safeInputValue = (operationValue.inputValue || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                return `'${safeInputValue}'`;

            case 'random':
                const precision = parseInt(operationValue.randomConfig?.precision || 0);
                if (precision === 0) {
                    return `str(random.randint(0, 100))`;
                }
                return `str(round(random.uniform(0, 100), ${precision}))`;

            case 'faker':
                const fakerConfig = operationValue.fakerConfig || {};
                const provider = fakerConfig.provider || 'name';
                // 转换 provider 格式：person.name -> fake.name()
                const providerPath = provider.split('.');
                if (providerPath.length === 2) {
                    return `self.fake.${providerPath[1]}()`;
                }
                return `self.fake.${provider}()`;

            default:
                return "''";
        }
    }

    /**
     * 生成 setup_method 内容
     */
    generateSetupMethodContent(caseData) {
        const steps = caseData.steps || [];
        let content = '';

        // 检查是否有蓝牙随机数据步骤
        const hasBleRandom = steps.some(s =>
            s.type === 'ble' && (s.config?.deviceConfig?.methodName === 'send_random_data' || s.config?.deviceConfig?.methodName === 'send_custom_data')
        );

        if (hasBleRandom) {
            content = `# 蓝牙随机数据会在步骤中动态生成`;
        }

        return content || 'pass';
    }

    /**
     * 生成额外导入
     */
    generateAdditionalImports(caseData) {
        let imports = '';

        const steps = caseData.steps || [];

        const hasBleRandom = steps.some(s =>
            s.type === 'ble' && (s.config?.deviceConfig?.methodName === 'send_random_data' || s.config?.deviceConfig?.methodName === 'send_custom_data')
        );

        if (hasBleRandom) {
            imports = `\nfrom main.device.bioland.E127B import temperature_bioland_gen`;
        }

        return imports;
    }

    // ─── 测试方法生成 (原 generatorTestMethodsMixin) ──────────────────────────────────────────

    /**
     * 生成测试方法
     */
    generateTestMethods(template, caseData, pagePackageData) {
        const steps = caseData.steps || [];
        const allureConfig = caseData.allureConfig || {};
        const targetApp = caseData.targetApp || {};

        // 生成方法装饰器
        let methodDecorators = '';
        if (allureConfig.story) {
            methodDecorators += `    @allure.story("${allureConfig.story}")\n`;
        }
        methodDecorators += `    @allure.title("${caseData.name || '测试用例'}")\n`;

        // 生成方法描述
        let description = '';
        if (caseData.description) {
            const descLines = caseData.description.split('\n');
            description = descLines.map((line, i) => `    ${i + 1}. ${line}`).join('\n');
        } else {
            description = steps.map((step, i) => `    ${i + 1}. ${step.name}`).join('\n');
        }

        methodDecorators += `    @allure.description("""\n${description}\n    """)\n`;

        // 生成 pytest 标记
        const markers = allureConfig.markers || [];
        if (markers.length > 0) {
            markers.forEach(marker => {
                methodDecorators += `    @pytest.mark.${marker}\n`;
            });
        }

        // 生成方法定义
        let methodBody = `    def test_${caseData.fileName?.replace('test_', '') || 'case'}(self):\n`;

        // 生成步骤代码
        steps.forEach((step, index) => {
            methodBody += this.generateStepCode(step, index, targetApp, steps, pagePackageData);
        });

        methodBody += `\n        logger.info("用例执行结束")\n`;

        // 替换模板中的测试方法占位符
        const testMethods = methodDecorators + methodBody;
        template = template.replace('{{TEST_METHODS}}', testMethods);

        // 替换 setup_method 内容
        const setupContent = this.generateSetupMethodContent(caseData);
        template = template.replace('{{SETUP_METHOD_CONTENT}}', setupContent);

        // 替换额外导入
        const additionalImports = this.generateAdditionalImports(caseData);
        template = template.replace('{{ADDITIONAL_IMPORTS}}', additionalImports);

        return template;
    }

    /**
     * 生成单个步骤代码
     */
    generateStepCode(step, index, targetApp, steps, pagePackageData) {
        const stepNum = index + 1;
        let code = `\n        # ${stepNum}. ${step.name}\n`;
        code += `        with allure.step("${step.name}"):\n`;

        switch (step.type) {
            case 'element':
                code += this.generateElementStepCode(step, targetApp, pagePackageData);
                break;
            case 'ble':
                code += this.generateBleStepCode(step);
                break;
            case 'page':
                code += this.generatePageStepCode(step, steps, pagePackageData);
                break;
            case 'system':
                code += this.generateSystemStepCode(step);
                break;
            default:
                code += `            pass  # 未知步骤类型\n`;
        }

        return code;
    }

    /**
     * 生成元素操作步骤代码
     */
    generateElementStepCode(step, targetApp, pagePackageData) {
        const config = step.config;
        if (!config) return '            pass  # 无配置\n';

        if (config.multiSelect && config.selectedElements && config.selectedElements.length > 0) {
            return this.generateMultiElementStepCode(step, targetApp, pagePackageData);
        }

        // 优先从最新的页面封装数据中获取元素定位信息
        const { locatorType, locatorValue } = this._resolveLocator(config, pagePackageData);

        const operation = config.operation || 'click';

        let code = `            try:\n`;

        if (locatorType === 'click') {
            const coords = locatorValue.split(',');
            const tapX = coords[0]?.trim() || '0';
            const tapY = coords[1]?.trim() || '0';

            switch (operation) {
                case 'click':
                    const clickCount = config.operationValue?.clickCount || 1;
                    for (let i = 0; i < clickCount; i++) {
                        code += `                self.driver.tap([(${tapX}, ${tapY})])\n`;
                    }
                    code += `                logger.info("${step.name}成功")\n`;
                    code += this.generateAllureAttachCode(`已点击坐标(${tapX}, ${tapY})${clickCount > 1 ? ` ${clickCount}次` : ''}`, '点击操作');
                    code += `                time.sleep(1)\n`;
                    break;

                case 'swipeUp':
                    const swipeUpDuration = config.operationValue?.swipeDuration || 500;
                    code += `                # 向上滑动（页面向下滚动）\n`;
                    code += `                size = self.driver.get_window_size()\n`;
                    code += `                start_y = int(size['height'] * 0.8)\n`;
                    code += `                end_y = int(size['height'] * 0.2)\n`;
                    code += `                self.driver.swipe(${tapX}, start_y, ${tapX}, end_y, ${swipeUpDuration})\n`;
                    code += `                logger.info("向上滑动完成")\n`;
                    code += this.generateAllureAttachCode(`向上滑动${swipeUpDuration}ms`, '滑动操作');
                    code += `                time.sleep(1)\n`;
                    break;

                case 'swipeDown':
                    const swipeDownDuration = config.operationValue?.swipeDuration || 500;
                    code += `                # 向下滑动（页面向上滚动）\n`;
                    code += `                size = self.driver.get_window_size()\n`;
                    code += `                start_y = int(size['height'] * 0.2)\n`;
                    code += `                end_y = int(size['height'] * 0.8)\n`;
                    code += `                self.driver.swipe(${tapX}, start_y, ${tapX}, end_y, ${swipeDownDuration})\n`;
                    code += `                logger.info("向下滑动完成")\n`;
                    code += this.generateAllureAttachCode(`向下滑动${swipeDownDuration}ms`, '滑动操作');
                    code += `                time.sleep(1)\n`;
                    break;
            }
        } else {
            code += `                element = self.driver.find_element(\n`;
            code += `                    AppiumBy.${locatorType.toUpperCase()},\n`;
            code += `                    '${locatorValue}'\n`;
            code += `                )\n`;

        switch (operation) {
            case 'click':
                const clickCount = config.operationValue?.clickCount || 1;
                for (let i = 0; i < clickCount; i++) {
                    code += `                element.click()\n`;
                }
                code += `                logger.info("${step.name}成功")\n`;
                code += this.generateAllureAttachCode(`已点击${clickCount}次`, '点击操作');
                code += `                time.sleep(1)\n`;
                break;

            case 'sendText':
                const inputCode = this.generateInputValueCode(config.operationValue);
                code += `                input_value = ${inputCode}\n`;
                code += `                element.send_keys(input_value)\n`;
                code += `                logger.info(f"${step.name}成功: {input_value}")\n`;
                code += this.generateAllureAttachCode('已输入: {input_value}', '输入操作', { isFString: true });
                code += `                time.sleep(1)\n`;
                break;

            case 'swipeUp':
                const swipeDuration = config.operationValue?.swipeDuration || 500;
                code += `                # 向上滑动（页面向下滚动）\n`;
                code += `                size = self.driver.get_window_size()\n`;
                code += `                start_y = int(size['height'] * 0.8)\n`;
                code += `                end_y = int(size['height'] * 0.2)\n`;
                code += `                x = int(size['width'] / 2)\n`;
                code += `                self.driver.swipe(x, start_y, x, end_y, ${swipeDuration})\n`;
                code += `                logger.info("向上滑动完成")\n`;
                code += this.generateAllureAttachCode(`向上滑动${swipeDuration}ms`, '滑动操作');
                code += `                time.sleep(1)\n`;
                break;

            case 'swipeDown':
                const swipeDurationDown = config.operationValue?.swipeDuration || 500;
                code += `                # 向下滑动（页面向上滚动）\n`;
                code += `                size = self.driver.get_window_size()\n`;
                code += `                start_y = int(size['height'] * 0.2)\n`;
                code += `                end_y = int(size['height'] * 0.8)\n`;
                code += `                x = int(size['width'] / 2)\n`;
                code += `                self.driver.swipe(x, start_y, x, end_y, ${swipeDurationDown})\n`;
                code += `                logger.info("向下滑动完成")\n`;
                code += this.generateAllureAttachCode(`向下滑动${swipeDurationDown}ms`, '滑动操作');
                code += `                time.sleep(1)\n`;
                break;
        }
        }

        code += `            except Exception as e:\n`;
        code += `                logger.error(f"${step.name}失败: {str(e)}")\n`;
        code += this.generateAllureAttachCode('操作失败: {str(e)}', '错误信息', { isFString: true });
        code += `                pytest.fail(f"${step.name}失败: {str(e)}")\n`;

        return code;
    }

    /**
     * 生成多选元素操作步骤代码
     */
    generateMultiElementStepCode(step, targetApp, pagePackageData) {
        const config = step.config;
        const selectedElements = config.selectedElements || [];
        const clickCount = config.multiClickCount || 1;

        let code = `            try:\n`;
        code += `                # 多选元素随机选择操作\n`;
        code += `                multi_elements = [\n`;

        selectedElements.forEach(elemConfig => {
            const elemId = typeof elemConfig === 'string' ? elemConfig : elemConfig.elementId;
            // 优先从最新的页面封装数据中获取元素定位信息
            let elementInfo = null;
            if (elemId && pagePackageData) {
                elementInfo = this.findElementByIdFromPackage(elemId, pagePackageData);
            }
            // 如果没有找到，则从旧的 targetApp 中查找（兼容旧数据）
            if (!elementInfo) {
                elementInfo = this.findElementById(elemId, targetApp);
            }
            const locatorType = elementInfo?.locator || 'id';
            const locatorValue = elementInfo?.value || '';
            const operation = elemConfig.operation || 'click';
            const operationValue = elemConfig.operationValue || {};

            code += `                    {\n`;
            code += `                        'locator_type': '${locatorType.toUpperCase()}',\n`;
            code += `                        'locator_value': '${locatorValue}',\n`;
            code += `                        'operation': '${operation}',\n`;
            code += `                        'operation_value': ${JSON.stringify(operationValue)}\n`;
            code += `                    },\n`;
        });

        code += `                ]\n`;
        code += `                # 从${selectedElements.length}个元素中随机选择${clickCount}个\n`;
        code += `                selected_count = min(${clickCount}, len(multi_elements))\n`;
        code += `                random_elements = random.sample(multi_elements, selected_count)\n`;
        code += `                logger.info(f"从${selectedElements.length}个元素中随机选择了{selected_count}个元素")\n`;
        code += `                \n`;
        code += `                for elem_config in random_elements:\n`;
        code += `                    try:\n`;
        code += `                        operation = elem_config['operation']\n`;
        code += `                        op_value = elem_config['operation_value']\n`;
        code += `                        \n`;
        code += `                        if elem_config['locator_type'] == 'CLICK':\n`;
        code += `                            coords = elem_config['locator_value'].split(',')\n`;
        code += `                            tap_x = int(coords[0].strip()) if len(coords) > 0 else 0\n`;
        code += `                            tap_y = int(coords[1].strip()) if len(coords) > 1 else 0\n`;
        code += `                            \n`;
        code += `                            if operation == 'click':\n`;
        code += `                                click_times = op_value.get('clickCount', 1)\n`;
        code += `                                for _ in range(click_times):\n`;
        code += `                                    self.driver.tap([(tap_x, tap_y)])\n`;
        code += `                                logger.info(f"点击坐标成功: ({tap_x}, {tap_y})，点击次数: {click_times}")\n`;
        code += `                                time.sleep(1)\n`;
        code += `                            elif operation == 'swipeUp':\n`;
        code += `                                swipe_duration = op_value.get('swipeDuration', 500)\n`;
        code += `                                size = self.driver.get_window_size()\n`;
        code += `                                start_y = int(size['height'] * 0.8)\n`;
        code += `                                end_y = int(size['height'] * 0.2)\n`;
        code += `                                self.driver.swipe(tap_x, start_y, tap_x, end_y, swipe_duration)\n`;
        code += `                                logger.info(f"向上滑动完成，时长: {swipe_duration}ms")\n`;
        code += `                                time.sleep(1)\n`;
        code += `                            elif operation == 'swipeDown':\n`;
        code += `                                swipe_duration = op_value.get('swipeDuration', 500)\n`;
        code += `                                size = self.driver.get_window_size()\n`;
        code += `                                start_y = int(size['height'] * 0.2)\n`;
        code += `                                end_y = int(size['height'] * 0.8)\n`;
        code += `                                self.driver.swipe(tap_x, start_y, tap_x, end_y, swipe_duration)\n`;
        code += `                                logger.info(f"向下滑动完成，时长: {swipe_duration}ms")\n`;
        code += `                                time.sleep(1)\n`;
        code += `                        else:\n`;
        code += `                            element = self.driver.find_element(\n`;
        code += `                                getattr(AppiumBy, elem_config['locator_type']),\n`;
        code += `                                elem_config['locator_value']\n`;
        code += `                            )\n`;
        code += `                            \n`;
        code += `                            if operation == 'click':\n`;
        code += `                                click_times = op_value.get('clickCount', 1)\n`;
        code += `                                for _ in range(click_times):\n`;
        code += `                                    element.click()\n`;
        code += `                                logger.info(f"点击元素成功，点击次数: {click_times}")\n`;
        code += `                                time.sleep(1)\n`;
        code += `                            \n`;
        code += `                            elif operation == 'sendText':\n`;
        code += `                                input_type = op_value.get('inputType', 'custom')\n`;
        code += `                                if input_type == 'custom':\n`;
        code += `                                    input_val = op_value.get('inputValue', '')\n`;
        code += `                                elif input_type == 'random':\n`;
        code += `                                    rand_config = op_value.get('randomConfig', {})\n`;
        code += `                                    min_val = rand_config.get('minValue', 0)\n`;
        code += `                                    max_val = rand_config.get('maxValue', 100)\n`;
        code += `                                    precision = rand_config.get('precision', 0)\n`;
        code += `                                    if precision == 0:\n`;
        code += `                                        input_val = str(random.randint(int(min_val), int(max_val)))\n`;
        code += `                                    else:\n`;
        code += `                                        input_val = str(round(random.uniform(min_val, max_val), precision))\n`;
        code += `                                elif input_type == 'faker':\n`;
        code += `                                    faker_config = op_value.get('fakerConfig', {})\n`;
        code += `                                    provider = faker_config.get('provider', 'person.name')\n`;
        code += `                                    provider_parts = provider.split('.')\n`;
        code += `                                    if len(provider_parts) == 2:\n`;
        code += `                                        input_val = str(getattr(self.fake, provider_parts[1])())\n`;
        code += `                                    else:\n`;
        code += `                                        input_val = str(getattr(self.fake, provider)())\n`;
        code += `                                else:\n`;
        code += `                                    input_val = ''\n`;
        code += `                                element.send_keys(input_val)\n`;
        code += `                                logger.info(f"输入文本成功: {input_val}")\n`;
        code += `                                time.sleep(1)\n`;
        code += `                            \n`;
        code += `                            elif operation == 'swipeUp':\n`;
        code += `                                swipe_duration = op_value.get('swipeDuration', 500)\n`;
        code += `                                size = self.driver.get_window_size()\n`;
        code += `                                start_y = int(size['height'] * 0.8)\n`;
        code += `                                end_y = int(size['height'] * 0.2)\n`;
        code += `                                x = int(size['width'] / 2)\n`;
        code += `                                self.driver.swipe(x, start_y, x, end_y, swipe_duration)\n`;
        code += `                                logger.info(f"向上滑动完成，时长: {swipe_duration}ms")\n`;
        code += `                                time.sleep(1)\n`;
        code += `                            \n`;
        code += `                            elif operation == 'swipeDown':\n`;
        code += `                                swipe_duration = op_value.get('swipeDuration', 500)\n`;
        code += `                                size = self.driver.get_window_size()\n`;
        code += `                                start_y = int(size['height'] * 0.2)\n`;
        code += `                                end_y = int(size['height'] * 0.8)\n`;
        code += `                                x = int(size['width'] / 2)\n`;
        code += `                                self.driver.swipe(x, start_y, x, end_y, swipe_duration)\n`;
        code += `                                logger.info(f"向下滑动完成，时长: {swipe_duration}ms")\n`;
        code += `                                time.sleep(1)\n`;
        code += `                        \n`;
        code += this.generateAllureAttachCode("操作元素: {elem_config['locator_value']}, 操作类型: {operation}", '元素操作', { isFString: true, indent: '                        ' });
        code += `                        \n`;
        code += `                    except Exception as elem_error:\n`;
        code += `                        logger.error(f"操作元素失败: {elem_config['locator_value']}, 错误: {str(elem_error)}")\n`;
        code += this.generateAllureAttachCode("操作元素失败: {elem_config['locator_value']}, 错误: {str(elem_error)}", '元素操作错误', { isFString: true, indent: '                        ' });
        code += `                        pytest.fail(f"操作元素失败: {elem_config['locator_value']}, 错误: {str(elem_error)}")\n`;

        code += this.generateAllureAttachCode(`已从${selectedElements.length}个元素中随机选择并操作了{selected_count}个`, '多选元素操作', { isFString: true });
        code += `            except Exception as e:\n`;
        code += `                logger.error(f"${step.name}失败: {str(e)}")\n`;
        code += this.generateAllureAttachCode('操作失败: {str(e)}', '错误信息', { isFString: true });
        code += `                pytest.fail(f"${step.name}失败: {str(e)}")\n`;

        return code;
    }

    // ─── 步骤代码生成: 蓝牙/系统/页面 (原 generatorStepsMixin) ──────────────────────────────────────────

    /**
     * 生成蓝牙操作步骤代码
     */
    generateBleStepCode(step) {
        const config = step.config;
        if (!config) return '            pass  # 无配置\n';

        const deviceConfig = config.deviceConfig || {};
        const methodName = deviceConfig.methodName;
        const methodParams = deviceConfig.params || {};

        let code = `            try:\n`;

        if (methodName === 'send_random_data') {
            const minValue = methodParams.min_value || 36.0;
            const maxValue = methodParams.max_value || 37.5;
            const precision = methodParams.precision !== undefined ? methodParams.precision : 1;

            code += `                # 生成随机体温数据\n`;
            code += `                test_value, hex_data = temperature_bioland_gen(\n`;
            code += `                    min_value=${minValue},\n`;
            code += `                    max_value=${maxValue},\n`;
            code += `                    precision=${precision}\n`;
            code += `                )\n`;
            code += `                logger.info(f"生成体温数据: {test_value}°C")\n`;
            code += `                self.test_ble_value = test_value\n`;
        } else if (methodName === 'send_custom_data') {
            const temperature = methodParams.temperature;

            code += `                # 发送指定体温数据\n`;
            code += `                test_value, hex_data = temperature_bioland_gen(\n`;
            code += `                    temperature=${temperature}\n`;
            code += `                )\n`;
            code += `                logger.info(f"发送体温数据: {test_value}°C")\n`;
            code += `                self.test_ble_value = test_value\n`;
        } else {
            code += `                hex_data = "${methodParams.hexData || ''}"\n`;
        }

        code += `                if self.ble_device and self.ble_device.send_hex_data(hex_data):\n`;
        code += `                    logger.info(f"蓝牙发送数据成功: {hex_data}")\n`;
        code += this.generateAllureAttachCode('蓝牙发送数据: {hex_data}', '蓝牙操作', { isFString: true, indent: '                    ' });
        code += `                    time.sleep(1)\n`;
        code += `                else:\n`;
        code += `                    logger.error("蓝牙发送数据失败")\n`;
        code += `                    pytest.fail("蓝牙发送数据失败")\n`;
        code += `            except Exception as e:\n`;
        code += `                logger.error(f"${step.name}失败: {str(e)}")\n`;
        code += this.generateAllureAttachCode('蓝牙操作失败: {str(e)}', '错误信息', { isFString: true });
        code += `                pytest.fail(f"${step.name}失败: {str(e)}")\n`;

        return code;
    }

    /**
     * 生成系统操作步骤代码
     */
    generateSystemStepCode(step) {
        const config = step.config;
        const systemConfig = config.systemConfig || {};
        const operationType = systemConfig.operationType || 'navigation';
        const navKey = systemConfig.navKey || 'back';
        const clickCount = systemConfig.clickCount || 1;

        let code = `            try:\n`;

        if (operationType === 'navigation') {
            const keyMap = {
                back: { constant: 'KEYCODE_BACK', description: '返回' },
                home: { constant: 'KEYCODE_HOME', description: '主页' },
                recent: { constant: 'KEYCODE_APP_SWITCH', description: '最近任务' }
            };

            const keyInfo = keyMap[navKey] || keyMap.back;
            const desc = keyInfo.description;

            if (clickCount <= 1) {
                code += `                # 按下导航栏${desc}键\n`;
                code += `                self.driver.press_keycode(${keyInfo.constant})\n`;
                code += `                time.sleep(STEP_INTERVAL)\n`;
            } else {
                code += `                # 按下导航栏${desc}键 ${clickCount}次\n`;
                code += `                for _ in range(${clickCount}):\n`;
                code += `                    self.driver.press_keycode(${keyInfo.constant})\n`;
                code += `                    time.sleep(STEP_INTERVAL)\n`;
            }

            code += this.generateAllureAttachCode(`按下导航栏${desc}键`, '系统操作');
        }

        code += `            except Exception as e:\n`;
        code += `                logger.error(f"${step.name}失败: {str(e)}")\n`;
        code += `                screenshot = self.driver.get_screenshot_as_png()\n`;
        code += this.generateAllureAttachCode('screenshot', '错误截图', { isVariable: true, type: 'PNG' });
        code += `                pytest.fail(f"${step.name}失败: {str(e)}")\n`;

        return code;
    }

    /**
     * 生成页面操作步骤代码
     */
    generatePageStepCode(step, steps, pagePackageData) {
        const config = step.config;
        if (!config) return '            pass  # 无配置\n';

        let code = `            try:\n`;

        const operationType = config.operationType || 'compare';

        if (operationType === 'search') {
            const searchConfig = config.searchConfig || {};
            const searchType = searchConfig.searchType || 'element';

            const { locatorType: searchLocator, locatorValue: searchLocatorValue } = this._resolveLocator(searchConfig, pagePackageData);

            if (searchType === 'text') {
                const textValue = searchConfig.textValue || '';
                const matchType = searchConfig.matchType || 'contains';
                const escapedTextValue = textValue.replace(/"/g, '&quot;');
                const pythonSafeTextValue = textValue.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\{/g, '{{').replace(/\}/g, '}}');
                const xpathExpr = matchType === 'exact'
                    ? `//*[@text="${escapedTextValue}"]`
                    : `//*[contains(@text, "${escapedTextValue}")]`;

                code += `                # 查找文本\n`;
                code += `                waited_time = 0\n`;
                code += `                search_success = False\n`;
                code += `                while waited_time < ELEMENT_WAIT_TIMEOUT:\n`;
                code += `                    try:\n`;
                code += `                        self.driver.find_element(\n`;
                code += `                            AppiumBy.XPATH,\n`;
                code += `                            '${xpathExpr}'\n`;
                code += `                        )\n`;
                code += `                        search_success = True\n`;
                code += `                        logger.info('找到文本: ${pythonSafeTextValue}')\n`;
                code += `                        break\n`;
                code += `                    except:\n`;
                code += `                        time.sleep(STEP_INTERVAL)\n`;
                code += `                        waited_time += STEP_INTERVAL\n`;
                code += `                if not search_success:\n`;
                code += `                    logger.error(f"查找文本超时")\n`;
                code += `                    pytest.fail(f"查找文本超时")\n`;
                code += this.generateAllureAttachCode(`找到文本: ${pythonSafeTextValue}`, '查找结果');
            } else {
                code += `                # 查找元素\n`;
                code += `                waited_time = 0\n`;
                code += `                search_success = False\n`;
                code += `                while waited_time < ELEMENT_WAIT_TIMEOUT:\n`;
                code += `                    try:\n`;
                code += `                        self.driver.find_element(\n`;
                code += `                            AppiumBy.${searchLocator.toUpperCase()},\n`;
                code += `                            '${searchLocatorValue}'\n`;
                code += `                        )\n`;
                code += `                        search_success = True\n`;
                code += `                        logger.info("找到元素")\n`;
                code += `                        break\n`;
                code += `                    except:\n`;
                code += `                        time.sleep(STEP_INTERVAL)\n`;
                code += `                        waited_time += STEP_INTERVAL\n`;
                code += `                if not search_success:\n`;
                code += `                    logger.error(f"查找元素超时")\n`;
                code += `                    pytest.fail(f"查找元素超时")\n`;
                code += this.generateAllureAttachCode('找到元素', '查找结果');
            }
        } else if (operationType === 'compare') {
            // 对比操作
            const compareConfig = config.compareConfig || {};
            const targetValueType = compareConfig.targetValueType || 'custom';
            const targetValue = compareConfig.targetValue || '';
            const pythonSafeTargetValue = targetValue.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            const tolerance = compareConfig.tolerance;
            const hasTolerance = tolerance !== undefined && tolerance !== null && tolerance !== '';
            const isRandomRangeTarget = targetValueType === 'ble';

            // 优先从最新的页面封装数据中获取元素定位信息
            const { locatorType: compareLocator, locatorValue: compareLocatorValue } = this._resolveLocator(compareConfig, pagePackageData);

            // 先设置期望值
            if (isRandomRangeTarget) {
                // 使用蓝牙随机范围数据作为目标值
                const bleStepId = compareConfig.bleStepId || '';
                const bleStep = steps.find(s => s.id === bleStepId);
                const bleStepName = bleStep ? bleStep.name : '蓝牙随机数据';
                code += `                # 使用步骤"${bleStepName}"生成的随机值\n`;
                code += `                expected_value = str(self.test_ble_value)\n`;
                code += `                logger.info(f"期望值(来自蓝牙随机数据): {expected_value}")\n`;
            } else {
                code += `                expected_value = '${pythonSafeTargetValue}'\n`;
            }

            code += `                # 等待元素出现并单次判断值（元素未找到重试，值不匹配立即失败）\n`;
            code += `                compare_success = False\n`;
            code += `                displayed_value = ''\n`;
            code += `                waited_time = 0\n`;
            code += `                while waited_time < ELEMENT_WAIT_TIMEOUT:\n`;
            code += `                    try:\n`;
            code += `                        result_element = self.driver.find_element(\n`;
            code += `                            AppiumBy.${compareLocator.toUpperCase()},\n`;
            code += `                            '${compareLocatorValue}'\n`;
            code += `                        )\n`;
            code += `                        displayed_value = result_element.text\n`;
            code += `                        if displayed_value and displayed_value.strip():\n`;
            code += `                            logger.info(f"获取到显示数据: {displayed_value}")\n`;

            if (hasTolerance) {
                // 数值对比（有容差值）- 获取到值后单次判断，不匹配立即 fail
                code += `                            try:\n`;
                code += `                                displayed_num = float(displayed_value)\n`;
                code += `                                expected_num = float(expected_value)\n`;
                code += `                                diff = round(abs(displayed_num - expected_num), 10)\n`;
                code += `                                logger.info(f"数据差值: {displayed_num} - {expected_num} = {diff}")\n`;
                code += `                                if diff <= ${tolerance}:\n`;
                code += `                                    compare_success = True\n`;
                code += `                                else:\n`;
                code += `                                    logger.error(f"对比数据不一致，期望: {expected_value}, 显示: {displayed_value}")\n`;
                code += `                                    pytest.fail(f"对比数据不一致，期望: {expected_value}, 显示: {displayed_value}")\n`;
                code += `                            except ValueError:\n`;
                code += `                                # 无法转换为数字，使用字符串对比\n`;
                code += `                                if displayed_value == expected_value:\n`;
                code += `                                    compare_success = True\n`;
                code += `                                else:\n`;
                code += `                                    logger.error(f"对比数据不一致，期望: {expected_value}, 显示: {displayed_value}")\n`;
                code += `                                    pytest.fail(f"对比数据不一致，期望: {expected_value}, 显示: {displayed_value}")\n`;
            } else {
                // 字符串对比（无容差值）- 获取到值后单次判断，不匹配立即 fail
                code += `                            if displayed_value == expected_value:\n`;
                code += `                                compare_success = True\n`;
                code += `                            else:\n`;
                code += `                                logger.error(f"对比数据不一致，期望: {expected_value}, 显示: {displayed_value}")\n`;
                code += `                                pytest.fail(f"对比数据不一致，期望: {expected_value}, 显示: {displayed_value}")\n`;
            }

            code += `                            break\n`;
            code += `                        # 元素找到但值为空，继续等待\n`;
            code += `                    except Exception:\n`;
            code += `                        # 元素未找到等 Exception, 继续等待。\n`;
            code += `                        # 注意: pytest.fail 抛的 Failed 继承 BaseException, 不会被此处捕获,\n`;
            code += `                        # 会立即传播终止测试 (修复: 数据不一致不再循环超时)\n`;
            code += `                        pass\n`;
            code += `                    time.sleep(STEP_INTERVAL)\n`;
            code += `                    waited_time += STEP_INTERVAL\n`;
            code += `                \n`;
            code += `                if not compare_success:\n`;
            code += `                    logger.error(f"对比数据不一致，期望: {expected_value}, 显示: {displayed_value or '无'}")\n`;
            code += `                    pytest.fail(f"对比数据不一致，期望: {expected_value}, 显示: {displayed_value or '无'}")\n`;
            code += `                \n`;
            code += `                logger.info(f"显示的数据: {displayed_value}")\n`;
            code += this.generateAllureAttachCode('显示的数据: {displayed_value}', '显示数据', { isFString: true });
            code += `                screenshot = self.driver.get_screenshot_as_png()\n`;
            code += this.generateAllureAttachCode('screenshot', '截图', { isVariable: true, type: 'PNG' });
            code += `                logger.info("对比数据一致")\n`;
            code += this.generateAllureAttachCode('对比数据一致', '对比结果');
        } else {
            // 未知操作类型或缺少必要配置
            code += `                pass  # 未知操作类型或缺少配置\n`;
        }

        code += `            except Exception as e:\n`;
        code += `                logger.error(f"${step.name}失败: {str(e)}")\n`;
        code += `                screenshot = self.driver.get_screenshot_as_png()\n`;
        code += this.generateAllureAttachCode('screenshot', '错误截图', { isVariable: true, type: 'PNG' });
        code += `                pytest.fail(f"${step.name}失败: {str(e)}")\n`;

        return code;
    }
}

module.exports = TestCaseCodeGenerator;

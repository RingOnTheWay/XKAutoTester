// Test Methods Mixin for TestCaseCodeGenerator
// Extracted from TestCaseCodeGenerator.js during refactor
// Provides: 测试方法编排、步骤代码生成、元素操作步骤、多选元素步骤

const generatorTestMethodsMixin = {
    // ─── 测试方法生成 ──────────────────────────────────────────

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
    },

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
    },

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
        let locatorType = config.locator || 'id';
        let locatorValue = config.locatorValue || '';

        if (config.elementId && pagePackageData) {
            const latestElement = this.findElementByIdFromPackage(config.elementId, pagePackageData);
            if (latestElement) {
                locatorType = latestElement.locator || locatorType;
                locatorValue = latestElement.value || locatorValue;
            }
        }

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
    },

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
    },
};

module.exports = generatorTestMethodsMixin;

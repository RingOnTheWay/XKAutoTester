// Steps Mixin for TestCaseCodeGenerator
// Extracted from TestCaseCodeGenerator.js during refactor
// Provides: 蓝牙步骤、系统操作步骤、页面操作步骤代码生成

const generatorStepsMixin = {
    // ─── 步骤代码生成（蓝牙/系统/页面）──────────────────────────

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
    },

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
    },

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

            let searchLocator = searchConfig.locator || 'id';
            let searchLocatorValue = searchConfig.locatorValue || '';

            if (searchConfig.elementId && pagePackageData) {
                const latestElement = this.findElementByIdFromPackage(searchConfig.elementId, pagePackageData);
                if (latestElement) {
                    searchLocator = latestElement.locator || searchLocator;
                    searchLocatorValue = latestElement.value || searchLocatorValue;
                }
            }

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
            let compareLocator = compareConfig.locator || 'id';
            let compareLocatorValue = compareConfig.locatorValue || '';

            if (compareConfig.elementId && pagePackageData) {
                const latestElement = this.findElementByIdFromPackage(compareConfig.elementId, pagePackageData);
                if (latestElement) {
                    compareLocator = latestElement.locator || compareLocator;
                    compareLocatorValue = latestElement.value || compareLocatorValue;
                }
            }

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
    },
};

module.exports = generatorStepsMixin;

// Collect Form Data mixin for TestCaseView
// Extracted from formMixin.js during sub-refactor
// Provides: collectFormInputs (top form fields) + collectStepCardsData (DOM → step data)

export const formCollectMixin = {
    // ─── Collect Form Data ─────────────────────────────────────────

    /**
     * 收集表单顶部输入 (文件名/用例名/描述/Allure/等待时间)
     * @returns {Object} 输入数据
     */
    collectFormInputs() {
        return {
            fileName: document.getElementById('tc-file-name')?.value?.trim() || '',
            caseName: document.getElementById('tc-case-name')?.value?.trim() || '',
            description: document.getElementById('tc-description')?.value?.trim() || '',
            epic: document.getElementById('tc-allure-epic')?.value?.trim() || '',
            feature: document.getElementById('tc-allure-feature')?.value?.trim() || '',
            story: document.getElementById('tc-allure-story')?.value?.trim() || '',
            appLoadWaitTime: document.getElementById('tc-app-load-wait-time')?.value ?? 10,
            elementWaitTimeout: document.getElementById('tc-element-wait-timeout')?.value ?? 30,
            stepInterval: document.getElementById('tc-step-interval')?.value ?? 2,
            appCloseWaitTime: document.getElementById('tc-app-close-wait-time')?.value ?? 2,
        };
    },

    /**
     * 从 DOM 读取步骤卡片数据，合并 model 中的步骤基础信息
     * @param {Array} modelSteps - model 中的步骤数组
     * @returns {Array} 合并后的步骤数据
     */
    collectStepCardsData(modelSteps) {
        const container = document.getElementById('tc-steps-list');
        if (!container) return modelSteps;

        const cards = container.querySelectorAll('.tc-step-card');
        if (cards.length === 0) return modelSteps;

        const result = [];
        cards.forEach((card, index) => {
            const stepId = card.dataset.stepId;
            const modelStep = modelSteps.find(s => s.id === stepId);
            if (!modelStep) return;

            // 以 model step 为基础，从 DOM 覆盖可编辑字段
            // 删除渲染注入的临时属性（_app/_bleDevices/_allSteps），避免循环引用
            const { _app, _bleDevices, _allSteps, ...stepData } = modelStep;
            const step = JSON.parse(JSON.stringify(stepData));
            step.order = index + 1;

            // 步骤名称
            const nameInput = card.querySelector('.tc-step-name-input');
            if (nameInput) step.name = nameInput.value;

            // 步骤类型
            const activeTab = card.querySelector('.tc-type-tab.active');
            if (activeTab) step.type = activeTab.dataset.type;

            // 从 DOM 读取 config 中的值
            const config = step.config || {};

            // 读取 custom-select 的当前选中值
            // 注意：options 已被移到 body，需要通过 ID 在 document 上查找
            card.querySelectorAll('.custom-select').forEach(select => {
                const selectId = select.dataset.selectId;
                if (!selectId) return;

                let optionsEl = null;
                if (select.id) {
                    optionsEl = document.getElementById(`${select.id}-options`);
                }
                if (!optionsEl) {
                    optionsEl = select.querySelector('.custom-select__options');
                }

                const selectedOpt = optionsEl?.querySelector('.custom-select__option.selected');
                if (selectedOpt) {
                    const value = selectedOpt.dataset.value;
                    if (selectId.startsWith('tc-page-select')) config.pageId = value;
                    else if (selectId.startsWith('tc-element-select')) config.elementId = value;
                    else if (selectId.startsWith('tc-operation-select')) config.operation = value;
                    else if (selectId.startsWith('tc-input-type-select')) {
                        config.operationValue = config.operationValue || {};
                        config.operationValue.inputType = value;
                    }
                    else if (selectId.startsWith('tc-ble-method-select')) {
                        config.deviceConfig = config.deviceConfig || {};
                        config.deviceConfig.methodName = value;
                    }
                    else if (selectId.startsWith('tc-system-operation-type')) {
                        config.systemConfig = config.systemConfig || {};
                        config.systemConfig.operationType = value;
                    }
                    else if (selectId.startsWith('tc-page-operation-type')) config.operationType = value;
                    else if (selectId.startsWith('tc-target-value-type')) {
                        config.compareConfig = config.compareConfig || {};
                        config.compareConfig.targetValueType = value;
                    }
                    else if (selectId.startsWith('tc-search-type')) {
                        config.searchConfig = config.searchConfig || {};
                        config.searchConfig.searchType = value;
                    }
                    else if (selectId.startsWith('tc-faker-locale')) {
                        config.operationValue = config.operationValue || {};
                        config.operationValue.fakerConfig = config.operationValue.fakerConfig || {};
                        config.operationValue.fakerConfig.locale = value;
                    }
                    else if (selectId.startsWith('tc-faker-provider')) {
                        config.operationValue = config.operationValue || {};
                        config.operationValue.fakerConfig = config.operationValue.fakerConfig || {};
                        config.operationValue.fakerConfig.provider = value;
                    }
                    else if (selectId.startsWith('tc-faker-method')) {
                        config.operationValue = config.operationValue || {};
                        config.operationValue.fakerConfig = config.operationValue.fakerConfig || {};
                        config.operationValue.fakerConfig.method = value;
                    }
                    else if (selectId.startsWith('tc-faker-category')) {
                        config.operationValue = config.operationValue || {};
                        config.operationValue.fakerConfig = config.operationValue.fakerConfig || {};
                        config.operationValue.fakerConfig.category = value;
                    }
                    else if (selectId.startsWith('tc-nav-key-select')) {
                        config.systemConfig = config.systemConfig || {};
                        config.systemConfig.navKey = value;
                    }
                    else if (selectId.startsWith('tc-random-precision')) {
                        config.operationValue = config.operationValue || {};
                        config.operationValue.randomConfig = config.operationValue.randomConfig || {};
                        config.operationValue.randomConfig.precision = parseInt(value);
                    }
                    else if (selectId.startsWith('tc-compare-element-page')) {
                        config.compareConfig = config.compareConfig || {};
                        config.compareConfig.pageId = value;
                    }
                    else if (selectId.startsWith('tc-compare-element-select')) {
                        config.compareConfig = config.compareConfig || {};
                        config.compareConfig.elementId = value;
                    }
                    else if (selectId.startsWith('tc-search-element-page')) {
                        config.searchConfig = config.searchConfig || {};
                        config.searchConfig.pageId = value;
                    }
                    else if (selectId.startsWith('tc-search-element-select')) {
                        config.searchConfig = config.searchConfig || {};
                        config.searchConfig.elementId = value;
                    }
                    else if (selectId.startsWith('tc-ble-step-select')) {
                        config.compareConfig = config.compareConfig || {};
                        config.compareConfig.bleStepId = value;
                    }
                }
            });

            // 读取 input 值
            const customInput = card.querySelector('.tc-custom-input');
            if (customInput) {
                config.operationValue = config.operationValue || {};
                config.operationValue.inputValue = customInput.value;
            }

            const randomMin = card.querySelector('.tc-random-min');
            if (randomMin) {
                config.operationValue = config.operationValue || {};
                config.operationValue.randomConfig = config.operationValue.randomConfig || {};
                config.operationValue.randomConfig.minValue = parseFloat(randomMin.value) || 0;
            }
            const randomMax = card.querySelector('.tc-random-max');
            if (randomMax) {
                config.operationValue = config.operationValue || {};
                config.operationValue.randomConfig = config.operationValue.randomConfig || {};
                config.operationValue.randomConfig.maxValue = parseFloat(randomMax.value) || 100;
            }

            // 点击次数
            const clickCount = card.querySelector('.tc-click-count');
            if (clickCount) {
                config.operationValue = config.operationValue || {};
                config.operationValue.clickCount = parseInt(clickCount.value) || 1;
            }

            // 滑动时长
            const swipeDuration = card.querySelector('.tc-swipe-duration');
            if (swipeDuration) {
                config.operationValue = config.operationValue || {};
                config.operationValue.swipeDuration = parseInt(swipeDuration.value) || 500;
            }

            // 比较目标值
            const compareTargetValue = card.querySelector('.tc-compare-target-value');
            if (compareTargetValue) {
                config.compareConfig = config.compareConfig || {};
                config.compareConfig.targetValue = compareTargetValue.value;
            }
            const compareTolerance = card.querySelector('.tc-compare-tolerance');
            if (compareTolerance) {
                config.compareConfig = config.compareConfig || {};
                if (compareTolerance.value.trim() !== '') {
                    config.compareConfig.tolerance = parseFloat(compareTolerance.value);
                } else {
                    delete config.compareConfig.tolerance;
                }
            }

            // 搜索文本
            const searchTextValue = card.querySelector('.tc-search-text-value');
            if (searchTextValue) {
                config.searchConfig = config.searchConfig || {};
                config.searchConfig.textValue = searchTextValue.value;
            }

            // 搜索匹配类型
            const searchMatchRadio = card.querySelector('.tc-search-match-radio:checked');
            if (searchMatchRadio) {
                config.searchConfig = config.searchConfig || {};
                config.searchConfig.matchType = searchMatchRadio.value;
            }

            // 系统导航点击次数
            const navClickCount = card.querySelector('.tc-nav-click-count');
            if (navClickCount) {
                config.systemConfig = config.systemConfig || {};
                config.systemConfig.clickCount = parseInt(navClickCount.value) || 1;
            }

            // BLE 参数
            const bleParamInputs = card.querySelectorAll('.tc-ble-param-input');
            if (bleParamInputs.length > 0) {
                config.deviceConfig = config.deviceConfig || {};
                config.deviceConfig.params = config.deviceConfig.params || {};
                bleParamInputs.forEach(input => {
                    const paramKey = input.dataset.paramKey;
                    if (paramKey) {
                        config.deviceConfig.params[paramKey] = input.type === 'number'
                            ? parseFloat(input.value)
                            : input.value;
                    }
                });
            }

            // 多选元素
            const multiCheckbox = card.querySelector('.tc-multi-select-checkbox');
            if (multiCheckbox) {
                config.multiSelect = multiCheckbox.checked;
            }

            // 多选点击数量
            const multiClickCount = card.querySelector('.tc-multi-click-count');
            if (multiClickCount) {
                config.multiClickCount = parseInt(multiClickCount.value) || 1;
            }

            // 多选元素列表
            const multiElementItems = card.querySelectorAll('.tc-multi-element-item');
            if (multiElementItems.length > 0) {
                config.selectedElements = [];
                multiElementItems.forEach((item) => {
                    const elem = {};
                    const getSelectedValue = (selectEl) => {
                        if (!selectEl) return null;
                        let optionsEl = null;
                        if (selectEl.id) {
                            optionsEl = document.getElementById(`${selectEl.id}-options`);
                        }
                        if (!optionsEl) {
                            optionsEl = selectEl.querySelector('.custom-select__options');
                        }
                        const selectedOpt = optionsEl?.querySelector('.custom-select__option.selected');
                        return selectedOpt?.dataset.value || null;
                    };
                    const elemSelect = item.querySelector('.custom-select[data-select-id="tc-multi-element-select"]');
                    const elemValue = getSelectedValue(elemSelect);
                    if (elemValue) elem.elementId = elemValue;
                    const opSelect = item.querySelector('.custom-select[data-select-id="tc-multi-operation-select"]');
                    const opValue = getSelectedValue(opSelect);
                    if (opValue) elem.operation = opValue;
                    const inputTypeSelect = item.querySelector('.custom-select[data-select-id="tc-multi-input-type-select"]');
                    const inputTypeValue = getSelectedValue(inputTypeSelect);
                    if (inputTypeValue) elem.inputType = inputTypeValue;
                    const customInput = item.querySelector('.tc-multi-custom-input');
                    if (customInput) elem.inputValue = customInput.value;
                    const randomMin = item.querySelector('.tc-multi-random-min');
                    const randomMax = item.querySelector('.tc-multi-random-max');
                    if (randomMin || randomMax) {
                        elem.randomConfig = elem.randomConfig || {};
                        if (randomMin) elem.randomConfig.minValue = parseFloat(randomMin.value) || 0;
                        if (randomMax) elem.randomConfig.maxValue = parseFloat(randomMax.value) || 100;
                    }
                    const fakerLocaleSelect = item.querySelector('.custom-select[data-select-id="tc-multi-faker-locale"]');
                    const fakerProviderSelect = item.querySelector('.custom-select[data-select-id="tc-multi-faker-provider"]');
                    const fakerLocaleValue = getSelectedValue(fakerLocaleSelect);
                    const fakerProviderValue = getSelectedValue(fakerProviderSelect);
                    if (fakerLocaleValue || fakerProviderValue) {
                        elem.fakerConfig = elem.fakerConfig || {};
                        if (fakerLocaleValue) elem.fakerConfig.locale = fakerLocaleValue;
                        if (fakerProviderValue) elem.fakerConfig.provider = fakerProviderValue;
                    }
                    config.selectedElements.push(elem);
                });
            }

            step.config = config;
            result.push(step);
        });

        return result.length > 0 ? result : modelSteps;
    },
};

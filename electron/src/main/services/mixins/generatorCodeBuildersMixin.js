// Code Builders Mixin for TestCaseCodeGenerator
// Extracted from TestCaseCodeGenerator.js during refactor
// Provides: allure.attach 代码、输入值代码、setup_method 内容、额外导入生成

const generatorCodeBuildersMixin = {
    // ─── 代码片段构建 ──────────────────────────────────────────

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
    },

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
    },

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
    },

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
    },
};

module.exports = generatorCodeBuildersMixin;

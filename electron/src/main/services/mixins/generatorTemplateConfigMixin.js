// Template Config Mixin for TestCaseCodeGenerator
// Extracted from TestCaseCodeGenerator.js during refactor
// Provides: 等待时间配置、蓝牙配置、Allure 装饰器等模板变量生成

const generatorTemplateConfigMixin = {
    // ─── 模板配置生成 ──────────────────────────────────────────

    generateWaitTimeConfig(template, caseData) {
        const waitTimeConfig = caseData.waitTimeConfig || {};
        template = template.replace('APP_LOAD_WAIT_TIME = 10', `APP_LOAD_WAIT_TIME = ${waitTimeConfig.appLoadWaitTime ?? 10}`);
        template = template.replace('ELEMENT_WAIT_TIMEOUT = 30', `ELEMENT_WAIT_TIMEOUT = ${waitTimeConfig.elementWaitTimeout ?? 30}`);
        template = template.replace('STEP_INTERVAL = 2', `STEP_INTERVAL = ${waitTimeConfig.stepInterval ?? 2}`);
        template = template.replace('APP_CLOSE_WAIT_TIME = 2', `APP_CLOSE_WAIT_TIME = ${waitTimeConfig.appCloseWaitTime ?? 2}`);
        return template;
    },

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
    },

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
    },
};

module.exports = generatorTemplateConfigMixin;

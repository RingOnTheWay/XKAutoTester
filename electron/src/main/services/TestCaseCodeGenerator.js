/**
 * 测试用例 Python 代码生成器
 * 从 TestCaseService 抽出，专职 Python 测试代码生成
 *
 * 职责:
 *  - 读取 test_case_template.py 模板
 *  - 根据 caseData + pagePackageData 填充模板
 *  - 写出 .py 测试文件
 *  - 同步更新 caseData 的 pyOutputDir/pyFilePath 字段并回写 .json
 *
 * 不负责:
 *  - 测试用例 CRUD (由 TestCaseService 处理)
 *  - 目录创建 (由 TestCaseService.ensureDirectories 处理)
 *
 * 架构说明:
 *  - 业务方法按生成阶段拆分到 mixins/ 目录下的多个 mixin 对象
 *  - 通过 Object.assign(TestCaseCodeGenerator.prototype, ...) 组合到原型链
 *  - 跨 mixin 方法调用通过 this.<method>() 在运行时解析
 *  - 本文件保留: constructor (状态字段) + generatePythonFile (编排入口)
 */
const fs = require('fs').promises;
const path = require('path');

const generatorHelpersMixin = require('./mixins/generatorHelpersMixin');
const generatorTemplateConfigMixin = require('./mixins/generatorTemplateConfigMixin');
const generatorTestMethodsMixin = require('./mixins/generatorTestMethodsMixin');
const generatorStepsMixin = require('./mixins/generatorStepsMixin');
const generatorCodeBuildersMixin = require('./mixins/generatorCodeBuildersMixin');

class TestCaseCodeGenerator {
    constructor(userConfigPath, projectRoot) {
        this.userConfigPath = userConfigPath;
        this.projectRoot = projectRoot;
        this.testCasesDir = path.join(userConfigPath, 'test_cases');
        this.templatePath = path.join(__dirname, '..', '..', '..', 'templates', 'test_case_template.py');
        this.pagePackagePath = path.join(userConfigPath, 'page_package.json');
        // 确保 testCasesDir 存在 (generatePythonFile 会回写 .json)
        this.ensureDirectories();
    }

    // ─── 入口方法 ──────────────────────────────────────────────

    /**
     * 生成 Python 测试文件
     */
    async generatePythonFile(caseData, outputDir) {
        try {
            const pagePackageData = await this.loadPagePackageData();

            let template = await fs.readFile(this.templatePath, 'utf8');

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
            await fs.writeFile(pyPath, template, 'utf8');

            caseData.pyOutputDir = outputDir;
            caseData.pyFilePath = pyPath;
            const jsonPath = path.join(this.testCasesDir, `${caseData.fileName}.json`);
            await fs.writeFile(jsonPath, JSON.stringify(caseData, null, 2), 'utf8');

            return { success: true, path: pyPath, jsonPath: jsonPath };
        } catch (error) {
            console.error('生成Python文件失败:', error);
            return { success: false, error: error.message };
        }
    }
}

// 将各 mixin 的方法组合到原型链上
// 顺序: Helpers (基础辅助) → TemplateConfig (模板配置) → CodeBuilders (代码片段) → TestMethods (测试方法编排) → Steps (步骤代码)
Object.assign(
    TestCaseCodeGenerator.prototype,
    generatorHelpersMixin,
    generatorTemplateConfigMixin,
    generatorCodeBuildersMixin,
    generatorTestMethodsMixin,
    generatorStepsMixin
);

module.exports = TestCaseCodeGenerator;

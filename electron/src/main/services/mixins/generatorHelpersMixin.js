// Helper Mixin for TestCaseCodeGenerator
// Extracted from TestCaseCodeGenerator.js during refactor
// Provides: 目录确保、页面封装数据加载、元素查找、模板变量替换、类名转换等辅助方法

const fs = require('fs').promises;

const generatorHelpersMixin = {
    // ─── Helper 方法 ──────────────────────────────────────────

    /**
     * 确保 testCasesDir 存在
     */
    async ensureDirectories() {
        try {
            await fs.mkdir(this.testCasesDir, { recursive: true });
        } catch (error) {
            console.error('创建测试用例目录失败:', error);
        }
    },

    /**
     * 加载最新的页面封装数据
     */
    async loadPagePackageData() {
        try {
            const content = await fs.readFile(this.pagePackagePath, 'utf8');
            return JSON.parse(content);
        } catch (error) {
            console.error('加载页面封装数据失败:', error);
            return { apps: [] };
        }
    },

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
    },

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
    },

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
    },

    /**
     * 转换为类名
     */
    toClassName(fileName) {
        let name = fileName.replace(/^test_/, '').replace(/\.py$/, '');
        const parts = name.split('_');
        return 'Test' + parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
    },
};

module.exports = generatorHelpersMixin;

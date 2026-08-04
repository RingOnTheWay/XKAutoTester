// ApkParserService: APK 解析聚合根
// 职责: 输入校验 + 编排 Aapt2Invoker / Aapt2OutputParser / LocaleLabelResolver 三个 collaborator
// 设计: collaborators 可选注入 (对称 ADBService collaborators 模式), handler 零改动
const path = require('path');
const asyncFs = require('../utils/asyncFs');
const Aapt2Invoker = require('./apk/Aapt2Invoker');
const Aapt2OutputParser = require('./apk/Aapt2OutputParser');
const LocaleLabelResolver = require('./apk/LocaleLabelResolver');

class ApkParserService {
    /**
     * @param {string} projectRoot
     * @param {object} [i18nService]
     * @param {object} [collaborators] - 可选注入 (测试用, 对称 ADBService collaborators)
     * @param {object} [collaborators.invoker]
     * @param {object} [collaborators.parser]
     * @param {object} [collaborators.labelResolver]
     */
    constructor(projectRoot, i18nService = null, collaborators = {}) {
        this.projectRoot = projectRoot;
        this.i18nService = i18nService;
        this.aapt2Path = null;
        this._invoker = collaborators.invoker || new Aapt2Invoker({ projectRoot, i18nService });
        this._parser = collaborators.parser || new Aapt2OutputParser();
        this._labelResolver = collaborators.labelResolver || new LocaleLabelResolver({ i18nService });
    }

    async initialize() {
        this.aapt2Path = await this._invoker.resolvePath();
    }

    async parseApk(apkPath) {
        if (!apkPath || typeof apkPath !== 'string') {
            return { success: false, error: this._t('apkErrors.invalidPath') };
        }

        if (!this.aapt2Path) {
            return { success: false, error: this._t('apkErrors.aapt2NotFound') };
        }

        try {
            const fileExists = await asyncFs.exists(apkPath);
            if (!fileExists) {
                return { success: false, error: this._t('apkErrors.fileNotFound') };
            }
        } catch (error) {
            return { success: false, error: this._t('apkErrors.fileAccessError') };
        }

        const ext = path.extname(apkPath).toLowerCase();
        if (ext !== '.apk') {
            return { success: false, error: this._t('apkErrors.invalidFormat') };
        }

        const invokeResult = await this._invoker.dumpBadging(this.aapt2Path, apkPath);
        if (!invokeResult.success) {
            return { success: false, error: invokeResult.error };
        }

        try {
            const parsed = this._parser.parse(invokeResult.output);
            if (!parsed.packageName) {
                return { success: false, error: this._t('apkErrors.noPackageName') };
            }
            parsed.applicationLabel = this._labelResolver.resolve(parsed.localeLabels, parsed.applicationLabel);
            return { success: true, data: parsed };
        } catch (parseError) {
            return { success: false, error: this._t('apkErrors.parseError') };
        }
    }

    _t(key, params) {
        if (!this.i18nService) return key;
        if (typeof this.i18nService.t === 'function') return this.i18nService.t(key, params);
        return key;
    }
}

module.exports = ApkParserService;

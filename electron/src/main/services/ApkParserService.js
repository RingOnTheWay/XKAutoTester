const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const asyncFs = require('../utils/asyncFs');

class ApkParserService {
    constructor(projectRoot, i18nService = null) {
        this.projectRoot = projectRoot;
        this.aapt2Path = null;
        this.i18nService = i18nService;
    }

    async initialize() {
        await this.findAapt2();
    }

    async findAapt2() {
        const possiblePaths = [
            path.join(this.projectRoot, 'env', 'android-sdk', 'build-tools', 'aapt2.exe'),
            path.join(this.projectRoot, 'env', 'android-tools', 'aapt2.exe')
        ];

        for (const aaptPath of possiblePaths) {
            try {
                if (fs.existsSync(aaptPath)) {
                    this.aapt2Path = aaptPath;
                    return;
                }
            } catch (error) {
                continue;
            }
        }

        this.aapt2Path = 'aapt2';
    }

    async parseApk(apkPath) {
        if (!apkPath || typeof apkPath !== 'string') {
            return {
                success: false,
                error: 'APK文件路径无效'
            };
        }

        if (!this.aapt2Path) {
            return {
                success: false,
                error: 'aapt2工具未找到，请检查Android SDK是否正确安装'
            };
        }

        try {
            const fileExists = await asyncFs.exists(apkPath);
            if (!fileExists) {
                return {
                    success: false,
                    error: 'APK文件不存在，请检查文件路径是否正确'
                };
            }
        } catch (error) {
            return {
                success: false,
                error: `无法访问APK文件：${error.message}`
            };
        }

        const ext = path.extname(apkPath).toLowerCase();
        if (ext !== '.apk') {
            return {
                success: false,
                error: '文件格式不正确，请选择有效的APK文件'
            };
        }

        console.log(`[ApkParserService] Parsing APK: ${apkPath}`);
        console.log(`[ApkParserService] aapt2 path: ${this.aapt2Path}`);
        
        return new Promise((resolve) => {
            let command = `"${this.aapt2Path}" dump badging "${apkPath}"`;
            if (process.platform === 'win32') {
                command = `chcp 65001 >nul && ${command}`;
            }
            console.log(`[ApkParserService] Executing command: ${command}`);
            
            exec(command, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
                if (error) {
                    console.error('[ApkParserService] aapt2 error:', error.message);
                    console.error('[ApkParserService] stderr:', stderr);
                    
                    let errorMessage = 'APK解析失败';
                    
                    if (error.code === 'ENOENT') {
                        errorMessage = 'aapt2工具未找到，请检查Android SDK是否正确安装';
                    } else if (error.code === 'EACCES' || error.code === 'EPERM') {
                        errorMessage = '权限不足，无法执行aapt2工具';
                    } else if (stderr && stderr.includes('ERROR:')) {
                        const errorMatch = stderr.match(/ERROR:\s*(.+)/);
                        if (errorMatch) {
                            errorMessage = `APK文件解析错误：${errorMatch[1].trim()}`;
                        } else {
                            errorMessage = `APK文件可能已损坏或格式不正确`;
                        }
                    } else if (error.message.includes('command not found')) {
                        errorMessage = 'aapt2工具未找到，请检查Android SDK是否正确安装';
                    } else if (error.message.includes('not a valid APK') || error.message.includes('not a valid zip')) {
                        errorMessage = '文件不是有效的APK格式，可能已损坏';
                    } else {
                        errorMessage = `APK解析失败：${error.message}`;
                    }
                    
                    resolve({
                        success: false,
                        error: errorMessage
                    });
                    return;
                }

                try {
                    const result = this.parseAapt2Output(stdout);
                    
                    if (!result.packageName) {
                        resolve({
                            success: false,
                            error: '无法从APK中提取包名信息，文件可能已损坏或格式不正确'
                        });
                        return;
                    }
                    
                    resolve({
                        success: true,
                        data: result
                    });
                } catch (parseError) {
                    console.error('[ApkParserService] Parse error:', parseError.message);
                    resolve({
                        success: false,
                        error: `解析APK输出失败：${parseError.message}`
                    });
                }
            });
        });
    }

    parseAapt2Output(output) {
        const result = {
            packageName: '',
            activityName: '',
            versionName: '',
            versionCode: '',
            applicationLabel: '',
            permissions: [],
            features: []
        };

        const localeLabels = {};
        const lines = output.split('\n');

        for (const line of lines) {
            const trimmedLine = line.trim();
            
            if (trimmedLine.startsWith('package:')) {
                const packageMatch = trimmedLine.match(/package:\s*name='([^']+)'/);
                if (packageMatch) {
                    result.packageName = packageMatch[1];
                }

                const versionCodeMatch = trimmedLine.match(/versionCode='([^']+)'/);
                if (versionCodeMatch) {
                    result.versionCode = versionCodeMatch[1];
                }

                const versionNameMatch = trimmedLine.match(/versionName='([^']+)'/);
                if (versionNameMatch) {
                    result.versionName = versionNameMatch[1];
                }
            }

            if (trimmedLine.startsWith('launchable-activity:')) {
                const activityMatch = trimmedLine.match(/launchable-activity:\s*name='([^']+)'/);
                if (activityMatch) {
                    result.activityName = activityMatch[1];
                }
            }

            if (trimmedLine.startsWith('application:')) {
                const labelMatch = trimmedLine.match(/application:\s*label='([^']+)'/);
                if (labelMatch) {
                    result.applicationLabel = labelMatch[1];
                }
            }

            if (trimmedLine.startsWith('application-label:')) {
                const defaultLabelMatch = trimmedLine.match(/^application-label:\s*'(.*)'/);
                if (defaultLabelMatch) {
                    localeLabels['default'] = defaultLabelMatch[1];
                }
            }

            const localeLabelMatch = trimmedLine.match(/^application-label-([a-zA-Z]{2,3}(?:-[a-zA-Z]{2,3}(?:-[a-zA-Z]{2})?)?):\s*'(.*)'/);
            if (localeLabelMatch) {
                const locale = localeLabelMatch[1];
                const label = localeLabelMatch[2];
                localeLabels[locale] = label;
            }

            if (trimmedLine.startsWith('uses-permission:')) {
                const permMatch = trimmedLine.match(/uses-permission:\s*name='([^']+)'/);
                if (permMatch) {
                    result.permissions.push(permMatch[1]);
                }
            }

            if (trimmedLine.startsWith('uses-feature:') || trimmedLine.startsWith('uses-implied-feature:')) {
                const featureMatch = trimmedLine.match(/uses-(?:implied-)?feature:\s*name='([^']+)'/);
                if (featureMatch) {
                    result.features.push(featureMatch[1]);
                }
            }
        }

        const preferredLabel = this._resolveLocaleLabel(localeLabels, result.applicationLabel);
        if (preferredLabel) {
            result.applicationLabel = preferredLabel;
        }

        return result;
    }

    _resolveLocaleLabel(localeLabels, defaultLabel) {
        if (Object.keys(localeLabels).length === 0) {
            return defaultLabel;
        }

        let appLocale = 'zh-CN';
        if (this.i18nService && typeof this.i18nService.getLanguage === 'function') {
            appLocale = this.i18nService.getLanguage() || 'zh-CN';
        }

        const candidates = [appLocale];

        const baseLang = appLocale.split('-')[0];
        if (baseLang !== appLocale) {
            candidates.push(baseLang);
        }

        if (appLocale !== 'zh-CN') {
            candidates.push('zh-CN');
        }
        if (appLocale !== 'en-US') {
            candidates.push('en-US');
        }
        if (appLocale !== 'en') {
            candidates.push('en');
        }
        candidates.push('default');

        for (const locale of candidates) {
            if (localeLabels[locale]) {
                const label = localeLabels[locale];
                const fixed = this._fixGarbledUtf8(label);
                return fixed;
            }
        }

        return this._fixGarbledUtf8(defaultLabel);
    }

    _fixGarbledUtf8(str) {
        if (!str) return str;

        try {
            const buf = Buffer.from(str, 'latin1');
            const decoded = buf.toString('utf8');

            const garbledPattern = /[\u00c0-\u00df][\u0080-\u00bf]|[\u00e0-\u00ef][\u0080-\u00bf]{2}|[\u00f0-\u00f7][\u0080-\u00bf]{3}/;
            if (garbledPattern.test(decoded) && /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(decoded)) {
                return decoded;
            }

            if (garbledPattern.test(str)) {
                return decoded;
            }
        } catch {
            return str;
        }

        return str;
    }
}

module.exports = ApkParserService;

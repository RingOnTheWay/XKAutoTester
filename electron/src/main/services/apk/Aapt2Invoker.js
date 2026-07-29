// Aapt2Invoker: 封装 aapt2 子进程调用
// 职责: 1) 路径解析委托 pathHelper 2) spawn 参数数组执行 (无 shell 注入) 3) 错误分类 + 超时管理
// 设计: 构造注入 spawnFn/i18nService/timeoutMs/maxBuffer 便于单元测试
const pathHelper = require('../../utils/pathHelper');

const DEFAULT_MAX_BUFFER = 10 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 30000;

class Aapt2Invoker {
    constructor({ projectRoot, i18nService, spawnFn, timeoutMs, maxBuffer } = {}) {
        this._projectRoot = projectRoot;
        this._i18n = i18nService || null;
        this._spawn = spawnFn || require('child_process').spawn;
        this._timeoutMs = timeoutMs != null ? timeoutMs : DEFAULT_TIMEOUT_MS;
        this._maxBuffer = maxBuffer != null ? maxBuffer : DEFAULT_MAX_BUFFER;
    }

    async resolvePath() {
        return pathHelper.getAapt2Path(this._projectRoot);
    }

    dumpBadging(aapt2Path, apkPath) {
        return new Promise((resolve) => {
            const args = ['dump', 'badging', apkPath];
            const env = {
                ...process.env,
                LANG: 'en_US.UTF-8',
                LC_ALL: 'en_US.UTF-8',
            };
            const opts = {
                env,
                windowsHide: true,
                maxBuffer: this._maxBuffer,
            };

            let stdout = '';
            let stderr = '';
            let settled = false;
            let timer = null;

            const finish = (result) => {
                if (settled) return;
                settled = true;
                if (timer) clearTimeout(timer);
                resolve(result);
            };

            let proc;
            try {
                proc = this._spawn(aapt2Path, args, opts);
            } catch (err) {
                finish(this._classifySpawnError(err));
                return;
            }

            if (!proc) {
                finish({ success: false, error: this._t('apkErrors.parseFailed', { code: -1 }) });
                return;
            }

            proc.stdout.on('data', (chunk) => {
                stdout += chunk.toString();
                if (stdout.length > this._maxBuffer) {
                    try { proc.kill(); } catch { /* noop */ }
                    finish({ success: false, error: this._t('apkErrors.parseFailed', { code: -1 }) });
                }
            });
            proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

            proc.on('error', (err) => {
                finish(this._classifySpawnError(err));
            });

            proc.on('close', (code) => {
                if (code === 0) {
                    finish({ success: true, output: stdout });
                    return;
                }
                if (stderr && stderr.includes('ERROR:')) {
                    finish({ success: false, error: this._t('apkErrors.fileCorrupted') });
                    return;
                }
                finish({ success: false, error: this._t('apkErrors.parseFailed', { code }) });
            });

            if (this._timeoutMs > 0) {
                timer = setTimeout(() => {
                    try { proc.kill(); } catch { /* noop */ }
                    finish({ success: false, error: this._t('main.commandTimeout') });
                }, this._timeoutMs);
            }
        });
    }

    _classifySpawnError(err) {
        const code = err && err.code;
        if (code === 'ENOENT') {
            return { success: false, error: this._t('apkErrors.aapt2NotFound') };
        }
        if (code === 'EACCES' || code === 'EPERM') {
            return { success: false, error: this._t('apkErrors.permissionDenied') };
        }
        return { success: false, error: this._t('apkErrors.parseFailed', { code: code || -1 }) };
    }

    _t(key, params) {
        if (!this._i18n) return key;
        if (typeof this._i18n.t === 'function') return this._i18n.t(key, params);
        return key;
    }
}

module.exports = Aapt2Invoker;

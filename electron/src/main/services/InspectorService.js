const path = require('path');
const pathHelper = require('../utils/pathHelper');
const { JsonStdioTransport } = require('./JsonStdioTransport');

class InspectorService {
    constructor(projectRoot, i18nService, userDataPath) {
        this.projectRoot = projectRoot;
        this.i18nService = i18nService;
        this.userDataPath = userDataPath;
        this._transport = null;
        this.activeSessionId = null;
        this._onProgress = null;
        this._adbPath = pathHelper.getAdbPath(projectRoot);
    }

    setProgressCallback(callback) {
        this._onProgress = callback;
    }

    _buildSpawnConfig() {
        const pythonConfig = pathHelper.getPythonConfig();
        const srcPath = path.join(this.projectRoot, 'src');
        const pythonPathEnv = pythonConfig.isSystem && pythonConfig.sitePackagesPath
            ? { PYTHONPATH: [pythonConfig.sitePackagesPath, srcPath].join(path.delimiter) }
            : { PYTHONPATH: srcPath };

        return {
            command: pythonConfig.pythonPath,
            args: ['-m', 'main', '--inspector'],
            cwd: this.projectRoot,
            env: {
                ...process.env,
                PYTHONIOENCODING: 'utf-8',
                PYTHONUTF8: '1',
                XKAUTOTESTER_LANG: this.i18nService.getLanguage(),
                XKAUTOTESTER_LOCALES_PATH: pathHelper.getLocalesPath(this.projectRoot),
                ...(pythonConfig.isEmbedded ? {} : pythonPathEnv),
                XKAUTOTESTER_USER_DATA: this.userDataPath,
                XKAUTOTESTER_ADB_PATH: this._adbPath,
            },
        };
    }

    _ensureTransport() {
        if (this._transport) return this._transport;
        this._transport = new JsonStdioTransport(this._buildSpawnConfig());
        this._transport.onNotification((n) => {
            if (n.type === 'progress' && this._onProgress) this._onProgress(n.stage);
        });
        this._transport.onExit(() => {
            this.activeSessionId = null;
        });
        return this._transport;
    }

    async startSession(deviceName, appPackage, appActivity, platformVersion = '', noReset = true) {
        const pythonConfig = pathHelper.getPythonConfig();
        if (!pythonConfig || !pythonConfig.pythonPath) {
            return {
                success: false,
                error: this.i18nService.t('splash.checks.venvNotFound') || 'Python environment not found'
            };
        }

        // M4 修复: 若已有 transport 活跃, 先 stopSession (其 finally 调 _cleanup 置 null),
        // 再重新 _ensureTransport 创建新 transport, 避免对已 dispose 的 transport 调 request
        if (this._transport && this._transport.isActive()) {
            await this.stopSession();
        }
        const transport = this._ensureTransport();

        try {
            const response = await transport.request('start-session', {
                device_name: deviceName,
                app_package: appPackage,
                app_activity: appActivity,
                platform_version: platformVersion,
                no_reset: noReset
            });

            if (response.success && response.session_id) {
                this.activeSessionId = response.session_id;
            }

            return response;
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async getScreenshot() {
        return this._request('get-screenshot');
    }

    async getPageSource() {
        return this._request('get-source');
    }

    async findElementLocators(elementPath) {
        return this._request('find-locators', { element_path: elementPath });
    }

    async refreshSession() {
        return this._request('refresh');
    }

    async stopSession() {
        if (!this._transport || !this._transport.isActive()) {
            this._cleanup();
            return { success: true, message: 'No active session' };
        }

        try {
            const response = await this._transport.request('stop-session', {}, { timeoutMs: 3000 });
            return response;
        } catch (error) {
            return { success: false, error: error.message };
        } finally {
            this._cleanup();
        }
    }

    _request(command, params = {}) {
        if (!this._transport || !this._transport.isActive()) {
            return Promise.resolve({ success: false, error: 'No active inspector session' });
        }
        return this._transport.request(command, params).catch((error) => {
            return { success: false, error: error.message };
        });
    }

    _cleanup() {
        if (this._transport) {
            this._transport.dispose();
            this._transport = null;
        }
        this.activeSessionId = null;
    }

    /**
     * S1: 同步释放资源 (供 ElectronApp before-quit 调用).
     * 与 ScrcpyService.stopScrcpy / PythonTestService.stop 对称, 无需 await.
     * 不发送 stop-session 命令到 Python (进程将随 stdin EOF 自然退出),
     * 仅本地 dispose transport + 清空会话状态.
     */
    dispose() {
        try {
            this._cleanup();
        } catch {
            /* 退出时吞错, 避免阻塞应用关闭 */
        }
    }
}

module.exports = InspectorService;

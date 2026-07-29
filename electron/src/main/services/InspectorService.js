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

        const transport = this._ensureTransport();

        if (transport.isActive()) {
            await this.stopSession();
        }

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
}

module.exports = InspectorService;

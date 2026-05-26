const { spawn } = require('child_process');
const path = require('path');
const pathHelper = require('../utils/pathHelper');

class InspectorService {
    constructor(projectRoot, i18nService, userDataPath) {
        this.projectRoot = projectRoot;
        this.i18nService = i18nService;
        this.userDataPath = userDataPath;
        this.pythonProcess = null;
        this.activeSessionId = null;
        this._pendingRequests = new Map();
        this._requestCounter = 0;
        this._buffer = '';
        this._onProgress = null;
    }

    setProgressCallback(callback) {
        this._onProgress = callback;
    }

    async startSession(deviceName, appPackage, appActivity, platformVersion = '', noReset = true) {
        if (this.pythonProcess) {
            await this.stopSession();
        }

        const pythonConfig = pathHelper.getPythonConfig();
        if (!pythonConfig || !pythonConfig.pythonPath) {
            return {
                success: false,
                error: this.i18nService.t('splash.checks.venvNotFound') || 'Python environment not found'
            };
        }

        const pythonArgs = ['-m', 'main', '--inspector'];

        const srcPath = path.join(this.projectRoot, 'src');
        const pythonPathEnv = pythonConfig.isSystem && pythonConfig.sitePackagesPath
            ? { PYTHONPATH: [pythonConfig.sitePackagesPath, srcPath].join(path.delimiter) }
            : { PYTHONPATH: srcPath };

        this.pythonProcess = spawn(pythonConfig.pythonPath, pythonArgs, {
            cwd: this.projectRoot,
            stdio: ['pipe', 'pipe', 'pipe'],
            env: {
                ...process.env,
                PYTHONIOENCODING: 'utf-8',
                PYTHONUTF8: '1',
                ...(pythonConfig.isEmbedded ? {} : pythonPathEnv),
                XKAUTOTESTER_USER_DATA: this.userDataPath
            },
            windowsHide: true
        });

        this._buffer = '';

        this.pythonProcess.stdout.on('data', (data) => {
            this._handleStdoutData(data);
        });

        this.pythonProcess.stderr.on('data', (data) => {
            console.error('[InspectorService] stderr:', data.toString('utf8'));
        });

        this.pythonProcess.on('close', (code, signal) => {
            this._handleProcessExit(code, signal);
        });

        this.pythonProcess.on('error', (error) => {
            console.error('[InspectorService] process error:', error);
            this._handleProcessExit(null, null);
        });

        await new Promise((resolve) => setTimeout(resolve, 500));

        try {
            const response = await this._sendCommand('start-session', {
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
            this.cleanup();
            return { success: false, error: error.message };
        }
    }

    async getScreenshot() {
        return this._sendCommand('get-screenshot');
    }

    async getPageSource() {
        return this._sendCommand('get-source');
    }

    async findElementLocators(elementPath) {
        return this._sendCommand('find-locators', { element_path: elementPath });
    }

    async refreshSession() {
        return this._sendCommand('refresh');
    }

    async stopSession() {
        if (!this.pythonProcess) {
            return { success: true, message: 'No active session' };
        }

        try {
            const response = await Promise.race([
                this._sendCommand('stop-session'),
                new Promise((resolve) => setTimeout(() => resolve({ success: true }), 3000))
            ]);
            return response;
        } catch (error) {
            return { success: false, error: error.message };
        } finally {
            this.cleanup();
        }
    }

    _sendCommand(command, params = {}) {
        return new Promise((resolve, reject) => {
            if (!this.pythonProcess || !this.pythonProcess.stdin.writable) {
                reject(new Error('Inspector process is not running'));
                return;
            }

            const requestId = ++this._requestCounter;
            const payload = JSON.stringify({ command, params, id: requestId });

            const timeout = setTimeout(() => {
                this._pendingRequests.delete(requestId);
                reject(new Error(`Command '${command}' timed out after 60 seconds`));
            }, 60000);

            this._pendingRequests.set(requestId, { resolve, reject, timeout });

            try {
                this.pythonProcess.stdin.write(payload + '\n');
            } catch (error) {
                clearTimeout(timeout);
                this._pendingRequests.delete(requestId);
                reject(new Error(`Failed to send command '${command}': ${error.message}`));
            }
        });
    }

    _handleStdoutData(data) {
        this._buffer += data.toString('utf8');

        const lines = this._buffer.split('\n');
        this._buffer = lines.pop();

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            try {
                const response = JSON.parse(trimmed);
                if (response.id && this._pendingRequests.has(response.id)) {
                    const pending = this._pendingRequests.get(response.id);
                    clearTimeout(pending.timeout);
                    this._pendingRequests.delete(response.id);
                    pending.resolve(response);
                } else if (response.notification === 'progress' && response.stage) {
                    if (this._onProgress) {
                        this._onProgress(response.stage);
                    }
                }
            } catch (e) {
                console.error('[InspectorService] Failed to parse stdout line:', trimmed);
            }
        }
    }

    _handleProcessExit(code, signal) {
        for (const [requestId, pending] of this._pendingRequests) {
            clearTimeout(pending.timeout);
            pending.reject(new Error(`Inspector process exited (code: ${code}, signal: ${signal})`));
        }

        this._pendingRequests.clear();
        this.pythonProcess = null;
        this.activeSessionId = null;
        this._buffer = '';
    }

    cleanup() {
        if (this.pythonProcess) {
            try {
                this.pythonProcess.kill();
            } catch (e) {
                console.error('[InspectorService] Failed to kill process:', e);
            }
        }

        for (const [requestId, pending] of this._pendingRequests) {
            clearTimeout(pending.timeout);
        }

        this._pendingRequests.clear();
        this.pythonProcess = null;
        this.activeSessionId = null;
        this._buffer = '';
    }
}

module.exports = InspectorService;

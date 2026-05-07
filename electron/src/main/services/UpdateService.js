const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { spawn } = require('child_process');

const GITHUB_OWNER = 'RingOnTheWay';
const GITHUB_REPO = 'XKAutoTester';
const GITHUB_TOKEN = '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';
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases`;

class UpdateService {
    constructor(versionService, userDataService) {
        this.versionService = versionService;
        this.userDataService = userDataService;
        this.updateDir = path.join(userDataService.getUserConfigPath(), 'updates');
        this._ensureUpdateDir();
        this._cleanupOldUpdates();
    }

    _ensureUpdateDir() {
        if (!fs.existsSync(this.updateDir)) {
            fs.mkdirSync(this.updateDir, { recursive: true });
        }
    }

    _cleanupOldUpdates() {
        try {
            if (fs.existsSync(this.updateDir)) {
                const files = fs.readdirSync(this.updateDir);
                for (const file of files) {
                    if (file.endsWith('.exe')) {
                        const filePath = path.join(this.updateDir, file);
                        try {
                            fs.unlinkSync(filePath);
                        } catch (e) {
                            console.error('[UpdateService] Failed to delete old update file:', filePath, e.message);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('[UpdateService] Cleanup old updates failed:', error.message);
        }
    }

    _compareVersions(v1, v2) {
        const parts1 = v1.replace(/^v/, '').split('.').map(Number);
        const parts2 = v2.replace(/^v/, '').split('.').map(Number);
        const maxLen = Math.max(parts1.length, parts2.length);
        for (let i = 0; i < maxLen; i++) {
            const p1 = parts1[i] || 0;
            const p2 = parts2[i] || 0;
            if (p1 < p2) return -1;
            if (p1 > p2) return 1;
        }
        return 0;
    }

    async checkForUpdate() {
        try {
            const response = await axios.get(GITHUB_API_URL, {
                headers: {
                    'Authorization': `Bearer ${GITHUB_TOKEN}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'XKAutoTester-Update-Checker'
                },
                timeout: 15000
            });

            const releases = response.data;
            const latestRelease = releases.find(r => !r.prerelease && !r.draft);

            if (!latestRelease) {
                return {
                    hasUpdate: false,
                    currentVersion: this.versionService.getVersion(),
                    latestVersion: this.versionService.getVersion()
                };
            }

            const latestVersion = latestRelease.tag_name.replace(/^v/, '');
            const currentVersion = this.versionService.getVersion();
            const hasUpdate = this._compareVersions(currentVersion, latestVersion) < 0;

            let downloadUrl = null;
            let fileName = null;
            let fileSize = 0;

            if (hasUpdate && latestRelease.assets && latestRelease.assets.length > 0) {
                const exeAsset = latestRelease.assets.find(a => a.name.endsWith('.exe'));
                if (exeAsset) {
                    downloadUrl = exeAsset.url;
                    fileName = exeAsset.name;
                    fileSize = exeAsset.size;
                }
            }

            return {
                hasUpdate,
                currentVersion,
                latestVersion,
                releaseNotes: latestRelease.body || '',
                releaseName: latestRelease.name || '',
                downloadUrl,
                fileName,
                fileSize,
                htmlUrl: latestRelease.html_url
            };
        } catch (error) {
            console.error('[UpdateService] Check for update failed:', error.message);

            let errorCode = 'unknown';
            let errorMessage = error.message;

            if (error.response) {
                const status = error.response.status;
                switch (status) {
                    case 401:
                        errorCode = 'auth_failed';
                        errorMessage = 'Authentication failed';
                        break;
                    case 403:
                        if (error.response.headers && error.response.headers['x-ratelimit-remaining'] === '0') {
                            errorCode = 'rate_limited';
                            errorMessage = 'API rate limit exceeded';
                        } else {
                            errorCode = 'forbidden';
                            errorMessage = 'Access forbidden';
                        }
                        break;
                    case 404:
                        errorCode = 'repo_not_found';
                        errorMessage = 'Repository not found';
                        break;
                    case 429:
                        errorCode = 'rate_limited';
                        errorMessage = 'Too many requests';
                        break;
                    default:
                        errorCode = `http_${status}`;
                        errorMessage = `HTTP error ${status}`;
                        break;
                }
            } else if (error.code) {
                switch (error.code) {
                    case 'ECONNREFUSED':
                        errorCode = 'connection_refused';
                        errorMessage = 'Connection refused';
                        break;
                    case 'ECONNRESET':
                        errorCode = 'connection_reset';
                        errorMessage = 'Connection reset';
                        break;
                    case 'ETIMEDOUT':
                    case 'ECONNABORTED':
                        errorCode = 'timeout';
                        errorMessage = 'Connection timed out';
                        break;
                    case 'ENOTFOUND':
                        errorCode = 'dns_failed';
                        errorMessage = 'DNS resolution failed';
                        break;
                    case 'ENETUNREACH':
                        errorCode = 'network_unreachable';
                        errorMessage = 'Network unreachable';
                        break;
                    default:
                        errorCode = `network_${error.code}`;
                        errorMessage = `Network error: ${error.code}`;
                        break;
                }
            }

            const errorObj = new Error(errorMessage);
            errorObj.code = errorCode;
            errorObj.statusCode = error.response ? error.response.status : null;
            throw errorObj;
        }
    }

    async downloadUpdate(downloadUrl, fileName, eventSender) {
        try {
            this._ensureUpdateDir();

            const filePath = path.join(this.updateDir, fileName);

            if (fs.existsSync(filePath)) {
                const stats = fs.statSync(filePath);
                return {
                    success: true,
                    filePath,
                    message: 'File already downloaded'
                };
            }

            const response = await axios({
                method: 'GET',
                url: downloadUrl,
                headers: {
                    'Authorization': `Bearer ${GITHUB_TOKEN}`,
                    'Accept': 'application/octet-stream',
                    'User-Agent': 'XKAutoTester-Update-Checker'
                },
                responseType: 'stream',
                timeout: 300000
            });

            const totalLength = parseInt(response.headers['content-length'], 10);
            let downloadedLength = 0;
            let lastReportedPercent = -1;
            let lastSpeedTime = Date.now();
            let lastSpeedDownloaded = 0;
            let currentSpeed = 0;

            const writer = fs.createWriteStream(filePath);

            const sendProgress = () => {
                if (!eventSender) return;
                try {
                    eventSender.send('on-download-progress', {
                        percent: Math.min(Math.floor((downloadedLength / totalLength) * 100), 100),
                        downloaded: downloadedLength,
                        total: totalLength,
                        speed: currentSpeed
                    });
                } catch (e) {}
            };

            const speedInterval = setInterval(() => {
                const now = Date.now();
                const elapsed = (now - lastSpeedTime) / 1000;
                currentSpeed = elapsed > 0 ? (downloadedLength - lastSpeedDownloaded) / elapsed : 0;
                lastSpeedTime = now;
                lastSpeedDownloaded = downloadedLength;
                sendProgress();
            }, 1000);

            return new Promise((resolve, reject) => {
                response.data.on('data', (chunk) => {
                    downloadedLength += chunk.length;
                    if (totalLength > 0 && eventSender) {
                        const percent = Math.floor((downloadedLength / totalLength) * 100);
                        if (percent !== lastReportedPercent) {
                            lastReportedPercent = percent;
                            sendProgress();
                        }
                    }
                });

                response.data.pipe(writer);

                writer.on('finish', () => {
                    clearInterval(speedInterval);
                    resolve({
                        success: true,
                        filePath,
                        message: 'Download completed'
                    });
                });

                writer.on('error', (err) => {
                    clearInterval(speedInterval);
                    try { fs.unlinkSync(filePath); } catch (e) {}
                    reject(err);
                });

                response.data.on('error', (err) => {
                    clearInterval(speedInterval);
                    try { fs.unlinkSync(filePath); } catch (e) {}
                    reject(err);
                });
            });
        } catch (error) {
            console.error('[UpdateService] Download update failed:', error.message);
            throw new Error(`Failed to download update: ${error.message}`);
        }
    }

    async installUpdate(filePath) {
        try {
            if (!fs.existsSync(filePath)) {
                throw new Error('Update file not found');
            }

            const detached = spawn(filePath, ['--force-run'], {
                detached: true,
                stdio: 'ignore'
            });
            detached.unref();

            setTimeout(() => {
                app.quit();
            }, 1000);

            return { success: true };
        } catch (error) {
            console.error('[UpdateService] Install update failed:', error.message);
            throw new Error(`Failed to install update: ${error.message}`);
        }
    }

    async deleteUpdateFile(filePath) {
        try {
            if (filePath && fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            return { success: true };
        } catch (error) {
            console.error('[UpdateService] Delete update file failed:', error.message);
            return { success: false, error: error.message };
        }
    }
}

module.exports = UpdateService;

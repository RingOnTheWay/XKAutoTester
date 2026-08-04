// UpdateService — 自动更新深模块。
//
// 藏 5 类副作用 (HTTP×2 + fs + spawn + app.quit) + 60+ 行错误分类 + 构造期 I/O + 进度/速度计算。
// 5 factory-or-default (对称 I18nService.js 3-factory + PagePackageService.js 2-factory)。
//
// 生产: new UpdateService(versionService, userDataService)  # 2 参, opts 默认 {}
// 测试: new UpdateService(versionService, userDataService, { updateSourceFactory: fake, ... })
//
// 内部组织:
//   _ensureInitialized()        — 懒初始化 (首次 downloadUpdate 触发 ensureDir + cleanupOldUpdates)
//   _cleanupOldUpdates()        — 清理旧 .exe 文件 (经 fileSystem factory)
//   checkForUpdate()            — updateSource.fetchLatestRelease → versionComparator → 提取 asset
//   downloadUpdate()            — 懒初始化 + fileSystem.exists 快路径 + downloadStrategy.download
//   installUpdate()             — fileSystem.exists 检查 + installStrategy.install
//   deleteUpdateFile()          — fileSystem.exists + fileSystem.unlink

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { app } = require('electron');
const { spawn } = require('child_process');
const { ensureDirectoryExists } = require('../utils/pathHelper');
const { IPC_CHANNELS } = require('../../shared/constants');

const GITHUB_OWNER = 'RingOnTheWay';
const GITHUB_REPO = 'XKAutoTester';
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases`;

// ── module-level 纯函数 (对称 I18nService default factory 模式) ──

/** 版本比较纯函数: 返 -1 (v1<v2) / 0 (相等) / 1 (v1>v2) */
function compareVersions(v1, v2) {
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

/** 错误分类纯函数: 将 axios/network error 转 classified error (含 .code + .statusCode) */
function normalizeUpdateError(error) {
  let errorCode = 'unknown';
  let errorMessage = error.message;

  if (error.response) {
    const status = error.response.status;
    switch (status) {
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
      case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE':
      case 'CERT_HAS_EXPIRED':
      case 'DEPTH_ZERO_SELF_SIGNED_CERT':
      case 'SELF_SIGNED_CERT_IN_CHAIN':
      case 'ERR_TLS_CERT_ALTNAME_INVALID':
      case 'ERR_TLS_PROTOCOL_VERSION':
        errorCode = 'ssl_failed';
        errorMessage = 'SSL certificate verification failed';
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
  return errorObj;
}

// ── 5 默认 factory (factory-or-default, 对称 I18nService 3-factory + PagePackageService 2-factory) ──

const defaultFileSystemFactory = () => ({
  ensureDir: (dir) => ensureDirectoryExists(dir),
  exists: (p) => fs.existsSync(p),
  stat: (p) => fs.statSync(p),
  unlink: (p) => fs.unlinkSync(p),
  readdir: (dir) => fs.readdirSync(dir),
  createWriteStream: (p) => fs.createWriteStream(p),
});

const defaultUpdateSourceFactory = (httpsAgent) => ({
  async fetchLatestRelease() {
    try {
      const response = await axios.get(GITHUB_API_URL, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'XKAutoTester-Update-Checker'
        },
        timeout: 15000,
        ...(httpsAgent ? { httpsAgent } : {})
      });
      const releases = response.data;
      return releases.find(r => !r.prerelease && !r.draft) || null;
    } catch (error) {
      throw normalizeUpdateError(error);
    }
  }
});

const defaultDownloadStrategyFactory = (httpsAgent) => ({
  async download(downloadUrl, filePath, eventSender) {
    const headers = {
      'Accept': 'application/octet-stream',
      'User-Agent': 'XKAutoTester-Update-Checker'
    };
    // 公开 repo 下载不需 token；env 配置 token 时携带以提升 GitHub API 速率限制
    const githubToken = process.env.GITHUB_TOKEN;
    if (githubToken) {
      headers['Authorization'] = `Bearer ${githubToken}`;
    }

    const response = await axios({
      method: 'GET',
      url: downloadUrl,
      headers,
      responseType: 'stream',
      timeout: 300000,
      ...(httpsAgent ? { httpsAgent } : {})
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
        eventSender.send(IPC_CHANNELS.ON_DOWNLOAD_PROGRESS, {
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
        resolve({ success: true, filePath, message: 'Download completed' });
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
  }
});

const defaultInstallStrategyFactory = () => ({
  async install(filePath) {
    const detached = spawn(filePath, ['--force-run'], {
      detached: true,
      stdio: 'ignore'
    });
    detached.unref();
    setTimeout(() => { app.quit(); }, 1000);
    return { success: true };
  }
});

// ── UpdateService 类 ──

class UpdateService {
  /**
   * @param {Object} versionService
   * @param {Object} userDataService
   * @param {Object} [opts] - factory-or-default (全可选, 生产不传)
   * @param {Function} [opts.updateSourceFactory] - 默认包装 axios.get + 错误分类
   * @param {Function} [opts.downloadStrategyFactory] - 默认包装 axios stream + 进度/速度 + eventSender
   * @param {Function} [opts.installStrategyFactory] - 默认包装 spawn + app.quit
   * @param {Function} [opts.fileSystemFactory] - 默认包装 fs 5 方法 + ensureDirectoryExists
   * @param {Function} [opts.versionComparator] - 默认 module-level compareVersions
   */
  constructor(versionService, userDataService, opts = {}) {
    this.versionService = versionService;
    this.userDataService = userDataService;
    this.updateDir = path.join(userDataService.getUserConfigPath(), 'updates');
    this._initialized = false;  // 懒初始化 flag (对称 I18nService.initialized)
    this._updateSourceFactory = opts.updateSourceFactory || defaultUpdateSourceFactory;
    this._downloadStrategyFactory = opts.downloadStrategyFactory || defaultDownloadStrategyFactory;
    this._installStrategyFactory = opts.installStrategyFactory || defaultInstallStrategyFactory;
    this._fileSystemFactory = opts.fileSystemFactory || defaultFileSystemFactory;
    this._versionComparator = opts.versionComparator || compareVersions;
    this._allowInsecureSSL = !!opts.allowInsecureSSL;
    // 预构建 httpsAgent: allowInsecureSSL=true 时跳过证书校验 (用于代理/加速等导致证书异常的场景)
    this._httpsAgent = this._allowInsecureSSL
      ? new https.Agent({ rejectUnauthorized: false })
      : undefined;
    this._updateSource = this._updateSourceFactory(this._httpsAgent);
    this._downloadStrategy = this._downloadStrategyFactory(this._httpsAgent);
    this._installStrategy = this._installStrategyFactory();
    this._fileSystem = this._fileSystemFactory();
  }

  /**
   * 运行时切换 allowInsecureSSL (设置页 toggle 触发, 立即生效).
   * 重新构建 httpsAgent + updateSource + downloadStrategy; install/fileSystem 不受影响.
   * @param {boolean} enable
   */
  setAllowInsecureSSL(enable) {
    const next = !!enable;
    if (next === this._allowInsecureSSL) return;
    this._allowInsecureSSL = next;
    this._httpsAgent = next ? new https.Agent({ rejectUnauthorized: false }) : undefined;
    this._updateSource = this._updateSourceFactory(this._httpsAgent);
    this._downloadStrategy = this._downloadStrategyFactory(this._httpsAgent);
  }

  /**
   * 启动期二段构造: 接收 config 对象应用初始配置 (对称 ApkParserService.initialize).
   * 当前仅应用 allowInsecureSSL; 懒初始化 (_ensureInitialized) 不受影响.
   * @param {object} config - config.json 解析后的对象
   */
  initialize(config) {
    const allowInsecureSSL = !!(config && config.APP_SETTINGS && config.APP_SETTINGS.allowInsecureSSL);
    this.setAllowInsecureSSL(allowInsecureSSL);
  }

  // 懒初始化 (消除构造期 I/O, 对称 I18nService.init 幂等模式)
  _ensureInitialized() {
    if (this._initialized) return;
    this._fileSystem.ensureDir(this.updateDir);
    this._cleanupOldUpdates();
    this._initialized = true;
  }

  _cleanupOldUpdates() {
    try {
      if (this._fileSystem.exists(this.updateDir)) {
        const files = this._fileSystem.readdir(this.updateDir);
        for (const file of files) {
          if (file.endsWith('.exe')) {
            const filePath = path.join(this.updateDir, file);
            try {
              this._fileSystem.unlink(filePath);
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

  async checkForUpdate() {
    const latestRelease = await this._updateSource.fetchLatestRelease();

    if (!latestRelease) {
      return {
        hasUpdate: false,
        currentVersion: this.versionService.getVersion(),
        latestVersion: this.versionService.getVersion()
      };
    }

    const latestVersion = latestRelease.tag_name.replace(/^v/, '');
    const currentVersion = this.versionService.getVersion();
    const hasUpdate = this._versionComparator(currentVersion, latestVersion) < 0;

    let downloadUrl = null;
    let fileName = null;
    let fileSize = 0;

    if (hasUpdate && latestRelease.assets && latestRelease.assets.length > 0) {
      let exeAsset = latestRelease.assets.find(a =>
        a.name.endsWith('.exe') && a.name.includes('Lite')
      );
      if (!exeAsset) {
        exeAsset = latestRelease.assets.find(a => a.name.endsWith('.exe'));
      }
      if (exeAsset) {
        downloadUrl = exeAsset.browser_download_url;
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
  }

  async downloadUpdate(downloadUrl, fileName, eventSender) {
    try {
      this._ensureInitialized();  // 懒初始化触发

      const filePath = path.join(this.updateDir, fileName);

      if (this._fileSystem.exists(filePath)) {
        return {
          success: true,
          filePath,
          message: 'File already downloaded'
        };
      }

      return await this._downloadStrategy.download(downloadUrl, filePath, eventSender);
    } catch (error) {
      console.error('[UpdateService] Download update failed:', error.message);
      throw new Error(`Failed to download update: ${error.message}`);
    }
  }

  async installUpdate(filePath) {
    try {
      if (!this._fileSystem.exists(filePath)) {
        throw new Error('Update file not found');
      }
      return await this._installStrategy.install(filePath);
    } catch (error) {
      console.error('[UpdateService] Install update failed:', error.message);
      throw new Error(`Failed to install update: ${error.message}`);
    }
  }

  async deleteUpdateFile(filePath) {
    try {
      if (filePath && this._fileSystem.exists(filePath)) {
        this._fileSystem.unlink(filePath);
      }
      return { success: true };
    } catch (error) {
      console.error('[UpdateService] Delete update file failed:', error.message);
      return { success: false, error: error.message };
    }
  }
}

module.exports = { UpdateService, normalizeUpdateError };

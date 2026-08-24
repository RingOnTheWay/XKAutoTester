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
const crypto = require('crypto');
const { app } = require('electron');
const { spawn } = require('child_process');
const { ensureDirectoryExists } = require('../utils/pathHelper');
const { IPC_CHANNELS } = require('../../shared/constants');
const { compareVersions } = require('../utils/versionCompare');

const GITHUB_OWNER = 'RingOnTheWay';
const GITHUB_REPO = 'XKAutoTester';
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases`;

// ── module-level 纯函数 (对称 I18nService default factory 模式) ──
// (compareVersions 已抽取至 utils/versionCompare, 见文件头部 import)

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

/**
 * 从 GitHub Release body 解析 SHA256 hash, 按 asset 名匹配。
 * 约定格式 (多 asset Release notes, 各 asset 独立标注):
 *   **XKAutoTester Setup v2.0.0.exe**
 *   SHA256: a3f5b8c1d2e4f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1
 *
 *   **XKAutoTester Setup v2.0.0 Lite.exe**
 *   SHA256: b4c6d9e2f3a5b7c8d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2
 *
 * 解析顺序:
 * 1. 若传 fileName, 优先找 `**<fileName>**` 后的 SHA256 (asset 专属 hash)
 * 2. 回退: 取首个 SHA256 行 (兼容旧格式单 hash Release, 不区分 asset)
 * 3. 都没找到返 null (向后兼容, 跳过校验)
 *
 * @param {string} body - Release notes body
 * @param {string} [fileName] - asset 文件名 (可选, 多 asset 时按名匹配)
 * @returns {string|null} 64位小写 hex hash, 未找到返 null
 */
function parseSha256FromBody(body, fileName) {
  if (typeof body !== 'string' || body.length === 0) return null;

  // 优先: 按 fileName 匹配 asset 专属 hash
  if (fileName) {
    // 转义 fileName 中的正则特殊字符 (如 . + ( ))
    const escapedName = fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // 匹配 `**<fileName>**` 后 (允许任意字符含换行) 的首个 SHA256 行
    const assetPattern = new RegExp(
      `\\*\\*${escapedName}\\*\\*[\\s\\S]*?SHA256:\\s*([a-fA-F0-9]{64})\\b`,
      'i'
    );
    const assetMatch = body.match(assetPattern);
    if (assetMatch) return assetMatch[1].toLowerCase();
  }

  // 回退: 取首个 SHA256 行 (兼容旧格式单 hash Release)
  const fallbackMatch = body.match(/SHA256:\s*([a-fA-F0-9]{64})\b/);
  return fallbackMatch ? fallbackMatch[1].toLowerCase() : null;
}

/**
 * 计算文件 SHA256 (流式, 避免大文件 OOM)。
 * @param {string} filePath - 待校验文件路径
 * @returns {Promise<string>} 64位小写 hex hash
 */
async function computeFileSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex').toLowerCase()));
    stream.on('error', reject);
  });
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
        // 下载完整性校验: 防下载不完整的 .exe 被执行; 完整 SHA256 校验需业务决策 hash 存储位置
        if (totalLength > 0 && downloadedLength !== totalLength) {
          try { fs.unlinkSync(filePath); } catch (e) {}
          reject(new Error(`下载不完整: 预期 ${totalLength} 字节, 实际 ${downloadedLength} 字节`));
          return;
        }
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
    // SHA256 校验已在 UpdateService.installUpdate 层完成, 此处直接 spawn。
    const detached = spawn(filePath, ['--force-run'], {
      detached: true,
      stdio: 'ignore'
    });
    detached.unref();
    setTimeout(() => { app.quit(); }, 1000);
    return { success: true };
  }
});

// 默认 hash 计算器 (流式 SHA256), 测试可注入 fake
const defaultHashCalculatorFactory = () => ({
  compute: computeFileSha256,
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
   * @param {Function} [opts.hashCalculatorFactory] - 默认包装 crypto SHA256 流式计算
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
    this._hashCalculatorFactory = opts.hashCalculatorFactory || defaultHashCalculatorFactory;
    this._allowInsecureSSL = !!opts.allowInsecureSSL;
    // 预构建 httpsAgent: allowInsecureSSL=true 时跳过证书校验 (用于代理/加速等导致证书异常的场景)
    this._httpsAgent = this._allowInsecureSSL
      ? new https.Agent({ rejectUnauthorized: false })
      : undefined;
    this._updateSource = this._updateSourceFactory(this._httpsAgent);
    this._downloadStrategy = this._downloadStrategyFactory(this._httpsAgent);
    this._installStrategy = this._installStrategyFactory();
    this._fileSystem = this._fileSystemFactory();
    this._hashCalculator = this._hashCalculatorFactory();
    // checkForUpdate 解析 Release body 后存此处, 供 download/install 校验
    this._expectedSha256 = null;
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

  /**
   * 判断当前是否完整版安装 (含 bundled .venv)。
   * 完整版: 打包模式 process.resourcesPath/.venv 存在 (extraResources 含 .venv)
   * Lite 版/开发模式: .venv 不存在
   */
  _isFullInstall() {
    try {
      if (!app.isPackaged) return false;  // 开发模式不作完整版判定
      const venvPath = path.join(process.resourcesPath, '.venv');
      return fs.existsSync(venvPath);
    } catch {
      return false;
    }
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
        latestVersion: this.versionService.getVersion(),
        secure: false  // 无 release 不存在安装场景, secure=false
      };
    }

    const latestVersion = latestRelease.tag_name.replace(/^v/, '');
    const currentVersion = this.versionService.getVersion();
    const hasUpdate = this._versionComparator(currentVersion, latestVersion) < 0;

    let downloadUrl = null;
    let fileName = null;
    let fileSize = 0;

    if (hasUpdate && latestRelease.assets && latestRelease.assets.length > 0) {
      // 按当前安装类型选 asset, 避免完整版用户被降级更新为 Lite
      // 完整版: process.resourcesPath/.venv 存在 (extraResources 含 .venv)
      // Lite 版: .venv 未打包
      const isLiteInstall = !this._isFullInstall();
      let exeAsset;
      if (isLiteInstall) {
        // Lite 版: 优先选 Lite asset
        exeAsset = latestRelease.assets.find(a =>
          a.name.endsWith('.exe') && a.name.includes('Lite')
        );
      } else {
        // 完整版: 优先选非 Lite 的 .exe
        exeAsset = latestRelease.assets.find(a =>
          a.name.endsWith('.exe') && !a.name.includes('Lite')
        );
      }
      // 回退: 任意 .exe
      if (!exeAsset) {
        exeAsset = latestRelease.assets.find(a => a.name.endsWith('.exe'));
      }
      if (exeAsset) {
        downloadUrl = exeAsset.browser_download_url;
        fileName = exeAsset.name;
        fileSize = exeAsset.size;
      }
    }

    // 解析 Release body 中的 SHA256, 按 fileName 匹配 asset 专属 hash
    // 完整版用户匹配完整包 hash, Lite 版用户匹配 Lite 包 hash, 互不干扰
    const sha256 = parseSha256FromBody(latestRelease.body || '', fileName);
    this._expectedSha256 = sha256;

    return {
      hasUpdate,
      currentVersion,
      latestVersion,
      releaseNotes: latestRelease.body || '',
      releaseName: latestRelease.name || '',
      downloadUrl,
      fileName,
      fileSize,
      sha256,  // 透出给 UI 显示校验状态 (null 表示 Release 未预埋 hash)
      secure: sha256 !== null,  // 是否可安全安装 (有 hash 才能 download/install)
      htmlUrl: latestRelease.html_url
    };
  }

  async downloadUpdate(downloadUrl, fileName, eventSender) {
    try {
      this._ensureInitialized();  // 懒初始化触发

      // 严格拒绝无 hash 版本, 防供应链攻击。
      // _expectedSha256 为 null 表示 checkForUpdate 未调 或 Release 未预埋 hash, 一律拒绝下载。
      if (!this._expectedSha256) {
        const err = new Error('Release 缺少 SHA256 hash, 拒绝下载 (安全闭环)');
        err.code = 'missing_hash';
        throw err;
      }

      const filePath = path.join(this.updateDir, fileName);

      if (this._fileSystem.exists(filePath)) {
        // 快路径也校验 SHA256: 防止已被篡改/损坏的缓存文件被直接安装
        const verifyError = await this._verifySha256IfExists(filePath);
        if (verifyError) {
          // 校验失败 → 删除缓存文件, 走全量下载
          console.error(`[UpdateService] 缓存文件 SHA256 校验失败, 重新下载: ${verifyError}`);
          try { this._fileSystem.unlink(filePath); } catch (e) { /* ignore */ }
        } else {
          return {
            success: true,
            filePath,
            message: 'File already downloaded'
          };
        }
      }

      const result = await this._downloadStrategy.download(downloadUrl, filePath, eventSender);

      // 下载完成后校验 SHA256: 防止下载不完整/中间人篡改
      const postDownloadError = await this._verifySha256IfExists(filePath);
      if (postDownloadError) {
        try { this._fileSystem.unlink(filePath); } catch (e) { /* ignore */ }
        throw new Error(`下载文件 SHA256 校验失败: ${postDownloadError}`);
      }

      return result;
    } catch (error) {
      console.error('[UpdateService] Download update failed:', error.message);
      // 保留 missing_hash code 透出给 UI 区分 (而非统一 unknown)
      const wrapped = new Error(`Failed to download update: ${error.message}`);
      if (error.code) wrapped.code = error.code;
      throw wrapped;
    }
  }

  async installUpdate(filePath) {
    try {
      if (!this._fileSystem.exists(filePath)) {
        throw new Error('Update file not found');
      }
      // 严格拒绝无 hash 版本安装。
      if (!this._expectedSha256) {
        const err = new Error('Release 缺少 SHA256 hash, 拒绝安装 (安全闭环)');
        err.code = 'missing_hash';
        throw err;
      }
      // 安装前重新校验 SHA256: 防止下载后被替换/篡改 (TOCTOU)
      const verifyError = await this._verifySha256IfExists(filePath);
      if (verifyError) {
        throw new Error(`安装前 SHA256 校验失败: ${verifyError}`);
      }
      return await this._installStrategy.install(filePath);
    } catch (error) {
      console.error('[UpdateService] Install update failed:', error.message);
      const wrapped = new Error(`Failed to install update: ${error.message}`);
      if (error.code) wrapped.code = error.code;
      throw wrapped;
    }
  }

  /**
   * 校验文件 SHA256, 仅当 _expectedSha256 非空时执行。
   * downloadUpdate/installUpdate 入口已严格拒绝 _expectedSha256=null,
   * 此处保留 null 跳过分支仅作防御性兜底 (例如直接调 _verifySha256IfExists 的内部测试)。
   * @param {string} filePath - 待校验文件路径
   * @returns {Promise<string|null>} null=通过/跳过; string=失败原因
   */
  async _verifySha256IfExists(filePath) {
    if (!this._expectedSha256) return null;  // 防御性兜底 (入口已拒绝)
    let actualHash;
    try {
      actualHash = await this._hashCalculator.compute(filePath);
    } catch (e) {
      return `计算 hash 失败: ${e.message}`;
    }
    if (actualHash !== this._expectedSha256) {
      return `预期 ${this._expectedSha256}, 实际 ${actualHash}`;
    }
    return null;
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

module.exports = { UpdateService, normalizeUpdateError, parseSha256FromBody, computeFileSha256 };

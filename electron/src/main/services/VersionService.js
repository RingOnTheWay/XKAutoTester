// VersionService — 应用版本信息深模块。
//
// 藏 fs 同步读取 + JSON 解析兜底 + cache 语义。
// 1 factory-or-default (fileSystemFactory) + 懒初始化 _initialized flag (对称 UpdateService/TestCaseService)。
//
// 生产: new VersionService(projectRoot)  # 1 参
// 测试: new VersionService(projectRoot, { fileSystemFactory: fakeFs })

const fs = require('fs');
const path = require('path');

/** @typedef {Object} VersionFileSystem
 * @property {(p: string) => boolean} exists
 * @property {(p: string, encoding?: string) => string} readFileSync
 */
/** @typedef {Object} VersionServiceOptions
 * @property {() => VersionFileSystem} [fileSystemFactory]
 */

const DEFAULT_VERSION_INFO = Object.freeze({
  version: '0.0.0',
  buildDate: '',
  prerelease: '',
  fullVersion: '0.0.0',
});

class VersionService {
  /**
   * @param {string} projectRoot
   * @param {VersionServiceOptions} [opts] - factory-or-default
   */
  constructor(projectRoot, opts = {}) {
    this.projectRoot = projectRoot;
    this._versionFile = path.join(projectRoot, 'version.json');
    this._initialized = false;
    this._versionData = null;
    this._fileSystemFactory =
      opts.fileSystemFactory ||
      (() => ({
        exists: (p) => fs.existsSync(p),
        readFileSync: (p, encoding) => fs.readFileSync(p, encoding),
      }));
    this._fs = this._fileSystemFactory();
  }

  _ensureInitialized() {
    if (this._initialized) return;
    try {
      if (this._fs.exists(this._versionFile)) {
        const content = this._fs.readFileSync(this._versionFile, 'utf-8');
        this._versionData = JSON.parse(content);
      }
    } catch (error) {
      console.error('[VersionService] Failed to read version.json:', error.message);
    }
    this._initialized = true;
  }

  getVersionInfo() {
    this._ensureInitialized();
    if (this._versionData) return this._versionData;
    return { ...DEFAULT_VERSION_INFO };
  }

  getVersion() {
    return this.getVersionInfo().version || '0.0.0';
  }

  getFullVersion() {
    const info = this.getVersionInfo();
    return info.fullVersion || info.version || '0.0.0';
  }

  getBuildDate() {
    return this.getVersionInfo().buildDate || '';
  }

  getDisplayVersion() {
    const info = this.getVersionInfo();
    if (info.fullVersion) return `v${info.fullVersion}`;
    return `v${info.version || '0.0.0'}`;
  }

  clearCache() {
    this._initialized = false;
    this._versionData = null;
  }
}

module.exports = { VersionService };

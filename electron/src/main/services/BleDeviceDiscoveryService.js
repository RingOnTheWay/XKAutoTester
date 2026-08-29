// BleDeviceDiscoveryService — BLE 设备发现深模块。
//
// 藏 fs 同步扫描 (2 层目录) + JSON metadata 解析 + cache 语义。
// 1 factory-or-default (fileSystemFactory) + 懒初始化 _initialized flag (对称 VersionService)。
//
// 生产: new BleDeviceDiscoveryService(projectRoot)  # 1 参
// 测试: new BleDeviceDiscoveryService(projectRoot, { fileSystemFactory: fakeFs })

const path = require('path');
const fs = require('fs');

/** @typedef {Object} BleFileSystem
 * @property {(p: string) => boolean} exists
 * @property {(dir: string, opts?: object) => string[]} readdirSync
 * @property {(p: string, encoding?: string) => string} readFileSync
 */
/** @typedef {Object} BleDeviceDiscoveryOptions
 * @property {() => BleFileSystem} [fileSystemFactory]
 */

class BleDeviceDiscoveryService {
  /**
   * @param {string} projectRoot
   * @param {BleDeviceDiscoveryOptions} [opts] - factory-or-default
   */
  constructor(projectRoot, opts = {}) {
    this.projectRoot = projectRoot;
    this._deviceDir = path.join(projectRoot, 'src', 'main', 'device');
    this._initialized = false;
    this._deviceCache = null;
    this._fileSystemFactory =
      opts.fileSystemFactory ||
      (() => ({
        exists: (p) => fs.existsSync(p),
        readdirSync: (dir, opts) => fs.readdirSync(dir, opts),
        readFileSync: (p, encoding) => fs.readFileSync(p, encoding),
      }));
    this._fs = this._fileSystemFactory();
  }

  _ensureInitialized() {
    if (this._initialized) return;
    this._deviceCache = this._scanDevices();
    this._initialized = true;
  }

  _scanDevices() {
    const devices = [];
    if (!this._fs.exists(this._deviceDir)) return devices;

    const entries = this._fs.readdirSync(this._deviceDir, {
      withFileTypes: true,
    });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const subDir = path.join(this._deviceDir, entry.name);
      const jsonFiles = this._fs.readdirSync(subDir).filter((f) => f.endsWith('.json'));
      for (const jsonFile of jsonFiles) {
        const jsonPath = path.join(subDir, jsonFile);
        try {
          const content = this._fs.readFileSync(jsonPath, 'utf8');
          const metadata = JSON.parse(content);
          if (metadata.deviceId && metadata.bleConfig) {
            devices.push({
              ...metadata,
              _sourceDir: entry.name,
              _sourceFile: jsonFile,
            });
          }
        } catch (e) {
          console.warn(`Failed to parse device metadata: ${jsonPath}`, e.message);
        }
      }
    }
    return devices;
  }

  async getDevices() {
    this._ensureInitialized();
    return { success: true, data: this._deviceCache };
  }

  async getDeviceDetail(deviceId) {
    this._ensureInitialized();
    const device = this._deviceCache.find((d) => d.deviceId === deviceId);
    if (!device) return { success: false, error: `Device not found: ${deviceId}` };
    return { success: true, data: device };
  }

  refreshCache() {
    this._deviceCache = this._scanDevices();
    this._initialized = true;
  }
}

module.exports = { BleDeviceDiscoveryService };

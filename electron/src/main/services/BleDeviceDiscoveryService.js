const path = require('path');
const fs = require('fs');

class BleDeviceDiscoveryService {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this._deviceCache = null;
    this._deviceDir = this._resolveDeviceDir();
  }

  _resolveDeviceDir() {
    return path.join(this.projectRoot, 'src', 'main', 'device');
  }

  _scanDevices() {
    const devices = [];

    if (!fs.existsSync(this._deviceDir)) {
      return devices;
    }

    const entries = fs.readdirSync(this._deviceDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const subDir = path.join(this._deviceDir, entry.name);
      const jsonFiles = fs.readdirSync(subDir).filter(f => f.endsWith('.json'));

      for (const jsonFile of jsonFiles) {
        const jsonPath = path.join(subDir, jsonFile);
        try {
          const content = fs.readFileSync(jsonPath, 'utf8');
          const metadata = JSON.parse(content);

          if (metadata.deviceId && metadata.bleConfig) {
            devices.push({
              ...metadata,
              _sourceDir: entry.name,
              _sourceFile: jsonFile
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
    if (!this._deviceCache) {
      this._deviceCache = this._scanDevices();
    }
    return { success: true, data: this._deviceCache };
  }

  async getDeviceDetail(deviceId) {
    const devices = this._deviceCache || this._scanDevices();
    const device = devices.find(d => d.deviceId === deviceId);

    if (!device) {
      return { success: false, error: `Device not found: ${deviceId}` };
    }

    return { success: true, data: device };
  }

  refreshCache() {
    this._deviceCache = this._scanDevices();
  }
}

module.exports = BleDeviceDiscoveryService;

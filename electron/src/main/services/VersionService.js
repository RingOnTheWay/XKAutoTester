const fs = require('fs');
const path = require('path');

class VersionService {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.versionData = null;
  }

  getVersionInfo() {
    if (this.versionData) {
      return this.versionData;
    }

    try {
      const versionFile = path.join(this.projectRoot, 'version.json');
      
      if (fs.existsSync(versionFile)) {
        const content = fs.readFileSync(versionFile, 'utf-8');
        this.versionData = JSON.parse(content);
        return this.versionData;
      }
    } catch (error) {
      console.error('[VersionService] Failed to read version.json:', error.message);
    }

    return {
      version: '0.0.0',
      buildDate: '',
      prerelease: '',
      fullVersion: '0.0.0'
    };
  }

  getVersion() {
    const info = this.getVersionInfo();
    return info.version || '0.0.0';
  }

  getFullVersion() {
    const info = this.getVersionInfo();
    return info.fullVersion || info.version || '0.0.0';
  }

  getBuildDate() {
    const info = this.getVersionInfo();
    return info.buildDate || '';
  }

  getDisplayVersion() {
    const info = this.getVersionInfo();
    if (info.fullVersion) {
      return `v${info.fullVersion}`;
    }
    return `v${info.version || '0.0.0'}`;
  }

  clearCache() {
    this.versionData = null;
  }
}

module.exports = VersionService;

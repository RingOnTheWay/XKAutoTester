const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

class DataTransferService {
  constructor(userDataService, i18nService) {
    this.userDataService = userDataService;
    this.i18nService = i18nService;
    this.mainWindow = null;
  }

  setMainWindow(mainWindow) {
    this.mainWindow = mainWindow;
  }

  _sendProgress(type, data) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(type, data);
    }
  }

  _getTimestamp() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  }

  _collectFiles(dirPath, basePath = '') {
    const results = [];
    if (!fs.existsSync(dirPath)) return results;

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        results.push({ type: 'directory', fullPath, relativePath });
        results.push(...this._collectFiles(fullPath, relativePath));
      } else {
        results.push({ type: 'file', fullPath, relativePath });
      }
    }
    return results;
  }

  async exportConfig(outputPath) {
    try {
      const configPath = this.userDataService.userConfigPath;

      if (!fs.existsSync(configPath)) {
        return { success: false, error: this.i18nService.t('settings.exportConfigFailed') + ': config path not found' };
      }

      this._sendProgress('on-export-progress', {
        phase: 'reading',
        current: 0,
        total: 0,
        percentage: 0,
        currentFile: '',
        message: this.i18nService.t('settings.readingFiles')
      });

      const allFiles = this._collectFiles(configPath);
      const fileEntries = allFiles.filter(e => e.type === 'file');

      if (fileEntries.length === 0) {
        return { success: false, error: this.i18nService.t('settings.exportConfigFailed') + ': no files to export' };
      }

      const manifest = {
        type: 'config',
        version: this._getAppVersion(),
        exportDate: new Date().toISOString(),
        files: fileEntries.map(e => e.relativePath),
        app: 'XKAutoTester'
      };

      const totalItems = fileEntries.length + 1;

      this._sendProgress('on-export-progress', {
        phase: 'packing',
        current: 0,
        total: totalItems,
        percentage: 0,
        currentFile: '',
        message: this.i18nService.t('settings.exportingConfig')
      });

      const zip = new AdmZip();

      zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'));

      this._sendProgress('on-export-progress', {
        phase: 'packing',
        current: 1,
        total: totalItems,
        percentage: Math.round((1 / totalItems) * 100),
        currentFile: 'manifest.json',
        message: this.i18nService.t('settings.packingFile', { file: 'manifest.json' })
      });

      for (let i = 0; i < fileEntries.length; i++) {
        const entry = fileEntries[i];
        const current = i + 2;
        const percentage = Math.round((current / totalItems) * 100);

        zip.addLocalFile(entry.fullPath, path.dirname(entry.relativePath));

        this._sendProgress('on-export-progress', {
          phase: 'packing',
          current: current,
          total: totalItems,
          percentage,
          currentFile: entry.relativePath,
          message: this.i18nService.t('settings.packingFile', { file: entry.relativePath })
        });
      }

      zip.writeZip(outputPath);

      this._sendProgress('on-export-progress', {
        phase: 'packing',
        current: totalItems,
        total: totalItems,
        percentage: 100,
        currentFile: '',
        message: this.i18nService.t('settings.exportConfigSuccess')
      });

      return { success: true, path: outputPath };
    } catch (error) {
      this._sendProgress('on-export-progress', {
        phase: 'error',
        current: 0,
        total: 0,
        percentage: 0,
        currentFile: '',
        message: error.message
      });
      return { success: false, error: error.message };
    }
  }

  async exportLogs(outputPath) {
    try {
      const logsPath = path.join(this.userDataService.userDataPath, 'logs');

      if (!fs.existsSync(logsPath)) {
        return { success: false, error: this.i18nService.t('settings.noLogsToExport') };
      }

      this._sendProgress('on-export-progress', {
        phase: 'reading',
        current: 0,
        total: 0,
        percentage: 0,
        currentFile: '',
        message: this.i18nService.t('settings.readingFiles')
      });

      const allFiles = this._collectFiles(logsPath);
      const fileEntries = allFiles.filter(e => e.type === 'file');

      if (fileEntries.length === 0) {
        return { success: false, error: this.i18nService.t('settings.noLogsToExport') };
      }

      const manifest = {
        type: 'logs',
        version: this._getAppVersion(),
        exportDate: new Date().toISOString(),
        files: fileEntries.map(e => e.relativePath),
        app: 'XKAutoTester'
      };

      const totalItems = fileEntries.length + 1;

      this._sendProgress('on-export-progress', {
        phase: 'packing',
        current: 0,
        total: totalItems,
        percentage: 0,
        currentFile: '',
        message: this.i18nService.t('settings.exportingLogs')
      });

      const zip = new AdmZip();

      zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'));

      this._sendProgress('on-export-progress', {
        phase: 'packing',
        current: 1,
        total: totalItems,
        percentage: Math.round((1 / totalItems) * 100),
        currentFile: 'manifest.json',
        message: this.i18nService.t('settings.packingFile', { file: 'manifest.json' })
      });

      for (let i = 0; i < fileEntries.length; i++) {
        const entry = fileEntries[i];
        const current = i + 2;
        const percentage = Math.round((current / totalItems) * 100);

        zip.addLocalFile(entry.fullPath, path.dirname(entry.relativePath));

        this._sendProgress('on-export-progress', {
          phase: 'packing',
          current: current,
          total: totalItems,
          percentage,
          currentFile: entry.relativePath,
          message: this.i18nService.t('settings.packingFile', { file: entry.relativePath })
        });
      }

      zip.writeZip(outputPath);

      this._sendProgress('on-export-progress', {
        phase: 'packing',
        current: totalItems,
        total: totalItems,
        percentage: 100,
        currentFile: '',
        message: this.i18nService.t('settings.exportLogsSuccess')
      });

      return { success: true, path: outputPath };
    } catch (error) {
      this._sendProgress('on-export-progress', {
        phase: 'error',
        current: 0,
        total: 0,
        percentage: 0,
        currentFile: '',
        message: error.message
      });
      return { success: false, error: error.message };
    }
  }

  async importConfig(zipPath) {
    try {
      if (!fs.existsSync(zipPath)) {
        return { success: false, error: this.i18nService.t('settings.importConfigFailed') + ': file not found' };
      }

      this._sendProgress('on-import-progress', {
        phase: 'validating',
        current: 0,
        total: 0,
        percentage: 0,
        currentFile: '',
        message: this.i18nService.t('settings.validatingFile')
      });

      const zip = new AdmZip(zipPath);
      const zipEntries = zip.getEntries();

      const manifestEntry = zipEntries.find(e => e.entryName === 'manifest.json');
      if (!manifestEntry) {
        return { success: false, error: this.i18nService.t('settings.importConfigInvalid') };
      }

      let manifest;
      try {
        const manifestContent = manifestEntry.getData().toString('utf8');
        manifest = JSON.parse(manifestContent);
      } catch (e) {
        return { success: false, error: this.i18nService.t('settings.importConfigInvalid') };
      }

      if (manifest.app !== 'XKAutoTester' || manifest.type !== 'config') {
        return { success: false, error: this.i18nService.t('settings.importConfigInvalid') };
      }

      const configPath = this.userDataService.userConfigPath;
      if (!fs.existsSync(configPath)) {
        fs.mkdirSync(configPath, { recursive: true });
      }

      const entriesToExtract = zipEntries.filter(e => e.entryName !== 'manifest.json' && !e.isDirectory);
      const totalItems = entriesToExtract.length;

      if (totalItems === 0) {
        return { success: false, error: this.i18nService.t('settings.importConfigFailed') + ': empty archive' };
      }

      this._sendProgress('on-import-progress', {
        phase: 'extracting',
        current: 0,
        total: totalItems,
        percentage: 0,
        currentFile: '',
        message: this.i18nService.t('settings.importingConfig')
      });

      for (let i = 0; i < entriesToExtract.length; i++) {
        const entry = entriesToExtract[i];
        const current = i + 1;
        const percentage = Math.round((current / totalItems) * 100);

        const targetPath = path.join(configPath, entry.entryName);
        const targetDir = path.dirname(targetPath);

        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }

        const content = entry.getData();
        fs.writeFileSync(targetPath, content);

        this._sendProgress('on-import-progress', {
          phase: 'extracting',
          current: current,
          total: totalItems,
          percentage,
          currentFile: entry.entryName,
          message: this.i18nService.t('settings.extractingFile', { file: entry.entryName })
        });
      }

      this._sendProgress('on-import-progress', {
        phase: 'extracting',
        current: totalItems,
        total: totalItems,
        percentage: 100,
        currentFile: '',
        message: this.i18nService.t('settings.importConfigSuccess')
      });

      return { success: true, needRestart: true };
    } catch (error) {
      this._sendProgress('on-import-progress', {
        phase: 'error',
        current: 0,
        total: 0,
        percentage: 0,
        currentFile: '',
        message: error.message
      });
      return { success: false, error: error.message };
    }
  }

  _getAppVersion() {
    try {
      const versionPath = path.join(this.userDataService.projectRoot, 'version.json');
      if (fs.existsSync(versionPath)) {
        const versionData = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
        return versionData.version || '0.0.0';
      }
    } catch {}
    return '0.0.0';
  }
}

module.exports = DataTransferService;

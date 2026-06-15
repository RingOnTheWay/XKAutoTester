const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class UserDataService {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;

    const appDataPath = app.getPath('appData');
    this._defaultUserDataPath = path.join(appDataPath, 'Xkautotester');

    const customPath = this._readCustomDataPath();
    this.userDataPath = customPath || this._defaultUserDataPath;
    app.setPath('userData', this.userDataPath);

    this.userConfigPath = path.join(this.userDataPath, 'config');
    this.defaultConfigPath = path.join(projectRoot, 'config');
    this.versionFilePath = path.join(this.userDataPath, 'data-version.json');

    this.userFiles = [
      'config.json',
      'page_package.json',
      'test_plans.json',
      'scheduled_plans.json'
    ];

    this.userDirs = ['test_cases'];

    this._defaultConfigs = {
      'config.json': {
        LOG_CONFIG: {
          level: 'INFO',
          format: '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
          file_path: '.',
          max_bytes: 10485760,
          backup_count: 5
        },
        SCRCPY_PARAMS: {
          max_size: '1920',
          video_bit_rate: '8',
          max_fps: '60',
          video_codec: 'h264',
          always_on_top: true
        },
        APP_SETTINGS: {
          default_download_directory: '',
          dark_mode: false,
          theme_color: '#4CAF50',
          language: 'zh-CN',
          notification: {
            platform: 'none',
            dingtalk: {
              access_token: '',
              secret: ''
            }
          },
          autoCheckUpdate: false
        }
      },
      'page_package.json': {
        apps: []
      },
      'test_plans.json': [],
      'scheduled_plans.json': []
    };

    this._ensureUserDataDir();
    this._writeDataPathToRegistry();
  }

  _readCustomDataPath() {
    const markerPath = path.join(this._defaultUserDataPath, 'custom-data-path.json');
    if (fs.existsSync(markerPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
        if (data.customPath && fs.existsSync(path.join(data.customPath, 'config'))) {
          return data.customPath;
        }
      } catch {}
    }
    return null;
  }

  _ensureUserDataDir() {
    if (!fs.existsSync(this.userConfigPath)) {
      fs.mkdirSync(this.userConfigPath, { recursive: true });
    }
    for (const dir of this.userDirs) {
      const dirPath = path.join(this.userConfigPath, dir);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
    }
  }

  async runMigration() {
    await this._deleteOldPathIfNeeded();
    await this._migrateIfNeeded();
  }

  async _deleteOldPathIfNeeded() {
    const markerPath = path.join(this.userDataPath, 'old-path-to-delete.json');
    if (fs.existsSync(markerPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
        if (data.oldPath && data.oldPath !== this.userDataPath) {
          this._deleteOldPathCompletely(data.oldPath);
        }
        fs.unlinkSync(markerPath);
      } catch (error) {
        console.error('[UserDataService] 删除旧路径失败:', error);
      }
    }
  }

  _deleteOldPathCompletely(oldPath) {
    if (!fs.existsSync(oldPath)) return;

    const isDefaultPath = oldPath === this._defaultUserDataPath;
    let customPathMarker = null;
    let customPathMarkerContent = null;

    if (isDefaultPath) {
      const customPathMarkerPath = path.join(oldPath, 'custom-data-path.json');
      if (fs.existsSync(customPathMarkerPath)) {
        try {
          customPathMarkerContent = fs.readFileSync(customPathMarkerPath, 'utf8');
        } catch {}
      }
    }

    this._deleteDirectoryRecursive(oldPath);

    if (isDefaultPath && customPathMarkerContent) {
      try {
        fs.mkdirSync(oldPath, { recursive: true });
        fs.writeFileSync(path.join(oldPath, 'custom-data-path.json'), customPathMarkerContent, 'utf8');
      } catch (error) {
        console.error('[UserDataService] 恢复标记文件失败:', error);
      }
    }
  }

  _deleteUserDataOnly(dirPath) {
    if (!fs.existsSync(dirPath)) return;
    
    try {
      const configDir = path.join(dirPath, 'config');
      if (fs.existsSync(configDir)) {
        this._deleteDirectoryRecursive(configDir);
      }

      const versionFile = path.join(dirPath, 'data-version.json');
      if (fs.existsSync(versionFile)) {
        fs.unlinkSync(versionFile);
      }

      const entries = fs.readdirSync(dirPath);
      if (entries.length === 0) {
        fs.rmdirSync(dirPath);
      }
    } catch (error) {
      console.error(`[UserDataService] 删除用户数据 ${dirPath} 失败:`, error);
    }
  }

  _deleteDirectoryRecursive(dirPath) {
    if (!fs.existsSync(dirPath)) return;
    
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          this._deleteDirectoryRecursive(fullPath);
        } else {
          fs.unlinkSync(fullPath);
        }
      }
      fs.rmdirSync(dirPath);
    } catch (error) {
      console.error(`[UserDataService] 删除目录 ${dirPath} 失败:`, error);
    }
  }

  async _migrateIfNeeded() {
    const isFirstLaunch = !fs.existsSync(this.versionFilePath);

    if (isFirstLaunch) {
      await this._copyDefaultsToUserData();
      await this._migrateFromOldLocation();
    } else if (this._isVersionChanged()) {
      await this._smartMergeConfig();
    }

    this._updateVersionFile();
  }

  async _copyDefaultsToUserData() {
    for (const file of this.userFiles) {
      const src = path.join(this.defaultConfigPath, file);
      const dst = path.join(this.userConfigPath, file);
      if (fs.existsSync(dst)) continue;

      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dst);
      } else {
        this._generateDefaultConfig(file, dst);
      }
    }
  }

  _generateDefaultConfig(file, dst) {
    if (this._defaultConfigs[file]) {
      fs.writeFileSync(dst, JSON.stringify(this._defaultConfigs[file], null, 2), 'utf8');
    }
  }

  async _migrateFromOldLocation() {
    for (const file of this.userFiles) {
      const src = path.join(this.defaultConfigPath, file);
      const dst = path.join(this.userConfigPath, file);
      if (!fs.existsSync(src)) continue;

      try {
        const srcContent = fs.readFileSync(src, 'utf8');
        const srcData = JSON.parse(srcContent);
        if (this._isUserData(file, srcData)) {
          fs.copyFileSync(src, dst);
        }
      } catch {
        if (!fs.existsSync(dst)) {
          try { fs.copyFileSync(src, dst); } catch {}
        }
      }
    }

    const srcTestCases = path.join(this.defaultConfigPath, 'test_cases');
    const dstTestCases = path.join(this.userConfigPath, 'test_cases');
    if (fs.existsSync(srcTestCases)) {
      try {
        const files = fs.readdirSync(srcTestCases);
        for (const file of files) {
          if (file.endsWith('.json')) {
            const srcFile = path.join(srcTestCases, file);
            const dstFile = path.join(dstTestCases, file);
            if (!fs.existsSync(dstFile)) {
              fs.copyFileSync(srcFile, dstFile);
            }
          }
        }
      } catch {}
    }
  }

  _isUserData(file, data) {
    switch (file) {
      case 'page_package.json':
        return data.apps && data.apps.length > 0;
      case 'test_plans.json':
        return Array.isArray(data) && data.length > 0;
      case 'scheduled_plans.json':
        return Array.isArray(data) && data.length > 0;
      case 'config.json':
        return this._hasNonDefaultConfig(data);
      default:
        return false;
    }
  }

  _hasNonDefaultConfig(data) {
    const settings = data.APP_SETTINGS || {};
    return settings.language !== 'zh-CN' ||
           settings.dark_mode === true ||
           settings.theme_color !== '#4CAF50' ||
           (settings.notification && settings.notification.platform !== 'none');
  }

  async _smartMergeConfig() {
    const defaultConfigPath = path.join(this.defaultConfigPath, 'config.json');
    const userConfigPath = path.join(this.userConfigPath, 'config.json');

    if (!fs.existsSync(userConfigPath)) return;

    let defaultConfig;
    if (fs.existsSync(defaultConfigPath)) {
      try {
        defaultConfig = JSON.parse(fs.readFileSync(defaultConfigPath, 'utf8'));
      } catch (error) {
        console.error('[UserDataService] 读取默认配置失败:', error);
        return;
      }
    } else {
      defaultConfig = this._getDefaultConfig();
    }

    try {
      const userConfig = JSON.parse(fs.readFileSync(userConfigPath, 'utf8'));
      const mergedConfig = this._deepMerge(defaultConfig, userConfig);
      fs.writeFileSync(userConfigPath, JSON.stringify(mergedConfig, null, 2), 'utf8');
    } catch (error) {
      console.error('[UserDataService] 智能合并配置失败:', error);
    }
  }

  _getDefaultConfig() {
    return this._defaultConfigs['config.json'];
  }

  _deepMerge(defaultObj, userObj) {
    const result = { ...defaultObj };
    for (const key of Object.keys(userObj)) {
      if (key in result) {
        if (typeof result[key] === 'object' && typeof userObj[key] === 'object'
            && result[key] !== null && userObj[key] !== null
            && !Array.isArray(result[key]) && !Array.isArray(userObj[key])) {
          result[key] = this._deepMerge(result[key], userObj[key]);
        } else {
          result[key] = userObj[key];
        }
      } else {
        result[key] = userObj[key];
      }
    }
    return result;
  }

  _isVersionChanged() {
    try {
      const userData = JSON.parse(fs.readFileSync(this.versionFilePath, 'utf8'));
      const appVersion = this._getAppVersion();
      return userData.dataVersion !== appVersion;
    } catch {
      return true;
    }
  }

  _getAppVersion() {
    try {
      const versionPath = path.join(this.projectRoot, 'version.json');
      const data = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
      return data.version;
    } catch {
      return '0.0.0';
    }
  }

  _updateVersionFile() {
    const versionData = {
      dataVersion: this._getAppVersion(),
      lastMigrated: new Date().toISOString()
    };
    fs.writeFileSync(this.versionFilePath, JSON.stringify(versionData, null, 2), 'utf8');
  }

  getUserConfigPath() {
    return this.userConfigPath;
  }

  getProjectRoot() {
    return this.projectRoot;
  }

  getUserDataPath() {
    return this.userDataPath;
  }

  getDefaultUserDataPath() {
    return this._defaultUserDataPath;
  }

  async changeDataPath(newPath) {
    if (!newPath) {
      return { success: false, error: '目标路径不能为空' };
    }

    // 如果选择的目录名不是 XKAutoTester，自动追加 XKAutoTester 子目录
    // 防止迁移时误删同级其他文件
    if (path.basename(newPath) !== 'XKAutoTester') {
      newPath = path.join(newPath, 'XKAutoTester');
    }

    if (!fs.existsSync(newPath)) {
      fs.mkdirSync(newPath, { recursive: true });
    }

    const newConfigPath = path.join(newPath, 'config');
    if (!fs.existsSync(newConfigPath)) {
      fs.mkdirSync(newConfigPath, { recursive: true });
    }

    const markerDir = this._defaultUserDataPath;
    if (!fs.existsSync(markerDir)) {
      fs.mkdirSync(markerDir, { recursive: true });
    }

    const oldPath = this.userDataPath;
    if (oldPath && oldPath !== newPath) {
      await this._migrateConfigToNewPath(oldPath, newPath);

      const oldPathMarker = path.join(newPath, 'old-path-to-delete.json');
      fs.writeFileSync(oldPathMarker, JSON.stringify({ oldPath }, null, 2), 'utf8');
    }

    const markerPath = path.join(markerDir, 'custom-data-path.json');
    fs.writeFileSync(markerPath, JSON.stringify({ customPath: newPath }, null, 2), 'utf8');

    this.userDataPath = newPath;
    this.userConfigPath = newConfigPath;
    this.versionFilePath = path.join(newPath, 'data-version.json');
    app.setPath('userData', newPath);

    this._writeDataPathToRegistry(newPath);
    return { success: true };
  }

  async _migrateConfigToNewPath(oldPath, newPath) {
    const oldConfigPath = path.join(oldPath, 'config');
    const newConfigPath = path.join(newPath, 'config');

    if (!fs.existsSync(oldConfigPath)) return;

    for (const file of this.userFiles) {
      const src = path.join(oldConfigPath, file);
      const dst = path.join(newConfigPath, file);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dst);
      }
    }

    for (const dir of this.userDirs) {
      const srcDir = path.join(oldConfigPath, dir);
      const dstDir = path.join(newConfigPath, dir);
      if (fs.existsSync(srcDir)) {
        if (!fs.existsSync(dstDir)) {
          fs.mkdirSync(dstDir, { recursive: true });
        }
        try {
          const files = fs.readdirSync(srcDir);
          for (const file of files) {
            const srcFile = path.join(srcDir, file);
            const dstFile = path.join(dstDir, file);
            fs.copyFileSync(srcFile, dstFile);
          }
        } catch {}
      }
    }

    const oldVersionFile = path.join(oldPath, 'data-version.json');
    const newVersionFile = path.join(newPath, 'data-version.json');
    if (fs.existsSync(oldVersionFile)) {
      fs.copyFileSync(oldVersionFile, newVersionFile);
    }

    this._migrateLogsDir(oldPath, newPath);
  }

  _migrateLogsDir(oldPath, newPath) {
    const oldLogsPath = path.join(oldPath, 'logs');
    const newLogsPath = path.join(newPath, 'logs');

    if (!fs.existsSync(oldLogsPath)) return;

    this._copyDirectoryRecursive(oldLogsPath, newLogsPath);
  }

  _copyDirectoryRecursive(srcDir, dstDir) {
    if (!fs.existsSync(dstDir)) {
      fs.mkdirSync(dstDir, { recursive: true });
    }

    try {
      const entries = fs.readdirSync(srcDir, { withFileTypes: true });
      for (const entry of entries) {
        const srcPath = path.join(srcDir, entry.name);
        const dstPath = path.join(dstDir, entry.name);

        if (entry.isDirectory()) {
          this._copyDirectoryRecursive(srcPath, dstPath);
        } else {
          fs.copyFileSync(srcPath, dstPath);
        }
      }
    } catch (error) {
      console.error(`[UserDataService] 复制目录失败 ${srcDir}:`, error);
    }
  }

  async migrateDataToPath(newPath) {
    if (!newPath) {
      return { success: false, error: '目标路径不能为空' };
    }

    const newConfigDir = path.join(newPath, 'config');
    if (!fs.existsSync(newConfigDir)) {
      fs.mkdirSync(newConfigDir, { recursive: true });
    }

    for (const file of this.userFiles) {
      const src = path.join(this.userConfigPath, file);
      const dst = path.join(newConfigDir, file);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dst);
      }
    }

    for (const dir of this.userDirs) {
      const srcDir = path.join(this.userConfigPath, dir);
      const dstDir = path.join(newConfigDir, dir);
      if (fs.existsSync(srcDir)) {
        if (!fs.existsSync(dstDir)) {
          fs.mkdirSync(dstDir, { recursive: true });
        }
        try {
          const files = fs.readdirSync(srcDir);
          for (const file of files) {
            const srcFile = path.join(srcDir, file);
            const dstFile = path.join(dstDir, file);
            fs.copyFileSync(srcFile, dstFile);
          }
        } catch {}
      }
    }

    const srcVersion = this.versionFilePath;
    const dstVersion = path.join(newPath, 'data-version.json');
    if (fs.existsSync(srcVersion)) {
      fs.copyFileSync(srcVersion, dstVersion);
    }

    return { success: true };
  }

  async resetToDefaultPath() {
    if (!fs.existsSync(this._defaultUserDataPath)) {
      fs.mkdirSync(this._defaultUserDataPath, { recursive: true });
    }

    const defaultConfigPath = path.join(this._defaultUserDataPath, 'config');
    if (!fs.existsSync(defaultConfigPath)) {
      fs.mkdirSync(defaultConfigPath, { recursive: true });
    }

    const oldPath = this.userDataPath;
    if (oldPath && oldPath !== this._defaultUserDataPath) {
      await this._migrateConfigToNewPath(oldPath, this._defaultUserDataPath);

      const oldPathMarker = path.join(this._defaultUserDataPath, 'old-path-to-delete.json');
      fs.writeFileSync(oldPathMarker, JSON.stringify({ oldPath }, null, 2), 'utf8');
    }

    const markerPath = path.join(this._defaultUserDataPath, 'custom-data-path.json');
    if (fs.existsSync(markerPath)) {
      fs.unlinkSync(markerPath);
    }

    this.userDataPath = this._defaultUserDataPath;
    this.userConfigPath = defaultConfigPath;
    this.versionFilePath = path.join(this._defaultUserDataPath, 'data-version.json');
    app.setPath('userData', this._defaultUserDataPath);

    this._writeDataPathToRegistry(this._defaultUserDataPath);
    return { success: true };
  }

  _writeDataPathToRegistry(dataPath = null) {
    const pathToWrite = dataPath || this.userDataPath;
    try {
      const { execSync } = require('child_process');
      const escapedPath = pathToWrite.replace(/"/g, '\\"');
      execSync(`reg add "HKCU\\Software\\XKAutoTester" /v UserDataPath /t REG_SZ /d "${escapedPath}" /f`, {
        windowsHide: true
      });
    } catch (error) {
      console.error('[UserDataService] 写入注册表失败:', error);
    }
  }
}

module.exports = UserDataService;

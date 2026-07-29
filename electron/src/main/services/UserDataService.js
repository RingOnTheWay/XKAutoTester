const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const UserDataMigrator = require('./UserDataMigrator');
const WindowsRegistryBridge = require('./WindowsRegistryBridge');
const { ensureDirectoryExists } = require('../utils/pathHelper');

/**
 * UserDataService (重构后)
 *
 * 职责:
 *  - 路径解析 (projectRoot / userDataPath / userConfigPath / defaultUserDataPath)
 *  - 版本追踪 (_isVersionChanged / _getAppVersion / _updateVersionFile)
 *  - runMigration / changeDataPath / resetToDefaultPath 编排
 *
 * 委托:
 *  - 迁移逻辑 -> UserDataMigrator (this.migrator)
 *  - 注册表写入 -> WindowsRegistryBridge (this.registry)
 */
class UserDataService {
  constructor(projectRoot, versionService) {
    this.projectRoot = projectRoot;
    this.versionService = versionService;

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
      // config.json 不再硬编码, 权威源为 config/config.json 模板文件, 由 _getDefaultConfig() 运行时读取
      'page_package.json': {
        apps: []
      },
      'test_plans.json': [],
      'scheduled_plans.json': []
    };

    // 委托实例: 迁移 + 注册表
    this.migrator = new UserDataMigrator({
      userDataPath: this.userDataPath,
      userConfigPath: this.userConfigPath,
      defaultConfigPath: this.defaultConfigPath,
      versionFilePath: this.versionFilePath,
      defaultUserDataPath: this._defaultUserDataPath,
      userFiles: this.userFiles,
      userDirs: this.userDirs,
      defaultConfigs: this._defaultConfigs
    });

    this.registry = new WindowsRegistryBridge();

    this._ensureUserDataDir();
    this.registry.writePath('UserDataPath', this.userDataPath);
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
    ensureDirectoryExists(this.userConfigPath);
    for (const dir of this.userDirs) {
      ensureDirectoryExists(path.join(this.userConfigPath, dir));
    }
  }

  async runMigration() {
    await this.migrator.deleteOldPathIfNeeded();
    await this._migrateIfNeeded();
  }

  /**
   * 编排首次启动 / 版本变更时的迁移流程
   * - 首次启动: 拷贝默认配置 + 从旧位置迁移
   * - 版本变更: 智能合并配置
   * - 始终: 更新版本文件
   */
  async _migrateIfNeeded() {
    const isFirstLaunch = !fs.existsSync(this.versionFilePath);

    if (isFirstLaunch) {
      await this.migrator.copyDefaultsToUserData();
      await this.migrator.migrateFromOldLocation();
    } else if (this._isVersionChanged()) {
      await this.migrator.smartMergeConfig();
    }

    this._updateVersionFile();
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
    // 统一委托 VersionService（权威源 + 缓存）
    return this.versionService.getVersion();
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

    ensureDirectoryExists(newPath);

    const newConfigPath = path.join(newPath, 'config');
    ensureDirectoryExists(newConfigPath);

    const markerDir = this._defaultUserDataPath;
    ensureDirectoryExists(markerDir);

    const oldPath = this.userDataPath;
    if (oldPath && oldPath !== newPath) {
      await this.migrator.migrateConfigToNewPath(oldPath, newPath);

      const oldPathMarker = path.join(newPath, 'old-path-to-delete.json');
      fs.writeFileSync(oldPathMarker, JSON.stringify({ oldPath }, null, 2), 'utf8');
    }

    const markerPath = path.join(markerDir, 'custom-data-path.json');
    fs.writeFileSync(markerPath, JSON.stringify({ customPath: newPath }, null, 2), 'utf8');

    this.userDataPath = newPath;
    this.userConfigPath = newConfigPath;
    this.versionFilePath = path.join(newPath, 'data-version.json');
    app.setPath('userData', newPath);

    // 同步 migrator 内部路径
    this.migrator.updatePaths({
      userDataPath: this.userDataPath,
      userConfigPath: this.userConfigPath,
      versionFilePath: this.versionFilePath
    });

    this.registry.writePath('UserDataPath', newPath);
    return { success: true };
  }

  async migrateDataToPath(newPath) {
    return this.migrator.migrateDataToPath(newPath);
  }

  async resetToDefaultPath() {
    ensureDirectoryExists(this._defaultUserDataPath);

    const defaultConfigPath = path.join(this._defaultUserDataPath, 'config');
    ensureDirectoryExists(defaultConfigPath);

    const oldPath = this.userDataPath;
    if (oldPath && oldPath !== this._defaultUserDataPath) {
      await this.migrator.migrateConfigToNewPath(oldPath, this._defaultUserDataPath);

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

    // 同步 migrator 内部路径
    this.migrator.updatePaths({
      userDataPath: this.userDataPath,
      userConfigPath: this.userConfigPath,
      versionFilePath: this.versionFilePath
    });

    this.registry.writePath('UserDataPath', this._defaultUserDataPath);
    return { success: true };
  }
}

module.exports = UserDataService;

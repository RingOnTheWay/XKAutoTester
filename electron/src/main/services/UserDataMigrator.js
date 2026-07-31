/**
 * 用户数据迁移器
 * 从 UserDataService 抽出,专职文件迁移 / 默认配置生成 / 智能合并
 *
 * 不负责:
 *  - 版本追踪 (_isVersionChanged / _getAppVersion / _updateVersionFile) — 由 UserDataService 处理
 *  - Windows 注册表写入 — 由 WindowsRegistryBridge 处理
 *  - 路径解析 (custom-data-path.json marker 读取) — 由 UserDataService._readCustomDataPath 处理
 *
 * 共享 helper (复制自 UserDataService):
 *  - _getDefaultConfig (读 config/config.json 模板)
 *  - _copyDirectoryRecursive / _deleteDirectoryRecursive (文件操作工具)
 */
const fs = require('fs');
const path = require('path');

class UserDataMigrator {
    constructor(opts) {
        this.userDataPath = opts.userDataPath;
        this.userConfigPath = opts.userConfigPath;
        this.defaultConfigPath = opts.defaultConfigPath;
        this.versionFilePath = opts.versionFilePath;
        this.defaultUserDataPath = opts.defaultUserDataPath;
        this.userFiles = opts.userFiles;
        this.userDirs = opts.userDirs;
        this.defaultConfigs = opts.defaultConfigs;
    }

    /**
     * 当 userDataPath / userConfigPath / versionFilePath 在运行时变化时调用
     * (如 changeDataPath / resetToDefaultPath 之后)
     */
    updatePaths(opts) {
        if (opts.userDataPath !== undefined) this.userDataPath = opts.userDataPath;
        if (opts.userConfigPath !== undefined) this.userConfigPath = opts.userConfigPath;
        if (opts.versionFilePath !== undefined) this.versionFilePath = opts.versionFilePath;
    }

    // ─── 公共迁移入口 ──────────────────────────────────────────

    /**
     * 删除 old-path-to-delete.json 中标记的旧路径
     */
    async deleteOldPathIfNeeded() {
        const markerPath = path.join(this.userDataPath, 'old-path-to-delete.json');
        if (!fs.existsSync(markerPath)) return;
        try {
            const data = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
            if (data.oldPath && data.oldPath !== this.userDataPath) {
                this._deleteOldPathCompletely(data.oldPath);
            }
            fs.unlinkSync(markerPath);
        } catch (error) {
            console.error('[UserDataMigrator] 删除旧路径失败:', error);
        }
    }

    /**
     * 首次启动: 拷贝默认配置到 user data 目录
     */
    async copyDefaultsToUserData() {
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

    /**
     * 从旧位置 (defaultConfigPath, 即安装目录的 config/) 迁移用户数据到 user data
     */
    async migrateFromOldLocation() {
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

    /**
     * 版本变更时智能合并默认配置与用户配置
     */
    async smartMergeConfig() {
        const defaultConfigPath = path.join(this.defaultConfigPath, 'config.json');
        const userConfigPath = path.join(this.userConfigPath, 'config.json');

        if (!fs.existsSync(userConfigPath)) return;

        let defaultConfig;
        if (fs.existsSync(defaultConfigPath)) {
            try {
                defaultConfig = JSON.parse(fs.readFileSync(defaultConfigPath, 'utf8'));
            } catch (error) {
                console.error('[UserDataMigrator] 读取默认配置失败:', error);
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
            console.error('[UserDataMigrator] 智能合并配置失败:', error);
        }
    }

    /**
     * 将当前 user data 完整迁移到新路径 (用于 changeDataPath)
     */
    async migrateConfigToNewPath(oldPath, newPath) {
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

    /**
     * 迁移到指定路径 (用于 migrateDataToPath 公共 API)
     */
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

    // ─── 内部 helper ──────────────────────────────────────────

    _deleteOldPathCompletely(oldPath) {
        if (!fs.existsSync(oldPath)) return;

        const isDefaultPath = oldPath === this.defaultUserDataPath;
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
                console.error('[UserDataMigrator] 恢复标记文件失败:', error);
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
            console.error(`[UserDataMigrator] 删除用户数据 ${dirPath} 失败:`, error);
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
            console.error(`[UserDataMigrator] 删除目录 ${dirPath} 失败:`, error);
        }
    }

    _generateDefaultConfig(file, dst) {
        if (this.defaultConfigs[file]) {
            fs.writeFileSync(dst, JSON.stringify(this.defaultConfigs[file], null, 2), 'utf8');
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

    /**
     * 读取默认 config.json 模板 (复制自 UserDataService, 权威源为 config/config.json)
     */
    _getDefaultConfig() {
        const templatePath = path.join(this.defaultConfigPath, 'config.json');
        try {
            const content = fs.readFileSync(templatePath, 'utf8');
            return JSON.parse(content);
        } catch (error) {
            console.error('[UserDataMigrator] 读取 config.json 模板失败, 返回空配置:', error.message);
            return {};
        }
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
            console.error(`[UserDataMigrator] 复制目录失败 ${srcDir}:`, error);
        }
    }
}

module.exports = UserDataMigrator;

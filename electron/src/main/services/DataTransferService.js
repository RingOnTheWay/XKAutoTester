const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

// ── module-level 纯函数 (对称 H1 TestPlanService parsePytestIni/extractMarkersFromContent/inferTestType) ──

/**
 * 构建 manifest (从 exportConfig L66-72 + exportLogs L164-170 两处重复提取)
 * @param {'config'|'logs'} type
 * @param {string} version
 * @param {Array<{relativePath: string}>} fileEntries
 * @returns {{type, version, exportDate, files, app}}
 */
function buildManifest(type, version, fileEntries) {
  return {
    type,
    version,
    exportDate: new Date().toISOString(),
    files: fileEntries.map((e) => e.relativePath),
    app: 'XKAutoTester',
  };
}

/**
 * 构建 progress 结构 (从手写 5 次 → 1 处)
 * @param {string} phase - reading|packing|validating|extracting|error
 * @param {number} current
 * @param {number} total
 * @param {string} currentFile
 * @param {string} message
 * @returns {{phase, current, total, percentage, currentFile, message}}
 */
function buildProgress(phase, current, total, currentFile, message) {
  return {
    phase,
    current,
    total,
    percentage: total > 0 ? Math.round((current / total) * 100) : 0,
    currentFile,
    message,
  };
}

/**
 * 校验 manifest (从 importConfig 内联提取)
 * @param {object} manifest
 * @param {string} expectedType
 * @returns {boolean}
 */
function isValidManifest(manifest, expectedType) {
  return !!(manifest && manifest.app === 'XKAutoTester' && manifest.type === expectedType);
}

/**
 * 校验 zip 条目名是否安全 (防 zip-slip 路径穿越, 对称 R10 TarExtractor._sanitizeFileName)
 * 拒绝: `..` 段 / 绝对路径 (前导 / 或 \\) / Windows 盘符 / 空段
 * @param {string} entryName
 * @returns {boolean}
 */
function isSafeRelativePath(entryName) {
  if (!entryName || typeof entryName !== 'string') return false;
  // 盘符 / UNC / 前导分隔符 → 绝对路径
  if (/^[a-zA-Z]:[\\/]/.test(entryName) || entryName.startsWith('/') || entryName.startsWith('\\\\')) return false;
  const normalized = entryName.replace(/\\/g, '/');
  if (normalized === '' || normalized.startsWith('/')) return false;
  const segments = normalized.split('/');
  for (const seg of segments) {
    // 任一段为 .. 或空 (含尾斜杠/连续分隔符) 拒绝
    if (seg === '..' || seg === '') return false;
  }
  return true;
}

// ── 3 默认 factory (factory-or-default, 对称 H1 TestPlanService 3 factory) ──

/** 包装 fs 4 方法为 async 接口 (对称 H1 TestCaseService fileSystemFactory) */
const defaultFileSystemFactory = () => ({
  exists: async (p) => fs.existsSync(p),
  readdir: async (d) => fs.readdirSync(d, { withFileTypes: true }),
  mkdir: async (d) => fs.mkdirSync(d, { recursive: true }),
  writeFile: async (p, content) => fs.writeFileSync(p, content),
});

/** 包装 AdmZip 2 入口 (create 新建 / open 读取) */
const defaultZipFactory = () => ({
  create: () => new AdmZip(),
  open: (zipPath) => new AdmZip(zipPath),
});

/** mainWindow fallback (主路径 setMainWindow, 测试注入此 provider) */
const defaultMainWindowProvider = () => null;

// ── DataTransferService 类 ──

class DataTransferService {
  /**
   * @param {object} userDataService - 需 .userConfigPath + .userDataPath
   * @param {object} i18nService - 需 .t(key, opts)
   * @param {object} versionService - 需 .getVersion()
   * @param {object} [opts] - factory-or-default (全可选, 生产不传)
   * @param {Function} [opts.fileSystemFactory] - 默认包装 fs 4 async 方法
   * @param {Function} [opts.zipFactory] - 默认包装 AdmZip create/open
   * @param {Function} [opts.mainWindowProvider] - 默认返 null (测试注入 fake win)
   */
  constructor(userDataService, i18nService, versionService, opts = {}) {
    this.userDataService = userDataService;
    this.i18nService = i18nService;
    this.versionService = versionService;
    this._initialized = false;
    this._mainWindow = null;
    this._fileSystemFactory = opts.fileSystemFactory || defaultFileSystemFactory;
    this._zipFactory = opts.zipFactory || defaultZipFactory;
    this._mainWindowProvider = opts.mainWindowProvider || defaultMainWindowProvider;
  }

  // 懒初始化 (消除构造期 I/O, 对称 H1 _ensureInitialized)
  _ensureInitialized() {
    if (this._initialized) return;
    this._fs = this._fileSystemFactory();
    this._zip = this._zipFactory();
    this._initialized = true;
  }

  // 双路径保留 (setMainWindow 优先 + mainWindowProvider fallback)
  setMainWindow(mainWindow) {
    this._mainWindow = mainWindow;
  }

  // ── 公共方法 (4 签名零变, 对称 H1 公共方法零变) ──

  async exportConfig(outputPath) {
    return this._exportPath(this.userDataService.userConfigPath, 'config', outputPath, 'on-export-progress', {
      notFound: this.i18nService.t('settings.exportConfigFailed') + ': config path not found',
      empty: this.i18nService.t('settings.exportConfigFailed') + ': no files to export',
      packing: this.i18nService.t('settings.exportingConfig'),
      success: this.i18nService.t('settings.exportConfigSuccess'),
    });
  }

  async exportLogs(outputPath) {
    return this._exportPath(
      path.join(this.userDataService.userDataPath, 'logs'),
      'logs',
      outputPath,
      'on-export-progress',
      {
        notFound: this.i18nService.t('settings.noLogsToExport'),
        empty: this.i18nService.t('settings.noLogsToExport'),
        packing: this.i18nService.t('settings.exportingLogs'),
        success: this.i18nService.t('settings.exportLogsSuccess'),
      }
    );
  }

  async importConfig(zipPath) {
    this._ensureInitialized();
    const channel = 'on-import-progress';
    try {
      if (!(await this._fs.exists(zipPath))) {
        return {
          success: false,
          error: this.i18nService.t('settings.importConfigFailed') + ': file not found',
        };
      }

      this._sendProgress(channel, buildProgress('validating', 0, 0, '', this.i18nService.t('settings.validatingFile')));

      const zip = this._zip.open(zipPath);
      const zipEntries = zip.getEntries();
      const manifestEntry = zipEntries.find((e) => e.entryName === 'manifest.json');
      if (!manifestEntry) {
        return {
          success: false,
          error: this.i18nService.t('settings.importConfigInvalid'),
        };
      }

      let manifest;
      try {
        manifest = JSON.parse(manifestEntry.getData().toString('utf8'));
      } catch (e) {
        return {
          success: false,
          error: this.i18nService.t('settings.importConfigInvalid'),
        };
      }

      if (!isValidManifest(manifest, 'config')) {
        return {
          success: false,
          error: this.i18nService.t('settings.importConfigInvalid'),
        };
      }

      const configPath = this.userDataService.userConfigPath;
      if (!(await this._fs.exists(configPath))) {
        await this._fs.mkdir(configPath);
      }

      const entriesToExtract = zipEntries.filter((e) => e.entryName !== 'manifest.json' && !e.isDirectory);
      const totalItems = entriesToExtract.length;
      if (totalItems === 0) {
        return {
          success: false,
          error: this.i18nService.t('settings.importConfigFailed') + ': empty archive',
        };
      }

      this._sendProgress(
        channel,
        buildProgress('extracting', 0, totalItems, '', this.i18nService.t('settings.importingConfig'))
      );

      for (let i = 0; i < entriesToExtract.length; i++) {
        const entry = entriesToExtract[i];
        const current = i + 1;
        // zip-slip 防线: 拒绝 `..`/绝对路径/盘符 条目名 (对称 TarExtractor._sanitizeFileName)
        if (!isSafeRelativePath(entry.entryName)) {
          this._sendProgress(
            channel,
            buildProgress('error', 0, 0, entry.entryName, 'Unsafe path in archive: ' + entry.entryName)
          );
          return {
            success: false,
            error: this.i18nService.t('settings.importConfigInvalid') + ': unsafe path in archive',
          };
        }
        const targetPath = path.join(configPath, entry.entryName);
        // path.resolve 二次校验: 防 path.join 语义差异 (Windows 分隔符/盘符) 造成越界
        if (!path.resolve(targetPath).startsWith(path.resolve(configPath) + path.sep)) {
          this._sendProgress(
            channel,
            buildProgress('error', 0, 0, entry.entryName, 'Unsafe path in archive: ' + entry.entryName)
          );
          return {
            success: false,
            error: this.i18nService.t('settings.importConfigInvalid') + ': unsafe path in archive',
          };
        }
        const targetDir = path.dirname(targetPath);
        if (!(await this._fs.exists(targetDir))) {
          await this._fs.mkdir(targetDir);
        }
        await this._fs.writeFile(targetPath, entry.getData());
        this._sendProgress(
          channel,
          buildProgress(
            'extracting',
            current,
            totalItems,
            entry.entryName,
            this.i18nService.t('settings.extractingFile', {
              file: entry.entryName,
            })
          )
        );
      }

      this._sendProgress(
        channel,
        buildProgress('extracting', totalItems, totalItems, '', this.i18nService.t('settings.importConfigSuccess'))
      );

      return { success: true, needRestart: true };
    } catch (error) {
      this._sendProgress(channel, buildProgress('error', 0, 0, '', error.message));
      return { success: false, error: error.message };
    }
  }

  // ── 私有: 单一导出路径 (吸收 exportConfig + exportLogs 95% 重复 → 1 处) ──

  /**
   * 通用导出 (config + logs 共享)
   * @param {string} sourcePath - 要导出的源目录
   * @param {'config'|'logs'} manifestType
   * @param {string} outputPath - zip 输出路径
   * @param {string} progressChannel - 'on-export-progress'
   * @param {{notFound, empty, packing, success}} msgs - i18n 文案差异
   * @returns {Promise<{success, error?, path?}>}
   */
  async _exportPath(sourcePath, manifestType, outputPath, progressChannel, msgs) {
    this._ensureInitialized();
    try {
      if (!(await this._fs.exists(sourcePath))) {
        return { success: false, error: msgs.notFound };
      }

      this._sendProgress(
        progressChannel,
        buildProgress('reading', 0, 0, '', this.i18nService.t('settings.readingFiles'))
      );

      const allFiles = await this._collectFiles(sourcePath);
      const fileEntries = allFiles.filter((e) => e.type === 'file');
      if (fileEntries.length === 0) {
        return { success: false, error: msgs.empty };
      }

      const manifest = buildManifest(manifestType, this._getAppVersion(), fileEntries);
      const totalItems = fileEntries.length + 1;

      this._sendProgress(progressChannel, buildProgress('packing', 0, totalItems, '', msgs.packing));

      const zip = this._zip.create();
      zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'));

      this._sendProgress(
        progressChannel,
        buildProgress(
          'packing',
          1,
          totalItems,
          'manifest.json',
          this.i18nService.t('settings.packingFile', { file: 'manifest.json' })
        )
      );

      for (let i = 0; i < fileEntries.length; i++) {
        const entry = fileEntries[i];
        const current = i + 2;
        zip.addLocalFile(entry.fullPath, path.dirname(entry.relativePath));
        this._sendProgress(
          progressChannel,
          buildProgress(
            'packing',
            current,
            totalItems,
            entry.relativePath,
            this.i18nService.t('settings.packingFile', {
              file: entry.relativePath,
            })
          )
        );
      }

      zip.writeZip(outputPath);

      this._sendProgress(progressChannel, buildProgress('packing', totalItems, totalItems, '', msgs.success));

      return { success: true, path: outputPath };
    } catch (error) {
      this._sendProgress(progressChannel, buildProgress('error', 0, 0, '', error.message));
      return { success: false, error: error.message };
    }
  }

  // ── 私有 helpers ──

  /** 进度发送 (集中 mainWindow null + destroyed 检查 5 处 → 1 处) */
  _sendProgress(channel, data) {
    const win = this._mainWindow || this._mainWindowProvider();
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, data);
    }
  }

  /** 递归收集文件 (class method, 用 this._fs) */
  async _collectFiles(dirPath, basePath = '') {
    const results = [];
    if (!(await this._fs.exists(dirPath))) return results;

    const entries = await this._fs.readdir(dirPath);
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        results.push({ type: 'directory', fullPath, relativePath });
        results.push(...(await this._collectFiles(fullPath, relativePath)));
      } else {
        results.push({ type: 'file', fullPath, relativePath });
      }
    }
    return results;
  }

  _getAppVersion() {
    return this.versionService.getVersion();
  }
}

module.exports = {
  DataTransferService,
  buildManifest,
  buildProgress,
  isValidManifest,
  isSafeRelativePath,
};

/**
 * lastDialogPaths - 文件选择器"上次选择路径"记忆 (跨会话持久化)
 *
 * 用途: 每个文件选择器 (选择目录/文件/APK/导入导出) 默认定位到上次选择的路径,
 *       避免每次从系统默认目录重新导航。
 *
 * 存储: config.json 的 LAST_DIALOG_PATHS 字段, 与 GET_CONFIG/SAVE_CONFIG 共用同一文件。
 *       读-改-写经 asyncFs.withLock 串行化, 防止与 SAVE_CONFIG 并发写丢字段。
 *
 * 语义:
 *   - 选中目录 → 记住目录本身, 下次 defaultPath = 该目录
 *   - 选中文件 → 记住文件路径, 下次 defaultPath = 其父目录
 *   - 记住的路径已不存在 → 回退到其父目录; 父目录也不存在 → undefined (系统默认)
 */
const path = require('path');
const fs = require('fs');
const asyncFs = require('../../utils/asyncFs');

const STORAGE_KEY = 'LAST_DIALOG_PATHS';

class LastDialogPathsStore {
  constructor() {
    this._getConfigPath = null; // () => string|null, 动态取 config.json 路径 (changeDataPath 后自动生效)
    this._cache = {};
    this._loaded = false;
  }

  /**
   * 初始化: 传入 config.json 路径提供者
   * @param {() => string|null} getConfigPath
   */
  init(getConfigPath) {
    this._getConfigPath = typeof getConfigPath === 'function' ? getConfigPath : null;
    this._cache = {};
    this._loaded = false;
  }

  _configPath() {
    try {
      return this._getConfigPath ? this._getConfigPath() : null;
    } catch {
      return null;
    }
  }

  async _load() {
    if (this._loaded) return;
    this._loaded = true;
    const cfgPath = this._configPath();
    if (!cfgPath) return;
    try {
      if (await asyncFs.exists(cfgPath)) {
        const json = await asyncFs.readJson(cfgPath);
        const stored = json && json[STORAGE_KEY];
        this._cache = (stored && typeof stored === 'object' && !Array.isArray(stored)) ? stored : {};
      }
    } catch (e) {
      this._cache = {};
    }
  }

  /**
   * 把"记住的路径"转换为对话框 defaultPath (目录→自身, 文件→父目录, 不存在→逐级回退)
   * @param {string} remembered
   * @returns {string|undefined}
   */
  _resolveDefault(remembered) {
    if (!remembered) return undefined;
    const candidates = [];
    try {
      if (fs.existsSync(remembered)) {
        const stat = fs.statSync(remembered);
        candidates.push(remembered);
        if (!stat.isDirectory()) candidates.push(path.dirname(remembered));
      } else {
        candidates.push(path.dirname(remembered));
      }
    } catch (e) {
      candidates.push(path.dirname(remembered));
    }
    for (const c of candidates) {
      try {
        if (fs.existsSync(c) && fs.statSync(c).isDirectory()) return c;
      } catch (e) { /* ignore */ }
    }
    return undefined;
  }

  /**
   * 获取某选择器的默认打开路径
   * @param {string} key - IPC 通道名 (或任意唯一 key)
   * @returns {Promise<string|undefined>}
   */
  async getDefaultPath(key) {
    if (!key) return undefined;
    await this._load();
    return this._resolveDefault(this._cache[key]);
  }

  /**
   * 记录某选择器本次选中的路径并持久化
   * @param {string} key - IPC 通道名
   * @param {string} filePath - 选中的文件或目录绝对路径
   */
  async rememberPath(key, filePath) {
    if (!key || !filePath || !this._configPath()) return;
    await this._load();
    this._cache[key] = filePath;
    const cfgPath = this._configPath();
    try {
      await asyncFs.withLock(cfgPath, async () => {
        let json = {};
        if (await asyncFs.exists(cfgPath)) {
          try { json = await asyncFs.readJson(cfgPath); } catch (e) { json = {}; }
        }
        const prev = (json[STORAGE_KEY] && typeof json[STORAGE_KEY] === 'object' && !Array.isArray(json[STORAGE_KEY]))
          ? json[STORAGE_KEY]
          : {};
        json[STORAGE_KEY] = { ...prev, [key]: filePath };
        await asyncFs.writeJson(cfgPath, json);
      });
    } catch (e) {
      // 持久化失败不阻塞交互 (下次会话丢失记忆但功能正常)
      console.error('[lastDialogPaths] 持久化失败:', e);
    }
  }
}

module.exports = new LastDialogPathsStore();

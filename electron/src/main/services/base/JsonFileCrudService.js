// JsonFileCrudService — JSON 文件 CRUD 基类深模块。
//
// 藏 asyncFs 边界 + 目录保障 + JSON 解析兜底 + ID 生成。
// 1 factory-or-default (asyncFsFactory) + 1 idGenerator (对称 PagePackageService 2-factory)。
//
// 生产: new JsonFileCrudService(filePath, defaultData)  # 2 参
// 测试: new JsonFileCrudService(filePath, defaultData, { asyncFsFactory: fake, idGenerator: spy })

const path = require('path');
const asyncFs = require('../../utils/asyncFs');

/** @typedef {Object} AsyncFsPort
 * @property {(p: string) => Promise<boolean>} exists
 * @property {(p: string) => Promise<any>} readJson
 * @property {(p: string, data: any) => Promise<void>} writeJson
 * @property {(dir: string) => Promise<void>} ensureDir
 */
/** @typedef {Object} JsonFileCrudOptions
 * @property {() => AsyncFsPort} [asyncFsFactory] - 默认 `() => asyncFs`
 * @property {() => string} [idGenerator] - 默认 module-level defaultIdGenerator
 */

const defaultIdGenerator = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

class JsonFileCrudService {
  /**
   * @param {string} filePath
   * @param {any} [defaultData={}]
   * @param {JsonFileCrudOptions} [opts] - factory-or-default (全可选, 生产不传)
   */
  constructor(filePath, defaultData = {}, opts = {}) {
    this.filePath = filePath;
    this.defaultData = defaultData;
    this._asyncFsFactory = opts.asyncFsFactory || (() => asyncFs);
    this._idGenerator = opts.idGenerator || defaultIdGenerator;
    this._asyncFs = this._asyncFsFactory();
  }

  _generateId() {
    return this._idGenerator();
  }

  async getData() {
    try {
      if (await this._asyncFs.exists(this.filePath)) {
        return await this._asyncFs.readJson(this.filePath);
      }
      return JSON.parse(JSON.stringify(this.defaultData));
    } catch (error) {
      console.error(`读取数据失败 [${this.filePath}]:`, error);
      return JSON.parse(JSON.stringify(this.defaultData));
    }
  }

  async saveData(data) {
    try {
      const configDir = path.dirname(this.filePath);
      if (!(await this._asyncFs.exists(configDir))) {
        await this._asyncFs.ensureDir(configDir);
      }
      // asyncFs.writeJson 已改为原子写 (temp+rename), 这里无需额外锁
      await this._asyncFs.writeJson(this.filePath, data);
      return { success: true };
    } catch (error) {
      console.error(`保存数据失败 [${this.filePath}]:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 串行化 read-modify-write 序列, 防止并发丢更新。
   * 子类做 getData → mutate → saveData 时应包裹在此方法内:
   *   return this.withLock(async () => { const data = await this.getData(); ... await this.saveData(data); });
   */
  async withLock(fn) {
    const lock = asyncFs.getLock(this.filePath);
    return lock.withLock(fn);
  }

  /**
   * 切换 userConfigPath 后更新 filePath。
   * 子类若有额外路径 (如 TestCaseService.testCasesDir) 应覆盖此方法并调 super。
   * @param {string} userConfigPath
   * @param {string} [fileName] - 文件名 (默认沿用当前 filePath 的 basename)
   */
  updateConfigPath(userConfigPath, fileName) {
    const basename = fileName || path.basename(this.filePath);
    this.filePath = path.join(userConfigPath, basename);
  }

  _success(data) {
    return { success: true, data };
  }

  _error(message) {
    return { success: false, error: message };
  }
}

module.exports = { JsonFileCrudService };

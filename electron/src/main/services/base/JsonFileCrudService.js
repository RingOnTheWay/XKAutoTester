const path = require('path');
const asyncFs = require('../../utils/asyncFs');

class JsonFileCrudService {
  constructor(filePath, defaultData = {}) {
    this.filePath = filePath;
    this.defaultData = defaultData;
  }

  _generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  async getData() {
    try {
      if (await asyncFs.exists(this.filePath)) {
        return await asyncFs.readJson(this.filePath);
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
      if (!(await asyncFs.exists(configDir))) {
        await asyncFs.ensureDir(configDir);
      }
      await asyncFs.writeJson(this.filePath, data);
      return { success: true };
    } catch (error) {
      console.error(`保存数据失败 [${this.filePath}]:`, error);
      return { success: false, error: error.message };
    }
  }

  _success(data) {
    return { success: true, data };
  }

  _error(message) {
    return { success: false, error: message };
  }
}

module.exports = JsonFileCrudService;

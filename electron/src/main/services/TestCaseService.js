// TestCaseService — 测试用例深模块。
//
// 藏 fs.promises 6 方法散落 8 处 + ID/文件名 regex 硬编码 +
// TestCaseCodeGenerator 硬编码 new + 构造期 mkdir + pyFilePath 三处解析重复 +
// testCaseHandlers 双委托重复。
//
// 4 factory-or-default (对称 I18nService.js 3-factory + PagePackageService.js 2-factory +
// UpdateService.js 5-factory)。
//
// 生产: new TestCaseService(userConfigPath, projectRoot)  # 2 参, opts 默认 {}
// 测试: new TestCaseService(userConfigPath, projectRoot, { fileSystemFactory: fake, ... })
//
// 内部组织:
//   _ensureInitialized()        — 懒初始化 (首次 listTestCases/saveTestCase/cleanupOrphanedFiles 触发 ensureDir)
//   _resolvePyFilePath(caseData)— pyFilePath 解析 (4 处重复 → 1 处)
//   _readJsonFile/_writeJsonFile/_fileExists/_deleteFile — fs helper (藏 try-catch + fs 模板)
//   saveTestCase                — 内化条件生成 (若 pyOutputDir 存在调 codeGenerator, 失败吞错)
//   saveAndGenerate             — 强制生成 + 返双路径 (吸收 testCaseHandlers L45-62 双委托)

const fs = require('fs').promises;
const path = require('path');
const TestCaseCodeGenerator = require('./TestCaseCodeGenerator');

// ── module-level 纯函数 (对称 UpdateService compareVersions/normalizeUpdateError) ──

const defaultIdGenerator = () =>
  `tc_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 10)}`;

const defaultFileNameSanitizer = (raw) => {
  let name = raw || 'test_case';
  name = name.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_');
  return name.startsWith('test_') ? name : `test_${name}`;
};

// ── 4 默认 factory (factory-or-default, 对称 I18nService 3-factory + PagePackageService 2-factory + UpdateService 5-factory) ──

const defaultFileSystemFactory = () => ({
  ensureDir: (dir) => fs.mkdir(dir, { recursive: true }),
  readdir: (dir) => fs.readdir(dir),
  readFile: (p) => fs.readFile(p, 'utf8'),
  writeFile: (p, content) => fs.writeFile(p, content, 'utf8'),
  access: (p) => fs.access(p),
  unlink: (p) => fs.unlink(p),
});

const defaultCodeGeneratorFactory = (userConfigPath, projectRoot) =>
  new TestCaseCodeGenerator(userConfigPath, projectRoot);

// ── TestCaseService 类 ──

class TestCaseService {
  /**
   * @param {string} userConfigPath
   * @param {string} projectRoot
   * @param {Object} [opts] - factory-or-default (全可选, 生产不传)
   * @param {Function} [opts.fileSystemFactory] - 默认包装 fs.promises 6 方法
   * @param {Function} [opts.codeGeneratorFactory] - 默认 new TestCaseCodeGenerator
   * @param {Function} [opts.idGenerator] - 默认 tc_${Date.now()}_${random}
   * @param {Function} [opts.fileNameSanitizer] - 默认 regex + test_ 前缀
   */
  constructor(userConfigPath, projectRoot, opts = {}) {
    this.userConfigPath = userConfigPath;
    this.projectRoot = projectRoot;
    this.testCasesDir = path.join(userConfigPath, 'test_cases');
    this._initialized = false;  // 懒初始化 flag (对称 UpdateService._initialized)
    this._fileSystemFactory = opts.fileSystemFactory || defaultFileSystemFactory;
    this._codeGeneratorFactory = opts.codeGeneratorFactory || defaultCodeGeneratorFactory;
    this._idGenerator = opts.idGenerator || defaultIdGenerator;
    this._fileNameSanitizer = opts.fileNameSanitizer || defaultFileNameSanitizer;
    this._fileSystem = this._fileSystemFactory();
    this._codeGenerator = this._codeGeneratorFactory(userConfigPath, projectRoot);
  }

  // 懒初始化 (消除构造期 I/O, 对称 UpdateService._ensureInitialized)
  async _ensureInitialized() {
    if (this._initialized) return;
    try {
      await this._fileSystem.ensureDir(this.testCasesDir);
    } catch (error) {
      console.error('创建测试用例目录失败:', error);
    }
    this._initialized = true;
  }

  // pyFilePath 解析 (4 处重复 → 1 处: listTestCases/deleteTestCase/cleanupOrphanedFiles/checkPyFileExists)
  _resolvePyFilePath(caseData) {
    if (!caseData) return null;
    if (caseData.pyFilePath) return caseData.pyFilePath;
    if (caseData.pyOutputDir && caseData.fileName) {
      return path.join(caseData.pyOutputDir, `${caseData.fileName}.py`);
    }
    return null;
  }

  // ── fs helper (藏 try-catch + fs 模板, 对称 PagePackageService _applyQuery/_applyMutation) ──

  async _readJsonFile(filePath) {
    try {
      const content = await this._fileSystem.readFile(filePath);
      return { data: JSON.parse(content) };
    } catch (error) {
      return { error };
    }
  }

  async _writeJsonFile(filePath, data) {
    try {
      await this._fileSystem.writeFile(filePath, JSON.stringify(data, null, 2));
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async _fileExists(filePath) {
    try {
      await this._fileSystem.access(filePath);
      return true;
    } catch (e) {
      return false;
    }
  }

  async _deleteFile(filePath) {
    try {
      await this._fileSystem.unlink(filePath);
      return true;
    } catch (e) {
      return false;  // 吞 ENOENT
    }
  }

  // ── 公共方法 (8 原方法零变 + 1 新增 saveAndGenerate) ──

  /**
   * 获取所有测试用例列表
   */
  async listTestCases() {
    try {
      await this._ensureInitialized();
      const files = await this._fileSystem.readdir(this.testCasesDir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      const results = await Promise.all(jsonFiles.map(async (file) => {
        const filePath = path.join(this.testCasesDir, file);
        const { data: testCase, error } = await this._readJsonFile(filePath);
        if (error) return null;
        return {
          id: testCase.id,
          name: testCase.name,
          fileName: testCase.fileName,
          description: testCase.description,
          targetApp: testCase.targetApp?.name,
          stepCount: testCase.steps?.length || 0,
          created: testCase.created,
          updated: testCase.updated,
          hasPyFile: await this.checkPyFileExists(testCase),
          pyFilePath: testCase.pyFilePath || ''
        };
      }));

      const testCases = results.filter(item => item !== null);
      return { success: true, data: testCases };
    } catch (error) {
      console.error('获取测试用例列表失败:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 获取单个测试用例
   */
  async getTestCase(fileName) {
    const filePath = path.join(this.testCasesDir, `${fileName}.json`);
    const { data: testCase, error } = await this._readJsonFile(filePath);
    if (error) {
      if (error.code === 'ENOENT') {
        return { success: false, error: '测试用例不存在' };
      }
      return { success: false, error: error.message };
    }
    return { success: true, data: testCase };
  }

  /**
   * 保存测试用例 (仅写 JSON, 不生成 .py)
   * 内化条件生成在 saveTestCase 中触发: 若 caseData.pyOutputDir 存在则调 generatePythonFile (失败吞错)
   * H3: 由 service 自己 set caseData.pyFilePath (原由 generator mutation, 现 generator 不再 mutation)
   * (吸收 testCaseHandlers L11-27 双委托)
   */
  async saveTestCase(caseData) {
    try {
      // 内化条件生成 (吸收 testCaseHandlers L11-27 双委托)
      let pyPath = null;
      if (caseData.pyOutputDir) {
        try {
          const genResult = await this._codeGenerator.generatePythonFile(caseData, caseData.pyOutputDir);
          if (genResult.success) {
            pyPath = genResult.path || null;
            // H3: 由 service 负责 set pyFilePath (原由 generator mutation, 现 generator 不 mutation)
            caseData.pyFilePath = pyPath;
          }
        } catch (e) {
          console.error('同步更新Python文件失败:', e);
        }
      }

      // H3: 生成后再保存 JSON (单源写入, 含 pyFilePath)
      const saveResult = await this._saveOnly(caseData);
      if (!saveResult.success) {
        return saveResult;
      }

      return { success: true, data: caseData, path: saveResult.path, pyPath };
    } catch (error) {
      console.error('保存测试用例失败:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 仅保存 JSON (不触发条件生成), 供 saveTestCase + saveAndGenerate 共享
   * @param {Object} caseData
   * @returns {Promise<{success, data?, path?, error?}>}
   */
  async _saveOnly(caseData) {
    await this._ensureInitialized();

    // ID + 时间戳
    if (!caseData.id) {
      caseData.id = this._idGenerator();
    }
    caseData.updated = new Date().toISOString();
    if (!caseData.created) {
      caseData.created = caseData.updated;
    }

    // 文件名清理
    caseData.fileName = this._fileNameSanitizer(caseData.fileName);

    // 写 JSON
    const jsonPath = path.join(this.testCasesDir, `${caseData.fileName}.json`);
    const writeResult = await this._writeJsonFile(jsonPath, caseData);
    if (!writeResult.success) {
      return writeResult;
    }

    return { success: true, data: caseData, path: jsonPath };
  }

  /**
   * 保存 + 强制生成 (吸收 testCaseHandlers L45-62 双委托)
   * H3: 生成在前, 保存 JSON 在后 (单源写入, 含 pyFilePath)
   * A2: 不 mutation 入参 caseData, 内部用副本 enriched 操作 (原对象保持不变)
   * @param {Object} caseData
   * @param {string} outputDir
   * @returns {Promise<{success, data?, jsonPath?, pyPath?, error?}>}
   */
  async saveAndGenerate(caseData, outputDir) {
    try {
      // A2: 用副本操作, 不 mutation 调用方传入的 caseData
      const enriched = { ...caseData, pyOutputDir: outputDir };
      const genResult = await this._codeGenerator.generatePythonFile(enriched, outputDir);
      if (!genResult.success) {
        return genResult;
      }
      enriched.pyFilePath = genResult.path;

      // H3: 后保存 JSON (单源写入, 含 pyOutputDir + pyFilePath)
      const saveResult = await this._saveOnly(enriched);
      if (!saveResult.success) {
        return saveResult;
      }

      return {
        success: true,
        data: saveResult.data,
        jsonPath: saveResult.path,
        pyPath: genResult.path
      };
    } catch (error) {
      console.error('保存并生成失败:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 删除测试用例
   * @param {string|Object} param - 文件名或包含 fileName 和 pyFilePath 的对象
   */
  async deleteTestCase(param) {
    let fileName;
    let providedPyFilePath = null;

    if (typeof param === 'string') {
      fileName = param;
    } else if (param && typeof param === 'object') {
      fileName = param.fileName;
      providedPyFilePath = param.pyFilePath || null;
    } else {
      return { success: false, error: '无效的参数' };
    }

    try {
      const jsonPath = path.join(this.testCasesDir, `${fileName}.json`);
      const jsonExists = await this._fileExists(jsonPath);

      if (!jsonExists && !providedPyFilePath) {
        return { success: false, error: '测试用例不存在且未提供Python文件路径' };
      }

      let pyFilePath = providedPyFilePath;
      if (jsonExists) {
        const { data: caseData } = await this._readJsonFile(jsonPath);
        if (caseData && !pyFilePath) {
          pyFilePath = this._resolvePyFilePath(caseData);
        }
        await this._deleteFile(jsonPath);
      }

      if (pyFilePath) {
        await this._deleteFile(pyFilePath);  // 吞 ENOENT
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 生成 Python 测试文件
   * 委托给 TestCaseCodeGenerator
   */
  async generatePythonFile(caseData, outputDir) {
    return this._codeGenerator.generatePythonFile(caseData, outputDir);
  }

  async checkPyFileExists(caseData) {
    const pyFilePath = this._resolvePyFilePath(caseData);
    if (!pyFilePath) return false;
    return this._fileExists(pyFilePath);
  }

  async checkJsonExists(fileName) {
    const jsonPath = path.join(this.testCasesDir, `${fileName}.json`);
    return this._fileExists(jsonPath);
  }

  async batchCheckJsonExists(fileNames) {
    const results = {};
    await Promise.all(fileNames.map(async (fileName) => {
      results[fileName] = await this.checkJsonExists(fileName);
    }));
    return results;
  }

  async cleanupOrphanedFiles() {
    await this._ensureInitialized();

    const results = { cleanedJson: [], orphanedPy: [] };
    const files = await this._fileSystem.readdir(this.testCasesDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    const validFileNames = new Set();
    const checkedDirs = new Set();
    const parsedCases = [];

    for (const jsonFile of jsonFiles) {
      const jsonPath = path.join(this.testCasesDir, jsonFile);
      const { data: caseData, error } = await this._readJsonFile(jsonPath);
      if (error) {
        await this._deleteFile(jsonPath);
        results.cleanedJson.push(jsonFile);
        continue;
      }

      const fileName = caseData.fileName || jsonFile.replace('.json', '');
      const pyFilePath = this._resolvePyFilePath(caseData);

      if (pyFilePath) {
        const pyExists = await this._fileExists(pyFilePath);
        if (!pyExists) {
          await this._deleteFile(jsonPath);
          results.cleanedJson.push(jsonFile);
          continue;
        }
      }

      validFileNames.add(fileName);
      parsedCases.push(caseData);
    }

    for (const caseData of parsedCases) {
      const outputDir = caseData.pyOutputDir;
      if (!outputDir || checkedDirs.has(outputDir)) continue;
      checkedDirs.add(outputDir);

      const dirExists = await this._fileExists(outputDir);
      if (!dirExists) continue;

      const pyFiles = await this._fileSystem.readdir(outputDir);
      for (const pyFile of pyFiles) {
        if (pyFile.startsWith('test_') && pyFile.endsWith('.py')) {
          const fileName = pyFile.replace('.py', '');
          if (!validFileNames.has(fileName)) {
            results.orphanedPy.push({
              fileName: fileName,
              pyFile: pyFile,
              outputDir: outputDir
            });
          }
        }
      }
    }

    return results;
  }
}

module.exports = { TestCaseService };

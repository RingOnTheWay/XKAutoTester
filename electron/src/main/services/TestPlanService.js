const path = require('path');
const asyncFs = require('../utils/asyncFs');
const { JsonFileCrudService } = require('./base/JsonFileCrudService');

// ── module-level 常量 (对称 EnvironmentService REQUIRED_PYTHON_VERSION 等 7 const) ──

const MARKER_DESCRIPTIONS = {
  'smoke': '冒烟测试',
  'unit': '单元功能测试',
  'exception': '异常场景测试',
  'critical': '关键功能测试',
  'appium': 'Appium移动端测试',
  'playwright': 'Playwright测试'
};

const DEFAULT_TEST_TYPE = 'unit';

// ── module-level 纯函数 (对称 EnvironmentService parsePyprojectDependencies/extractPackageName/checkMissingPackages/buildPythonConfig) ──

/**
 * 推断测试文件类型
 * @param {string} fileName
 * @returns {string} 'unit'|'appium'|'playwright'|'status'
 */
function inferTestType(fileName) {
  if (fileName.includes('appium')) return 'appium';
  if (fileName.includes('playwright')) return 'playwright';
  if (fileName.includes('check_app_status')) return 'status';
  return DEFAULT_TEST_TYPE;
}

/**
 * 从 .py 内容提取 @pytest.mark.X 标记名集合
 * @param {string} content
 * @returns {Set<string>}
 */
function extractMarkersFromContent(content) {
  const markers = new Set();
  const markerRegex = /@pytest\.mark\.(\w+)/g;
  let match;
  while ((match = markerRegex.exec(content)) !== null) {
    markers.add(match[1]);
  }
  return markers;
}

/**
 * 解析单行 marker 定义 (从 class method 提取, 签名保留 mutate 风格)
 * @param {string} line
 * @param {Array<{name: string, description: string}>} markers - 输出数组 (mutate)
 */
function parseMarkersLine(line, markers) {
  const parts = line.split(':');
  if (parts.length >= 2) {
    const name = parts[0].trim();
    const description = parts.slice(1).join(':').trim();
    if (name) {
      markers.push({ name, description });
    }
  }
}

/**
 * 解析 pytest.ini markers 块 (从 getPytestMarkers 60 行 inline 提取)
 * @param {string} content
 * @returns {{name: string, description: string}[]}
 */
function parsePytestIni(content) {
  const markers = [];
  const lines = content.split('\n');
  let inPytestSection = false;
  let inMarkersBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    if (trimmedLine === '[tool:pytest]' || trimmedLine === '[pytest]') {
      inPytestSection = true;
      inMarkersBlock = false;
      continue;
    }

    if (trimmedLine.startsWith('[') && trimmedLine.endsWith(']')) {
      inPytestSection = false;
      inMarkersBlock = false;
      continue;
    }

    if (inPytestSection) {
      if (trimmedLine.startsWith('markers')) {
        const equalIndex = trimmedLine.indexOf('=');
        if (equalIndex !== -1) {
          const afterEqual = trimmedLine.substring(equalIndex + 1).trim();
          if (afterEqual) {
            parseMarkersLine(afterEqual, markers);
          }
          inMarkersBlock = true;
        }
        continue;
      }

      if (inMarkersBlock) {
        const isIndented = line.length > 0 && (line[0] === ' ' || line[0] === '\t');
        if (isIndented && trimmedLine && trimmedLine.includes(':')) {
          parseMarkersLine(trimmedLine, markers);
          continue;
        }
        if (trimmedLine && !isIndented) {
          inMarkersBlock = false;
        }
      }
    }
  }

  return markers;
}

// ── 3 默认 factory (factory-or-default, 对称 I18nService 3-factory) ──

const defaultFileSystemFactory = () => ({
  exists: (p) => asyncFs.exists(p),
  stat: (p) => asyncFs.stat(p),
  readdir: (d) => asyncFs.readdir(d),
  readFile: (p) => asyncFs.readFile(p),
  rm: (p, opts) => asyncFs.rm(p, opts),
});

const defaultCwdProvider = () => process.cwd();

const defaultLoggerFactory = () => ({
  error: (...args) => console.error(...args),
});

// ── TestPlanService 类 ──

class TestPlanService extends JsonFileCrudService {
  /**
   * @param {string} userConfigPath
   * @param {string} projectRoot
   * @param {Object} [opts] - factory-or-default (全可选, 生产不传)
   * @param {() => Object} [opts.fileSystemFactory] - 默认包装 asyncFs 4 方法
   * @param {() => string} [opts.cwdProvider] - 默认 process.cwd
   * @param {() => {error: Function}} [opts.loggerFactory] - 默认 console.error
   * @param {Object<string, string>} [opts.markerDescriptions] - 默认 MARKER_DESCRIPTIONS const
   */
  constructor(userConfigPath, projectRoot, opts = {}) {
    const testPlansPath = path.join(userConfigPath, 'test_plans.json');
    super(testPlansPath, [], opts);  // 透传 opts.asyncFsFactory + opts.idGenerator 给 base
    this.projectRoot = projectRoot;
    this._initialized = false;  // 懒初始化 flag (对称 TestCaseService/EnvironmentService)
    this._fileSystemFactory = opts.fileSystemFactory || defaultFileSystemFactory;
    this._cwdProvider = opts.cwdProvider || defaultCwdProvider;
    this._loggerFactory = opts.loggerFactory || defaultLoggerFactory;
    this._markerDescriptions = opts.markerDescriptions || MARKER_DESCRIPTIONS;
  }

  // 懒初始化 (消除构造期 I/O, 对称 UpdateService/TestCaseService/EnvironmentService)
  _ensureInitialized() {
    if (this._initialized) return;
    this._fs = this._fileSystemFactory();
    this._logger = this._loggerFactory();
    this._initialized = true;
  }

  // ── 11 公共方法 (签名零变) ──

  async getTestPlans() {
    return this.getData();
  }

  async updateRunReportPath(testPlanName, reportPath) {
    try {
      const plans = await this.getData();
      const plan = plans.find(p => p.name === testPlanName);
      if (!plan || !plan.runs || plan.runs.length === 0) {
        return { success: false, error: '未找到测试计划或运行记录' };
      }
      plan.runs[plan.runs.length - 1].report_path = reportPath;
      await this.saveData(plans);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 单源化: 记录一次测试运行 (追加 run + 更新 last_run)。
   * Python 端不再直写 test_plans.json, 改为通过 stdout 标记行通知 Electron 由本方法统一写。
   * 不创建新 plan (用户必须先在 UI 创建 plan, 消除 Python 创建无 id plan 的死代码路径)。
   * @param {string} testPlanName
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async recordRun(testPlanName) {
    this._ensureInitialized();
    try {
      const plans = await this.getData();
      const plan = plans.find(p => p.name === testPlanName);
      if (!plan) {
        this._logger.error(`recordRun: 测试计划 '${testPlanName}' 不存在, 跳过运行记录`);
        return { success: false, error: '未找到测试计划' };
      }
      if (!Array.isArray(plan.runs)) plan.runs = [];
      // 本地时间, 格式对齐 Python %Y-%m-%d %H:%M:%S
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} `
        + `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
      plan.runs.push({ report_path: null, timestamp });
      // 截断至 100 条 (对称 Python Caps.max_runs_per_plan)
      if (plan.runs.length > 100) plan.runs = plan.runs.slice(-100);
      plan.last_run = timestamp;
      await this.saveData(plans);
      return { success: true };
    } catch (error) {
      this._logger.error('记录测试计划运行失败:', error);
      return { success: false, error: error.message };
    }
  }

  async saveTestPlan(planData) {
    this._ensureInitialized();
    try {
      let existingPlans = await this.getData();
      const index = existingPlans.findIndex(p => p.name === planData.name);
      if (index >= 0) {
        planData.id = existingPlans[index].id || this._generateId();
        existingPlans[index] = planData;
      } else {
        planData.id = planData.id || this._generateId();
        existingPlans.push(planData);
      }
      await this.saveData(existingPlans);
      return { success: true };
    } catch (error) {
      this._logger.error('保存测试计划失败:', error);
      return { success: false, error: error.message };
    }
  }

  async updateTestPlan(planData) {
    this._ensureInitialized();
    try {
      let existingPlans = await this.getData();
      const index = existingPlans.findIndex(p => p.id === planData.id);
      if (index >= 0) {
        const originalPlan = existingPlans[index];
        planData.created = originalPlan.created || planData.created;
        planData.id = originalPlan.id;
        existingPlans[index] = planData;
        await this.saveData(existingPlans);
        return { success: true };
      } else {
        return { success: false, error: '未找到测试计划' };
      }
    } catch (error) {
      this._logger.error('更新测试计划失败:', error);
      return { success: false, error: error.message };
    }
  }

  async deleteTestPlan(planId) {
    this._ensureInitialized();
    try {
      let existingPlans = await this.getData();
      const index = existingPlans.findIndex(p => p.id === planId);
      if (index >= 0) {
        existingPlans.splice(index, 1);
        await this.saveData(existingPlans);
        return { success: true };
      } else {
        return { success: false, error: '未找到测试计划' };
      }
    } catch (error) {
      this._logger.error('删除测试计划失败:', error);
      return { success: false, error: error.message };
    }
  }

  async getTestPlanRuns(testPlanName) {
    this._ensureInitialized();
    try {
      if (!(await this._fs.exists(this.filePath))) {
        return { success: false, error: '测试计划文件不存在', runs: [] };
      }
      const plans = await this.getData();
      const plan = plans.find(p => p.name === testPlanName);
      if (!plan) {
        return { success: false, error: '未找到指定测试计划', runs: [] };
      }
      const runs = plan.runs || [];
      const sortedRuns = runs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      const total = sortedRuns.length;
      const processedRuns = await Promise.all(sortedRuns.map(async (run, index) => {
        const reportExists = run.report_path && await this._fs.exists(run.report_path);
        return {
          // 序号: 最新为最大 (倒序)。index=0 (最新) -> total, index=total-1 (最早) -> 1
          index: total - index,
          timestamp: run.timestamp,
          reportPath: run.report_path,
          available: reportExists,
          isLatest: index === 0
        };
      }));
      return { success: true, runs: processedRuns };
    } catch (error) {
      this._logger.error('获取测试计划运行记录失败:', error);
      return { success: false, error: error.message, runs: [] };
    }
  }

  /**
   * 删除指定测试计划的某次运行记录及其 Allure 报告目录
   * @param {string} testPlanName - 测试计划名
   * @param {string} identifier - 运行记录标识 (reportPath 或 timestamp, 前者优先)
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async deleteReportRun(testPlanName, identifier) {
    try {
      const plans = await this.getData();
      const plan = plans.find(p => p.name === testPlanName);
      if (!plan) {
        return { success: false, error: '未找到指定测试计划' };
      }
      const runs = plan.runs || [];
      // 优先用 report_path 匹配, 其次用 timestamp (报告已删除的记录 report_path 可能为 null)
      const targetRun = runs.find(r => (r.report_path && r.report_path === identifier) || r.timestamp === identifier);
      if (!targetRun) {
        return { success: false, error: '未找到指定的运行记录' };
      }

      // 删除 Allure 报告目录 (文件系统, 若存在)
      if (targetRun.report_path) {
        try {
          if (await this._fs.exists(targetRun.report_path)) {
            await this._fs.rm(targetRun.report_path, { recursive: true, force: true });
          }
        } catch (e) {
          this._logger.error(`删除报告目录失败: ${targetRun.report_path}: ${e.message}`);
        }
      }

      // 从 runs 数组中移除该记录 (用 timestamp 唯一匹配, 避免 report_path=null 误删多条)
      plan.runs = runs.filter(r => r.timestamp !== targetRun.timestamp);
      await this.saveData(plans);
      console.log(`[TestPlanService] 已删除测试计划 '${testPlanName}' 的运行记录: ${targetRun.timestamp}`);
      return { success: true };
    } catch (error) {
      this._logger.error('删除测试计划运行记录失败:', error);
      return { success: false, error: error.message };
    }
  }

  async scanTestFiles(directoryPath) {
    this._ensureInitialized();
    try {
      if (!directoryPath) return [];
      if (!(await this._fs.exists(directoryPath))) return [];
      const dirStat = await this._fs.stat(directoryPath);
      if (!dirStat.isDirectory()) return [];
      return await this._scanDir(directoryPath);
    } catch (error) {
      return [];
    }
  }

  // 单目录扫描私有 helper (吸收 2 处 scan loop 重复)
  async _scanDir(dirPath) {
    const files = await this._fs.readdir(dirPath);
    const testFiles = [];
    for (const file of files) {
      if (file.endsWith('.py') && file !== '__pycache__') {
        const filePath = path.join(dirPath, file);
        const stats = await this._fs.stat(filePath);
        if (stats.isFile()) {
          testFiles.push({
            name: file,
            path: filePath,
            type: inferTestType(file)
          });
        }
      }
    }
    return testFiles;
  }

  async extractPytestMarkers(filePaths) {
    this._ensureInitialized();
    try {
      const markers = new Set();
      for (const filePath of filePaths) {
        let fullPath = filePath;
        if (!path.isAbsolute(filePath)) {
          fullPath = path.join(this.projectRoot, filePath);
        }
        if (!(await this._fs.exists(fullPath))) {
          continue;
        }
        const content = await this._fs.readFile(fullPath);
        const found = extractMarkersFromContent(content);
        for (const m of found) {
          markers.add(m);
        }
      }
      const foundMarkers = Array.from(markers).map(markerName => ({
        name: markerName,
        description: this._markerDescriptions[markerName] || `${markerName}测试`
      }));
      return foundMarkers;
    } catch (error) {
      return [];
    }
  }

  async getPytestMarkers() {
    this._ensureInitialized();
    try {
      const pytestIniPath = path.join(this.projectRoot, 'config', 'pytest.ini');
      if (!(await this._fs.exists(pytestIniPath))) {
        this._logger.error('pytest.ini文件不存在');
        return [];
      }
      const content = await this._fs.readFile(pytestIniPath);
      return parsePytestIni(content);
    } catch (error) {
      this._logger.error('读取pytest标记失败:', error);
      return [];
    }
  }

  // 保留为 method (caller 零变), 内部委托 module-level parseMarkersLine
  parseMarkersLine(line, markers) {
    parseMarkersLine(line, markers);
  }
}

module.exports = {
  TestPlanService,
  parsePytestIni,
  extractMarkersFromContent,
  inferTestType,
  parseMarkersLine,
  MARKER_DESCRIPTIONS
};

const path = require('path');
const asyncFs = require('../utils/asyncFs');
const JsonFileCrudService = require('./base/JsonFileCrudService');

class TestPlanService extends JsonFileCrudService {
  constructor(userConfigPath, projectRoot) {
    const testPlansPath = path.join(userConfigPath, 'test_plans.json');
    super(testPlansPath, []);
    this.projectRoot = projectRoot;
  }

  async getTestPlans() {
    return this.getData();
  }

  async saveTestPlan(planData) {
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
      console.error('保存测试计划失败:', error);
      return { success: false, error: error.message };
    }
  }

  async updateTestPlan(planData) {
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
      console.error('更新测试计划失败:', error);
      return { success: false, error: error.message };
    }
  }

  async deleteTestPlan(planId) {
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
      console.error('删除测试计划失败:', error);
      return { success: false, error: error.message };
    }
  }

  async getTestPlanRuns(testPlanName) {
    try {
      if (!(await asyncFs.exists(this.filePath))) {
        return { success: false, error: '测试计划文件不存在', runs: [] };
      }

      const plans = await this.getData();

      const plan = plans.find(p => p.name === testPlanName);
      if (!plan) {
        return { success: false, error: '未找到指定测试计划', runs: [] };
      }

      const runs = plan.runs || [];

      const sortedRuns = runs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      const processedRuns = await Promise.all(sortedRuns.map(async (run, index) => {
        const reportExists = run.report_path && await asyncFs.exists(run.report_path);
        return {
          index: index + 1,
          timestamp: run.timestamp,
          reportPath: run.report_path,
          available: reportExists,
          isLatest: index === 0
        };
      }));

      return { success: true, runs: processedRuns };
    } catch (error) {
      console.error('获取测试计划运行记录失败:', error);
      return { success: false, error: error.message, runs: [] };
    }
  }

  async scanTestFiles(directoryPath) {
    try {
      if (directoryPath && await asyncFs.exists(directoryPath)) {
        const dirStat = await asyncFs.stat(directoryPath);
        if (dirStat.isDirectory()) {
          const files = await asyncFs.readdir(directoryPath);
          const testFiles = [];

          for (const file of files) {
            if (file.endsWith('.py') && file !== '__pycache__') {
              const filePath = path.join(directoryPath, file);
              const stats = await asyncFs.stat(filePath);

              if (stats.isFile()) {
                let type = 'unit';
                if (file.includes('appium')) {
                  type = 'appium';
                } else if (file.includes('playwright')) {
                  type = 'playwright';
                } else if (file.includes('check_app_status')) {
                  type = 'status';
                }

                testFiles.push({
                  name: file,
                  path: filePath,
                  type: type
                });
              }
            }
          }

          if (testFiles.length > 0) {
            return testFiles;
          }
        }
      }

      let projectRoot = this.projectRoot;
      let finalTestsPath = path.join(projectRoot, 'tests');

      if (!(await asyncFs.exists(finalTestsPath))) {
        const appRoot = process.cwd();
        const alternativeTestsPath = path.join(appRoot, 'tests');

        if (await asyncFs.exists(alternativeTestsPath)) {
          finalTestsPath = alternativeTestsPath;
          projectRoot = appRoot;
        }
      }

      if (!(await asyncFs.exists(finalTestsPath))) {
        return [];
      }

      const files = await asyncFs.readdir(finalTestsPath);
      const testFiles = [];

      for (const file of files) {
        if (file.endsWith('.py') && file !== '__pycache__') {
          const filePath = path.join(finalTestsPath, file);
          const stats = await asyncFs.stat(filePath);

          if (stats.isFile()) {
            let type = 'unit';
            if (file.includes('appium')) {
              type = 'appium';
            } else if (file.includes('playwright')) {
              type = 'playwright';
            } else if (file.includes('check_app_status')) {
              type = 'status';
            }

            testFiles.push({
              name: file,
              path: filePath,
              type: type
            });
          }
        }
      }

      return testFiles;
    } catch (error) {
      return [];
    }
  }

  async extractPytestMarkers(filePaths) {
    try {
      const markers = new Set();

      for (const filePath of filePaths) {
        let fullPath = filePath;
        if (!path.isAbsolute(filePath)) {
          fullPath = path.join(this.projectRoot, filePath);
        }

        if (!(await asyncFs.exists(fullPath))) {
          continue;
        }

        const content = await asyncFs.readFile(fullPath);

        const markerRegex = /@pytest\.mark\.(\w+)/g;
        let match;

        while ((match = markerRegex.exec(content)) !== null) {
          markers.add(match[1]);
        }
      }

      const markerDescriptions = {
        'smoke': '冒烟测试',
        'unit': '单元功能测试',
        'exception': '异常场景测试',
        'critical': '关键功能测试',
        'appium': 'Appium移动端测试',
        'playwright': 'Playwright测试'
      };

      const foundMarkers = Array.from(markers).map(markerName => ({
        name: markerName,
        description: markerDescriptions[markerName] || `${markerName}测试`
      }));

      return foundMarkers;
    } catch (error) {
      return [];
    }
  }

  async getPytestMarkers() {
    try {
      const pytestIniPath = path.join(this.projectRoot, 'config', 'pytest.ini');
      if (!(await asyncFs.exists(pytestIniPath))) {
        console.error('pytest.ini文件不存在');
        return [];
      }

      const content = await asyncFs.readFile(pytestIniPath);
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
                this.parseMarkersLine(afterEqual, markers);
              }
              inMarkersBlock = true;
            }
            continue;
          }

          if (inMarkersBlock) {
            const isIndented = line.length > 0 && (line[0] === ' ' || line[0] === '\t');
            if (isIndented && trimmedLine && trimmedLine.includes(':')) {
              this.parseMarkersLine(trimmedLine, markers);
              continue;
            }
            if (trimmedLine && !isIndented) {
              inMarkersBlock = false;
            }
          }
        }
      }

      return markers;
    } catch (error) {
      console.error('读取pytest标记失败:', error);
      return [];
    }
  }

  parseMarkersLine(line, markers) {
    const parts = line.split(':');
    if (parts.length >= 2) {
      const name = parts[0].trim();
      const description = parts.slice(1).join(':').trim();

      if (name) {
        markers.push({ name, description });
      }
    }
  }
}

module.exports = TestPlanService;

// AllureService — Allure 报告服务聚合根。
//
// 藏 HTTP 服务器托管 + CLI 调用 + 路径查找/清理 + 报告生成/打开。
// 4 factory-or-default (logger + httpServer + cliInvoker + asyncFs) (对称 8 参照)。
//
// 生产: new AllureService(projectRoot, i18nService, userDataPath)  # 3 参
// 测试: new AllureService(projectRoot, i18nService, userDataPath, { loggerFactory, httpServerFactory, cliInvokerFactory, asyncFsFactory })

const path = require('path');
const asyncFs = require('../utils/asyncFs');
const Logger = require('../utils/logger');
const { getTimestamp, getLogsPath } = require('../utils/pathHelper');
const AllureHttpServer = require('./allure/AllureHttpServer');
const AllureCliInvoker = require('./allure/AllureCliInvoker');

/** @typedef {Object} AllureServiceOptions
 * @property {() => object} [loggerFactory] - 默认 `() => new Logger(this._getLogsPath('XKAT'), 'Electron')`
 * @property {(logger: object) => object} [httpServerFactory] - 默认 `(logger) => new AllureHttpServer(logger)`
 * @property {(projectRoot: string, logger: object) => object} [cliInvokerFactory] - 默认 `(projectRoot, logger) => new AllureCliInvoker(projectRoot, logger)`
 * @property {() => object} [asyncFsFactory] - 默认 `() => asyncFs`
 */

/**
 * Allure 报告服务（聚合根）
 * 协调 AllureHttpServer（HTTP 托管）+ AllureCliInvoker（CLI 调用）
 * 保留路径查找/清理/生成入口/打开入口职责
 */
class AllureService {
  /**
   * @param {string} projectRoot
   * @param {object} i18nService
   * @param {string} userDataPath
   * @param {AllureServiceOptions} [opts] - factory-or-default (全可选, 生产不传)
   */
  constructor(projectRoot, i18nService, userDataPath, opts = {}) {
    this.projectRoot = projectRoot;
    this.i18nService = i18nService;
    this.userDataPath = userDataPath;

    // factory-or-default (对称 UpdateService/TestCaseService/EnvironmentService)
    this._loggerFactory = opts.loggerFactory || (() => new Logger(this._getLogsPath('XKAT'), 'Electron'));
    this._httpServerFactory = opts.httpServerFactory || ((logger) => new AllureHttpServer(logger));
    this._cliInvokerFactory = opts.cliInvokerFactory || ((root, logger) => new AllureCliInvoker(root, logger));
    this._asyncFsFactory = opts.asyncFsFactory || (() => asyncFs);

    this.logger = this._loggerFactory();
    this.httpServer = this._httpServerFactory(this.logger);
    this.cliInvoker = this._cliInvokerFactory(projectRoot, this.logger);
    this._asyncFs = this._asyncFsFactory();
  }

  _getLogsPath(...subdirs) {
    const baseDir = this.userDataPath || this.projectRoot;
    return getLogsPath(baseDir, ...subdirs);
  }

  async generateAllureReport(allureResultsDir, testPlanName) {
    try {
      await this.logger.ensureLogDir();
      this.logger.resetLogPath();

      if (!allureResultsDir || !(await this._asyncFs.exists(allureResultsDir))) {
        await this.logger.error('Allure results directory does not exist');
        return { success: false, error: 'allure-results目录不存在' };
      }

      // 检查是否有结果文件
      const resultFiles = await this._asyncFs.readdir(allureResultsDir);
      const jsonFiles = resultFiles.filter(f => f.endsWith('-result.json') || f.endsWith('.json'));
      if (jsonFiles.length === 0) {
        await this.logger.warning('No allure result files found');
        return { success: false, error: 'allure-results目录中没有结果文件' };
      }

      // 创建报告目录: allure-reports/testPlanName/timestamp
      const run_timestamp = getTimestamp();
      const allureReportBaseDir = this._getLogsPath('Allure', 'allure-reports');
      const testPlanDir = path.join(allureReportBaseDir, testPlanName || 'default');
      const allureReportDir = path.join(testPlanDir, run_timestamp);

      await this._asyncFs.mkdir(testPlanDir, { recursive: true });

      await this.logger.info(`Generating Allure report: ${allureResultsDir} -> ${allureReportDir}`);

      // 委托 CliInvoker 执行 CLI 调用
      const result = await this.cliInvoker.generate(allureResultsDir, allureReportDir);

      if (result.code === 0) {
        const indexHtmlPath = path.join(allureReportDir, 'index.html');
        if (await this._asyncFs.exists(indexHtmlPath)) {
          await this.logger.info(`Allure report generated: ${allureReportDir}`);

          // 生成成功后清理 allure-results 目录
          try {
            await this._asyncFs.rm(allureResultsDir, { recursive: true, force: true });
            await this.logger.info('Cleaned up allure-results directory');
          } catch (e) {
            await this.logger.warning(`Failed to clean allure-results: ${e.message}`);
          }

          return { success: true, reportPath: allureReportDir };
        } else {
          await this.logger.error('Report generated but index.html not found');
          return { success: false, error: '报告生成成功但index.html不存在' };
        }
      } else {
        const errorMsg = result.stderr || result.stdout || 'Unknown error';
        await this.logger.error(`Allure generate failed (code ${result.code}): ${errorMsg}`);
        return { success: false, error: `allure generate失败: ${errorMsg}` };
      }
    } catch (error) {
      await this.logger.error(`Generate Allure report failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async openAllureReport(testPlanName = null, options = {}) {
    try {
      if (!testPlanName) {
        const allureReportBaseDir = this._getLogsPath('Allure', 'allure-reports');
        if (await this._asyncFs.exists(allureReportBaseDir)) {
          const items = await this._asyncFs.readdir(allureReportBaseDir);
          const reportDirs = [];

          for (const item of items) {
            const itemPath = path.join(allureReportBaseDir, item);
            const stat = await this._asyncFs.stat(itemPath);
            if (stat.isDirectory()) {
              reportDirs.push(item);
            }
          }

          if (reportDirs.length > 0) {
            testPlanName = reportDirs[reportDirs.length - 1];
          }
        }
      }

      if (!testPlanName) {
        return { success: false, error: '没有可用的Allure报告，请先生成报告' };
      }

      const testPlanDir = this._getLogsPath('Allure', 'allure-reports', testPlanName);

      if (!(await this._asyncFs.exists(testPlanDir))) {
        return { success: false, error: `测试计划 '${testPlanName}' 的Allure报告不存在` };
      }

      // 报告目录结构: allure-reports/testPlanName/timestamp/
      // 查找最新的timestamp子目录
      let allureReportDir = null;
      const subItems = await this._asyncFs.readdir(testPlanDir);
      const timestampDirs = [];

      for (const item of subItems) {
        const itemPath = path.join(testPlanDir, item);
        const stat = await this._asyncFs.stat(itemPath);
        if (stat.isDirectory()) {
          const indexHtml = path.join(itemPath, 'index.html');
          if (await this._asyncFs.exists(indexHtml)) {
            timestampDirs.push({ name: item, path: itemPath, mtime: stat.mtimeMs });
          }
        }
      }

      if (timestampDirs.length === 0) {
        // 兼容旧格式: index.html 直接在 testPlanDir 下
        const directIndexHtml = path.join(testPlanDir, 'index.html');
        if (await this._asyncFs.exists(directIndexHtml)) {
          allureReportDir = testPlanDir;
        } else {
          return { success: false, error: `测试计划 '${testPlanName}' 的报告文件不完整` };
        }
      } else {
        // 按修改时间排序，取最新的
        timestampDirs.sort((a, b) => b.mtime - a.mtime);
        allureReportDir = timestampDirs[0].path;
      }

      await this.httpServer.stop();

      return await this._startServerWithMessage(allureReportDir, options);
    } catch (error) {
      await this.logger.error(`打开Allure报告失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async openReportByPath(reportPath, options = {}) {
    try {
      if (!reportPath || !(await this._asyncFs.exists(reportPath))) {
        return { success: false, error: '报告路径不存在' };
      }

      await this.httpServer.stop();

      return await this._startServerWithMessage(reportPath, options);
    } catch (error) {
      await this.logger.error(`打开报告失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * 启动 HTTP 服务器并组装 i18n message
   */
  async _startServerWithMessage(reportDir, options) {
    await this.logger.ensureLogDir();
    this.logger.resetLogPath();

    const result = await this.httpServer.start(reportDir, options);

    if (result.success) {
      return {
        success: true,
        url: result.url,
        port: result.port,
        message: this.i18nService ? this.i18nService.t('allure.openingReport') : '正在打开Allure报告...'
      };
    }
    return result;
  }

  async stopAllureServer() {
    try {
      await this.logger.ensureLogDir();
      this.logger.resetLogPath();
      return await this.httpServer.stop();
    } catch (error) {
      await this.logger.error(`停止服务器失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  cleanup() {
    this.httpServer.cleanupSync();
  }

  cleanupSync() {
    this.httpServer.cleanupSync();
  }

  async getAllureServerStatus() {
    try {
      return this.httpServer.getStatus();
    } catch (error) {
      return {
        running: false,
        port: null,
        error: error.message
      };
    }
  }

  async clearAllureReports() {
    try {
      const allureReportsDir = this._getLogsPath('Allure', 'allure-reports');

      if (!(await this._asyncFs.exists(allureReportsDir))) {
        return { success: true, message: 'Allure报告目录不存在' };
      }

      const items = await this._asyncFs.readdir(allureReportsDir);
      let deletedCount = 0;

      for (const item of items) {
        const itemPath = path.join(allureReportsDir, item);
        try {
          const stat = await this._asyncFs.stat(itemPath);
          if (stat.isDirectory()) {
            await this._asyncFs.rm(itemPath, { recursive: true, force: true });
          } else {
            await this._asyncFs.unlink(itemPath);
          }
          deletedCount++;
        } catch (e) {
          await this.logger.error(`删除 ${itemPath} 失败: ${e.message}`);
        }
      }

      return { success: true, message: `已清空 ${deletedCount} 个报告` };
    } catch (error) {
      await this.logger.error(`清空Allure报告数据失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async clearAllLogs() {
    try {
      const logsDir = this._getLogsPath();

      if (!(await this._asyncFs.exists(logsDir))) {
        return { success: true, message: '日志目录不存在' };
      }

      const subDirs = await this._asyncFs.readdir(logsDir);
      let deletedCount = 0;
      // 跳过 Allure 目录: 测试报告需保留, 用户可通过报告管理 Tab 单独清理
      const SKIP_DIRS = ['Allure'];

      for (const subDir of subDirs) {
        if (SKIP_DIRS.includes(subDir)) {
          continue;
        }
        const subDirPath = path.join(logsDir, subDir);
        try {
          const stat = await this._asyncFs.stat(subDirPath);
          if (stat.isDirectory()) {
            const items = await this._asyncFs.readdir(subDirPath);
            for (const item of items) {
              const itemPath = path.join(subDirPath, item);
              try {
                const itemStat = await this._asyncFs.stat(itemPath);
                if (itemStat.isDirectory()) {
                  await this._asyncFs.rm(itemPath, { recursive: true, force: true });
                } else {
                  await this._asyncFs.unlink(itemPath);
                }
                deletedCount++;
              } catch (e) {
                await this.logger.error(`删除 ${itemPath} 失败: ${e.message}`);
              }
            }
          } else {
            await this._asyncFs.unlink(subDirPath);
            deletedCount++;
          }
        } catch (e) {
          await this.logger.error(`处理 ${subDirPath} 失败: ${e.message}`);
        }
      }

      return { success: true, message: `已清除 ${deletedCount} 个日志文件` };
    } catch (error) {
      await this.logger.error(`清除日志数据失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async checkReportExists(testPlanName) {
    try {
      const testPlanDir = this._getLogsPath('Allure', 'allure-reports', testPlanName);
      const dirExists = await this._asyncFs.exists(testPlanDir);
      if (!dirExists) return { exists: false };

      // 检查是否有任何timestamp子目录包含index.html
      const items = await this._asyncFs.readdir(testPlanDir);
      for (const item of items) {
        const itemPath = path.join(testPlanDir, item);
        const stat = await this._asyncFs.stat(itemPath);
        if (stat.isDirectory()) {
          const indexHtml = path.join(itemPath, 'index.html');
          if (await this._asyncFs.exists(indexHtml)) {
            return { exists: true };
          }
        }
      }

      // 兼容旧格式: index.html 直接在 testPlanDir 下
      const directIndexHtml = path.join(testPlanDir, 'index.html');
      return { exists: await this._asyncFs.exists(directIndexHtml) };
    } catch (error) {
      await this.logger.error(`检查报告存在性失败: ${error.message}`);
      return { exists: false };
    }
  }

}

module.exports = { AllureService };

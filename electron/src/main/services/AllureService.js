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
// R25 P2-3: 报告路径约束复用 TestPlanService 的 isPathInside (无循环依赖: TestPlanService 不 require 本模块)
const { isPathInside } = require('./TestPlanService');

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
      const jsonFiles = resultFiles.filter((f) => f.endsWith('-result.json') || f.endsWith('.json'));
      if (jsonFiles.length === 0) {
        await this.logger.warn('No allure result files found');
        return { success: false, error: 'allure-results目录中没有结果文件' };
      }

      // 创建报告目录: allure-reports/testPlanName/timestamp
      const run_timestamp = getTimestamp();
      const allureReportBaseDir = this._getLogsPath('Allure', 'allure-reports');
      // P3-8: testPlanName 渲染进程可控, basename 清洗防目录穿越
      const safePlanName = path.basename(String(testPlanName || 'default')).replace(/[\\/:*?"<>|]/g, '_') || 'default';
      const testPlanDir = path.join(allureReportBaseDir, safePlanName);
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
            await this._asyncFs.rm(allureResultsDir, {
              recursive: true,
              force: true,
            });
            await this.logger.info('Cleaned up allure-results directory');
          } catch (e) {
            await this.logger.warn(`Failed to clean allure-results: ${e.message}`);
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

  /**
   * 查找测试计划下最新的报告目录 (含 index.html)。
   * 报告目录结构: allure-reports/testPlanName/timestamp/index.html
   * 兼容旧格式: index.html 直接在 testPlanDir 下 → 返回 testPlanDir。
   *
   * Precondition: testPlanName 对应的 testPlanDir 已存在 (调用方负责 exists 校验)。
   * 共享给 openAllureReport (取最新) 与 checkReportExists (判存在), 消除两处遍历重复。
   *
   * @param {string} testPlanName
   * @returns {Promise<string|null>} 报告目录路径; 无含 index.html 的报告时返 null
   * @private
   */
  async _findLatestReportDir(testPlanName) {
    const reportsRoot = this._getLogsPath('Allure', 'allure-reports');
    const testPlanDir = this._getLogsPath('Allure', 'allure-reports', testPlanName);
    // R25 P2-3: 防 testPlanName 含 ../ 等路径成分跳出报告根 — 否则 readdir 可
    // 读到任意目录, 后续成为 HTTP 托管根 (信息泄露)
    if (!isPathInside(reportsRoot, testPlanDir)) return null;
    const subItems = await this._asyncFs.readdir(testPlanDir);
    const timestampDirs = [];

    for (const item of subItems) {
      const itemPath = path.join(testPlanDir, item);
      const stat = await this._asyncFs.stat(itemPath);
      if (stat.isDirectory()) {
        const indexHtml = path.join(itemPath, 'index.html');
        if (await this._asyncFs.exists(indexHtml)) {
          timestampDirs.push({
            name: item,
            path: itemPath,
            mtime: stat.mtimeMs,
          });
        }
      }
    }

    if (timestampDirs.length === 0) {
      // 兼容旧格式: index.html 直接在 testPlanDir 下
      const directIndexHtml = path.join(testPlanDir, 'index.html');
      if (await this._asyncFs.exists(directIndexHtml)) {
        return testPlanDir;
      }
      return null;
    }

    // 按修改时间排序，取最新的
    timestampDirs.sort((a, b) => b.mtime - a.mtime);
    return timestampDirs[0].path;
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
        return {
          success: false,
          error: `测试计划 '${testPlanName}' 的Allure报告不存在`,
        };
      }

      const allureReportDir = await this._findLatestReportDir(testPlanName);

      if (!allureReportDir) {
        return {
          success: false,
          error: `测试计划 '${testPlanName}' 的报告文件不完整`,
        };
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
      const reportsRoot = this._getLogsPath('Allure', 'allure-reports');
      // R25 P2-3: reportPath 必须严格位于报告根内 — 原实现零校验, 渲染层被攻破时
      // 可传任意存在的目录成为 AllureHttpServer 托管根, 同源 http://localhost:PORT
      // 下读取本机任意文件 (信息泄露)
      if (typeof reportPath !== 'string' || !isPathInside(reportsRoot, reportPath)) {
        return { success: false, error: 'invalid_report_path' };
      }
      if (!(await this._asyncFs.exists(reportPath))) {
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
        message: this.i18nService ? this.i18nService.t('allure.openingReport') : '正在打开Allure报告...',
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
    // P3-4: 与 cleanupSync 行为一致, 收敛为委托
    this.cleanupSync();
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
        error: error.message,
      };
    }
  }

  /**
   * R27: 清空目录内容 (保留目录本身 — allure-results/reports 目录需持续存在供生成/写入)
   * @returns {Promise<number>} 删除项数
   */
  async _emptyAllureDir(dir) {
    if (!(await this._asyncFs.exists(dir))) return 0;
    const items = await this._asyncFs.readdir(dir);
    let deletedCount = 0;
    for (const item of items) {
      const itemPath = path.join(dir, item);
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
    return deletedCount;
  }

  async clearAllureReports() {
    try {
      const allureReportsDir = this._getLogsPath('Allure', 'allure-reports');
      // R27: 原只清 allure-reports, allure-results (原始结果) 残留累积 —
      // 该目录仅在报告生成成功后自动清理, 生成失败/跳过时不落盘清理 → 一并清空
      const allureResultsDir = this._getLogsPath('Allure', 'allure-results');

      const reportCount = await this._emptyAllureDir(allureReportsDir);
      const resultsCount = await this._emptyAllureDir(allureResultsDir);
      const total = reportCount + resultsCount;

      return { success: true, message: `已清空 ${total} 项 (报告 ${reportCount} / 结果 ${resultsCount})` };
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
                  await this._asyncFs.rm(itemPath, {
                    recursive: true,
                    force: true,
                  });
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

      const latestReportDir = await this._findLatestReportDir(testPlanName);
      return { exists: !!latestReportDir };
    } catch (error) {
      await this.logger.error(`检查报告存在性失败: ${error.message}`);
      return { exists: false };
    }
  }
}

module.exports = { AllureService };

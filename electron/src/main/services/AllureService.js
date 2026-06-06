const path = require('path');
const http = require('http');
const fs = require('fs');
const { execSync } = require('child_process');
const asyncFs = require('../utils/asyncFs');
const Logger = require('../utils/logger');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.map': 'application/json',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
};

class AllureService {
  constructor(projectRoot, i18nService, userDataPath) {
    this.projectRoot = projectRoot;
    this.i18nService = i18nService;
    this.userDataPath = userDataPath;
    this.allureHttpServer = null;
    this.allureServerPort = null;
    this.logger = new Logger(this._getLogsPath('XKAT'), 'Electron');
  }

  _getLogsPath(...subdirs) {
    const baseDir = this.userDataPath || this.projectRoot;
    return path.join(baseDir, 'logs', ...subdirs);
  }

  _findSystemNode() {
    try {
      const result = execSync('where node', {
        encoding: 'utf8',
        timeout: 3000,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      const paths = result.split('\n').map(p => p.trim()).filter(p => p && p.endsWith('.exe'));
      return paths[0] || null;
    } catch {
      return null;
    }
  }

  _getAllureCliPath() {
    // 解析 allure npm 包的 CLI 入口路径 (cli.js)
    try {
      // Allure 3 是 ESM 包，require.resolve 可能失败，用路径探测
      const searchPaths = [
        path.join(this.projectRoot, 'node_modules', 'allure'),
        path.join(this.projectRoot, 'electron', 'node_modules', 'allure'),
        path.join(__dirname, '..', '..', '..', 'node_modules', 'allure')
      ];

      for (const allureDir of searchPaths) {
        const cliPath = path.join(allureDir, 'cli.js');
        if (fs.existsSync(cliPath)) {
          return cliPath;
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  async generateAllureReport(allureResultsDir, testPlanName) {
    try {
      await this.logger.ensureLogDir();
      this.logger.resetLogPath();

      if (!allureResultsDir || !(await asyncFs.exists(allureResultsDir))) {
        await this.logger.error('Allure results directory does not exist');
        return { success: false, error: 'allure-results目录不存在' };
      }

      // 检查是否有结果文件
      const resultFiles = await asyncFs.readdir(allureResultsDir);
      const jsonFiles = resultFiles.filter(f => f.endsWith('-result.json') || f.endsWith('.json'));
      if (jsonFiles.length === 0) {
        await this.logger.warning('No allure result files found');
        return { success: false, error: 'allure-results目录中没有结果文件' };
      }

      // 创建报告目录: allure-reports/testPlanName/timestamp
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const run_timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      const allureReportBaseDir = this._getLogsPath('Allure', 'allure-reports');
      const testPlanDir = path.join(allureReportBaseDir, testPlanName || 'default');
      const allureReportDir = path.join(testPlanDir, run_timestamp);

      await asyncFs.mkdir(testPlanDir, { recursive: true });

      await this.logger.info(`Generating Allure report: ${allureResultsDir} -> ${allureReportDir}`);

      // 使用 ELECTRON_RUN_AS_NODE 让 Electron 以纯 Node.js 模式运行 allure CLI
      const allureCliPath = this._getAllureCliPath();
      const env = { ...process.env };

      let command;
      let args;

      if (allureCliPath) {
        // 优先使用系统 Node.js 运行 Allure CLI (ESM 兼容性更好)
        // Electron 的 process.execPath 是 electron.exe，ELECTRON_RUN_AS_NODE=1 可能有 ESM 问题
        const systemNode = this._findSystemNode();
        command = systemNode || process.execPath;
        // Allure 3 generate: allure generate <resultsDir> -o <outputDir>
        args = [allureCliPath, 'generate', allureResultsDir, '-o', allureReportDir];
        if (!systemNode) {
          // 使用 Electron 作为 Node 时需要设置环境变量
          env.ELECTRON_RUN_AS_NODE = '1';
        }
      } else {
        // 回退: 尝试系统 npx
        command = 'npx';
        args = ['allure', 'generate', allureResultsDir, '-o', allureReportDir];
        await this.logger.warning('Allure npm package not found, falling back to npx');
      }

      const result = await new Promise((resolve) => {
        const child = require('child_process').spawn(command, args, {
          env,
          windowsHide: true,
          stdio: ['pipe', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => { stdout += data.toString(); });
        child.stderr.on('data', (data) => { stderr += data.toString(); });

        child.on('close', (code) => {
          resolve({ code, stdout, stderr });
        });

        child.on('error', (error) => {
          resolve({ code: -1, stdout: '', stderr: error.message });
        });
      });

      if (result.code === 0) {
        const indexHtmlPath = path.join(allureReportDir, 'index.html');
        if (await asyncFs.exists(indexHtmlPath)) {
          await this.logger.info(`Allure report generated: ${allureReportDir}`);

          // 生成成功后清理 allure-results 目录
          try {
            await asyncFs.rm(allureResultsDir, { recursive: true, force: true });
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

  async _stopServer() {
    if (!this.allureHttpServer) {
      return { success: true, message: '没有正在运行的服务器' };
    }

    await this.logger.info('正在停止Allure HTTP服务器...');

    try {
      await new Promise((resolve) => {
        this.allureHttpServer.close(() => resolve());
        // 超时保底：3秒后强制resolve
        setTimeout(resolve, 3000);
      });
    } catch (e) {
      await this.logger.error(`关闭HTTP服务器异常: ${e.message}`);
    }

    this.allureHttpServer = null;
    this.allureServerPort = null;

    await this.logger.info('Allure HTTP服务器已停止');
    return { success: true, message: 'Allure HTTP服务器已停止' };
  }

  async openAllureReport(testPlanName = null, options = {}) {
    try {
      if (!testPlanName) {
        const allureReportBaseDir = this._getLogsPath('Allure', 'allure-reports');
        if (await asyncFs.exists(allureReportBaseDir)) {
          const items = await asyncFs.readdir(allureReportBaseDir);
          const reportDirs = [];

          for (const item of items) {
            const itemPath = path.join(allureReportBaseDir, item);
            const stat = await asyncFs.stat(itemPath);
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

      if (!(await asyncFs.exists(testPlanDir))) {
        return { success: false, error: `测试计划 '${testPlanName}' 的Allure报告不存在` };
      }

      // 报告目录结构: allure-reports/testPlanName/timestamp/
      // 查找最新的timestamp子目录
      let allureReportDir = null;
      const subItems = await asyncFs.readdir(testPlanDir);
      const timestampDirs = [];

      for (const item of subItems) {
        const itemPath = path.join(testPlanDir, item);
        const stat = await asyncFs.stat(itemPath);
        if (stat.isDirectory()) {
          const indexHtml = path.join(itemPath, 'index.html');
          if (await asyncFs.exists(indexHtml)) {
            timestampDirs.push({ name: item, path: itemPath, mtime: stat.mtimeMs });
          }
        }
      }

      if (timestampDirs.length === 0) {
        // 兼容旧格式: index.html 直接在 testPlanDir 下
        const directIndexHtml = path.join(testPlanDir, 'index.html');
        if (await asyncFs.exists(directIndexHtml)) {
          allureReportDir = testPlanDir;
        } else {
          return { success: false, error: `测试计划 '${testPlanName}' 的报告文件不完整` };
        }
      } else {
        // 按修改时间排序，取最新的
        timestampDirs.sort((a, b) => b.mtime - a.mtime);
        allureReportDir = timestampDirs[0].path;
      }

      await this._stopServer();

      return await this._startAllureOpenProcess(allureReportDir, options);
    } catch (error) {
      await this.logger.error(`打开Allure报告失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async openReportByPath(reportPath, options = {}) {
    try {
      if (!reportPath || !(await asyncFs.exists(reportPath))) {
        return { success: false, error: '报告路径不存在' };
      }

      await this._stopServer();

      return await this._startAllureOpenProcess(reportPath, options);
    } catch (error) {
      await this.logger.error(`打开报告失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async _startAllureOpenProcess(reportDir, options = {}) {
    try {
      await this.logger.ensureLogDir();
      this.logger.resetLogPath();

      const { language = 'en', isDark = false } = options;
      const allureTheme = isDark ? 'dark' : 'default';

      await this.logger.info(`Starting Allure report server: ${reportDir} (theme=${allureTheme}, lang=${language})`);

      const indexHtmlPath = path.join(reportDir, 'index.html');
      if (!(await asyncFs.exists(indexHtmlPath))) {
        await this.logger.error('Report directory does not contain valid Allure report file');
        return { success: false, error: '报告目录不包含有效的Allure报告文件' };
      }

      // 预读 index.html 并注入主题和语言设置
      let indexHtmlContent = await asyncFs.readFile(indexHtmlPath, 'utf8');
      indexHtmlContent = indexHtmlContent.replace(
        /"theme"\s*:\s*"[^"]*"/,
        `"theme":"${allureTheme}"`
      );
      indexHtmlContent = indexHtmlContent.replace(
        /"reportLanguage"\s*:\s*"[^"]*"/,
        `"reportLanguage":"${language}"`
      );

      const resolvedReportDir = path.resolve(reportDir);

      return await new Promise((resolve) => {
        const server = http.createServer((req, res) => {
          let urlPath = req.url.split('?')[0];
          try {
            urlPath = decodeURIComponent(urlPath);
          } catch (e) {
            urlPath = req.url.split('?')[0];
          }

          let filePath = path.join(resolvedReportDir, urlPath === '/' ? 'index.html' : urlPath);
          const resolvedPath = path.resolve(filePath);

          if (!resolvedPath.startsWith(resolvedReportDir)) {
            res.writeHead(403);
            res.end('Forbidden');
            return;
          }

          const ext = path.extname(resolvedPath).toLowerCase();
          const contentType = MIME_TYPES[ext] || 'application/octet-stream';

          // 对 index.html 返回注入后的内容
          if (resolvedPath === path.join(resolvedReportDir, 'index.html')) {
            res.writeHead(200, {
              'Content-Type': 'text/html; charset=utf-8',
              'Access-Control-Allow-Origin': '*'
            });
            res.end(indexHtmlContent);
            return;
          }

          const readStream = fs.createReadStream(resolvedPath);
          readStream.on('open', () => {
            res.writeHead(200, {
              'Content-Type': contentType,
              'Access-Control-Allow-Origin': '*'
            });
            readStream.pipe(res);
          });
          readStream.on('error', () => {
            res.writeHead(404);
            res.end('Not Found');
          });
        });

        server.listen(0, '127.0.0.1', () => {
          const port = server.address().port;
          this.allureHttpServer = server;
          this.allureServerPort = port;
          this.logger.info(`Allure report server started on http://127.0.0.1:${port}`);
          resolve({
            success: true,
            url: `http://127.0.0.1:${port}`,
            port: port,
            message: '正在打开Allure报告...'
          });
        });

        server.on('error', (error) => {
          this.logger.error(`Allure report server error: ${error.message}`);
          resolve({ success: false, error: error.message });
        });
      });
    } catch (error) {
      await this.logger.error(`打开Allure报告失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async stopAllureServer() {
    try {
      await this.logger.ensureLogDir();
      this.logger.resetLogPath();
      return await this._stopServer();
    } catch (error) {
      await this.logger.error(`停止服务器失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async cleanup() {
    this.cleanupSync();
  }

  cleanupSync() {
    try {
      if (this.allureHttpServer) {
        this.allureHttpServer.close();
        this.allureHttpServer = null;
      }
      this.allureServerPort = null;
    } catch (error) {
      // cleanup must never throw — app is exiting
    }
  }

  async getAllureServerStatus() {
    try {
      const isRunning = this.allureHttpServer !== null;
      return {
        running: isRunning,
        port: this.allureServerPort
      };
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

      if (!(await asyncFs.exists(allureReportsDir))) {
        return { success: true, message: 'Allure报告目录不存在' };
      }

      const items = await asyncFs.readdir(allureReportsDir);
      let deletedCount = 0;

      for (const item of items) {
        const itemPath = path.join(allureReportsDir, item);
        try {
          const stat = await asyncFs.stat(itemPath);
          if (stat.isDirectory()) {
            await asyncFs.rm(itemPath, { recursive: true, force: true });
          } else {
            await asyncFs.unlink(itemPath);
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

      if (!(await asyncFs.exists(logsDir))) {
        return { success: true, message: '日志目录不存在' };
      }

      const subDirs = await asyncFs.readdir(logsDir);
      let deletedCount = 0;

      for (const subDir of subDirs) {
        const subDirPath = path.join(logsDir, subDir);
        try {
          const stat = await asyncFs.stat(subDirPath);
          if (stat.isDirectory()) {
            const items = await asyncFs.readdir(subDirPath);
            for (const item of items) {
              const itemPath = path.join(subDirPath, item);
              try {
                const itemStat = await asyncFs.stat(itemPath);
                if (itemStat.isDirectory()) {
                  await asyncFs.rm(itemPath, { recursive: true, force: true });
                } else {
                  await asyncFs.unlink(itemPath);
                }
                deletedCount++;
              } catch (e) {
                await this.logger.error(`删除 ${itemPath} 失败: ${e.message}`);
              }
            }
          } else {
            await asyncFs.unlink(subDirPath);
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
      const dirExists = await asyncFs.exists(testPlanDir);
      if (!dirExists) return { exists: false };

      // 检查是否有任何timestamp子目录包含index.html
      const items = await asyncFs.readdir(testPlanDir);
      for (const item of items) {
        const itemPath = path.join(testPlanDir, item);
        const stat = await asyncFs.stat(itemPath);
        if (stat.isDirectory()) {
          const indexHtml = path.join(itemPath, 'index.html');
          if (await asyncFs.exists(indexHtml)) {
            return { exists: true };
          }
        }
      }

      // 兼容旧格式: index.html 直接在 testPlanDir 下
      const directIndexHtml = path.join(testPlanDir, 'index.html');
      return { exists: await asyncFs.exists(directIndexHtml) };
    } catch (error) {
      await this.logger.error(`检查报告存在性失败: ${error.message}`);
      return { exists: false };
    }
  }

}
module.exports = AllureService;

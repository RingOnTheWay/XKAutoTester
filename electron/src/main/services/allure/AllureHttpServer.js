const path = require('path');
const http = require('http');
const fs = require('fs');
const asyncFs = require('../../utils/asyncFs');

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

/**
 * Allure 报告 HTTP 服务器
 * 负责启动本地 HTTP 服务托管 Allure 报告，并注入主题/语言设置
 */
class AllureHttpServer {
  constructor(logger) {
    this.logger = logger;
    this.server = null;
    this.port = null;
  }

  /**
   * 注入主题和语言设置到 index.html 内容
   * Allure 3.x awesome 运行时读 prefers-color-scheme，需在 JS 加载前覆盖 matchMedia
   */
  _patchIndexHtml(content, theme, language) {
    let patched = content.replace(/"theme"\s*:\s*"[^"]*"/, `"theme":"${theme}"`);
    patched = patched.replace(/"reportLanguage"\s*:\s*"[^"]*"/, `"reportLanguage":"${language}"`);

    // 注入 matchMedia polyfill 强制 prefers-color-scheme 对齐程序设置
    // Allure 3.x 默认 auto 跟随系统，程序非暗色但系统暗色时报告会被染暗，需覆盖
    const isDark = theme === 'dark';
    const polyfill = `<script>(function(){
      var wantDark = ${isDark};
      var origMatch = window.matchMedia.bind(window);
      window.matchMedia = function(query) {
        if (query && query.indexOf('prefers-color-scheme') !== -1) {
          return {
            matches: wantDark,
            media: query,
            onchange: null,
            addListener: function() {},
            removeListener: function() {},
            addEventListener: function() {},
            removeEventListener: function() {},
            dispatchEvent: function() { return false; }
          };
        }
        return origMatch(query);
      };
      try { localStorage.setItem('allure-theme', wantDark ? 'dark' : 'light'); } catch(e) {}
    })();</script>`;

    // 注入到 <head> 开头，确保在 Allure JS 之前执行
    if (patched.includes('<head>')) {
      patched = patched.replace('<head>', '<head>' + polyfill);
    } else if (patched.includes('<head ')) {
      patched = patched.replace(/<head[^>]*>/, (m) => m + polyfill);
    } else {
      // 无 head 标签，插到文档最前
      patched = polyfill + patched;
    }

    return patched;
  }

  /**
   * 启动 HTTP 服务器托管报告
   * @param {string} reportDir 报告目录绝对路径
   * @param {Object} options { language, isDark }
   * @returns {Promise<{success:boolean, url?:string, port?:number, error?:string}>}
   */
  async start(reportDir, options = {}) {
    const { language = 'en', isDark = false } = options;
    // Allure 3.x theme 取值: light | dark | auto（2.x 为 default | dark，default 在 3.x 不认退回 auto 跟随系统）
    const allureTheme = isDark ? 'dark' : 'light';

    await this.logger.info(`Starting Allure report server: ${reportDir} (theme=${allureTheme}, lang=${language})`);

    const indexHtmlPath = path.join(reportDir, 'index.html');
    if (!(await asyncFs.exists(indexHtmlPath))) {
      await this.logger.error('Report directory does not contain valid Allure report file');
      return { success: false, error: '报告目录不包含有效的Allure报告文件' };
    }

    // 预读 index.html 并注入主题和语言设置
    let indexHtmlContent = await asyncFs.readFile(indexHtmlPath, 'utf8');
    indexHtmlContent = this._patchIndexHtml(indexHtmlContent, allureTheme, language);

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

        // 路径穿越防护 (P1-12): 用 path.relative 规范化判定,
        // 修复此前 startsWith 缺 path.sep 边界 — 前缀目录(如 report1evil)可被误放行。
        const rel = path.relative(resolvedReportDir, resolvedPath);
        if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }

        const ext = path.extname(resolvedPath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        // 对 index.html 返回注入后的内容
        if (resolvedPath === path.join(resolvedReportDir, 'index.html')) {
          // R27 P2-3: 移除 Access-Control-Allow-Origin: * — Allure 报告纯静态无跨源需求,
          // `*` 允许任意网页跨域读取本地报告 (信息泄露面)
          res.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
          });
          res.end(indexHtmlContent);
          return;
        }

        const readStream = fs.createReadStream(resolvedPath);
        readStream.on('open', () => {
          res.writeHead(200, {
            'Content-Type': contentType,
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
        this.server = server;
        this.port = port;
        this.logger.info(`Allure report server started on http://127.0.0.1:${port}`);
        resolve({
          success: true,
          url: `http://127.0.0.1:${port}`,
          port: port,
        });
      });

      server.on('error', (error) => {
        this.logger.error(`Allure report server error: ${error.message}`);
        resolve({ success: false, error: error.message });
      });
    });
  }

  /**
   * 停止 HTTP 服务器（异步，等待连接关闭）
   */
  async stop() {
    if (!this.server) {
      return { success: true, message: '没有正在运行的服务器' };
    }

    await this.logger.info('正在停止Allure HTTP服务器...');

    try {
      await new Promise((resolve) => {
        this.server.close(() => resolve());
        // 超时保底：3秒后强制resolve
        setTimeout(resolve, 3000);
      });
    } catch (e) {
      await this.logger.error(`关闭HTTP服务器异常: ${e.message}`);
    }

    this.server = null;
    this.port = null;

    await this.logger.info('Allure HTTP服务器已停止');
    return { success: true, message: 'Allure HTTP服务器已停止' };
  }

  /**
   * 同步清理（应用退出时调用，必须不抛错）
   */
  cleanupSync() {
    try {
      if (this.server) {
        this.server.close();
        this.server = null;
      }
      this.port = null;
    } catch (error) {
      // cleanup must never throw — app is exiting
    }
  }

  /**
   * 获取服务器状态
   */
  getStatus() {
    const isRunning = this.server !== null;
    return {
      running: isRunning,
      port: this.port,
    };
  }
}

module.exports = AllureHttpServer;

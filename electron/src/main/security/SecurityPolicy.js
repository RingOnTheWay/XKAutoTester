/**
 * SecurityPolicy - 窗口安全策略单点 (R26 候选⑤, 自 ElectronApp 拆出)
 *
 * 职责:
 * - attachMainWindowCsp: 主窗口 session 注入 CSP 响应头 (dev 模式放行
 *   Vite HMR 内联脚本与 ws)
 * - attachAllureWindowPolicy: allure 窗口独立 partition — 拦截 GA 请求 +
 *   删除注入 CSP (allure 内置 CSP 阻断其自身内联脚本, 已知兼容问题) +
 *   删除 ACAO:*
 * - attachGlobalWindowOpenPolicy: 全 webContents 统一 window.open 策略
 *   (urlGuard 白名单 + shell.openExternal, 全部 deny 新窗口)
 *
 * 拆分动机: 安全策略原散落 createWindow/createAllureWindow/initialize 三处,
 * 单点后新窗口只需调一个 attach*, 且策略可独立测试。
 */
const { shell } = require('electron');
const { isAllowedExternalUrl } = require('../utils/urlGuard');

class SecurityPolicy {
  /**
   * 主窗口 session 注入 CSP
   * @param {Electron.Session} session - 主窗口 webContents.session
   */
  attachMainWindowCsp(session) {
    // 主窗口 CSP: 给默认 session 注入 Content-Security-Policy 响应头, 收紧 XSS 面
    // 注意: allure 窗口使用独立 partition, 其 onHeadersReceived 删除 CSP (见 attachAllureWindowPolicy),
    //      两者互不干扰。经 chromium.webRequest.onHeadersReceived 注入, 对 file:// 与 http(s) 均生效。
    const mainDevServerUrl = process.env.ELECTRON_VITE_DEV_SERVER_URL;
    // 开发模式 (electron-vite dev) 下 Vite HMR 注入内联脚本, script-src 需放行 'unsafe-inline'
    // 并放行 dev server 与 HMR websocket
    const mainConnects = mainDevServerUrl ? `'self' ${mainDevServerUrl} ws: ws://localhost:*` : "'self'";
    const mainScriptSrc = mainDevServerUrl ? "'self' 'unsafe-inline'" : "'self'";
    const mainCsp = `default-src 'self'; script-src ${mainScriptSrc}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src ${mainConnects}`;
    session.webRequest.onHeadersReceived((details, callback) => {
      const responseHeaders = { ...details.responseHeaders };
      responseHeaders['content-security-policy'] = [mainCsp];
      callback({ responseHeaders });
    });
  }

  /**
   * allure 窗口 session 策略 (独立 partition 专用)
   * @param {Electron.Session} session - allure 窗口 webContents.session
   */
  attachAllureWindowPolicy(session) {
    session.webRequest.onBeforeRequest(
      {
        urls: ['*://*.google-analytics.com/*', '*://*.googletagmanager.com/*'],
      },
      (details, callback) => {
        callback({ cancel: true });
      }
    );

    session.webRequest.onHeadersReceived((details, callback) => {
      const responseHeaders = { ...details.responseHeaders };
      // 删除注入 ACAO:* — 同源场景下无需, * 允许任意网站读取响应, 有数据泄露风险
      // 仅保留 CSP 删除 (allure 内置 CSP 在 Electron 环境下可能阻断其自身内联脚本, 属已知兼容问题)
      delete responseHeaders['content-security-policy'];
      delete responseHeaders['content-security-policy-report-only'];
      delete responseHeaders['x-content-security-policy'];
      delete responseHeaders['x-webkit-csp'];
      callback({ responseHeaders });
    });
  }

  /**
   * 全局 window.open 策略 (web-contents-created 时挂到每个 webContents)
   * @param {Electron.WebContents} contents
   */
  attachWindowOpenHandler(contents) {
    // 统一窗口打开策略 (替代已移除的 new-window 事件):
    // 每个 webContents 挂 setWindowOpenHandler, 覆盖 splash/main/allure 全部窗口。
    // mainWindow 在 createWindow 里另有更严的 setWindowOpenHandler(deny) 会覆盖本处 (后设优先)。
    contents.setWindowOpenHandler(({ url }) => {
      const { allowed, reason } = isAllowedExternalUrl(url);
      if (!allowed) {
        console.error(`[window-open] 拒绝打开 URL: ${url} (${reason})`);
        return { action: 'deny' };
      }
      shell.openExternal(url);
      return { action: 'deny' };
    });
  }
}

module.exports = { SecurityPolicy };

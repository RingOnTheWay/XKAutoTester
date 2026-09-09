// 可信 sender 白名单前缀 (P0-3: 拒绝非本应用窗口的 IPC 调用)。
// 打包/生产: file:// 协议; dev: vite dev server 的 localhost。
// 注意: 前缀匹配优于精确 URL, 避免未来窗口 URL 细节变化导致误拒。
const TRUSTED_SENDER_PREFIXES = ['file://', 'http://localhost:', 'http://127.0.0.1:'];

/**
 * 校验 IPC 事件来源是否为本应用窗口 (P0-3 安全防线)。
 * 被 XSS 污染/外部打开的 webContents 无法通过该校验。
 * @param {Electron.IpcMainInvokeEvent} event
 * @returns {boolean}
 */
function isTrustedSender(event) {
  if (!event || !event.senderFrame) return false;
  const url = event.senderFrame.url || '';
  return TRUSTED_SENDER_PREFIXES.some((prefix) => url.startsWith(prefix));
}

/**
 * 不通过时抛错 (registerHandler 的 catch 统一转为 {success:false, error})
 * @param {Electron.IpcMainInvokeEvent} event
 */
function assertTrustedSender(event) {
  if (!isTrustedSender(event)) {
    const err = new Error('Untrusted IPC sender');
    err.code = 'ERR_UNTRUSTED_SENDER';
    throw err;
  }
}

function registerHandler(ipcMain, channel, handler, options = {}) {
  const { withEvent = false } = options;

  ipcMain.handle(channel, async (event, ...args) => {
    try {
      assertTrustedSender(event); // P0-3: 统一 sender 来源校验
      if (withEvent) {
        return await handler(...args, event);
      }
      return await handler(...args);
    } catch (error) {
      console.error(`IPC handler error [${channel}]:`, error);
      return { success: false, error: error.message };
    }
  });
}

function registerHandlers(ipcMain, handlers) {
  Object.entries(handlers).forEach(([channel, handler]) => {
    registerHandler(ipcMain, channel, handler);
  });
}

/**
 * 构造 i18n fallback 翻译闭包 (7 handler 重复, 收敛于此)。
 * i18nService 不可用时回退 fallback 原文 (服务未就绪/测试注入)。
 * @param {object} i18nService
 * @returns {(key: string, fallback: string) => string}
 */
function makeI18nFallback(i18nService) {
  return (key, fallback) =>
    i18nService && typeof i18nService.t === 'function' ? i18nService.t(key, { defaultValue: fallback }) : fallback;
}

/**
 * 统一 IPC 响应构造 (收敛跨 handler 的 {success:false, error} / {success:true} 散落)。
 * 纯成功响应: {success:true, ...payload}; 失败响应: {success:false, error, ...extra}。
 * registerHandler 的 catch 也产出同构 {success:false, error}, 渲染层可统一判定 success。
 * @param {object} [payload] - 成功响应的附加字段
 * @returns {{success: boolean} & object}
 */
function ok(payload) {
  return { success: true, ...payload };
}

/**
 * 统一失败响应: {success:false, error}。业务规则拒绝用 (非抛异常路径)。
 * @param {string} message - 错误信息 (i18n 已翻译或原始文案)
 * @param {object} [extra] - 附加字段 (如 errorCode/statusCode/groups)
 * @returns {{success: boolean, error: string} & object}
 */
function fail(message, extra) {
  return { success: false, error: message, ...extra };
}

module.exports = {
  registerHandler,
  registerHandlers,
  isTrustedSender,
  assertTrustedSender,
  makeI18nFallback,
  ok,
  fail,
};

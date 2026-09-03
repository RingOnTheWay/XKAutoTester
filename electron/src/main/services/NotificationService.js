// NotificationService — 钉钉通知深模块。
//
// 藏 HMAC-SHA256 签名 + URL 构建 + axios POST。
// 2 factory-or-default (httpClient + logger) + 3 纯函数 (buildSignString/buildRequestBody/buildSignedUrl)。
//
// 生产: new NotificationService(i18nService)  # 1 参
// 测试: new NotificationService(i18nService, { httpClientFactory: fakeHttp, loggerFactory: fakeLog })

const crypto = require('crypto');

// P2-6: 钉钉请求默认超时 (ms)。axios 默认无超时, 钉钉 API 不响应时 Promise 永久 pending,
// 会阻塞定时计划完成回调链。超时后 axios 抛 ECONNABORTED, 被 sendDingTalkNotification 的 catch 归一。
const DINGTALK_REQUEST_TIMEOUT = 10000;

/** @typedef {Object} HttpClient
 * @property {(url: string, body: object, opts: object) => Promise<{data: any}>} post
 */
/** @typedef {Object} NotificationLogger
 * @property {(msg: string) => void} error
 */
/** @typedef {Object} NotificationServiceOptions
 * @property {() => HttpClient} [httpClientFactory]
 * @property {() => NotificationLogger} [loggerFactory]
 */

/**
 * 构建 HMAC-SHA256 签名 (纯函数, crypto 标准库)
 * @param {string} timestamp
 * @param {string} secret
 * @returns {string} URL-encoded base64 sign
 */
function buildSignString(timestamp, secret) {
  const stringToSign = `${timestamp}\n${secret}`;
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(stringToSign);
  return encodeURIComponent(hmac.digest().toString('base64'));
}

/**
 * 构建钉钉请求体 (纯函数)
 * @param {string} message
 * @returns {object}
 */
function buildRequestBody(message) {
  return {
    // P3-4: isAtAll 应为 boolean (钉钉 API 期望布尔, 字符串 'false' 语义异常)
    at: { isAtAll: false, atUserIds: [], atMobiles: [] },
    text: { content: message },
    msgtype: 'text',
  };
}

/**
 * 构建签名 URL (纯函数)
 * @param {string} accessToken
 * @param {string} timestamp
 * @param {string} sign
 * @returns {string}
 */
function buildSignedUrl(accessToken, timestamp, sign) {
  return `https://oapi.dingtalk.com/robot/send?access_token=${accessToken}&timestamp=${timestamp}&sign=${sign}`;
}

const defaultHttpClientFactory = () => {
  // R25: axios → Node 22 全局 fetch (消除 axios 漏洞链: formDataToJSON 递归 DoS/原型污染等 10 条 advisory)
  return {
    post: async (url, body, opts) => {
      // 超时经 AbortController 实现 (对齐原 axios timeout 语义)
      const timeout = (opts && opts.timeout) || DINGTALK_REQUEST_TIMEOUT;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: opts && opts.headers ? opts.headers : { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        // R27 P1-1: fetch 不自动抛 HTTP 错误 (axios 行为差异) — 4xx/5xx 需显式转抛,
        // 否则 res.json() 解析错误体且 sendDingTalkNotification 误判 success
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        // 兼容原 axios 返回 { data } 契约
        return { data: await res.json(), status: res.status };
      } finally {
        clearTimeout(timer);
      }
    },
  };
};

const defaultLoggerFactory = () => ({ error: (msg) => console.error(msg) });

class NotificationService {
  /**
   * @param {object} i18nService
   * @param {NotificationServiceOptions} [opts] - factory-or-default
   */
  constructor(i18nService, opts = {}) {
    this.i18nService = i18nService;
    this._httpClientFactory = opts.httpClientFactory || defaultHttpClientFactory;
    this._loggerFactory = opts.loggerFactory || defaultLoggerFactory;
    this._httpClient = this._httpClientFactory();
    this._logger = this._loggerFactory();
  }

  async sendDingTalkNotification(notificationData) {
    try {
      const { accessToken, secret, message } = notificationData;

      if (!accessToken || !secret) {
        return {
          success: false,
          // 复用既有 i18n key (未配置通知平台); 无法新增 key (locales 只读), 采用现有文案
          error: this.i18nService.t('notificationNotConfigured'),
        };
      }

      const timestamp = Date.now().toString();
      const sign = buildSignString(timestamp, secret);
      const url = buildSignedUrl(accessToken, timestamp, sign);
      const body = buildRequestBody(message);

      const response = await this._httpClient.post(url, body, {
        headers: { 'Content-Type': 'application/json' },
        timeout: DINGTALK_REQUEST_TIMEOUT,
      });
      // R27 P1-1: 钉钉业务层校验 — errcode!=0 (token 失效/被拒/限流) 视为失败,
      // 原实现 HTTP 200 即 success:true, 通知实际未送达仍报成功
      const data = response && response.data ? response.data : {};
      if (data.errcode !== undefined && data.errcode !== 0) {
        return { success: false, error: `DingTalk errcode ${data.errcode}: ${data.errmsg || ''}` };
      }
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = {
  NotificationService,
  buildSignString,
  buildRequestBody,
  buildSignedUrl,
  DINGTALK_REQUEST_TIMEOUT,
};

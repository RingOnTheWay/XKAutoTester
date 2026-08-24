// NotificationService — 钉钉通知深模块。
//
// 藏 HMAC-SHA256 签名 + URL 构建 + axios POST。
// 2 factory-or-default (httpClient + logger) + 3 纯函数 (buildSignString/buildRequestBody/buildSignedUrl)。
//
// 生产: new NotificationService(i18nService)  # 1 参
// 测试: new NotificationService(i18nService, { httpClientFactory: fakeHttp, loggerFactory: fakeLog })

const crypto = require('crypto');

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
    at: { isAtAll: 'false', atUserIds: [], atMobiles: [] },
    text: { content: message },
    msgtype: 'text'
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
  const axios = require('axios');
  return {
    post: (url, body, opts) => axios.post(url, body, opts)
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
          error: this.i18nService.t('notificationNotConfigured')
        };
      }

      const timestamp = Date.now().toString();
      const sign = buildSignString(timestamp, secret);
      const url = buildSignedUrl(accessToken, timestamp, sign);
      const body = buildRequestBody(message);

      const response = await this._httpClient.post(url, body, {
        headers: { 'Content-Type': 'application/json' }
      });
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = { NotificationService, buildSignString, buildRequestBody, buildSignedUrl };

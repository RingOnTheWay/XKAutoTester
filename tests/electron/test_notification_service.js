// NotificationService 单测 — 2 factory (httpClient + logger) + 3 纯函数。
// 验证: constructor + buildSignString + buildRequestBody + buildSignedUrl + sendDingTalkNotification (缺参/成功/抛错)。
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const NOTIFICATION_SERVICE_PATH = path.join(
  __dirname, '..', '..', 'electron', 'src', 'main', 'services', 'NotificationService.js'
);
const {
  NotificationService,
  buildSignString,
  buildRequestBody,
  buildSignedUrl,
} = require(NOTIFICATION_SERVICE_PATH);

// ── Fakes ──────────────────────────────────────────────

function makeFakeHttpClient() {
  const calls = [];
  return {
    calls,
    post: async (url, body, opts) => {
      calls.push({ url, body, opts });
      return { data: { errcode: 0, errmsg: 'ok' } };
    },
  };
}

function makeFakeLogger() {
  const calls = [];
  return { calls, error: (msg) => calls.push(msg) };
}

// ── 纯函数 ─────────────────────────────────────────────

test('buildSignString 返 URL-encoded base64 HMAC-SHA256', () => {
  const timestamp = '1234567890123';
  const secret = 'SECtest123';
  const sign = buildSignString(timestamp, secret);

  // sign 应是字符串 + URL-encoded (含 %)
  assert.strictEqual(typeof sign, 'string');
  assert.ok(sign.length > 0);
  // 应是 base64 URL-encoded, 含 %
  assert.ok(/[A-Za-z0-9%]/.test(sign));

  // 相同输入应产生相同输出 (确定性)
  const sign2 = buildSignString(timestamp, secret);
  assert.strictEqual(sign, sign2);

  // 不同 secret 应产生不同输出
  const sign3 = buildSignString(timestamp, 'SECdifferent');
  assert.notStrictEqual(sign, sign3);
});

test('buildRequestBody 返 { at, text, msgtype:"text" } 结构', () => {
  const body = buildRequestBody('hello world');

  assert.deepStrictEqual(body, {
    at: { isAtAll: false, atUserIds: [], atMobiles: [] },
    text: { content: 'hello world' },
    msgtype: 'text',
  });
});

test('buildSignedUrl 返正确格式 URL', () => {
  const url = buildSignedUrl('TOKEN123', '1700000000000', 'SIGN%2Babc%3D');

  assert.strictEqual(url, 'https://oapi.dingtalk.com/robot/send?access_token=TOKEN123&timestamp=1700000000000&sign=SIGN%2Babc%3D');
});

// ── constructor ────────────────────────────────────────

test('constructor 收 2 factory + 2 实例建', () => {
  const http = makeFakeHttpClient();
  const logger = makeFakeLogger();
  const svc = new NotificationService({ t: (key) => (key === 'notificationNotConfigured' ? '钉钉配置不完整' : '') }, {
    httpClientFactory: () => http,
    loggerFactory: () => logger,
  });

  assert.strictEqual(svc._httpClient, http);
  assert.strictEqual(svc._logger, logger);
});

// ── sendDingTalkNotification ───────────────────────────

test('sendDingTalkNotification accessToken/secret 缺失返 {success:false, error}', async () => {
  const svc = new NotificationService({ t: (key) => (key === 'notificationNotConfigured' ? '钉钉配置不完整' : '') }, {
    httpClientFactory: () => makeFakeHttpClient(),
    loggerFactory: () => makeFakeLogger(),
  });

  const result = await svc.sendDingTalkNotification({
    accessToken: '',
    secret: 'SECxxx',
    message: 'hi',
  });

  assert.strictEqual(result.success, false);
  assert.match(result.error, /钉钉配置不完整/);

  const result2 = await svc.sendDingTalkNotification({
    accessToken: 'TOKEN',
    secret: '',
    message: 'hi',
  });

  assert.strictEqual(result2.success, false);
  assert.match(result2.error, /钉钉配置不完整/);
});

test('sendDingTalkNotification 调 httpClient.post + 返 {success:true, data}', async () => {
  const http = makeFakeHttpClient();
  const svc = new NotificationService({ t: (key) => (key === 'notificationNotConfigured' ? '钉钉配置不完整' : '') }, {
    httpClientFactory: () => http,
    loggerFactory: () => makeFakeLogger(),
  });

  const result = await svc.sendDingTalkNotification({
    accessToken: 'TOKEN123',
    secret: 'SECtest',
    message: 'hello dingtalk',
  });

  assert.strictEqual(result.success, true);
  assert.deepStrictEqual(result.data, { errcode: 0, errmsg: 'ok' });

  // 验证 http 调用参数
  assert.strictEqual(http.calls.length, 1);
  const call = http.calls[0];
  assert.match(call.url, /^https:\/\/oapi\.dingtalk\.com\/robot\/send\?access_token=TOKEN123&timestamp=\d+&sign=/);
  assert.deepStrictEqual(call.body, {
    at: { isAtAll: false, atUserIds: [], atMobiles: [] },
    text: { content: 'hello dingtalk' },
    msgtype: 'text',
  });
  assert.deepStrictEqual(call.opts, { headers: { 'Content-Type': 'application/json' } });
});

test('sendDingTalkNotification httpClient.post 抛错 catch 返 {success:false, error}', async () => {
  const http = {
    post: async () => { throw new Error('network timeout'); },
  };
  const svc = new NotificationService({ t: (key) => (key === 'notificationNotConfigured' ? '钉钉配置不完整' : '') }, {
    httpClientFactory: () => http,
    loggerFactory: () => makeFakeLogger(),
  });

  const result = await svc.sendDingTalkNotification({
    accessToken: 'TOKEN',
    secret: 'SEC',
    message: 'hi',
  });

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.error, 'network timeout');
});

test('sendDingTalkNotification 集成验证: 调 buildSignString + buildRequestBody + buildSignedUrl', async () => {
  const http = makeFakeHttpClient();
  const svc = new NotificationService({ t: (key) => (key === 'notificationNotConfigured' ? '钉钉配置不完整' : '') }, {
    httpClientFactory: () => http,
    loggerFactory: () => makeFakeLogger(),
  });

  await svc.sendDingTalkNotification({
    accessToken: 'TOKEN_X',
    secret: 'SECRET_Y',
    message: 'msg_Z',
  });

  const call = http.calls[0];
  // 验证 URL 含 access_token
  assert.match(call.url, /access_token=TOKEN_X/);
  // 验证 URL 含 timestamp (数字)
  assert.match(call.url, /timestamp=\d+/);
  // 验证 URL 含 sign (非空)
  assert.match(call.url, /sign=.+/);
  // 验证 body 是 buildRequestBody 输出
  assert.deepStrictEqual(call.body, buildRequestBody('msg_Z'));
});

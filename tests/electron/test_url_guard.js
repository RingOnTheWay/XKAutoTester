// urlGuard 单测 — P1 openExternal URL 安全校验。
// 验证: https + 白名单 host 通过; http/file/javascript/data/任意域 被拒绝。
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const { isAllowedExternalUrl } = require(path.join(
  __dirname, '..', '..', 'electron', 'src', 'main', 'utils', 'urlGuard.js'
));

// ── 允许的 URL ─────────────────────────────────────────

test('https + github.com 通过', () => {
  const r = isAllowedExternalUrl('https://github.com/RingOnTheWay/XKAutoTester');
  assert.strictEqual(r.allowed, true);
});

test('https + www.github.com 通过', () => {
  const r = isAllowedExternalUrl('https://www.github.com/RingOnTheWay/XKAutoTester');
  assert.strictEqual(r.allowed, true);
});

test('https + github.com 带 query/fragment 通过', () => {
  const r1 = isAllowedExternalUrl('https://github.com/RingOnTheWay/XKAutoTester/releases/tag/v0.1.4');
  assert.strictEqual(r1.allowed, true);
  const r2 = isAllowedExternalUrl('https://github.com/issues?q=is:open');
  assert.strictEqual(r2.allowed, true);
});

// ── 拒绝的 URL ─────────────────────────────────────────

test('http 协议被拒绝', () => {
  const r = isAllowedExternalUrl('http://github.com/x');
  assert.strictEqual(r.allowed, false);
  assert.match(r.reason, /不允许的协议/);
});

test('file:// 协议被拒绝 (防本地文件读取)', () => {
  const r = isAllowedExternalUrl('file:///C:/Windows/System32/evil.exe');
  assert.strictEqual(r.allowed, false);
  assert.match(r.reason, /不允许的协议/);
});

test('javascript: 协议被拒绝 (防 XSS)', () => {
  const r = isAllowedExternalUrl('javascript:alert(1)');
  assert.strictEqual(r.allowed, false);
  assert.match(r.reason, /不允许的协议/);
});

test('data: 协议被拒绝', () => {
  const r = isAllowedExternalUrl('data:text/html,<script>alert(1)</script>');
  assert.strictEqual(r.allowed, false);
  assert.match(r.reason, /不允许的协议/);
});

test('非白名单 host 被拒绝', () => {
  const r = isAllowedExternalUrl('https://evil.com/path');
  assert.strictEqual(r.allowed, false);
  assert.match(r.reason, /不允许的 host/);
});

test('仿冒 host 被拒绝 (github.com.evil.com)', () => {
  const r = isAllowedExternalUrl('https://github.com.evil.com/x');
  assert.strictEqual(r.allowed, false);
  assert.match(r.reason, /不允许的 host/);
});

test('空 URL 被拒绝', () => {
  assert.strictEqual(isAllowedExternalUrl('').allowed, false);
  assert.strictEqual(isAllowedExternalUrl(null).allowed, false);
  assert.strictEqual(isAllowedExternalUrl(undefined).allowed, false);
  assert.strictEqual(isAllowedExternalUrl(123).allowed, false);
});

test('无效 URL 格式被拒绝', () => {
  const r = isAllowedExternalUrl('not-a-url');
  assert.strictEqual(r.allowed, false);
  assert.match(r.reason, /URL 格式无效/);
});

test('大小写不敏感: HTTPS://GITHUB.COM 通过', () => {
  const r = isAllowedExternalUrl('HTTPS://GITHUB.COM/x');
  assert.strictEqual(r.allowed, true);
});

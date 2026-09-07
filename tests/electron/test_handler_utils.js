// handlerUtils 单测 — P0-3: IPC sender 来源校验
const { test, describe } = require('node:test');
const assert = require('node:assert');
const { isTrustedSender, assertTrustedSender } = require('../../electron/src/main/handlers/base/handlerUtils');

describe('handlerUtils P0-3 sender 校验', () => {
  test('file:// 前缀 sender 通过', () => {
    assert.strictEqual(isTrustedSender({ senderFrame: { url: 'file:///D:/app/renderer/index.html' } }), true);
    assert.strictEqual(isTrustedSender({ senderFrame: { url: 'file:///C:/XKAutoTester/splash.html' } }), true);
  });

  test('dev server localhost 通过', () => {
    assert.strictEqual(isTrustedSender({ senderFrame: { url: 'http://localhost:5173/index.html' } }), true);
    assert.strictEqual(isTrustedSender({ senderFrame: { url: 'http://127.0.0.1:5173/index.html' } }), true);
  });

  test('外部 http(s) 来源拒绝', () => {
    assert.strictEqual(isTrustedSender({ senderFrame: { url: 'https://evil.com/x.html' } }), false);
    assert.strictEqual(isTrustedSender({ senderFrame: { url: 'http://192.168.1.1/evil' } }), false);
    assert.strictEqual(isTrustedSender({ senderFrame: { url: 'https://localhost.evil.com/' } }), false, '前缀欺诈域名拒绝');
  });

  test('无 senderFrame / 无 url 拒绝', () => {
    assert.strictEqual(isTrustedSender({}), false);
    assert.strictEqual(isTrustedSender({ senderFrame: {} }), false);
    assert.strictEqual(isTrustedSender(null), false);
    assert.strictEqual(isTrustedSender(undefined), false);
  });

  test('assertTrustedSender 非法来源抛 ERR_UNTRUSTED_SENDER', () => {
    assert.throws(() => assertTrustedSender({ senderFrame: { url: 'https://evil.com/' } }), /Untrusted IPC sender/);
    assert.doesNotThrow(() => assertTrustedSender({ senderFrame: { url: 'file:///D:/app/index.html' } }));
  });

  test('registerHandler 包装: 非法 sender 返回 {success:false} 且不执行 handler', async () => {
    const { registerHandler } = require('../../electron/src/main/handlers/base/handlerUtils');
    const ipc = { handle: (channel, fn) => { ipc._fn = fn; } };
    let executed = false;
    registerHandler(ipc, 'test-channel', () => { executed = true; return { success: true, ok: true }; });

    const result = await ipc._fn({ senderFrame: { url: 'https://evil.com/' } });
    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('Untrusted'));
    assert.strictEqual(executed, false, 'handler 不得被执行');

    const okResult = await ipc._fn({ senderFrame: { url: 'file:///D:/app/index.html' } });
    assert.strictEqual(okResult.success, true);
    assert.strictEqual(executed, true, '可信 sender 应执行 handler');
  });
});

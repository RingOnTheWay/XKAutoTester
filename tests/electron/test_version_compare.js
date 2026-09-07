// versionCompare 单元测试
// R25 P2-1: 剥离 prerelease 段比较 + semver 权重 (release > prerelease)
const { test, describe } = require('node:test');
const assert = require('node:assert');

const { compareVersions } = require('../../electron/src/main/utils/versionCompare');

describe('compareVersions 数字段比较', () => {
  test('基本大小比较', () => {
    assert.strictEqual(compareVersions('0.1.5', '0.1.6'), -1);
    assert.strictEqual(compareVersions('0.1.6', '0.1.5'), 1);
    assert.strictEqual(compareVersions('0.1.6', '0.1.6'), 0);
    assert.strictEqual(compareVersions('1.2.3', '1.2.3'), 0);
  });

  test('前导 v 与短版本号', () => {
    assert.strictEqual(compareVersions('v2.0.0', 'v1.9.9'), 1);
    assert.strictEqual(compareVersions('2.0', '1.9.9'), 1);
    assert.strictEqual(compareVersions('1.2', '1.2.0'), 0);
  });

  test('R25 P2-1: prerelease 与正式版 — dev < release (同号)', () => {
    // 修复前: '0.1.6-dev.1' 被 split('.') 解析为 [0,1,6,1] → 误判比 0.1.6 新,
    // dev 用户永远检测不到同号正式 release (UpdateService.checkForUpdate hasUpdate 恒 false)
    assert.strictEqual(compareVersions('0.1.6-dev.1', '0.1.6'), -1);
    assert.strictEqual(compareVersions('0.1.6', '0.1.6-dev.1'), 1);
  });

  test('R25 P2-1: prerelease 内部按数字比较 (dev.2 > dev.1)', () => {
    assert.strictEqual(compareVersions('0.1.6-dev.1', '0.1.6-dev.2'), -1);
    assert.strictEqual(compareVersions('0.1.6-dev.2', '0.1.6-dev.1'), 1);
    assert.strictEqual(compareVersions('0.1.6-dev.2', '0.1.6-dev.2'), 0);
  });

  test('R25 P2-1: fetchLatestRelease 排序场景 (dev tag 之间取最高)', () => {
    const tags = ['v0.1.5-dev.9', 'v0.1.6-dev.1', 'v0.1.6'];
    const latest = tags.sort((a, b) => compareVersions(b, a))[0];
    assert.strictEqual(latest, 'v0.1.6', '数字段更高 + 正式版优先');
  });

  test('R25 P2-1: 不同数字段时 prerelease 不干扰主版本判断', () => {
    assert.strictEqual(compareVersions('0.1.5-dev.99', '0.1.6'), -1);
    assert.strictEqual(compareVersions('0.1.6-dev.1', '0.1.5'), 1);
  });
});

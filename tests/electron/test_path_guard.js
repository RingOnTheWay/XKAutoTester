//
// pathGuard 纯函数测试 (ADR-0010)。判定表全覆盖: 相等 / 子路径 / 前缀目录 /
// `..` 穿越 / 绝对 / 字面 `..foo` / 非字符串 / 空。
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { isPathInside, isSystemProtectedPath } = require('../../electron/src/main/utils/pathGuard');

test('pathGuard isPathInside: 边界与穿越判定表', () => {
  const base = path.resolve('C:/reports');

  // 严格子路径 → 允
  assert.strictEqual(isPathInside(base, path.resolve('C:/reports/plan1')), true);
  assert.strictEqual(isPathInside(base, path.resolve('C:/reports/plan1/index.html')), true);

  // 前缀目录不得误判为内部
  assert.strictEqual(isPathInside(base, path.resolve('C:/reports-evil/plan1')), false, '前缀目录不得误判为内部');
  assert.strictEqual(isPathInside(base, path.resolve('C:/reports2')), false);

  // `..` 穿越 → 拒
  assert.strictEqual(isPathInside(base, path.resolve('C:/outside/plan1')), false);
  assert.strictEqual(isPathInside(base, path.resolve('C:/reports/../outside/plan1')), false);

  // 相等路径 (target === baseDir) → 拒 (收紧 UpdateService 语义)
  assert.strictEqual(isPathInside(base, base), false, 'baseDir 自身不算内部');

  // 绝对路径逃逸 → 拒
  assert.strictEqual(isPathInside(base, '/absolute/path'), false);

  // 字面 `..foo` 文件名 → 拒 (收紧 UpdateService 语义)
  assert.strictEqual(isPathInside(base, path.resolve('C:/reports/..foo')), false, '字面 ..foo 拒绝');

  // 防御性输入 → 拒
  assert.strictEqual(isPathInside(base, ''), false);
  assert.strictEqual(isPathInside(base, null), false);
  assert.strictEqual(isPathInside(base, 123), false);
  assert.strictEqual(isPathInside('', path.resolve('C:/x')), false);
  assert.strictEqual(isPathInside(null, path.resolve('C:/x')), false);
});

test('pathGuard isSystemProtectedPath: 盘根/系统目录拒绝, 用户目录放行', () => {
  if (process.platform !== 'win32') {
    // 平台相关路径只断言 POSIX 语义
    assert.strictEqual(isSystemProtectedPath('/'), true);
    assert.strictEqual(isSystemProtectedPath('/etc'), true);
    assert.strictEqual(isSystemProtectedPath('/usr/bin'), true);
    assert.strictEqual(isSystemProtectedPath('/var'), true);
    assert.strictEqual(isSystemProtectedPath('/home/dev/x'), false);
    assert.strictEqual(isSystemProtectedPath(''), false);
    assert.strictEqual(isSystemProtectedPath(null), false);
    return;
  }
  // Windows
  assert.strictEqual(isSystemProtectedPath('C:\\'), true, '盘符根拒绝');
  assert.strictEqual(isSystemProtectedPath('C:\\Windows'), true);
  assert.strictEqual(isSystemProtectedPath('C:\\Windows\\System32'), true);
  assert.strictEqual(isSystemProtectedPath('C:\\Program Files'), true);
  assert.strictEqual(isSystemProtectedPath('C:\\Program Files (x86)'), true);
  assert.strictEqual(isSystemProtectedPath('D:\\windows'), true, '任意盘符下 windows 拒绝');
  // 用户目录放行
  assert.strictEqual(isSystemProtectedPath('C:\\Users\\bob\\Desktop'), false);
  assert.strictEqual(isSystemProtectedPath('D:\\projects\\x'), false);
  // 防御性输入
  assert.strictEqual(isSystemProtectedPath(''), false);
  assert.strictEqual(isSystemProtectedPath(null), false);
});

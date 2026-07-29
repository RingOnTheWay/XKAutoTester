// AdbPathQuoter 单元测试
// 验证 adb shell 路径单引号转义
// 策略: 纯函数,无依赖
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const AdbPathQuoter = require(path.join(
  __dirname, '..', '..', 'electron', 'src', 'main', 'services', 'adb', 'AdbPathQuoter.js'
));

// ── 基础转义 ────────────────────────────────────────────────

test('普通路径包裹单引号', () => {
  assert.strictEqual(AdbPathQuoter.quote('/sdcard/test.txt'), "'/sdcard/test.txt'");
});

test('不含特殊字符的路径原样保留', () => {
  const result = AdbPathQuoter.quote('/data/local/tmp/app.apk');
  assert.ok(result.startsWith("'"));
  assert.ok(result.endsWith("'"));
  assert.ok(result.includes('/data/local/tmp/app.apk'));
});

// ── 空值与边界 ─────────────────────────────────────────────

test('空字符串返回空单引号对', () => {
  assert.strictEqual(AdbPathQuoter.quote(''), "''");
});

test('null 返回空单引号对', () => {
  assert.strictEqual(AdbPathQuoter.quote(null), "''");
});

test('undefined 返回空单引号对', () => {
  assert.strictEqual(AdbPathQuoter.quote(undefined), "''");
});

test('非字符串类型返回空单引号对', () => {
  assert.strictEqual(AdbPathQuoter.quote(123), "''");
  assert.strictEqual(AdbPathQuoter.quote({}), "''");
  assert.strictEqual(AdbPathQuoter.quote([]), "''");
});

// ── 含空格路径 ─────────────────────────────────────────────

test('含空格路径正确转义', () => {
  const result = AdbPathQuoter.quote('/sdcard/my files/test.txt');
  assert.strictEqual(result, "'/sdcard/my files/test.txt'");
  // 单引号内的空格不被 shell 解释
});

// ── 含单引号路径 (核心转义逻辑) ───────────────────────────

test('含单引号路径正确转义', () => {
  // 路径: it's.txt → 'it'\''s.txt'
  const result = AdbPathQuoter.quote("it's.txt");
  assert.strictEqual(result, "'it'\\''s.txt'");
});

test('多个单引号路径全部转义', () => {
  // 路径: a'b'c → 'a'\''b'\''c'
  const result = AdbPathQuoter.quote("a'b'c");
  assert.strictEqual(result, "'a'\\''b'\\''c'");
});

test('连续单引号路径', () => {
  // 路径: '' → ''\'''\'''  (外层' + '\''' + '\''' + 外层')
  // bash 验证: echo ''\'''\''' 输出 ''
  const result = AdbPathQuoter.quote("''");
  assert.strictEqual(result, "''\\'''\\'''");
});

test('路径以单引号开头', () => {
  // 路径: 'start → ''\''start'  (外层' + '\'' + start + 外层')
  const result = AdbPathQuoter.quote("'start");
  assert.strictEqual(result, "''\\''start'");
});

test('路径以单引号结尾', () => {
  // 路径: end' → 'end'\'''  (外层' + end + '\'' + 外层')
  const result = AdbPathQuoter.quote("end'");
  assert.strictEqual(result, "'end'\\'''");
});

// ── 含双引号路径 (不应特殊处理) ───────────────────────────

test('含双引号路径原样保留', () => {
  const result = AdbPathQuoter.quote('say "hello"');
  assert.strictEqual(result, "'say \"hello\"'");
});

// ── 含特殊 shell 字符 ─────────────────────────────────────

test('含 $ 变量引用字符原样保留', () => {
  // 单引号内 $ 不被解释
  const result = AdbPathQuoter.quote('/sdcard/$HOME');
  assert.strictEqual(result, "'/sdcard/$HOME'");
});

test('含反引号原样保留', () => {
  const result = AdbPathQuoter.quote('/sdcard/`whoami`');
  assert.strictEqual(result, "'/sdcard/`whoami`'");
});

test('含分号原样保留', () => {
  const result = AdbPathQuoter.quote('/sdcard/a;rm -rf');
  assert.strictEqual(result, "'/sdcard/a;rm -rf'");
});

test('含 & 后台运算符原样保留', () => {
  const result = AdbPathQuoter.quote('/sdcard/a&bg');
  assert.strictEqual(result, "'/sdcard/a&bg'");
});

test('含管道符原样保留', () => {
  const result = AdbPathQuoter.quote('/sdcard/a|cat');
  assert.strictEqual(result, "'/sdcard/a|cat'");
});

// ── 中文路径 ───────────────────────────────────────────────

test('中文路径正确处理', () => {
  const result = AdbPathQuoter.quote('/sdcard/测试文件.txt');
  assert.strictEqual(result, "'/sdcard/测试文件.txt'");
});

// ── 安全性验证 (注入防御) ─────────────────────────────────

test('命令注入尝试被中和', () => {
  // 尝试注入 rm -rf / 命令
  const malicious = "/sdcard/file; rm -rf /";
  const result = AdbPathQuoter.quote(malicious);
  assert.strictEqual(result, "'/sdcard/file; rm -rf /'");
  // 整个字符串被包在单引号内,分号不被解释
});

test('子命令替换尝试被中和', () => {
  const malicious = "$(rm -rf /)";
  const result = AdbPathQuoter.quote(malicious);
  assert.strictEqual(result, "'$(rm -rf /)'");
});

test('转义尝试被中和', () => {
  // 尝试用 ' 闭合单引号再注入
  const malicious = "'; rm -rf /; '";
  const result = AdbPathQuoter.quote(malicious);
  // 应为 ''\''; rm -rf /; '\'''  (内部 ' 全部转义,整个字符串包在单引号内)
  // bash 验证: 整段被单引号包住,分号不被解释为命令分隔符
  assert.strictEqual(result, "''\\''; rm -rf /; '\\'''");
});

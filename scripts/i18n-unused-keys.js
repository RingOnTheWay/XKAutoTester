#!/usr/bin/env node
/* eslint-disable no-console -- CLI 报告脚本, console 输出是本职 */
/**
 * i18n 死键扫描 (R26 候选⑩, R28 候选④ 升级) — 扫描 locales 下各 translation.json 中的键
 * 是否被引用: data-i18n 属性 (HTML) / i18n.t('key') (JS) / Python t("key")。
 *
 * R28 候选④ 升级:
 * - 补扫 Python (src 下全部 .py — python.* 命名空间共用同一 translation.json)
 * - 补扫 electron/*.html 顶层页面 (splash.html 自带 i18n 引导)
 * - 新增动态键白名单 (DYNAMIC_PATTERNS): 代码中运行时拼接的键族 (如
 *   settings.updateErrorCodes.${code} / settings.${source}Failed / pagePackage.select*),
 *   命中白名单的键不判死 (宁可漏杀, 不可误删)。
 *
 * 用法: node scripts/i18n-unused-keys.js [--json]
 * 输出: 死键报告 (人读或 --json 机器读), 非零退出码仅在有死键时 (CI 可选门禁)。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LOCALES = ['zh-CN', 'en-US'];

/** 动态键白名单: 运行时拼接的键族前缀/模式 (命中即不判死) */
const DYNAMIC_PATTERNS = [
  /^settings\.updateErrorCodes\./, // settings/controller.js: `settings.updateErrorCodes.${err.code}`
  /^settings\.\w+Failed$/, // settings/controller.js: `settings.${source}Failed` (source=emitError 来源)
  /^pagePackage\.select/, // page-package/view.js: `pagePackage.select${Type}` (App/Page/Element)
  /^testCase\.(fileNameRequired|selectCaseFirst|selectAppFirst|saveFailed)$/, // test-case/controller.js: `testCase.${msgKey}` (TestCaseEditor emitError message)
  /^pagePackage\.(nameRequired|valueRequired|saveFailed|deleteFailed|selectAppFirst|selectPageFirst)$/, // page-package/controller.js: `pagePackage.${message}` (model emitError message)
];

/** 递归收集文件 */
function walk(dir, exts, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      // 跳过构建产物/依赖/备份
      if (['node_modules', 'dist', 'out', 'dist-electron', 'trae-backup', 'env'].includes(e.name)) continue;
      walk(p, exts, acc);
    } else if (exts.some((x) => e.name.endsWith(x))) {
      acc.push(p);
    }
  }
  return acc;
}

/** 扁平化嵌套 JSON 键: {a:{b:{c:1}}} → ['a.b.c'] */
function flatten(obj, prefix = '') {
  const keys = [];
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) keys.push(...flatten(v, key));
    else keys.push(key);
  }
  return keys;
}

// 引用面收集: renderer HTML+JS + 主进程 JS + Python 后端 + electron 顶层 HTML (splash)
const refFiles = [
  ...walk(path.join(ROOT, 'electron', 'renderer'), ['.html', '.js']),
  ...walk(path.join(ROOT, 'electron', 'src'), ['.js']),
  ...walk(path.join(ROOT, 'src'), ['.py']), // R28: python.* 命名空间共用同一 translation.json
];
// electron 顶层 HTML (splash.html 自带 i18n 引导, 不在 renderer/ 下)
for (const f of fs.readdirSync(path.join(ROOT, 'electron'))) {
  const p = path.join(ROOT, 'electron', f);
  if (f.endsWith('.html') && fs.statSync(p).isFile()) refFiles.push(p);
}
const refBlob = refFiles.map((f) => fs.readFileSync(f, 'utf8')).join('\n');

let totalDead = 0;
let totalWhitelisted = 0;
const report = {};

for (const locale of LOCALES) {
  const file = path.join(ROOT, 'electron', 'locales', locale, 'translation.json');
  if (!fs.existsSync(file)) continue;
  const keys = flatten(JSON.parse(fs.readFileSync(file, 'utf8')));
  // 前缀缩窄: i18n key 引用形态 'ns.key...' — 以完整键或其首个命名空间段比对
  const dead = keys.filter((k) => !refBlob.includes(k) && !DYNAMIC_PATTERNS.some((re) => re.test(k)));
  const whitelisted = keys.filter((k) => refBlob.includes(k) === false && DYNAMIC_PATTERNS.some((re) => re.test(k)));
  report[locale] = dead;
  totalDead += dead.length;
  totalWhitelisted += whitelisted.length;
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  for (const [locale, dead] of Object.entries(report)) {
    console.log(`\n[${locale}] ${dead.length} 个疑似死键 (前 30):`);
    dead.slice(0, 30).forEach((k) => console.log(`  ${k}`));
    if (dead.length > 30) console.log(`  ... 及另外 ${dead.length - 30} 个`);
  }
  console.log(`\n合计: ${totalDead} 个疑似死键 (跨 ${LOCALES.join('/')} 共有判定)`);
  console.log(`动态键白名单豁免: ${totalWhitelisted} 个 (运行时拼接键族, 见脚本 DYNAMIC_PATTERNS)`);
}
process.exit(totalDead > 0 ? 1 : 0);

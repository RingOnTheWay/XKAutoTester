// 一次性 Prettier 格式化：API 模式 + rename 原子写（绕过环境写拦截）
// 用法: node scripts/format_all.cjs <root>   (root 为 electron 目录)
const path = require('path');
const fs = require('fs');
const prettier = require('prettier');

const root = process.argv[2] || '.';
const files = [];

async function main() {
  (function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.name === 'node_modules' || ent.name === '.git' || ent.name === 'dist' || ent.name === 'out') continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (full.endsWith('.js')) files.push(full);
    }
  })(path.join(root, 'src'));
  (function walk2(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.name === 'node_modules' || ent.name === '.git') continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk2(full);
      else if (full.endsWith('.js')) files.push(full);
    }
  })(path.join(root, 'renderer'));

  let changed = 0;
  let failed = 0;
  const tmp = path.join(root, '.prettier-tmp');
  for (const file of files) {
    try {
      const src = fs.readFileSync(file, 'utf8');
      // 显式加载 .prettierrc 配置 (prettier 3 API 不会自动应用项目配置)
      const config = (await prettier.resolveConfig(file)) || {};
      const out = await prettier.format(src, { ...config, filepath: path.resolve(file) });
      if (out !== src) {
        fs.writeFileSync(tmp, out);
        fs.renameSync(tmp, file);
        changed++;
      }
    } catch (e) {
      failed++;
      console.log('FAIL:', file, e.message.split('\n')[0]);
    }
  }
  console.log(`prettier done: ${changed} reformatted, ${failed} failed, ${files.length} total`);
}

main().catch((e) => { console.error(e); process.exit(1); });

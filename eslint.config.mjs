// ESLint 9 flat config — XKAutoTester
// 混合环境: electron/src/main (CommonJS) + electron/renderer (ESM) + tests (CommonJS)
// 渐进收口: 当前仅启用低误报规则 (no-undef/no-unused-vars/no-console),
// 违规清零后按需收紧 (缩进/引号等交给 Prettier 管)。
// R25 P3-17: config 位于项目根, 使 base path 覆盖 ../tests (原 electron/ 内 config
// 无法 lint base path 外的 tests)。globals 包在 electron/node_modules, 经 createRequire 显式加载。
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const globals = require('./electron/node_modules/globals');

export default [
  {
    ignores: [
      // R25 P3-17: config 移至项目根 (base path 需覆盖 ../tests),
      // ignores 相对项目根
      'electron/out/**',
      'electron/dist/**',
      'electron/node_modules/**',
      'electron/patch-nsis.js',   // 打包脚本, 一次性工具
      'node_modules/**',
      'env/**',
      'trae-backup/**',
    ],
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        // Node (main + tests + preload)
        ...globals.node,
        // Browser (renderer)
        ...globals.browser,
        // Electron 特有
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        global: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',                        // 未定义标识符 (防拼写错误)
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],  // console.log 残留提示
      'no-constant-condition': 'warn',            // if (true) 等
      'no-dupe-keys': 'error',
      'no-duplicate-case': 'error',
      'no-unreachable': 'error',
    },
  },
  {
    // R25 P3-17: tests 纳入 lint 后暴露大量既有"解构只取部分"的未用变量 (测试惯用法,
    // 48 处散布 20+ 文件)。豁免 no-unused-vars 防误报, 其余规则 (no-undef 等 error 级) 照常生效。
    files: ['tests/**/*.js'],
    rules: {
      'no-unused-vars': 'off',
    },
  },
];

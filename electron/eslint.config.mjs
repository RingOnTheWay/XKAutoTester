// ESLint 9 flat config — XKAutoTester
// 混合环境: electron/src/main (CommonJS) + electron/renderer (ESM) + tests (CommonJS)
// 渐进收口: 当前仅启用低误报规则 (no-undef/no-unused-vars/no-console),
// 违规清零后按需收紧 (缩进/引号等交给 Prettier 管)。
import globals from 'globals';

export default [
  {
    ignores: [
      'out/**',
      'dist/**',
      'node_modules/**',
      'patch-nsis.js',          // 打包脚本, 一次性工具
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
];

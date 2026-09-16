/**
 * 测试文件条目工具 - test-execution 领域纯函数
 *
 * R26 候选④: 原挂在 test-execution/model.js 的模块级纯函数迁 core/utils ——
 * view 需要 inferTestTypeFromFileName (getModalSelectedTestFiles), 不应
 * 反向 import model (MVC 方向: model → controller → view)。
 * model.js 保留 re-export 兼容既有测试/调用方。
 */

/**
 * 从文件条目 (字符串 | {name|path}) 提取用例名: 剥 .py 后缀 + 取 basename
 * (收敛 model 内三处重复: checkAndroidDeviceRequired / checkDeviceConfig / checkBlePortConfig)
 * @param {string|{name?:string, path?:string}} file
 * @returns {string}
 */
export function toCaseFileName(file) {
  let name = typeof file === 'string' ? file : (file && (file.name || file.path)) || '';
  if (name.endsWith('.py')) name = name.slice(0, -3);
  if (name.includes('/') || name.includes('\\')) name = name.split(/[\\/]/).pop();
  return name;
}

/**
 * 从文件名推断测试类型 (领域规则单点, 原散在 view.getModalSelectedTestFiles 字符串嗅探)
 * @param {string} fileName
 * @returns {'appium'|'playwright'|'status'|'unit'}
 */
export function inferTestTypeFromFileName(fileName) {
  if (fileName.includes('appium')) return 'appium';
  if (fileName.includes('playwright')) return 'playwright';
  if (fileName.includes('check_app_status')) return 'status';
  return 'unit';
}

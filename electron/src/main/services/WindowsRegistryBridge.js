/**
 * Windows 注册表桥接
 * 将 UserDataPath 写入 HKCU\Software\XKAutoTester
 *
 * 平台策略: 仅 Windows 执行 reg 命令; 其他平台 noop。
 * 抽出目的: 隔离平台特定逻辑,便于测试 mock。
 *
 * 改用 spawnSync 数组参数避免 shell 解析: 原 execSync 字符串拼接有命令注入风险
 * (valueName 未转义, escapedPath 仅替换 " 未处理 &|%^ 等 cmd 元字符)
 */
const { spawnSync } = require('child_process');

class WindowsRegistryBridge {
  constructor(registryKey = 'HKCU\\Software\\XKAutoTester') {
    this.registryKey = registryKey;
  }

  /**
   * 写入字符串值到注册表
   * @param {string} valueName - 注册表值名 (如 'UserDataPath')
   * @param {string} dataPath - 字符串数据
   */
  writePath(valueName, dataPath) {
    if (process.platform !== 'win32') return;
    try {
      // spawnSync 数组参数不经 shell 解析: 根除命令注入
      const result = spawnSync(
        'reg',
        ['add', this.registryKey, '/v', valueName, '/t', 'REG_SZ', '/d', dataPath, '/f'],
        {
          windowsHide: true,
          encoding: 'utf8',
        }
      );
      if (result.status !== 0) {
        console.error('[WindowsRegistryBridge] reg add 失败:', result.stderr || result.stdout);
      }
    } catch (error) {
      console.error('[WindowsRegistryBridge] 写入注册表失败:', error);
    }
  }
}

module.exports = WindowsRegistryBridge;

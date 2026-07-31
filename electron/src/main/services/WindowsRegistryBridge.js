/**
 * Windows 注册表桥接
 * 将 UserDataPath 写入 HKCU\Software\XKAutoTester
 *
 * 平台策略: 仅 Windows 执行 reg 命令; 其他平台 noop。
 * 抽出目的: 隔离平台特定逻辑,便于测试 mock。
 */
const { execSync } = require('child_process');

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
            const escapedPath = dataPath.replace(/"/g, '\\"');
            execSync(`reg add "${this.registryKey}" /v ${valueName} /t REG_SZ /d "${escapedPath}" /f`, {
                windowsHide: true
            });
        } catch (error) {
            console.error('[WindowsRegistryBridge] 写入注册表失败:', error);
        }
    }
}

module.exports = WindowsRegistryBridge;

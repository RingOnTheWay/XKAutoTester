const path = require('path');
const fs = require('fs');

// ── 驱动相关常量 ──────────────────────────────────────────────────
const DRIVER_INSTALLER_DIR = 'CP210x_Windows_Drivers';
const DRIVER_INSTALLER_X64 = 'CP210xVCPInstaller_x64.exe';
const DRIVER_INSTALLER_X86 = 'CP210xVCPInstaller_x86.exe';
const DRIVER_SYS_FILENAME = 'silabser.sys';
const REG_KEY = 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\silabser';
const INF_PATTERN = 'oem*.inf';
const INSTALLER_PROCESS_NAME = 'CP210xVCPInstaller';

/**
 * DriverChecker - CP210x 驱动检测 / 安装包路径 / 安装进程检测
 *
 * 平台策略: Win 真实逻辑, 非 Win 返回 stub (no-op)
 * - getDriverInstallerPath → null
 * - checkCP210xDriver → warning + canInstall: false
 * - isInstallerRunning → false
 */
class DriverChecker {
  /**
   * @param {Object} i18nService - 国际化服务 (需 t 方法)
   * @param {string} projectRoot - 项目根路径
   * @param {{executeCommand: Function}} spawnHelper - spawn helper
   */
  constructor(i18nService, projectRoot, spawnHelper) {
    this.i18nService = i18nService;
    this.projectRoot = projectRoot;
    this.executeCommand = spawnHelper.executeCommand;
    this.isWindows = process.platform === 'win32';
  }

  /**
   * 查找 CP210x 驱动安装包路径 (x64 优先, 然后 x86)
   * @returns {string|null} 安装包绝对路径, 不存在返回 null
   */
  getDriverInstallerPath() {
    if (!this.isWindows) return null;

    const possiblePaths = [
      path.join(this.projectRoot, 'env', DRIVER_INSTALLER_DIR, DRIVER_INSTALLER_X64),
      path.join(this.projectRoot, 'env', DRIVER_INSTALLER_DIR, DRIVER_INSTALLER_X86),
    ];

    for (const installerPath of possiblePaths) {
      if (fs.existsSync(installerPath)) {
        return installerPath;
      }
    }

    return null;
  }

  /**
   * 检查 CP210x 驱动安装状态
   *
   * 检测顺序: silabser.sys 文件 → 注册表 → oem*.inf 文件
   * 任一命中 → success, 全部未命中 → warning + canInstall
   *
   * @returns {Promise<{status: string, message: string, canInstall?: boolean, installerPath?: string|null}>}
   */
  async checkCP210xDriver() {
    if (!this.isWindows) {
      return {
        status: 'warning',
        message: this.i18nService.t('splash.checks.cp210NotFound'),
        canInstall: false,
        installerPath: null,
      };
    }

    try {
      const systemRoot = process.env.SystemRoot || 'C:\\Windows';
      const driverSysPath = path.join(systemRoot, 'System32', 'drivers', DRIVER_SYS_FILENAME);

      // 1. silabser.sys 文件存在 → 驱动已安装
      if (fs.existsSync(driverSysPath)) {
        return {
          status: 'success',
          message: this.i18nService.t('splash.checks.cp210Found'),
        };
      }

      // 2. 注册表查询 silabser 服务
      const regResult = await this.executeCommand('reg.exe', ['query', REG_KEY]);
      if (regResult.code === 0 && regResult.stdout.includes('silabser')) {
        const hasDeleteFlag =
          regResult.stdout.match(/DriverDelete\s+REG_DWORD\s+0x1/i) ||
          regResult.stdout.match(/DeleteFlag\s+REG_DWORD\s+0x1/i);
        const startMatch = regResult.stdout.match(/Start\s+REG_DWORD\s+0x(\d+)/i);
        const isDisabled = startMatch && startMatch[1] === '4';

        if (!hasDeleteFlag && !isDisabled) {
          return {
            status: 'success',
            message: this.i18nService.t('splash.checks.cp210Found'),
          };
        }
      }

      // 3. oem*.inf 文件中含 silabser → 驱动已安装
      const driverStoreResult = await this.executeCommand('findstr.exe', [
        '/i',
        '/m',
        'silabser',
        path.join(systemRoot, 'INF', INF_PATTERN),
      ]);
      if (driverStoreResult.code === 0 && driverStoreResult.stdout.includes('.inf')) {
        return {
          status: 'success',
          message: this.i18nService.t('splash.checks.cp210Found'),
        };
      }

      // 全部未命中 → 提示安装
      const installerPath = this.getDriverInstallerPath();
      return {
        status: 'warning',
        message: this.i18nService.t('splash.checks.cp210NotFound'),
        canInstall: !!installerPath,
        installerPath: installerPath,
      };
    } catch (error) {
      const installerPath = this.getDriverInstallerPath();
      return {
        status: 'warning',
        message: this.i18nService.t('splash.checks.cp210xCheckFailed', {
          error: error.message,
        }),
        canInstall: !!installerPath,
        installerPath: installerPath,
      };
    }
  }

  /**
   * 检测 CP210x 安装程序是否正在运行 (x64 + x86)
   * @returns {Promise<boolean>}
   */
  async isInstallerRunning() {
    if (!this.isWindows) return false;

    try {
      const result = await this.executeCommand('tasklist', ['/FI', `IMAGENAME eq ${DRIVER_INSTALLER_X64}`, '/NH']);
      if (result.stdout.includes(INSTALLER_PROCESS_NAME)) {
        return true;
      }
      const result86 = await this.executeCommand('tasklist', ['/FI', `IMAGENAME eq ${DRIVER_INSTALLER_X86}`, '/NH']);
      return result86.stdout.includes(INSTALLER_PROCESS_NAME);
    } catch {
      return false;
    }
  }
}

module.exports = DriverChecker;

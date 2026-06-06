const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const pathHelper = require('../utils/pathHelper');

class EnvironmentService {
  constructor(i18nService, projectRoot) {
    this.i18nService = i18nService;
    this.projectRoot = projectRoot;
    this.pythonConfigured = false;
  }

  async configurePythonEnvironment() {
    if (this.pythonConfigured) return;

    const embeddedPython = pathHelper.getEmbeddedPythonPath(this.projectRoot);
    if (embeddedPython) {
      this.configureEmbeddedPythonPth(embeddedPython);
      pathHelper.setPythonConfig({
        pythonPath: embeddedPython,
        isEmbedded: true,
        isSystem: false,
        sitePackagesPath: pathHelper.getVenvSitePackagesPath(this.projectRoot),
        sourceLabel: `(${this.i18nService.t('splash.checks.sourceBuiltIn')})`
      });
      this.pythonConfigured = true;
      return;
    }

    const venvPython = pathHelper.getVenvPythonPath(this.projectRoot);
    if (venvPython) {
      const testResult = await this.executeCommand(venvPython, ['--version']);
      if (testResult.code === 0) {
        pathHelper.setPythonConfig({
          pythonPath: venvPython,
          isEmbedded: false,
          isSystem: false,
          sitePackagesPath: null,
          sourceLabel: `(${this.i18nService.t('splash.checks.sourceBuiltIn')})`
        });
        this.pythonConfigured = true;
        return;
      }

      const pythonHome = await this.findPythonHome();
      if (pythonHome) {
        pathHelper.fixPyvenvCfg(this.projectRoot, pythonHome);
        const retryResult = await this.executeCommand(venvPython, ['--version']);
        if (retryResult.code === 0) {
          pathHelper.setPythonConfig({
            pythonPath: venvPython,
            isEmbedded: false,
            isSystem: false,
            sitePackagesPath: null,
            sourceLabel: `(${this.i18nService.t('splash.checks.sourceBuiltIn')})`
          });
          this.pythonConfigured = true;
          return;
        }
      }
    }

    const systemPython = await this.findSystemPython();
    if (systemPython) {
      pathHelper.setPythonConfig({
        pythonPath: systemPython,
        isEmbedded: false,
        isSystem: true,
        sitePackagesPath: pathHelper.getVenvSitePackagesPath(this.projectRoot),
        sourceLabel: `(${this.i18nService.t('splash.checks.sourceSystem')})`
      });
      this.pythonConfigured = true;
      return;
    }

    pathHelper.setPythonConfig(null);
    this.pythonConfigured = true;
  }

  configureEmbeddedPythonPth(embeddedPythonPath) {
    const pythonDir = path.dirname(embeddedPythonPath);
    const pthFiles = fs.readdirSync(pythonDir).filter(f => f.endsWith('._pth'));

    if (pthFiles.length === 0) return;

    const pthFilePath = path.join(pythonDir, pthFiles[0]);
    const marker = '# XKAutoTester configured';

    try {
      const existingContent = fs.readFileSync(pthFilePath, 'utf8');
      if (existingContent.includes(marker)) return;

      const sitePackagesPath = pathHelper.getVenvSitePackagesPath(this.projectRoot);
      const venvSitePackages = path.relative(pythonDir, sitePackagesPath).replace(/\\/g, '/');
      const srcPath = path.relative(pythonDir, path.join(this.projectRoot, 'src')).replace(/\\/g, '/');

      const newContent = [
        'python312.zip',
        '.',
        venvSitePackages,
        srcPath,
        '',
        '# Uncomment to run site.main() (automatically done by site.py)',
        'import site',
        '',
        marker
      ].join('\n');

      fs.writeFileSync(pthFilePath, newContent, 'utf8');
    } catch (error) {
    }
  }

  async findSystemPython() {
    try {
      const result = await this.executeCommand('where', ['python']);
      if (result.code !== 0) return null;

      const paths = result.stdout.split('\n').map(p => p.trim()).filter(p => p && p.endsWith('.exe'));
      for (const p of paths) {
        if (p.toLowerCase().includes('windowsapps')) continue;
        const testResult = await this.executeCommand(p, ['--version']);
        if (testResult.code === 0) return p;
      }
      return null;
    } catch {
      return null;
    }
  }

  async findPythonHome() {
    const embeddedPython = pathHelper.getEmbeddedPythonPath(this.projectRoot);
    if (embeddedPython) {
      return path.dirname(embeddedPython);
    }

    try {
      const systemPython = await this.findSystemPython();
      if (systemPython) {
        const result = await this.executeCommand(systemPython, ['-c', 'import sys; print(sys.base_prefix)']);
        if (result.code === 0) return result.stdout.trim();
      }
    } catch { }

    return null;
  }

  async findUvCommand() {
    try {
      const result = await this.executeCommand('where', ['uv']);
      if (result.code === 0) {
        const paths = result.stdout.split('\n').map(p => p.trim()).filter(p => p);
        return paths[0] || null;
      }
    } catch { }
    return null;
  }

  async executeCommand(command, args = [], options = {}) {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, {
        ...options,
        windowsHide: true,
        env: { ...process.env, ...(options.env || {}) }
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        resolve({
          code,
          stdout: stdout.trim(),
          stderr: stderr.trim()
        });
      });

      proc.on('error', (error) => {
        reject(error);
      });
    });
  }

  getDriverInstallerPath() {
    const possiblePaths = [
      path.join(this.projectRoot, 'env', 'CP210x_Windows_Drivers', 'CP210xVCPInstaller_x64.exe'),
      path.join(this.projectRoot, 'env', 'CP210x_Windows_Drivers', 'CP210xVCPInstaller_x86.exe')
    ];

    for (const installerPath of possiblePaths) {
      if (fs.existsSync(installerPath)) {
        return installerPath;
      }
    }

    return null;
  }

  async checkCP210xDriver() {
    try {
      const driverSysPath = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'drivers', 'silabser.sys');
      if (fs.existsSync(driverSysPath)) {
        return {
          status: 'success',
          message: this.i18nService.t('splash.checks.cp210Found')
        };
      }

      const regResult = await this.executeCommand('reg.exe', [
        'query',
        'HKLM\\SYSTEM\\CurrentControlSet\\Services\\silabser'
      ]);
      if (regResult.code === 0 && regResult.stdout.includes('silabser')) {
        const hasDeleteFlag = regResult.stdout.match(/DriverDelete\s+REG_DWORD\s+0x1/i) ||
                              regResult.stdout.match(/DeleteFlag\s+REG_DWORD\s+0x1/i);
        const startMatch = regResult.stdout.match(/Start\s+REG_DWORD\s+0x(\d+)/i);
        const isDisabled = startMatch && startMatch[1] === '4';

        if (!hasDeleteFlag && !isDisabled) {
          return {
            status: 'success',
            message: this.i18nService.t('splash.checks.cp210Found')
          };
        }
      }

      const driverStoreResult = await this.executeCommand('findstr.exe', [
        '/i', '/m', 'silabser',
        path.join(process.env.SystemRoot || 'C:\\Windows', 'INF', 'oem*.inf')
      ]);
      if (driverStoreResult.code === 0 && driverStoreResult.stdout.includes('.inf')) {
        return {
          status: 'success',
          message: this.i18nService.t('splash.checks.cp210Found')
        };
      }

      const installerPath = this.getDriverInstallerPath();
      return {
        status: 'warning',
        message: this.i18nService.t('splash.checks.cp210NotFound'),
        canInstall: !!installerPath,
        installerPath: installerPath
      };
    } catch (error) {
      const installerPath = this.getDriverInstallerPath();
      return {
        status: 'warning',
        message: this.i18nService.t('splash.checks.cp210xCheckFailed', { error: error.message }),
        canInstall: !!installerPath,
        installerPath: installerPath
      };
    }
  }

  async isInstallerRunning() {
    try {
      const result = await this.executeCommand('tasklist', ['/FI', 'IMAGENAME eq CP210xVCPInstaller_x64.exe', '/NH']);
      if (result.stdout.includes('CP210xVCPInstaller')) {
        return true;
      }
      const result86 = await this.executeCommand('tasklist', ['/FI', 'IMAGENAME eq CP210xVCPInstaller_x86.exe', '/NH']);
      return result86.stdout.includes('CP210xVCPInstaller');
    } catch {
      return false;
    }
  }

  getAdbPath() {
    return pathHelper.getAdbPath(this.projectRoot, true);
  }

  getAapt2Path() {
    const possiblePaths = [
      path.join(this.projectRoot, 'env', 'android-sdk', 'build-tools', 'aapt2.exe'),
      path.join(this.projectRoot, 'env', 'android-tools', 'aapt2.exe')
    ];

    for (const aapt2Path of possiblePaths) {
      if (fs.existsSync(aapt2Path)) {
        return aapt2Path;
      }
    }

    return 'aapt2';
  }

  async getSerialPorts() {
    const pythonConfig = pathHelper.getPythonConfig();
    if (!pythonConfig) {
      return { success: false, error: this.i18nService.t('splash.checks.venvNotFound') };
    }

    const listScript = 'import serial.tools.list_ports; import json; ports = serial.tools.list_ports.comports(); print(json.dumps([{"deviceId": p.device, "name": p.description, "manufacturer": p.manufacturer or "", "serial_number": p.serial_number or "", "hwid": p.hwid or "", "vid": p.vid, "pid": p.pid} for p in ports]))';

    try {
      const result = await this.executeCommand(pythonConfig.pythonPath, ['-c', listScript]);
      if (result.code !== 0) {
        return { success: false, error: result.stderr || 'Failed to list serial ports' };
      }
      const ports = JSON.parse(result.stdout || '[]');
      return { success: true, data: ports };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async checkCommandExists(command) {
    try {
      const result = await this.executeCommand('where', [command]);
      return result.code === 0 && result.stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  async checkAndroidSDK() {
    try {
      const adbPath = this.getAdbPath();
      const aapt2Path = this.getAapt2Path();

      const adbLocalExists = adbPath !== 'adb';
      const aapt2LocalExists = aapt2Path !== 'aapt2';

      let adbAvailable = adbLocalExists;
      let aapt2Available = aapt2LocalExists;

      if (!adbLocalExists) {
        adbAvailable = await this.checkCommandExists('adb');
      }
      if (!aapt2LocalExists) {
        aapt2Available = await this.checkCommandExists('aapt2');
      }

      const localComponents = [];
      const systemComponents = [];
      if (adbAvailable) {
        if (adbLocalExists) localComponents.push('adb');
        else systemComponents.push('adb');
      }
      if (aapt2Available) {
        if (aapt2LocalExists) localComponents.push('aapt2');
        else systemComponents.push('aapt2');
      }

      let sourceLabel = '';
      if (localComponents.length > 0 && systemComponents.length > 0) {
        sourceLabel = ` (${this.i18nService.t('splash.checks.sourceMixed', { local: localComponents.join(', '), system: systemComponents.join(', ') })})`;
      } else if (localComponents.length > 0) {
        sourceLabel = ` (${this.i18nService.t('splash.checks.sourceBuiltIn')})`;
      } else if (systemComponents.length > 0) {
        sourceLabel = ` (${this.i18nService.t('splash.checks.sourceSystem')})`;
      }

      if (adbAvailable && aapt2Available) {
        return {
          status: 'success',
          message: this.i18nService.t('splash.checks.androidSdkComplete') + sourceLabel
        };
      }

      const missingComponents = [];
      if (!adbAvailable) missingComponents.push('adb');
      if (!aapt2Available) missingComponents.push('aapt2');

      return {
        status: 'error',
        message: this.i18nService.t('splash.checks.missingAndroidSdkComponents', { components: missingComponents.join(', ') })
      };
    } catch (error) {
      return {
        status: 'error',
        message: this.i18nService.t('splash.checks.checkAndroidSdkFailed', { error: error.message })
      };
    }
  }

  async checkPythonEnvironment(projectRoot) {
    try {
      const pythonConfig = pathHelper.getPythonConfig();
      if (!pythonConfig) {
        return {
          status: 'error',
          message: this.i18nService.t('splash.checks.venvNotFound')
        };
      }

      const result = await this.executeCommand(pythonConfig.pythonPath, ['--version']);
      const sourceLabel = pythonConfig.sourceLabel;

      if (result.code !== 0) {
        return {
          status: 'error',
          message: this.i18nService.t('splash.checks.pythonNotFound')
        };
      }

      const versionMatch = result.stdout.match(/Python (\d+\.\d+\.\d+)/);
      if (!versionMatch) {
        return {
          status: 'error',
          message: this.i18nService.t('splash.checks.cannotGetPythonVersion')
        };
      }

      const version = versionMatch[1];
      let versionStatus = 'success';
      let versionMessage;

      if (version !== '3.12.4') {
        if (pythonConfig.isSystem) {
          return {
            status: 'error',
            message: this.i18nService.t('splash.checks.pythonVersionMismatch', { version: version, required: '3.12.4' })
          };
        }
        versionStatus = 'warning';
        versionMessage = this.i18nService.t('splash.checks.pythonVersionRecommended', { version: version, recommended: '3.12.4' }) + ' ' + sourceLabel;
      } else {
        versionMessage = this.i18nService.t('splash.checks.pythonVersion', { version: version }) + ' ' + sourceLabel;
      }

      const requirementsPath = path.join(projectRoot, 'pyproject.toml');
      if (fs.existsSync(requirementsPath)) {
        const listScript = "import importlib.metadata; dists = importlib.metadata.distributions(); [print(d.metadata['Name'] + '==' + d.version) for d in dists]";
        const pipResult = await this.executeCommand(pythonConfig.pythonPath, ['-c', listScript]);

        if (pipResult.code !== 0) {
          return {
            status: 'warning',
            message: versionMessage + ' - ' + this.i18nService.t('splash.checks.cannotCheckPackages')
          };
        }

        const installedPackages = new Set(pipResult.stdout.split('\n').map(pkg => pkg.toLowerCase().trim()).filter(pkg => pkg));

        const requirementsContent = fs.readFileSync(requirementsPath, 'utf8');
        const depsMatch = requirementsContent.match(/dependencies\s*=\s*\[([\s\S]*?)\]/);
        if (depsMatch) {
          const requirements = depsMatch[1]
            .split('\n')
            .map(line => line.trim().replace(/['"]/g, ''))
            .filter(line => line && !line.startsWith('#') && line !== '');

          let missingPackages = [];
          for (const req of requirements) {
            const pkgName = req.split(/[<>=~!]/)[0].toLowerCase().trim();
            let found = false;
            for (const installedPkg of installedPackages) {
              if (installedPkg.startsWith(`${pkgName}==`) || installedPkg.startsWith(`${pkgName}>=`)) {
                found = true;
                break;
              }
            }
            if (!found) {
              missingPackages.push(req);
            }
          }

          if (missingPackages.length > 0) {
            return {
              status: 'warning',
              message: this.i18nService.t('splash.checks.missingPackages', { versionMessage: versionMessage, packages: missingPackages.join(', ') })
            };
          }
        }
      }

      return {
        status: versionStatus,
        message: versionMessage
      };
    } catch (error) {
      return {
        status: 'error',
        message: this.i18nService.t('splash.checks.checkPythonEnvironmentFailed', { error: error.message })
      };
    }
  }

  checkNodeModules() {
    try {
      if (app.isPackaged) {
        return {
          status: 'success',
          message: this.i18nService.t('splash.checks.nodeModulesComplete')
        };
      }

      const nodeModulesPath = path.join(__dirname, '..', '..', '..', 'node_modules');
      const packageJsonPath = path.join(__dirname, '..', '..', '..', 'package.json');

      if (!fs.existsSync(nodeModulesPath)) {
        return {
          status: 'error',
          message: this.i18nService.t('splash.checks.nodeModulesNotFound')
        };
      }

      if (!fs.existsSync(packageJsonPath)) {
        return {
          status: 'warning',
          message: this.i18nService.t('splash.checks.packageJsonNotFound')
        };
      }

      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
      const depNames = Object.keys(dependencies);

      if (depNames.length === 0) {
        return {
          status: 'success',
          message: this.i18nService.t('splash.checks.nodeModulesComplete')
        };
      }

      const missingDeps = [];
      for (const depName of depNames) {
        const depPath = path.join(nodeModulesPath, depName);
        if (!fs.existsSync(depPath)) {
          missingDeps.push(depName);
        }
      }

      if (missingDeps.length > 0) {
        if (missingDeps.length <= 5) {
          return {
            status: 'error',
            message: this.i18nService.t('splash.checks.nodeModulesMissing', { deps: missingDeps.join(', ') })
          };
        } else {
          return {
            status: 'error',
            message: this.i18nService.t('splash.checks.nodeModulesMissingMany', { count: missingDeps.length })
          };
        }
      }

      return {
        status: 'success',
        message: this.i18nService.t('splash.checks.nodeModulesComplete')
      };
    } catch (error) {
      return {
        status: 'error',
        message: this.i18nService.t('splash.checks.checkNodeModulesFailed', { error: error.message })
      };
    }
  }

  async runEnvironmentChecks(projectRoot, splashWindow) {
    const checks = [
      {
        name: this.i18nService.t('splash.checks.cp210DriverCheck'),
        check: () => this.checkCP210xDriver(),
        isRequired: false
      },
      {
        name: 'Android SDK',
        check: () => this.checkAndroidSDK(),
        isRequired: true
      },
      {
        name: this.i18nService.t('splash.checks.pythonEnvironment'),
        check: () => this.checkPythonEnvironment(projectRoot),
        isRequired: true
      },
      {
        name: this.i18nService.t('splash.checks.nodeModulesCheck'),
        check: () => this.checkNodeModules(),
        isRequired: true
      }
    ];

    const results = {
      required: [],
      warnings: []
    };

    for (let i = 0; i < checks.length; i++) {
      const check = checks[i];
      const progress = Math.round(((i + 1) / (checks.length + 1)) * 100);

      if (splashWindow) {
        splashWindow.webContents.send('check-progress', {
          percentage: progress,
          message: this.i18nService.t('splash.checks.checking', { name: check.name })
        });
      }

      try {
        const result = await check.check();

        if (splashWindow) {
          splashWindow.webContents.send('check-result', {
            name: check.name,
            status: result.status,
            message: result.message,
            isRequired: check.isRequired,
            canInstall: result.canInstall || false,
            installerPath: result.installerPath || null
          });
        }

        if (result.status === 'error') {
          if (check.isRequired) {
            results.required.push(`${check.name}: ${result.message}`);
          } else {
            results.warnings.push(`${check.name}: ${result.message}`);
          }
        } else if (result.status === 'warning') {
          results.warnings.push(`${check.name}: ${result.message}`);
        }
      } catch (error) {
        if (splashWindow) {
          splashWindow.webContents.send('check-result', {
            name: check.name,
            status: 'error',
            message: this.i18nService.t('splash.checks.checkFailed', { error: error.message }),
            isRequired: check.isRequired
          });
        }

        if (check.isRequired) {
          results.required.push(`${check.name}: ${this.i18nService.t('splash.checks.checkFailedShort')}`);
        } else {
          results.warnings.push(`${check.name}: ${this.i18nService.t('splash.checks.checkFailedShort')}`);
        }
      }

      await new Promise(resolve => setTimeout(resolve, 300));
    }

    return results;
  }
}

module.exports = EnvironmentService;

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class EnvironmentService {
  constructor(i18nService) {
    this.i18nService = i18nService;
  }

  async executeCommand(command, args = [], options = {}) {
    return new Promise((resolve, reject) => {
      const process = spawn(command, args, {
        ...options,
        windowsHide: true
      });
      
      let stdout = '';
      let stderr = '';
      
      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      process.on('close', (code) => {
        resolve({
          code,
          stdout: stdout.trim(),
          stderr: stderr.trim()
        });
      });
      
      process.on('error', (error) => {
        reject(error);
      });
    });
  }

  async checkCP210xDriver() {
    try {
      const result = await this.executeCommand('powershell.exe', [
        '-Command',
        'Get-PnpDevice | Where-Object {$_.FriendlyName -like "*CP210*"} | Select-Object Status, Class, FriendlyName, InstanceId | Format-List'
      ]);
      
      if (result.code === 0 && result.stdout.includes('CP210')) {
        return {
          status: 'success',
          message: this.i18nService.t('splash.checks.cp210Found')
        };
      } else {
        return {
          status: 'error',
          message: this.i18nService.t('splash.checks.cp210NotFound')
        };
      }
    } catch (error) {
      return {
        status: 'error',
        message: `检查CP210x驱动失败: ${error.message}`
      };
    }
  }

  async checkAndroidSDK() {
    try {
      const androidHome = process.env.ANDROID_HOME;
      if (!androidHome) {
        return {
          status: 'error',
          message: 'ANDROID_HOME环境变量未设置'
        };
      }
      
      const requiredComponents = [
        'tools/android.bat',
        'platform-tools/adb.exe',
        'build-tools',
        'extras/google/usb_driver',
        'extras/google/webdriver'
      ];
      
      let missingComponents = [];
      for (const component of requiredComponents) {
        const componentPath = path.join(androidHome, component);
        if (!fs.existsSync(componentPath)) {
          missingComponents.push(component);
        }
      }
      
      if (missingComponents.length === 0) {
        return {
          status: 'success',
          message: this.i18nService.t('splash.checks.androidSdkComplete')
        };
      } else {
        return {
          status: 'error',
          message: this.i18nService.t('splash.checks.missingAndroidSdkComponents', { components: missingComponents.join(', ') })
        };
      }
    } catch (error) {
      return {
        status: 'error',
        message: this.i18nService.t('splash.checks.checkAndroidSdkFailed', { error: error.message })
      };
    }
  }

  async checkJavaVersion() {
    try {
      const result = await this.executeCommand('java', ['-version']);
      
      const output = result.stderr;
      const versionMatch = output.match(/version "(\d+\.\d+\.\d+)/);
      
      if (versionMatch) {
        const version = versionMatch[1];
        if (version === '17.0.15') {
          return {
            status: 'success',
            message: this.i18nService.t('splash.checks.javaVersion', { version: version })
          };
        } else {
          return {
            status: 'warning',
            message: this.i18nService.t('splash.checks.javaVersionRecommended', { version: version, recommended: '17.0.15' })
          };
        }
      } else {
        return {
          status: 'error',
          message: this.i18nService.t('splash.checks.cannotGetJavaVersion')
        };
      }
    } catch (error) {
      return {
        status: 'error',
        message: this.i18nService.t('splash.checks.checkJavaVersionFailed', { error: error.message })
      };
    }
  }

  async checkPythonEnvironment(projectRoot) {
    try {
      const venvPython = path.resolve(projectRoot, '.venv', 'Scripts', 'python.exe');
      if (!fs.existsSync(venvPython)) {
        return {
          status: 'error',
          message: this.i18nService.t('splash.checks.uvVenvNotFound')
        };
      }
      
      const result = await this.executeCommand(venvPython, ['--version']);
      
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
        versionStatus = 'warning';
        versionMessage = this.i18nService.t('splash.checks.pythonVersionRecommendedUv', { version: version, recommended: '3.12.4' });
      } else {
        versionMessage = this.i18nService.t('splash.checks.pythonVersionUv', { version: version });
      }
      
      const requirementsPath = path.join(projectRoot, 'requirements.txt');
      if (fs.existsSync(requirementsPath)) {
        const pipResult = await this.executeCommand('uv', ['pip', 'list', '--format=freeze']);
        const installedPackages = new Set(pipResult.stdout.split('\n').map(pkg => pkg.toLowerCase()));
        
        const requirements = fs.readFileSync(requirementsPath, 'utf8')
          .split('\n')
          .map(line => line.trim())
          .filter(line => line && !line.startsWith('#'));
        
        let missingPackages = [];
        for (const req of requirements) {
          const pkgName = req.split(/[<>=~]/)[0].toLowerCase();
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

  async checkNodeVersion() {
    try {
      const result = await this.executeCommand('node', ['--version']);
      if (result.code !== 0) {
        return {
          status: 'error',
          message: this.i18nService.t('splash.checks.nodejsNotFound')
        };
      }
      
      const version = result.stdout.replace('v', '');
      if (version === '22.19.0') {
        return {
          status: 'success',
          message: this.i18nService.t('splash.checks.nodejsVersion', { version: version })
        };
      } else {
        return {
          status: 'warning',
          message: this.i18nService.t('splash.checks.nodejsVersionRecommended', { version: version, recommended: '22.19.0' })
        };
      }
    } catch (error) {
      return {
        status: 'error',
        message: this.i18nService.t('splash.checks.checkNodejsVersionFailed', { error: error.message })
      };
    }
  }

  async runEnvironmentChecks(projectRoot, splashWindow) {
    const checks = [
      {
        name: this.i18nService.t('splash.checks.cp210DriverCheck'),
        check: () => this.checkCP210xDriver(),
        isRequired: true
      },
      {
        name: 'Android SDK',
        check: () => this.checkAndroidSDK(),
        isRequired: true
      },
      {
        name: this.i18nService.t('splash.checks.javaVersionCheck'),
        check: () => this.checkJavaVersion(),
        isRequired: false
      },
      {
        name: this.i18nService.t('splash.checks.pythonEnvironment'),
        check: () => this.checkPythonEnvironment(projectRoot),
        isRequired: true
      },
      {
        name: this.i18nService.t('splash.checks.nodejsVersionCheck'),
        check: () => this.checkNodeVersion(),
        isRequired: false
      }
    ];
    
    const results = {
      required: [],
      warnings: []
    };
    
    for (let i = 0; i < checks.length; i++) {
      const check = checks[i];
      const progress = Math.round(((i + 1) / checks.length) * 100);
      
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
            isRequired: check.isRequired
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

const { registerHandler } = require('./base/handlerUtils');

function register(ipcMain, services) {
  const { environmentService, electronApp, testCaseService, i18nService, userDataService } = services;

  ipcMain.on('start-checks', async (event) => {
    try {
      const results = await environmentService.runEnvironmentChecks(
        electronApp.projectRoot,
        electronApp.splashWindow
      );

      if (electronApp.splashWindow) {
        electronApp.splashWindow.webContents.send('check-progress', {
          percentage: 90,
          message: i18nService.t('splash.checks.cleaningInvalidFiles')
        });
      }

      try {
        await testCaseService.cleanupOrphanedFiles();

        if (electronApp.splashWindow) {
          electronApp.splashWindow.webContents.send('check-progress', {
            percentage: 95,
            message: i18nService.t('splash.checks.migratingConfig')
          });
        }
      } catch (cleanupError) {
        console.error('清理无效用例文件失败:', cleanupError);
      }

      if (userDataService) {
        try {
          await userDataService.runMigration();
        } catch (migrationError) {
          console.error('配置迁移失败:', migrationError);
        }
      }

      if (electronApp.splashWindow) {
        electronApp.splashWindow.webContents.send('check-progress', {
          percentage: 100,
          message: i18nService.t('splash.checkComplete')
        });
        electronApp.splashWindow.webContents.send('check-complete', {
          requiredErrors: results.required,
          warnings: results.warnings
        });
      }
    } catch (error) {
      console.error('环境检查失败:', error);
      if (electronApp.splashWindow) {
        electronApp.splashWindow.webContents.send('check-complete', {
          requiredErrors: [i18nService.t('splash.checks.environmentCheckFailed', { error: error.message })],
          warnings: []
        });
      }
    }
  });

  ipcMain.on('splash-ready', () => {
    if (electronApp.splashWindow) {
      electronApp.splashWindow.close();
    }

    electronApp.createWindow();
  });

  registerHandler(ipcMain, 'install-driver', async (installerPath) => {
    const fs = require('fs');

    if (!installerPath || !fs.existsSync(installerPath)) {
      return { success: false, message: '安装程序路径不存在' };
    }

    try {
      const { exec } = require('child_process');
      const escapedPath = installerPath.replace(/'/g, "''");
      await new Promise((resolve, reject) => {
        exec(
          `powershell.exe -NoProfile -Command "Start-Process -FilePath '${escapedPath}'"`,
          (error) => {
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          }
        );
      });

      return { success: true, message: '驱动安装程序已启动' };
    } catch (error) {
      return { success: false, message: `启动安装程序失败: ${error.message}` };
    }
  });

  registerHandler(ipcMain, 'check-installer-running', async () => {
    try {
      const isRunning = await environmentService.isInstallerRunning();
      return { success: true, isRunning };
    } catch (error) {
      return { success: false, isRunning: false, error: error.message };
    }
  });

  registerHandler(ipcMain, 'recheck-cp210x-driver', async () => {
    try {
      const result = await environmentService.checkCP210xDriver();
      return {
        success: true,
        result: {
          name: i18nService.t('splash.checks.cp210DriverCheck'),
          status: result.status,
          message: result.message,
          canInstall: result.canInstall || false,
          installerPath: result.installerPath || null
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  registerHandler(ipcMain, 'getSerialPorts', () =>
    environmentService.getSerialPorts()
  );
}

module.exports = { register };

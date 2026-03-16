function register(ipcMain, services) {
  const { environmentService, electronApp } = services;

  ipcMain.on('start-checks', async (event) => {
    try {
      const results = await environmentService.runEnvironmentChecks(
        electronApp.projectRoot, 
        electronApp.splashWindow
      );
      
      if (electronApp.splashWindow) {
        electronApp.splashWindow.webContents.send('check-complete', {
          requiredErrors: results.required,
          warnings: results.warnings
        });
      }
    } catch (error) {
      console.error('环境检查失败:', error);
      if (electronApp.splashWindow) {
        electronApp.splashWindow.webContents.send('check-complete', {
          requiredErrors: [services.i18nService.t('splash.checks.environmentCheckFailed', { error: error.message })],
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

  ipcMain.on('get-config', (event) => {
    const fs = require('fs');
    const path = require('path');
    try {
      const configPath = path.join(electronApp.projectRoot, 'config', 'config.json');
      if (fs.existsSync(configPath)) {
        const data = fs.readFileSync(configPath, 'utf8');
        event.sender.send('config-data', JSON.parse(data));
      } else {
        event.sender.send('config-data', {});
      }
    } catch (error) {
      console.error('获取配置失败:', error);
      event.sender.send('config-data', {});
    }
  });
}

module.exports = { register };

const fs = require('fs');
const path = require('path');

function register(ipcMain, services) {
  const { electronApp, i18nService } = services;

  ipcMain.handle('get-config', async () => {
    try {
      const configPath = path.join(electronApp.projectRoot, 'config', 'config.json');
      if (fs.existsSync(configPath)) {
        const data = fs.readFileSync(configPath, 'utf8');
        return JSON.parse(data);
      }
      return {};
    } catch (error) {
      console.error('读取配置失败:', error);
      return {};
    }
  });

  ipcMain.handle('save-config', async (event, newConfig) => {
    try {
      const configPath = path.join(electronApp.projectRoot, 'config', 'config.json');
      let currentConfig = {};
      
      if (fs.existsSync(configPath)) {
        const data = fs.readFileSync(configPath, 'utf8');
        currentConfig = JSON.parse(data);
      }
      
      const updatedConfig = { ...currentConfig, ...newConfig };
      
      fs.writeFileSync(configPath, JSON.stringify(updatedConfig, null, 2));
      
      return { success: true };
    } catch (error) {
      console.error('保存配置失败:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('get-project-info', async () => {
    return {
      root: electronApp.projectRoot,
      version: 'v0.1.2-dev.5',
      name: 'XKAutoTester'
    };
  });

  ipcMain.handle('show-dialog', async (event, options) => {
    const { dialog } = require('electron');
    const { type, title, message, buttons } = options;
    const result = await dialog.showMessageBox(electronApp.mainWindow, {
      type: type || 'info',
      title: title || '提示',
      message: message,
      buttons: buttons || ['确定'],
      defaultId: 0,
      cancelId: 0
    });
    return result;
  });
}

module.exports = { register };

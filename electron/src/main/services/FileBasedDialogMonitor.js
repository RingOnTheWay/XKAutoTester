const path = require('path');
const fs = require('fs');
const asyncFs = require('../utils/asyncFs');

/**
 * 基于文件的未授权对话框监控器
 * 监控 unauthorized_dialog.json 触发文件，检测到后弹出 Electron 对话框
 */
class FileBasedDialogMonitor {
  /**
   * @param {Object} deps
   * @param {Electron.BrowserWindow} deps.mainWindow
   * @param {Object} deps.i18nService
   * @param {string} deps.userDataPath
   */
  constructor(deps) {
    this.mainWindow = deps.mainWindow;
    this.i18nService = deps.i18nService;
    this.userDataPath = deps.userDataPath;

    this._watcher = null;
    this._interval = null;
    this._dialogTriggerFile = path.join(this.userDataPath, 'logs', 'unauthorized_dialog.json');
  }

  start() {
    const dialogDir = path.dirname(this._dialogTriggerFile);

    const processDialogFile = async () => {
      try {
        if (fs.existsSync(this._dialogTriggerFile)) {
          const data = await asyncFs.readFile(this._dialogTriggerFile, 'utf8');
          const dialogData = JSON.parse(data);

          await this._showDialog(dialogData);

          fs.unlinkSync(this._dialogTriggerFile);
        }
      } catch (error) {
        console.error('Failed to check unauthorized dialog trigger file:', error);
      }
    };

    if (fs.existsSync(this._dialogTriggerFile)) {
      processDialogFile();
    }

    try {
      if (!fs.existsSync(dialogDir)) {
        fs.mkdirSync(dialogDir, { recursive: true });
      }

      this._watcher = fs.watch(dialogDir, (eventType, filename) => {
        if (filename === 'unauthorized_dialog.json') {
          setTimeout(processDialogFile, 100);
        }
      });

      this._watcher.on('error', (error) => {
        console.error('Unauthorized dialog file watcher failed, falling back to polling:', error);
        this._interval = setInterval(processDialogFile, 2000);
        this._watcher = null;
      });
    } catch (error) {
      console.error('Failed to create file watcher, falling back to polling:', error);
      this._interval = setInterval(processDialogFile, 2000);
    }
  }

  stop() {
    if (this._watcher) {
      this._watcher.close();
      this._watcher = null;
    }
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
  }

  async _showDialog(dialogData) {
    const { dialog } = require('electron');
    const { device_name, message } = dialogData;

    await dialog.showMessageBox(this.mainWindow, {
      type: 'warning',
      title: this.i18nService.t('testExecution.deviceSelection.deviceUnauthorizedTitle'),
      message:
        message ||
        this.i18nService.t('testExecution.deviceSelection.deviceUnauthorizedMessage', { device: device_name }),
      detail: this.i18nService.t('testExecution.deviceSelection.deviceUnauthorizedDetail'),
      buttons: [this.i18nService.t('common.confirm')],
      defaultId: 0,
      cancelId: 0,
    });
  }
}

module.exports = FileBasedDialogMonitor;

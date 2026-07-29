// File Transfer Mixin for AndroidConnectionModel
// Extracted from model.js during refactor
// Provides: file upload/download, download dir resolution, APK install

export const modelFileTransferMixin = {
  // ── 文件上传/下载 ──────────────────────────────────────────────

  async uploadFiles() {
    try {
      const result = await this._api.selectFiles();
      if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
        return null;
      }
      return result.filePaths;
    } catch (error) {
      this.emit('error', { source: 'uploadFiles', error });
      return null;
    }
  },

  async uploadFile(localPath, remotePath) {
    try {
      const result = await this._api.uploadFile(localPath, remotePath, this._state.selectedDevice);
      return result;
    } catch (error) {
      this.emit('error', { source: 'uploadFile', error });
      return { success: false, error: error.message };
    }
  },

  async downloadSelectedFiles() {
    if (this._state.selectedFiles.length === 0) return;

    try {
      let downloadDir = await this.resolveDownloadDirectory();

      if (!downloadDir) {
        const result = await this._api.selectDirectory();
        if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
          downloadDir = result.filePaths[0];
        } else {
          return;
        }
      }

      return { downloadDir, files: this._state.selectedFiles };
    } catch (error) {
      this.emit('error', { source: 'downloadSelectedFiles', error });
      return null;
    }
  },

  async downloadFile(file, downloadDir) {
    try {
      const localPath = `${downloadDir}/${file.name}`;
      const result = await this._api.downloadFile(file.path, localPath, this._state.selectedDevice);
      return result;
    } catch (error) {
      this.emit('error', { source: 'downloadFile', error });
      return { success: false, error: error.message };
    }
  },

  async resolveDownloadDirectory() {
    try {
      const config = await this._api.getConfig();
      const defaultDownloadPath = config?.APP_SETTINGS?.default_download_directory;

      if (defaultDownloadPath) {
        const exists = await this._api.checkPathExists(defaultDownloadPath);
        if (exists) return defaultDownloadPath;

        // invokeWithCheck 已保证失败时抛错，此处直接返回
        await this._api.createDirectory(defaultDownloadPath);
        return defaultDownloadPath;

        // 目录不存在且无法创建，弹窗提示
        const dialogResult = await this._api.showDialog({
          type: 'warning',
          title: window.i18n.t('fileManager.directoryNotFound'),
          message: window.i18n.t('fileManager.directoryNotFoundMessage', { path: defaultDownloadPath }),
          buttons: [window.i18n.t('common.clear'), window.i18n.t('common.cancel')],
          defaultId: 0,
          cancelId: 1,
        });

        if (dialogResult.response === 0) {
          const currentConfig = await this._api.getConfig();
          const updatedSettings = { ...currentConfig.APP_SETTINGS, default_download_directory: '' };
          await this._api.saveConfig({ APP_SETTINGS: updatedSettings });
        }
      }
    } catch (error) {
      this.emit('error', { source: 'resolveDownloadDirectory', error });
    }
    return null;
  },

  async selectDownloadDirectory() {
    try {
      const result = await this._api.selectDirectory();
      if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
        return result.filePaths[0];
      }
    } catch (error) {
      this.emit('error', { source: 'selectDownloadDirectory', error });
    }
    return null;
  },

  // ── APK 安装 ───────────────────────────────────────────────────

  async installApk() {
    if (!this._state.selectedDevice) {
      this.emit('install-apk-error', { message: window.i18n.t('fileManager.selectDeviceFirst') });
      return null;
    }

    try {
      const result = await this._api.selectApkFile();
      if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
        return null;
      }
      const apkPath = result.filePaths[0];
      const installResult = await this._api.installApk(apkPath, this._state.selectedDevice);
      this.emit('install-apk-result', installResult);
      return installResult;
    } catch (error) {
      this.emit('error', { source: 'installApk', error });
      return { success: false, error: error.message };
    }
  },
};

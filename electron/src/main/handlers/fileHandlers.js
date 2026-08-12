const { registerHandler } = require('./base/handlerUtils');
const { dialog, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { IPC_CHANNELS } = require('../../shared/constants');
const { isAllowedExternalUrl } = require('../utils/urlGuard');

function register(ipcMain, services) {
  const { electronApp, i18nService } = services;

  registerHandler(ipcMain, IPC_CHANNELS.SELECT_DIRECTORY, () =>
    dialog.showOpenDialog(electronApp.mainWindow, { properties: ['openDirectory'] })
  );

  registerHandler(ipcMain, IPC_CHANNELS.SELECT_FILE, () =>
    dialog.showOpenDialog(electronApp.mainWindow, {
      properties: ['openFile'],
      filters: [
        { name: 'Python Files', extensions: ['py'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
  );

  registerHandler(ipcMain, IPC_CHANNELS.SELECT_FILES, () => {
    const title = i18nService ? i18nService.t('fileManager.upload') : 'Upload';
    return dialog.showOpenDialog(electronApp.mainWindow, {
      title,
      buttonLabel: title,
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'All Files', extensions: ['*'] }]
    });
  });

  registerHandler(ipcMain, IPC_CHANNELS.SELECT_APK_FILE, () =>
    dialog.showOpenDialog(electronApp.mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'Android Package', extensions: ['apk'] }]
    })
  );

  registerHandler(ipcMain, IPC_CHANNELS.CHECK_PATH_EXISTS, (pathToCheck) => {
    try {
      return fs.existsSync(pathToCheck);
    } catch (error) {
      console.error('检查路径失败:', error);
      return false;
    }
  });

  registerHandler(ipcMain, IPC_CHANNELS.CREATE_DIRECTORY, (dirPath) => {
    fs.mkdirSync(dirPath, { recursive: true });
    return { success: true };
  });

  // openExternal 强制 https: + 白名单 host, 防止 XSS 注入危险协议/任意域外跳。
  // 文件打开应走 OPEN_PATH (shell.openPath), 不应通过 openExternal + file://。
  registerHandler(ipcMain, IPC_CHANNELS.OPEN_EXTERNAL, (url) => {
    const { allowed, reason } = isAllowedExternalUrl(url);
    if (!allowed) {
      console.error(`[openExternal] 拒绝打开 URL: ${url} (${reason})`);
      return { success: false, error: `不允许打开此链接: ${reason}` };
    }
    return shell.openExternal(url);
  });

  registerHandler(ipcMain, IPC_CHANNELS.OPEN_PATH, (pathToOpen) => {
    if (!fs.existsSync(pathToOpen)) {
      return { success: false, error: 'Path does not exist' };
    }
    shell.openPath(pathToOpen);
    return { success: true };
  });

  registerHandler(ipcMain, IPC_CHANNELS.SAVE_TEST_CASE, (data) => {
    const { directory, fileName, content } = data;

    let finalFileName = fileName.trim();
    if (!finalFileName.endsWith('.py')) {
      finalFileName = finalFileName + '.py';
    }

    const filePath = path.join(directory, finalFileName);

    const defaultContent = content || `# ${finalFileName}
# 测试用例文件

import pytest


class Test${finalFileName.replace('.py', '').replace(/[-\s]/g, '_')}:
    """测试类"""
    
    def test_example(self):
        """示例测试用例"""
        # TODO: 实现测试逻辑
        assert True
`;

    fs.writeFileSync(filePath, defaultContent, 'utf8');

    return {
      success: true,
      filePath: filePath,
      fileName: finalFileName
    };
  });

  registerHandler(ipcMain, IPC_CHANNELS.DELETE_TEST_CASE, async (data) => {
    const { filePath } = data;

    if (!filePath || !fs.existsSync(filePath)) {
      return { success: false, error: '文件不存在' };
    }

    await shell.trashItem(filePath);

    return { success: true };
  });
}

module.exports = { register };

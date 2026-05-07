const { registerHandler } = require('./base/handlerUtils');
const { dialog, shell } = require('electron');
const fs = require('fs');
const path = require('path');

function register(ipcMain, services) {
  const { electronApp } = services;

  registerHandler(ipcMain, 'select-directory', () =>
    dialog.showOpenDialog(electronApp.mainWindow, { properties: ['openDirectory'] })
  );

  registerHandler(ipcMain, 'select-file', () =>
    dialog.showOpenDialog(electronApp.mainWindow, {
      properties: ['openFile'],
      filters: [
        { name: 'Python Files', extensions: ['py'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
  );

  registerHandler(ipcMain, 'selectFiles', () =>
    dialog.showOpenDialog(electronApp.mainWindow, {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'All Files', extensions: ['*'] }]
    })
  );

  registerHandler(ipcMain, 'select-apk-file', () =>
    dialog.showOpenDialog(electronApp.mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'Android Package', extensions: ['apk'] }]
    })
  );

  registerHandler(ipcMain, 'checkPathExists', (pathToCheck) => {
    try {
      return fs.existsSync(pathToCheck);
    } catch (error) {
      console.error('检查路径失败:', error);
      return false;
    }
  });

  registerHandler(ipcMain, 'createDirectory', (dirPath) => {
    try {
      fs.mkdirSync(dirPath, { recursive: true });
      return { success: true };
    } catch (error) {
      console.error('创建目录失败:', error);
      return { success: false, error: error.message };
    }
  });

  registerHandler(ipcMain, 'open-external', (url) => shell.openExternal(url));

  registerHandler(ipcMain, 'save-test-case', (data) => {
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

  registerHandler(ipcMain, 'delete-test-case', async (data) => {
    const { filePath } = data;

    if (!filePath || !fs.existsSync(filePath)) {
      return { success: false, error: '文件不存在' };
    }

    await shell.trashItem(filePath);

    return { success: true };
  });
}

module.exports = { register };

const { registerHandler } = require('./base/handlerUtils');
const { dialog, shell } = require('electron');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const { IPC_CHANNELS } = require('../../shared/constants');
const { isAllowedExternalUrl } = require('../utils/urlGuard');
const lastDialogPaths = require('./base/lastDialogPaths');

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function register(ipcMain, services) {
  const { electronApp, i18nService } = services;

  // 文件选择器"上次选择路径"记忆: 存 config.json LAST_DIALOG_PATHS 字段
  lastDialogPaths.init(() => path.join(electronApp.userConfigPath, 'config.json'));

  // i18n 文案封装: i18nService 不可用时回退默认文案 (测试/初始化期)
  const t = (key, fallback) =>
    i18nService && typeof i18nService.t === 'function' ? i18nService.t(key, { defaultValue: fallback }) : fallback;

  // 测试用例目录 (SSOT: 与 TestCaseService.testCasesDir 一致)
  const testCasesDir =
    electronApp && electronApp.userConfigPath ? path.resolve(electronApp.userConfigPath, 'test_cases') : null;

  // 校验 dir 是否位于测试用例目录或其子目录下
  function isWithinTestCasesDir(dir) {
    if (!testCasesDir) return false;
    const resolved = path.resolve(dir);
    return resolved === testCasesDir || resolved.startsWith(testCasesDir + path.sep);
  }

  registerHandler(ipcMain, IPC_CHANNELS.SELECT_DIRECTORY, async () => {
    const defaultPath = await lastDialogPaths.getDefaultPath(IPC_CHANNELS.SELECT_DIRECTORY);
    const result = await dialog.showOpenDialog(electronApp.mainWindow, {
      properties: ['openDirectory'],
      ...(defaultPath ? { defaultPath } : {}),
    });
    if (!result.canceled && result.filePaths && result.filePaths[0]) {
      await lastDialogPaths.rememberPath(IPC_CHANNELS.SELECT_DIRECTORY, result.filePaths[0]);
    }
    return result;
  });

  registerHandler(ipcMain, IPC_CHANNELS.SELECT_FILE, async () => {
    const defaultPath = await lastDialogPaths.getDefaultPath(IPC_CHANNELS.SELECT_FILE);
    const result = await dialog.showOpenDialog(electronApp.mainWindow, {
      properties: ['openFile'],
      filters: [
        { name: 'Python Files', extensions: ['py'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      ...(defaultPath ? { defaultPath } : {}),
    });
    if (!result.canceled && result.filePaths && result.filePaths[0]) {
      await lastDialogPaths.rememberPath(IPC_CHANNELS.SELECT_FILE, result.filePaths[0]);
    }
    return result;
  });

  registerHandler(ipcMain, IPC_CHANNELS.SELECT_FILES, async () => {
    const title = i18nService ? i18nService.t('fileManager.upload') : 'Upload';
    const defaultPath = await lastDialogPaths.getDefaultPath(IPC_CHANNELS.SELECT_FILES);
    const result = await dialog.showOpenDialog(electronApp.mainWindow, {
      title,
      buttonLabel: title,
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'All Files', extensions: ['*'] }],
      ...(defaultPath ? { defaultPath } : {}),
    });
    if (!result.canceled && result.filePaths && result.filePaths[0]) {
      await lastDialogPaths.rememberPath(IPC_CHANNELS.SELECT_FILES, result.filePaths[0]);
    }
    return result;
  });

  registerHandler(ipcMain, IPC_CHANNELS.SELECT_APK_FILE, async () => {
    const defaultPath = await lastDialogPaths.getDefaultPath(IPC_CHANNELS.SELECT_APK_FILE);
    const result = await dialog.showOpenDialog(electronApp.mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'Android Package', extensions: ['apk'] }],
      ...(defaultPath ? { defaultPath } : {}),
    });
    if (!result.canceled && result.filePaths && result.filePaths[0]) {
      await lastDialogPaths.rememberPath(IPC_CHANNELS.SELECT_APK_FILE, result.filePaths[0]);
    }
    return result;
  });

  registerHandler(ipcMain, IPC_CHANNELS.CHECK_PATH_EXISTS, (pathToCheck) => {
    if (!isNonEmptyString(pathToCheck)) {
      return {
        success: false,
        error: t('errors.invalidPath', '无效的路径参数'),
      };
    }
    try {
      return fs.existsSync(pathToCheck);
    } catch (error) {
      console.error(t('errors.checkPathFailed', '检查路径失败:'), error);
      return false;
    }
  });

  registerHandler(ipcMain, IPC_CHANNELS.CREATE_DIRECTORY, (dirPath) => {
    if (!isNonEmptyString(dirPath)) {
      return {
        success: false,
        error: t('errors.invalidPath', '无效的路径参数'),
      };
    }
    // P3-8: 轻量防护 — 拒绝盘符根与 Windows 系统目录 (mkdir 虽为低危空目录, 防系统根污染)
    const resolved = path.resolve(dirPath);
    const sysRootRe = /^[a-zA-Z]:\\$|^[a-zA-Z]:\\windows(\\|$)/i;
    if (sysRootRe.test(resolved)) {
      return {
        success: false,
        error: t('errors.invalidPath', '无效的路径参数'),
      };
    }
    fs.mkdirSync(resolved, { recursive: true });
    return { success: true };
  });

  // openExternal 强制 https: + 白名单 host, 防止 XSS 注入危险协议/任意域外跳。
  // 文件打开应走 OPEN_PATH (shell.openPath), 不应通过 openExternal + file://。
  registerHandler(ipcMain, IPC_CHANNELS.OPEN_EXTERNAL, (url) => {
    const { allowed, reason } = isAllowedExternalUrl(url);
    if (!allowed) {
      console.error(`[openExternal] 拒绝打开 URL: ${url} (${reason})`);
      return {
        success: false,
        error: t('errors.openUrlNotAllowed', '不允许打开此链接') + `: ${reason}`,
      };
    }
    return shell.openExternal(url);
  });

  registerHandler(ipcMain, IPC_CHANNELS.OPEN_PATH, (pathToOpen) => {
    if (!isNonEmptyString(pathToOpen) || !fs.existsSync(pathToOpen)) {
      return { success: false, error: t('errors.pathNotExist', '路径不存在') };
    }
    shell.openPath(pathToOpen);
    return { success: true };
  });

  registerHandler(ipcMain, IPC_CHANNELS.SAVE_TEST_CASE, async (data) => {
    if (!data || typeof data !== 'object') {
      return {
        success: false,
        error: t('errors.invalidSaveTestCase', '无效的测试用例保存参数'),
      };
    }
    const { directory, fileName, content } = data;

    // directory: 非空字符串 且 位于测试用例目录 (或其子目录)
    if (!isNonEmptyString(directory) || !isWithinTestCasesDir(directory)) {
      return {
        success: false,
        error: t('errors.saveDirNotAllowed', '保存目录必须在测试用例目录下'),
      };
    }

    // fileName: 去扩展名后 trim 非空, 统一转安全的 .py 文件名
    if (!isNonEmptyString(fileName)) {
      return {
        success: false,
        error: t('errors.invalidSaveTestCase', '无效的测试用例保存参数'),
      };
    }
    const rawName = fileName.trim();
    const baseName = rawName.replace(/\.py$/i, '').trim();
    if (baseName.length === 0) {
      return {
        success: false,
        error: t('errors.invalidSaveTestCase', '无效的测试用例保存参数'),
      };
    }
    // 丢弃其它扩展名 (若传 .txt 等), path.basename 防目录穿越, 再清理非法文件名符号
    const safeName = path.basename(baseName.replace(/\.[^./]+$/, '')).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_');
    const finalFileName = safeName.endsWith('.py') ? safeName : `${safeName}.py`;

    // content: 非空字符串
    if (!isNonEmptyString(content)) {
      return {
        success: false,
        error: t('errors.invalidSaveTestCase', '无效的测试用例保存参数'),
      };
    }

    const filePath = path.join(path.resolve(directory), finalFileName);
    await fsp.writeFile(filePath, content, 'utf8');

    return {
      success: true,
      filePath: filePath,
      fileName: finalFileName,
    };
  });

  registerHandler(ipcMain, IPC_CHANNELS.DELETE_TEST_CASE, async (data) => {
    const filePath = data && typeof data === 'object' ? data.filePath : null;

    // 必须是非空字符串 且 以 .py 结尾
    if (!isNonEmptyString(filePath) || !filePath.toLowerCase().endsWith('.py')) {
      return {
        success: false,
        error: t('errors.invalidDeleteTestCase', '无效的测试用例删除参数'),
      };
    }

    // 规范化后其父目录必须在测试用例目录 (或其子目录) 下, 防止删除任意路径
    const resolvedPath = path.resolve(filePath);
    if (!isWithinTestCasesDir(path.dirname(resolvedPath))) {
      return {
        success: false,
        error: t('errors.deleteNotAllowed', '删除目标必须在测试用例目录下'),
      };
    }

    if (!fs.existsSync(resolvedPath)) {
      return { success: false, error: t('errors.fileNotExist', '文件不存在') };
    }

    await shell.trashItem(resolvedPath);

    return { success: true };
  });
}

module.exports = { register };

/**
 * dialogWithMemory - 「文件选择对话框 + 路径记忆」注册工厂
 *
 * 收敛 fileHandlers ×4 + dataTransferHandlers ×1 的同构模板:
 *   getDefaultPath → showOpenDialog → 未取消则 rememberPath → 返回结果
 * (SELECT_EXPORT_PATH 为 save 变体 + 动态默认文件名, 形状不规则, 保留手写)
 *
 * 依赖: lastDialogPaths (路径记忆持久化), handlerUtils.registerHandler (统一 try-catch 包装)
 */
const { dialog } = require('electron');
const { registerHandler } = require('./handlerUtils');
const lastDialogPaths = require('./lastDialogPaths');

/**
 * 注册「open 对话框 + 上次路径记忆」handler
 * @param {Object} ipcMain - IPC 注册目标
 * @param {string} channel - IPC 通道名 (兼作 lastDialogPaths 记忆 key)
 * @param {() => Electron.BrowserWindow|null} getWindow - 父窗口提供者
 * @param {Object|() => Object} dialogProps - showOpenDialog options;
 *        传函数则每次调用求值 (支持 i18n 动态 title/buttonLabel)
 */
function registerOpenDialogWithMemory(ipcMain, channel, getWindow, dialogProps) {
  registerHandler(ipcMain, channel, async () => {
    const props = typeof dialogProps === 'function' ? dialogProps() : dialogProps;
    const defaultPath = await lastDialogPaths.getDefaultPath(channel);
    const result = await dialog.showOpenDialog(getWindow(), {
      ...props,
      ...(defaultPath ? { defaultPath } : {}),
    });
    if (!result.canceled && result.filePaths && result.filePaths[0]) {
      await lastDialogPaths.rememberPath(channel, result.filePaths[0]);
    }
    return result;
  });
}

module.exports = { registerOpenDialogWithMemory };

const { spawn } = require('child_process');

/**
 * 执行命令并返回结果 (Promise 包装)
 *
 * 强制 windowsHide: true (避免弹出控制台窗口), 合并 process.env + options.env
 *
 * @param {string} command - 命令 (如 'python', 'where', 'reg.exe')
 * @param {string[]} [args=[]] - 参数数组
 * @param {Object} [options={}] - spawn 选项 (env / cwd 等)
 * @returns {Promise<{code: number, stdout: string, stderr: string}>}
 */
async function executeCommand(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      ...options,
      windowsHide: true,
      env: { ...process.env, ...(options.env || {}) },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      resolve({
        code,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    });

    proc.on('error', (error) => {
      reject(error);
    });
  });
}

module.exports = { executeCommand };

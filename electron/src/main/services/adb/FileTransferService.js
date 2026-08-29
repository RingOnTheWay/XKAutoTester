/**
 * FileTransferService - ADB 文件上传/下载
 *
 * 设计:
 * - 依赖 AdbCommandExecutor (isDir 判断) + RemoteStatService (大小查询) + TarExtractor + AdbProgressMonitor + AdmZip
 * - 消除 shell=True: 全改 spawn(adbPath, args, {}) 形式, 路径用 AdbPathQuoter 转义
 * - 所有外部依赖 (spawn/fs/monitor/admZip/asyncFs) 通过构造注入, 便于单元测试
 * - upload: stat → push (start/stop monitor)
 * - download: isDir 判断 → 单文件 pull / 目录 tar+TarExtractor+AdmZip
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const AdmZip = require('adm-zip');
const asyncFs = require('../../utils/asyncFs');
const AdbProgressMonitor = require('../AdbProgressMonitor');
const pathHelper = require('../../utils/pathHelper');
const AdbPathQuoter = require('./AdbPathQuoter');

// P1-4: ADB 传输超时 (10min, 对齐 ApkInstaller ProcessRunner)。
// 设备半死/线缆抖动时 spawn 的 close/error 可能永不触发, 无超时则 Promise 永久挂起
// 且 progress monitor 的 interval 泄漏。
const ADB_TRANSFER_TIMEOUT_MS = 10 * 60 * 1000;

class FileTransferService {
  /**
   * @param {object} deps
   * @param {object} deps.commandExecutor - AdbCommandExecutor 实例
   * @param {object} deps.remoteStatService - RemoteStatService 实例
   * @param {object} deps.i18nService - 国际化服务
   * @param {object} deps.tarExtractor - TarExtractor 实例
   * @param {Function} [deps.spawnFn] - spawn 函数 (默认 child_process.spawn)
   * @param {object} [deps.fs] - fs 模块 (默认 require('fs'))
   * @param {Function} [deps.progressMonitorFactory] - AdbProgressMonitor 工厂
   * @param {Function} [deps.admZipFactory] - AdmZip 工厂
   * @param {object} [deps.asyncFs] - asyncFs 模块
   * @param {number} [deps.transferTimeoutMs] - 传输超时 (默认 10min, 测试可注入小值)
   */
  constructor({
    commandExecutor,
    remoteStatService,
    i18nService,
    tarExtractor,
    projectRoot,
    spawnFn,
    fs: fsDep,
    progressMonitorFactory,
    admZipFactory,
    asyncFs: asyncFsDep,
    transferTimeoutMs,
  }) {
    if (!commandExecutor) throw new Error('FileTransferService: commandExecutor is required');
    if (!remoteStatService) throw new Error('FileTransferService: remoteStatService is required');
    if (!i18nService) throw new Error('FileTransferService: i18nService is required');
    if (!tarExtractor) throw new Error('FileTransferService: tarExtractor is required');

    this._executor = commandExecutor;
    this._remoteStat = remoteStatService;
    this._i18n = i18nService;
    this._tarExtractor = tarExtractor;
    // 统一 adb 路径解析根 (与 ADBService 用同一 projectRoot; 未注入时回退到传统值)
    this._projectRoot = projectRoot || process.resourcesPath || process.cwd();
    this._spawn = spawnFn || spawn;
    this._fs = fsDep || fs;
    this._monitorFactory = progressMonitorFactory || ((opts) => new AdbProgressMonitor(opts));
    this._admZipFactory = admZipFactory || (() => new AdmZip());
    this._asyncFs = asyncFsDep || asyncFs;
    this._transferTimeoutMs = transferTimeoutMs || ADB_TRANSFER_TIMEOUT_MS;
  }

  /**
   * 获取 adb 路径 (通过 pathHelper 统一解析, 与 ADBService 同一入口)
   */
  _getAdbPath() {
    // 复用 pathHelper.getAdbPath 单一解析入口; projectRoot 由 facade (ADBService) 注入
    return pathHelper.getAdbPath(this._projectRoot, true);
  }

  /**
   * 上传文件: stat → push + monitor
   * @param {string} localPath
   * @param {string} remotePath
   * @param {string|null} deviceId
   * @param {object|null} eventSender - IPC sender
   * @returns {Promise<{success: boolean, error?: string, output?: string}>}
   */
  async upload(localPath, remotePath, deviceId, eventSender) {
    try {
      const stats = this._fs.statSync(localPath);
      const fileSizeInBytes = stats.size;

      const monitor = this._monitorFactory({
        remotePath,
        deviceId,
        fileStats: { size: fileSizeInBytes, name: path.basename(localPath) },
        eventSender,
        i18nService: this._i18n,
        executeStat: (statArgs) => this._executor.execute(statArgs),
        channel: 'upload-progress',
        maxPercentage: 95,
        pollingStatus: 'transferring',
        pollingMessageKey: 'fileManager.uploading',
      });

      monitor.emit(0, 'preparing', this._i18n.t('fileManager.preparingUpload'));

      const pushArgs = deviceId ? ['-s', deviceId, 'push', localPath, remotePath] : ['push', localPath, remotePath];

      const adbPath = this._getAdbPath();
      const pushProcess = this._spawn(adbPath, pushArgs, { windowsHide: true });

      monitor.start(500);

      const pushResult = await new Promise((resolve) => {
        let pushStdout = '';
        let pushStderr = '';
        let settled = false;
        // P1-4: 超时兜底 — kill 子进程 + 停 monitor + resolve, 防永久挂起
        const timeoutTimer = setTimeout(() => {
          if (settled) return;
          settled = true;
          try {
            pushProcess.kill();
          } catch {
            /* 已退出 */
          }
          monitor.stop();
          resolve({
            success: false,
            stdout: pushStdout,
            stderr: 'adb push timeout',
            error: 'timeout',
          });
        }, this._transferTimeoutMs);

        pushProcess.stdout.on('data', (data) => {
          pushStdout += data.toString();
        });
        pushProcess.stderr.on('data', (data) => {
          pushStderr += data.toString();
        });
        pushProcess.on('close', (code) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeoutTimer);
          monitor.stop();
          const success = code === 0 || pushStderr.includes('file pushed') || pushStdout.includes('file pushed');
          resolve({ success, stdout: pushStdout, stderr: pushStderr, code });
        });
        pushProcess.on('error', (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeoutTimer);
          monitor.stop();
          resolve({
            success: false,
            stdout: pushStdout,
            stderr: pushStderr,
            error: error.message,
          });
        });
      });

      if (!pushResult.success) {
        const errorMsg = pushResult.stderr || pushResult.error || 'Failed to push file to device';
        monitor.emit(100, 'error', this._i18n.t('fileManager.uploadFailed'), errorMsg);
        return { success: false, error: errorMsg, output: pushResult.stdout };
      }

      monitor.emit(100, 'success', this._i18n.t('fileManager.uploadSuccess'));
      return { success: true, output: pushResult.stdout };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 下载文件/目录: isDir 判断 → 单文件 pull / 目录 tar+zip
   * @param {string} remotePath
   * @param {string} localPath
   * @param {string|null} deviceId
   * @param {object|null} eventSender
   * @returns {Promise<{success: boolean, error?: string, output?: string, localPath?: string}>}
   */
  async download(remotePath, localPath, deviceId, eventSender) {
    try {
      // isDir 判断: adb shell ls -la <path>, 输出以 'total' 开头或含 'drwx' 则为目录
      const lsArgs = deviceId
        ? ['-s', deviceId, 'shell', `ls -la ${AdbPathQuoter.quote(remotePath)}`]
        : ['shell', `ls -la ${AdbPathQuoter.quote(remotePath)}`];

      let isDir = false;
      try {
        const lsResult = await this._executor.execute(lsArgs, {
          timeoutMs: 5000,
        });
        const output = (lsResult.output || '').trim();
        isDir = output.startsWith('total') || output.includes('drwx');
      } catch {
        isDir = false;
      }

      const sanitizeFileName = (name) => name.replace(/[\\/:*?"<>|]/g, '_');

      const remoteSizeBytes = isDir
        ? await this._remoteStat.getDirSize(remotePath, deviceId)
        : await this._remoteStat.getFileSize(remotePath, deviceId);

      if (isDir) {
        return await this._downloadDir(remotePath, localPath, deviceId, eventSender, remoteSizeBytes, sanitizeFileName);
      }

      return await this._downloadFile(remotePath, localPath, deviceId, eventSender, remoteSizeBytes, sanitizeFileName);
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 下载目录: tar exec-out → TarExtractor → AdmZip
   */
  async _downloadDir(remotePath, localPath, deviceId, eventSender, remoteSizeBytes, sanitizeFileName) {
    const basePath = localPath.replace(/\\/g, '/').replace(/\/[^/]+$/, '');
    const dirName = path.basename(remotePath);
    const sanitizedDirName = sanitizeFileName(dirName);
    const finalLocalPath = `${basePath}/${sanitizedDirName}.zip`;

    const tempDir = path.join(os.tmpdir(), `adb_download_${Date.now()}`);
    try {
      await this._asyncFs.ensureDir(tempDir);
    } catch (error) {
      throw new Error(`Failed to create temporary directory: ${error.message}`);
    }

    const monitor = this._monitorFactory({
      remotePath,
      deviceId,
      fileStats: {
        size: remoteSizeBytes || 1,
        name: path.basename(finalLocalPath),
      },
      eventSender,
      i18nService: this._i18n,
      executeStat: () => Promise.resolve({ success: false, output: '' }),
      channel: 'download-progress',
      maxPercentage: 100,
    });

    monitor.emit(0, 'downloading', this._i18n.t('fileManager.downloading'));

    // tar 命令: cd <quoted_path> && tar -chf - ./
    const tarShellCmd = `cd ${AdbPathQuoter.quote(remotePath)} && tar -chf - ./`;
    const tarArgs = deviceId ? ['-s', deviceId, 'exec-out', tarShellCmd] : ['exec-out', tarShellCmd];

    const tempTarPath = path.join(tempDir, `${sanitizedDirName}.tar`);
    const tarWriteStream = this._fs.createWriteStream(tempTarPath);

    const adbPath = this._getAdbPath();
    const tarProcess = this._spawn(adbPath, tarArgs, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let transferred = 0;
    let errorOutput = '';

    tarProcess.stdout.pipe(tarWriteStream);
    tarProcess.stdout.on('data', (data) => {
      transferred += data.length;
      // 用已知总大小 remoteSizeBytes 计算真实百分比 (远程大小可能为 0, 需除零保护; 保留 95 封顶避免瞬时 100%)
      const denominator = remoteSizeBytes > 0 ? remoteSizeBytes : transferred || 1;
      const percentage = Math.min(95, Math.floor((transferred / denominator) * 100));
      monitor.emit(percentage, 'downloading', this._i18n.t('fileManager.downloading'));
    });
    tarProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    return new Promise((resolve) => {
      let settled = false;
      // 统一收口: 确保 error/close 双路径都正确关闭写入流并只 resolve 一次, 避免 Promise 永久 pending
      const finish = (result) => {
        if (settled) return;
        settled = true;
        if (tarWriteStream.destroy) tarWriteStream.destroy();
        resolve(result);
      };
      const cleanupTemp = async () => {
        if (await this._asyncFs.exists(tempTarPath)) await this._asyncFs.unlink(tempTarPath);
        await this._asyncFs.rm(tempDir, { recursive: true, force: true });
      };

      // P1-4: 超时兜底 — kill 子进程 + 清临时文件 + resolve, 防永久挂起
      const timeoutTimer = setTimeout(() => {
        if (settled) return;
        try {
          tarProcess.kill();
        } catch {
          /* 已退出 */
        }
        cleanupTemp();
        monitor.emit(100, 'error', this._i18n.t('fileManager.downloadFailed'), 'adb exec-out tar timeout');
        finish({
          success: false,
          error: this._i18n.t('fileManager.downloadFailed'),
          output: '',
        });
      }, this._transferTimeoutMs);

      // spawn 失败 (ENOENT/adb 缺失) 只发 error 不发 close, 必须在此处结束 Promise
      tarProcess.on('error', async (error) => {
        clearTimeout(timeoutTimer);
        await cleanupTemp();
        monitor.emit(100, 'error', this._i18n.t('fileManager.downloadFailed'), error.message);
        finish({
          success: false,
          error: this._i18n.t('fileManager.downloadFailed'),
          output: '',
        });
      });

      tarProcess.on('close', async (code) => {
        clearTimeout(timeoutTimer);
        if (code === 0) {
          try {
            await this._processTarAndCreateZip(tempTarPath, tempDir, finalLocalPath, monitor);

            await cleanupTemp();

            monitor.emit(100, 'success', this._i18n.t('main.fileDownloaded', { path: finalLocalPath }));
            finish({
              success: true,
              output: this._i18n.t('main.fileDownloaded', {
                path: finalLocalPath,
              }),
              localPath: finalLocalPath,
            });
          } catch (error) {
            await cleanupTemp();

            monitor.emit(100, 'error', this._i18n.t('main.zipCreationFailed', { error: error.message }), error.message);
            finish({
              success: false,
              error: this._i18n.t('main.zipCreationFailed', {
                error: error.message,
              }),
            });
          }
        } else {
          await cleanupTemp();

          const errMsg = this._i18n.t('main.tarExecFailed', {
            code,
            error: errorOutput.trim(),
          });
          monitor.emit(100, 'error', errMsg, errMsg);
          finish({ success: false, error: errMsg });
        }
      });
    });
  }

  /**
   * 下载单文件: adb pull -p
   */
  async _downloadFile(remotePath, localPath, deviceId, eventSender, remoteSizeBytes, sanitizeFileName) {
    const basePath = localPath.replace(/\\/g, '/').replace(/\/[^/]+$/, '');
    const fileName = path.basename(localPath);
    const sanitizedFileName = sanitizeFileName(fileName);
    const finalLocalPath = `${basePath}/${sanitizedFileName}`;

    const monitor = this._monitorFactory({
      remotePath,
      deviceId,
      fileStats: {
        size: remoteSizeBytes || 1,
        name: path.basename(finalLocalPath),
      },
      eventSender,
      i18nService: this._i18n,
      executeStat: () => Promise.resolve({ success: false, output: '' }),
      channel: 'download-progress',
      maxPercentage: 100,
    });

    const pullArgs = deviceId
      ? ['-s', deviceId, 'pull', '-p', remotePath, finalLocalPath]
      : ['pull', '-p', remotePath, finalLocalPath];

    const adbPath = this._getAdbPath();
    const pullProcess = this._spawn(adbPath, pullArgs, { windowsHide: true });

    let errorOutput = '';

    pullProcess.stdout.on('data', (data) => {
      const output = data.toString();
      const progressMatch = output.match(/\[(\d+)\/(\d+)\s+\((\d+)%\)\]/);
      if (progressMatch) {
        const percentage = parseInt(progressMatch[3]);
        monitor.emit(percentage, 'downloading', this._i18n.t('fileManager.downloading'));
      }
    });

    pullProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    return new Promise((resolve) => {
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      // P1-4: 超时兜底 — kill 子进程 + 停 monitor + resolve, 防永久挂起
      const timeoutTimer = setTimeout(() => {
        if (settled) return;
        try {
          pullProcess.kill();
        } catch {
          /* 已退出 */
        }
        monitor.emit(100, 'error', this._i18n.t('fileManager.downloadFailed'), 'adb pull timeout');
        finish({
          success: false,
          error: this._i18n.t('fileManager.downloadFailed'),
          output: '',
        });
      }, this._transferTimeoutMs);

      // spawn 失败 (ENOENT/adb 缺失) 只发 error 不发 close, 必须在此处结束 Promise
      pullProcess.on('error', (error) => {
        clearTimeout(timeoutTimer);
        monitor.emit(100, 'error', this._i18n.t('fileManager.downloadFailed'), error.message);
        finish({
          success: false,
          error: this._i18n.t('fileManager.downloadFailed'),
          output: '',
        });
      });

      pullProcess.on('close', (code) => {
        clearTimeout(timeoutTimer);
        if (code === 0) {
          monitor.emit(100, 'success', this._i18n.t('main.fileDownloaded', { path: finalLocalPath }));
          finish({
            success: true,
            output: this._i18n.t('main.fileDownloaded', {
              path: finalLocalPath,
            }),
            localPath: finalLocalPath,
          });
        } else {
          const errMsg = this._i18n.t('main.pullFailed', {
            code,
            error: errorOutput.trim(),
          });
          monitor.emit(100, 'error', errMsg, errMsg);
          finish({ success: false, error: errMsg });
        }
      });
    });
  }

  /**
   * tar 解压 + AdmZip 打包
   * @param {string} tempTarPath
   * @param {string} tempDir
   * @param {string} finalLocalPath
   * @param {object} monitor - AdbProgressMonitor 实例
   */
  async _processTarAndCreateZip(tempTarPath, tempDir, finalLocalPath, monitor) {
    const extractDir = path.join(tempDir, 'extract');
    await this._asyncFs.ensureDir(extractDir);

    await this._tarExtractor.extract(tempTarPath, extractDir);

    const zip = this._admZipFactory();

    const addDirectoryToZip = async (dirPath, zipPath = '') => {
      const files = await this._asyncFs.readdir(dirPath);
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const zipFilePath = path.join(zipPath, file);
        const stats = await this._asyncFs.stat(filePath);

        if (stats.isDirectory()) {
          zip.addFile(`${zipFilePath}/`, Buffer.alloc(0));
          await addDirectoryToZip(filePath, zipFilePath);
        } else {
          // 传 null encoding 拿 Buffer (二进制安全, adm-zip addFile 需 Buffer)
          const buf = await this._asyncFs.readFile(filePath, null);
          zip.addFile(zipFilePath, buf);
        }
      }
    };

    await addDirectoryToZip(extractDir);
    zip.writeZip(finalLocalPath);

    if (monitor) {
      monitor.emit(100, 'success', this._i18n.t('fileManager.zipCreated'));
    }
  }
}

module.exports = FileTransferService;

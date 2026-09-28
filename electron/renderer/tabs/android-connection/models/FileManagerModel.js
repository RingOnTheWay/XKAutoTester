import { BaseModel } from '../../../core/BaseModel.js';

/**
 * FileManagerModel - 文件管理子模型 (R28 遗留, 按 ADR-0012 模式拆分)
 *
 * 职责: 设备文件列表/导航/选择/删除/重命名 + 上传/下载 + APK 安装。
 *
 * 跨域契约 (门面路由, 本模型不持有设备域状态):
 * - DeviceModel 单向构造注入 (FileManager → Device, 不成环):
 *   selectedDevice 经 device.get('selectedDevice') 取, ADB 命令经 device.executeAdbCommand 执行
 *
 * 事件面 (门面显式转发): file-list-loading / file-list-loaded / file-list-error /
 * currentPath-changed / selectedFiles-changed / install-apk-error / install-apk-result / error
 */
export class FileManagerModel extends BaseModel {
  _api;
  #device;

  /**
   * @param {Object} api - ApiBridge 绑定对象 (与门面/兄弟子模型共享同一实例)
   * @param {Object} [opts]
   * @param {Object} [opts.device] - DeviceModel 实例 (selectedDevice / executeAdbCommand 能力)
   */
  constructor(api, { device } = {}) {
    super({
      currentPath: '/storage/emulated/0', // 文件管理器当前路径
      selectedFiles: [], // 文件管理器选中的文件列表
      fileList: [], // 文件管理器当前目录文件列表
      contextMenuTarget: null, // 右键菜单目标文件
    });
    this._api = api;
    this.#device = device;
  }

  // ── State Getters ──────────────────────────────────────────────

  get currentPath() {
    return this.get('currentPath');
  }
  get selectedFiles() {
    return this.get('selectedFiles');
  }
  get fileList() {
    return this.get('fileList');
  }
  get contextMenuTarget() {
    return this.get('contextMenuTarget');
  }

  // ─── 文件列表 + 导航 ─────────────────────────────────────────

  async loadFileList() {
    if (!this.#device.get('selectedDevice')) return;

    // P3-11: currentPath 渲染层可控 (面包屑/地址输入), 拼接进命令字符串前清洗 —
    // 拒绝 shell 元字符 (主进程 executeAdbCommand 无 shell 但按空白 split,
    // 元字符/控制字符会导致参数错位或注入面残留)
    const safePath = this.sanitizeRemotePath(this.get('currentPath'));
    if (!safePath) {
      this.emitError('loadFileList', new Error('invalid path'));
      this.emit('file-list-error', 'invalid path');
      return;
    }

    this.emit('file-list-loading');
    try {
      const cmd = `ls -la ${safePath}`;
      // wrapper 失败已抛错进 catch,走到这里即成功
      const result = await this.#device.executeAdbCommand(cmd, this.#device.get('selectedDevice'));

      const fileList = FileManagerModel.parseAdbFileList(result.output, this.get('currentPath'));
      this.set('fileList', fileList, 'file-list-loaded');
      this.set('selectedFiles', [], 'selectedFiles-changed');
    } catch (error) {
      this.emitError('loadFileList', error);
      this.emit('file-list-error', error.message);
    }
  }

  /**
   * P3-11: 远程路径清洗 — 拒绝 shell 元字符 + 控制字符 (对齐主进程 _sanitizeRemotePath 语义)
   * @param {string} p
   * @returns {string|null}
   */
  sanitizeRemotePath(p) {
    if (typeof p !== 'string' || p.trim() === '') return null;
    // 拒绝: ; & | $ ` " ' ( ) { } < > \ 及换行/控制字符
    if (/[;&|$`"'(){}<>\\\x00-\x1f]/.test(p)) return null;
    return p.trim();
  }

  async navigateToPath(path) {
    if (path === this.get('currentPath')) return;
    this.set('currentPath', path, 'currentPath-changed');
    this.set('selectedFiles', [], 'selectedFiles-changed');
    await this.loadFileList();
  }

  async navigateToDirectory(path) {
    this.set('currentPath', path, 'currentPath-changed');
    this.set('selectedFiles', [], 'selectedFiles-changed');
    await this.loadFileList();
  }

  async navigateBack() {
    if (this.get('currentPath') === '/storage/emulated/0') return;
    const pathParts = this.get('currentPath').split('/');
    pathParts.pop();
    const parentPath = pathParts.join('/') || '/';
    await this.navigateToDirectory(parentPath);
  }

  // ── 文件选择 ───────────────────────────────────────────────────

  addSelectedFile(file) {
    if (!this.get('selectedFiles').some((f) => f.path === file.path)) {
      this.set('selectedFiles', [...this.get('selectedFiles'), file], 'selectedFiles-changed');
    }
  }

  removeSelectedFile(file) {
    this.set(
      'selectedFiles',
      this.get('selectedFiles').filter((f) => f.path !== file.path),
      'selectedFiles-changed'
    );
  }

  toggleSelectAll(checked) {
    const next = checked ? [...this.get('fileList')] : [];
    this.set('selectedFiles', next, 'selectedFiles-changed');
  }

  setContextMenuTarget(file) {
    this.silentSet('contextMenuTarget', file);
  }

  // ── 文件操作 ───────────────────────────────────────────────────

  async deleteFile(file) {
    try {
      // P1-6 根治: 专用通道 (原拼 shell `rm -rf "${path}"` 经 executeAdbCommand 执行,
      // 存在设备端注入面; 现主进程侧路径清洗 + 参数数组化)
      const result = await this._api.deleteRemoteFile(
        file.path,
        this.#device.get('selectedDevice'),
        !!file.isDirectory
      );
      return result;
    } catch (error) {
      this.emitError('deleteFile', error);
      return { success: false, error: error.message };
    }
  }

  async deleteSelectedFiles() {
    if (this.get('selectedFiles').length === 0) return;
    const results = [];
    for (const file of this.get('selectedFiles')) {
      const result = await this.deleteFile(file);
      results.push({ file, result });
    }
    this.set('selectedFiles', [], 'selectedFiles-changed');
    await this.loadFileList();
    return results;
  }

  async renameFile(file, newName) {
    if (!newName || newName === file.name)
      return {
        success: false,
        error: window.i18n.t('fileManager.invalidNewName'),
      };
    try {
      // P1-6 根治: 专用通道 (原拼 shell `mv "a" "b"`; 主进程侧 basename 约束 + 路径清洗)
      const result = await this._api.renameRemoteFile(file.path, newName, this.#device.get('selectedDevice'));
      await this.loadFileList();
      return result;
    } catch (error) {
      this.emitError('renameFile', error);
      return { success: false, error: error.message };
    }
  }

  // ─── 文件上传/下载 ────────────────────────────────────────────

  async uploadFiles() {
    try {
      const result = await this._api.selectFiles();
      if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
        return null;
      }
      return result.filePaths;
    } catch (error) {
      this.emitError('uploadFiles', error);
      return null;
    }
  }

  async uploadFile(localPath, remotePath) {
    try {
      const result = await this._api.uploadFile(localPath, remotePath, this.#device.get('selectedDevice'));
      return result;
    } catch (error) {
      this.emitError('uploadFile', error);
      return { success: false, error: error.message };
    }
  }

  async downloadSelectedFiles() {
    if (this.get('selectedFiles').length === 0) return;

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

      return { downloadDir, files: this.get('selectedFiles') };
    } catch (error) {
      this.emitError('downloadSelectedFiles', error);
      return null;
    }
  }

  async downloadFile(file, downloadDir) {
    try {
      // P3-11: 设备文件名 basename 清洗 — 设备侧文件可命名为 ../../evil 或绝对路径,
      // 直接拼接本地下载路径会路径穿越写任意位置; 拒绝 '.'/'..' 与空名
      const rawName = typeof file.name === 'string' ? file.name : '';
      const safeName = rawName.replace(/\\/g, '/').split('/').pop() || '';
      if (!safeName || safeName === '.' || safeName === '..') {
        return { success: false, error: 'invalid file name' };
      }
      const localPath = `${downloadDir}/${safeName}`;
      const result = await this._api.downloadFile(file.path, localPath, this.#device.get('selectedDevice'));
      return result;
    } catch (error) {
      this.emitError('downloadFile', error);
      return { success: false, error: error.message };
    }
  }

  async resolveDownloadDirectory() {
    try {
      const config = await this._api.getConfig();
      const defaultDownloadPath = config?.APP_SETTINGS?.default_download_directory;

      if (defaultDownloadPath) {
        const exists = await this._api.checkPathExists(defaultDownloadPath);
        if (exists) return defaultDownloadPath;

        // invokeWithCheck 已保证失败时抛错 (进 catch), 此处创建成功后直接返回
        await this._api.createDirectory(defaultDownloadPath);
        return defaultDownloadPath;
      }
    } catch (error) {
      this.emitError('resolveDownloadDirectory', error);
    }
    return null;
  }

  async selectDownloadDirectory() {
    try {
      const result = await this._api.selectDirectory();
      if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
        return result.filePaths[0];
      }
    } catch (error) {
      this.emitError('selectDownloadDirectory', error);
    }
    return null;
  }

  // ─── APK 安装 ─────────────────────────────────────────────────

  async installApk() {
    if (!this.#device.get('selectedDevice')) {
      this.emit('install-apk-error', {
        message: window.i18n.t('fileManager.selectDeviceFirst'),
      });
      return null;
    }

    try {
      const result = await this._api.selectApkFile();
      if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
        return null;
      }
      const apkPath = result.filePaths[0];
      const installResult = await this._api.installApk(apkPath, this.#device.get('selectedDevice'));
      this.emit('install-apk-result', installResult);
      return installResult;
    } catch (error) {
      this.emitError('installApk', error);
      return { success: false, error: error.message };
    }
  }

  // ─── Static Utilities ─────────────────────────────────────────

  static parseAdbFileList(output, currentPath) {
    const files = [];
    if (!output || typeof output !== 'string') return files;

    const lines = output.split('\n').filter((line) => line.trim());

    // 跳过标题行
    let startIndex = 0;
    if (lines.length > 0 && (lines[0].includes('total') || lines[0].includes('total:'))) {
      startIndex = 1;
    }

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      let match;

      // 模式1: 标准格式 "drwxrwx---   2 u0_a234  u0_a234       4096 2023-01-01 12:00 DCIM"
      match = line.match(/^(d|-)([rwxst-]{9})\s+\d+\s+\S+\s+\S+\s+(\d+)\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s+(.+)$/);
      if (match) {
        const [, isDir, , size, modDate, modTime, name] = match;
        if (name === '.' || name === '..') continue;
        files.push({
          name,
          path: `${currentPath}/${name}`,
          isDirectory: isDir === 'd',
          size: parseInt(size),
          modifiedTime: `${modDate} ${modTime}`,
          createdAt: `${modDate} ${modTime}`,
        });
        continue;
      }

      // 模式2: 简化格式 "drwxrwx---  2 u0_a234 u0_a234 4096 Jan  1 12:00 DCIM"
      match = line.match(/^(d|-)([rwxst-]{9})\s+\d+\s+\S+\s+\S+\s+(\d+)\s+(\w{3})\s+(\d{1,2})\s+(\d{2}:\d{2})\s+(.+)$/);
      if (match) {
        const [, isDir, , size, month, day, time, name] = match;
        if (name === '.' || name === '..') continue;
        const monthMap = {
          Jan: '01',
          Feb: '02',
          Mar: '03',
          Apr: '04',
          May: '05',
          Jun: '06',
          Jul: '07',
          Aug: '08',
          Sep: '09',
          Oct: '10',
          Nov: '11',
          Dec: '12',
        };
        const modDate = `${new Date().getFullYear()}-${monthMap[month]}-${day.padStart(2, '0')}`;
        files.push({
          name,
          path: `${currentPath}/${name}`,
          isDirectory: isDir === 'd',
          size: parseInt(size),
          modifiedTime: `${modDate} ${time}`,
          createdAt: `${modDate} ${time}`,
        });
        continue;
      }

      // 模式3: 行以 d 或 - 开头但格式不匹配，尝试提取文件名
      if (line.startsWith('d') || line.startsWith('-')) {
        const parts = line.split(/\s+/);
        const name = parts[parts.length - 1];
        if (name === '.' || name === '..') continue;
        const isDir = line.startsWith('d');
        files.push({
          name,
          path: `${currentPath}/${name}`,
          isDirectory: isDir,
          size: 0,
          modifiedTime: new Date().toISOString().slice(0, 19).replace('T', ' '),
          createdAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
        });
      }
    }

    // 排序：文件夹优先，然后按名称排序
    files.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name, 'zh-CN');
    });

    return files;
  }

  static formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  static formatRelativeTime(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;

    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    const week = 7 * day;
    const month = 30 * day;
    const year = 365 * day;

    if (isNaN(diff)) return dateString;
    if (diff < minute) return window.i18n.t('fileManager.justNow');
    if (diff < hour)
      return window.i18n.t('fileManager.minutesAgo', {
        n: Math.floor(diff / minute),
      });
    if (diff < day)
      return window.i18n.t('fileManager.hoursAgo', {
        n: Math.floor(diff / hour),
      });
    if (diff < week)
      return window.i18n.t('fileManager.daysAgo', {
        n: Math.floor(diff / day),
      });
    if (diff < month)
      return window.i18n.t('fileManager.weeksAgo', {
        n: Math.floor(diff / week),
      });
    if (diff < year)
      return window.i18n.t('fileManager.monthsAgo', {
        n: Math.floor(diff / month),
      });
    return dateString.slice(0, 16);
  }
}

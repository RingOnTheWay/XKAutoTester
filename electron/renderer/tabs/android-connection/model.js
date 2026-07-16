import { EventEmitter } from '../../core/EventEmitter.js';
import { ApiBridge } from '../../core/ApiBridge.js';
import { AppState } from '../../core/AppState.js';

/**
 * AndroidConnectionModel - 安卓连接 Tab 的 Model 层
 * 管理设备连接、文件管理、投屏控制、APK 安装等状态与业务逻辑
 */
export class AndroidConnectionModel extends EventEmitter {
  #api = ApiBridge.bind({
    getConnectedDevices: 'getConnectedDevices',
    executeAdbCommand: 'executeAdbCommand',
    startScrcpy: 'startScrcpy',
    getConfig: 'getConfig',
    saveConfig: 'saveConfig',
    selectDirectory: 'selectDirectory',
    selectApkFile: 'selectApkFile',
    selectFiles: 'selectFiles',
    uploadFile: 'uploadFile',
    downloadFile: 'downloadFile',
    installApk: 'installApk',
    getSerialPorts: 'getSerialPorts',
    checkPathExists: 'checkPathExists',
    createDirectory: 'createDirectory',
    showDialog: 'showDialog',
  });

  #state = {
    selectedDevice: null,          // 当前选中的设备 ID（与 AppState 同步）
    modalSelectedDeviceId: null,   // 设备管理弹窗中选中的设备 ID
    deviceRefreshTimer: null,      // 设备列表刷新定时器
    currentDeviceList: [],         // 当前设备列表
    isDeviceRefreshing: false,     // 是否正在刷新设备列表
    deviceStatusSaved: false,      // 设备选择状态是否已保存
    currentPath: '/storage/emulated/0', // 文件管理器当前路径
    selectedFiles: [],             // 文件管理器选中的文件列表
    fileList: [],                  // 文件管理器当前目录文件列表
    contextMenuTarget: null,       // 右键菜单目标文件
    ellipsisDropdownCloseSet: false, // 省略号下拉关闭监听标记
    scrcpyParams: {},              // scrcpy 投屏参数（从配置加载）
  };

  // ── AppState 订阅取消函数 ──────────────────────────────────────
  #unsubAppState = null;

  // ── State Getters ──────────────────────────────────────────────

  get selectedDevice() { return this.#state.selectedDevice; }
  get modalSelectedDeviceId() { return this.#state.modalSelectedDeviceId; }
  get deviceRefreshTimer() { return this.#state.deviceRefreshTimer; }
  get currentDeviceList() { return this.#state.currentDeviceList; }
  get isDeviceRefreshing() { return this.#state.isDeviceRefreshing; }
  get deviceStatusSaved() { return this.#state.deviceStatusSaved; }
  get currentPath() { return this.#state.currentPath; }
  get selectedFiles() { return this.#state.selectedFiles; }
  get fileList() { return this.#state.fileList; }
  get contextMenuTarget() { return this.#state.contextMenuTarget; }
  get ellipsisDropdownCloseSet() { return this.#state.ellipsisDropdownCloseSet; }
  get scrcpyParams() { return this.#state.scrcpyParams; }

  get(key) { return this.#state[key]; }

  // ── Private State Helper ───────────────────────────────────────

  #set(key, value, event) {
    const old = this.#state[key];
    if (old === value) return;
    this.#state[key] = value;
    this.emit(event || `${key}-changed`, value, old);
  }

  // ── Initialization ─────────────────────────────────────────────

  async load() {
    // 从 AppState 同步 selectedDevice
    const appStateDevice = AppState.instance.get('selectedDevice');
    if (appStateDevice) {
      this.#state.selectedDevice = appStateDevice;
    }

    // 订阅 AppState 的 selectedDevice 变更，保持本地同步
    this.#unsubAppState = AppState.instance.on('selectedDevice-changed', (value) => {
      if (this.#state.selectedDevice !== value) {
        this.#state.selectedDevice = value;
        this.emit('selectedDevice-changed', value);
      }
    });

    // 加载配置（scrcpy 参数等）
    await this.loadControlParams();
  }

  destroy() {
    this.stopDeviceRefresh();
    if (this.#unsubAppState) {
      this.#unsubAppState();
      this.#unsubAppState = null;
    }
    this.removeAllListeners();
  }

  // ── 设备管理 ───────────────────────────────────────────────────

  async getConnectedDevices() {
    try {
      return await this.#api.getConnectedDevices();
    } catch (error) {
      this.emit('error', { source: 'getConnectedDevices', error });
      return [];
    }
  }

  async executeAdbCommand(cmd, deviceId) {
    try {
      return await this.#api.executeAdbCommand(cmd, deviceId);
    } catch (error) {
      this.emit('error', { source: 'executeAdbCommand', error });
      return { success: false, error: error.message };
    }
  }

  async scanDevices() {
    try {
      const devices = await this.getConnectedDevices();
      this.emit('devices-scanned', devices);
      return devices;
    } catch (error) {
      this.emit('error', { source: 'scanDevices', error });
      return [];
    }
  }

  startDeviceRefresh() {
    this.stopDeviceRefresh();
    this.#state.deviceRefreshTimer = setInterval(() => {
      this.refreshDeviceList();
    }, 2000);
  }

  stopDeviceRefresh() {
    if (this.#state.deviceRefreshTimer) {
      clearInterval(this.#state.deviceRefreshTimer);
      this.#state.deviceRefreshTimer = null;
    }
  }

  async refreshDeviceList() {
    if (this.#state.isDeviceRefreshing) return;
    this.#state.isDeviceRefreshing = true;

    try {
      const newDevices = await this.getConnectedDevices();
      const oldSet = new Set(this.#state.currentDeviceList);
      const newSet = new Set(newDevices);

      const added = newDevices.filter(d => !oldSet.has(d));
      const removed = this.#state.currentDeviceList.filter(d => !newSet.has(d));
      const unchanged = this.#state.currentDeviceList.filter(d => newSet.has(d));

      if (added.length === 0 && removed.length === 0) {
        this.#state.isDeviceRefreshing = false;
        return;
      }

      // 新设备排在前面
      const orderedDevices = [...added, ...unchanged];
      this.#set('currentDeviceList', orderedDevices, 'device-list-refreshed');

      // 如果弹窗中选中的设备被移除，清除选中状态
      if (this.#state.modalSelectedDeviceId && removed.includes(this.#state.modalSelectedDeviceId)) {
        this.#set('modalSelectedDeviceId', null, 'modal-selected-device-removed');
      }

      this.emit('device-list-diff', { added, removed, unchanged });
    } catch (error) {
      this.emit('error', { source: 'refreshDeviceList', error });
    } finally {
      this.#state.isDeviceRefreshing = false;
    }
  }

  async getDeviceInfo(deviceId, isModal = false) {
    try {
      const info = {};

      // 制造商
      const manufacturerResult = await this.executeAdbCommand('getprop ro.product.manufacturer', deviceId);
      info.manufacturer = manufacturerResult.success ? (manufacturerResult.output.trim() || '-') : '-';

      // 型号
      const modelResult = await this.executeAdbCommand('getprop ro.product.model', deviceId);
      info.model = modelResult.success ? (modelResult.output.trim() || '-') : '-';

      // Android 版本
      const androidVersionResult = await this.executeAdbCommand('getprop ro.build.version.release', deviceId);
      info.androidVersion = androidVersionResult.success ? (androidVersionResult.output.trim() || '-') : '-';

      // 仅在外部设备信息卡片中获取 WiFi、电池、存储、内存
      if (!isModal) {
        // WiFi
        info.wifi = '-';
        const wifiResult = await this.executeAdbCommand('dumpsys wifi', deviceId);
        if (wifiResult.success) {
          const wifiInfo = wifiResult.output.trim();
          const ssidMatch1 = wifiInfo.match(/SSID:\s*"([^"]+)"/i);
          if (ssidMatch1) info.wifi = ssidMatch1[1];
          if (info.wifi === '-') {
            const ssidMatch2 = wifiInfo.match(/ssid[=:\s]+"?([^"\n]+)"?/i);
            if (ssidMatch2) info.wifi = ssidMatch2[1].replace(/"/g, '');
          }
          if (info.wifi === '-') {
            const ssidMatch3 = wifiInfo.match(/mWifiInfo\s*\{[^}]*SSID:\s*"?([^",}\n]+)"?/i);
            if (ssidMatch3) info.wifi = ssidMatch3[1].replace(/"/g, '');
          }
        }
        if (info.wifi === '-') {
          const connectivityResult = await this.executeAdbCommand('dumpsys connectivity', deviceId);
          if (connectivityResult.success) {
            const ssidMatch = connectivityResult.output.match(/NetworkAgentInfo[^}]*ssid[=:\s]+"?([^",}\n]+)"?/i);
            if (ssidMatch) info.wifi = ssidMatch[1].replace(/"/g, '').replace(/\s*$/, '');
          }
        }

        // 电池
        info.battery = '-';
        const batteryResult = await this.executeAdbCommand('dumpsys battery', deviceId);
        if (batteryResult.success) {
          const levelMatch = batteryResult.output.match(/level:\s*(\d+)/i);
          if (levelMatch) info.battery = `${levelMatch[1]}%`;
        }

        // 存储
        info.storage = '-';
        const storageResult = await this.executeAdbCommand('df -h /data', deviceId);
        if (storageResult.success) {
          const lines = storageResult.output.trim().split('\n');
          if (lines.length >= 2) {
            const parts = lines[1].split(/\s+/);
            if (parts.length >= 4) {
              info.storage = `${parts[2]}/${parts[1]}`;
            }
          }
        }

        // 内存
        info.memory = '-';
        const memResult = await this.executeAdbCommand('cat /proc/meminfo', deviceId);
        if (memResult.success) {
          const totalMatch = memResult.output.match(/MemTotal:\s*(\d+)/i);
          const availMatch = memResult.output.match(/MemAvailable:\s*(\d+)/i);
          if (totalMatch && availMatch) {
            const totalGB = (parseInt(totalMatch[1]) / 1024 / 1024).toFixed(1);
            const availGB = (parseInt(availMatch[1]) / 1024 / 1024).toFixed(1);
            info.memory = `${availGB}/${totalGB} GB`;
          }
        }
      }

      this.emit('device-info-loaded', { deviceId, isModal, info });
      return info;
    } catch (error) {
      this.emit('error', { source: 'getDeviceInfo', error });
      return null;
    }
  }

  async openPort5555() {
    const deviceId = this.#state.modalSelectedDeviceId;
    if (!deviceId || deviceId.includes(':')) {
      this.emit('open-port-error', { message: '请选择 USB 设备' });
      return;
    }

    try {
      const result = await this.executeAdbCommand('tcpip 5555', deviceId);
      this.emit('open-port-result', result);
      return result;
    } catch (error) {
      this.emit('error', { source: 'openPort5555', error });
      return { success: false, error: error.message };
    }
  }

  async addDeviceByIp(ipAddress, port = 5555) {
    // 校验 IP 格式
    const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    if (!ipRegex.test(ipAddress)) {
      this.emit('add-device-ip-result', { success: false, error: 'IP 格式错误' });
      return { success: false, error: 'IP 格式错误' };
    }

    try {
      const deviceAddress = `${ipAddress}:${port}`;
      const result = await this.executeAdbCommand(`connect ${deviceAddress}`);
      this.emit('add-device-ip-result', { ...result, deviceAddress });
      return result;
    } catch (error) {
      this.emit('error', { source: 'addDeviceByIp', error });
      return { success: false, error: error.message };
    }
  }

  selectDevice(deviceId) {
    this.#set('selectedDevice', deviceId, 'selectedDevice-changed');
    this.#set('deviceStatusSaved', true, 'deviceStatusSaved-changed');
    // 同步到 AppState
    AppState.instance.set('selectedDevice', deviceId);
  }

  // ── 文件管理 ───────────────────────────────────────────────────

  async loadFileList() {
    if (!this.#state.selectedDevice) return;

    this.emit('file-list-loading');
    try {
      const cmd = `ls -la ${this.#state.currentPath}`;
      const result = await this.executeAdbCommand(cmd, this.#state.selectedDevice);

      if (result.success) {
        const fileList = AndroidConnectionModel.parseAdbFileList(result.output, this.#state.currentPath);
        this.#set('fileList', fileList, 'file-list-loaded');
        this.#set('selectedFiles', [], 'selectedFiles-changed');
      } else {
        this.emit('file-list-error', result.error || '未知错误');
      }
    } catch (error) {
      this.emit('error', { source: 'loadFileList', error });
      this.emit('file-list-error', error.message);
    }
  }

  static parseAdbFileList(output, currentPath) {
    const files = [];
    if (!output || typeof output !== 'string') return files;

    const lines = output.split('\n').filter(line => line.trim());

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
          Jan: '01', Feb: '02', Mar: '03', Apr: '04',
          May: '05', Jun: '06', Jul: '07', Aug: '08',
          Sep: '09', Oct: '10', Nov: '11', Dec: '12',
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

  async navigateToPath(path) {
    if (path === this.#state.currentPath) return;
    this.#set('currentPath', path, 'currentPath-changed');
    this.#set('selectedFiles', [], 'selectedFiles-changed');
    await this.loadFileList();
  }

  async navigateToDirectory(path) {
    this.#set('currentPath', path, 'currentPath-changed');
    this.#set('selectedFiles', [], 'selectedFiles-changed');
    await this.loadFileList();
  }

  async navigateBack() {
    if (this.#state.currentPath === '/storage/emulated/0') return;
    const pathParts = this.#state.currentPath.split('/');
    pathParts.pop();
    const parentPath = pathParts.join('/') || '/';
    await this.navigateToDirectory(parentPath);
  }

  // ── 文件上传/下载 ──────────────────────────────────────────────

  async uploadFiles() {
    try {
      const result = await this.#api.selectFiles();
      if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
        return null;
      }
      return result.filePaths;
    } catch (error) {
      this.emit('error', { source: 'uploadFiles', error });
      return null;
    }
  }

  async uploadFile(localPath, remotePath) {
    try {
      const result = await this.#api.uploadFile(localPath, remotePath, this.#state.selectedDevice);
      return result;
    } catch (error) {
      this.emit('error', { source: 'uploadFile', error });
      return { success: false, error: error.message };
    }
  }

  async downloadSelectedFiles() {
    if (this.#state.selectedFiles.length === 0) return;

    try {
      let downloadDir = await this.resolveDownloadDirectory();

      if (!downloadDir) {
        const result = await this.#api.selectDirectory();
        if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
          downloadDir = result.filePaths[0];
        } else {
          return;
        }
      }

      return { downloadDir, files: this.#state.selectedFiles };
    } catch (error) {
      this.emit('error', { source: 'downloadSelectedFiles', error });
      return null;
    }
  }

  async downloadFile(file, downloadDir) {
    try {
      const localPath = `${downloadDir}/${file.name}`;
      const result = await this.#api.downloadFile(file.path, localPath, this.#state.selectedDevice);
      return result;
    } catch (error) {
      this.emit('error', { source: 'downloadFile', error });
      return { success: false, error: error.message };
    }
  }

  async resolveDownloadDirectory() {
    try {
      const config = await this.#api.getConfig();
      const defaultDownloadPath = config?.APP_SETTINGS?.default_download_directory;

      if (defaultDownloadPath) {
        const exists = await this.#api.checkPathExists(defaultDownloadPath);
        if (exists) return defaultDownloadPath;

        const createResult = await this.#api.createDirectory(defaultDownloadPath);
        if (createResult.success) return defaultDownloadPath;

        // 目录不存在且无法创建，弹窗提示
        const dialogResult = await this.#api.showDialog({
          type: 'warning',
          title: '目录不存在',
          message: `默认下载目录 "${defaultDownloadPath}" 不存在且无法创建，是否清除该路径设置？`,
          buttons: ['清除', '取消'],
          defaultId: 0,
          cancelId: 1,
        });

        if (dialogResult.response === 0) {
          const currentConfig = await this.#api.getConfig();
          const updatedSettings = { ...currentConfig.APP_SETTINGS, default_download_directory: '' };
          await this.#api.saveConfig({ APP_SETTINGS: updatedSettings });
        }
      }
    } catch (error) {
      this.emit('error', { source: 'resolveDownloadDirectory', error });
    }
    return null;
  }

  async selectDownloadDirectory() {
    try {
      const result = await this.#api.selectDirectory();
      if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
        return result.filePaths[0];
      }
    } catch (error) {
      this.emit('error', { source: 'selectDownloadDirectory', error });
    }
    return null;
  }

  // ── APK 安装 ───────────────────────────────────────────────────

  async installApk() {
    if (!this.#state.selectedDevice) {
      this.emit('install-apk-error', { message: '请先选择设备' });
      return null;
    }

    try {
      const result = await this.#api.selectApkFile();
      if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
        return null;
      }
      const apkPath = result.filePaths[0];
      const installResult = await this.#api.installApk(apkPath, this.#state.selectedDevice);
      this.emit('install-apk-result', installResult);
      return installResult;
    } catch (error) {
      this.emit('error', { source: 'installApk', error });
      return { success: false, error: error.message };
    }
  }

  // ── 文件选择 ───────────────────────────────────────────────────

  addSelectedFile(file) {
    if (!this.#state.selectedFiles.some(f => f.path === file.path)) {
      this.#state.selectedFiles = [...this.#state.selectedFiles, file];
      this.emit('selectedFiles-changed', this.#state.selectedFiles);
    }
  }

  removeSelectedFile(file) {
    this.#state.selectedFiles = this.#state.selectedFiles.filter(f => f.path !== file.path);
    this.emit('selectedFiles-changed', this.#state.selectedFiles);
  }

  toggleSelectAll(checked) {
    if (checked) {
      this.#state.selectedFiles = [...this.#state.fileList];
    } else {
      this.#state.selectedFiles = [];
    }
    this.emit('selectedFiles-changed', this.#state.selectedFiles);
  }

  setContextMenuTarget(file) {
    this.#state.contextMenuTarget = file;
  }

  // ── 文件操作 ───────────────────────────────────────────────────

  async deleteFile(file) {
    try {
      const cmd = file.isDirectory ? `rm -rf "${file.path}"` : `rm "${file.path}"`;
      const result = await this.executeAdbCommand(cmd, this.#state.selectedDevice);
      return result;
    } catch (error) {
      this.emit('error', { source: 'deleteFile', error });
      return { success: false, error: error.message };
    }
  }

  async deleteSelectedFiles() {
    if (this.#state.selectedFiles.length === 0) return;
    const results = [];
    for (const file of this.#state.selectedFiles) {
      const result = await this.deleteFile(file);
      results.push({ file, result });
    }
    this.#set('selectedFiles', [], 'selectedFiles-changed');
    await this.loadFileList();
    return results;
  }

  async renameFile(file, newName) {
    if (!newName || newName === file.name) return { success: false, error: '无效的新名称' };
    try {
      const newPath = `${this.#state.currentPath}/${newName}`;
      const result = await this.executeAdbCommand(`mv "${file.path}" "${newPath}"`, this.#state.selectedDevice);
      if (result.success) {
        await this.loadFileList();
      }
      return result;
    } catch (error) {
      this.emit('error', { source: 'renameFile', error });
      return { success: false, error: error.message };
    }
  }

  // ── 蓝牙端口管理 ───────────────────────────────────────────────

  async showPortManagementModal() {
    try {
      const result = await this.#api.getSerialPorts();
      this.emit('serial-ports-loaded', result);
      return result;
    } catch (error) {
      this.emit('error', { source: 'showPortManagementModal', error });
      return null;
    }
  }

  // ── 投屏控制 ───────────────────────────────────────────────────

  async loadControlParams() {
    try {
      const config = await this.#api.getConfig();
      const scrcpyParams = config.SCRCPY_PARAMS || {};
      this.#set('scrcpyParams', scrcpyParams, 'scrcpy-params-loaded');
      return scrcpyParams;
    } catch (error) {
      this.emit('error', { source: 'loadControlParams', error });
      return {};
    }
  }

  async saveControlParams(params) {
    try {
      const result = await this.#api.saveConfig({ SCRCPY_PARAMS: params });
      if (result && result.success !== false) {
        this.#set('scrcpyParams', params, 'scrcpy-params-saved');
      }
      return result;
    } catch (error) {
      this.emit('error', { source: 'saveControlParams', error });
      return { success: false, error: error.message };
    }
  }

  async startScreenControl() {
    if (!this.#state.selectedDevice) {
      this.emit('screen-control-error', { message: '请先选择设备' });
      return null;
    }

    try {
      // 获取最新配置
      const config = await this.#api.getConfig();
      const scrcpyParams = config.SCRCPY_PARAMS || {};
      const result = await this.#api.startScrcpy(this.#state.selectedDevice, scrcpyParams);
      this.emit('screen-control-result', result);
      return result;
    } catch (error) {
      this.emit('error', { source: 'startScreenControl', error });
      return { success: false, error: error.message };
    }
  }

  // ── IPC 事件监听 ───────────────────────────────────────────────

  listenScrcpyError(callback) {
    return ApiBridge.api.onScrcpyError?.(callback);
  }

  listenDownloadProgress(callback) {
    return ApiBridge.api.onDownloadProgress?.(callback);
  }

  listenUploadProgress(callback) {
    return ApiBridge.api.onUploadProgress?.(callback);
  }

  listenInstallProgress(callback) {
    return ApiBridge.api.onInstallProgress?.(callback);
  }

  // ── Static Utilities ───────────────────────────────────────────

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
    if (diff < minute) return '刚刚';
    if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`;
    if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
    if (diff < week) return `${Math.floor(diff / day)} 天前`;
    if (diff < month) return `${Math.floor(diff / week)} 周前`;
    if (diff < year) return `${Math.floor(diff / month)} 个月前`;
    return dateString.slice(0, 16);
  }

  static truncateDeviceName(deviceName, maxLength = 20) {
    if (!deviceName) return '';
    if (deviceName.length <= maxLength) return deviceName;
    return deviceName.substring(0, maxLength) + '...';
  }
}

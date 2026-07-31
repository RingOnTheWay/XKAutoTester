import { EventEmitter } from '../../core/EventEmitter.js';
import { ApiBridge } from '../../core/ApiBridge.js';
import { AppState } from '../../core/AppState.js';
import { modelDeviceMixin } from './mixins/modelDeviceMixin.js';
import { modelFileManagerMixin } from './mixins/modelFileManagerMixin.js';
import { modelFileTransferMixin } from './mixins/modelFileTransferMixin.js';
import { modelPortMixin } from './mixins/modelPortMixin.js';
import { modelControlParamsMixin } from './mixins/modelControlParamsMixin.js';

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
    // MVC: model 暴露 testCase / dataPath wrapper,避免 controller 直接调 window.electronAPI
    testCaseGet: 'testCase.get',
    testCaseSaveAndGenerate: 'testCase.saveAndGenerate',
    getDataPath: 'getDataPath',
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

  // ── Private State Accessors (for mixins) ───────────────────────

  /** Mixin 访问 #api */
  get _api() { return this.#api; }
  /** Mixin 访问 #state */
  get _state() { return this.#state; }

  // ── Private State Helper ───────────────────────────────────────

  _set(key, value, event) {
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

  // ── Static Utilities ───────────────────────────────────────────

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
    if (diff < hour) return window.i18n.t('fileManager.minutesAgo', { n: Math.floor(diff / minute) });
    if (diff < day) return window.i18n.t('fileManager.hoursAgo', { n: Math.floor(diff / hour) });
    if (diff < week) return window.i18n.t('fileManager.daysAgo', { n: Math.floor(diff / day) });
    if (diff < month) return window.i18n.t('fileManager.weeksAgo', { n: Math.floor(diff / week) });
    if (diff < year) return window.i18n.t('fileManager.monthsAgo', { n: Math.floor(diff / month) });
    return dateString.slice(0, 16);
  }

  static truncateDeviceName(deviceName, maxLength = 20) {
    if (!deviceName) return '';
    if (deviceName.length <= maxLength) return deviceName;
    return deviceName.substring(0, maxLength) + '...';
  }
}

// ── Mixin Composition ─────────────────────────────────────────────
Object.assign(AndroidConnectionModel.prototype,
  modelDeviceMixin,
  modelFileManagerMixin,
  modelFileTransferMixin,
  modelPortMixin,
  modelControlParamsMixin,
);

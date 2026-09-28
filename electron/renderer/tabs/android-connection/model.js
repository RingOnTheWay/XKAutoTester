import { BaseModel } from '../../core/BaseModel.js';
import { ApiBridge } from '../../core/ApiBridge.js';
import { DeviceModel } from './models/DeviceModel.js';
import { FileManagerModel } from './models/FileManagerModel.js';
import { ControlPanelModel } from './models/ControlPanelModel.js';

// 状态 key → 子模型路由表
const DEVICE_STATE_KEYS = new Set([
  'selectedDevice',
  'modalSelectedDeviceId',
  'deviceRefreshTimer',
  'currentDeviceList',
  'isDeviceRefreshing',
  'deviceStatusSaved',
]);
const FILE_STATE_KEYS = new Set(['currentPath', 'selectedFiles', 'fileList', 'contextMenuTarget']);
const CONTROL_STATE_KEYS = new Set(['scrcpyParams']);

/**
 * AndroidConnectionModel - 安卓连接 Tab 的 Model 门面 (R28 遗留, 按 ADR-0012 模式拆分)
 *
 * 组合根: 3 个子模型各自 extends BaseModel (models/ 目录):
 * - DeviceModel        设备列表/扫描/信息查询/选中态 (AppState 同步)
 * - FileManagerModel   文件列表/导航/选择/删除/重命名 + 上传/下载 + APK 安装 (注入 device)
 * - ControlPanelModel  scrcpy 参数/投屏 + 蓝牙端口 + MVC wrappers (注入 device)
 *
 * 门面职责:
 * 1. 事件转发: 子模型事件原样上抛, controller/view 订阅词汇不变 (零调用方改动)
 * 2. 跨域路由: 子模型互不引用 (FileManager/ControlPanel 单向注入 DeviceModel)
 * 3. 方法/状态委托: 保持原公开面 (含 _api 共享对象 + _set 路由兼容, 测试零改动)
 *
 * 注: ellipsisDropdownCloseSet 状态已删 (全仓零读者, R28 遗留清理时确认)。
 */
export class AndroidConnectionModel extends BaseModel {
  _api = ApiBridge.bind({
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
    // R27 修复: 漏配两映射 → this._api.deleteRemoteFile/renameRemoteFile undefined
    // ("is not a function") — preload/主进程/常量均有, 唯独 bind specs 缺
    deleteRemoteFile: 'deleteRemoteFile',
    renameRemoteFile: 'renameRemoteFile',
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

  #deviceModel;
  #fileManagerModel;
  #controlPanelModel;

  constructor() {
    super();
    // 子模型共享同一 _api 对象; FileManager/ControlPanel 单向注入 DeviceModel (ADR-0012)
    this.#deviceModel = new DeviceModel(this._api);
    this.#fileManagerModel = new FileManagerModel(this._api, { device: this.#deviceModel });
    this.#controlPanelModel = new ControlPanelModel(this._api, { device: this.#deviceModel });
    // 子模型 → 门面 事件转发 (显式列出, 可 grep; 'error' 带原 source 上抛)
    const forward = [
      [
        this.#deviceModel,
        [
          'devices-scanned',
          'device-list-refreshed',
          'device-list-diff',
          'modal-selected-device-removed',
          'device-info-loaded',
          'open-port-error',
          'open-port-result',
          'add-device-ip-result',
          'selectedDevice-changed',
          'deviceStatusSaved-changed',
          'error',
        ],
      ],
      [
        this.#fileManagerModel,
        [
          'file-list-loading',
          'file-list-loaded',
          'file-list-error',
          'currentPath-changed',
          'selectedFiles-changed',
          'install-apk-error',
          'install-apk-result',
          'error',
        ],
      ],
      [
        this.#controlPanelModel,
        [
          'scrcpy-params-loaded',
          'scrcpy-params-saved',
          'serial-ports-loaded',
          'screen-control-result',
          'screen-control-error',
          'error',
        ],
      ],
    ];
    for (const [sub, events] of forward) {
      for (const event of events) {
        sub.on(event, (...args) => this.emit(event, ...args));
      }
    }
  }

  // ── 子模型访问 (供渐进迁移与测试) ──────────────────────────────

  get deviceModel() {
    return this.#deviceModel;
  }
  get fileManagerModel() {
    return this.#fileManagerModel;
  }
  get controlPanelModel() {
    return this.#controlPanelModel;
  }

  // ── State Getters (委托) ───────────────────────────────────────

  get selectedDevice() {
    return this.#deviceModel.get('selectedDevice');
  }
  get modalSelectedDeviceId() {
    return this.#deviceModel.get('modalSelectedDeviceId');
  }
  get deviceRefreshTimer() {
    return this.#deviceModel.get('deviceRefreshTimer');
  }
  get currentDeviceList() {
    return this.#deviceModel.get('currentDeviceList');
  }
  get isDeviceRefreshing() {
    return this.#deviceModel.get('isDeviceRefreshing');
  }
  get deviceStatusSaved() {
    return this.#deviceModel.get('deviceStatusSaved');
  }
  get currentPath() {
    return this.#fileManagerModel.get('currentPath');
  }
  get selectedFiles() {
    return this.#fileManagerModel.get('selectedFiles');
  }
  get fileList() {
    return this.#fileManagerModel.get('fileList');
  }
  get contextMenuTarget() {
    return this.#fileManagerModel.get('contextMenuTarget');
  }
  get scrcpyParams() {
    return this.#controlPanelModel.get('scrcpyParams');
  }

  /**
   * 按状态 key 路由到对应子模型 (保持原 get(key) 公开面)
   */
  get(key) {
    if (DEVICE_STATE_KEYS.has(key)) return this.#deviceModel.get(key);
    if (FILE_STATE_KEYS.has(key)) return this.#fileManagerModel.get(key);
    if (CONTROL_STATE_KEYS.has(key)) return this.#controlPanelModel.get(key);
    return super.get(key);
  }

  /**
   * Compat State Helper (R28: 按状态 key 路由到子模型 set, 测试与存量调用零改动)
   */
  _set(key, value, event) {
    if (DEVICE_STATE_KEYS.has(key)) return this.#deviceModel.set(key, value, event);
    if (FILE_STATE_KEYS.has(key)) return this.#fileManagerModel.set(key, value, event);
    if (CONTROL_STATE_KEYS.has(key)) return this.#controlPanelModel.set(key, value, event);
    return super.set(key, value, event);
  }

  // ── 初始化 / 生命周期 ──────────────────────────────────────────

  async load() {
    // 设备域: AppState selectedDevice 初始同步 + 订阅
    this.#deviceModel.initAppStateSync();

    // 控制面板: 加载配置（scrcpy 参数等）
    await this.#controlPanelModel.loadControlParams();
  }

  destroy() {
    // 子模型生命周期收尾 (device 含刷新定时器 + AppState 退订)
    this.#deviceModel.destroy();
    this.#fileManagerModel.destroy();
    this.#controlPanelModel.destroy();
    // R28: 基类收尾 (removeAllListeners)
    super.destroy();
  }

  // ─── 设备管理 (models/DeviceModel) ────────────────────────────

  getConnectedDevices() {
    return this.#deviceModel.getConnectedDevices();
  }

  executeAdbCommand(cmd, deviceId) {
    return this.#deviceModel.executeAdbCommand(cmd, deviceId);
  }

  scanDevices() {
    return this.#deviceModel.scanDevices();
  }

  startDeviceRefresh() {
    return this.#deviceModel.startDeviceRefresh();
  }

  stopDeviceRefresh() {
    return this.#deviceModel.stopDeviceRefresh();
  }

  refreshDeviceList() {
    return this.#deviceModel.refreshDeviceList();
  }

  getDeviceInfo(deviceId, isModal = false) {
    return this.#deviceModel.getDeviceInfo(deviceId, isModal);
  }

  openPort5555() {
    return this.#deviceModel.openPort5555();
  }

  addDeviceByIp(ipAddress, port = 5555) {
    return this.#deviceModel.addDeviceByIp(ipAddress, port);
  }

  selectDevice(deviceId) {
    return this.#deviceModel.selectDevice(deviceId);
  }

  // ─── 文件管理 + 传输 + APK (models/FileManagerModel) ──────────

  loadFileList() {
    return this.#fileManagerModel.loadFileList();
  }

  sanitizeRemotePath(p) {
    return this.#fileManagerModel.sanitizeRemotePath(p);
  }

  navigateToPath(path) {
    return this.#fileManagerModel.navigateToPath(path);
  }

  navigateToDirectory(path) {
    return this.#fileManagerModel.navigateToDirectory(path);
  }

  navigateBack() {
    return this.#fileManagerModel.navigateBack();
  }

  addSelectedFile(file) {
    return this.#fileManagerModel.addSelectedFile(file);
  }

  removeSelectedFile(file) {
    return this.#fileManagerModel.removeSelectedFile(file);
  }

  toggleSelectAll(checked) {
    return this.#fileManagerModel.toggleSelectAll(checked);
  }

  setContextMenuTarget(file) {
    return this.#fileManagerModel.setContextMenuTarget(file);
  }

  deleteFile(file) {
    return this.#fileManagerModel.deleteFile(file);
  }

  deleteSelectedFiles() {
    return this.#fileManagerModel.deleteSelectedFiles();
  }

  renameFile(file, newName) {
    return this.#fileManagerModel.renameFile(file, newName);
  }

  uploadFiles() {
    return this.#fileManagerModel.uploadFiles();
  }

  uploadFile(localPath, remotePath) {
    return this.#fileManagerModel.uploadFile(localPath, remotePath);
  }

  downloadSelectedFiles() {
    return this.#fileManagerModel.downloadSelectedFiles();
  }

  downloadFile(file, downloadDir) {
    return this.#fileManagerModel.downloadFile(file, downloadDir);
  }

  resolveDownloadDirectory() {
    return this.#fileManagerModel.resolveDownloadDirectory();
  }

  selectDownloadDirectory() {
    return this.#fileManagerModel.selectDownloadDirectory();
  }

  installApk() {
    return this.#fileManagerModel.installApk();
  }

  // ─── 蓝牙端口 / 投屏 / MVC wrappers (models/ControlPanelModel) ─

  showPortManagementModal() {
    return this.#controlPanelModel.showPortManagementModal();
  }

  loadControlParams() {
    return this.#controlPanelModel.loadControlParams();
  }

  saveControlParams(params) {
    return this.#controlPanelModel.saveControlParams(params);
  }

  getTestCase(fileName) {
    return this.#controlPanelModel.getTestCase(fileName);
  }

  saveAndGenerateTestCase(caseData, outputDir) {
    return this.#controlPanelModel.saveAndGenerateTestCase(caseData, outputDir);
  }

  getDataPath() {
    return this.#controlPanelModel.getDataPath();
  }

  startScreenControl() {
    return this.#controlPanelModel.startScreenControl();
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

  // ─── Static Utilities (委托子模型, 保持公开面) ────────────────

  static parseAdbFileList(output, currentPath) {
    return FileManagerModel.parseAdbFileList(output, currentPath);
  }

  static formatFileSize(bytes) {
    return FileManagerModel.formatFileSize(bytes);
  }

  static formatRelativeTime(dateString) {
    return FileManagerModel.formatRelativeTime(dateString);
  }

  static truncateDeviceName(deviceName, maxLength = 20) {
    if (!deviceName) return '';
    if (deviceName.length <= maxLength) return deviceName;
    return deviceName.substring(0, maxLength) + '...';
  }
}

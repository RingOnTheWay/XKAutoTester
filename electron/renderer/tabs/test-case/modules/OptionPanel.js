/**
 * OptionPanel - 测试用例选项面板深模块 (R10 renderer mixin → deep module)
 *
 * 领域边界：应用列表 / 平台 / 蓝牙设备 / pytest markers 的加载与选择
 * 不负责：文件浏览 (FileBrowser)、步骤编辑 (StepEditor)、编辑器状态机 (TestCaseEditor)
 *
 * 取自原 modelDirectoryMixin (loadApps/loadBleDevices/loadMarkers) +
 * modelCaseMixin (selectApp/selectPlatform) + modelStepMixin (toggleMarker)。
 * Model 持有实例并委托方法，事件经 Model 转发给 Controller (保持现有 Controller 监听不变)。
 *
 * R10 阶段 3 接口收紧：_api/_state/_set 全部转为 #private。
 *
 * 事件：
 *   - apps-changed(apps)                 应用列表变更
 *   - ble-devices-changed(devices)       蓝牙设备列表变更
 *   - markers-list-changed(markers)      可用 markers 列表变更
 *   - app-changed(app)                   选中应用变更
 *   - platform-changed(platform)         选中平台变更
 *   - markers-changed(selectedMarkers)   选中 markers 变更
 *   - error({source, error})             操作失败
 */
import { EventEmitter } from '../../../core/EventEmitter.js';

export class OptionPanel extends EventEmitter {
  /** @type {Object} ApiBridge 绑定后的 API 对象 */
  #api;
  /** @type {Object} 内部状态容器 */
  #state = {
    apps: [],
    selectedApp: null,
    selectedPlatform: 'android',
    bleDevices: [],
    markers: [],
    selectedMarkers: [],
  };

  /**
   * @param {Object} api - ApiBridge 绑定后的 API 对象
   */
  constructor(api) {
    super();
    this.#api = api;
  }

  // ── State Getters ──────────────────────────────────────────────

  /** @returns {Array} 应用列表 */
  get apps() {
    return this.#state.apps;
  }
  /** @returns {Object|null} 选中的应用 */
  get selectedApp() {
    return this.#state.selectedApp;
  }
  /** @returns {string} 选中的平台标识 */
  get selectedPlatform() {
    return this.#state.selectedPlatform;
  }
  /** @returns {Array} 蓝牙设备列表 */
  get bleDevices() {
    return this.#state.bleDevices;
  }
  /** @returns {Array} 可用 markers 列表 */
  get markers() {
    return this.#state.markers;
  }
  /** @returns {string[]} 选中的 markers 名称数组 */
  get selectedMarkers() {
    return this.#state.selectedMarkers;
  }

  /**
   * 通用状态获取（供 Model.get 委托）
   * @param {string} key - 状态键名
   * @returns {*} 状态值，键不存在返回 undefined
   */
  get(key) {
    return this.#state[key];
  }

  /**
   * 更新状态并触发对应事件 (内部方法)
   * @param {string} key - 状态键名
   * @param {*} value - 新值
   * @param {string} [event] - 事件名，默认 `${key}-changed`
   */
  #set(key, value, event) {
    const old = this.#state[key];
    if (old === value) return;
    this.#state[key] = value;
    this.emit(event || `${key}-changed`, value, old);
  }

  // ── Reference Data Loaders ─────────────────────────────────────

  /**
   * 并行加载所有引用数据 (apps + bleDevices + markers)
   */
  async load() {
    await Promise.all([this.loadApps(), this.loadBleDevices(), this.loadMarkers()]);
  }

  /**
   * 加载应用列表
   */
  async loadApps() {
    try {
      const result = await this.#api.getApps();
      // invokeWithCheck 已保证失败时抛错，此处只需校验业务字段 data
      this.#set('apps', result.data || [], 'apps-changed');
    } catch (error) {
      this.emit('error', { source: 'loadApps', error });
    }
  }

  /**
   * 加载蓝牙设备列表
   */
  async loadBleDevices() {
    try {
      const result = await this.#api.getBleDevices();
      // invokeWithCheck 已保证失败时抛错，此处只需校验业务字段 data
      this.#set('bleDevices', result.data || [], 'ble-devices-changed');
    } catch (error) {
      this.emit('error', { source: 'loadBleDevices', error });
    }
  }

  /**
   * 加载 pytest markers 列表
   */
  async loadMarkers() {
    try {
      const markers = await this.#api.getPytestMarkers();
      this.#set('markers', markers || [], 'markers-list-changed');
    } catch (error) {
      this.#set('markers', [], 'markers-list-changed');
      this.emit('error', { source: 'loadMarkers', error });
    }
  }

  // ── Selection Mutators ─────────────────────────────────────────

  /**
   * 设置选中的应用
   * @param {Object} app - 应用对象
   */
  selectApp(app) {
    this.#set('selectedApp', app, 'app-changed');
  }

  /**
   * 设置选中的平台
   * @param {string} platform - 平台标识
   */
  selectPlatform(platform) {
    this.#set('selectedPlatform', platform, 'platform-changed');
  }

  /**
   * 切换 Marker 选中状态
   * @param {string} marker - Marker 名称
   */
  toggleMarker(marker) {
    const markers = [...this.#state.selectedMarkers];
    const idx = markers.indexOf(marker);
    if (idx === -1) {
      markers.push(marker);
    } else {
      markers.splice(idx, 1);
    }
    this.#set('selectedMarkers', markers, 'markers-changed');
  }

  /**
   * 替换选中的 markers 列表 (用于从已保存用例恢复)
   * @param {string[]} markers - marker 名称数组
   */
  replaceSelectedMarkers(markers) {
    this.#set('selectedMarkers', markers || [], 'markers-changed');
  }
}

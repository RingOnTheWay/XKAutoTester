/**
 * DeviceSelectionModal - 设备选择模态框组件
 * Promise-based API，支持 select / test / inspector 三种模式
 *
 * 方法按域拆分到 ./mixins/deviceModal*Mixin.js，通过 Object.assign 挂到原型。
 * 私有字段 #xxx 保留在类体内；mixin 需读写的字段通过下方 get/set 访问器暴露。
 */
import { deviceModalLifecycleMixin } from './mixins/deviceModalLifecycleMixin.js';
import { deviceModalScanMixin } from './mixins/deviceModalScanMixin.js';
import { deviceModalRenderMixin } from './mixins/deviceModalRenderMixin.js';
import { deviceModalNetworkMixin } from './mixins/deviceModalNetworkMixin.js';
import { deviceModalDeviceInfoMixin } from './mixins/deviceModalDeviceInfoMixin.js';

class DeviceSelectionModal {
  // ---- 私有状态 ----
  #resolve = null;
  #reject = null;
  #mode = null;
  #modalSelectedDeviceId = null;
  #deviceRefreshTimer = null;
  #currentDeviceList = [];
  #isDeviceRefreshing = false;
  #originalZIndex = null;
  #androidVersion = null;

  // ---- DOM 缓存 ----
  #overlay = null;
  #confirmBtn = null;
  #cancelBtn = null;
  #closeBtn = null;
  #openPortBtn = null;

  // ---- 事件处理器引用（便于卸载） ----
  #boundConfirm = null;
  #boundCancel = null;
  #boundClose = null;
  #boundOpenPort = null;

  constructor() {
    this.#cacheDom();
  }

  // ---- 访问器（供 mixin 读写私有字段） ----
  get overlay() {
    return this.#overlay;
  }
  get confirmBtn() {
    return this.#confirmBtn;
  }
  set confirmBtn(v) {
    this.#confirmBtn = v;
  }
  get cancelBtn() {
    return this.#cancelBtn;
  }
  set cancelBtn(v) {
    this.#cancelBtn = v;
  }
  get closeBtn() {
    return this.#closeBtn;
  }
  set closeBtn(v) {
    this.#closeBtn = v;
  }
  get openPortBtn() {
    return this.#openPortBtn;
  }
  set openPortBtn(v) {
    this.#openPortBtn = v;
  }
  get boundConfirm() {
    return this.#boundConfirm;
  }
  set boundConfirm(v) {
    this.#boundConfirm = v;
  }
  get boundCancel() {
    return this.#boundCancel;
  }
  set boundCancel(v) {
    this.#boundCancel = v;
  }
  get boundClose() {
    return this.#boundClose;
  }
  set boundClose(v) {
    this.#boundClose = v;
  }
  get boundOpenPort() {
    return this.#boundOpenPort;
  }
  set boundOpenPort(v) {
    this.#boundOpenPort = v;
  }
  get mode() {
    return this.#mode;
  }
  set mode(v) {
    this.#mode = v;
  }
  get resolve() {
    return this.#resolve;
  }
  set resolve(v) {
    this.#resolve = v;
  }
  get reject() {
    return this.#reject;
  }
  set reject(v) {
    this.#reject = v;
  }
  get originalZIndex() {
    return this.#originalZIndex;
  }
  set originalZIndex(v) {
    this.#originalZIndex = v;
  }
  get modalSelectedDeviceId() {
    return this.#modalSelectedDeviceId;
  }
  set modalSelectedDeviceId(v) {
    this.#modalSelectedDeviceId = v;
  }
  get currentDeviceList() {
    return this.#currentDeviceList;
  }
  set currentDeviceList(v) {
    this.#currentDeviceList = v;
  }
  set androidVersion(v) {
    this.#androidVersion = v;
  }
  get deviceRefreshTimer() {
    return this.#deviceRefreshTimer;
  }
  set deviceRefreshTimer(v) {
    this.#deviceRefreshTimer = v;
  }
  get isDeviceRefreshing() {
    return this.#isDeviceRefreshing;
  }
  set isDeviceRefreshing(v) {
    this.#isDeviceRefreshing = v;
  }

  // ==================== 公开 API ====================

  /**
   * 显示设备选择模态框，返回 Promise<string>（deviceId）
   * @param {{ mode: 'select' | 'test' | 'inspector' }} options
   * @returns {Promise<string>}
   */
  show({ mode = 'select' } = {}) {
    return new Promise((resolve, reject) => {
      this.#resolve = resolve;
      this.#reject = reject;
      this.#mode = mode;

      // inspector 模式：提升 z-index
      if (mode === 'inspector') {
        this.#originalZIndex = this.#overlay.style.zIndex || '';
        this.#overlay.style.zIndex = '1500';
      }

      // 打开模态框
      const modal = window.__XKAT_MODALS__?.device;
      if (modal) modal.open();

      // 扫描状态
      this.showDeviceScanningState();

      // 扫描设备
      this.scanDevices().then(() => {
        this.startDeviceRefresh();
      });

      // 绑定按钮
      this.bindSessionButtons();
    });
  }

  // ==================== 内部方法 ====================

  #cacheDom() {
    this.#overlay = document.getElementById('device-modal-overlay');
    this.#confirmBtn = document.getElementById('device-modal-confirm-btn');
    this.#cancelBtn = document.getElementById('device-modal-cancel-btn');
    this.#closeBtn = document.getElementById('device-modal-close-btn');
    this.#openPortBtn = document.getElementById('open-port-btn');
  }
}

// 通过 Object.assign 把各 mixin 的方法挂到原型上，实现按域拆分
Object.assign(
  DeviceSelectionModal.prototype,
  deviceModalLifecycleMixin,
  deviceModalScanMixin,
  deviceModalRenderMixin,
  deviceModalNetworkMixin,
  deviceModalDeviceInfoMixin
);

// 默认导出
export default DeviceSelectionModal;

import { BaseModel } from '../../../core/BaseModel.js';
import { AppState } from '../../../core/AppState.js';

/**
 * DeviceModel - 设备管理子模型 (R28 遗留, 按 ADR-0012 模式拆分)
 *
 * 职责: 设备列表刷新/扫描/信息查询/选中态 (AppState selectedDevice 同步)/
 * 端口打开/IP 添加设备。作为能力提供者被 FileManagerModel/ControlPanelModel
 * 单向注入 (Device ← FileManager/ControlPanel, 不成环)。
 *
 * 事件面 (门面显式转发): devices-scanned / device-list-refreshed / device-list-diff /
 * modal-selected-device-removed / device-info-loaded / open-port-error / open-port-result /
 * add-device-ip-result / selectedDevice-changed / deviceStatusSaved-changed / error
 */
export class DeviceModel extends BaseModel {
  _api;
  #unsubAppState = null;

  /**
   * @param {Object} api - ApiBridge 绑定对象 (与门面/兄弟子模型共享同一实例)
   */
  constructor(api) {
    super({
      selectedDevice: null, // 当前选中的设备 ID（与 AppState 同步）
      modalSelectedDeviceId: null, // 设备管理弹窗中选中的设备 ID
      deviceRefreshTimer: null, // 设备列表刷新定时器
      currentDeviceList: [], // 当前设备列表
      isDeviceRefreshing: false, // 是否正在刷新设备列表
      deviceStatusSaved: false, // 设备选择状态是否已保存
    });
    this._api = api;
  }

  // ── State Getters ──────────────────────────────────────────────

  get selectedDevice() {
    return this.get('selectedDevice');
  }
  get modalSelectedDeviceId() {
    return this.get('modalSelectedDeviceId');
  }
  get deviceRefreshTimer() {
    return this.get('deviceRefreshTimer');
  }
  get currentDeviceList() {
    return this.get('currentDeviceList');
  }
  get isDeviceRefreshing() {
    return this.get('isDeviceRefreshing');
  }
  get deviceStatusSaved() {
    return this.get('deviceStatusSaved');
  }

  /**
   * AppState 同步: 初始取值 + 订阅 selectedDevice 变更 (由门面 load 调用)
   */
  initAppStateSync() {
    const appStateDevice = AppState.instance.get('selectedDevice');
    if (appStateDevice) {
      this.silentSet('selectedDevice', appStateDevice);
    }

    // 订阅 AppState 的 selectedDevice 变更，保持本地同步 (set 短路 + 发事件)
    this.#unsubAppState = AppState.instance.on('selectedDevice-changed', (value) => {
      this.set('selectedDevice', value, 'selectedDevice-changed');
    });
  }

  destroy() {
    this.stopDeviceRefresh();
    if (this.#unsubAppState) {
      this.#unsubAppState();
      this.#unsubAppState = null;
    }
    super.destroy();
  }

  // ─── 设备列表 ─────────────────────────────────────────────────

  async getConnectedDevices() {
    try {
      return await this._api.getConnectedDevices();
    } catch (error) {
      this.emitError('getConnectedDevices', error);
      return [];
    }
  }

  async executeAdbCommand(cmd, deviceId) {
    // wrapper(invokeWithCheck) 已在 success=false 时抛错,此处直接透传由调用方按需 try-catch
    return await this._api.executeAdbCommand(cmd, deviceId);
  }

  async scanDevices() {
    try {
      const devices = await this.getConnectedDevices();
      this.emit('devices-scanned', devices);
      return devices;
    } catch (error) {
      this.emitError('scanDevices', error);
      return [];
    }
  }

  startDeviceRefresh() {
    this.stopDeviceRefresh();
    this.silentSet(
      'deviceRefreshTimer',
      setInterval(() => {
        this.refreshDeviceList();
      }, 2000)
    );
  }

  stopDeviceRefresh() {
    const timer = this.get('deviceRefreshTimer');
    if (timer) {
      clearInterval(timer);
      this.silentSet('deviceRefreshTimer', null);
    }
  }

  async refreshDeviceList() {
    if (this.get('isDeviceRefreshing')) return;
    this.silentSet('isDeviceRefreshing', true);

    try {
      const newDevices = await this.getConnectedDevices();
      // 设备对象为 {id, status}，按 id 比较增减
      const oldIdSet = new Set(this.get('currentDeviceList').map((d) => d.id));
      const newIdSet = new Set(newDevices.map((d) => d.id));

      const added = newDevices.filter((d) => !oldIdSet.has(d.id));
      const removedIds = this.get('currentDeviceList')
        .filter((d) => !newIdSet.has(d.id))
        .map((d) => d.id);
      const unchanged = this.get('currentDeviceList').filter((d) => newIdSet.has(d.id));

      // 检测状态变化（如 unauthorized → device）
      const statusChanged = newDevices.filter((d) => {
        const old = this.get('currentDeviceList').find((o) => o.id === d.id);
        return old && old.status !== d.status;
      });

      if (added.length === 0 && removedIds.length === 0 && statusChanged.length === 0) {
        this.silentSet('isDeviceRefreshing', false);
        return;
      }

      // 新设备排在前面
      const orderedDevices = [...added, ...unchanged];
      this.set('currentDeviceList', orderedDevices, 'device-list-refreshed');

      // 如果弹窗中选中的设备被移除，清除选中状态
      if (this.get('modalSelectedDeviceId') && removedIds.includes(this.get('modalSelectedDeviceId'))) {
        this.set('modalSelectedDeviceId', null, 'modal-selected-device-removed');
      }

      this.emit('device-list-diff', {
        added,
        removed: removedIds,
        unchanged,
        statusChanged,
      });
    } catch (error) {
      this.emitError('refreshDeviceList', error);
    } finally {
      this.silentSet('isDeviceRefreshing', false);
    }
  }

  // ─── 设备信息查询 ─────────────────────────────────────────────

  async getDeviceInfo(deviceId, isModal = false) {
    try {
      const info = {};

      // 查询设备状态，未授权/离线时直接显示提示文案
      const devices = await this.getConnectedDevices();
      const device = devices.find((d) => d.id === deviceId);
      const status = device?.status || 'unknown';

      if (status !== 'device') {
        const tipKey =
          status === 'unauthorized'
            ? 'deviceModal.unauthorizedTip'
            : status === 'offline'
              ? 'deviceModal.offlineTip'
              : 'deviceModal.unavailableTip';
        const tip = (window.i18n && window.i18n.t(tipKey)) || 'Device unavailable';
        info.manufacturer = tip;
        info.model = tip;
        info.androidVersion = tip;
        if (!isModal) {
          info.wifi = tip;
          info.battery = tip;
          info.storage = tip;
          info.memory = tip;
        }
        this.emit('device-info-loaded', { deviceId, isModal, info });
        return info;
      }

      // 制造商
      let manufacturerResult = null;
      try {
        manufacturerResult = await this.executeAdbCommand('getprop ro.product.manufacturer', deviceId);
      } catch (e) {
        /* 单个 ADB 命令失败容错继续 */
      }
      info.manufacturer =
        manufacturerResult && manufacturerResult.output ? manufacturerResult.output.trim() || '-' : '-';

      // 型号
      let modelResult = null;
      try {
        modelResult = await this.executeAdbCommand('getprop ro.product.model', deviceId);
      } catch (e) {
        /* 单个 ADB 命令失败容错继续 */
      }
      info.model = modelResult && modelResult.output ? modelResult.output.trim() || '-' : '-';

      // Android 版本（wrapper 失败已抛错由外层 catch 接,此处走到即成功）
      const androidVersionResult = await this.executeAdbCommand('getprop ro.build.version.release', deviceId);
      info.androidVersion = androidVersionResult.output.trim() || '-';

      // 仅在外部设备信息卡片中获取 WiFi、电池、存储、内存
      if (!isModal) {
        // WiFi（连续多个 ADB 命令,单个失败容错继续,保留默认值 '-'）
        info.wifi = '-';
        let wifiResult = null;
        try {
          wifiResult = await this.executeAdbCommand('dumpsys wifi', deviceId);
        } catch (e) {
          /* 单个命令失败容错,保留默认值 */
        }
        if (wifiResult && wifiResult.output) {
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
          let connectivityResult = null;
          try {
            connectivityResult = await this.executeAdbCommand('dumpsys connectivity', deviceId);
          } catch (e) {
            /* 单个命令失败容错,保留默认值 */
          }
          if (connectivityResult && connectivityResult.output) {
            const ssidMatch = connectivityResult.output.match(/NetworkAgentInfo[^}]*ssid[=:\s]+"?([^",}\n]+)"?/i);
            if (ssidMatch) info.wifi = ssidMatch[1].replace(/"/g, '').replace(/\s*$/, '');
          }
        }

        // 电池
        info.battery = '-';
        let batteryResult = null;
        try {
          batteryResult = await this.executeAdbCommand('dumpsys battery', deviceId);
        } catch (e) {
          /* 单个命令失败容错,保留默认值 */
        }
        if (batteryResult && batteryResult.output) {
          const levelMatch = batteryResult.output.match(/level:\s*(\d+)/i);
          if (levelMatch) info.battery = `${levelMatch[1]}%`;
        }

        // 存储
        info.storage = '-';
        let storageResult = null;
        try {
          storageResult = await this.executeAdbCommand('df -h /data', deviceId);
        } catch (e) {
          /* 单个命令失败容错,保留默认值 */
        }
        if (storageResult && storageResult.output) {
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
        let memResult = null;
        try {
          memResult = await this.executeAdbCommand('cat /proc/meminfo', deviceId);
        } catch (e) {
          /* 单个命令失败容错,保留默认值 */
        }
        if (memResult && memResult.output) {
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
      this.emitError('getDeviceInfo', error);
      return null;
    }
  }

  // ─── 设备连接扩展 ─────────────────────────────────────────────

  async openPort5555() {
    const deviceId = this.get('modalSelectedDeviceId');
    if (!deviceId || deviceId.includes(':')) {
      this.emit('open-port-error', {
        message: window.i18n.t('android.selectUsbDevice'),
      });
      return;
    }

    try {
      const result = await this.executeAdbCommand('tcpip 5555', deviceId);
      this.emit('open-port-result', result);
      return result;
    } catch (error) {
      this.emitError('openPort5555', error);
      return { success: false, error: error.message };
    }
  }

  async addDeviceByIp(ipAddress, port = 5555) {
    // 校验 IP 格式
    const ipRegex = /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/;
    if (!ipRegex.test(ipAddress)) {
      this.emit('add-device-ip-result', {
        success: false,
        error: window.i18n.t('android.ipFormatError'),
      });
      return { success: false, error: window.i18n.t('android.ipFormatError') };
    }

    try {
      const deviceAddress = `${ipAddress}:${port}`;
      const result = await this.executeAdbCommand(`connect ${deviceAddress}`);
      this.emit('add-device-ip-result', { ...result, deviceAddress });
      return result;
    } catch (error) {
      this.emitError('addDeviceByIp', error);
      return { success: false, error: error.message };
    }
  }

  selectDevice(deviceId) {
    this.set('selectedDevice', deviceId, 'selectedDevice-changed');
    this.set('deviceStatusSaved', true, 'deviceStatusSaved-changed');
    // 同步到 AppState
    AppState.instance.set('selectedDevice', deviceId);
  }
}

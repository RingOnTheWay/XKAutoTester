/**
 * Model Mixin - 脏标记、编辑器重置、表单收集与生命周期
 * 提供 markDirty / resetEditor / collectFormData / syncStepsFromDOM / destroy 方法
 * 通过 Object.assign 挂载到 TestCaseModel.prototype
 */
export const modelFormMixin = {
  // ── Dirty / Reset ──────────────────────────────────────────────

  /**
   * 标记为有未保存更改
   */
  markDirty() {
    this._set('hasUnsavedChanges', true, 'dirty-changed');
  },

  /**
   * 重置所有编辑器状态到默认值
   */
  resetEditor() {
    this._set('steps', [], 'steps-changed');
    this._set('selectedApp', null, 'app-changed');
    this._set('selectedPlatform', 'android', 'platform-changed');
    this._set('selectedMarkers', [], 'markers-changed');
    this._set('loadedDeviceConfig', null);
    this._set('loadedBleDevice', null);
  },

  // ── Form Data Collection ───────────────────────────────────────

  /**
   * 收集所有表单数据为用例对象
   * @param {Object} domData - View 收集的 DOM 数据
   *   { inputs: {fileName, caseName, description, epic, feature, story,
   *              appLoadWaitTime, elementWaitTimeout, stepInterval, appCloseWaitTime},
   *     steps: Array }
   * @returns {Object} 用例数据
   */
  collectFormData(domData = {}) {
    const { inputs = {}, steps: stepsFromDOM = [] } = domData;
    const {
      fileName = '',
      caseName = '',
      description = '',
      epic = '',
      feature = '',
      story = '',
      appLoadWaitTime = 10,
      elementWaitTimeout = 30,
      stepInterval = 2,
      appCloseWaitTime = 2,
    } = inputs;

    const markers = [...this._state.selectedMarkers];

    // 从步骤中提取蓝牙设备信息
    let bleDevice = null;
    for (const step of stepsFromDOM) {
      if (step.type === 'ble') {
        const config = step.config || {};
        const deviceConfig = config.deviceConfig || {};
        if (deviceConfig.deviceId) {
          const device = this._state.bleDevices.find(d => d.deviceId === deviceConfig.deviceId);
          if (device) {
            const bleConfig = device.bleConfig || {};
            bleDevice = {
              uuids: bleConfig.uuids || '',
              uuidn: bleConfig.uuidn || '',
              uuidw: bleConfig.uuidw || '',
              bleName: bleConfig.bleName || '',
              advData: bleConfig.advData || '',
              port: deviceConfig.port || '',
              deviceId: device.deviceId,
              deviceName: device.name,
              methodName: deviceConfig.methodName,
              methodParams: deviceConfig.params || {},
            };
            break;
          }
        }
      }
    }

    // 合并蓝牙设备配置：优先使用加载配置中的端口
    if (bleDevice && this._state.loadedBleDevice) {
      if (this._state.loadedBleDevice.port) {
        bleDevice.port = this._state.loadedBleDevice.port;
      }
    }

    // 如果步骤中没有蓝牙设备信息，但之前加载了蓝牙设备配置，保留它
    if (!bleDevice && this._state.loadedBleDevice) {
      bleDevice = this._state.loadedBleDevice;
    }

    const deviceConfig = this._state.loadedDeviceConfig || null;

    return {
      fileName,
      name: caseName || fileName,
      description,
      platform: this._state.selectedPlatform || 'android',
      targetApp: this._state.selectedApp,
      steps: stepsFromDOM,
      deviceConfig,
      bleDevice,
      allureConfig: {
        epic,
        feature,
        story,
        markers,
      },
      waitTimeConfig: {
        appLoadWaitTime: parseFloat(appLoadWaitTime) || 10,
        elementWaitTimeout: parseFloat(elementWaitTimeout) || 30,
        stepInterval: parseFloat(stepInterval) || 2,
        appCloseWaitTime: parseFloat(appCloseWaitTime) || 2,
      },
    };
  },

  /**
   * 从外部传入的步骤数据同步到 model
   * @param {Array} stepsFromDOM - View 从 DOM 收集的步骤数据
   */
  syncStepsFromDOM(stepsFromDOM) {
    if (!Array.isArray(stepsFromDOM) || stepsFromDOM.length === 0) return;
    this._state.steps = stepsFromDOM;
  },

  destroy() {
    if (this._state.searchDebounceTimer) {
      clearTimeout(this._state.searchDebounceTimer);
      this._state.searchDebounceTimer = null;
    }
    this.removeAllListeners();
  },
};

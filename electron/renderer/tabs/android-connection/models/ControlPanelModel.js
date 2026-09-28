import { BaseModel } from '../../../core/BaseModel.js';

/**
 * ControlPanelModel - 控制面板子模型 (R28 遗留, 按 ADR-0012 模式拆分)
 *
 * 职责: scrcpy 投屏参数加载/保存/启动、蓝牙端口管理、测试用例与数据路径 MVC wrapper。
 *
 * 跨域契约: DeviceModel 单向构造注入 (ControlPanel → Device, 不成环),
 * startScreenControl 的 selectedDevice 经 device.get('selectedDevice') 取。
 *
 * 事件面 (门面显式转发): scrcpy-params-loaded / scrcpy-params-saved /
 * serial-ports-loaded / screen-control-result / screen-control-error / error
 */
export class ControlPanelModel extends BaseModel {
  _api;
  #device;

  /**
   * @param {Object} api - ApiBridge 绑定对象 (与门面/兄弟子模型共享同一实例)
   * @param {Object} [opts]
   * @param {Object} [opts.device] - DeviceModel 实例 (selectedDevice 能力)
   */
  constructor(api, { device } = {}) {
    super({
      scrcpyParams: {}, // scrcpy 投屏参数（从配置加载）
    });
    this._api = api;
    this.#device = device;
  }

  get scrcpyParams() {
    return this.get('scrcpyParams');
  }

  // ─── 蓝牙端口管理 ─────────────────────────────────────────────

  async showPortManagementModal() {
    try {
      const result = await this._api.getSerialPorts();
      this.emit('serial-ports-loaded', result);
      return result;
    } catch (error) {
      this.emitError('showPortManagementModal', error);
      return null;
    }
  }

  // ─── 投屏控制参数 ─────────────────────────────────────────────

  async loadControlParams() {
    try {
      const config = await this._api.getConfig();
      const scrcpyParams = config.SCRCPY_PARAMS || {};
      this.set('scrcpyParams', scrcpyParams, 'scrcpy-params-loaded');
      return scrcpyParams;
    } catch (error) {
      this.emitError('loadControlParams', error);
      return {};
    }
  }

  async saveControlParams(params) {
    try {
      const result = await this._api.saveConfig({ SCRCPY_PARAMS: params });
      // invokeWithCheck 已保证失败时抛错，直接更新状态
      this.set('scrcpyParams', params, 'scrcpy-params-saved');
      return result;
    } catch (error) {
      this.emitError('saveControlParams', error);
      return { success: false, error: error.message };
    }
  }

  // ─── MVC wrappers (避免 controller 直调 window.electronAPI) ──

  /**
   * 获取测试用例数据
   */
  async getTestCase(fileName) {
    try {
      return await this._api.testCaseGet(fileName);
    } catch (error) {
      this.emitError('getTestCase', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 保存并生成测试用例
   */
  async saveAndGenerateTestCase(caseData, outputDir) {
    try {
      return await this._api.testCaseSaveAndGenerate(caseData, outputDir);
    } catch (error) {
      this.emitError('saveAndGenerateTestCase', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 获取数据路径
   */
  async getDataPath() {
    try {
      return await this._api.getDataPath();
    } catch (error) {
      this.emitError('getDataPath', error);
      return { currentPath: '', defaultPath: '' };
    }
  }

  // ─── 投屏控制 ─────────────────────────────────────────────────

  async startScreenControl() {
    if (!this.#device.get('selectedDevice')) {
      this.emit('screen-control-error', {
        message: window.i18n.t('fileManager.selectDeviceFirst'),
      });
      return null;
    }

    try {
      // 获取最新配置
      const config = await this._api.getConfig();
      const scrcpyParams = config.SCRCPY_PARAMS || {};
      const result = await this._api.startScrcpy(this.#device.get('selectedDevice'), scrcpyParams);
      this.emit('screen-control-result', result);
      return result;
    } catch (error) {
      this.emitError('startScreenControl', error);
      return { success: false, error: error.message };
    }
  }
}

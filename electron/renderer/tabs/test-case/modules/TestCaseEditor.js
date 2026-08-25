/**
 * TestCaseEditor - 测试用例编辑器状态机深模块 (R10 renderer mixin → deep module)
 *
 * 领域边界：编辑器生命周期 (isEditing/dirty) + 已加载设备配置 + 文件→编辑器转换 +
 *           用例 CRUD (saveCase/deleteCase/loadCaseData) + 表单数据收集
 * 不负责：文件浏览 (FileBrowser)、引用数据 (OptionPanel)、步骤数组 (StepEditor)
 *
 * 取自原 modelFileMixin (selectFile/deselectFile/showEditor/cancelEdit) +
 *           modelCaseMixin (saveCase/deleteCase/loadCaseData) +
 *           modelFormMixin (markDirty/resetEditor/collectFormData/destroy)。
 * Model 持有实例并委托方法，事件经 Model 转发给 Controller (保持现有 Controller 监听不变)。
 *
 * 依赖注入：构造时注入 api + fileBrowser + optionPanel + stepEditor 实例，
 *           TestCaseEditor 作为编排者协调四个深模块。
 *
 * R10 阶段 3 接口收紧：_api/_fileBrowser/_optionPanel/_stepEditor/_state/_set 全部转为 #private。
 *
 * 事件：
 *   - editing-changed(isEditing)         编辑模式变更
 *   - dirty-changed(dirty)               脏标记变更
 *   - loaded-device-config-changed(cfg)  已加载设备配置变更
 *   - loaded-ble-device-changed(dev)     已加载蓝牙设备变更
 *   - show-editor(payload)               请求显示编辑器
 *   - cancel-edit()                      请求取消编辑
 *   - case-loaded(caseData)              用例加载完成
 *   - case-saved(result)                 用例保存完成
 *   - case-deleted({fileName, pyFilePath}) 用例删除完成
 *   - error({source, message, error})    操作失败
 */
import { EventEmitter } from '../../../core/EventEmitter.js';

export class TestCaseEditor extends EventEmitter {
  /** @type {Object} ApiBridge 绑定后的 API 对象 */
  #api;
  /** @type {Object} FileBrowser 实例 */
  #fileBrowser;
  /** @type {Object} OptionPanel 实例 */
  #optionPanel;
  /** @type {Object} StepEditor 实例 */
  #stepEditor;
  /** @type {Object} 内部状态容器 */
  #state = {
    isEditing: false,
    hasUnsavedChanges: false,
    loadedDeviceConfig: null,
    loadedBleDevice: null,
  };

  /**
   * @param {Object} opts
   * @param {Object} opts.api - ApiBridge 绑定后的 API 对象
   * @param {Object} opts.fileBrowser - FileBrowser 实例
   * @param {Object} opts.optionPanel - OptionPanel 实例
   * @param {Object} opts.stepEditor - StepEditor 实例
   */
  constructor({ api, fileBrowser, optionPanel, stepEditor }) {
    super();
    this.#api = api;
    this.#fileBrowser = fileBrowser;
    this.#optionPanel = optionPanel;
    this.#stepEditor = stepEditor;
  }

  // ── State Getters ──────────────────────────────────────────────

  /** @returns {boolean} 是否处于编辑模式 */
  get isEditing() { return this.#state.isEditing; }
  /** @returns {boolean} 是否有未保存更改 */
  get hasUnsavedChanges() { return this.#state.hasUnsavedChanges; }
  /** @returns {Object|null} 已加载的设备配置 */
  get loadedDeviceConfig() { return this.#state.loadedDeviceConfig; }
  /** @returns {Object|null} 已加载的蓝牙设备 */
  get loadedBleDevice() { return this.#state.loadedBleDevice; }

  /**
   * 通用状态获取（供 Model.get 委托）
   * @param {string} key - 状态键名
   * @returns {*} 状态值，键不存在返回 undefined
   */
  get(key) { return this.#state[key]; }

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

  // ── Dirty / Reset ──────────────────────────────────────────────

  /**
   * 标记为有未保存更改
   */
  markDirty() {
    this.#set('hasUnsavedChanges', true, 'dirty-changed');
  }

  /**
   * 清除脏标记 (保存完成 / 加载文件 / 取消编辑时调用)
   */
  clearDirty() {
    this.#set('hasUnsavedChanges', false, 'dirty-changed');
  }

  /**
   * 重置所有编辑器状态到默认值
   * 编排 StepEditor.reset + OptionPanel.selectApp/Platform/Markers + 清除已加载设备配置
   */
  resetEditor() {
    this.#stepEditor.reset();
    this.#optionPanel.selectApp(null);
    this.#optionPanel.selectPlatform('android');
    this.#optionPanel.replaceSelectedMarkers([]);
    this.#set('loadedDeviceConfig', null, 'loaded-device-config-changed');
    this.#set('loadedBleDevice', null, 'loaded-ble-device-changed');
  }

  // ── File → Editor Lifecycle ────────────────────────────────────

  /**
   * 选中文件：委托 FileBrowser 设置 selectedFile，重置脏标记，进入编辑器
   * @param {Object} file - 文件对象 { name, path, ... }
   */
  selectFile(file) {
    this.#fileBrowser.selectFile(file);
    this.clearDirty();
    // 选中文件后自动进入编辑模式 (异步)
    this.showEditor(file);
  }

  /**
   * 取消选中文件：委托 FileBrowser 清空 selectedFile，重置编辑器关联状态
   */
  deselectFile() {
    this.#fileBrowser.deselectFile();
    this.#set('loadedDeviceConfig', null, 'loaded-device-config-changed');
    this.#set('loadedBleDevice', null, 'loaded-ble-device-changed');
    this.clearDirty();
  }

  /**
   * 进入编辑模式，可选加载已有用例数据
   * @param {Object|null} file - 文件对象，null 表示新建
   */
  async showEditor(file = null) {
    if (file) {
      const fileName = typeof file.name === 'string'
        ? file.name.replace(/\.[^/.]+$/, '')
        : file.name;
      try {
        const jsonCheck = await this.#api.checkJsonExists(fileName);
        if (!jsonCheck.exists) {
          this.#set('isEditing', false, 'editing-changed');
          this.resetEditor();
          this.emit('show-editor', { file, isNew: false, jsonMissing: true, fileName });
          return;
        }
        this.#set('isEditing', true, 'editing-changed');
        this.emit('show-editor', { file, isNew: false, jsonMissing: false, fileName });
        await this.loadCaseData(fileName);
      } catch (error) {
        this.emit('error', { source: 'showEditor', error });
      }
    } else {
      // 新建模式
      this.#set('isEditing', false, 'editing-changed');
      this.resetEditor();
      this.emit('show-editor', { file: null, isNew: true, jsonMissing: false, fileName: '' });
    }
  }

  /**
   * 取消编辑：委托 FileBrowser 清空 selectedFile，重置编辑状态
   */
  cancelEdit() {
    this.resetEditor();
    this.#fileBrowser.deselectFile();
    this.#set('isEditing', false, 'editing-changed');
    this.clearDirty();
    this.#set('loadedDeviceConfig', null, 'loaded-device-config-changed');
    this.#set('loadedBleDevice', null, 'loaded-ble-device-changed');
    this.emit('cancel-edit');
  }

  // ── Case CRUD ──────────────────────────────────────────────────

  /**
   * 保存测试用例（验证 + API 调用）
   * @param {Object} caseData - 用例数据
   */
  async saveCase(caseData) {
    if (!caseData.fileName) {
      this.emit('error', { source: 'saveCase', message: 'fileNameRequired' });
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(caseData.fileName)) {
      this.emit('error', { source: 'saveCase', message: 'fileNameInvalidChars' });
      return;
    }
    if (!/^test_/.test(caseData.fileName)) {
      this.emit('error', { source: 'saveCase', message: 'fileNameMustStartTestPrefix' });
      return;
    }
    if (!this.#fileBrowser.selectedDirectory) {
      this.emit('error', { source: 'saveCase', message: 'selectCaseFirst' });
      return;
    }
    if (!this.#optionPanel.selectedApp) {
      this.emit('error', { source: 'saveCase', message: 'selectAppFirst' });
      return;
    }

    try {
      const result = await this.#api.saveAndGenerate(
        caseData,
        this.#fileBrowser.selectedDirectory,
      );
      // invokeWithCheck 已保证失败时抛错，走到这里即成功
      this.clearDirty();
      this.emit('case-saved', result);
      await this.#fileBrowser.scanTestFiles(this.#fileBrowser.selectedDirectory);
    } catch (error) {
      this.emit('error', { source: 'saveCase', message: 'saveFailed', error });
    }
  }

  /**
   * 删除测试用例
   * @param {string} fileName - 文件名（不含扩展名）
   * @param {string} pyFilePath - .py 文件完整路径
   */
  async deleteCase(fileName, pyFilePath) {
    try {
      const result = await this.#api.deleteCase({ fileName, pyFilePath });
      // invokeWithCheck 已保证失败时抛错，走到这里即成功
      void result; // 删除结果未使用
      this.emit('case-deleted', { fileName, pyFilePath });
      await this.#fileBrowser.scanTestFiles(this.#fileBrowser.selectedDirectory);
    } catch (error) {
      this.emit('error', { source: 'deleteCase', message: 'deleteFailed', error });
    }
  }

  /**
   * 从 API 加载用例数据
   * 编排 OptionPanel (markers/app) + StepEditor (steps) + TestCaseEditor (loadedConfigs)
   * @param {string} fileName - 文件名（不含扩展名）
   */
  async loadCaseData(fileName) {
    try {
      const result = await this.#api.getCase(fileName);
      // invokeWithCheck 已保证失败时抛错，此处只需校验业务字段 data
      const caseData = result.data;

      // 恢复 markers (OptionPanel 拥有)
      const savedMarkers = caseData.allureConfig?.markers || [];
      this.#optionPanel.replaceSelectedMarkers(savedMarkers);

      // 恢复 targetApp (OptionPanel 拥有)
      if (caseData.targetApp?.id) {
        this.#optionPanel.selectApp(caseData.targetApp);
      }

      // 恢复 steps (StepEditor 拥有)
      this.#stepEditor.setSteps(caseData.steps || []);

      // 恢复设备配置 (TestCaseEditor 拥有)
      this.#set('loadedDeviceConfig', caseData.deviceConfig || null, 'loaded-device-config-changed');
      this.#set('loadedBleDevice', caseData.bleDevice || null, 'loaded-ble-device-changed');

      this.emit('case-loaded', caseData);
    } catch (error) {
      this.emit('error', { source: 'loadCaseData', error });
    }
  }

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

    // 从 OptionPanel 收集 markers
    const markers = [...this.#optionPanel.selectedMarkers];

    // 从步骤中提取蓝牙设备信息
    let bleDevice = null;
    for (const step of stepsFromDOM) {
      if (step.type === 'ble') {
        const config = step.config || {};
        const deviceConfig = config.deviceConfig || {};
        if (deviceConfig.deviceId) {
          const device = this.#optionPanel.bleDevices.find(d => d.deviceId === deviceConfig.deviceId);
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
    if (bleDevice && this.#state.loadedBleDevice) {
      if (this.#state.loadedBleDevice.port) {
        bleDevice.port = this.#state.loadedBleDevice.port;
      }
    }

    // 如果步骤中没有蓝牙设备信息，但之前加载了蓝牙设备配置，保留它
    if (!bleDevice && this.#state.loadedBleDevice) {
      bleDevice = this.#state.loadedBleDevice;
    }

    const deviceConfig = this.#state.loadedDeviceConfig || null;

    return {
      fileName,
      name: caseName || fileName,
      description,
      platform: this.#optionPanel.selectedPlatform || 'android',
      targetApp: this.#optionPanel.selectedApp,
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
  }

  // ── Lifecycle ──────────────────────────────────────────────────

  /**
   * 销毁：移除所有监听器
   */
  destroy() {
    this.removeAllListeners();
  }
}

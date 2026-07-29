import { EventEmitter } from '../../core/EventEmitter.js';
import { ApiBridge } from '../../core/ApiBridge.js';
import { modelDirectoryMixin } from './mixins/modelDirectoryMixin.js';
import { modelFileMixin } from './mixins/modelFileMixin.js';
import { modelCaseMixin } from './mixins/modelCaseMixin.js';
import { modelStepMixin } from './mixins/modelStepMixin.js';
import { modelFormMixin } from './mixins/modelFormMixin.js';

/**
 * TestCaseModel - 测试用例 Tab 的 Model 层
 * 管理所有 tc* 状态和 API 调用，通过事件通知 Controller
 *
 * 方法按领域拆分至 ./mixins/model<Domain>Mixin.js，通过
 * Object.assign 挂载到本类 prototype（见文件末尾）。
 */
export class TestCaseModel extends EventEmitter {
  #api = ApiBridge.bind({
    selectDirectory: 'selectDirectory',
    scanTestFiles: 'scanTestFiles',
    batchCheckJsonExists: 'testCase.batchCheckJsonExists',
    checkJsonExists: 'testCase.checkJsonExists',
    getCase: 'testCase.get',
    saveAndGenerate: 'testCase.saveAndGenerate',
    deleteCase: 'testCase.delete',
    getPytestMarkers: 'getPytestMarkers',
    getApps: 'pagePackage.getApps',
    getBleDevices: 'bleDeviceDiscovery.getDevices',
  });

  #state = {
    selectedDirectory: null,
    selectedFile: null,
    isEditing: false,
    hasUnsavedChanges: false,
    testFiles: [],
    steps: [],
    draggedStep: null,
    selectedApp: null,
    apps: [],
    selectedPlatform: 'android',
    bleDevices: [],
    markers: [],
    selectedMarkers: [],
    loadedDeviceConfig: null,
    loadedBleDevice: null,
    searchDebounceTimer: null,
    jsonExistsMap: {},
    searchQuery: '',
  };

  // ── State Getters ──────────────────────────────────────────────

  get selectedDirectory() { return this.#state.selectedDirectory; }
  get selectedFile() { return this.#state.selectedFile; }
  get isEditing() { return this.#state.isEditing; }
  get hasUnsavedChanges() { return this.#state.hasUnsavedChanges; }
  get testFiles() { return this.#state.testFiles; }
  get steps() { return this.#state.steps; }
  get draggedStep() { return this.#state.draggedStep; }
  get selectedApp() { return this.#state.selectedApp; }
  get apps() { return this.#state.apps; }
  get selectedPlatform() { return this.#state.selectedPlatform; }
  get bleDevices() { return this.#state.bleDevices; }
  get markers() { return this.#state.markers; }
  get selectedMarkers() { return this.#state.selectedMarkers; }
  get loadedDeviceConfig() { return this.#state.loadedDeviceConfig; }
  get loadedBleDevice() { return this.#state.loadedBleDevice; }
  get searchDebounceTimer() { return this.#state.searchDebounceTimer; }
  get jsonExistsMap() { return this.#state.jsonExistsMap; }
  get searchQuery() { return this.#state.searchQuery; }

  /**
   * 通用状态获取（供 Controller 使用）
   * @param {string} key - 状态键名
   * @returns {*} 状态值
   */
  get(key) { return this.#state[key]; }

  /**
   * 内部状态对象访问器（供 mixin 读写状态字段使用）
   * @returns {Object} 内部状态对象
   */
  get _state() { return this.#state; }

  /**
   * API 桥接访问器（供 mixin 调用绑定的 IPC 方法使用）
   * @returns {Object} 绑定后的 API 对象
   */
  get _api() { return this.#api; }

  // ── Private State Helper ───────────────────────────────────────

  /**
   * 更新状态并触发对应事件
   * @param {string} key - 状态键名
   * @param {*} value - 新值
   * @param {string} [event] - 事件名，默认 `${key}-changed`
   */
  _set(key, value, event) {
    const old = this.#state[key];
    if (old === value) return;
    this.#state[key] = value;
    this.emit(event || `${key}-changed`, value, old);
  }
}

Object.assign(TestCaseModel.prototype,
  modelDirectoryMixin,
  modelFileMixin,
  modelCaseMixin,
  modelStepMixin,
  modelFormMixin,
);

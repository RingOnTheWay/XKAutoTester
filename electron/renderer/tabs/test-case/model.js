import { EventEmitter } from '../../core/EventEmitter.js';
import { ApiBridge } from '../../core/ApiBridge.js';

/**
 * TestCaseModel - 测试用例 Tab 的 Model 层
 * 管理所有 tc* 状态和 API 调用，通过事件通知 Controller
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

  /** @type {import('./view.js').TestCaseView|null} */
  #view = null;

  /**
   * 设置 View 引用（用于 collectFormData 读取 DOM）
   * @param {import('./view.js').TestCaseView} view
   */
  setView(view) {
    this.#view = view;
  }

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

  // ── Private State Helper ───────────────────────────────────────

  /**
   * 更新状态并触发对应事件
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

  // ── Initialization ─────────────────────────────────────────────

  /**
   * 加载初始数据（apps, bleDevices, markers）
   */
  async load() {
    await Promise.all([
      this.loadApps(),
      this.loadBleDevices(),
      this.loadMarkers(),
    ]);
  }

  // ── Directory & Files ──────────────────────────────────────────

  /**
   * 打开目录选择器，设置 selectedDirectory 并扫描文件
   */
  async selectDirectory() {
    try {
      const result = await this.#api.selectDirectory();
      if (result && !result.canceled && result.filePaths.length > 0) {
        this.#set('selectedDirectory', result.filePaths[0], 'directory-changed');
        await this.scanTestFiles(result.filePaths[0]);
      }
    } catch (error) {
      this.emit('error', { source: 'selectDirectory', error });
    }
  }

  /**
   * 扫描目录中的测试文件
   * @param {string} directory - 目录路径
   */
  async scanTestFiles(directory) {
    if (!directory) return;
    try {
      const files = await this.#api.scanTestFiles(directory);
      this.#set('testFiles', files || [], 'files-changed');
      this.#set('searchQuery', '');
      if (this.#state.searchDebounceTimer) {
        clearTimeout(this.#state.searchDebounceTimer);
        this.#set('searchDebounceTimer', null);
      }
      await this.batchCheckJsonExists(
        (files || []).map(f => f.name.replace(/\.[^/.]+$/, ''))
      );
    } catch (error) {
      this.emit('error', { source: 'scanTestFiles', error });
    }
  }

  /**
   * 批量检查 .py 文件是否有对应的 .json
   * @param {string[]} fileNames - 不含扩展名的文件名列表
   */
  async batchCheckJsonExists(fileNames) {
    if (!fileNames || fileNames.length === 0) {
      this.#set('jsonExistsMap', {}, 'json-exists-changed');
      this.emit('files-changed'); // 重新渲染文件列表
      return;
    }
    try {
      const result = await this.#api.batchCheckJsonExists(fileNames);
      if (result.success && result.data) {
        this.#set('jsonExistsMap', result.data, 'json-exists-changed');
      } else {
        this.#set('jsonExistsMap', {}, 'json-exists-changed');
      }
      this.emit('files-changed'); // jsonExistsMap 更新后重新渲染文件列表
    } catch (error) {
      this.#set('jsonExistsMap', {}, 'json-exists-changed');
      this.emit('files-changed');
      this.emit('error', { source: 'batchCheckJsonExists', error });
    }
  }

  // ── File Selection ─────────────────────────────────────────────

  /**
   * 选中文件，设置 selectedFile
   * @param {Object} file - 文件对象 { name, path, ... }
   */
  selectFile(file) {
    this.#set('selectedFile', file, 'selected-file-changed');
    this.#set('hasUnsavedChanges', false, 'dirty-changed');
    // 选中文件后自动进入编辑模式
    this.showEditor(file);
  }

  /**
   * 取消选中文件，重置编辑器状态
   */
  deselectFile() {
    this.#set('selectedFile', null, 'selected-file-changed');
    this.#set('loadedDeviceConfig', null);
    this.#set('loadedBleDevice', null);
    this.#set('hasUnsavedChanges', false, 'dirty-changed');
  }

  // ── Editor State ───────────────────────────────────────────────

  /**
   * 进入编辑模式，可选加载已有用例数据
   * @param {Object|null} file - 文件对象，null 表示新建
   */
  async showEditor(file = null) {
    if (file) {
      const fileName = typeof file.name === 'string' ? file.name.replace(/\.[^/.]+$/, '') : file.name;
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
   * 取消编辑，重置编辑状态
   */
  cancelEdit() {
    this.resetEditor();
    this.#set('selectedFile', null, 'selected-file-changed');
    this.#set('isEditing', false, 'editing-changed');
    this.#set('hasUnsavedChanges', false, 'dirty-changed');
    this.#set('loadedDeviceConfig', null);
    this.#set('loadedBleDevice', null);
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
    if (!this.#state.selectedDirectory) {
      this.emit('error', { source: 'saveCase', message: 'selectCaseFirst' });
      return;
    }
    if (!this.#state.selectedApp) {
      this.emit('error', { source: 'saveCase', message: 'selectAppFirst' });
      return;
    }

    try {
      const result = await this.#api.saveAndGenerate(caseData, this.#state.selectedDirectory);
      if (result && result.success) {
        this.#set('hasUnsavedChanges', false, 'dirty-changed');
        this.emit('case-saved', result);
        await this.scanTestFiles(this.#state.selectedDirectory);
      } else {
        this.emit('error', { source: 'saveCase', message: result?.error || 'saveFailed' });
      }
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
      if (result && result.success) {
        this.emit('case-deleted', { fileName, pyFilePath });
        await this.scanTestFiles(this.#state.selectedDirectory);
      } else {
        this.emit('error', { source: 'deleteCase', message: result?.error || 'deleteFailed' });
      }
    } catch (error) {
      this.emit('error', { source: 'deleteCase', message: 'deleteFailed', error });
    }
  }

  /**
   * 从 API 加载用例数据
   * @param {string} fileName - 文件名（不含扩展名）
   */
  async loadCaseData(fileName) {
    try {
      const result = await this.#api.getCase(fileName);
      if (!result.success) {
        this.emit('error', { source: 'loadCaseData', message: result.error });
        return;
      }

      const caseData = result.data;

      // 恢复 markers
      const savedMarkers = caseData.allureConfig?.markers || [];
      this.#state.selectedMarkers = savedMarkers;
      this.emit('markers-changed', savedMarkers);

      // 恢复 targetApp
      if (caseData.targetApp?.id) {
        this.#state.selectedApp = caseData.targetApp;
        this.emit('app-changed', caseData.targetApp);
      }

      // 恢复 steps
      this.#state.steps = caseData.steps || [];
      this.emit('steps-changed', this.#state.steps);

      // 恢复设备配置
      this.#set('loadedDeviceConfig', caseData.deviceConfig || null);
      this.#set('loadedBleDevice', caseData.bleDevice || null);

      this.emit('case-loaded', caseData);
    } catch (error) {
      this.emit('error', { source: 'loadCaseData', error });
    }
  }

  // ── Reference Data Loaders ─────────────────────────────────────

  /**
   * 加载应用列表
   */
  async loadApps() {
    try {
      const result = await this.#api.getApps();
      if (result.success) {
        this.#set('apps', result.data || [], 'apps-changed');
      }
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
      if (result.success) {
        this.#set('bleDevices', result.data || [], 'ble-devices-changed');
      }
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

  // ── Step Operations ────────────────────────────────────────────

  /**
   * 添加新步骤
   * @returns {Object} 新创建的步骤
   */
  addStep() {
    // 先从 DOM 同步现有步骤数据，避免重新渲染时丢失用户编辑
    this.syncStepsFromDOM();

    const stepId = `step_${Date.now()}`;
    const newStep = {
      id: stepId,
      order: this.#state.steps.length + 1,
      name: `步骤 ${this.#state.steps.length + 1}`,
      type: 'element',
      config: {
        pageId: null,
        pageName: null,
        elementId: null,
        elementName: null,
        locator: null,
        locatorValue: null,
        operation: 'click',
        operationValue: {},
      },
    };
    this.#state.steps.push(newStep);
    this.#set('hasUnsavedChanges', true, 'dirty-changed');
    this.emit('steps-changed', this.#state.steps);
    return newStep;
  }

  /**
   * 删除步骤
   * @param {string} stepId - 步骤 ID
   */
  deleteStep(stepId) {
    this.syncStepsFromDOM();
    this.#state.steps = this.#state.steps.filter(s => s.id !== stepId);
    this.updateStepOrders();
    this.#set('hasUnsavedChanges', true, 'dirty-changed');
    this.emit('steps-changed', this.#state.steps);
  }

  /**
   * 深拷贝步骤并追加到末尾
   * @param {string} stepId - 源步骤 ID
   * @returns {Object} 新步骤
   */
  copyStep(stepId) {
    this.syncStepsFromDOM();
    const original = this.#state.steps.find(s => s.id === stepId);
    if (!original) return null;

    const newStepId = `step_${Date.now()}`;
    const newStep = {
      ...JSON.parse(JSON.stringify(original)),
      id: newStepId,
      name: `${original.name} (副本)`,
      order: this.#state.steps.length + 1,
    };

    this.#state.steps.push(newStep);
    this.#set('hasUnsavedChanges', true, 'dirty-changed');
    this.emit('steps-changed', this.#state.steps);
    return newStep;
  }

  /**
   * 上下移动步骤
   * @param {string} stepId - 步骤 ID
   * @param {'up'|'down'} direction - 移动方向
   */
  moveStep(stepId, direction) {
    this.syncStepsFromDOM();
    const idx = this.#state.steps.findIndex(s => s.id === stepId);
    if (idx === -1) return;
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === this.#state.steps.length - 1) return;

    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    const temp = this.#state.steps[idx];
    this.#state.steps[idx] = this.#state.steps[targetIdx];
    this.#state.steps[targetIdx] = temp;

    this.updateStepOrders();
    this.#set('hasUnsavedChanges', true, 'dirty-changed');
    this.emit('steps-changed', this.#state.steps);
  }

  /**
   * 根据 steps 数组索引同步 step.order
   */
  updateStepOrders() {
    this.#state.steps.forEach((step, index) => {
      step.order = index + 1;
    });
  }

  // ── Step Mutation Helpers ──────────────────────────────────────

  /**
   * 设置搜索查询并触发文件列表重新渲染
   * @param {string} query - 搜索关键词
   */
  setSearchQuery(query) {
    this.#set('searchQuery', query, 'files-changed');
  }

  /**
   * 更新步骤中下拉选择器的值
   * @param {string} selectId - 选择器 ID
   * @param {string} value - 新值
   * @param {string} stepId - 步骤 ID
   * @param {number} [index] - 多元素索引
   */
  updateStepSelect(selectId, value, stepId, index) {
    const step = this.#state.steps.find(s => s.id === stepId);
    if (!step) return;

    // 根据 selectId 前缀更新步骤配置
    const config = step.config || {};
    if (selectId.startsWith('tc-page-select')) {
      config.pageId = value;
    } else if (selectId.startsWith('tc-element-select')) {
      config.elementId = value;
    } else if (selectId.startsWith('tc-operation-select')) {
      config.operation = value;
    } else if (selectId.startsWith('tc-input-type-select')) {
      config.operationValue = config.operationValue || {};
      config.operationValue.inputType = value;
    } else if (selectId.startsWith('tc-ble-method-select')) {
      config.deviceConfig = config.deviceConfig || {};
      config.deviceConfig.methodName = value;
      delete config.deviceConfig.params;
    } else if (selectId.startsWith('tc-system-operation-type')) {
      config.systemConfig = config.systemConfig || {};
      config.systemConfig.operationType = value;
    } else if (selectId.startsWith('tc-page-operation-type')) {
      config.operationType = value;
    } else if (selectId.startsWith('tc-target-value-type')) {
      config.compareConfig = config.compareConfig || {};
      config.compareConfig.targetValueType = value;
      if (value === 'custom') {
        config.compareConfig.targetValue = '';
        delete config.compareConfig.bleStepId;
      } else if (value === 'ble') {
        delete config.compareConfig.targetValue;
        config.compareConfig.bleStepId = '';
      }
    } else if (selectId.startsWith('tc-search-type')) {
      config.searchConfig = config.searchConfig || {};
      config.searchConfig.searchType = value;
    } else if (selectId.startsWith('tc-faker-locale')) {
      config.operationValue = config.operationValue || {};
      config.operationValue.fakerConfig = config.operationValue.fakerConfig || {};
      config.operationValue.fakerConfig.locale = value;
    } else if (selectId.startsWith('tc-faker-provider')) {
      config.operationValue = config.operationValue || {};
      config.operationValue.fakerConfig = config.operationValue.fakerConfig || {};
      config.operationValue.fakerConfig.provider = value;
    } else if (selectId.startsWith('tc-faker-method')) {
      config.operationValue = config.operationValue || {};
      config.operationValue.fakerConfig = config.operationValue.fakerConfig || {};
      config.operationValue.fakerConfig.method = value;
    } else if (selectId.startsWith('tc-faker-category')) {
      config.operationValue = config.operationValue || {};
      config.operationValue.fakerConfig = config.operationValue.fakerConfig || {};
      config.operationValue.fakerConfig.category = value;
    } else if (selectId.startsWith('tc-nav-key-select')) {
      config.systemConfig = config.systemConfig || {};
      config.systemConfig.navKey = value;
    } else if (selectId.startsWith('tc-random-precision')) {
      config.operationValue = config.operationValue || {};
      config.operationValue.randomConfig = config.operationValue.randomConfig || {};
      config.operationValue.randomConfig.precision = parseInt(value);
    } else if (selectId.startsWith('tc-multi-element-select') && index !== undefined) {
      if (!config.selectedElements) config.selectedElements = [];
      if (!config.selectedElements[index]) config.selectedElements[index] = {};
      config.selectedElements[index].elementId = value;
    } else if (selectId.startsWith('tc-multi-operation-select') && index !== undefined) {
      if (!config.selectedElements) config.selectedElements = [];
      if (!config.selectedElements[index]) config.selectedElements[index] = {};
      config.selectedElements[index].operation = value;
    } else if (selectId.startsWith('tc-multi-input-type-select') && index !== undefined) {
      if (!config.selectedElements) config.selectedElements = [];
      if (!config.selectedElements[index]) config.selectedElements[index] = {};
      config.selectedElements[index].inputType = value;
    } else if (selectId.startsWith('tc-multi-faker-locale') && index !== undefined) {
      if (!config.selectedElements) config.selectedElements = [];
      if (!config.selectedElements[index]) config.selectedElements[index] = {};
      config.selectedElements[index].fakerLocale = value;
    } else if (selectId.startsWith('tc-multi-faker-provider') && index !== undefined) {
      if (!config.selectedElements) config.selectedElements = [];
      if (!config.selectedElements[index]) config.selectedElements[index] = {};
      config.selectedElements[index].fakerProvider = value;
    } else if (selectId.startsWith('tc-compare-element-page')) {
      config.compareConfig = config.compareConfig || {};
      config.compareConfig.pageId = value;
      config.compareConfig.elementId = '';
    } else if (selectId.startsWith('tc-compare-element-select')) {
      config.compareConfig = config.compareConfig || {};
      config.compareConfig.elementId = value;
      // 更新 element locator
      const app = this.#state.selectedApp;
      if (app && config.compareConfig.pageId) {
        const page = app.pages?.find(p => p.id === config.compareConfig.pageId);
        const element = page?.elements?.find(el => el.id === value);
        if (element) {
          config.compareConfig.elementName = element.name;
          config.compareConfig.locator = element.locator;
          config.compareConfig.locatorValue = element.value;
        }
      }
    } else if (selectId.startsWith('tc-search-element-page')) {
      config.searchConfig = config.searchConfig || {};
      config.searchConfig.pageId = value;
      config.searchConfig.elementId = '';
      config.searchConfig.elementName = '';
    } else if (selectId.startsWith('tc-search-element-select')) {
      config.searchConfig = config.searchConfig || {};
      config.searchConfig.elementId = value;
      const app = this.#state.selectedApp;
      if (app && config.searchConfig?.pageId) {
        const page = app.pages?.find(p => p.id === config.searchConfig.pageId);
        const element = page?.elements?.find(el => el.id === value);
        if (element) {
          config.searchConfig.elementName = element.name;
          config.searchConfig.locator = element.locator;
          config.searchConfig.locatorValue = element.value;
        }
      }
    } else if (selectId.startsWith('tc-ble-step-select')) {
      config.compareConfig = config.compareConfig || {};
      config.compareConfig.bleStepId = value;
    }

    step.config = config;
    this.#set('hasUnsavedChanges', true, 'dirty-changed');

    // 级联更新：页面变更时清空元素和操作
    if (selectId.startsWith('tc-page-select')) {
      config.elementId = '';
      config.elementName = null;
      config.locator = null;
      config.locatorValue = null;
      config.operation = 'click';
      config.operationValue = {};
      const app = this.#state.selectedApp;
      if (app) {
        const page = app.pages?.find(p => p.id === value);
        config.pageName = page?.name || '';
      }
    }

    // 元素变更时更新 locator
    if (selectId.startsWith('tc-element-select')) {
      const app = this.#state.selectedApp;
      if (app && config.pageId) {
        const page = app.pages?.find(p => p.id === config.pageId);
        const element = page?.elements?.find(el => el.id === value);
        if (element) {
          config.elementName = element.name;
          config.locator = element.locator;
          config.locatorValue = element.value;
          if (element.locator === 'click' && config.operation === 'sendText') {
            config.operation = 'click';
            config.operationValue = {};
          }
        }
      }
    }

    // 操作变更时清空操作值
    if (selectId.startsWith('tc-operation-select')) {
      config.operationValue = {};
    }

    this.emit('step-updated', { stepId, selectId, value, index });
  }

  /**
   * 更改步骤类型
   * @param {string} stepId - 步骤 ID
   * @param {string} type - 新类型
   */
  changeStepType(stepId, type) {
    const step = this.#state.steps.find(s => s.id === stepId);
    if (!step) return;

    step.type = type;
    // 重置类型特定配置
    step.config = { type };
    this.#set('hasUnsavedChanges', true, 'dirty-changed');
    this.emit('steps-changed', this.#state.steps);
  }

  /**
   * 更新步骤名称
   * @param {string} stepId - 步骤 ID
   * @param {string} name - 新名称
   */
  updateStepName(stepId, name) {
    const step = this.#state.steps.find(s => s.id === stepId);
    if (!step) return;

    step.name = name;
    this.#set('hasUnsavedChanges', true, 'dirty-changed');
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

  // ── Dirty / Reset ──────────────────────────────────────────────

  /**
   * 标记为有未保存更改
   */
  markDirty() {
    this.#set('hasUnsavedChanges', true, 'dirty-changed');
  }

  /**
   * 重置所有编辑器状态到默认值
   */
  resetEditor() {
    this.#set('steps', [], 'steps-changed');
    this.#set('selectedApp', null, 'app-changed');
    this.#set('selectedPlatform', 'android', 'platform-changed');
    this.#set('selectedMarkers', [], 'markers-changed');
    this.#set('loadedDeviceConfig', null);
    this.#set('loadedBleDevice', null);
  }

  // ── Form Data Collection ───────────────────────────────────────

  /**
   * 收集所有表单数据为用例对象
   * 通过 view 引用读取 DOM 值
   * @returns {Object} 用例数据
   */
  collectFormData() {
    const root = this.#view?.root ?? document;

    const fileName = root.getElementById('tc-file-name')?.value?.trim() || '';
    const caseName = root.getElementById('tc-case-name')?.value?.trim() || '';
    const description = root.getElementById('tc-description')?.value?.trim() || '';
    const epic = root.getElementById('tc-allure-epic')?.value?.trim() || '';
    const feature = root.getElementById('tc-allure-feature')?.value?.trim() || '';
    const story = root.getElementById('tc-allure-story')?.value?.trim() || '';

    const markers = [...this.#state.selectedMarkers];

    // 从步骤中提取蓝牙设备信息
    let bleDevice = null;
    const sortedSteps = [...this.#state.steps].sort((a, b) => a.order - b.order);

    // 从 DOM 重新读取步骤数据（因为步骤卡片的输入变更可能未完全同步到 model）
    const stepsFromDOM = this.#collectStepsFromDOM(root, sortedSteps);

    for (const step of stepsFromDOM) {
      if (step.type === 'ble') {
        const config = step.config || {};
        const deviceConfig = config.deviceConfig || {};
        if (deviceConfig.deviceId) {
          const device = this.#state.bleDevices.find(d => d.deviceId === deviceConfig.deviceId);
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
      platform: this.#state.selectedPlatform || 'android',
      targetApp: this.#state.selectedApp,
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
        appLoadWaitTime: parseFloat(root.getElementById('tc-app-load-wait-time')?.value) || 10,
        elementWaitTimeout: parseFloat(root.getElementById('tc-element-wait-timeout')?.value) || 30,
        stepInterval: parseFloat(root.getElementById('tc-step-interval')?.value) || 2,
        appCloseWaitTime: parseFloat(root.getElementById('tc-app-close-wait-time')?.value) || 2,
      },
    };
  }

  /**
   * 从 DOM 重新读取步骤数据，合并 model 中的步骤基础信息
   * @param {Document|Element} root - DOM 根节点
   * @param {Array} modelSteps - model 中的步骤数组
   * @returns {Array} 合并后的步骤数据
   */
  #collectStepsFromDOM(root, modelSteps) {
    const container = root.getElementById('tc-steps-list');
    if (!container) return modelSteps;

    const cards = container.querySelectorAll('.tc-step-card');
    if (cards.length === 0) return modelSteps;

    const result = [];
    cards.forEach((card, index) => {
      const stepId = card.dataset.stepId;
      const modelStep = modelSteps.find(s => s.id === stepId);
      if (!modelStep) return;

      // 以 model step 为基础，从 DOM 覆盖可编辑字段
      // 删除渲染注入的临时属性（_app/_bleDevices/_allSteps），避免循环引用
      const { _app, _bleDevices, _allSteps, ...stepData } = modelStep;
      const step = JSON.parse(JSON.stringify(stepData));
      step.order = index + 1;

      // 步骤名称
      const nameInput = card.querySelector('.tc-step-name-input');
      if (nameInput) step.name = nameInput.value;

      // 步骤类型
      const activeTab = card.querySelector('.tc-type-tab.active');
      if (activeTab) step.type = activeTab.dataset.type;

      // 从 DOM 读取 config 中的值
      const config = step.config || {};

      // 读取 custom-select 的当前选中值
      // 注意：options 已被移到 body，需要通过 ID 在 document 上查找
      card.querySelectorAll('.custom-select').forEach(select => {
        const selectId = select.dataset.selectId;
        if (!selectId) return;

        // 从 body 中查找对应的 options
        let optionsEl = null;
        if (select.id) {
          optionsEl = document.getElementById(`${select.id}-options`);
        }
        if (!optionsEl) {
          optionsEl = select.querySelector('.custom-select__options');
        }

        const selectedOpt = optionsEl?.querySelector('.custom-select__option.selected');
        if (selectedOpt) {
          const value = selectedOpt.dataset.value;
          // 根据 selectId 更新 config（与原始 script.js 数据结构一致）
          if (selectId.startsWith('tc-page-select')) config.pageId = value;
          else if (selectId.startsWith('tc-element-select')) config.elementId = value;
          else if (selectId.startsWith('tc-operation-select')) config.operation = value;
          else if (selectId.startsWith('tc-input-type-select')) {
            config.operationValue = config.operationValue || {};
            config.operationValue.inputType = value;
          }
          else if (selectId.startsWith('tc-ble-method-select')) {
            config.deviceConfig = config.deviceConfig || {};
            config.deviceConfig.methodName = value;
          }
          else if (selectId.startsWith('tc-system-operation-type')) {
            config.systemConfig = config.systemConfig || {};
            config.systemConfig.operationType = value;
          }
          else if (selectId.startsWith('tc-page-operation-type')) config.operationType = value;
          else if (selectId.startsWith('tc-target-value-type')) {
            config.compareConfig = config.compareConfig || {};
            config.compareConfig.targetValueType = value;
          }
          else if (selectId.startsWith('tc-search-type')) {
            config.searchConfig = config.searchConfig || {};
            config.searchConfig.searchType = value;
          }
          else if (selectId.startsWith('tc-faker-locale')) {
            config.operationValue = config.operationValue || {};
            config.operationValue.fakerConfig = config.operationValue.fakerConfig || {};
            config.operationValue.fakerConfig.locale = value;
          }
          else if (selectId.startsWith('tc-faker-provider')) {
            config.operationValue = config.operationValue || {};
            config.operationValue.fakerConfig = config.operationValue.fakerConfig || {};
            config.operationValue.fakerConfig.provider = value;
          }
          else if (selectId.startsWith('tc-faker-method')) {
            config.operationValue = config.operationValue || {};
            config.operationValue.fakerConfig = config.operationValue.fakerConfig || {};
            config.operationValue.fakerConfig.method = value;
          }
          else if (selectId.startsWith('tc-faker-category')) {
            config.operationValue = config.operationValue || {};
            config.operationValue.fakerConfig = config.operationValue.fakerConfig || {};
            config.operationValue.fakerConfig.category = value;
          }
          else if (selectId.startsWith('tc-nav-key-select')) {
            config.systemConfig = config.systemConfig || {};
            config.systemConfig.navKey = value;
          }
          else if (selectId.startsWith('tc-random-precision')) {
            config.operationValue = config.operationValue || {};
            config.operationValue.randomConfig = config.operationValue.randomConfig || {};
            config.operationValue.randomConfig.precision = parseInt(value);
          }
          else if (selectId.startsWith('tc-compare-element-page')) {
            config.compareConfig = config.compareConfig || {};
            config.compareConfig.pageId = value;
          }
          else if (selectId.startsWith('tc-compare-element-select')) {
            config.compareConfig = config.compareConfig || {};
            config.compareConfig.elementId = value;
          }
          else if (selectId.startsWith('tc-search-element-page')) {
            config.searchConfig = config.searchConfig || {};
            config.searchConfig.pageId = value;
          }
          else if (selectId.startsWith('tc-search-element-select')) {
            config.searchConfig = config.searchConfig || {};
            config.searchConfig.elementId = value;
          }
          else if (selectId.startsWith('tc-ble-step-select')) {
            config.compareConfig = config.compareConfig || {};
            config.compareConfig.bleStepId = value;
          }
        }
      });

      // 读取 input 值
      const customInput = card.querySelector('.tc-custom-input');
      if (customInput) {
        config.operationValue = config.operationValue || {};
        config.operationValue.inputValue = customInput.value;
      }

      const randomMin = card.querySelector('.tc-random-min');
      if (randomMin) {
        config.operationValue = config.operationValue || {};
        config.operationValue.randomConfig = config.operationValue.randomConfig || {};
        config.operationValue.randomConfig.minValue = parseFloat(randomMin.value) || 0;
      }
      const randomMax = card.querySelector('.tc-random-max');
      if (randomMax) {
        config.operationValue = config.operationValue || {};
        config.operationValue.randomConfig = config.operationValue.randomConfig || {};
        config.operationValue.randomConfig.maxValue = parseFloat(randomMax.value) || 100;
      }

      // 点击次数
      const clickCount = card.querySelector('.tc-click-count');
      if (clickCount) {
        config.operationValue = config.operationValue || {};
        config.operationValue.clickCount = parseInt(clickCount.value) || 1;
      }

      // 滑动时长
      const swipeDuration = card.querySelector('.tc-swipe-duration');
      if (swipeDuration) {
        config.operationValue = config.operationValue || {};
        config.operationValue.swipeDuration = parseInt(swipeDuration.value) || 500;
      }

      // 比较目标值
      const compareTargetValue = card.querySelector('.tc-compare-target-value');
      if (compareTargetValue) {
        config.compareConfig = config.compareConfig || {};
        config.compareConfig.targetValue = compareTargetValue.value;
      }
      const compareTolerance = card.querySelector('.tc-compare-tolerance');
      if (compareTolerance) {
        config.compareConfig = config.compareConfig || {};
        if (compareTolerance.value.trim() !== '') {
          config.compareConfig.tolerance = parseFloat(compareTolerance.value);
        } else {
          delete config.compareConfig.tolerance;
        }
      }

      // 搜索文本
      const searchTextValue = card.querySelector('.tc-search-text-value');
      if (searchTextValue) {
        config.searchConfig = config.searchConfig || {};
        config.searchConfig.textValue = searchTextValue.value;
      }

      // 搜索匹配类型
      const searchMatchRadio = card.querySelector('.tc-search-match-radio:checked');
      if (searchMatchRadio) {
        config.searchConfig = config.searchConfig || {};
        config.searchConfig.matchType = searchMatchRadio.value;
      }

      // 系统导航点击次数
      const navClickCount = card.querySelector('.tc-nav-click-count');
      if (navClickCount) {
        config.systemConfig = config.systemConfig || {};
        config.systemConfig.clickCount = parseInt(navClickCount.value) || 1;
      }

      // BLE 参数
      const bleParamInputs = card.querySelectorAll('.tc-ble-param-input');
      if (bleParamInputs.length > 0) {
        config.deviceConfig = config.deviceConfig || {};
        config.deviceConfig.params = config.deviceConfig.params || {};
        bleParamInputs.forEach(input => {
          const paramKey = input.dataset.paramKey;
          if (paramKey) {
            config.deviceConfig.params[paramKey] = input.type === 'number'
              ? parseFloat(input.value)
              : input.value;
          }
        });
      }

      // 多选元素
      const multiCheckbox = card.querySelector('.tc-multi-select-checkbox');
      if (multiCheckbox) {
        config.multiSelect = multiCheckbox.checked;
      }

      // 多选点击数量
      const multiClickCount = card.querySelector('.tc-multi-click-count');
      if (multiClickCount) {
        config.multiClickCount = parseInt(multiClickCount.value) || 1;
      }

      // 多选元素列表
      const multiElementItems = card.querySelectorAll('.tc-multi-element-item');
      if (multiElementItems.length > 0) {
        config.selectedElements = [];
        multiElementItems.forEach((item, idx) => {
          const elem = {};
          // 辅助函数：从 body 查找 selected option
          const getSelectedValue = (selectEl) => {
            if (!selectEl) return null;
            let optionsEl = null;
            if (selectEl.id) {
              optionsEl = document.getElementById(`${selectEl.id}-options`);
            }
            if (!optionsEl) {
              optionsEl = selectEl.querySelector('.custom-select__options');
            }
            const selectedOpt = optionsEl?.querySelector('.custom-select__option.selected');
            return selectedOpt?.dataset.value || null;
          };
          // 读取元素选择
          const elemSelect = item.querySelector('.custom-select[data-select-id="tc-multi-element-select"]');
          const elemValue = getSelectedValue(elemSelect);
          if (elemValue) elem.elementId = elemValue;
          // 读取操作选择
          const opSelect = item.querySelector('.custom-select[data-select-id="tc-multi-operation-select"]');
          const opValue = getSelectedValue(opSelect);
          if (opValue) elem.operation = opValue;
          // 读取输入类型选择
          const inputTypeSelect = item.querySelector('.custom-select[data-select-id="tc-multi-input-type-select"]');
          const inputTypeValue = getSelectedValue(inputTypeSelect);
          if (inputTypeValue) elem.inputType = inputTypeValue;
          // 读取输入值
          const customInput = item.querySelector('.tc-multi-custom-input');
          if (customInput) elem.inputValue = customInput.value;
          // 读取随机数配置
          const randomMin = item.querySelector('.tc-multi-random-min');
          const randomMax = item.querySelector('.tc-multi-random-max');
          if (randomMin || randomMax) {
            elem.randomConfig = elem.randomConfig || {};
            if (randomMin) elem.randomConfig.minValue = parseFloat(randomMin.value) || 0;
            if (randomMax) elem.randomConfig.maxValue = parseFloat(randomMax.value) || 100;
          }
          // 读取 faker 配置
          const fakerLocaleSelect = item.querySelector('.custom-select[data-select-id="tc-multi-faker-locale"]');
          const fakerProviderSelect = item.querySelector('.custom-select[data-select-id="tc-multi-faker-provider"]');
          const fakerLocaleValue = getSelectedValue(fakerLocaleSelect);
          const fakerProviderValue = getSelectedValue(fakerProviderSelect);
          if (fakerLocaleValue || fakerProviderValue) {
            elem.fakerConfig = elem.fakerConfig || {};
            if (fakerLocaleValue) elem.fakerConfig.locale = fakerLocaleValue;
            if (fakerProviderValue) elem.fakerConfig.provider = fakerProviderValue;
          }
          config.selectedElements.push(elem);
        });
      }

      step.config = config;
      result.push(step);
    });

    return result.length > 0 ? result : modelSteps;
  }

  /**
   * 从 DOM 同步步骤数据到 model（用于 addStep/deleteStep/moveStep/rerender 等操作前）
   */
  syncStepsFromDOM() {
    const root = this.#view?.root ?? document;
    const synced = this.#collectStepsFromDOM(root, this.#state.steps);
    if (synced.length > 0) {
      this.#state.steps = synced;
    }
  }

  destroy() {
    if (this.#state.searchDebounceTimer) {
      clearTimeout(this.#state.searchDebounceTimer);
      this.#state.searchDebounceTimer = null;
    }
    this.#view = null;
    this.removeAllListeners();
  }
}

import { EventEmitter } from '../../core/EventEmitter.js';
import { ApiBridge } from '../../core/ApiBridge.js';
import { FileBrowser } from './modules/FileBrowser.js';
import { OptionPanel } from './modules/OptionPanel.js';
import { StepEditor } from './modules/StepEditor.js';
import { TestCaseEditor } from './modules/TestCaseEditor.js';

/**
 * TestCaseModel - 测试用例 Tab 的 Model 层
 * 管理所有 tc* 状态和 API 调用，通过事件通知 Controller
 *
 * R10 深模块迁移完成:
 * - 模块 1 FileBrowser: selectedDirectory/selectedFile/testFiles/jsonExistsMap/searchQuery
 * - 模块 2 OptionPanel: apps/selectedApp/selectedPlatform/bleDevices/markers/selectedMarkers
 * - 模块 3 StepEditor: steps/draggedStep + 8 步骤操作方法
 * - 模块 4 TestCaseEditor: isEditing/hasUnsavedChanges/loadedDeviceConfig/loadedBleDevice +
 *   selectFile/deselectFile/showEditor/cancelEdit/resetEditor/markDirty +
 *   saveCase/deleteCase/loadCaseData/collectFormData/destroy (编排前 3 模块 + API)
 * Model 仅持有 4 个深模块实例 + 委托方法 + 转发事件，#state 已清空。
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

  #state = {};

  /** @type {FileBrowser} 文件浏览器深模块 */
  #fileBrowser;
  /** @type {OptionPanel} 选项面板深模块 */
  #optionPanel;
  /** @type {StepEditor} 步骤编辑器深模块 */
  #stepEditor;
  /** @type {TestCaseEditor} 用例编辑器状态机深模块 */
  #testCaseEditor;
  /** R26 P3-9: 子模块事件转发 unsub 集合 (destroy 时显式 off) */
  #forwardUnsubs = [];

  constructor() {
    super();
    this.#fileBrowser = new FileBrowser(this.#api);
    this.#optionPanel = new OptionPanel(this.#api);
    // StepEditor 注入 getApp 回调，避免与 OptionPanel 硬耦合
    this.#stepEditor = new StepEditor({
      getApp: () => this.#optionPanel.selectedApp,
    });
    // TestCaseEditor 作为编排者，注入前 3 个模块 + api
    this.#testCaseEditor = new TestCaseEditor({
      api: this.#api,
      fileBrowser: this.#fileBrowser,
      optionPanel: this.#optionPanel,
      stepEditor: this.#stepEditor,
    });

    // R26 P3-9: 转发 listener 记录 unsub, destroy() 显式 off — 原依赖 GC, listener 闭包
    // 引用 this.emit 生命周期, 防模块重建时旧实例监听残留
    // (字段已在类体声明 #forwardUnsubs = [])

    // 转发 FileBrowser 事件，保持 Controller 监听不变
    const fbEvents = ['directory-changed', 'files-changed', 'json-exists-changed', 'selected-file-changed'];
    for (const evt of fbEvents) {
      this.#forward(this.#fileBrowser, evt);
    }
    this.#forward(this.#fileBrowser, 'error');

    // 转发 OptionPanel 事件
    const opEvents = [
      'apps-changed',
      'ble-devices-changed',
      'markers-list-changed',
      'app-changed',
      'platform-changed',
      'markers-changed',
    ];
    for (const evt of opEvents) {
      this.#forward(this.#optionPanel, evt);
    }
    this.#forward(this.#optionPanel, 'error');

    // 转发 StepEditor 事件
    const seEvents = ['steps-changed', 'step-updated', 'dragged-step-changed'];
    for (const evt of seEvents) {
      this.#forward(this.#stepEditor, evt);
    }

    // 转发 TestCaseEditor 事件
    const tceEvents = [
      'editing-changed',
      'dirty-changed',
      'loaded-device-config-changed',
      'loaded-ble-device-changed',
      'show-editor',
      'cancel-edit',
      'case-loaded',
      'case-saved',
      'case-deleted',
    ];
    for (const evt of tceEvents) {
      this.#forward(this.#testCaseEditor, evt);
    }
    this.#forward(this.#testCaseEditor, 'error');
  }

  /** R26 P3-9: 转发子模块事件到本实例, 记录 unsub 供 destroy 清理 */
  #forward(emitter, evt) {
    const fn = (...args) => this.emit(evt, ...args);
    emitter.on(evt, fn);
    this.#forwardUnsubs.push(() => emitter.off(evt, fn));
  }

  // ── Deep Module Accessors ─────────────────────────────────────

  /** @returns {FileBrowser} */
  get fileBrowser() {
    return this.#fileBrowser;
  }
  /** @returns {OptionPanel} */
  get optionPanel() {
    return this.#optionPanel;
  }
  /** @returns {StepEditor} */
  get stepEditor() {
    return this.#stepEditor;
  }
  /** @returns {TestCaseEditor} */
  get testCaseEditor() {
    return this.#testCaseEditor;
  }

  // ── State Getters ──────────────────────────────────────────────

  // FileBrowser 拥有的状态 (委托)
  get selectedDirectory() {
    return this.#fileBrowser.selectedDirectory;
  }
  get selectedFile() {
    return this.#fileBrowser.selectedFile;
  }
  get testFiles() {
    return this.#fileBrowser.testFiles;
  }
  get jsonExistsMap() {
    return this.#fileBrowser.jsonExistsMap;
  }
  get searchQuery() {
    return this.#fileBrowser.searchQuery;
  }

  // OptionPanel 拥有的状态 (委托)
  get apps() {
    return this.#optionPanel.apps;
  }
  get selectedApp() {
    return this.#optionPanel.selectedApp;
  }
  get selectedPlatform() {
    return this.#optionPanel.selectedPlatform;
  }
  get bleDevices() {
    return this.#optionPanel.bleDevices;
  }
  get markers() {
    return this.#optionPanel.markers;
  }
  get selectedMarkers() {
    return this.#optionPanel.selectedMarkers;
  }

  // StepEditor 拥有的状态 (委托)
  get steps() {
    return this.#stepEditor.steps;
  }
  get draggedStep() {
    return this.#stepEditor.draggedStep;
  }

  // TestCaseEditor 拥有的状态 (委托)
  get isEditing() {
    return this.#testCaseEditor.isEditing;
  }
  get hasUnsavedChanges() {
    return this.#testCaseEditor.hasUnsavedChanges;
  }
  get loadedDeviceConfig() {
    return this.#testCaseEditor.loadedDeviceConfig;
  }
  get loadedBleDevice() {
    return this.#testCaseEditor.loadedBleDevice;
  }

  /**
   * 通用状态获取（供 Controller 使用）
   * 优先查 FileBrowser → OptionPanel → StepEditor → TestCaseEditor → Model #state
   * @param {string} key - 状态键名
   * @returns {*} 状态值
   */
  get(key) {
    const fbVal = this.#fileBrowser.get(key);
    if (fbVal !== undefined) return fbVal;
    const opVal = this.#optionPanel.get(key);
    if (opVal !== undefined) return opVal;
    const seVal = this.#stepEditor.get(key);
    if (seVal !== undefined) return seVal;
    const tceVal = this.#testCaseEditor.get(key);
    if (tceVal !== undefined) return tceVal;
    return this.#state[key];
  }

  /**
   * 内部状态对象访问器（兼容旧 mixin，#state 已清空）
   * @returns {Object} 内部状态对象 (空)
   */
  get _state() {
    return this.#state;
  }

  // ── FileBrowser 委托方法 ──────────────────────────────────────
  // 这些方法从 modelDirectoryMixin / modelFileMixin 迁移至 FileBrowser，
  // Model 保留同名方法以兼容现有 Controller 调用。

  /** @see FileBrowser.selectDirectory */
  async selectDirectory() {
    await this.#fileBrowser.selectDirectory();
  }

  /** @see FileBrowser.scanTestFiles */
  async scanTestFiles(directory) {
    await this.#fileBrowser.scanTestFiles(directory);
  }

  /** @see FileBrowser.batchCheckJsonExists */
  async batchCheckJsonExists(fileNames) {
    await this.#fileBrowser.batchCheckJsonExists(fileNames);
  }

  /** @see FileBrowser.setSearchQuery */
  setSearchQuery(query) {
    this.#fileBrowser.setSearchQuery(query);
  }

  // ── OptionPanel 委托方法 ──────────────────────────────────────
  // 这些方法从 modelDirectoryMixin / modelCaseMixin / modelStepMixin 迁移至 OptionPanel，
  // Model 保留同名方法以兼容现有 Controller 调用。

  /** @see OptionPanel.load (并行加载 apps + bleDevices + markers) */
  async load() {
    await this.#optionPanel.load();
  }

  /** @see OptionPanel.loadApps */
  async loadApps() {
    await this.#optionPanel.loadApps();
  }

  /** @see OptionPanel.loadBleDevices */
  async loadBleDevices() {
    await this.#optionPanel.loadBleDevices();
  }

  /** @see OptionPanel.loadMarkers */
  async loadMarkers() {
    await this.#optionPanel.loadMarkers();
  }

  /** @see OptionPanel.selectApp */
  selectApp(app) {
    this.#optionPanel.selectApp(app);
  }

  /** @see OptionPanel.selectPlatform */
  selectPlatform(platform) {
    this.#optionPanel.selectPlatform(platform);
  }

  /** @see OptionPanel.toggleMarker */
  toggleMarker(marker) {
    this.#optionPanel.toggleMarker(marker);
  }

  /** @see OptionPanel.replaceSelectedMarkers */
  replaceSelectedMarkers(markers) {
    this.#optionPanel.replaceSelectedMarkers(markers);
  }

  // ── StepEditor 委托方法 ────────────────────────────────────────
  // 这些方法从 modelStepMixin 迁移至 StepEditor，
  // Model 保留同名方法以兼容现有 Controller 调用。
  // 用户编辑操作 (add/delete/copy/move/changeType/updateName/updateSelect) 同步标记 dirty；
  // 加载/重置/同步操作 (setSteps/reset/syncFromDOM) 不标记 dirty。

  /** @see StepEditor.addStep (用户编辑 → 标记 dirty) */
  addStep() {
    const newStep = this.#stepEditor.addStep();
    this.markDirty();
    return newStep;
  }

  /** @see StepEditor.deleteStep (用户编辑 → 标记 dirty) */
  deleteStep(stepId) {
    this.#stepEditor.deleteStep(stepId);
    this.markDirty();
  }

  /** @see StepEditor.copyStep (用户编辑 → 标记 dirty) */
  copyStep(stepId) {
    const newStep = this.#stepEditor.copyStep(stepId);
    this.markDirty();
    return newStep;
  }

  /** @see StepEditor.moveStep (用户编辑 → 标记 dirty) */
  moveStep(stepId, direction) {
    this.#stepEditor.moveStep(stepId, direction);
    this.markDirty();
  }

  /** @see StepEditor.updateStepSelect (用户编辑 → 标记 dirty) */
  updateStepSelect(selectId, value, stepId, index) {
    this.#stepEditor.updateStepSelect(selectId, value, stepId, index);
    this.markDirty();
  }

  /** @see StepEditor.changeStepType (用户编辑 → 标记 dirty) */
  changeStepType(stepId, type) {
    this.#stepEditor.changeStepType(stepId, type);
    this.markDirty();
  }

  /** @see StepEditor.updateStepName (用户编辑 → 标记 dirty) */
  updateStepName(stepId, name) {
    this.#stepEditor.updateStepName(stepId, name);
    this.markDirty();
  }

  // ── StepEditor 非编辑操作 (不标记 dirty) ──────────────────────

  /** @see StepEditor.setSteps (加载用例时调用，不标记 dirty) */
  setSteps(steps) {
    this.#stepEditor.setSteps(steps);
  }

  /** @see StepEditor.reset (重置编辑器时调用，不标记 dirty) */
  resetSteps() {
    this.#stepEditor.reset();
  }

  /** @see StepEditor.syncFromDOM (View 收集 DOM 同步，不标记 dirty) */
  syncStepsFromDOM(steps) {
    this.#stepEditor.syncFromDOM(steps);
  }

  /** @see StepEditor.setDraggedStep */
  setDraggedStep(step) {
    this.#stepEditor.setDraggedStep(step);
  }

  // ── TestCaseEditor 委托方法 ────────────────────────────────────
  // 这些方法从 modelFileMixin / modelCaseMixin / modelFormMixin 迁移至 TestCaseEditor，
  // Model 保留同名方法以兼容现有 Controller 调用。

  /** @see TestCaseEditor.markDirty */
  markDirty() {
    this.#testCaseEditor.markDirty();
  }

  /** @see TestCaseEditor.clearDirty */
  clearDirty() {
    this.#testCaseEditor.clearDirty();
  }

  /** @see TestCaseEditor.resetEditor (编排 StepEditor + OptionPanel + loadedConfigs) */
  resetEditor() {
    this.#testCaseEditor.resetEditor();
  }

  /** @see TestCaseEditor.selectFile (编排 FileBrowser + clearDirty + showEditor) */
  selectFile(file) {
    this.#testCaseEditor.selectFile(file);
  }

  /** @see TestCaseEditor.deselectFile */
  deselectFile() {
    this.#testCaseEditor.deselectFile();
  }

  /** @see TestCaseEditor.showEditor */
  async showEditor(file = null) {
    await this.#testCaseEditor.showEditor(file);
  }

  /** @see TestCaseEditor.cancelEdit */
  cancelEdit() {
    this.#testCaseEditor.cancelEdit();
  }

  /** @see TestCaseEditor.saveCase */
  async saveCase(caseData) {
    await this.#testCaseEditor.saveCase(caseData);
  }

  /** @see TestCaseEditor.deleteCase */
  async deleteCase(fileName, pyFilePath) {
    await this.#testCaseEditor.deleteCase(fileName, pyFilePath);
  }

  /** @see TestCaseEditor.loadCaseData */
  async loadCaseData(fileName) {
    await this.#testCaseEditor.loadCaseData(fileName);
  }

  /** @see TestCaseEditor.collectFormData */
  collectFormData(domData) {
    return this.#testCaseEditor.collectFormData(domData);
  }

  /** @see TestCaseEditor.destroy */
  destroy() {
    // R26 P3-9: 先清理转发监听 (防子模块事件在 destroy 后仍触发 emit)
    for (const unsub of this.#forwardUnsubs) {
      unsub();
    }
    this.#forwardUnsubs = [];
    this.#testCaseEditor.destroy();
  }
}

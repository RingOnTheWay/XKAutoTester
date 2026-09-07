/**
 * FileBrowser - 测试用例文件浏览器深模块 (R10 renderer mixin → deep module)
 *
 * 领域边界：目录选择 / 文件扫描 / JSON 存在性检查 / 搜索过滤 / 文件选中
 * 不负责：编辑器状态机 (TestCaseEditor)、引用数据加载 (OptionPanel)
 *
 * 取自原 modelDirectoryMixin + modelFileMixin 中的纯文件浏览部分。
 * Model 持有实例并委托方法，事件经 Model 转发给 Controller (保持现有 IPC 不变)。
 *
 * R10 阶段 3 接口收紧：_api/_state/_set 全部转为 #private，外部仅通过公共 getter /
 * 公共方法访问；事件转发由 Model 在构造时订阅，测试通过公共方法或直接 emit 验证。
 *
 * 事件：
 *   - directory-changed(path)        目录切换
 *   - files-changed()                文件列表变更 (扫描完成 / jsonExists 更新 / 搜索过滤)
 *   - json-exists-changed(map)       JSON 存在性映射变更
 *   - selected-file-changed(file)    选中文件变更 (file=null 表示取消选中)
 *   - error({source, error})         操作失败
 */
import { EventEmitter } from '../../../core/EventEmitter.js';

export class FileBrowser extends EventEmitter {
  /** @type {Object} ApiBridge 绑定后的 API 对象 */
  #api;
  /** @type {Object} 内部状态容器 */
  #state = {
    selectedDirectory: null,
    selectedFile: null,
    testFiles: [],
    jsonExistsMap: {},
    searchQuery: '',
  };

  /**
   * @param {Object} api - ApiBridge 绑定后的 API 对象
   */
  constructor(api) {
    super();
    this.#api = api;
  }

  // ── State Getters ──────────────────────────────────────────────

  /** @returns {string|null} 当前选中目录 */
  get selectedDirectory() {
    return this.#state.selectedDirectory;
  }
  /** @returns {Object|null} 当前选中文件对象 */
  get selectedFile() {
    return this.#state.selectedFile;
  }
  /** @returns {Array} 测试文件列表 */
  get testFiles() {
    return this.#state.testFiles;
  }
  /** @returns {Object} JSON 存在性映射 { fileName: boolean } */
  get jsonExistsMap() {
    return this.#state.jsonExistsMap;
  }
  /** @returns {string} 当前搜索关键词 */
  get searchQuery() {
    return this.#state.searchQuery;
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

  // ── Directory & Files ──────────────────────────────────────────

  /**
   * 打开目录选择器，设置 selectedDirectory 并扫描文件
   * 用户取消时不更新状态。失败时触发 error 事件。
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
   * 扫描目录中的测试文件并批量检查 JSON 存在性
   * @param {string} directory - 目录路径，空值直接返回
   */
  async scanTestFiles(directory) {
    if (!directory) return;
    try {
      const files = await this.#api.scanTestFiles(directory);
      const safeFiles = files || [];
      this.#set('testFiles', safeFiles, 'files-changed');
      this.#set('searchQuery', '');
      // R26 P2-6: filter(Boolean) 防列表含 null 条目时 f.name 抛 TypeError
      await this.batchCheckJsonExists(safeFiles.filter(Boolean).map((f) => f.name.replace(/\.[^/.]+$/, '')));
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
      // invokeWithCheck 已保证失败时抛错，此处只需校验业务字段 data
      this.#set('jsonExistsMap', result.data || {}, 'json-exists-changed');
      this.emit('files-changed'); // jsonExistsMap 更新后重新渲染文件列表
    } catch (error) {
      this.#set('jsonExistsMap', {}, 'json-exists-changed');
      this.emit('files-changed');
      this.emit('error', { source: 'batchCheckJsonExists', error });
    }
  }

  /**
   * 设置搜索查询并触发文件列表重新渲染
   * @param {string} query - 搜索关键词
   */
  setSearchQuery(query) {
    this.#set('searchQuery', query, 'files-changed');
  }

  // ── File Selection ─────────────────────────────────────────────

  /**
   * 选中文件，触发 selected-file-changed
   * 注：hasUnsavedChanges 重置与 showEditor 调用由 Model 编排 (编辑器状态机职责)
   * @param {Object} file - 文件对象 { name, path, ... }
   */
  selectFile(file) {
    this.#set('selectedFile', file, 'selected-file-changed');
  }

  /**
   * 取消选中文件
   * 注：loadedDeviceConfig/loadedBleDevice 重置由 Model 编排
   */
  deselectFile() {
    this.#set('selectedFile', null, 'selected-file-changed');
  }
}

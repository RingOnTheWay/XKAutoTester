import { BaseModel } from '../../core/BaseModel.js';
import { ApiBridge } from '../../core/ApiBridge.js';

/**
 * PagePackageModel - 页面封装 Tab 的 Model 层
 * 管理三级级联数据（应用/页面/元素）和 CRUD 操作
 *
 * R26 候选②: 接 core/BaseModel —— 状态容器/相等短路/错误归口上收基类
 * (原自有 #state/#set 样板与 settings 拆分前的模式同构, 迁移为机械替换)。
 */
export class PagePackageModel extends BaseModel {
  #api = ApiBridge.bind({
    getApps: 'pagePackage.getApps',
    getPages: 'pagePackage.getPages',
    getElements: 'pagePackage.getElements',
    addApp: 'pagePackage.addApp',
    updateApp: 'pagePackage.updateApp',
    deleteApp: 'pagePackage.deleteApp',
    addPage: 'pagePackage.addPage',
    updatePage: 'pagePackage.updatePage',
    deletePage: 'pagePackage.deletePage',
    addElement: 'pagePackage.addElement',
    updateElement: 'pagePackage.updateElement',
    deleteElement: 'pagePackage.deleteElement',
    parseApk: 'apk.parse',
    selectApkFile: 'selectApkFile',
    getFilePath: 'getFilePath',
  });

  constructor() {
    super({
      apps: [],
      pages: [],
      elements: [],
      selectedApp: null,
      selectedPage: null,
      selectedElement: null,
      isEditing: false,
      editingType: null,
      initialized: false,
    });
  }

  // ── State Getters ──────────────────────────────────────────────

  get apps() {
    return this.get('apps');
  }
  get pages() {
    return this.get('pages');
  }
  get elements() {
    return this.get('elements');
  }
  get selectedApp() {
    return this.get('selectedApp');
  }
  get selectedPage() {
    return this.get('selectedPage');
  }
  get selectedElement() {
    return this.get('selectedElement');
  }
  get isEditing() {
    return this.get('isEditing');
  }
  get editingType() {
    return this.get('editingType');
  }
  get initialized() {
    return this.get('initialized');
  }

  // ── Initialization ─────────────────────────────────────────────

  async load() {
    await this.loadApps();
    this.set('initialized', true, 'initialized-changed');
  }

  // ── Data Loading ───────────────────────────────────────────────

  async loadApps() {
    try {
      // wrapper 已在 success=false 时抛错，此处无需再判断
      const result = await this.#api.getApps();
      this.set('apps', result.data || [], 'apps-changed');
      this.emit('apps-count-changed', (result.data || []).length);
    } catch (error) {
      this.emitError('loadApps', error);
    }
  }

  async loadPages(appId) {
    if (!appId) {
      this.set('pages', [], 'pages-changed');
      this.emit('pages-count-changed', 0);
      return;
    }
    try {
      // wrapper 已在 success=false 时抛错，此处无需再判断
      const result = await this.#api.getPages(appId);
      this.set('pages', result.data || [], 'pages-changed');
      this.emit('pages-count-changed', (result.data || []).length);
    } catch (error) {
      this.set('pages', [], 'pages-changed');
      this.emit('pages-count-changed', 0);
      this.emitError('loadPages', error);
    }
  }

  async loadElements(appId, pageId) {
    if (!appId || !pageId) {
      this.set('elements', [], 'elements-changed');
      this.emit('elements-count-changed', 0);
      return;
    }
    try {
      // wrapper 已在 success=false 时抛错，此处无需再判断
      const result = await this.#api.getElements(appId, pageId);
      this.set('elements', result.data || [], 'elements-changed');
      this.emit('elements-count-changed', (result.data || []).length);
    } catch (error) {
      this.set('elements', [], 'elements-changed');
      this.emit('elements-count-changed', 0);
      this.emitError('loadElements', error);
    }
  }

  // ── Selection ──────────────────────────────────────────────────

  selectApp(appId) {
    const app = this.get('apps').find((a) => a.id === appId);
    if (!app) return;
    this.set('selectedApp', app, 'selected-app-changed');
    // 重置下级选择
    this.set('selectedPage', null, 'selected-page-changed');
    this.set('selectedElement', null, 'selected-element-changed');
  }

  selectPage(pageId) {
    const page = this.get('pages').find((p) => p.id === pageId);
    if (!page) return;
    this.set('selectedPage', page, 'selected-page-changed');
    // 重置下级选择
    this.set('selectedElement', null, 'selected-element-changed');
  }

  selectElement(elementId) {
    const element = this.get('elements').find((e) => e.id === elementId);
    if (!element) return;
    this.set('selectedElement', element, 'selected-element-changed');
  }

  // ── CRUD: App ──────────────────────────────────────────────────

  async saveApp(appData) {
    if (!appData.name) {
      this.emit('error', { source: 'saveApp', message: 'nameRequired' });
      return;
    }
    try {
      // wrapper 已在 success=false 时抛错，此处无需再判断
      if (this.get('isEditing') && this.get('selectedApp')) {
        await this.#api.updateApp(this.get('selectedApp').id, appData);
      } else {
        await this.#api.addApp(appData);
      }
      this.emit('save-success', { type: 'app' });
      await this.loadApps();
      const selected = this.get('selectedApp');
      if (this.get('isEditing') && selected) {
        Object.assign(selected, appData);
        this.emit('selected-app-changed', selected);
      }
    } catch (error) {
      this.emit('error', { source: 'saveApp', message: 'saveFailed', error });
    }
  }

  // ── CRUD: Page ─────────────────────────────────────────────────

  async savePage(name) {
    if (!name) {
      this.emit('error', { source: 'savePage', message: 'nameRequired' });
      return;
    }
    if (!this.get('selectedApp')) {
      this.emit('error', { source: 'savePage', message: 'selectAppFirst' });
      return;
    }
    try {
      // wrapper 已在 success=false 时抛错，此处无需再判断
      const selectedApp = this.get('selectedApp');
      if (this.get('isEditing') && this.get('selectedPage')) {
        await this.#api.updatePage(selectedApp.id, this.get('selectedPage').id, name);
      } else {
        await this.#api.addPage(selectedApp.id, name);
      }
      this.emit('save-success', { type: 'page' });
      await this.loadPages(selectedApp.id);
      const selectedPage = this.get('selectedPage');
      if (this.get('isEditing') && selectedPage) {
        selectedPage.name = name;
        this.emit('selected-page-changed', selectedPage);
      }
    } catch (error) {
      this.emit('error', { source: 'savePage', message: 'saveFailed', error });
    }
  }

  // ── CRUD: Element ──────────────────────────────────────────────

  async saveElement(elementData) {
    if (!elementData.name) {
      this.emit('error', { source: 'saveElement', message: 'nameRequired' });
      return;
    }
    if (!elementData.value) {
      this.emit('error', { source: 'saveElement', message: 'valueRequired' });
      return;
    }
    if (!this.get('selectedApp') || !this.get('selectedPage')) {
      this.emit('error', { source: 'saveElement', message: 'selectPageFirst' });
      return;
    }
    try {
      // wrapper 已在 success=false 时抛错，此处无需再判断
      const selectedApp = this.get('selectedApp');
      const selectedPage = this.get('selectedPage');
      if (this.get('isEditing') && this.get('selectedElement')) {
        await this.#api.updateElement(selectedApp.id, selectedPage.id, this.get('selectedElement').id, elementData);
      } else {
        await this.#api.addElement(selectedApp.id, selectedPage.id, elementData);
      }
      this.emit('save-success', { type: 'element' });
      await this.loadElements(selectedApp.id, selectedPage.id);
      const selectedElement = this.get('selectedElement');
      if (this.get('isEditing') && selectedElement) {
        Object.assign(selectedElement, elementData);
        this.emit('selected-element-changed', selectedElement);
      }
    } catch (error) {
      this.emit('error', {
        source: 'saveElement',
        message: 'saveFailed',
        error,
      });
    }
  }

  // ── Delete ─────────────────────────────────────────────────────

  async deleteItem(type) {
    try {
      // wrapper 已在 success=false 时抛错，case 内无需再判断 result.success
      switch (type) {
        case 'app':
          if (!this.get('selectedApp')) return;
          await this.#api.deleteApp(this.get('selectedApp').id);
          // 删除后只清 state, 不 emit selected-*-changed (避免触发旧 reset collapse 当前层)
          // UI 由 controller 监听 delete-success 调 view.resetForDelete 处理
          // (BaseModel.silentSet: 静默写不发事件, 原因见上)
          this.silentSet('selectedApp', null);
          this.silentSet('selectedPage', null);
          this.silentSet('selectedElement', null);
          await this.loadApps();
          break;
        case 'page':
          if (!this.get('selectedPage')) return;
          await this.#api.deletePage(this.get('selectedApp').id, this.get('selectedPage').id);
          this.silentSet('selectedPage', null);
          this.silentSet('selectedElement', null);
          await this.loadPages(this.get('selectedApp').id);
          break;
        case 'element':
          if (!this.get('selectedElement')) return;
          await this.#api.deleteElement(
            this.get('selectedApp').id,
            this.get('selectedPage').id,
            this.get('selectedElement').id
          );
          this.silentSet('selectedElement', null);
          await this.loadElements(this.get('selectedApp').id, this.get('selectedPage').id);
          break;
      }
      this.emit('delete-success', { type });
    } catch (error) {
      this.emit('error', {
        source: 'deleteItem',
        message: 'deleteFailed',
        error,
      });
    }
  }

  // ── APK Parse ──────────────────────────────────────────────────

  async parseApk(filePath) {
    try {
      const result = await this.#api.parseApk(filePath);
      return result;
    } catch (error) {
      this.emitError('parseApk', error);
      return { success: false, error: error.message };
    }
  }

  async selectApkFile() {
    try {
      const result = await this.#api.selectApkFile();
      return result;
    } catch (error) {
      this.emitError('selectApkFile', error);
      return null;
    }
  }

  getFilePath(file) {
    return this.#api.getFilePath(file);
  }

  // ── Editing State ──────────────────────────────────────────────

  setEditing(isEditing, type) {
    this.set('isEditing', isEditing, 'editing-changed');
    this.set('editingType', type, 'editing-type-changed');
  }

  // ── Reset ──────────────────────────────────────────────────────

  resetState() {
    this.set('selectedApp', null, 'selected-app-changed');
    this.set('selectedPage', null, 'selected-page-changed');
    this.set('selectedElement', null, 'selected-element-changed');
    this.emit('reset-all-selects');
  }

  /**
   * 获取选中项的 ID
   * @param {'app'|'page'|'element'} type
   * @returns {string|null}
   */
  getSelectedId(type) {
    switch (type) {
      case 'app':
        return this.get('selectedApp')?.id;
      case 'page':
        return this.get('selectedPage')?.id;
      case 'element':
        return this.get('selectedElement')?.id;
    }
  }

  /**
   * 过滤选项
   * @param {'app'|'page'|'element'} type
   * @param {string} keyword
   * @returns {Array}
   */
  filterOptions(type, keyword) {
    const kw = keyword.toLowerCase();
    // R27 P3-6: name 可能非字符串 (脏数据) — String() 兜底防 toLowerCase 抛错
    const nameOf = (item) => String((item && item.name) || '').toLowerCase();
    switch (type) {
      case 'app':
        return this.get('apps').filter((app) => nameOf(app).includes(kw));
      case 'page':
        return this.get('pages').filter((page) => nameOf(page).includes(kw));
      case 'element':
        return this.get('elements').filter(
          (element) =>
            element.name.toLowerCase().includes(kw) || (element.value && element.value.toLowerCase().includes(kw))
        );
    }
  }
}

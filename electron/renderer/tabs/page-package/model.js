import { EventEmitter } from '../../core/EventEmitter.js';
import { ApiBridge } from '../../core/ApiBridge.js';

/**
 * PagePackageModel - 页面封装 Tab 的 Model 层
 * 管理三级级联数据（应用/页面/元素）和 CRUD 操作
 */
export class PagePackageModel extends EventEmitter {
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

  #state = {
    apps: [],
    pages: [],
    elements: [],
    selectedApp: null,
    selectedPage: null,
    selectedElement: null,
    isEditing: false,
    editingType: null,
    initialized: false,
  };

  // ── State Getters ──────────────────────────────────────────────

  get apps() { return this.#state.apps; }
  get pages() { return this.#state.pages; }
  get elements() { return this.#state.elements; }
  get selectedApp() { return this.#state.selectedApp; }
  get selectedPage() { return this.#state.selectedPage; }
  get selectedElement() { return this.#state.selectedElement; }
  get isEditing() { return this.#state.isEditing; }
  get editingType() { return this.#state.editingType; }
  get initialized() { return this.#state.initialized; }

  get(key) { return this.#state[key]; }

  // ── Private State Helper ───────────────────────────────────────

  #set(key, value, event) {
    const old = this.#state[key];
    if (old === value) return;
    this.#state[key] = value;
    this.emit(event || `${key}-changed`, value, old);
  }

  // ── Initialization ─────────────────────────────────────────────

  async load() {
    await this.loadApps();
    this.#set('initialized', true, 'initialized-changed');
  }

  // ── Data Loading ───────────────────────────────────────────────

  async loadApps() {
    try {
      // wrapper 已在 success=false 时抛错，此处无需再判断
      const result = await this.#api.getApps();
      this.#set('apps', result.data || [], 'apps-changed');
      this.emit('apps-count-changed', (result.data || []).length);
    } catch (error) {
      this.emit('error', { source: 'loadApps', error });
    }
  }

  async loadPages(appId) {
    if (!appId) {
      this.#set('pages', [], 'pages-changed');
      this.emit('pages-count-changed', 0);
      return;
    }
    try {
      // wrapper 已在 success=false 时抛错，此处无需再判断
      const result = await this.#api.getPages(appId);
      this.#set('pages', result.data || [], 'pages-changed');
      this.emit('pages-count-changed', (result.data || []).length);
    } catch (error) {
      this.#set('pages', [], 'pages-changed');
      this.emit('pages-count-changed', 0);
      this.emit('error', { source: 'loadPages', error });
    }
  }

  async loadElements(appId, pageId) {
    if (!appId || !pageId) {
      this.#set('elements', [], 'elements-changed');
      this.emit('elements-count-changed', 0);
      return;
    }
    try {
      // wrapper 已在 success=false 时抛错，此处无需再判断
      const result = await this.#api.getElements(appId, pageId);
      this.#set('elements', result.data || [], 'elements-changed');
      this.emit('elements-count-changed', (result.data || []).length);
    } catch (error) {
      this.#set('elements', [], 'elements-changed');
      this.emit('elements-count-changed', 0);
      this.emit('error', { source: 'loadElements', error });
    }
  }

  // ── Selection ──────────────────────────────────────────────────

  selectApp(appId) {
    const app = this.#state.apps.find(a => a.id === appId);
    if (!app) return;
    this.#set('selectedApp', app, 'selected-app-changed');
    // 重置下级选择
    this.#set('selectedPage', null, 'selected-page-changed');
    this.#set('selectedElement', null, 'selected-element-changed');
  }

  selectPage(pageId) {
    const page = this.#state.pages.find(p => p.id === pageId);
    if (!page) return;
    this.#set('selectedPage', page, 'selected-page-changed');
    // 重置下级选择
    this.#set('selectedElement', null, 'selected-element-changed');
  }

  selectElement(elementId) {
    const element = this.#state.elements.find(e => e.id === elementId);
    if (!element) return;
    this.#set('selectedElement', element, 'selected-element-changed');
  }

  // ── CRUD: App ──────────────────────────────────────────────────

  async saveApp(appData) {
    if (!appData.name) {
      this.emit('error', { source: 'saveApp', message: 'nameRequired' });
      return;
    }
    try {
      // wrapper 已在 success=false 时抛错，此处无需再判断
      if (this.#state.isEditing && this.#state.selectedApp) {
        await this.#api.updateApp(this.#state.selectedApp.id, appData);
      } else {
        await this.#api.addApp(appData);
      }
      this.emit('save-success', { type: 'app' });
      await this.loadApps();
      if (this.#state.isEditing && this.#state.selectedApp) {
        Object.assign(this.#state.selectedApp, appData);
        this.emit('selected-app-changed', this.#state.selectedApp);
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
    if (!this.#state.selectedApp) {
      this.emit('error', { source: 'savePage', message: 'selectAppFirst' });
      return;
    }
    try {
      // wrapper 已在 success=false 时抛错，此处无需再判断
      if (this.#state.isEditing && this.#state.selectedPage) {
        await this.#api.updatePage(this.#state.selectedApp.id, this.#state.selectedPage.id, name);
      } else {
        await this.#api.addPage(this.#state.selectedApp.id, name);
      }
      this.emit('save-success', { type: 'page' });
      await this.loadPages(this.#state.selectedApp.id);
      if (this.#state.isEditing && this.#state.selectedPage) {
        this.#state.selectedPage.name = name;
        this.emit('selected-page-changed', this.#state.selectedPage);
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
    if (!this.#state.selectedApp || !this.#state.selectedPage) {
      this.emit('error', { source: 'saveElement', message: 'selectPageFirst' });
      return;
    }
    try {
      // wrapper 已在 success=false 时抛错，此处无需再判断
      if (this.#state.isEditing && this.#state.selectedElement) {
        await this.#api.updateElement(
          this.#state.selectedApp.id,
          this.#state.selectedPage.id,
          this.#state.selectedElement.id,
          elementData
        );
      } else {
        await this.#api.addElement(
          this.#state.selectedApp.id,
          this.#state.selectedPage.id,
          elementData
        );
      }
      this.emit('save-success', { type: 'element' });
      await this.loadElements(this.#state.selectedApp.id, this.#state.selectedPage.id);
      if (this.#state.isEditing && this.#state.selectedElement) {
        Object.assign(this.#state.selectedElement, elementData);
        this.emit('selected-element-changed', this.#state.selectedElement);
      }
    } catch (error) {
      this.emit('error', { source: 'saveElement', message: 'saveFailed', error });
    }
  }

  // ── Delete ─────────────────────────────────────────────────────

  async deleteItem(type) {
    try {
      // wrapper 已在 success=false 时抛错，case 内无需再判断 result.success
      switch (type) {
        case 'app':
          if (!this.#state.selectedApp) return;
          await this.#api.deleteApp(this.#state.selectedApp.id);
          // 删除后只清 state, 不 emit selected-*-changed (避免触发旧 reset collapse 当前层)
          // UI 由 controller 监听 delete-success 调 view.resetForDelete 处理
          this.#state.selectedApp = null;
          this.#state.selectedPage = null;
          this.#state.selectedElement = null;
          await this.loadApps();
          break;
        case 'page':
          if (!this.#state.selectedPage) return;
          await this.#api.deletePage(this.#state.selectedApp.id, this.#state.selectedPage.id);
          this.#state.selectedPage = null;
          this.#state.selectedElement = null;
          await this.loadPages(this.#state.selectedApp.id);
          break;
        case 'element':
          if (!this.#state.selectedElement) return;
          await this.#api.deleteElement(
            this.#state.selectedApp.id,
            this.#state.selectedPage.id,
            this.#state.selectedElement.id
          );
          this.#state.selectedElement = null;
          await this.loadElements(this.#state.selectedApp.id, this.#state.selectedPage.id);
          break;
      }
      this.emit('delete-success', { type });
    } catch (error) {
      this.emit('error', { source: 'deleteItem', message: 'deleteFailed', error });
    }
  }

  // ── APK Parse ──────────────────────────────────────────────────

  async parseApk(filePath) {
    try {
      const result = await this.#api.parseApk(filePath);
      return result;
    } catch (error) {
      this.emit('error', { source: 'parseApk', error });
      return { success: false, error: error.message };
    }
  }

  async selectApkFile() {
    try {
      const result = await this.#api.selectApkFile();
      return result;
    } catch (error) {
      this.emit('error', { source: 'selectApkFile', error });
      return null;
    }
  }

  getFilePath(file) {
    return this.#api.getFilePath(file);
  }

  // ── Editing State ──────────────────────────────────────────────

  setEditing(isEditing, type) {
    this.#set('isEditing', isEditing, 'editing-changed');
    this.#set('editingType', type, 'editing-type-changed');
  }

  // ── Reset ──────────────────────────────────────────────────────

  resetState() {
    this.#set('selectedApp', null, 'selected-app-changed');
    this.#set('selectedPage', null, 'selected-page-changed');
    this.#set('selectedElement', null, 'selected-element-changed');
    this.emit('reset-all-selects');
  }

  /**
   * 获取选中项的 ID
   * @param {'app'|'page'|'element'} type
   * @returns {string|null}
   */
  getSelectedId(type) {
    switch (type) {
      case 'app': return this.#state.selectedApp?.id;
      case 'page': return this.#state.selectedPage?.id;
      case 'element': return this.#state.selectedElement?.id;
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
    switch (type) {
      case 'app':
        return this.#state.apps.filter(app => app.name.toLowerCase().includes(kw));
      case 'page':
        return this.#state.pages.filter(page => page.name.toLowerCase().includes(kw));
      case 'element':
        return this.#state.elements.filter(element =>
          element.name.toLowerCase().includes(kw) ||
          (element.value && element.value.toLowerCase().includes(kw))
        );
    }
  }

  destroy() {
    this.removeAllListeners();
  }
}

// PagePackageService — 页面封装深模块。
//
// 藏 3 层嵌套导航 (apps[].pages[].elements[]) + try-catch + getData/saveData 模板 +
// ID 生成 + 错误日志。
// 2 factory-or-default (对称 I18nService.js L21-37 3-factory + smartScheduler.js L46-71 7-factory)。
//
// 生产: new PagePackageService(userConfigPath)  # 单参, opts 默认 {}
// 测试: new PagePackageService(userConfigPath, { idGenerator: fake, errorReporter: spy })
//
// 内部组织:
//   _navigate(data, nav)        — 纯函数导航, 返 NavCtx 或 {error}
//   _applyQuery(nav, queryFn)   — 读路径: getData → navigate → query → _success
//   _applyMutation(nav, fn)     — 写路径: getData → navigate → mutate → save → _success
//   _applyDelete(nav, findFn)   — 删路径: getData → navigate → splice → save → {success:true}

const path = require('path');
const { JsonFileCrudService } = require('./base/JsonFileCrudService');

class PagePackageService extends JsonFileCrudService {
  /**
   * @param {string} userConfigPath
   * @param {Object} [opts] - factory-or-default (全可选, 生产不传)
   * @param {Function} [opts.idGenerator] - 默认 () => this._generateId()
   * @param {Function} [opts.errorReporter] - 默认 (msg, err) => console.error(msg, err)
   */
  constructor(userConfigPath, opts = {}) {
    const pagePackagePath = path.join(userConfigPath, 'page_package.json');
    super(pagePackagePath, { apps: [] }, opts);  // 透传 opts.asyncFsFactory + opts.idGenerator 给 base
    // _idGenerator 由 base 处理 (opts.idGenerator || defaultIdGenerator); 此处不再覆写, 避免与 base._generateId 递归
    this._errorReporter = opts.errorReporter || ((msg, err) => console.error(msg, err));
  }

  // ── Apps (5) ──────────────────────────────────────────

  async getApps() {
    return this._applyQuery({}, (ctx) => ctx.data.apps);
  }

  async addApp(appData) {
    return this._applyMutation({}, (ctx) => {
      const newApp = {
        id: this._idGenerator(),
        name: appData.name,
        platform: appData.platform || 'android',
        packageName: appData.packageName || '',
        activityName: appData.activityName || '',
        pages: []
      };
      ctx.data.apps.push(newApp);
      return newApp;
    });
  }

  async updateApp(appId, appData) {
    // facade 层吃掉字符串兼容 (历史包袱不进 helper)
    const payload = typeof appData === 'string' ? { name: appData } : appData;
    return this._applyMutation({ appId }, (ctx) => {
      if (payload.name !== undefined) ctx.app.name = payload.name;
      if (payload.platform !== undefined) ctx.app.platform = payload.platform;
      if (payload.packageName !== undefined) ctx.app.packageName = payload.packageName;
      if (payload.activityName !== undefined) ctx.app.activityName = payload.activityName;
      return ctx.app;
    });
  }

  async deleteApp(appId) {
    return this._applyDelete({ appId }, (ctx) =>
      ctx.data.apps.findIndex(a => a.id === appId)
    );
  }

  async searchApps(keyword) {
    return this._applyQuery({}, (ctx) => {
      if (!keyword) return ctx.data.apps;
      const k = keyword.toLowerCase();
      return ctx.data.apps.filter(a => a.name.toLowerCase().includes(k));
    });
  }

  // ── Pages (5) ─────────────────────────────────────────

  async getPages(appId) {
    return this._applyQuery({ appId }, (ctx) => ctx.app.pages);
  }

  async addPage(appId, name) {
    return this._applyMutation({ appId }, (ctx) => {
      const newPage = { id: this._idGenerator(), name, elements: [] };
      ctx.app.pages.push(newPage);
      return newPage;
    });
  }

  async updatePage(appId, pageId, name) {
    return this._applyMutation({ appId, pageId }, (ctx) => {
      ctx.page.name = name;
      return ctx.page;
    });
  }

  async deletePage(appId, pageId) {
    return this._applyDelete({ appId, pageId }, (ctx) =>
      ctx.app.pages.findIndex(p => p.id === pageId)
    );
  }

  async searchPages(appId, keyword) {
    return this._applyQuery({ appId }, (ctx) => {
      if (!keyword) return ctx.app.pages;
      const k = keyword.toLowerCase();
      return ctx.app.pages.filter(p => p.name.toLowerCase().includes(k));
    });
  }

  // ── Elements (5) ──────────────────────────────────────

  async getElements(appId, pageId) {
    return this._applyQuery({ appId, pageId }, (ctx) => ctx.page.elements);
  }

  async addElement(appId, pageId, elementData) {
    return this._applyMutation({ appId, pageId }, (ctx) => {
      const newElement = {
        id: this._idGenerator(),
        name: elementData.name,
        locator: elementData.locator,
        value: elementData.value
      };
      ctx.page.elements.push(newElement);
      return newElement;
    });
  }

  async updateElement(appId, pageId, elementId, elementData) {
    return this._applyMutation({ appId, pageId, elementId }, (ctx) => {
      ctx.page.elements[ctx.elementIndex] = {
        id: elementId,
        name: elementData.name,
        locator: elementData.locator,
        value: elementData.value
      };
      return ctx.page.elements[ctx.elementIndex];
    });
  }

  async deleteElement(appId, pageId, elementId) {
    return this._applyDelete({ appId, pageId, elementId }, (ctx) =>
      ctx.page.elements.findIndex(e => e.id === elementId)
    );
  }

  async searchElements(appId, pageId, keyword) {
    return this._applyQuery({ appId, pageId }, (ctx) => {
      if (!keyword) return ctx.page.elements;
      const k = keyword.toLowerCase();
      return ctx.page.elements.filter(e =>
        e.name.toLowerCase().includes(k) || e.value.toLowerCase().includes(k)
      );
    });
  }

  // ── Stats (2) ─────────────────────────────────────────

  async getAppStats(appId) {
    return this._applyQuery({ appId }, (ctx) => ({
      pageCount: ctx.app.pages.length,
      elementCount: ctx.app.pages.reduce((n, p) => n + p.elements.length, 0)
    }));
  }

  async getPageStats(appId, pageId) {
    return this._applyQuery({ appId, pageId }, (ctx) => ({
      elementCount: ctx.page.elements.length
    }));
  }

  // ── 私有 helper (藏 try-catch + getData/saveData 模板) ──

  /**
   * 纯函数导航: 按 nav 对象找 3 层嵌套, 返 NavCtx 或 {error}
   * 无 IO, 易测
   */
  _navigate(data, nav) {
    if (!nav.appId) return { data };
    const app = data.apps.find(a => a.id === nav.appId);
    if (!app) return { error: '未找到应用' };
    if (!nav.pageId) return { data, app };
    const page = app.pages.find(p => p.id === nav.pageId);
    if (!page) return { error: '未找到页面' };
    if (!nav.elementId) return { data, app, page };
    const elementIndex = page.elements.findIndex(e => e.id === nav.elementId);
    if (elementIndex === -1) return { error: '未找到元素' };
    return { data, app, page, elementIndex, element: page.elements[elementIndex] };
  }

  /** 读路径: getData → navigate → queryFn → _success */
  async _applyQuery(nav, queryFn) {
    try {
      const data = await this.getData();
      const ctx = this._navigate(data, nav);
      if (ctx.error) return this._error(ctx.error);
      const result = queryFn(ctx);
      return this._success(result);
    } catch (error) {
      this._errorReporter('PagePackage 查询失败:', error);
      return this._error(error.message);
    }
  }

  /** 写路径: withLock(getData → navigate → mutateFn → saveData) → _success
   *  P0 修复: read-modify-write 包进 withLock, 防并发丢更新 */
  async _applyMutation(nav, mutateFn) {
    try {
      return await this.withLock(async () => {
        const data = await this.getData();
        const ctx = this._navigate(data, nav);
        if (ctx.error) return this._error(ctx.error);
        const result = mutateFn(ctx);
        await this.saveData(data);
        return this._success(result);
      });
    } catch (error) {
      this._errorReporter('PagePackage 修改失败:', error);
      return this._error(error.message);
    }
  }

  /** 删路径: withLock(getData → navigate → findIndexFn → splice → saveData) → {success:true}
   *  P0 修复: read-modify-write 包进 withLock, 防并发丢更新 */
  async _applyDelete(nav, findIndexFn) {
    try {
      return await this.withLock(async () => {
        const data = await this.getData();
        const ctx = this._navigate(data, nav);
        if (ctx.error) return this._error(ctx.error);
        const index = findIndexFn(ctx);
        if (index === -1) return this._error('未找到项');
        // 按导航深度 splice
        if (nav.elementId) ctx.page.elements.splice(index, 1);
        else if (nav.pageId) ctx.app.pages.splice(index, 1);
        else ctx.data.apps.splice(index, 1);
        await this.saveData(data);
        return { success: true };
      });
    } catch (error) {
      this._errorReporter('PagePackage 删除失败:', error);
      return this._error(error.message);
    }
  }
}

module.exports = { PagePackageService };

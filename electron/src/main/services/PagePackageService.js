const path = require('path');
const JsonFileCrudService = require('./base/JsonFileCrudService');

class PagePackageService extends JsonFileCrudService {
  constructor(userConfigPath) {
    const pagePackagePath = path.join(userConfigPath, 'page_package.json');
    super(pagePackagePath, { apps: [] });
  }

  async getApps() {
    try {
      const data = await this.getData();
      return this._success(data.apps);
    } catch (error) {
      console.error('获取应用列表失败:', error);
      return this._error(error.message);
    }
  }

  async addApp(appData) {
    try {
      const data = await this.getData();
      const newApp = {
        id: this._generateId(),
        name: appData.name,
        platform: appData.platform || 'android',
        packageName: appData.packageName || '',
        activityName: appData.activityName || '',
        pages: []
      };
      data.apps.push(newApp);
      await this.saveData(data);
      return this._success(newApp);
    } catch (error) {
      console.error('添加应用失败:', error);
      return this._error(error.message);
    }
  }

  async updateApp(appId, appData) {
    try {
      const data = await this.getData();
      const appIndex = data.apps.findIndex(app => app.id === appId);
      if (appIndex === -1) {
        return this._error('未找到应用');
      }
      if (typeof appData === 'string') {
        data.apps[appIndex].name = appData;
      } else {
        data.apps[appIndex].name = appData.name;
        data.apps[appIndex].platform = appData.platform || data.apps[appIndex].platform || 'android';
        data.apps[appIndex].packageName = appData.packageName || '';
        data.apps[appIndex].activityName = appData.activityName || '';
      }
      await this.saveData(data);
      return this._success(data.apps[appIndex]);
    } catch (error) {
      console.error('更新应用失败:', error);
      return this._error(error.message);
    }
  }

  async deleteApp(appId) {
    try {
      const data = await this.getData();
      const appIndex = data.apps.findIndex(app => app.id === appId);
      if (appIndex === -1) {
        return this._error('未找到应用');
      }
      data.apps.splice(appIndex, 1);
      await this.saveData(data);
      return { success: true };
    } catch (error) {
      console.error('删除应用失败:', error);
      return this._error(error.message);
    }
  }

  async searchApps(keyword) {
    try {
      const data = await this.getData();
      if (!keyword) {
        return this._success(data.apps);
      }
      const lowerKeyword = keyword.toLowerCase();
      const results = data.apps.filter(app =>
        app.name.toLowerCase().includes(lowerKeyword)
      );
      return this._success(results);
    } catch (error) {
      console.error('搜索应用失败:', error);
      return this._error(error.message);
    }
  }

  async getPages(appId) {
    try {
      const data = await this.getData();
      const app = data.apps.find(app => app.id === appId);
      if (!app) {
        return this._error('未找到应用');
      }
      return this._success(app.pages);
    } catch (error) {
      console.error('获取页面列表失败:', error);
      return this._error(error.message);
    }
  }

  async addPage(appId, name) {
    try {
      const data = await this.getData();
      const app = data.apps.find(app => app.id === appId);
      if (!app) {
        return this._error('未找到应用');
      }
      const newPage = {
        id: this._generateId(),
        name: name,
        elements: []
      };
      app.pages.push(newPage);
      await this.saveData(data);
      return this._success(newPage);
    } catch (error) {
      console.error('添加页面失败:', error);
      return this._error(error.message);
    }
  }

  async updatePage(appId, pageId, name) {
    try {
      const data = await this.getData();
      const app = data.apps.find(app => app.id === appId);
      if (!app) {
        return this._error('未找到应用');
      }
      const pageIndex = app.pages.findIndex(page => page.id === pageId);
      if (pageIndex === -1) {
        return this._error('未找到页面');
      }
      app.pages[pageIndex].name = name;
      await this.saveData(data);
      return this._success(app.pages[pageIndex]);
    } catch (error) {
      console.error('更新页面失败:', error);
      return this._error(error.message);
    }
  }

  async deletePage(appId, pageId) {
    try {
      const data = await this.getData();
      const app = data.apps.find(app => app.id === appId);
      if (!app) {
        return this._error('未找到应用');
      }
      const pageIndex = app.pages.findIndex(page => page.id === pageId);
      if (pageIndex === -1) {
        return this._error('未找到页面');
      }
      app.pages.splice(pageIndex, 1);
      await this.saveData(data);
      return { success: true };
    } catch (error) {
      console.error('删除页面失败:', error);
      return this._error(error.message);
    }
  }

  async searchPages(appId, keyword) {
    try {
      const data = await this.getData();
      const app = data.apps.find(app => app.id === appId);
      if (!app) {
        return this._error('未找到应用');
      }
      if (!keyword) {
        return this._success(app.pages);
      }
      const lowerKeyword = keyword.toLowerCase();
      const results = app.pages.filter(page =>
        page.name.toLowerCase().includes(lowerKeyword)
      );
      return this._success(results);
    } catch (error) {
      console.error('搜索页面失败:', error);
      return this._error(error.message);
    }
  }

  async getElements(appId, pageId) {
    try {
      const data = await this.getData();
      const app = data.apps.find(app => app.id === appId);
      if (!app) {
        return this._error('未找到应用');
      }
      const page = app.pages.find(page => page.id === pageId);
      if (!page) {
        return this._error('未找到页面');
      }
      return this._success(page.elements);
    } catch (error) {
      console.error('获取元素列表失败:', error);
      return this._error(error.message);
    }
  }

  async addElement(appId, pageId, elementData) {
    try {
      const data = await this.getData();
      const app = data.apps.find(app => app.id === appId);
      if (!app) {
        return this._error('未找到应用');
      }
      const page = app.pages.find(page => page.id === pageId);
      if (!page) {
        return this._error('未找到页面');
      }
      const newElement = {
        id: this._generateId(),
        name: elementData.name,
        locator: elementData.locator,
        value: elementData.value
      };
      page.elements.push(newElement);
      await this.saveData(data);
      return this._success(newElement);
    } catch (error) {
      console.error('添加元素失败:', error);
      return this._error(error.message);
    }
  }

  async updateElement(appId, pageId, elementId, elementData) {
    try {
      const data = await this.getData();
      const app = data.apps.find(app => app.id === appId);
      if (!app) {
        return this._error('未找到应用');
      }
      const page = app.pages.find(page => page.id === pageId);
      if (!page) {
        return this._error('未找到页面');
      }
      const elementIndex = page.elements.findIndex(element => element.id === elementId);
      if (elementIndex === -1) {
        return this._error('未找到元素');
      }
      page.elements[elementIndex] = {
        id: elementId,
        name: elementData.name,
        locator: elementData.locator,
        value: elementData.value
      };
      await this.saveData(data);
      return this._success(page.elements[elementIndex]);
    } catch (error) {
      console.error('更新元素失败:', error);
      return this._error(error.message);
    }
  }

  async deleteElement(appId, pageId, elementId) {
    try {
      const data = await this.getData();
      const app = data.apps.find(app => app.id === appId);
      if (!app) {
        return this._error('未找到应用');
      }
      const page = app.pages.find(page => page.id === pageId);
      if (!page) {
        return this._error('未找到页面');
      }
      const elementIndex = page.elements.findIndex(element => element.id === elementId);
      if (elementIndex === -1) {
        return this._error('未找到元素');
      }
      page.elements.splice(elementIndex, 1);
      await this.saveData(data);
      return { success: true };
    } catch (error) {
      console.error('删除元素失败:', error);
      return this._error(error.message);
    }
  }

  async searchElements(appId, pageId, keyword) {
    try {
      const data = await this.getData();
      const app = data.apps.find(app => app.id === appId);
      if (!app) {
        return this._error('未找到应用');
      }
      const page = app.pages.find(page => page.id === pageId);
      if (!page) {
        return this._error('未找到页面');
      }
      if (!keyword) {
        return this._success(page.elements);
      }
      const lowerKeyword = keyword.toLowerCase();
      const results = page.elements.filter(element =>
        element.name.toLowerCase().includes(lowerKeyword) ||
        element.value.toLowerCase().includes(lowerKeyword)
      );
      return this._success(results);
    } catch (error) {
      console.error('搜索元素失败:', error);
      return this._error(error.message);
    }
  }

  async getAppStats(appId) {
    try {
      const data = await this.getData();
      const app = data.apps.find(app => app.id === appId);
      if (!app) {
        return this._error('未找到应用');
      }
      const pageCount = app.pages.length;
      let elementCount = 0;
      app.pages.forEach(page => {
        elementCount += page.elements.length;
      });
      return this._success({ pageCount, elementCount });
    } catch (error) {
      console.error('获取应用统计失败:', error);
      return this._error(error.message);
    }
  }

  async getPageStats(appId, pageId) {
    try {
      const data = await this.getData();
      const app = data.apps.find(app => app.id === appId);
      if (!app) {
        return this._error('未找到应用');
      }
      const page = app.pages.find(page => page.id === pageId);
      if (!page) {
        return this._error('未找到页面');
      }
      return this._success({ elementCount: page.elements.length });
    } catch (error) {
      console.error('获取页面统计失败:', error);
      return this._error(error.message);
    }
  }
}

module.exports = PagePackageService;

const { registerHandlers } = require('./base/handlerUtils');

function register(ipcMain, services) {
  const { pagePackageService } = services;

  registerHandlers(ipcMain, {
    'page-package:get-apps': () => pagePackageService.getApps(),
    'page-package:add-app': (appData) => pagePackageService.addApp(appData),
    'page-package:update-app': (appId, appData) => pagePackageService.updateApp(appId, appData),
    'page-package:delete-app': (appId) => pagePackageService.deleteApp(appId),
    'page-package:search-apps': (keyword) => pagePackageService.searchApps(keyword),

    'page-package:get-pages': (appId) => pagePackageService.getPages(appId),
    'page-package:add-page': (appId, name) => pagePackageService.addPage(appId, name),
    'page-package:update-page': (appId, pageId, name) => pagePackageService.updatePage(appId, pageId, name),
    'page-package:delete-page': (appId, pageId) => pagePackageService.deletePage(appId, pageId),
    'page-package:search-pages': (appId, keyword) => pagePackageService.searchPages(appId, keyword),

    'page-package:get-elements': (appId, pageId) => pagePackageService.getElements(appId, pageId),
    'page-package:add-element': (appId, pageId, elementData) => pagePackageService.addElement(appId, pageId, elementData),
    'page-package:update-element': (appId, pageId, elementId, elementData) => pagePackageService.updateElement(appId, pageId, elementId, elementData),
    'page-package:delete-element': (appId, pageId, elementId) => pagePackageService.deleteElement(appId, pageId, elementId),
    'page-package:search-elements': (appId, pageId, keyword) => pagePackageService.searchElements(appId, pageId, keyword),

    'page-package:get-app-stats': (appId) => pagePackageService.getAppStats(appId),
    'page-package:get-page-stats': (appId, pageId) => pagePackageService.getPageStats(appId, pageId)
  });
}

module.exports = { register };

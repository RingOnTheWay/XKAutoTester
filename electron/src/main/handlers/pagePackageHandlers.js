const { registerHandlers } = require('./base/handlerUtils');
const { IPC_CHANNELS } = require('../../shared/constants');

function register(ipcMain, services) {
  const { pagePackageService } = services;

  registerHandlers(ipcMain, {
    [IPC_CHANNELS.PAGE_PACKAGE_GET_APPS]: () => pagePackageService.getApps(),
    [IPC_CHANNELS.PAGE_PACKAGE_ADD_APP]: (appData) => pagePackageService.addApp(appData),
    [IPC_CHANNELS.PAGE_PACKAGE_UPDATE_APP]: (appId, appData) => pagePackageService.updateApp(appId, appData),
    [IPC_CHANNELS.PAGE_PACKAGE_DELETE_APP]: (appId) => pagePackageService.deleteApp(appId),
    [IPC_CHANNELS.PAGE_PACKAGE_SEARCH_APPS]: (keyword) => pagePackageService.searchApps(keyword),

    [IPC_CHANNELS.PAGE_PACKAGE_GET_PAGES]: (appId) => pagePackageService.getPages(appId),
    [IPC_CHANNELS.PAGE_PACKAGE_ADD_PAGE]: (appId, name) => pagePackageService.addPage(appId, name),
    [IPC_CHANNELS.PAGE_PACKAGE_UPDATE_PAGE]: (appId, pageId, name) => pagePackageService.updatePage(appId, pageId, name),
    [IPC_CHANNELS.PAGE_PACKAGE_DELETE_PAGE]: (appId, pageId) => pagePackageService.deletePage(appId, pageId),
    [IPC_CHANNELS.PAGE_PACKAGE_SEARCH_PAGES]: (appId, keyword) => pagePackageService.searchPages(appId, keyword),

    [IPC_CHANNELS.PAGE_PACKAGE_GET_ELEMENTS]: (appId, pageId) => pagePackageService.getElements(appId, pageId),
    [IPC_CHANNELS.PAGE_PACKAGE_ADD_ELEMENT]: (appId, pageId, elementData) => pagePackageService.addElement(appId, pageId, elementData),
    [IPC_CHANNELS.PAGE_PACKAGE_UPDATE_ELEMENT]: (appId, pageId, elementId, elementData) => pagePackageService.updateElement(appId, pageId, elementId, elementData),
    [IPC_CHANNELS.PAGE_PACKAGE_DELETE_ELEMENT]: (appId, pageId, elementId) => pagePackageService.deleteElement(appId, pageId, elementId),
    [IPC_CHANNELS.PAGE_PACKAGE_SEARCH_ELEMENTS]: (appId, pageId, keyword) => pagePackageService.searchElements(appId, pageId, keyword),

    [IPC_CHANNELS.PAGE_PACKAGE_GET_APP_STATS]: (appId) => pagePackageService.getAppStats(appId),
    [IPC_CHANNELS.PAGE_PACKAGE_GET_PAGE_STATS]: (appId, pageId) => pagePackageService.getPageStats(appId, pageId)
  });
}

module.exports = { register };

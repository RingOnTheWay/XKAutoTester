import { Action } from '../../core/Action.js';
import { ApiBridge } from '../../core/ApiBridge.js';
import { AppState } from '../../core/AppState.js';
import { Toast } from '../../components/toast.js';

/**
 * PagePackageController - 页面封装 Tab 控制器
 * 绑定 Model 事件到 View 渲染，绑定 DOM 事件到 Model 方法
 */
export class PagePackageController {
  #model;
  #view;
  #unbinds = [];
  #unbindModel = [];
  #destroyed = false;
  #initialized = false;

  constructor(model, view) {
    this.#model = model;
    this.#view = view;
  }

  // ─── 生命周期 ────────────────────────────────────────────

  async init() {
    if (this.#initialized) return;
    this.#initialized = true;
    this.#bindModelEvents();
    this.#bindCascadeSelects();
    this.#bindSubTabs();
    this.#bindModals();
    this.#bindApkDropZone();
    this.#bindInspectorEvent();
    await this.#model.load();
  }

  destroy() {
    this.#destroyed = true;
    this.#unbinds.forEach(fn => fn());
    this.#unbinds = [];
    this.#unbindModel.forEach(fn => fn());
    this.#unbindModel = [];
    this.#model.destroy();
  }

  // ─── Model 事件 → View 渲染 ──────────────────────────────

  #bindModelEvents() {
    const model = this.#model;
    const view = this.#view;

    this.#onModel(model, 'apps-changed', (apps) => {
      view.renderAppOptions(apps, model.getSelectedId('app'));
      view.updateButtonStates('app', !!model.selectedApp);
      // 绑定选项点击
      this.#bindOptionClicks('app');
    });

    this.#onModel(model, 'apps-count-changed', (count) => {
      view.updateBadge('app', count);
    });

    this.#onModel(model, 'pages-changed', (pages) => {
      view.renderPageOptions(pages, !!model.selectedApp, model.getSelectedId('page'));
      view.updateButtonStates('page', !!model.selectedPage);
      this.#bindOptionClicks('page');
    });

    this.#onModel(model, 'pages-count-changed', (count) => {
      view.updateBadge('page', count);
    });

    this.#onModel(model, 'elements-changed', (elements) => {
      view.renderElementOptions(elements, !!model.selectedPage, model.getSelectedId('element'));
      view.updateButtonStates('element', !!model.selectedElement);
      this.#bindOptionClicks('element');
    });

    this.#onModel(model, 'elements-count-changed', (count) => {
      view.updateBadge('element', count);
    });

    this.#onModel(model, 'selected-app-changed', (app) => {
      if (app) {
        view.setAppSelected(app.name);
        view.highlightOption('pp-app-select-wrapper', app.id);
        view.updateButtonStates('app', true);
      }
    });

    this.#onModel(model, 'selected-page-changed', (page) => {
      if (page) {
        view.setPageSelected(page.name);
        view.highlightOption('pp-page-select-wrapper', page.id);
        view.updateButtonStates('page', true);
      } else {
        view.resetPageSelect();
        view.updateButtonStates('page', false);
      }
    });

    this.#onModel(model, 'selected-element-changed', (element) => {
      if (element) {
        view.setElementSelected(element.name);
        view.highlightOption('pp-element-select-wrapper', element.id);
        view.updateButtonStates('element', true);
      } else {
        view.resetElementSelect();
        view.updateButtonStates('element', false);
      }
    });

    this.#onModel(model, 'reset-all-selects', () => {
      view.resetAllSelects();
    });

    this.#onModel(model, 'reset-page-select', () => {
      view.resetPageSelect();
    });

    this.#onModel(model, 'reset-element-select', () => {
      view.resetElementSelect();
    });

    this.#onModel(model, 'save-success', ({ type }) => {
      Toast.success(window.i18n.t('pagePackage.saveSuccess'));
      view.closeModal(type);
    });

    this.#onModel(model, 'delete-success', ({ type }) => {
      Toast.success(window.i18n.t('pagePackage.deleteSuccess'));
      // MVC: 删除后保留当前层级卡片展开, 显示"请选择 xxx" 占位
      view.resetForDelete(type);
      view.updateButtonStates(type, false);
    });

    this.#onModel(model, 'error', ({ source, message, error }) => {
      if (message) {
        const i18nKey = `pagePackage.${message}`;
        const text = window.i18n.t(i18nKey) || message;
        if (source === 'saveApp' || source === 'savePage' || source === 'saveElement') {
          Toast.error(text);
        } else if (source === 'deleteItem') {
          Toast.error(text);
        }
      }
      if (error) console.error(`[PagePackage] ${source} error:`, error);
    });
  }

  // ─── Cascade Select Events ────────────────────────────────────

  #bindCascadeSelects() {
    const types = ['app', 'page', 'element'];
    types.forEach(type => {
      const wrapper = this.#view.getCascadeSelectWrapper(type);
      if (!wrapper) return;

      const select = wrapper.querySelector('.cascade-select');
      const selected = wrapper.querySelector('.cascade-select__selected');
      const searchInput = wrapper.querySelector('.cascade-select__search');
      const identifyBtn = wrapper.querySelector('.cascade-select__btn.identify');
      const addBtn = wrapper.querySelector('.cascade-select__btn.add');
      const editBtn = wrapper.querySelector('.cascade-select__btn.edit');
      const deleteBtn = wrapper.querySelector('.cascade-select__btn.delete');
      const card = wrapper.closest('.pp-card');

      // 展开/收起下拉
      if (selected) {
        const handler = (e) => {
          if (select.classList.contains('disabled')) return;
          // MVC: classList 通过 view.toggleCascadeSelectOpen
          this.#view.toggleCascadeSelectOpen(select, card);
          // 关闭其他下拉
          this.#view.closeOtherCascadeSelects(select);
        };
        selected.addEventListener('click', handler);
        this.#unbinds.push(() => selected.removeEventListener('click', handler));
      }

      // 搜索过滤
      if (searchInput) {
        const handler = (e) => {
          const keyword = e.target.value.toLowerCase();
          const filtered = this.#model.filterOptions(type, keyword);
          const selectedId = this.#model.getSelectedId(type);
          this.#view.renderFilteredOptions(type, filtered, selectedId);
          this.#bindOptionClicks(type);
        };
        searchInput.addEventListener('input', handler);
        this.#unbinds.push(() => searchInput.removeEventListener('input', handler));
      }

      // Inspector 按钮
      if (identifyBtn) {
        const handler = (e) => {
          e.stopPropagation();
          this.handleOpenInspector();
        };
        identifyBtn.addEventListener('click', handler);
        this.#unbinds.push(() => identifyBtn.removeEventListener('click', handler));
      }

      // 新增按钮
      if (addBtn) {
        const handler = (e) => {
          e.stopPropagation();
          this.handleShowAddModal(type);
        };
        addBtn.addEventListener('click', handler);
        this.#unbinds.push(() => addBtn.removeEventListener('click', handler));
      }

      // 编辑按钮
      if (editBtn) {
        const handler = (e) => {
          e.stopPropagation();
          this.handleShowEditModal(type);
        };
        editBtn.addEventListener('click', handler);
        this.#unbinds.push(() => editBtn.removeEventListener('click', handler));
      }

      // 删除按钮
      if (deleteBtn) {
        const handler = (e) => {
          e.stopPropagation();
          this.handleConfirmDelete(type);
        };
        deleteBtn.addEventListener('click', handler);
        this.#unbinds.push(() => deleteBtn.removeEventListener('click', handler));
      }

      // 外部点击关闭
      const outsideHandler = (e) => {
        if (!wrapper.contains(e.target)) {
          // MVC: classList 通过 view.closeCascadeSelect
          this.#view.closeCascadeSelect(select, card);
        }
      };
      document.addEventListener('click', outsideHandler);
      this.#unbinds.push(() => document.removeEventListener('click', outsideHandler));
    });
  }

  #bindOptionClicks(type) {
    const wrapper = this.#view.getCascadeSelectWrapper(type);
    if (!wrapper) return;
    const optionsContainer = wrapper.querySelector('.cascade-select__options');
    if (!optionsContainer) return;

    optionsContainer.querySelectorAll('.cascade-select__option:not(.empty)').forEach(option => {
      const handler = () => {
        const id = option.dataset.id;
        this.handleSelect(type, id);
      };
      option.addEventListener('click', handler);
      // 选项是动态渲染的，不需要单独清理（随 innerHTML 重建）
    });
  }

  // ─── Sub Tab Events ────────────────────────────────────────────

  #bindSubTabs() {
    this.#view.els.ppTabs.forEach(tab => {
      const handler = () => {
        const targetTab = tab.dataset.tab;
        const targetContent = this.#view.getTabContent(targetTab);
        // MVC: classList active 通过 view.setActiveSubTab
        this.#view.setActiveSubTab(tab, targetContent);
      };
      tab.addEventListener('click', handler);
      this.#unbinds.push(() => tab.removeEventListener('click', handler));
    });
  }

  // ─── Modal Events ──────────────────────────────────────────────

  #bindModals() {
    // App modal
    const appOverlay = this.#view.els.appModalOverlay;
    if (appOverlay) {
      const closeBtn = appOverlay.querySelector('.pp-modal-close');
      const cancelBtn = appOverlay.querySelector('.pp-modal-cancel');
      if (closeBtn) {
        const handler = () => this.#view.closeModal('app');
        closeBtn.addEventListener('click', handler);
        this.#unbinds.push(() => closeBtn.removeEventListener('click', handler));
      }
      if (cancelBtn) {
        const handler = () => this.#view.closeModal('app');
        cancelBtn.addEventListener('click', handler);
        this.#unbinds.push(() => cancelBtn.removeEventListener('click', handler));
      }
    }
    if (this.#view.els.appSaveBtn) {
      const handler = () => this.handleSaveApp();
      this.#view.els.appSaveBtn.addEventListener('click', handler);
      this.#unbinds.push(() => this.#view.els.appSaveBtn.removeEventListener('click', handler));
    }

    // Page modal
    const pageOverlay = this.#view.els.pageModalOverlay;
    if (pageOverlay) {
      const closeBtn = pageOverlay.querySelector('.pp-modal-close');
      const cancelBtn = pageOverlay.querySelector('.pp-modal-cancel');
      if (closeBtn) {
        const handler = () => this.#view.closeModal('page');
        closeBtn.addEventListener('click', handler);
        this.#unbinds.push(() => closeBtn.removeEventListener('click', handler));
      }
      if (cancelBtn) {
        const handler = () => this.#view.closeModal('page');
        cancelBtn.addEventListener('click', handler);
        this.#unbinds.push(() => cancelBtn.removeEventListener('click', handler));
      }
    }
    if (this.#view.els.pageSaveBtn) {
      const handler = () => this.handleSavePage();
      this.#view.els.pageSaveBtn.addEventListener('click', handler);
      this.#unbinds.push(() => this.#view.els.pageSaveBtn.removeEventListener('click', handler));
    }

    // Element modal
    const elementOverlay = this.#view.els.elementModalOverlay;
    if (elementOverlay) {
      const closeBtn = elementOverlay.querySelector('.pp-modal-close');
      const cancelBtn = elementOverlay.querySelector('.pp-modal-cancel');
      if (closeBtn) {
        const handler = () => this.#view.closeModal('element');
        closeBtn.addEventListener('click', handler);
        this.#unbinds.push(() => closeBtn.removeEventListener('click', handler));
      }
      if (cancelBtn) {
        const handler = () => this.#view.closeModal('element');
        cancelBtn.addEventListener('click', handler);
        this.#unbinds.push(() => cancelBtn.removeEventListener('click', handler));
      }
    }
    if (this.#view.els.elementSaveBtn) {
      const handler = () => this.handleSaveElement();
      this.#view.els.elementSaveBtn.addEventListener('click', handler);
      this.#unbinds.push(() => this.#view.els.elementSaveBtn.removeEventListener('click', handler));
    }
  }

  // ─── APK Drop Zone ─────────────────────────────────────────────

  #bindApkDropZone() {
    const dropZone = this.#view.els.apkDropZone;
    if (!dropZone) return;

    const handleApkFile = async (filePath) => {
      if (!filePath.toLowerCase().endsWith('.apk')) {
        this.#view.setApkDropZoneState('error');
        // MVC: textContent 通过 view.setApkErrorMessage
        this.#view.setApkErrorMessage(window.i18n.t('pagePackage.apkInvalidFile'));
        setTimeout(() => this.#view.resetApkDropZone(), 3000);
        return;
      }

      this.#view.setApkDropZoneState('loading');
      const result = await this.#model.parseApk(filePath);

      // wrapper 已在 success=false 时抛错；model.parseApk 捕获后返回 {success:false,error}
      // 此处只判断 data 字段，失败时 result.data 为 undefined 走 else 分支
      if (result.data) {
        this.#view.fillApkData(result.data);
        this.#view.setApkDropZoneState('success');
        setTimeout(() => this.#view.resetApkDropZone(), 2000);
      } else {
        this.#view.setApkDropZoneState('error');
        // MVC: textContent 通过 view.setApkErrorMessage
        this.#view.setApkErrorMessage(result.error || window.i18n.t('pagePackage.apkParseFailed'));
        setTimeout(() => this.#view.resetApkDropZone(), 3000);
      }
    };

    // 拖拽
    const dragoverHandler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      // MVC: classList drag-over 通过 view
      this.#view.setApkDropZoneDragOver(true);
    };
    const dragleaveHandler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      // MVC: classList drag-over 通过 view
      this.#view.setApkDropZoneDragOver(false);
    };
    const dropHandler = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const files = e.dataTransfer.files;
      if (files.length === 0) { this.#view.resetApkDropZone(); return; }
      const filePath = await this.#model.getFilePath(files[0]);
      await handleApkFile(filePath);
    };
    const clickHandler = async () => {
      const result = await this.#model.selectApkFile();
      if (result?.filePaths?.length > 0) {
        await handleApkFile(result.filePaths[0]);
      }
    };

    dropZone.addEventListener('dragover', dragoverHandler);
    dropZone.addEventListener('dragleave', dragleaveHandler);
    dropZone.addEventListener('drop', dropHandler);
    dropZone.addEventListener('click', clickHandler);
    this.#unbinds.push(() => {
      dropZone.removeEventListener('dragover', dragoverHandler);
      dropZone.removeEventListener('dragleave', dragleaveHandler);
      dropZone.removeEventListener('drop', dropHandler);
      dropZone.removeEventListener('click', clickHandler);
    });
  }

  // ─── Inspector Event ───────────────────────────────────────────

  #bindInspectorEvent() {
    const handler = (event) => {
      const { locatorType, locatorValue } = event.detail;
      this.#view.fillLocatorFromInspector(locatorType, locatorValue);
    };
    document.addEventListener('inspector-element-selected', handler);
    this.#unbinds.push(() => document.removeEventListener('inspector-element-selected', handler));
  }

  // ─── Handler Methods ───────────────────────────────────────────

  async handleSelect(type, id) {
    switch (type) {
      case 'app':
        this.#model.selectApp(id);
        await this.#model.loadPages(id);
        this.#view.expandCard('page');
        break;
      case 'page':
        this.#model.selectPage(id);
        await this.#model.loadElements(this.#model.selectedApp.id, id);
        this.#view.expandCard('element');
        break;
      case 'element':
        this.#model.selectElement(id);
        this.#view.updateBadge('element', this.#model.elements.length);
        break;
    }
  }

  handleShowAddModal(type) {
    this.#model.setEditing(false, type);
    switch (type) {
      case 'app':
        this.#view.openAppModal(window.i18n.t('pagePackage.newApp'));
        break;
      case 'page':
        if (!this.#model.selectedApp) {
          Toast.warning(window.i18n.t('pagePackage.selectAppFirst'));
          return;
        }
        this.#view.openPageModal(window.i18n.t('pagePackage.newPage'));
        break;
      case 'element':
        if (!this.#model.selectedPage) {
          Toast.warning(window.i18n.t('pagePackage.selectPageFirst'));
          return;
        }
        this.#view.openElementModal(window.i18n.t('pagePackage.newElement'));
        break;
    }
  }

  handleShowEditModal(type) {
    this.#model.setEditing(true, type);
    switch (type) {
      case 'app':
        if (!this.#model.selectedApp) return;
        this.#view.openAppModal(window.i18n.t('pagePackage.editApp'), this.#model.selectedApp);
        break;
      case 'page':
        if (!this.#model.selectedPage) return;
        this.#view.openPageModal(window.i18n.t('pagePackage.editPage'), this.#model.selectedPage.name);
        break;
      case 'element':
        if (!this.#model.selectedElement) return;
        this.#view.openElementModal(window.i18n.t('pagePackage.editElement'), this.#model.selectedElement);
        break;
    }
  }

  async handleSaveApp() {
    const appData = this.#view.collectAppFormData();
    await this.#model.saveApp(appData);
  }

  async handleSavePage() {
    const name = this.#view.collectPageFormData();
    await this.#model.savePage(name);
  }

  async handleSaveElement() {
    const elementData = this.#view.collectElementFormData();
    await this.#model.saveElement(elementData);
  }

  handleConfirmDelete(type) {
    let itemName, message;
    switch (type) {
      case 'app':
        if (!this.#model.selectedApp) return;
        itemName = this.#model.selectedApp.name;
        message = window.i18n.t('pagePackage.deleteAppConfirm', { name: itemName });
        break;
      case 'page':
        if (!this.#model.selectedPage) return;
        itemName = this.#model.selectedPage.name;
        message = window.i18n.t('pagePackage.deletePageConfirm', { name: itemName });
        break;
      case 'element':
        if (!this.#model.selectedElement) return;
        itemName = this.#model.selectedElement.name;
        message = window.i18n.t('pagePackage.deleteElementConfirm', { name: itemName });
        break;
    }
    this.#view.showConfirmModal(
      window.i18n.t('pagePackage.deleteConfirm'),
      message,
      async () => await this.#model.deleteItem(type)
    );
  }

  async handleOpenInspector() {
    if (!this.#model.selectedApp) {
      Toast.error(window.i18n.t('inspector.noAppSelected'));
      return;
    }
    const app = this.#model.apps.find(a => a.id === this.#model.selectedApp.id);
    if (!app || !app.packageName || !app.activityName) {
      Toast.error(window.i18n.t('inspector.noAppInfo'));
      return;
    }

    // 需要设备选择 - 通过 AppState 获取或请求
    let deviceName;
    try {
      deviceName = await this.#requestDeviceForInspector();
    } catch (e) {
      return;
    }

    const noReset = await this.#view.showResetConfirmModal();
    const inspectorModal = window.__XKAT_INSPECTOR_MODAL__;
    if (inspectorModal) {
      await inspectorModal.open(deviceName, app.packageName, app.activityName, noReset);
    }
  }

  /**
   * 请求设备选择（用于 Inspector）
   * MVC: DeviceSelectionModal 实例化委托给 view.showDeviceSelection
   */
  async #requestDeviceForInspector() {
    return await this.#view.showDeviceSelection({ mode: 'inspector' });
  }

  // ─── Tab Lifecycle Hooks ───────────────────────────────────────

  /**
   * Tab 激活时调用
   */
  onTabActivated() {
    if (this.#initialized) {
      this.#view.updateBadge('app', this.#model.apps.length);
    }
    // 未初始化时由 App.initTab 负责，不在此重复调用 init()
  }

  /**
   * Tab 离开时调用
   */
  onTabDeactivated() {
    this.#model.resetState();
  }

  // ─── Helper ────────────────────────────────────────────────────

  #onModel(emitter, event, handler) {
    const unsub = emitter.on(event, handler);
    this.#unbindModel.push(unsub);
  }
}

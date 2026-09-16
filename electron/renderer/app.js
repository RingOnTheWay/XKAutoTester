/**
 * App - MVC 应用引导入口 (组合根)
 *
 * R26 候选③: 巨型引导拆分。原 805 行单类拆为:
 * - bootstrap/I18nCoordinator  i18n 初始化与文本刷新
 * - bootstrap/HtmlLoader       tab/组件 HTML 加载 + 图标
 * - ui/CustomSelects           自定义下拉框机制
 * - ui/WindowControls          窗口控制 + 透明区域点击穿透
 * - ui/SaveConfirmController   保存确认弹窗状态机
 *
 * App 只保留: 模态框登记、Tab 注册/生命周期、导航切换、全局事件接线。
 * 公开方法 (getIconHtml / initializeCustomSelects / showSaveConfirmModal /
 * updateUIText / changeLanguage / initCustomSelect / positionDropdown /
 * preventScroll) 保留为委托 —— 各 tab 的 view 与 controller、components
 * 下组件的既有引用面零改动。
 */
import { AppState } from './core/AppState.js';
import { ApiBridge } from './core/ApiBridge.js';
import { Action } from './core/Action.js';
import { EventEmitter } from './core/EventEmitter.js';
import { Modal } from './components/modal.js';
import { ProgressIndicator } from './components/progress-indicator.js';
import DeviceSelectionModal from './components/device-selection-modal.js';
import { I18nCoordinator } from './bootstrap/i18n.js';
import { HtmlLoader } from './bootstrap/loader.js';
import { CustomSelects } from './ui/custom-select.js';
import { WindowControls } from './ui/window-controls.js';
import { SaveConfirmController } from './ui/save-confirm.js';
import { createTestCaseTab } from './tabs/test-case/index.js';
import { createPagePackageTab } from './tabs/page-package/index.js';
import { createSettingsTab } from './tabs/settings/index.js';
import { createAndroidConnectionTab } from './tabs/android-connection/index.js';
import { createTestExecutionTab } from './tabs/test-execution/index.js';

// 导出核心模块供 Tab 模块使用
export { AppState, ApiBridge, Action, EventEmitter };

export class App {
  #tabs = new Map();
  #appState;
  #initialized = false;
  #i18n = new I18nCoordinator();
  #loader = new HtmlLoader();
  #selects = new CustomSelects();
  #windowControls;
  #saveConfirm;

  constructor() {
    this.#appState = AppState.instance;
    this.modals = null;
    this.inspectorModal = null;
    this.progressIndicator = null;
    this.#windowControls = new WindowControls({
      onCloseWindow: () => {
        if (this.inspectorModal) {
          this.inspectorModal.close();
        }
      },
    });
  }

  /**
   * 初始化应用
   */
  async init() {
    if (this.#initialized) return;

    try {
      // 1. 初始化 i18n
      await this.#i18n.initialize();

      // 加载 Tab HTML（import.meta.glob 注入到各 page 容器）
      await this.#loader.loadTabHtml();

      // 2. 加载组件 HTML
      await this.#loader.loadComponents();

      // 3. 创建模态框
      this.#initModals();

      // 4. 初始化 Inspector
      this.inspectorModal = await this.#loader.initInspector();

      // 5. 创建进度指示器
      this.progressIndicator = new ProgressIndicator();

      // 6. 初始化图标
      this.#loader.initializeIcons();

      // 7. 初始化自定义下拉框
      this.#selects.initializeCustomSelects();

      // 8. 设置事件监听（含窗口控制）
      this.#setupEventListeners();

      // 9. 加载共享配置到 AppState
      const config = await ApiBridge.call('getConfig');
      if (config) {
        this.#appState.batchUpdate({
          config,
          locale: config?.APP_SETTINGS?.language || 'zh-CN',
        });
      }

      // 10. 注册所有 Tab
      this.registerTab('test-case', createTestCaseTab());
      this.registerTab('page-package', createPagePackageTab());
      this.registerTab('settings', createSettingsTab());
      this.registerTab('android-connection', createAndroidConnectionTab());
      this.registerTab('test-execution', createTestExecutionTab());

      // 11. 初始化即时 Tab
      await this.initTab('test-case');
      await this.initTab('settings');
      await this.initTab('test-execution');
      // page-package / android-connection 延迟初始化

      // 12. 设置 window 全局变量
      window.__XKAT_APP__ = this;
      window.__XKAT_MODALS__ = this.modals;
      window.__XKAT_INSPECTOR_MODAL__ = this.inspectorModal;
      window.__XKAT_DEVICE_SELECTION_MODAL__ = DeviceSelectionModal;
      window.__XKAT_PROGRESS_INDICATOR__ = this.progressIndicator;

      // 13. 首次翻译所有 data-i18n 元素（含移到 body 的下拉选项）
      this.updateUIText();
      this.updateComponentTranslations();

      this.#initialized = true;
    } catch (err) {
      console.error('[App] Initialization failed:', err);
    }
  }

  // ==================== 模态框登记 ====================

  #initModals() {
    this.modals = {
      plan: new Modal({ id: 'modal-overlay' }),
      rename: new Modal({ id: 'rename-modal-overlay' }),
      device: new Modal({ id: 'device-modal-overlay' }),
      editDeviceId: new Modal({ id: 'edit-device-id-modal-overlay' }),
      port: new Modal({ id: 'port-modal-overlay' }),
      confirm: new Modal({ id: 'confirm-modal-overlay' }),
      saveConfirm: new Modal({ id: 'save-confirm-modal-overlay' }),
      update: new Modal({ id: 'update-modal-overlay' }),
      ppApp: new Modal({ id: 'pp-app-modal-overlay' }),
      ppPage: new Modal({ id: 'pp-page-modal-overlay' }),
      ppElement: new Modal({ id: 'pp-element-modal-overlay' }),
      report: new Modal({ id: 'report-modal-overlay' }),
      controlParams: new Modal({ id: 'control-params-overlay' }),
      scheduledPlan: new Modal({ id: 'scheduled-plan-modal-overlay' }),
    };
    this.#saveConfirm = new SaveConfirmController(this.modals.saveConfirm);
  }

  // ==================== 事件监听接线 ====================

  #setupEventListeners() {
    this.#windowControls.setup();

    // 全局点击 - 关闭下拉框
    document.addEventListener('click', () => {
      const hadOpenDropdowns = document.querySelectorAll('.custom-select__options.show').length > 0;
      document.querySelectorAll('.custom-select__options.show').forEach((opt) => {
        opt.classList.remove('show');
      });
      if (hadOpenDropdowns) {
        const mainContent = document.querySelector('.main-content');
        if (mainContent) {
          mainContent.classList.remove('dropdown-open');
          mainContent.removeEventListener('wheel', this.#selects.preventScroll, {
            passive: false,
          });
        }
      }
    });

    // 导航标签切换
    document.querySelectorAll('.nav-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        this.switchTab(tab);
      });
    });

    // 确认弹窗按钮
    const confirmModalCancelBtn = document.getElementById('confirm-modal-cancel-btn');
    if (confirmModalCancelBtn) {
      confirmModalCancelBtn.addEventListener('click', () => {
        // P1-8: 有取消回调时交由委托层处理 (settings document 委托 / 各 tab once 监听),
        // app 层不再无条件 close, 避免抢先关闭导致回调 Promise 永不 resolve
        if (typeof window.__XKAT_CONFIRM_CANCEL_CALLBACK__ === 'function') {
          return;
        }
        this.modals.confirm.close();
      });
    }

    const confirmModalConfirmBtn = document.getElementById('confirm-modal-confirm-btn');
    if (confirmModalConfirmBtn) {
      confirmModalConfirmBtn.addEventListener('click', () => {
        // P1-8: 有确认回调 (android-connection Promise / page-package 全局通道) 时
        // 不抢先 close, 由回调链统一处理, 消除多机制竞态
        if (typeof window.__XKAT_CONFIRM_CALLBACK__ === 'function') {
          return;
        }
        this.modals.confirm.close();
      });
    }

    // 保存确认弹窗按钮
    const saveConfirmCancelBtn = document.getElementById('save-confirm-cancel-btn');
    if (saveConfirmCancelBtn) {
      saveConfirmCancelBtn.addEventListener('click', () => {
        this.hideSaveConfirmModal();
      });
    }

    const saveConfirmDiscardBtn = document.getElementById('save-confirm-discard-btn');
    if (saveConfirmDiscardBtn) {
      saveConfirmDiscardBtn.addEventListener('click', () => {
        this.executeSaveConfirmDiscard();
      });
    }

    const saveConfirmSaveBtn = document.getElementById('save-confirm-save-btn');
    if (saveConfirmSaveBtn) {
      saveConfirmSaveBtn.addEventListener('click', () => {
        this.executeSaveConfirmSave();
      });
    }
  }

  // ==================== 委托: i18n ====================

  changeLanguage(language) {
    return this.#i18n.changeLanguage(language);
  }

  updateUIText(scope = document) {
    return this.#i18n.updateUIText(scope);
  }

  updateComponentTranslations() {
    return this.#i18n.updateComponentTranslations();
  }

  updateLanguageSelectorText(language) {
    return this.#i18n.updateLanguageSelectorText(language);
  }

  // ==================== 委托: 图标 ====================

  getIconHtml(iconName, style = '') {
    return this.#loader.getIconHtml(iconName, style);
  }

  initializeComponentIcons() {
    return this.#loader.initializeComponentIcons();
  }

  // ==================== 委托: 自定义下拉框 ====================

  initializeCustomSelects() {
    return this.#selects.initializeCustomSelects();
  }

  initCustomSelect(selectId) {
    return this.#selects.initCustomSelect(selectId);
  }

  positionDropdown(selected, options) {
    return this.#selects.positionDropdown(selected, options);
  }

  /** wheel 拦截 handler (滚动锁) — 兼容既有引用面 */
  get preventScroll() {
    return this.#selects.preventScroll;
  }

  // ==================== 委托: 保存确认弹窗 ====================

  showSaveConfirmModal(title, message, onSave, onDiscard) {
    return this.#saveConfirm.show(title, message, onSave, onDiscard);
  }

  hideSaveConfirmModal() {
    return this.#saveConfirm.hide();
  }

  executeSaveConfirmSave() {
    return this.#saveConfirm.executeSave();
  }

  executeSaveConfirmDiscard() {
    return this.#saveConfirm.executeDiscard();
  }

  // ==================== Tab 切换 ====================

  switchTab(tabElement) {
    const targetPage = tabElement.getAttribute('data-tab');
    document.querySelectorAll('.nav-tab').forEach((t) => t.classList.remove('active'));
    tabElement.classList.add('active');
    document.querySelectorAll('.page').forEach((page) => page.classList.remove('active'));
    const pageElement = document.getElementById(targetPage);
    if (pageElement) pageElement.classList.add('active');
    this.onTabSwitch(targetPage);
  }

  // ==================== Tab 管理 ====================

  registerTab(tabId, tabModule) {
    this.#tabs.set(tabId, { ...tabModule, initialized: false });
  }

  async initTab(tabId) {
    const tab = this.#tabs.get(tabId);
    if (!tab || tab.initialized) return;

    if (tab.controller) {
      await tab.controller.init();
    }
    tab.initialized = true;
  }

  destroyTab(tabId) {
    const tab = this.#tabs.get(tabId);
    if (!tab) return;

    if (tab.controller?.destroy) {
      tab.controller.destroy();
    }
    tab.initialized = false;
  }

  getTab(tabId) {
    return this.#tabs.get(tabId);
  }

  get appState() {
    return this.#appState;
  }

  onTabSwitch(tabId) {
    const tab = this.#tabs.get(tabId);
    if (tab && !tab.initialized) {
      this.initTab(tabId);
    }
    if (tab?.controller?.onTabActivated) {
      tab.controller.onTabActivated();
    }
    for (const [id, t] of this.#tabs) {
      if (id !== tabId && t.controller?.onTabDeactivated) {
        t.controller.onTabDeactivated();
      }
    }
  }
}

// 自动初始化
const app = new App();
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => app.init());
} else {
  app.init();
}

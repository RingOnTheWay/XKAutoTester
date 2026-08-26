/**
 * App - MVC 应用引导入口
 * Phase 4: 完整迁移，script.js 将被删除
 */
import { AppState } from './core/AppState.js';
import { ApiBridge } from './core/ApiBridge.js';
import { Action } from './core/Action.js';
import { EventEmitter } from './core/EventEmitter.js';
import { Icons } from './icons.js';
import { Modal } from './components/modal.js';
import { InspectorModal } from './components/inspector.js';
import { ProgressIndicator } from './components/progress-indicator.js';
import { Toast } from './components/toast.js';
import { DeviceCascadeSelect } from './components/device-cascade-select.js';
import DeviceSelectionModal from './components/device-selection-modal.js';
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

  constructor() {
    this.#appState = AppState.instance;
    this.modals = null;
    this.inspectorModal = null;
    this.progressIndicator = null;
    this.saveConfirmOnSave = null;
    this.saveConfirmOnDiscard = null;
    this.preventScroll = (e) => {
      const mainContent = document.querySelector('.main-content');
      if (mainContent && mainContent.classList.contains('dropdown-open')) {
        e.preventDefault();
      }
    };
  }

  /**
   * 初始化应用
   */
  async init() {
    if (this.#initialized) return;

    try {
      // 1. 初始化 i18n
      await this.#initializeI18n();

      // 加载 Tab HTML（import.meta.glob 注入到各 page 容器）
      await this.#loadTabHtml();

      // 2. 加载组件 HTML
      await this.#loadComponents();

      // 3. 创建模态框
      this.#initModals();

      // 4. 初始化 Inspector
      await this.#initInspector();

      // 5. 创建进度指示器
      this.progressIndicator = new ProgressIndicator();

      // 6. 初始化图标
      this.#initializeIcons();

      // 7. 初始化自定义下拉框
      this.#initializeCustomSelects();

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
      console.log('[App] Phase 4: full initialization complete');
    } catch (err) {
      console.error('[App] Initialization failed:', err);
    }
  }

  // ==================== i18n ====================

  async #initializeI18n() {
    try {
      if (window.electronAPI?.i18n) {
        window.i18n = window.electronAPI.i18n;
        // 不强制 changeLanguage('zh-CN')：preload 已根据 config.APP_SETTINGS.language 初始化为用户偏好语言
      }
    } catch (error) {
      console.error('初始化i18next失败:', error);
    }
  }

  changeLanguage(language) {
    if (window.i18n) {
      window.i18n.changeLanguage(language).then(() => {
        this.updateUIText();
        this.updateComponentTranslations();
        this.updateLanguageSelectorText(language);
      }).catch(error => {
        console.error('语言切换失败:', error);
      });
    }
  }

  updateLanguageSelectorText(language) {
    const selectedSpan = document.querySelector('#custom-language-selected .custom-select__text');
    if (selectedSpan) {
      const languageNames = { 'zh-CN': '简体中文', 'en-US': 'English' };
      selectedSpan.textContent = languageNames[language] || language;
    }
  }

  updateUIText(scope = document) {
    if (!window.i18n) return;
    const root = scope || document;
    root.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (key) {
        const translation = window.i18n.t(key);
        if (translation) el.textContent = translation;
      }
    });
    root.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (key) {
        const translation = window.i18n.t(key);
        if (translation) el.placeholder = translation;
      }
    });
    root.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      if (key) {
        const translation = window.i18n.t(key);
        if (translation) el.title = translation;
      }
    });
  }

  updateComponentTranslations() {
    const container = document.getElementById('confirm-modal-container');
    if (container) this.updateUIText(container);
  }

  // ==================== 组件加载 ====================

  async #loadComponents() {
    try {
      const container = document.getElementById('confirm-modal-container');
      if (container) {
        const response = await fetch('components/confirm-modal.html');
        if (response.ok) {
          container.innerHTML = await response.text();
        } else {
          console.error('加载组件失败: components/confirm-modal.html');
        }
      }
      this.initializeComponentIcons();
      this.updateComponentTranslations();
    } catch (error) {
      console.error('加载组件失败:', error);
    }
  }

  async #loadTabHtml() {
    // 加载 5 tab HTML 片段 (兼容 npm start loadFile + npm run dev server)
    const tabs = [
      'test-execution',
      'page-package',
      'test-case',
      'android-connection',
      'settings',
    ];
    await Promise.all(
      tabs.map(async (name) => {
        try {
          const response = await fetch(`tabs/${name}/tab.html`);
          if (!response.ok) {
            console.error(`加载 tab HTML 失败: tabs/${name}/tab.html (${response.status})`);
            return;
          }
          const html = await response.text();
          const container = document.getElementById(name);
          if (container) {
            container.innerHTML = html;
          } else {
            console.error(`Tab container not found: ${name}`);
          }
        } catch (err) {
          console.error(`加载 tab HTML 异常: ${name}`, err);
        }
      })
    );
  }

  // ==================== 模态框 ====================

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
      scheduledPlan: new Modal({ id: 'scheduled-plan-modal-overlay' })
    };
  }

  // ==================== Inspector ====================

  async #initInspector() {
    try {
      const container = document.getElementById('inspector-modal-container');
      if (container) {
        const response = await fetch('components/inspector-modal.html');
        container.innerHTML = await response.text();
        this.#initializeIcons();
      }
      this.inspectorModal = new InspectorModal();
    } catch (error) {
      console.error('Failed to initialize Inspector:', error);
    }
  }

  // ==================== 图标 ====================

  #initializeIcons() {
    const iconElements = document.querySelectorAll('.svg-icon[data-icon]');
    iconElements.forEach(element => {
      const iconName = element.getAttribute('data-icon');
      if (Icons[iconName]) {
        element.innerHTML = Icons[iconName];
      }
    });
  }

  getIconHtml(iconName, style = '') {
    if (!Icons[iconName]) return '';
    return `<span class="svg-icon" data-icon="${iconName}" style="${style}">${Icons[iconName]}</span>`;
  }

  initializeComponentIcons() {
    document.querySelectorAll('#confirm-modal-container .svg-icon[data-icon]').forEach(element => {
      const iconName = element.getAttribute('data-icon');
      if (Icons[iconName]) element.innerHTML = Icons[iconName];
    });
  }

  // ==================== 自定义下拉框 ====================

  #initializeCustomSelects() {
    const selectWrappers = document.querySelectorAll('.custom-select-wrapper[data-options]');

    selectWrappers.forEach(wrapper => {
      if (wrapper.querySelector('.custom-select')) return;

      const optionsData = wrapper.getAttribute('data-options');
      if (!optionsData) return;

      try {
        const options = JSON.parse(optionsData);
        const selectId = wrapper.id;

        const selectHtml = `
          <div class="custom-select" id="${selectId}-select">
            <div class="custom-select__selected" id="${selectId}-selected">
              <span class="custom-select__text"></span>
            </div>
            <div class="custom-select__options" id="${selectId}-options">
              ${options.map(opt => `
                <div class="custom-select__option${opt.default ? ' selected' : ''}" data-value="${opt.value}">
                  <span data-i18n="${opt.label}">${window.i18n.t(opt.label)}</span>
                </div>
              `).join('')}
            </div>
          </div>
        `;

        wrapper.innerHTML = selectHtml;

        const selectedSpan = wrapper.querySelector('.custom-select__text');
        const defaultOption = options.find(opt => opt.default);
        if (selectedSpan && defaultOption) {
          selectedSpan.textContent = window.i18n.t(defaultOption.label);
          selectedSpan.setAttribute('data-i18n', defaultOption.label);
        }

        this.initCustomSelect(`${selectId}-select`);
      } catch (e) {
        console.error('解析下拉框选项失败:', e);
      }
    });
  }

  initCustomSelect(selectId) {
    const select = document.getElementById(selectId);
    if (!select) return;

    if (select.dataset.initialized === 'true') return;
    select.dataset.initialized = 'true';

    const selected = select.querySelector('.custom-select__selected');
    const options = select.querySelector('.custom-select__options');

    if (!selected || !options) return;

    document.body.appendChild(options);

    const self = this;

    selected.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.custom-select__options.show').forEach(opt => {
        if (opt !== options) {
          opt.classList.remove('show');
        }
      });

      const mainContent = document.querySelector('.main-content');
      const isShowing = options.classList.contains('show');
      if (!isShowing) {
        self.positionDropdown(selected, options);
        options.classList.add('show');
        if (mainContent) {
          mainContent.classList.add('dropdown-open');
          mainContent.addEventListener('wheel', self.preventScroll, { passive: false });
        }
      } else {
        options.classList.remove('show');
        if (mainContent) {
          mainContent.classList.remove('dropdown-open');
          mainContent.removeEventListener('wheel', self.preventScroll, { passive: false });
        }
      }
    });

    const optionItems = options.querySelectorAll('.custom-select__option');
    optionItems.forEach(option => {
      option.addEventListener('click', (e) => {
        e.stopPropagation();
        const displayText = option.querySelector('span')?.textContent || option.textContent;

        const selectedSpan = selected.querySelector('.custom-select__text');
        if (selectedSpan) {
          selectedSpan.textContent = displayText;
        }

        optionItems.forEach(opt => opt.classList.remove('selected'));
        option.classList.add('selected');

        options.classList.remove('show');
        const mainContent = document.querySelector('.main-content');
        if (mainContent) {
          mainContent.classList.remove('dropdown-open');
          mainContent.removeEventListener('wheel', self.preventScroll, { passive: false });
        }
      });
    });
  }

  positionDropdown(selected, options) {
    const rect = selected.getBoundingClientRect();

    if (rect.width === 0 && rect.height === 0) {
      options.style.top = '50%';
      options.style.left = '50%';
      options.style.width = '200px';
      options.style.transform = 'translate(-50%, -50%)';
      return;
    }

    const viewportHeight = window.innerHeight;
    options.classList.add('show');
    const actualOptionsHeight = options.offsetHeight || 200;

    const gap = 4;
    const threshold = 2;
    let top;

    const spaceBelow = viewportHeight - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    const requiredSpaceBelow = actualOptionsHeight * threshold;

    if (spaceAbove >= actualOptionsHeight && spaceBelow < requiredSpaceBelow) {
      top = rect.top - actualOptionsHeight - gap;
    } else if (spaceBelow >= actualOptionsHeight) {
      top = rect.bottom + gap;
    } else if (spaceAbove >= actualOptionsHeight) {
      top = rect.top - actualOptionsHeight - gap;
    } else {
      if (spaceBelow >= spaceAbove) {
        top = rect.bottom + gap;
      } else {
        top = Math.max(10, rect.top - actualOptionsHeight - gap);
      }
    }

    options.style.top = `${top}px`;
    options.style.left = `${rect.left}px`;
    options.style.width = `${rect.width}px`;
    options.style.transform = 'none';
  }

  // ==================== Tab 切换 ====================

  switchTab(tabElement) {
    const targetPage = tabElement.getAttribute('data-tab');
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    tabElement.classList.add('active');
    document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
    const pageElement = document.getElementById(targetPage);
    if (pageElement) pageElement.classList.add('active');
    this.onTabSwitch(targetPage);
  }

  // ==================== 事件监听 ====================

  #setupEventListeners() {
    this.#setupTransparentAreaClickThrough();

    // 全局点击 - 关闭下拉框
    document.addEventListener('click', () => {
      const hadOpenDropdowns = document.querySelectorAll('.custom-select__options.show').length > 0;
      document.querySelectorAll('.custom-select__options.show').forEach(opt => {
        opt.classList.remove('show');
      });
      if (hadOpenDropdowns) {
        const mainContent = document.querySelector('.main-content');
        if (mainContent) {
          mainContent.classList.remove('dropdown-open');
          mainContent.removeEventListener('wheel', this.preventScroll, { passive: false });
        }
      }
    });

    // 导航标签切换
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.switchTab(tab);
      });
    });

    // 确认弹窗按钮
    const confirmModalCancelBtn = document.getElementById('confirm-modal-cancel-btn');
    if (confirmModalCancelBtn) {
      confirmModalCancelBtn.addEventListener('click', () => {
        // P1-8: 有取消回调时交由委托层处理 (settings document 委托 / 各 tab once 监听),
        // app.js 不再无条件 close, 避免抢先关闭导致回调 Promise 永不 resolve
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

    // 窗口控制按钮
    this.#setupWindowControls();
  }

  #setupWindowControls() {
    const minimizeBtn = document.getElementById('window-minimize');
    const maximizeBtn = document.getElementById('window-maximize');
    const closeBtn = document.getElementById('window-close');

    const updateMaximizeButton = (isMaximized) => {
      if (maximizeBtn) {
        if (isMaximized) {
          maximizeBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="8" y="8" width="12" height="12" rx="2"/>
              <path d="M4 16V6a2 2 0 0 1 2-2h10"/>
            </svg>
          `;
          maximizeBtn.title = (window.i18n && window.i18n.t('windowControls.restore')) || '还原';
          document.body.classList.add('window-maximized');
        } else {
          maximizeBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="4" y="4" width="16" height="16" rx="2"/>
            </svg>
          `;
          maximizeBtn.title = (window.i18n && window.i18n.t('windowControls.maximize')) || '最大化';
          document.body.classList.remove('window-maximized');
        }
      }
    };

    if (minimizeBtn) {
      minimizeBtn.addEventListener('click', () => {
        window.electronAPI.minimizeWindow();
      });
    }

    if (maximizeBtn) {
      maximizeBtn.addEventListener('click', async () => {
        const isMaximized = await window.electronAPI.maximizeWindow();
        updateMaximizeButton(isMaximized);
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        if (this.inspectorModal) {
          this.inspectorModal.close();
        }
        window.electronAPI.closeWindow();
      });
    }

    window.electronAPI.isWindowMaximized().then(isMaximized => {
      updateMaximizeButton(isMaximized);
    }).catch(error => {
      console.error('获取窗口最大化状态失败:', error);
    });

    window.electronAPI.onWindowMaximized((isMaximized) => {
      updateMaximizeButton(isMaximized);
    });
  }

  // ==================== 保存确认弹窗 ====================

  showSaveConfirmModal(title, message, onSave, onDiscard) {
    const titleElement = document.getElementById('save-confirm-modal-title');
    const messageElement = document.getElementById('save-confirm-modal-message');

    if (titleElement) titleElement.textContent = title;
    if (messageElement) messageElement.textContent = message;

    this.saveConfirmOnSave = onSave;
    this.saveConfirmOnDiscard = onDiscard;
    this.modals.saveConfirm.open();
  }

  hideSaveConfirmModal() {
    this.modals.saveConfirm.close();
    this.saveConfirmOnSave = null;
    this.saveConfirmOnDiscard = null;
  }

  executeSaveConfirmSave() {
    if (this.saveConfirmOnSave) {
      this.saveConfirmOnSave();
    }
    this.hideSaveConfirmModal();
  }

  executeSaveConfirmDiscard() {
    if (this.saveConfirmOnDiscard) {
      this.saveConfirmOnDiscard();
    }
    this.hideSaveConfirmModal();
  }

  // ==================== 透明区域点击穿透 ====================

  #setupTransparentAreaClickThrough() {
    let isIgnoringMouseEvents = false;
    let isDragging = false;
    const appElement = document.getElementById('app');
    const appNav = document.querySelector('.app-nav');

    if (!appElement) {
      console.error('找不到 #app 元素');
      return;
    }

    const isInTransparentArea = (x, y) => {
      const rect = appElement.getBoundingClientRect();
      return x < rect.left || x > rect.right || y < rect.top || y > rect.bottom;
    };

    const isInDraggableArea = (x, y) => {
      if (!appNav) return false;

      const navRect = appNav.getBoundingClientRect();
      if (x < navRect.left || x > navRect.right || y < navRect.top || y > navRect.bottom) {
        return false;
      }

      const noDragElements = appNav.querySelectorAll('.nav-left, .nav-tabs, .nav-right');
      for (const el of noDragElements) {
        const elRect = el.getBoundingClientRect();
        if (x >= elRect.left && x <= elRect.right && y >= elRect.top && y <= elRect.bottom) {
          return false;
        }
      }

      return true;
    };

    // P1-10: mousemove 用 rAF 节流 — 原实现每次鼠标移动都执行 getBoundingClientRect
    // + 可能的 IPC (setIgnoreMouseEvents/moveWindowDrag), 透明区域高频移动时 IPC 往返密集。
    let rafPending = false;
    let lastMouseX = 0;
    let lastMouseY = 0;
    let lastScreenX = 0;
    let lastScreenY = 0;

    const checkMousePosition = (e) => {
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
      lastScreenX = e.screenX;
      lastScreenY = e.screenY;
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(() => {
        rafPending = false;
        const x = lastMouseX;
        const y = lastMouseY;
        const inTransparent = isInTransparentArea(x, y);

        if (inTransparent && !isIgnoringMouseEvents) {
          isIgnoringMouseEvents = true;
          window.electronAPI.setIgnoreMouseEvents(true, { forward: true });
        } else if (!inTransparent && isIgnoringMouseEvents) {
          isIgnoringMouseEvents = false;
          window.electronAPI.setIgnoreMouseEvents(false);
        }

        if (isDragging) {
          window.electronAPI.moveWindowDrag(lastScreenX, lastScreenY);
        }
      });
    };

    document.addEventListener('mousemove', checkMousePosition);

    document.addEventListener('mousedown', (e) => {
      if (isInDraggableArea(e.clientX, e.clientY)) {
        isDragging = true;
        window.electronAPI.startWindowDrag(e.screenX, e.screenY);
        e.preventDefault();
      }
    });

    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        window.electronAPI.endWindowDrag();
      }
    });

    document.addEventListener('mouseleave', () => {
      if (!isIgnoringMouseEvents) {
        isIgnoringMouseEvents = true;
        window.electronAPI.setIgnoreMouseEvents(true, { forward: true });
      }
    });

    document.addEventListener('mouseenter', (e) => {
      if (isIgnoringMouseEvents && !isInTransparentArea(e.clientX, e.clientY)) {
        isIgnoringMouseEvents = false;
        window.electronAPI.setIgnoreMouseEvents(false);
      }
    });
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

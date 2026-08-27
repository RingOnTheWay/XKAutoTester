/**
 * PagePackageView - 页面封装 Tab View 层
 * 纯 DOM 操作，不调用 API，不管理状态
 * 通过 window.i18n / Toast 访问全局资源
 */
import { Icons } from '../../icons.js';
import { escapeHtml as escapeHtmlUtil } from '../../core/utils/html.js';
export class PagePackageView {
  constructor() {
    this.els = {
      // 三级卡片
      appCard: document.getElementById('pp-app-card'),
      pageCard: document.getElementById('pp-page-card'),
      elementCard: document.getElementById('pp-element-card'),
      // 徽章
      appBadge: document.getElementById('pp-app-badge'),
      appCount: document.getElementById('pp-app-count'),
      pageBadge: document.getElementById('pp-page-badge'),
      pageCount: document.getElementById('pp-page-count'),
      elementBadge: document.getElementById('pp-element-badge'),
      elementCount: document.getElementById('pp-element-count'),
      // 级联选择器 wrapper
      appSelectWrapper: document.getElementById('pp-app-select-wrapper'),
      pageSelectWrapper: document.getElementById('pp-page-select-wrapper'),
      elementSelectWrapper: document.getElementById('pp-element-select-wrapper'),
      // 子 Tab
      ppTabs: document.querySelectorAll('.pp-tab'),
      ppContents: document.querySelectorAll('.pp-content'),
      // 应用弹窗
      appModalOverlay: document.getElementById('pp-app-modal-overlay'),
      appModalTitle: document.getElementById('pp-app-modal-title'),
      appInput: document.getElementById('pp-app-input'),
      platformWrapper: document.getElementById('pp-platform-wrapper'),
      packageInput: document.getElementById('pp-package-input'),
      activityInput: document.getElementById('pp-activity-input'),
      appSaveBtn: document.getElementById('pp-app-save-btn'),
      apkDropZone: document.getElementById('apk-drop-zone'),
      apkDropLoading: document.getElementById('apk-drop-loading'),
      apkDropSuccess: document.getElementById('apk-drop-success'),
      apkDropError: document.getElementById('apk-drop-error'),
      apkErrorMessage: document.getElementById('apk-error-message'),
      // 页面弹窗
      pageModalOverlay: document.getElementById('pp-page-modal-overlay'),
      pageModalTitle: document.getElementById('pp-page-modal-title'),
      pageInput: document.getElementById('pp-page-input'),
      pageSaveBtn: document.getElementById('pp-page-save-btn'),
      // 元素弹窗
      elementModalOverlay: document.getElementById('pp-element-modal-overlay'),
      elementModalTitle: document.getElementById('pp-element-modal-title'),
      elementNameInput: document.getElementById('pp-element-name-input'),
      elementLocatorWrapper: document.getElementById('pp-element-locator-wrapper'),
      elementValueInput: document.getElementById('pp-element-value-input'),
      elementSaveBtn: document.getElementById('pp-element-save-btn'),
      // Inspector 按钮
      inspectorBtn: document.getElementById('pp-inspector-btn'),
    };
  }

  // ─── Icon Helper ───────────────────────────────────────────────

  getIconHtml(iconName, style = '') {
    if (!Icons[iconName]) return '';
    return `<span class="svg-icon" data-icon="${iconName}" style="${style}">${Icons[iconName]}</span>`;
  }

  // ─── HTML 转义 (对齐 R10 映射表版, 防级联下拉名称 XSS) ──────────

  escapeHtml(str) {
    // P2-5: 统一实现 (renderer/core/utils/html.js)
    return escapeHtmlUtil(str);
  }

  // ─── Cascade Select Rendering ──────────────────────────────────

  renderAppOptions(apps, selectedId) {
    const wrapper = this.els.appSelectWrapper;
    if (!wrapper) return;
    const optionsContainer = wrapper.querySelector('.cascade-select__options');
    if (!optionsContainer) return;

    if (!apps || apps.length === 0) {
      optionsContainer.innerHTML = `<div class="cascade-select__option empty">${window.i18n.t('pagePackage.noApps')}</div>`;
      return;
    }

    optionsContainer.innerHTML = apps.map(app => `
      <div class="cascade-select__option ${selectedId === app.id ? 'selected' : ''}" data-id="${this.escapeHtml(app.id)}">${this.escapeHtml(app.name)}</div>
    `).join('');
  }

  renderPageOptions(pages, hasSelectedApp, selectedId) {
    const wrapper = this.els.pageSelectWrapper;
    if (!wrapper) return;
    const select = wrapper.querySelector('.cascade-select');
    const optionsContainer = wrapper.querySelector('.cascade-select__options');
    if (!select || !optionsContainer) return;

    if (hasSelectedApp) {
      select.classList.remove('disabled');
    } else {
      select.classList.add('disabled');
    }

    if (!pages || pages.length === 0) {
      optionsContainer.innerHTML = `<div class="cascade-select__option empty">${window.i18n.t('pagePackage.noPages')}</div>`;
      return;
    }

    optionsContainer.innerHTML = pages.map(page => `
      <div class="cascade-select__option ${selectedId === page.id ? 'selected' : ''}" data-id="${this.escapeHtml(page.id)}">${this.escapeHtml(page.name)}</div>
    `).join('');
  }

  renderElementOptions(elements, hasSelectedPage, selectedId) {
    const wrapper = this.els.elementSelectWrapper;
    if (!wrapper) return;
    const select = wrapper.querySelector('.cascade-select');
    const optionsContainer = wrapper.querySelector('.cascade-select__options');
    if (!select || !optionsContainer) return;

    if (hasSelectedPage) {
      select.classList.remove('disabled');
    } else {
      select.classList.add('disabled');
    }

    if (!elements || elements.length === 0) {
      optionsContainer.innerHTML = `<div class="cascade-select__option empty">${window.i18n.t('pagePackage.noElements')}</div>`;
      return;
    }

    optionsContainer.innerHTML = elements.map(element => `
      <div class="cascade-select__option ${selectedId === element.id ? 'selected' : ''}" data-id="${this.escapeHtml(element.id)}">${this.escapeHtml(element.name)}</div>
    `).join('');
  }

  renderFilteredOptions(type, items, selectedId) {
    const wrapperId = `pp-${type}-select-wrapper`;
    const wrapper = document.getElementById(wrapperId);
    if (!wrapper) return;
    const optionsContainer = wrapper.querySelector('.cascade-select__options');
    if (!optionsContainer) return;

    if (items.length === 0) {
      optionsContainer.innerHTML = `<div class="cascade-select__option empty">${window.i18n.t('pagePackage.noResults')}</div>`;
      return;
    }

    optionsContainer.innerHTML = items.map(item => `
      <div class="cascade-select__option ${selectedId === item.id ? 'selected' : ''}" data-id="${this.escapeHtml(item.id)}">${this.escapeHtml(item.name)}</div>
    `).join('');
  }

  // ─── Selection Display ─────────────────────────────────────────

  setAppSelected(appName) {
    const wrapper = this.els.appSelectWrapper;
    if (!wrapper) return;
    const textSpan = wrapper.querySelector('.cascade-select__text');
    if (textSpan) {
      textSpan.textContent = appName;
      textSpan.classList.remove('placeholder');
    }
    wrapper.querySelector('.cascade-select')?.classList.remove('open');
    this.els.appCard?.classList.add('selected');
  }

  setPageSelected(pageName) {
    const wrapper = this.els.pageSelectWrapper;
    if (!wrapper) return;
    const textSpan = wrapper.querySelector('.cascade-select__text');
    if (textSpan) {
      textSpan.textContent = pageName;
      textSpan.classList.remove('placeholder');
    }
    wrapper.querySelector('.cascade-select')?.classList.remove('open');
    this.els.pageCard?.classList.add('selected');
  }

  setElementSelected(elementName) {
    const wrapper = this.els.elementSelectWrapper;
    if (!wrapper) return;
    const textSpan = wrapper.querySelector('.cascade-select__text');
    if (textSpan) {
      textSpan.textContent = elementName;
      textSpan.classList.remove('placeholder');
    }
    wrapper.querySelector('.cascade-select')?.classList.remove('open');
    this.els.elementCard?.classList.add('selected');
  }

  highlightOption(wrapperId, selectedId) {
    const wrapper = document.getElementById(wrapperId);
    if (!wrapper) return;
    wrapper.querySelectorAll('.cascade-select__option').forEach(opt => {
      opt.classList.toggle('selected', opt.dataset.id === selectedId);
    });
  }

  // ─── Reset Selects ─────────────────────────────────────────────

  resetAppSelect() {
    const wrapper = this.els.appSelectWrapper;
    if (!wrapper) return;
    const textSpan = wrapper.querySelector('.cascade-select__text');
    if (textSpan) {
      textSpan.textContent = window.i18n.t('pagePackage.selectApp');
      textSpan.classList.add('placeholder');
    }
    wrapper.querySelectorAll('.cascade-select__option').forEach(opt => opt.classList.remove('selected'));
    this.els.appCard?.classList.remove('selected');
    this.els.pageCard?.classList.remove('selected');
    this.els.elementCard?.classList.remove('selected');
  }

  resetPageSelect() {
    const wrapper = this.els.pageSelectWrapper;
    if (!wrapper) return;
    const textSpan = wrapper.querySelector('.cascade-select__text');
    if (textSpan) {
      textSpan.textContent = window.i18n.t('pagePackage.selectPage');
      textSpan.classList.add('placeholder');
    }
    wrapper.querySelector('.cascade-select')?.classList.add('disabled');
    wrapper.querySelectorAll('.cascade-select__option').forEach(opt => opt.classList.remove('selected'));
    this.els.pageCard?.classList.remove('selected');
    this.els.elementCard?.classList.remove('selected');
  }

  resetElementSelect() {
    const wrapper = this.els.elementSelectWrapper;
    if (!wrapper) return;
    const textSpan = wrapper.querySelector('.cascade-select__text');
    if (textSpan) {
      textSpan.textContent = window.i18n.t('pagePackage.selectElement');
      textSpan.classList.add('placeholder');
    }
    wrapper.querySelector('.cascade-select')?.classList.add('disabled');
    wrapper.querySelectorAll('.cascade-select__option').forEach(opt => opt.classList.remove('selected'));
    this.els.elementCard?.classList.remove('selected');
  }

  resetAllSelects() {
    this.resetAppSelect();
    this.resetPageSelect();
    this.resetElementSelect();
    this.updateBadge('app', 0);
    this.updateBadge('page', 0);
    this.updateBadge('element', 0);
  }

  /**
   * 删除后重置 select 状态 (保留当前层级卡片展开, 不 disabled 当前层级 select)
   * MVC: 删除后 UI 状态归 view, 与常规 reset 区分
   * @param {string} type - 'app' | 'page' | 'element'
   */
  resetForDelete(type) {
    // 当前层级: 仅清文本 + 移除选项选中态, 保留卡片展开 + select 可用
    const clearCurrent = (wrapper) => {
      if (!wrapper) return;
      const textSpan = wrapper.querySelector('.cascade-select__text');
      if (textSpan) {
        textSpan.textContent = window.i18n.t(`pagePackage.select${type.charAt(0).toUpperCase() + type.slice(1)}`);
        textSpan.classList.add('placeholder');
      }
      wrapper.querySelectorAll('.cascade-select__option').forEach(opt => opt.classList.remove('selected'));
    };

    if (type === 'app') {
      clearCurrent(this.els.appSelectWrapper);
      this.els.appCard?.classList.remove('selected');
      // 子层级: page/element reset (disabled + collapse, 因为无父选中)
      this.resetPageSelect();
      this.resetElementSelect();
    } else if (type === 'page') {
      clearCurrent(this.els.pageSelectWrapper);
      this.els.pageCard?.classList.remove('selected');
      // 子层级: element reset
      this.resetElementSelect();
    } else if (type === 'element') {
      clearCurrent(this.els.elementSelectWrapper);
      this.els.elementCard?.classList.remove('selected');
    }
  }

  // ─── Card Expand/Collapse ──────────────────────────────────────

  expandCard(type) {
    const card = document.getElementById(`pp-${type}-card`);
    if (card) {
      card.classList.remove('collapsed');
      card.classList.add('expanded');
    }
  }

  collapseCard(type) {
    const card = document.getElementById(`pp-${type}-card`);
    if (card) {
      card.classList.remove('expanded');
      card.classList.add('collapsed');
    }
  }

  // ─── Badge ─────────────────────────────────────────────────────

  updateBadge(type, count) {
    const badge = document.getElementById(`pp-${type}-badge`);
    const countSpan = document.getElementById(`pp-${type}-count`);
    if (badge && countSpan) {
      if (count > 0) {
        badge.style.display = '';
        countSpan.textContent = count;
      } else {
        badge.style.display = 'none';
      }
    }
  }

  // ─── Button States ─────────────────────────────────────────────

  updateButtonStates(type, hasSelection) {
    const wrapper = document.getElementById(`pp-${type}-select-wrapper`);
    if (!wrapper) return;
    const editBtn = wrapper.querySelector('.cascade-select__btn.edit');
    const deleteBtn = wrapper.querySelector('.cascade-select__btn.delete');
    if (editBtn) editBtn.disabled = !hasSelection;
    if (deleteBtn) deleteBtn.disabled = !hasSelection;
  }

  // ─── Sub Tab Switch ────────────────────────────────────────────

  switchSubTab(targetTab) {
    this.els.ppTabs.forEach(t => t.classList.remove('active'));
    this.els.ppContents.forEach(c => c.classList.remove('active'));
    const targetContent = document.getElementById(`pp-${targetTab}-content`);
    if (targetContent) targetContent.classList.add('active');
  }

  // ─── Modal: App ────────────────────────────────────────────────

  openAppModal(title, appData = null) {
    if (this.els.appModalTitle) this.els.appModalTitle.textContent = title;
    if (this.els.appInput) this.els.appInput.value = appData?.name || '';
    if (this.els.packageInput) this.els.packageInput.value = appData?.packageName || '';
    if (this.els.activityInput) this.els.activityInput.value = appData?.activityName || '';
    // 初始化 custom-select 组件（通过 app 桥接）
    if (window.__XKAT_APP__?.initializeCustomSelects) {
      window.__XKAT_APP__.initializeCustomSelects();
    }
    this.setCustomSelectValue('pp-platform-wrapper', appData?.platform || 'android');
    this.resetApkDropZone();
    window.__XKAT_MODALS__?.ppApp?.open();
    this.els.appInput?.focus();
  }

  closeAppModal() {
    window.__XKAT_MODALS__?.ppApp?.close();
  }

  // ─── Modal: Page ───────────────────────────────────────────────

  openPageModal(title, pageName = '') {
    if (this.els.pageModalTitle) this.els.pageModalTitle.textContent = title;
    if (this.els.pageInput) this.els.pageInput.value = pageName;
    window.__XKAT_MODALS__?.ppPage?.open();
    this.els.pageInput?.focus();
  }

  closePageModal() {
    window.__XKAT_MODALS__?.ppPage?.close();
  }

  // ─── Modal: Element ────────────────────────────────────────────

  openElementModal(title, elementData = null) {
    if (this.els.elementModalTitle) this.els.elementModalTitle.textContent = title;
    if (this.els.elementNameInput) this.els.elementNameInput.value = elementData?.name || '';
    if (this.els.elementValueInput) this.els.elementValueInput.value = elementData?.value || '';
    // 初始化 custom-select 组件（通过 app 桥接）
    if (window.__XKAT_APP__?.initializeCustomSelects) {
      window.__XKAT_APP__.initializeCustomSelects();
    }
    this.setCustomSelectValue('pp-element-locator-wrapper', elementData?.locator || 'id');
    window.__XKAT_MODALS__?.ppElement?.open();
    this.els.elementNameInput?.focus();
  }

  closeElementModal() {
    window.__XKAT_MODALS__?.ppElement?.close();
  }

  closeModal(type) {
    switch (type) {
      case 'app': this.closeAppModal(); break;
      case 'page': this.closePageModal(); break;
      case 'element': this.closeElementModal(); break;
    }
  }

  // ─── APK Drop Zone ─────────────────────────────────────────────

  resetApkDropZone() {
    const dropZone = this.els.apkDropZone;
    if (!dropZone) return;
    const content = dropZone.querySelector('.apk-drop-zone-content');
    if (content) content.classList.remove('hidden');
    if (this.els.apkDropLoading) this.els.apkDropLoading.classList.add('hidden');
    if (this.els.apkDropSuccess) this.els.apkDropSuccess.classList.add('hidden');
    if (this.els.apkDropError) this.els.apkDropError.classList.add('hidden');
    dropZone.classList.remove('drag-over');
  }

  setApkDropZoneState(state) {
    const dropZone = this.els.apkDropZone;
    if (!dropZone) return;
    const content = dropZone.querySelector('.apk-drop-zone-content');
    if (content) content.classList.toggle('hidden', state !== 'default');
    if (this.els.apkDropLoading) this.els.apkDropLoading.classList.toggle('hidden', state !== 'loading');
    if (this.els.apkDropSuccess) this.els.apkDropSuccess.classList.toggle('hidden', state !== 'success');
    if (this.els.apkDropError) this.els.apkDropError.classList.toggle('hidden', state !== 'error');
    dropZone.classList.remove('drag-over');
  }

  fillApkData(data) {
    if (data.packageName && this.els.packageInput) {
      this.els.packageInput.value = data.packageName;
    }
    if (data.activityName && this.els.activityInput) {
      this.els.activityInput.value = data.activityName;
    }
    if (data.applicationLabel && this.els.appInput && !this.els.appInput.value.trim()) {
      this.els.appInput.value = data.applicationLabel;
    }
  }

  // ─── Inspector ─────────────────────────────────────────────────

  fillLocatorFromInspector(locatorType, locatorValue) {
    this.openElementModal(window.i18n.t('pagePackage.newElement'));
    this.setCustomSelectValue('pp-element-locator-wrapper', locatorType);
    if (this.els.elementValueInput) this.els.elementValueInput.value = locatorValue;
    if (this.els.elementNameInput && !this.els.elementNameInput.value) {
      this.els.elementNameInput.focus();
    }
  }

  // ─── Custom Select Helpers ─────────────────────────────────────

  getCustomSelectValue(wrapperId) {
    const optionsEl = document.getElementById(`${wrapperId}-options`);
    if (!optionsEl) return wrapperId === 'pp-platform-wrapper' ? 'android' : 'id';
    const selectedOption = optionsEl.querySelector('.custom-select__option.selected');
    return selectedOption ? selectedOption.dataset.value : (wrapperId === 'pp-platform-wrapper' ? 'android' : 'id');
  }

  setCustomSelectValue(wrapperId, value) {
    const wrapper = document.getElementById(wrapperId);
    if (!wrapper) return;
    const optionsEl = document.getElementById(`${wrapperId}-options`);
    if (optionsEl) {
      optionsEl.querySelectorAll('.custom-select__option').forEach(opt => {
        opt.classList.toggle('selected', opt.dataset.value === value);
      });
    }
    const selectedSpan = wrapper.querySelector('.custom-select__text');
    const selectedOption = optionsEl?.querySelector(`.custom-select__option[data-value="${value}"]`);
    if (selectedOption && selectedSpan) {
      const spanEl = selectedOption.querySelector('span');
      selectedSpan.textContent = spanEl ? spanEl.textContent : selectedOption.textContent;
    }
  }

  // ─── Confirm Modal ─────────────────────────────────────────────

  showConfirmModal(title, message, onConfirm) {
    const titleEl = document.getElementById('confirm-modal-title');
    const messageEl = document.getElementById('confirm-modal-message');
    if (titleEl) titleEl.textContent = title;
    if (messageEl) messageEl.textContent = message;

    // P1-8: 收敛为全局回调通道 — 不再 cloneNode 按钮。
    // cloneNode 会销毁 android-connection 等已绑定的局部监听 (其 Promise 永不 resolve → modal 挂起),
    // 确认/取消统一由 app.js 入口 + settings document 委托驱动。
    window.__XKAT_CONFIRM_CALLBACK__ = async () => {
      window.__XKAT_CONFIRM_CALLBACK__ = null;
      if (typeof onConfirm === 'function') onConfirm();
    };

    window.__XKAT_MODALS__?.confirm?.open();
  }

  /**
   * Inspector 重置确认弹窗（返回 Promise）
   *
   * 语义:
   * - 确认 (清除数据启动)      → resolve(false)  → noReset = false
   * - 取消 / Esc / 点击遮罩     → resolve(true)   → noReset = true (不清除数据启动)
   */
  showResetConfirmModal() {
    return new Promise((resolve) => {
      const titleEl = document.getElementById('confirm-modal-title');
      const messageEl = document.getElementById('confirm-modal-message');
      if (titleEl) titleEl.textContent = window.i18n.t('inspector.resetConfirmTitle');
      if (messageEl) messageEl.textContent = window.i18n.t('inspector.resetConfirmQuestion');

      const overlay = document.getElementById('confirm-modal-overlay');
      let resolved = false;
      const resolveOnce = (value) => {
        if (!resolved) { resolved = true; resolve(value); }
      };

      const cbRef = () => {
        cleanup();
        resolveOnce(false);
      };
      // 取消回调: 取消 = 不清除数据启动 (noReset=true), 关闭弹窗并继续流程
      const cancelRef = () => {
        cleanup();
        window.__XKAT_MODALS__?.confirm?.close();
        resolveOnce(true);
      };

      // P1-8/P2-2: 全局回调通道替代 cloneNode (消除监听销毁竞态),
      // 且 cleanup 统一移除 esc/overlay 监听 (修复 overlay 监听累积泄漏)
      const cleanup = () => {
        document.removeEventListener('keydown', escHandler);
        if (overlay) overlay.removeEventListener('click', overlayClickHandler);
        if (window.__XKAT_CONFIRM_CALLBACK__ === cbRef) {
          window.__XKAT_CONFIRM_CALLBACK__ = null;
        }
        if (window.__XKAT_CONFIRM_CANCEL_CALLBACK__ === cancelRef) {
          window.__XKAT_CONFIRM_CANCEL_CALLBACK__ = null;
        }
      };

      const escHandler = (e) => { if (e.key === 'Escape') { cleanup(); resolveOnce(true); } };
      const overlayClickHandler = (e) => {
        if (e.target === overlay) {
          cleanup();
          window.__XKAT_MODALS__?.confirm?.close();
          resolveOnce(true);
        }
      };
      document.addEventListener('keydown', escHandler);
      if (overlay) overlay.addEventListener('click', overlayClickHandler);

      window.__XKAT_CONFIRM_CALLBACK__ = cbRef;
      window.__XKAT_CONFIRM_CANCEL_CALLBACK__ = cancelRef;

      window.__XKAT_MODALS__?.confirm?.open();
    });
  }

  // ─── Form Data Collection ──────────────────────────────────────

  collectAppFormData() {
    return {
      name: this.els.appInput?.value?.trim() || '',
      platform: this.getCustomSelectValue('pp-platform-wrapper') || 'android',
      packageName: this.els.packageInput?.value?.trim() || '',
      activityName: this.els.activityInput?.value?.trim() || '',
    };
  }

  collectPageFormData() {
    return this.els.pageInput?.value?.trim() || '';
  }

  collectElementFormData() {
    return {
      name: this.els.elementNameInput?.value?.trim() || '',
      locator: this.getCustomSelectValue('pp-element-locator-wrapper') || 'id',
      value: this.els.elementValueInput?.value?.trim() || '',
    };
  }

  // ─── 级联选择器 / 子 Tab 访问桥（Controller → View 迁移） ───

  /**
   * 获取指定类型的级联选择器 wrapper
   * @param {'app'|'page'|'element'} type
   * @returns {Element|null}
   */
  getCascadeSelectWrapper(type) {
    const key = `${type}SelectWrapper`;
    return this.els[key] || null;
  }

  /**
   * 关闭除指定 select 外所有打开的级联下拉
   * @param {Element|null} exceptSelect - 不需要关闭的 select 元素
   */
  closeOtherCascadeSelects(exceptSelect = null) {
    document.querySelectorAll('.cascade-select.open').forEach(s => {
      if (s !== exceptSelect) {
        s.classList.remove('open');
        const otherCard = s.closest('.pp-card');
        if (otherCard) otherCard.classList.remove('dropdown-open');
      }
    });
  }

  /**
   * 获取指定 tab id 对应的 content 元素
   * @param {string} tabId
   * @returns {Element|null}
   */
  getTabContent(tabId) {
    return document.getElementById(`pp-${tabId}-content`);
  }

  /**
   * 切换级联选择器的 open 状态（同时同步 card dropdown-open）
   * MVC: classList 管理归 view
   * @param {Element} select - .cascade-select 元素
   * @param {Element|null} card - 所属 .pp-card 元素
   * @returns {boolean} 切换后是否为打开
   */
  toggleCascadeSelectOpen(select, card) {
    if (!select) return false;
    const isOpen = select.classList.toggle('open');
    if (card) card.classList.toggle('dropdown-open', isOpen);
    return isOpen;
  }

  /**
   * 关闭级联选择器（移除 open + dropdown-open）
   * MVC: classList 管理归 view
   * @param {Element} select - .cascade-select 元素
   * @param {Element|null} card - 所属 .pp-card 元素
   */
  closeCascadeSelect(select, card) {
    if (!select) return;
    select.classList.remove('open');
    if (card) card.classList.remove('dropdown-open');
  }

  /**
   * 切换子 tab 的 active 状态（清除其他 tab/contents 的 active）
   * MVC: classList active 管理归 view
   * @param {Element} activeTab - 被点击的 tab 元素
   * @param {Element} targetContent - 目标 content 元素
   */
  setActiveSubTab(activeTab, targetContent) {
    this.els.ppTabs.forEach(t => t.classList.remove('active'));
    if (activeTab) activeTab.classList.add('active');
    this.els.ppContents.forEach(c => c.classList.remove('active'));
    if (targetContent) targetContent.classList.add('active');
  }

  /**
   * 设置 APK 错误消息文本
   * MVC: textContent 写入归 view
   * @param {string} message - 错误消息
   */
  setApkErrorMessage(message) {
    if (this.els.apkErrorMessage) {
      this.els.apkErrorMessage.textContent = message;
    }
  }

  /**
   * 设置 APK 拖拽区 drag-over 状态
   * MVC: classList drag-over 归 view
   * @param {boolean} isDragOver - 是否处于 drag-over 状态
   */
  setApkDropZoneDragOver(isDragOver) {
    const dropZone = this.els.apkDropZone;
    if (!dropZone) return;
    if (isDragOver) {
      dropZone.classList.add('drag-over');
    } else {
      dropZone.classList.remove('drag-over');
    }
  }

  /**
   * 显示设备选择弹窗 (封装 DeviceSelectionModal)
   * MVC: UI 组件实例化归 view,与 test-execution/test-case 一致
   * @param {Object} options - { mode: 'select' | 'inspector' | 'test' }
   * @returns {Promise<string|null>} 选中的 deviceId
   */
  async showDeviceSelection(options) {
    const { default: DeviceSelectionModal } = await import('../../components/device-selection-modal.js');
    const modal = new DeviceSelectionModal();
    return await modal.show(options);
  }
}

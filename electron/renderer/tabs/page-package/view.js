/**
 * PagePackageView - 页面封装 Tab View 层
 * 纯 DOM 操作，不调用 API，不管理状态
 * 通过 window.i18n / Toast 访问全局资源
 */
import { Icons } from '../../icons.js';
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
      <div class="cascade-select__option ${selectedId === app.id ? 'selected' : ''}" data-id="${app.id}">${app.name}</div>
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
      <div class="cascade-select__option ${selectedId === page.id ? 'selected' : ''}" data-id="${page.id}">${page.name}</div>
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
      <div class="cascade-select__option ${selectedId === element.id ? 'selected' : ''}" data-id="${element.id}">${element.name}</div>
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
      <div class="cascade-select__option ${selectedId === item.id ? 'selected' : ''}" data-id="${item.id}">${item.name}</div>
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
    this.collapseCard('page');
    this.collapseCard('element');
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
    this.collapseCard('page');
    this.collapseCard('element');
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
    this.collapseCard('element');
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
        badge.style.display = 'block';
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

    const confirmBtn = document.getElementById('confirm-modal-confirm-btn');
    const cancelBtn = document.getElementById('confirm-modal-cancel-btn');

    // 克隆按钮清除旧事件
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    newConfirmBtn.addEventListener('click', () => {
      window.__XKAT_MODALS__?.confirm?.close();
      onConfirm();
    });

    const newCancelBtn = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
    newCancelBtn.addEventListener('click', () => {
      window.__XKAT_MODALS__?.confirm?.close();
    });

    window.__XKAT_MODALS__?.confirm?.open();
  }

  /**
   * Inspector 重置确认弹窗（返回 Promise）
   */
  showResetConfirmModal() {
    return new Promise((resolve) => {
      const titleEl = document.getElementById('confirm-modal-title');
      const messageEl = document.getElementById('confirm-modal-message');
      if (titleEl) titleEl.textContent = window.i18n.t('inspector.resetConfirmTitle');
      if (messageEl) messageEl.textContent = window.i18n.t('inspector.resetConfirmQuestion');

      let resolved = false;
      const resolveOnce = (value) => {
        if (!resolved) { resolved = true; resolve(value); }
      };

      const escHandler = (e) => { if (e.key === 'Escape') resolveOnce(true); };
      document.addEventListener('keydown', escHandler);

      const overlayClickHandler = (e) => {
        if (e.target === document.getElementById('confirm-modal-overlay')) resolveOnce(true);
      };
      document.getElementById('confirm-modal-overlay')?.addEventListener('click', overlayClickHandler);

      const confirmBtn = document.getElementById('confirm-modal-confirm-btn');
      const cancelBtn = document.getElementById('confirm-modal-cancel-btn');

      const newConfirmBtn = confirmBtn.cloneNode(true);
      confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
      newConfirmBtn.addEventListener('click', () => {
        document.removeEventListener('keydown', escHandler);
        window.__XKAT_MODALS__?.confirm?.close();
        resolveOnce(false);
      });

      const newCancelBtn = cancelBtn.cloneNode(true);
      cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
      newCancelBtn.addEventListener('click', () => {
        document.removeEventListener('keydown', escHandler);
        window.__XKAT_MODALS__?.confirm?.close();
        resolveOnce(true);
      });

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
}

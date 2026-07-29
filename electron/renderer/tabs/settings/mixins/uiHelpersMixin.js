/**
 * UI Helpers Mixin - 通用 UI 辅助、配置渲染、确认弹窗、下拉工具
 *
 * 从 SettingsView 提取，通过 Object.assign 绑定到原型。
 */

export const uiHelpersMixin = {
  // ─── Config Rendering ──────────────────────────────────────────

  renderConfig(config) {
    if (!config) return;
    const settings = config.APP_SETTINGS || {};

    // 暗色模式
    if (this.els.darkModeToggle) {
      this.els.darkModeToggle.checked = !!settings.dark_mode;
    }

    // 主题色
    const themeColor = settings.theme_color || '#4CAF50';
    this.applyThemeColor(themeColor);
    if (this.els.themeColorHex) {
      this.els.themeColorHex.value = themeColor;
    }

    // 默认测试目录
    if (this.els.defaultTestDirectory) {
      this.els.defaultTestDirectory.value = settings.default_download_directory || '';
    }
    if (this.els.defaultDirectoryTooltip) {
      const dir = settings.default_download_directory || '';
      this.els.defaultDirectoryTooltip.textContent = dir;
      this.els.defaultDirectoryTooltip.classList.toggle('empty', !dir);
    }

    // 语言
    this.updateLanguageSelector(settings.language || 'zh-CN');

    // 通知
    this.updateNotificationConfig(settings.notification || { platform: 'none', dingtalk: { access_token: '', secret: '' } });

    // 自动检查更新
    if (this.els.autoCheckUpdateToggle) {
      this.els.autoCheckUpdateToggle.checked = settings.autoCheckUpdate !== false;
    }

    // 防止睡眠
    if (this.els.preventSleepToggle) {
      this.els.preventSleepToggle.checked = !!settings.preventSleep;
    }
  },

  // ─── Data Path ─────────────────────────────────────────────────

  renderDataPath(path) {
    if (this.els.configStoragePath) {
      this.els.configStoragePath.value = path || '';
    }
    if (this.els.configStorageTooltip) {
      this.els.configStorageTooltip.textContent = path || '';
      this.els.configStorageTooltip.classList.toggle('empty', !path);
    }
  },

  /**
   * 设置默认测试目录输入框的值
   * MVC: input value 写入归 view
   * @param {string} path - 目录路径
   */
  setDefaultTestDirectory(path) {
    if (this.els.defaultTestDirectory) {
      this.els.defaultTestDirectory.value = path || '';
    }
  },

  // ─── Button Loading State ───────────────────────────────────────

  setButtonLoading(btnId, loading) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    if (loading) {
      if (!btn._xkatOriginalHTML) {
        btn._xkatOriginalHTML = btn.innerHTML;
      }
      btn.disabled = true;
      btn.classList.add('loading');
      btn.innerHTML = '<span class="btn-spinner"></span>';
    } else {
      btn.disabled = false;
      btn.classList.remove('loading');
      btn.innerHTML = btn._xkatOriginalHTML || btn.textContent;
      delete btn._xkatOriginalHTML;
    }
  },

  // ─── Confirm Modal Bridge ──────────────────────────────────────

  showConfirmModal(title, message, onConfirm) {
    const titleElement = document.getElementById('confirm-modal-title');
    const messageElement = document.getElementById('confirm-modal-message');

    if (titleElement) titleElement.textContent = title;
    if (messageElement) messageElement.textContent = message;

    // 保存回调到全局，供 confirm 按钮事件委托使用（跨 tab 共享）
    window.__XKAT_CONFIRM_CALLBACK__ = onConfirm;
    this._confirmCallback = onConfirm;

    // 重置确认按钮状态
    const confirmBtn = document.getElementById('confirm-modal-confirm-btn');
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.classList.remove('loading');
      // 清除旧的 originalText，使用当前语言重新翻译
      delete confirmBtn.dataset.originalText;
      const i18nKey = confirmBtn.getAttribute('data-i18n');
      confirmBtn.innerHTML = i18nKey ? window.i18n.t(i18nKey) || confirmBtn.textContent : confirmBtn.textContent;
    }

    const confirmModal = window.__XKAT_MODALS__?.confirm;
    if (confirmModal) {
      confirmModal.open();
    } else {
      if (window.confirm(message)) {
        onConfirm();
      }
    }
  },

  setConfirmButtonLoading(loading) {
    const confirmBtn = document.getElementById('confirm-modal-confirm-btn');
    if (!confirmBtn) return;

    if (loading) {
      // 保存原始文本
      if (!confirmBtn.dataset.originalText) {
        confirmBtn.dataset.originalText = confirmBtn.textContent;
      }
      confirmBtn.disabled = true;
      confirmBtn.classList.add('loading');
      confirmBtn.innerHTML = '<span class="btn-spinner"></span>';
    } else {
      confirmBtn.disabled = false;
      confirmBtn.classList.remove('loading');
      // 清除 originalText，使用当前语言重新翻译
      delete confirmBtn.dataset.originalText;
      const i18nKey = confirmBtn.getAttribute('data-i18n');
      confirmBtn.innerHTML = i18nKey ? window.i18n.t(i18nKey) || confirmBtn.textContent : confirmBtn.textContent;
    }
  },

  hideConfirmModal() {
    if (this._keepModalOpen) {
      this._keepModalOpen = false;
      // 只重置按钮状态，不关闭 modal（callback 会重新 showConfirmModal）
      const confirmBtn = document.getElementById('confirm-modal-confirm-btn');
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.classList.remove('loading');
        delete confirmBtn.dataset.originalText;
        const i18nKey = confirmBtn.getAttribute('data-i18n');
        confirmBtn.innerHTML = i18nKey ? window.i18n.t(i18nKey) || confirmBtn.textContent : confirmBtn.textContent;
      }
      return;
    }
    const confirmModal = window.__XKAT_MODALS__?.confirm;
    if (confirmModal) confirmModal.close();
    this._confirmCallback = null;
    window.__XKAT_CONFIRM_CALLBACK__ = null;
    this.setConfirmButtonLoading(false);
  },

  // ─── 事件绑定辅助（Controller → View 迁移） ─────────────────────

  /**
   * 关闭所有下拉选项 + 恢复 main-content 滚动（用于 tab 激活时清理残留状态）
   */
  closeAllDropdowns() {
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
      mainContent.classList.remove('dropdown-open');
    }
    document.querySelectorAll('.custom-select__options.show').forEach(opt => {
      opt.classList.remove('show');
    });
  },

  /**
   * 隐藏所有 .custom-select__options.show 元素（可选排除某个）
   * @param {Element} [except] - 不需要隐藏的元素
   */
  hideAllCustomSelectOptions(except = null) {
    document.querySelectorAll('.custom-select__options.show').forEach(opt => {
      if (opt !== except) opt.classList.remove('show');
    });
  },

  /**
   * 绑定全局 click 用于下拉框开关逻辑（捕获阶段）
   * @param {Object} handlers - { onLanguageToggle, onNotificationToggle, onThemeToggle, onOutsideClick }
   * @returns {Function} unbind 函数
   */
  bindGlobalClickForDropdowns({ onLanguageToggle, onNotificationToggle, onThemeToggle, onOutsideClick } = {}) {
    const handler = (e) => {
      // 1. 语言下拉
      if (e.target.closest('#custom-language-select .custom-select__selected')) {
        e.stopPropagation();
        onLanguageToggle?.();
        return;
      }
      // 2. 通知平台下拉
      if (e.target.closest('#custom-notification-platform-select .custom-select__selected')) {
        e.stopPropagation();
        onNotificationToggle?.();
        return;
      }
      // 3. 主题色预览块
      if (e.target.closest('#theme-color-preview')) {
        e.stopPropagation();
        onThemeToggle?.();
        return;
      }
      // 4. 检查是否点击了下拉选项（由各自 options handler 处理）
      const isInCustomSelect = e.target.closest('.custom-select') ||
        e.target.closest('.custom-select__options') ||
        e.target.closest('.custom-select__option') ||
        e.target.closest('.theme-color-options') ||
        e.target.closest('#theme-color-preview');
      if (!isInCustomSelect) {
        onOutsideClick?.();
      }
    };
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  },

  /**
   * 绑定全局 click 用于 confirm modal 按钮事件委托
   * @param {Object} handlers - { onConfirm, onCancel }
   * @returns {Function} unbind 函数
   */
  bindGlobalClickForConfirmModal({ onConfirm, onCancel } = {}) {
    const handler = (e) => {
      if (e.target.id === 'confirm-modal-confirm-btn' || e.target.closest('#confirm-modal-confirm-btn')) {
        onConfirm?.();
      }
      if (e.target.id === 'confirm-modal-cancel-btn' || e.target.closest('#confirm-modal-cancel-btn')) {
        onCancel?.();
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  },

  /**
   * 定位下拉框到 selected 元素下方
   * @param {Element} selected - 触发元素
   * @param {Element} options - 待定位的下拉选项面板
   */
  positionDropdown(selected, options) {
    const rect = selected.getBoundingClientRect();
    // 守卫：如果 selected 不可见（如 tab 未激活），跳过定位
    if (rect.width === 0 && rect.height === 0) return;

    const gap = 4;
    const threshold = 2;
    const viewportHeight = window.innerHeight;

    // 临时显示测量高度（原始方式）
    const prevDisplay = options.style.display;
    options.style.display = 'block';
    const actualHeight = options.offsetHeight || 200;
    options.style.display = prevDisplay;

    const spaceBelow = viewportHeight - rect.bottom - gap;
    const spaceAbove = rect.top - gap;

    let top;
    if (spaceAbove >= actualHeight && spaceBelow < actualHeight * threshold) {
      top = rect.top - actualHeight - gap;
    } else if (spaceBelow >= actualHeight) {
      top = rect.bottom + gap;
    } else if (spaceAbove >= actualHeight) {
      top = rect.top - actualHeight - gap;
    } else {
      top = spaceBelow >= spaceAbove ? rect.bottom + gap : Math.max(10, rect.top - actualHeight - gap);
    }

    options.style.top = `${top}px`;
    options.style.left = `${rect.left}px`;
    options.style.width = `${rect.width}px`;
    options.style.transform = 'none';
  },

  // ─── 通用 DOM 事件绑定 helper（供 Controller 使用，消除 controller 内 document.getElementById） ───

  /**
   * 按 ID 绑定元素 click 事件（自动跳过 disabled）
   * @param {string} elementId - DOM 元素 id
   * @param {Function} handler - () => void
   * @returns {Function} unbind 函数
   */
  bindClickById(elementId, handler) {
    const el = document.getElementById(elementId);
    if (!el) return () => {};
    const wrapped = () => {
      if (el.disabled) return;
      handler();
    };
    el.addEventListener('click', wrapped);
    return () => el.removeEventListener('click', wrapped);
  },

  /**
   * 按 ID 绑定元素 change 事件（用于 toggle/checkbox）
   * @param {string} elementId - DOM 元素 id
   * @param {Function} handler - (checked: boolean) => void
   * @returns {Function} unbind 函数
   */
  bindToggleById(elementId, handler) {
    const el = document.getElementById(elementId);
    if (!el) return () => {};
    const changeHandler = (e) => handler(e.target.checked);
    el.addEventListener('change', changeHandler);
    return () => el.removeEventListener('change', changeHandler);
  },
};

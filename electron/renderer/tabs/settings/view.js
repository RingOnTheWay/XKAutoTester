/**
 * SettingsView - 设置 Tab View 层 (MVC)
 *
 * 纯 DOM 操作。无 API 调用，无状态管理。
 * 从 Controller 接收数据，渲染到 DOM。
 * 通过 window.* 访问全局对象: i18n, Icons, Toast
 *
 * R10 mixin 内联：原 5 mixin (theme/language/notification/versionUpdate/uiHelpers)
 * 通过 Object.assign 绑定到原型，现全部内联到类体方法。
 */

import { SettingsModel } from './model.js';

export class SettingsView {
  #scrollPreventHandler = null;

  constructor() {
    this.els = {
      // 主题
      darkModeToggle: document.getElementById('dark-mode-toggle'),
      themeColorPreview: document.getElementById('theme-color-preview'),
      themeColorOptions: document.getElementById('theme-color-options'),
      themeColorHex: document.getElementById('theme-color-hex'),

      // 默认测试目录
      defaultTestDirectory: document.getElementById('default-test-directory'),
      defaultDirectoryTooltip: document.getElementById('default-directory-tooltip'),
      browseDefaultDirectory: document.getElementById('browse-default-directory'),
      clearDefaultDirectory: document.getElementById('clear-default-directory'),

      // 配置存储路径
      configStoragePath: document.getElementById('config-storage-path'),
      configStorageTooltip: document.getElementById('config-storage-tooltip'),
      browseConfigStorage: document.getElementById('browse-config-storage'),
      resetConfigStorage: document.getElementById('reset-config-storage'),

      // 语言
      customLanguageSelect: document.getElementById('custom-language-select'),
      customLanguageSelected: document.getElementById('custom-language-selected'),
      customLanguageOptions: document.getElementById('custom-language-options'),

      // 通知
      customNotificationPlatformSelect: document.getElementById('custom-notification-platform-select'),
      customNotificationPlatformSelected: document.getElementById('custom-notification-platform-selected'),
      customNotificationPlatformOptions: document.getElementById('custom-notification-platform-options'),
      notificationAccessToken: document.getElementById('notification-access-token'),
      notificationSecret: document.getElementById('notification-secret'),
      notificationAccessTokenItem: document.getElementById('notification-access-token-item'),
      notificationSecretItem: document.getElementById('notification-secret-item'),
      notificationAccessTokenVisibilityToggle: document.getElementById('notification-access-token-visibility-toggle'),
      notificationSecretVisibilityToggle: document.getElementById('notification-secret-visibility-toggle'),

      // 导出/导入
      exportConfigBtn: document.getElementById('export-config-btn'),
      exportLogsBtn: document.getElementById('export-logs-btn'),
      importConfigBtn: document.getElementById('import-config-btn'),

      // 清理
      clearAllureReportsBtn: document.getElementById('clear-allure-reports-btn'),
      clearAllLogsBtn: document.getElementById('clear-all-logs-btn'),

      // 更新/睡眠
      autoCheckUpdateToggle: document.getElementById('auto-check-update-toggle'),
      allowInsecureSSLToggle: document.getElementById('allow-insecure-ssl-toggle'),
      preventSleepToggle: document.getElementById('prevent-sleep-toggle'),
      checkUpdateBtn: document.getElementById('check-update-btn'),

      // 版本信息
      appVersionInfo: document.getElementById('app-version-info'),
      // R27 修复: 构建日期绑定 version.json buildDate (原 tab.html 硬编码 2026-04-15)
      appBuildDate: document.getElementById('app-build-date'),
      githubRepoLink: document.getElementById('github-repo-link'),

      // 更新弹窗
      updateCurrentVersion: document.getElementById('update-current-version'),
      updateNewVersion: document.getElementById('update-new-version'),
      updateChangelog: document.getElementById('update-changelog'),
      updateProgressContainer: document.getElementById('update-progress-container'),
      updateProgressFill: document.getElementById('update-progress-fill'),
      updateProgressText: document.getElementById('update-progress-text'),
      updateProgressSpeed: document.getElementById('update-progress-speed'),
      updateDownloadBtn: document.getElementById('update-download-btn'),
      updateModalOverlay: document.getElementById('update-modal-overlay'),
      updateModalCloseBtn: document.getElementById('update-modal-close-btn'),
      updateCancelBtn: document.getElementById('update-cancel-btn'),
    };
  }

  // ─── Page Scroll ───────────────────────────────────────────────

  /**
   * 禁用页面滚动（下拉打开时调用）
   * 内部维护 scrollPreventHandler 状态，调用方无需关心清理
   */
  disablePageScroll() {
    const mainContent = document.querySelector('.main-content');
    if (!mainContent) return;
    mainContent.classList.add('dropdown-open');
    if (!this.#scrollPreventHandler) {
      this.#scrollPreventHandler = (e) => e.preventDefault();
      mainContent.addEventListener('wheel', this.#scrollPreventHandler, {
        passive: false,
      });
    }
  }

  /**
   * 启用页面滚动（下拉关闭时调用）
   */
  enablePageScroll() {
    const mainContent = document.querySelector('.main-content');
    if (!mainContent) return;
    mainContent.classList.remove('dropdown-open');
    if (this.#scrollPreventHandler) {
      mainContent.removeEventListener('wheel', this.#scrollPreventHandler);
      this.#scrollPreventHandler = null;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 主题色与暗色模式 (原 themeMixin)
  // ═══════════════════════════════════════════════════════════════

  // ─── Dark Mode ─────────────────────────────────────────────────

  applyDarkMode(isDark) {
    document.body.classList.toggle('dark-theme', isDark);
  }

  // ─── Theme Color ───────────────────────────────────────────────

  applyThemeColor(color) {
    const rgb = SettingsModel.hexToRgb(color);
    if (!rgb) return;

    // 同时设置 --primary 和 --primary-color，兼容 CSS 中的两种变量名
    document.documentElement.style.setProperty('--primary', color);
    document.documentElement.style.setProperty('--primary-color', color);
    document.documentElement.style.setProperty('--primary-rgb', `${rgb.r}, ${rgb.g}, ${rgb.b}`);
    document.documentElement.style.setProperty('--primary-dark', SettingsModel.darkenColor(color, 0.2));
    document.documentElement.style.setProperty('--primary-light', SettingsModel.lightenColor(color, 0.2));

    // 更新预览
    if (this.els.themeColorPreview) {
      this.els.themeColorPreview.style.backgroundColor = color;
    }

    // 更新主题色选项选中状态
    if (this.els.themeColorOptions) {
      this.els.themeColorOptions.querySelectorAll('.theme-color-option').forEach((opt) => {
        opt.classList.toggle('active', opt.dataset.color === color);
      });
    }

    // 更新按钮和进度条颜色
    document.querySelectorAll('.btn-primary, .progress-fill').forEach((el) => {
      el.style.backgroundColor = color;
    });
  }

  /**
   * 隐藏主题色选项面板
   */
  hideThemeColorOptions() {
    const { themeColorOptions } = this.els;
    if (themeColorOptions) themeColorOptions.classList.remove('show');
  }

  /**
   * 切换主题色选项面板显示状态
   */
  toggleThemeColorOptions() {
    const { themeColorOptions } = this.els;
    // 关闭其他下拉 + 恢复滚动（主题色面板不阻断滚动）
    this.hideAllCustomSelectOptions();
    this.enablePageScroll();
    if (themeColorOptions) {
      themeColorOptions.classList.toggle('show');
    }
  }

  /**
   * 绑定主题色选项点击
   * @param {Function} handler - (color: string) => void
   * @returns {Function} unbind 函数
   */
  bindThemeColorOptionsClick(handler) {
    const { themeColorOptions } = this.els;
    if (!themeColorOptions) return () => {};
    const listener = (e) => {
      const option = e.target.closest('.theme-color-option');
      if (!option) return;
      const color = option.dataset.color;
      if (color) {
        handler(color);
        this.setThemeColorHex(color);
        themeColorOptions.classList.remove('show');
      }
    };
    themeColorOptions.addEventListener('click', listener);
    return () => themeColorOptions.removeEventListener('click', listener);
  }

  /**
   * 设置主题色 HEX 输入框的值
   * @param {string} color
   */
  setThemeColorHex(color) {
    const { themeColorHex } = this.els;
    if (themeColorHex) themeColorHex.value = color;
  }

  /**
   * 绑定主题色 HEX 输入变化
   * @param {Function} handler - (color: string) => void
   * @returns {Function} unbind 函数
   */
  bindThemeColorHexChange(handler) {
    const { themeColorHex } = this.els;
    if (!themeColorHex) return () => {};
    const listener = (e) => {
      const color = e.target.value.trim();
      if (/^#[0-9a-fA-F]{6}$/.test(color)) {
        handler(color);
      }
    };
    themeColorHex.addEventListener('change', listener);
    return () => themeColorHex.removeEventListener('change', listener);
  }

  // ═══════════════════════════════════════════════════════════════
  // 语言选择器 (原 languageMixin)
  // ═══════════════════════════════════════════════════════════════

  // ─── Language Selector ─────────────────────────────────────────

  updateLanguageSelector(language) {
    // 更新选中显示
    if (this.els.customLanguageSelected) {
      const textSpan = this.els.customLanguageSelected.querySelector('.custom-select__text');
      if (textSpan) {
        const labels = { 'zh-CN': '简体中文', 'en-US': 'English' };
        textSpan.textContent = labels[language] || language;
      }
    }

    // 更新选项选中状态
    if (this.els.customLanguageOptions) {
      this.els.customLanguageOptions.querySelectorAll('.custom-select__option').forEach((opt) => {
        opt.classList.toggle('selected', opt.dataset.value === language);
      });
    }
  }

  /**
   * 绑定语言选项点击
   * @param {Function} handler - (lang: string, optionEl: Element) => void
   * @returns {Function} unbind 函数
   */
  bindLanguageOptionsClick(handler) {
    const { customLanguageOptions } = this.els;
    if (!customLanguageOptions) return () => {};
    const listener = (e) => {
      const option = e.target.closest('.custom-select__option');
      if (!option) return;
      e.stopPropagation();
      const lang = option.dataset.value;
      if (lang) {
        handler(lang, option);
        // 更新选中显示
        const textSpan = this.els.customLanguageSelected?.querySelector('.custom-select__text');
        if (textSpan) textSpan.textContent = option.querySelector('span')?.textContent || lang;
        // 更新选项选中状态
        customLanguageOptions
          .querySelectorAll('.custom-select__option')
          .forEach((opt) => opt.classList.remove('selected'));
        option.classList.add('selected');
      }
      customLanguageOptions.classList.remove('show');
      this.enablePageScroll();
    };
    customLanguageOptions.addEventListener('click', listener);
    return () => customLanguageOptions.removeEventListener('click', listener);
  }

  /**
   * 将语言下拉选项移到 body（避免父容器 transform 影响定位）
   */
  moveLanguageOptionsToBody() {
    const { customLanguageOptions, customLanguageSelected } = this.els;
    if (customLanguageOptions && customLanguageSelected && !customLanguageOptions.dataset.moved) {
      document.body.appendChild(customLanguageOptions);
      customLanguageOptions.dataset.moved = 'true';
    }
  }

  /**
   * 切换语言下拉框显示状态
   * @returns {boolean} 切换后是否处于显示状态
   */
  toggleLanguageDropdown() {
    const { customLanguageOptions, customLanguageSelected } = this.els;
    if (!customLanguageOptions || !customLanguageSelected) return false;
    this.hideAllCustomSelectOptions(customLanguageOptions);
    this.hideThemeColorOptions();
    const isShowing = customLanguageOptions.classList.contains('show');
    if (isShowing) {
      customLanguageOptions.classList.remove('show');
      this.enablePageScroll();
      return false;
    }
    this.positionDropdown(customLanguageSelected, customLanguageOptions);
    customLanguageOptions.classList.add('show');
    this.disablePageScroll();
    return true;
  }

  // ═══════════════════════════════════════════════════════════════
  // 通知平台（钉钉） (原 notificationMixin)
  // ═══════════════════════════════════════════════════════════════

  updateNotificationConfig(notification) {
    if (!notification) return;
    const platform = notification.platform || 'none';

    // 更新平台选择
    if (this.els.customNotificationPlatformSelected) {
      const textSpan = this.els.customNotificationPlatformSelected.querySelector('.custom-select__text');
      if (textSpan) {
        const labels = {
          none: window.i18n.t('settings.none'),
          dingtalk: window.i18n.t('settings.dingtalk'),
        };
        textSpan.textContent = labels[platform] || platform;
      }
    }

    if (this.els.customNotificationPlatformOptions) {
      this.els.customNotificationPlatformOptions.querySelectorAll('.custom-select__option').forEach((opt) => {
        opt.classList.toggle('selected', opt.dataset.value === platform);
      });
    }

    // 显示/隐藏钉钉配置
    const isDingtalk = platform === 'dingtalk';
    if (this.els.notificationAccessTokenItem) {
      this.els.notificationAccessTokenItem.classList.toggle('hidden', !isDingtalk);
    }
    if (this.els.notificationSecretItem) {
      this.els.notificationSecretItem.classList.toggle('hidden', !isDingtalk);
    }

    // 填充钉钉配置值
    const dingtalk = notification.dingtalk || {};
    if (this.els.notificationAccessToken) {
      this.els.notificationAccessToken.value = dingtalk.access_token || '';
    }
    if (this.els.notificationSecret) {
      this.els.notificationSecret.value = dingtalk.secret || '';
    }
  }

  /**
   * 绑定通知平台选项点击
   * @param {Function} handler - (platform: string, optionEl: Element) => void
   * @returns {Function} unbind 函数
   */
  bindNotificationOptionsClick(handler) {
    const { customNotificationPlatformOptions } = this.els;
    if (!customNotificationPlatformOptions) return () => {};
    const listener = (e) => {
      const option = e.target.closest('.custom-select__option');
      if (!option) return;
      e.stopPropagation();
      const platform = option.dataset.value;
      if (platform) {
        handler(platform, option);
        // 更新选中显示
        const textSpan = this.els.customNotificationPlatformSelected?.querySelector('.custom-select__text');
        if (textSpan) textSpan.textContent = option.querySelector('span')?.textContent || platform;
        customNotificationPlatformOptions
          .querySelectorAll('.custom-select__option')
          .forEach((opt) => opt.classList.remove('selected'));
        option.classList.add('selected');
      }
      customNotificationPlatformOptions.classList.remove('show');
      this.enablePageScroll();
    };
    customNotificationPlatformOptions.addEventListener('click', listener);
    return () => customNotificationPlatformOptions.removeEventListener('click', listener);
  }

  /**
   * 将通知平台下拉选项移到 body
   */
  moveNotificationOptionsToBody() {
    const { customNotificationPlatformOptions, customNotificationPlatformSelected } = this.els;
    if (
      customNotificationPlatformOptions &&
      customNotificationPlatformSelected &&
      !customNotificationPlatformOptions.dataset.moved
    ) {
      document.body.appendChild(customNotificationPlatformOptions);
      customNotificationPlatformOptions.dataset.moved = 'true';
    }
  }

  /**
   * 切换通知平台下拉框显示状态
   * @returns {boolean} 切换后是否处于显示状态
   */
  toggleNotificationDropdown() {
    const { customNotificationPlatformOptions, customNotificationPlatformSelected } = this.els;
    if (!customNotificationPlatformOptions || !customNotificationPlatformSelected) return false;
    this.hideAllCustomSelectOptions(customNotificationPlatformOptions);
    this.hideThemeColorOptions();
    const isShowing = customNotificationPlatformOptions.classList.contains('show');
    if (isShowing) {
      customNotificationPlatformOptions.classList.remove('show');
      this.enablePageScroll();
      return false;
    }
    this.positionDropdown(customNotificationPlatformSelected, customNotificationPlatformOptions);
    customNotificationPlatformOptions.classList.add('show');
    this.disablePageScroll();
    return true;
  }

  /**
   * 绑定钉钉 access_token 变化
   * @param {Function} handler - () => void
   * @returns {Function} unbind 函数
   */
  bindAccessTokenChange(handler) {
    const { notificationAccessToken } = this.els;
    if (!notificationAccessToken) return () => {};
    const listener = () => handler();
    notificationAccessToken.addEventListener('change', listener);
    return () => notificationAccessToken.removeEventListener('change', listener);
  }

  /**
   * 绑定钉钉 secret 变化
   * @param {Function} handler - () => void
   * @returns {Function} unbind 函数
   */
  bindSecretChange(handler) {
    const { notificationSecret } = this.els;
    if (!notificationSecret) return () => {};
    const listener = () => handler();
    notificationSecret.addEventListener('change', listener);
    return () => notificationSecret.removeEventListener('change', listener);
  }

  /**
   * 获取钉钉 access_token 输入框的值
   * @returns {string}
   */
  getAccessToken() {
    const { notificationAccessToken } = this.els;
    return notificationAccessToken?.value || '';
  }

  /**
   * 获取钉钉 secret 输入框的值
   * @returns {string}
   */
  getSecret() {
    const { notificationSecret } = this.els;
    return notificationSecret?.value || '';
  }

  // ═══════════════════════════════════════════════════════════════
  // 版本信息与更新弹窗 (原 versionUpdateMixin)
  // ═══════════════════════════════════════════════════════════════

  // ─── Version Info ──────────────────────────────────────────────

  renderVersionInfo(versionInfo) {
    if (!versionInfo) return;
    if (this.els.appVersionInfo) {
      const version = versionInfo.fullVersion || versionInfo.version || '-';
      this.els.appVersionInfo.textContent = `v${version}`;
    }
    if (this.els.appBuildDate) {
      this.els.appBuildDate.textContent = versionInfo.buildDate || '-';
    }
  }

  // ─── Update Modal ──────────────────────────────────────────────

  showUpdateModal(updateData) {
    if (!updateData) return;

    if (this.els.updateCurrentVersion) {
      const currentVersion = this.els.appVersionInfo?.textContent || '';
      this.els.updateCurrentVersion.textContent = currentVersion;
    }

    if (this.els.updateNewVersion) {
      this.els.updateNewVersion.textContent = updateData.version || '';
    }

    if (this.els.updateChangelog) {
      const changelog = updateData.changelog || updateData.releaseNotes || '';
      // R10 安全闭环: 无 SHA256 hash 的 release 加警告横幅, 有 hash 加已校验提示
      const secure = updateData.secure !== false;
      const banner = secure
        ? `<div class="update-hash-verified">${window.i18n.t('settings.updateHashVerified')}</div>`
        : `<div class="update-insecure-warning">${window.i18n.t('settings.insecureReleaseWarning')}</div>`;
      this.els.updateChangelog.innerHTML = banner + SettingsModel.renderMarkdown(changelog);
    }

    // 重置进度
    if (this.els.updateProgressContainer) {
      this.els.updateProgressContainer.classList.add('hidden');
    }
    if (this.els.updateProgressFill) {
      this.els.updateProgressFill.style.width = '0%';
    }
    if (this.els.updateProgressText) {
      this.els.updateProgressText.textContent = '';
    }
    if (this.els.updateProgressSpeed) {
      this.els.updateProgressSpeed.textContent = '';
    }

    // 重置下载按钮: R10 无 hash (secure=false) 时禁用, 防用户绕过后端拒绝
    if (this.els.updateDownloadBtn) {
      this.els.updateDownloadBtn.textContent = window.i18n.t('settings.downloadUpdate');
      this.els.updateDownloadBtn.disabled = updateData.secure === false;
    }

    if (this.els.updateModalOverlay) {
      this.els.updateModalOverlay.classList.remove('hidden');
    }
  }

  hideUpdateModal() {
    if (this.els.updateModalOverlay) {
      this.els.updateModalOverlay.classList.add('hidden');
    }
  }

  updateDownloadProgress(progress) {
    if (!progress) return;

    if (this.els.updateProgressContainer) {
      this.els.updateProgressContainer.classList.remove('hidden');
    }

    const percent = progress.percent || 0;
    if (this.els.updateProgressFill) {
      this.els.updateProgressFill.style.width = `${percent}%`;
    }
    if (this.els.updateProgressText) {
      this.els.updateProgressText.textContent = `${percent.toFixed(1)}%`;
    }
    if (this.els.updateProgressSpeed) {
      this.els.updateProgressSpeed.textContent = SettingsModel.formatDownloadSpeed(progress.bytesPerSecond);
    }
  }

  updateDownloadButton(state) {
    if (!this.els.updateDownloadBtn) return;
    switch (state) {
      case 'downloaded':
        this.els.updateDownloadBtn.textContent = window.i18n.t('settings.installUpdate');
        this.els.updateDownloadBtn.disabled = false;
        break;
      case 'downloading':
        this.els.updateDownloadBtn.textContent = window.i18n.t('settings.downloading');
        this.els.updateDownloadBtn.disabled = true;
        break;
      default:
        this.els.updateDownloadBtn.textContent = window.i18n.t('settings.downloadUpdate');
        this.els.updateDownloadBtn.disabled = false;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 通用 UI 辅助、配置渲染、确认弹窗、下拉工具 (原 uiHelpersMixin)
  // ═══════════════════════════════════════════════════════════════

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
    this.updateNotificationConfig(
      settings.notification || {
        platform: 'none',
        dingtalk: { access_token: '', secret: '' },
      }
    );

    // 自动检查更新
    if (this.els.autoCheckUpdateToggle) {
      this.els.autoCheckUpdateToggle.checked = settings.autoCheckUpdate !== false;
    }

    // 允许不安全 SSL 连接
    if (this.els.allowInsecureSSLToggle) {
      this.els.allowInsecureSSLToggle.checked = !!settings.allowInsecureSSL;
    }

    // 防止睡眠
    if (this.els.preventSleepToggle) {
      this.els.preventSleepToggle.checked = !!settings.preventSleep;
    }
  }

  // ─── Data Path ─────────────────────────────────────────────────

  renderDataPath(path) {
    if (this.els.configStoragePath) {
      this.els.configStoragePath.value = path || '';
    }
    if (this.els.configStorageTooltip) {
      this.els.configStorageTooltip.textContent = path || '';
      this.els.configStorageTooltip.classList.toggle('empty', !path);
    }
  }

  /**
   * 设置默认测试目录输入框的值
   * MVC: input value 写入归 view
   * @param {string} path - 目录路径
   */
  setDefaultTestDirectory(path) {
    if (this.els.defaultTestDirectory) {
      this.els.defaultTestDirectory.value = path || '';
    }
  }

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
  }

  // R24 P1-6: Confirm Modal Bridge (showConfirmModal / setConfirmButtonLoading /
  // hideConfirmModal / bindGlobalClickForConfirmModal) 已删 — 统一走
  // core/utils/confirmModal.js Promise 版, 消除全局回调覆盖致 Promise 挂起与
  // document 委托三份重复。

  // ─── 事件绑定辅助（Controller → View 迁移） ─────────────────────

  /**
   * 关闭所有下拉选项 + 恢复 main-content 滚动（用于 tab 激活时清理残留状态）
   */
  closeAllDropdowns() {
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
      mainContent.classList.remove('dropdown-open');
    }
    document.querySelectorAll('.custom-select__options.show').forEach((opt) => {
      opt.classList.remove('show');
    });
  }

  /**
   * 隐藏所有 .custom-select__options.show 元素（可选排除某个）
   * @param {Element} [except] - 不需要隐藏的元素
   */
  hideAllCustomSelectOptions(except = null) {
    document.querySelectorAll('.custom-select__options.show').forEach((opt) => {
      if (opt !== except) opt.classList.remove('show');
    });
  }

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
      const isInCustomSelect =
        e.target.closest('.custom-select') ||
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
  }

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
  }

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
  }

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
  }
}

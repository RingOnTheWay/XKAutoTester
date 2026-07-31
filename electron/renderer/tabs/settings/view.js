/**
 * SettingsView - 设置 Tab View 层 (MVC)
 *
 * 纯 DOM 操作。无 API 调用，无状态管理。
 * 从 Controller 接收数据，渲染到 DOM。
 * 通过 window.* 访问全局对象: i18n, Icons, Toast
 *
 * 方法按领域拆分到 ./mixins/*.js，通过 Object.assign 绑定到原型：
 *   - themeMixin          主题色与暗色模式
 *   - languageMixin       语言选择器
 *   - notificationMixin   通知平台（钉钉）
 *   - versionUpdateMixin  版本信息与更新弹窗
 *   - uiHelpersMixin      通用 UI 辅助、配置渲染、确认弹窗、下拉工具
 *
 * 类体内保留：私有字段 #scrollPreventHandler、constructor、
 * 以及依赖该私有字段的 disablePageScroll / enablePageScroll。
 */

import { themeMixin } from './mixins/themeMixin.js';
import { languageMixin } from './mixins/languageMixin.js';
import { notificationMixin } from './mixins/notificationMixin.js';
import { versionUpdateMixin } from './mixins/versionUpdateMixin.js';
import { uiHelpersMixin } from './mixins/uiHelpersMixin.js';

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
      mainContent.addEventListener('wheel', this.#scrollPreventHandler, { passive: false });
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
}

Object.assign(SettingsView.prototype, themeMixin, languageMixin, notificationMixin, versionUpdateMixin, uiHelpersMixin);

import { SettingsModel } from './model.js';

/**
 * SettingsView - 设置 Tab View 层 (MVC)
 *
 * 纯 DOM 操作。无 API 调用，无状态管理。
 * 从 Controller 接收数据，渲染到 DOM。
 * 通过 window.* 访问全局对象: i18n, Icons, Toast
 */
export class SettingsView {
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

      // 导出/导入
      exportConfigBtn: document.getElementById('export-config-btn'),
      exportLogsBtn: document.getElementById('export-logs-btn'),
      importConfigBtn: document.getElementById('import-config-btn'),

      // 清理
      clearAllureReportsBtn: document.getElementById('clear-allure-reports-btn'),
      clearAllLogsBtn: document.getElementById('clear-all-logs-btn'),

      // 更新/睡眠
      autoCheckUpdateToggle: document.getElementById('auto-check-update-toggle'),
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
  }

  // ─── Version Info ──────────────────────────────────────────────

  renderVersionInfo(versionInfo) {
    if (!versionInfo) return;
    if (this.els.appVersionInfo) {
      const version = versionInfo.fullVersion || versionInfo.version || '-';
      this.els.appVersionInfo.textContent = `v${version}`;
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
      this.els.themeColorOptions.querySelectorAll('.theme-color-option').forEach(opt => {
        opt.classList.toggle('active', opt.dataset.color === color);
      });
    }

    // 更新按钮和进度条颜色
    document.querySelectorAll('.btn-primary, .progress-fill').forEach(el => {
      el.style.backgroundColor = color;
    });
  }

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
      this.els.customLanguageOptions.querySelectorAll('.custom-select__option').forEach(opt => {
        opt.classList.toggle('selected', opt.dataset.value === language);
      });
    }
  }

  // ─── Notification Config ───────────────────────────────────────

  updateNotificationConfig(notification) {
    if (!notification) return;
    const platform = notification.platform || 'none';

    // 更新平台选择
    if (this.els.customNotificationPlatformSelected) {
      const textSpan = this.els.customNotificationPlatformSelected.querySelector('.custom-select__text');
      if (textSpan) {
        const labels = { 'none': window.i18n?.t('settings.none') || '无', 'dingtalk': window.i18n?.t('settings.dingtalk') || '钉钉' };
        textSpan.textContent = labels[platform] || platform;
      }
    }

    if (this.els.customNotificationPlatformOptions) {
      this.els.customNotificationPlatformOptions.querySelectorAll('.custom-select__option').forEach(opt => {
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
      this.els.updateChangelog.innerHTML = SettingsModel.renderMarkdown(changelog);
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

    // 重置下载按钮
    if (this.els.updateDownloadBtn) {
      this.els.updateDownloadBtn.textContent = window.i18n?.t('settings.downloadUpdate') || '下载更新';
      this.els.updateDownloadBtn.disabled = false;
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
        this.els.updateDownloadBtn.textContent = window.i18n?.t('settings.installUpdate') || '安装更新';
        this.els.updateDownloadBtn.disabled = false;
        break;
      case 'downloading':
        this.els.updateDownloadBtn.textContent = window.i18n?.t('settings.downloading') || '下载中...';
        this.els.updateDownloadBtn.disabled = true;
        break;
      default:
        this.els.updateDownloadBtn.textContent = window.i18n?.t('settings.downloadUpdate') || '下载更新';
        this.els.updateDownloadBtn.disabled = false;
    }
  }

  // ─── Button Loading State ───────────────────────────────────────

  setButtonLoading(btnId, loading) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    if (loading) {
      if (!btn.dataset.originalText) {
        btn.dataset.originalText = btn.textContent;
      }
      btn.disabled = true;
      btn.classList.add('loading');
      btn.innerHTML = '<span class="btn-spinner"></span>';
    } else {
      btn.disabled = false;
      btn.classList.remove('loading');
      btn.innerHTML = btn.dataset.originalText || btn.textContent;
      delete btn.dataset.originalText;
    }
  }

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
      confirmBtn.innerHTML = i18nKey ? window.i18n?.t(i18nKey) || confirmBtn.textContent : confirmBtn.textContent;
    }

    const confirmModal = window.__XKAT_MODALS__?.confirm;
    if (confirmModal) {
      confirmModal.open();
    } else {
      if (window.confirm(message)) {
        onConfirm();
      }
    }
  }

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
      confirmBtn.innerHTML = i18nKey ? window.i18n?.t(i18nKey) || confirmBtn.textContent : confirmBtn.textContent;
    }
  }

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
        confirmBtn.innerHTML = i18nKey ? window.i18n?.t(i18nKey) || confirmBtn.textContent : confirmBtn.textContent;
      }
      return;
    }
    const confirmModal = window.__XKAT_MODALS__?.confirm;
    if (confirmModal) confirmModal.close();
    this._confirmCallback = null;
    window.__XKAT_CONFIRM_CALLBACK__ = null;
    this.setConfirmButtonLoading(false);
  }
}

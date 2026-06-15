import { Action } from '../../core/Action.js';
import { ApiBridge } from '../../core/ApiBridge.js';
import { AppState } from '../../core/AppState.js';
import { Toast } from '../../components/toast.js';

/**
 * SettingsController - 设置 Tab 控制器
 * 职责：绑定 Model 事件到 View 渲染，绑定 DOM 事件到 Model 方法
 * 不直接操作 DOM（通过 View），不直接调用 API（通过 Model）
 */
export class SettingsController {
  #model;
  #view;
  #unbinds = [];
  #unbindModel = [];
  #destroyed = false;
  #scrollPreventHandler = null;

  /**
   * @param {import('./model.js').SettingsModel} model
   * @param {import('./view.js').SettingsView} view
   */
  constructor(model, view) {
    this.#model = model;
    this.#view = view;
  }

  // ─── 生命周期 ────────────────────────────────────────────

  async init() {
    this.#bindModelEvents();
    this.#bindDomEvents();
    await this.#model.load();
    // 初始化时翻译所有 data-i18n 元素
    const app = window.__XKAT_APP__;
    if (app?.updateUIText) app.updateUIText();
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

    this.#on(model, 'config-changed', (config) => {
      this.#view.renderConfig(config);
    });

    this.#on(model, 'dark-mode-changed', (isDark) => {
      this.#view.applyDarkMode(isDark);
    });

    this.#on(model, 'theme-color-changed', (color) => {
      this.#view.applyThemeColor(color);
    });

    this.#on(model, 'language-changed', (language) => {
      this.#view.updateLanguageSelector(language);
      // 通知 script.js 切换语言（会刷新所有 UI 文本）
      const app = window.__XKAT_APP__;
      if (app?.changeLanguage) {
        app.changeLanguage(language);
      } else if (window.i18n?.changeLanguage) {
        window.i18n.changeLanguage(language);
      }
      AppState.instance.set('locale', language);
    });

    this.#on(model, 'version-info-changed', (versionInfo) => {
      this.#view.renderVersionInfo(versionInfo);
    });

    this.#on(model, 'data-path-changed', (path) => {
      this.#view.renderDataPath(path);
    });

    this.#on(model, 'update-available', (updateData) => {
      this.#view.showUpdateModal(updateData);
    });

    this.#on(model, 'update-not-available', () => {
      Toast?.success(window.i18n?.t('settings.alreadyLatest') || '当前已是最新版本');
    });

    this.#on(model, 'download-progress', (progress) => {
      this.#view.updateDownloadProgress(progress);
    });

    this.#on(model, 'update-downloaded', () => {
      this.#view.updateDownloadButton('downloaded');
    });

    this.#on(model, 'error', (err) => {
      const msg = err.message || err.source || String(err);
      const translated = window.i18n?.t(`settings.${msg}`) || window.i18n?.t(msg) || msg;
      Toast?.error(translated);
    });
  }

  // ─── DOM 事件绑定 ────────────────────────────────────────

  #bindDomEvents() {
    // 暗色模式切换
    this.#bindToggle('dark-mode-toggle', (checked) => {
      this.#model.applyDarkMode(checked);
      this.#model.saveConfig({ dark_mode: checked });
    });

    // 主题色选项 - 点击预览块切换显示
    const themeColorPreview = document.getElementById('theme-color-preview');
    const themeColorOptions = document.getElementById('theme-color-options');
    if (themeColorPreview && themeColorOptions) {
      const toggleHandler = (e) => {
        e.stopPropagation();
        themeColorOptions.classList.toggle('show');
      };
      themeColorPreview.addEventListener('click', toggleHandler);
      this.#unbinds.push(() => themeColorPreview.removeEventListener('click', toggleHandler));
    }

    // 主题色选项 - 点击选项选择颜色
    if (themeColorOptions) {
      const handler = (e) => {
        const option = e.target.closest('.theme-color-option');
        if (!option) return;
        const color = option.dataset.color;
        if (color) {
          this.#model.applyThemeColor(color);
          this.#model.saveConfig({ theme_color: color });
          if (this.#view.els.themeColorHex) {
            this.#view.els.themeColorHex.value = color;
          }
          // 选择后关闭选项面板
          themeColorOptions.classList.remove('show');
        }
      };
      themeColorOptions.addEventListener('click', handler);
      this.#unbinds.push(() => themeColorOptions.removeEventListener('click', handler));
    }

    // 主题色选项 - 点击外部关闭
    const closeThemeColorOptions = (e) => {
      if (themeColorOptions && !themeColorOptions.contains(e.target) && e.target !== themeColorPreview) {
        themeColorOptions.classList.remove('show');
      }
    };
    document.addEventListener('click', closeThemeColorOptions);
    this.#unbinds.push(() => document.removeEventListener('click', closeThemeColorOptions));

    // 主题色 HEX 输入
    const themeColorHex = document.getElementById('theme-color-hex');
    if (themeColorHex) {
      const handler = (e) => {
        const color = e.target.value.trim();
        if (/^#[0-9a-fA-F]{6}$/.test(color)) {
          this.#model.applyThemeColor(color);
          this.#model.saveConfig({ theme_color: color });
        }
      };
      themeColorHex.addEventListener('change', handler);
      this.#unbinds.push(() => themeColorHex.removeEventListener('change', handler));
    }

    // 默认测试目录 - 浏览
    this.#bindClick('browse-default-directory', async () => {
      const result = await this.#model.selectDirectory();
      if (result && !result.canceled && result.filePaths.length > 0) {
        const path = result.filePaths[0];
        if (this.#view.els.defaultTestDirectory) {
          this.#view.els.defaultTestDirectory.value = path;
        }
        this.#model.saveConfig({ default_download_directory: path });
      }
    });

    // 默认测试目录 - 清除
    this.#bindClick('clear-default-directory', () => {
      if (this.#view.els.defaultTestDirectory) {
        this.#view.els.defaultTestDirectory.value = '';
      }
      this.#model.saveConfig({ default_download_directory: '' });
    });

    // 配置存储路径 - 浏览
    this.#bindClick('browse-config-storage', async () => {
      const result = await this.#model.selectDirectory();
      if (result && !result.canceled && result.filePaths.length > 0) {
        const newPath = result.filePaths[0];
        this.#view.showConfirmModal(
          window.i18n?.t('settings.confirmChangeConfigPath') || '确认更改配置路径',
          window.i18n?.t('settings.changeConfigPathMessage') || '更改配置存放位置后需要重启应用才能生效，是否继续？',
          () => this.#model.changeDataPath(newPath)
        );
      }
    });

    // 配置存储路径 - 重置
    this.#bindClick('reset-config-storage', () => {
      this.#view.showConfirmModal(
        window.i18n?.t('settings.confirmResetConfigPath') || '确认重置配置路径',
        window.i18n?.t('settings.resetConfigPathMessage') || '重置为默认路径后需要重启应用才能生效，是否继续？',
        () => this.#model.resetDataPath()
      );
    });

    // 语言选择
    const languageOptions = document.getElementById('custom-language-options');
    if (languageOptions) {
      const handler = (e) => {
        const option = e.target.closest('.custom-select__option');
        if (!option) return;
        const lang = option.dataset.value;
        if (lang) {
          this.#model.changeLanguage(lang);
          this.#model.saveConfig({ language: lang });
          // 更新选中显示
          const textSpan = this.#view.els.customLanguageSelected?.querySelector('.custom-select__text');
          if (textSpan) textSpan.textContent = option.querySelector('span')?.textContent || lang;
          // 更新选项选中状态
          languageOptions.querySelectorAll('.custom-select__option').forEach(opt => opt.classList.remove('selected'));
          option.classList.add('selected');
        }
      };
      languageOptions.addEventListener('click', handler);
      this.#unbinds.push(() => languageOptions.removeEventListener('click', handler));
    }

    // 语言下拉框开关
    const languageSelect = document.getElementById('custom-language-select');
    if (languageSelect) {
      const selected = languageSelect.querySelector('.custom-select__selected');
      const options = document.getElementById('custom-language-options');
      if (selected && options) {
        // 将 options 移到 body，避免父容器 transform 影响 position:fixed 定位
        if (!options.dataset.moved) {
          document.body.appendChild(options);
          options.dataset.moved = 'true';
        }
        const handler = (e) => {
          e.stopPropagation();
          document.querySelectorAll('.custom-select__options.show').forEach(opt => {
            if (opt !== options) opt.classList.remove('show');
          });
          const isShowing = options.classList.contains('show');
          if (isShowing) {
            options.classList.remove('show');
            this.#enablePageScroll();
          } else {
            this.#positionDropdown(selected, options);
            options.classList.add('show');
            this.#disablePageScroll();
          }
        };
        selected.addEventListener('click', handler);
        this.#unbinds.push(() => selected.removeEventListener('click', handler));
      }
    }

    // 通知平台选择
    const notificationOptions = document.getElementById('custom-notification-platform-options');
    if (notificationOptions) {
      const handler = (e) => {
        const option = e.target.closest('.custom-select__option');
        if (!option) return;
        const platform = option.dataset.value;
        if (platform) {
          const notification = { ...this.#model.notification, platform };
          this.#model.get('notification').platform = platform;
          this.#view.updateNotificationConfig(notification);
          this.#model.saveNotificationConfig();
          // 更新选中显示
          const textSpan = this.#view.els.customNotificationPlatformSelected?.querySelector('.custom-select__text');
          if (textSpan) textSpan.textContent = option.querySelector('span')?.textContent || platform;
          notificationOptions.querySelectorAll('.custom-select__option').forEach(opt => opt.classList.remove('selected'));
          option.classList.add('selected');
        }
      };
      notificationOptions.addEventListener('click', handler);
      this.#unbinds.push(() => notificationOptions.removeEventListener('click', handler));
    }

    // 通知平台下拉框开关
    const notificationSelect = document.getElementById('custom-notification-platform-select');
    if (notificationSelect) {
      const selected = notificationSelect.querySelector('.custom-select__selected');
      const options = document.getElementById('custom-notification-platform-options');
      if (selected && options) {
        // 将 options 移到 body，避免父容器 transform 影响 position:fixed 定位
        if (!options.dataset.moved) {
          document.body.appendChild(options);
          options.dataset.moved = 'true';
        }
        const handler = (e) => {
          e.stopPropagation();
          document.querySelectorAll('.custom-select__options.show').forEach(opt => {
            if (opt !== options) opt.classList.remove('show');
          });
          const isShowing = options.classList.contains('show');
          if (isShowing) {
            options.classList.remove('show');
            this.#enablePageScroll();
          } else {
            this.#positionDropdown(selected, options);
            options.classList.add('show');
            this.#disablePageScroll();
          }
        };
        selected.addEventListener('click', handler);
        this.#unbinds.push(() => selected.removeEventListener('click', handler));
      }
    }

    // 钉钉 access_token
    const accessToken = document.getElementById('notification-access-token');
    if (accessToken) {
      const handler = () => {
        this.#model.get('notification').dingtalk = this.#model.get('notification').dingtalk || {};
        this.#model.get('notification').dingtalk.access_token = accessToken.value;
        this.#model.saveNotificationConfig();
      };
      accessToken.addEventListener('change', handler);
      this.#unbinds.push(() => accessToken.removeEventListener('change', handler));
    }

    // 钉钉 secret
    const secret = document.getElementById('notification-secret');
    if (secret) {
      const handler = () => {
        this.#model.get('notification').dingtalk = this.#model.get('notification').dingtalk || {};
        this.#model.get('notification').dingtalk.secret = secret.value;
        this.#model.saveNotificationConfig();
      };
      secret.addEventListener('change', handler);
      this.#unbinds.push(() => secret.removeEventListener('change', handler));
    }

    // 导出配置
    this.#bindClick('export-config-btn', async () => {
      const result = await this.#model.selectExportPath();
      if (result && !result.canceled && result.filePath) {
        this.#view.setButtonLoading('export-config-btn', true);
        try {
          const exportResult = await this.#model.exportConfig(result.filePath);
          if (exportResult?.success !== false) {
            Toast?.success(window.i18n?.t('settings.exportConfigSuccess') || '配置导出成功');
          } else {
            Toast?.error(exportResult?.error || window.i18n?.t('settings.exportConfigFailed') || '配置导出失败');
          }
        } catch {
          Toast?.error(window.i18n?.t('settings.exportConfigFailed') || '配置导出失败');
        } finally {
          this.#view.setButtonLoading('export-config-btn', false);
        }
      }
    });

    // 导出日志
    this.#bindClick('export-logs-btn', async () => {
      const result = await this.#model.selectExportPath('logs');
      if (result && !result.canceled && result.filePath) {
        this.#view.setButtonLoading('export-logs-btn', true);
        try {
          const exportResult = await this.#model.exportLogs(result.filePath);
          if (exportResult?.success !== false) {
            Toast?.success(window.i18n?.t('settings.exportLogsSuccess') || '日志导出成功');
          } else {
            Toast?.error(exportResult?.error || window.i18n?.t('settings.exportLogsFailed') || '日志导出失败');
          }
        } catch {
          Toast?.error(window.i18n?.t('settings.exportLogsFailed') || '日志导出失败');
        } finally {
          this.#view.setButtonLoading('export-logs-btn', false);
        }
      }
    });

    // 导入配置
    this.#bindClick('import-config-btn', async () => {
      const result = await this.#model.selectImportPath();
      if (result && !result.canceled && result.filePaths?.length > 0) {
        this.#view.showConfirmModal(
          window.i18n?.t('settings.importConfig') || '导入配置',
          window.i18n?.t('settings.importConfigConfirm') || '导入配置将覆盖当前配置，是否继续？',
          async () => {
            const importResult = await this.#model.importConfig(result.filePaths[0]);
            if (importResult?.success !== false) {
              Toast?.success(window.i18n?.t('settings.importConfigSuccess') || '配置导入成功');
              if (importResult?.needRestart) {
                // 标记保持 modal 打开，阻止 hideConfirmModal 关闭
                this.#view._keepModalOpen = true;
                this.#view.showConfirmModal(
                  window.i18n?.t('settings.restartRequired') || '需要重启',
                  window.i18n?.t('settings.restartMessage') || '配置已更改，需要重启应用才能生效。是否立即重启？',
                  () => this.#model.relaunchApp()
                );
              }
            } else {
              Toast?.error(importResult?.error || window.i18n?.t('settings.importConfigFailed') || '配置导入失败');
            }
          }
        );
      }
    });

    // 清理 Allure 报告
    this.#bindClick('clear-allure-reports-btn', async () => {
      this.#view.showConfirmModal(
        window.i18n?.t('settings.clearAllureReports') || '清空Allure报告数据',
        window.i18n?.t('settings.clearAllureReportsConfirm') || '确定要清空所有Allure报告数据吗？此操作不可恢复。',
        async () => {
          const result = await this.#model.clearAllureReports();
          if (result?.success !== false) {
            Toast?.success(window.i18n?.t('settings.clearAllureReportsSuccess') || 'Allure报告数据已清空');
          }
        }
      );
    });

    // 清理所有日志
    this.#bindClick('clear-all-logs-btn', async () => {
      this.#view.showConfirmModal(
        window.i18n?.t('settings.clearAllLogs') || '清除所有日志数据',
        window.i18n?.t('settings.clearAllLogsConfirm') || '确定要清除所有日志数据吗？此操作不可恢复。',
        async () => {
          const result = await this.#model.clearAllLogs();
          if (result?.success !== false) {
            Toast?.success(window.i18n?.t('settings.clearAllLogsSuccess') || '所有日志数据已清除');
          } else {
            Toast?.error(window.i18n?.t('settings.clearAllLogsFailed') || '清除日志数据失败');
          }
        }
      );
    });

    // 自动检查更新
    this.#bindToggle('auto-check-update-toggle', (checked) => {
      this.#model.saveConfig({ autoCheckUpdate: checked });
    });

    // 防止睡眠
    this.#bindToggle('prevent-sleep-toggle', async (checked) => {
      const result = await this.#model.setPreventSleep(checked);
      if (result?.success !== false) {
        this.#model.saveConfig({ preventSleep: checked });
      }
    });

    // 检查更新
    this.#bindClick('check-update-btn', () => {
      this.#model.checkForUpdate();
    });

    // 更新弹窗 - 下载/安装按钮
    this.#bindClick('update-download-btn', async () => {
      const pendingFile = this.#model.updatePendingFilePath;
      if (pendingFile) {
        await this.#model.installUpdate(pendingFile);
      } else {
        this.#view.updateDownloadButton('downloading');
        await this.#model.downloadUpdate();
      }
    });

    // 更新弹窗 - 关闭按钮
    this.#bindClick('update-modal-close-btn', () => {
      this.#view.hideUpdateModal();
    });

    // 更新弹窗 - 取消按钮
    this.#bindClick('update-cancel-btn', () => {
      this.#view.hideUpdateModal();
    });

    // GitHub 链接
    this.#bindClick('github-repo-link', () => {
      this.#model.openExternal('https://github.com/RiNG-XK/XKAutoTester');
    });

    // 全局点击关闭下拉框
    const globalClickHandler = (e) => {
      if (!e.target.closest('.custom-select')) {
        const hadOpen = document.querySelectorAll('.custom-select__options.show').length > 0;
        document.querySelectorAll('.custom-select__options.show').forEach(opt => {
          opt.classList.remove('show');
        });
        if (hadOpen) this.#enablePageScroll();
      }
    };
    document.addEventListener('click', globalClickHandler);
    this.#unbinds.push(() => document.removeEventListener('click', globalClickHandler));

    // Confirm modal 按钮（事件委托，因 HTML 动态加载）
    document.addEventListener('click', (e) => {
      if (e.target.id === 'confirm-modal-confirm-btn' || e.target.closest('#confirm-modal-confirm-btn')) {
        const callback = this.#view._confirmCallback;
        // 显示 loading，保持 modal 开着
        this.#view.setConfirmButtonLoading(true);
        // 延迟执行：让浏览器先渲染 loading 动画
        setTimeout(async () => {
          try {
            if (callback) await callback();
          } catch (err) {
            console.error('Confirm action failed:', err);
          }
          // 非重启操作：callback 完成后关闭 modal
          // 重启操作：进程已退出，这行不会执行
          this.#view.hideConfirmModal();
        }, 150);
      }
      if (e.target.id === 'confirm-modal-cancel-btn' || e.target.closest('#confirm-modal-cancel-btn')) {
        this.#view.hideConfirmModal();
      }
    });

    // 导出/导入进度监听
    this.#bindProgressListeners();
  }

  // ─── 进度监听 ────────────────────────────────────────────

  #bindProgressListeners() {
    if (ApiBridge.api.onExportProgress) {
      const removeExport = ApiBridge.api.onExportProgress((data) => {
        if (data?.percent !== undefined) {
          Toast?.info(`${window.i18n?.t('settings.exporting') || '导出中'} ${data.percent}%`);
        }
      });
      this.#unbinds.push(() => { if (removeExport) removeExport(); });
    }

    if (ApiBridge.api.onImportProgress) {
      const removeImport = ApiBridge.api.onImportProgress((data) => {
        if (data?.percent !== undefined) {
          Toast?.info(`${window.i18n?.t('settings.importing') || '导入中'} ${data.percent}%`);
        }
      });
      this.#unbinds.push(() => { if (removeImport) removeImport(); });
    }
  }

  // ─── 工具方法 ────────────────────────────────────────────

  #on(model, event, handler) {
    const unsub = model.on(event, handler);
    this.#unbindModel.push(unsub);
  }

  #bindClick(elementId, handler) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const wrappedHandler = () => {
      if (el.disabled) return;
      handler();
    };
    el.addEventListener('click', wrappedHandler);
    this.#unbinds.push(() => el.removeEventListener('click', wrappedHandler));
  }

  #bindToggle(elementId, handler) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const changeHandler = (e) => handler(e.target.checked);
    el.addEventListener('change', changeHandler);
    this.#unbinds.push(() => el.removeEventListener('change', changeHandler));
  }

  /**
   * 定位下拉框到 selected 元素下方
   * 与 script.js 的 positionDropdown 逻辑一致
   */
  #positionDropdown(selected, options) {
    const rect = selected.getBoundingClientRect();
    const gap = 4;
    options.style.width = `${rect.width}px`;
    options.style.transform = '';
    options.style.left = `${rect.left}px`;

    const viewportHeight = window.innerHeight;
    // 临时显示测量实际高度（用 .show 类触发 display:block）
    options.style.visibility = 'hidden';
    options.classList.add('show');
    const actualHeight = options.offsetHeight || 100;
    options.classList.remove('show');
    options.style.visibility = '';

    const spaceBelow = viewportHeight - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    // 阈值：下方空间不足 1.5 倍高度时优先向上展开
    const threshold = 1.5;

    if (spaceAbove >= actualHeight && spaceBelow < actualHeight * threshold) {
      options.style.top = `${rect.top - actualHeight - gap}px`;
    } else if (spaceBelow >= actualHeight) {
      options.style.top = `${rect.bottom + gap}px`;
    } else if (spaceAbove >= actualHeight) {
      options.style.top = `${rect.top - actualHeight - gap}px`;
    } else {
      options.style.top = `${rect.bottom + gap}px`;
    }
  }

  #disablePageScroll() {
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
      mainContent.classList.add('dropdown-open');
      this.#scrollPreventHandler = (e) => e.preventDefault();
      mainContent.addEventListener('wheel', this.#scrollPreventHandler, { passive: false });
    }
  }

  #enablePageScroll() {
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
      mainContent.classList.remove('dropdown-open');
      if (this.#scrollPreventHandler) {
        mainContent.removeEventListener('wheel', this.#scrollPreventHandler);
        this.#scrollPreventHandler = null;
      }
    }
  }
}

import { ApiBridge } from '../../core/ApiBridge.js';
import { AppState } from '../../core/AppState.js';
import { Toast } from '../../components/toast.js';
// R24 P1-6: 统一 core Promise 版 confirm (原 view 回调版已删)
import { showConfirmModal } from '../../core/utils/confirmModal.js';

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
    // 启动时自动检查更新 (如启用)
    if (this.#model.autoCheckUpdate !== false) {
      setTimeout(() => {
        this.#model.checkForUpdate();
      }, 2000);
    }
  }

  destroy() {
    this.#destroyed = true;
    this.#unbinds.forEach((fn) => fn());
    this.#unbinds = [];
    this.#unbindModel.forEach((fn) => fn());
    this.#unbindModel = [];
    this.#model.destroy();
  }

  /**
   * Tab 被激活时调用
   * 确保下拉框状态正确（修复其他 tab 操作后下拉失效的问题）
   */
  onTabActivated() {
    // 关闭可能残留的 dropdown-open 状态 + 所有 show 状态的下拉
    this.#view.closeAllDropdowns();
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
      Toast?.success(window.i18n.t('settings.alreadyLatest'));
    });

    this.#on(model, 'download-progress', (progress) => {
      this.#view.updateDownloadProgress(progress);
    });

    this.#on(model, 'update-downloaded', () => {
      this.#view.updateDownloadButton('downloaded');
    });

    this.#on(model, 'error', (err) => {
      const source = err.source || '';
      const failedKey = `settings.${source}Failed`;
      const translated = source ? window.i18n.t(failedKey) : '';
      let msg;
      if (translated && translated !== failedKey) {
        // checkUpdate 优先用 updateErrorCodes 映射具体原因
        if (source === 'checkUpdate' && err.code) {
          const codeKey = `settings.updateErrorCodes.${err.code}`;
          const codeMsg = window.i18n.t(codeKey);
          const codeTranslated = codeMsg && codeMsg !== codeKey;
          const reason = codeTranslated ? codeMsg : err.error?.message || '';
          msg = reason ? `${translated}: ${reason}` : translated;
        } else {
          msg = translated;
        }
      } else {
        msg = err.error?.message || err.message || err.source || String(err);
      }
      Toast?.error(msg);
    });
  }

  // ─── DOM 事件绑定 ────────────────────────────────────────

  #bindDomEvents() {
    // 暗色模式切换
    this.#bindToggle('dark-mode-toggle', (checked) => {
      this.#model.applyDarkMode(checked);
      this.#model.saveConfig({ dark_mode: checked });
    });

    // 主题色选项 - 点击选项选择颜色
    this.#unbinds.push(
      this.#view.bindThemeColorOptionsClick((color) => {
        this.#model.applyThemeColor(color);
        this.#model.saveConfig({ theme_color: color });
      })
    );

    // 主题色 HEX 输入
    this.#unbinds.push(
      this.#view.bindThemeColorHexChange((color) => {
        this.#model.applyThemeColor(color);
        this.#model.saveConfig({ theme_color: color });
      })
    );

    // 默认测试目录 - 浏览
    this.#bindClick('browse-default-directory', async () => {
      const result = await this.#model.selectDirectory();
      if (result && !result.canceled && result.filePaths.length > 0) {
        const path = result.filePaths[0];
        // MVC: input value 通过 view.setDefaultTestDirectory
        this.#view.setDefaultTestDirectory(path);
        this.#model.saveConfig({ default_download_directory: path });
      }
    });

    // 默认测试目录 - 清除
    this.#bindClick('clear-default-directory', () => {
      // MVC: input value 通过 view.setDefaultTestDirectory
      this.#view.setDefaultTestDirectory('');
      this.#model.saveConfig({ default_download_directory: '' });
    });

    // 配置存储路径 - 浏览
    this.#bindClick('browse-config-storage', async () => {
      const result = await this.#model.selectDirectory();
      if (result && !result.canceled && result.filePaths.length > 0) {
        const newPath = result.filePaths[0];
        // 禁止选择程序安装目录 (及子目录) 作配置存放路径, 防止更新时配置丢失
        if (await this.#isInsideProgramDir(newPath)) {
          await showConfirmModal(
            window.i18n.t('settings.configPathForbiddenTitle'),
            window.i18n.t('settings.configPathForbiddenMessage')
          );
          return;
        }
        const ok = await showConfirmModal(
          window.i18n.t('settings.confirmChangeConfigPath'),
          window.i18n.t('settings.changeConfigPathMessage')
        );
        if (ok) {
          await this.#model.changeDataPath(newPath);
        }
      }
    });

    // 配置存储路径 - 重置
    this.#bindClick('reset-config-storage', async () => {
      const ok = await showConfirmModal(
        window.i18n.t('settings.confirmResetConfigPath'),
        window.i18n.t('settings.resetConfigPathMessage')
      );
      if (ok) {
        await this.#model.resetDataPath();
      }
    });

    // 语言选择 - 选项点击
    this.#unbinds.push(
      this.#view.bindLanguageOptionsClick((lang) => {
        this.#model.changeLanguage(lang);
        this.#model.saveConfig({ language: lang });
      })
    );

    // 语言下拉框：将 options 移到 body
    this.#view.moveLanguageOptionsToBody();

    // 通知平台选择 - 选项点击
    this.#unbinds.push(
      this.#view.bindNotificationOptionsClick((platform) => {
        const notification = { ...this.#model.notification, platform };
        this.#model.get('notification').platform = platform;
        this.#view.updateNotificationConfig(notification);
        this.#model.saveNotificationConfig();
      })
    );

    // 通知平台下拉框：将 options 移到 body
    this.#view.moveNotificationOptionsToBody();

    // 钉钉 access_token
    this.#unbinds.push(
      this.#view.bindAccessTokenChange(() => {
        this.#model.get('notification').dingtalk = this.#model.get('notification').dingtalk || {};
        this.#model.get('notification').dingtalk.access_token = this.#view.getAccessToken();
        this.#model.saveNotificationConfig();
      })
    );

    // 钉钉 secret
    this.#unbinds.push(
      this.#view.bindSecretChange(() => {
        this.#model.get('notification').dingtalk = this.#model.get('notification').dingtalk || {};
        this.#model.get('notification').dingtalk.secret = this.#view.getSecret();
        this.#model.saveNotificationConfig();
      })
    );

    // 导出配置
    this.#bindClick('export-config-btn', async () => {
      const result = await this.#model.selectExportPath();
      if (result && !result.canceled && result.filePath) {
        this.#view.setButtonLoading('export-config-btn', true);
        try {
          const res = await this.#model.exportConfig(result.filePath);
          if (res && res.success) {
            Toast?.success(window.i18n.t('settings.exportConfigSuccess'));
          } else {
            Toast?.error(res?.error || window.i18n.t('settings.exportConfigFailed'));
          }
        } catch (error) {
          Toast?.error(error?.message || window.i18n.t('settings.exportConfigFailed'));
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
          const res = await this.#model.exportLogs(result.filePath);
          if (res && res.success) {
            Toast?.success(window.i18n.t('settings.exportLogsSuccess'));
          } else {
            Toast?.error(res?.error || window.i18n.t('settings.exportLogsFailed'));
          }
        } catch (error) {
          Toast?.error(error?.message || window.i18n.t('settings.exportLogsFailed'));
        } finally {
          this.#view.setButtonLoading('export-logs-btn', false);
        }
      }
    });

    // 导入配置
    this.#bindClick('import-config-btn', async () => {
      const result = await this.#model.selectImportPath();
      if (result && !result.canceled && result.filePaths?.length > 0) {
        const ok = await showConfirmModal(
          window.i18n.t('settings.importConfig'),
          window.i18n.t('settings.importConfigConfirm')
        );
        if (!ok) return;
        // wrapper 已处理 IPC 失败,错误由 model 层 catch emit + 外层 try-catch 接
        const importResult = await this.#model.importConfig(result.filePaths[0]);
        // R27 P2-6: 检查 success — 失败时 model 已 emit error toast, 原无条件弹成功造成
        // "失败 + 成功"双 toast 误导
        if (importResult?.success) {
          Toast?.success(window.i18n.t('settings.importConfigSuccess'));
        }
        if (importResult?.success && importResult.needRestart) {
          // R24 P1-6: 链式确认用嵌套 await (原 _keepModalOpen 标记已随 view 桥接删除)
          const okRestart = await showConfirmModal(
            window.i18n.t('settings.restartRequired'),
            window.i18n.t('settings.restartMessage')
          );
          if (okRestart) {
            await this.#model.relaunchApp();
          }
        }
      }
    });

    // 清理 Allure 报告
    this.#bindClick('clear-allure-reports-btn', async () => {
      const ok = await showConfirmModal(
        window.i18n.t('settings.clearAllureReports'),
        window.i18n.t('settings.clearAllureReportsConfirm')
      );
      if (!ok) return;
      // wrapper 已处理 IPC 失败,错误由 model 层 catch emit
      await this.#model.clearAllureReports();
      Toast?.success(window.i18n.t('settings.clearAllureReportsSuccess'));
    });

    // 清理所有日志
    this.#bindClick('clear-all-logs-btn', async () => {
      const ok = await showConfirmModal(
        window.i18n.t('settings.clearAllLogs'),
        window.i18n.t('settings.clearAllLogsConfirm')
      );
      if (!ok) return;
      // wrapper 已处理 IPC 失败,错误由 model 层 catch emit
      await this.#model.clearAllLogs();
      Toast?.success(window.i18n.t('settings.clearAllLogsSuccess'));
    });

    // 自动检查更新
    this.#bindToggle('auto-check-update-toggle', (checked) => {
      this.#model.saveConfig({ autoCheckUpdate: checked });
    });

    // 允许不安全 SSL 连接 (解决代理/加速导致的证书校验失败)
    this.#bindToggle('allow-insecure-ssl-toggle', async (checked) => {
      await this.#model.saveConfig({ allowInsecureSSL: checked });
      if (checked) {
        Toast?.warning(window.i18n.t('settings.allowInsecureSSLWarning'));
      }
    });

    // 防止睡眠
    this.#bindToggle('prevent-sleep-toggle', async (checked) => {
      // wrapper 已处理 IPC 失败,错误由 model 层 catch emit
      await this.#model.setPreventSleep(checked);
      this.#model.saveConfig({ preventSleep: checked });
    });

    // 通知 access_token / secret 显隐切换 (默认 password 隐藏)
    this.#bindClick('notification-access-token-visibility-toggle', () => {
      this.#toggleSecretVisibility('notification-access-token', 'notification-access-token-visibility-toggle');
    });
    this.#bindClick('notification-secret-visibility-toggle', () => {
      this.#toggleSecretVisibility('notification-secret', 'notification-secret-visibility-toggle');
    });

    // 检查更新
    this.#bindClick('check-update-btn', async () => {
      this.#view.setButtonLoading('check-update-btn', true);
      try {
        await this.#model.checkForUpdate();
      } finally {
        this.#view.setButtonLoading('check-update-btn', false);
      }
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

    // 更新弹窗 - 关闭按钮 / 取消按钮 (R27: 下载中点取消/叉 → 真正 abort 下载 + toast 提示)
    const handleUpdateCancel = async () => {
      try {
        const result = await this.#model.cancelDownload();
        // R27: 仅真实中止 (action='cancelled') 弹 toast; 无活跃下载 (action='no_active',
        // 如下载已完成/就绪态点取消=推迟安装) 静默关窗, 不报 no_active_download 打扰
        if (result && result.success && result.action === 'cancelled') {
          Toast.success(window.i18n.t('settings.downloadCancelled'));
        }
      } catch (e) {
        /* 取消失败不阻塞关窗 */
      }
      this.#view.hideUpdateModal();
    };
    this.#bindClick('update-modal-close-btn', handleUpdateCancel);
    this.#bindClick('update-cancel-btn', handleUpdateCancel);

    // GitHub 链接
    this.#bindClick('github-repo-link', () => {
      this.#model.openExternal('https://github.com/RingOnTheWay/XKAutoTester');
    });

    // 全局点击：处理下拉框开关 + 关闭（捕获阶段，确保在 app.js 的冒泡阶段 handler 之前执行）
    this.#unbinds.push(
      this.#view.bindGlobalClickForDropdowns({
        onLanguageToggle: () => {
          this.#view.toggleLanguageDropdown();
        },
        onNotificationToggle: () => {
          this.#view.toggleNotificationDropdown();
        },
        onThemeToggle: () => {
          this.#view.toggleThemeColorOptions();
        },
        onOutsideClick: () => {
          this.#view.hideAllCustomSelectOptions();
          this.#view.hideThemeColorOptions();
          this.#view.enablePageScroll();
        },
      })
    );

    // R24 P1-6: settings 本地 confirm 事件委托已删 — core/utils/confirmModal.js
    // Promise 版自行绑定按钮 + 管理弹窗生命周期, 不再依赖全局回调通道与
    // document 委托 (原三份 bindGlobalClickForConfirmModal 重复, 且回调覆盖致
    // 并发弹窗前者 Promise 挂起)。

    // 导出/导入进度监听
    this.#bindProgressListeners();
  }

  // ─── 进度监听 ────────────────────────────────────────────

  #bindProgressListeners() {
    if (ApiBridge.api.onExportProgress) {
      const removeExport = ApiBridge.api.onExportProgress((data) => {
        if (data?.percent !== undefined) {
          Toast?.info(`${window.i18n.t('settings.exporting')} ${data.percent}%`);
        }
      });
      this.#unbinds.push(() => {
        if (removeExport) removeExport();
      });
    }

    if (ApiBridge.api.onImportProgress) {
      const removeImport = ApiBridge.api.onImportProgress((data) => {
        if (data?.percent !== undefined) {
          Toast?.info(`${window.i18n.t('settings.importing')} ${data.percent}%`);
        }
      });
      this.#unbinds.push(() => {
        if (removeImport) removeImport();
      });
    }
  }

  // ─── 工具方法 ────────────────────────────────────────────

  #on(model, event, handler) {
    const unsub = model.on(event, handler);
    this.#unbindModel.push(unsub);
  }

  #bindClick(elementId, handler) {
    this.#unbinds.push(this.#view.bindClickById(elementId, handler));
  }

  #bindToggle(elementId, handler) {
    this.#unbinds.push(this.#view.bindToggleById(elementId, handler));
  }

  /**
   * 判断目标路径是否等于程序安装目录或其子目录
   * 用 app.getPath('exe') 父目录作安装目录, 通过 ApiBridge.api.getProjectInfo().exeDir 拿
   * @param {string} targetPath - 用户选择的路径
   * @returns {Promise<boolean>} - 需 await, 但此处用同步缓存: 调 getProjectInfo 拿 exeDir 后比较
   */
  async #isInsideProgramDir(targetPath) {
    try {
      const info = await ApiBridge.api.getProjectInfo();
      const exeDir = info?.exeDir;
      if (!exeDir || !targetPath) return false;
      const normalize = (p) =>
        p
          .replace(/[\\/]+/g, '\\')
          .replace(/\\$/, '')
          .toLowerCase();
      const a = normalize(targetPath);
      const b = normalize(exeDir);
      return a === b || a.startsWith(b + '\\');
    } catch (e) {
      return false;
    }
  }

  /**
   * 切换通知密钥输入框的显隐: password ↔ text, 同步切换按钮图标 (visibility/visibility_off)
   * @param {string} inputId - input 元素 id
   * @param {string} buttonId - 触发切换的按钮元素 id
   */
  #toggleSecretVisibility(inputId, buttonId) {
    const input = document.getElementById(inputId);
    const button = document.getElementById(buttonId);
    if (!input || !button) return;
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    const nextIcon = isHidden ? 'visibility_off' : 'visibility';
    const iconSpan = button.querySelector('.svg-icon');
    if (iconSpan) {
      iconSpan.setAttribute('data-icon', nextIcon);
      const html = window.__XKAT_APP__?.getIconHtml?.(nextIcon);
      if (html) iconSpan.innerHTML = html;
    }
  }
}

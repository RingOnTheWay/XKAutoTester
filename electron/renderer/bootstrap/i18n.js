/**
 * I18nCoordinator - 渲染层 i18n 初始化与文本刷新 (R26 候选③, 自 app.js 拆出)
 *
 * 职责:
 * - 初始化: 接 preload 注入的 window.electronAPI.i18n (已按用户偏好语言初始化)
 * - updateUIText: 按 data-i18n / data-i18n-placeholder / data-i18n-title 刷新元素
 * - changeLanguage: 切语言 + 全量刷新 (含组件容器与语言选择器显示)
 *
 * 拆分动机: 引导层应是薄组合根, i18n 刷新是独立关注 —— 现可单独测试。
 */

const LANGUAGE_NAMES = { 'zh-CN': '简体中文', 'en-US': 'English' };

export class I18nCoordinator {
  /** 初始化: 暴露 preload 的 i18n 实例到 window.i18n */
  async initialize() {
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
      window.i18n
        .changeLanguage(language)
        .then(() => {
          this.updateUIText();
          this.updateComponentTranslations();
          this.updateLanguageSelectorText(language);
        })
        .catch((error) => {
          console.error('语言切换失败:', error);
        });
    }
  }

  /** 更新设置页语言选择器的显示文本 */
  updateLanguageSelectorText(language) {
    const selectedSpan = document.querySelector('#custom-language-selected .custom-select__text');
    if (selectedSpan) {
      selectedSpan.textContent = LANGUAGE_NAMES[language] || language;
    }
  }

  /**
   * 刷新 scope 内所有 data-i18n* 元素
   * @param {Document|Element} [scope] - 刷新范围, 缺省整文档
   */
  updateUIText(scope = document) {
    if (!window.i18n) return;
    const root = scope || document;
    root.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      if (key) {
        const translation = window.i18n.t(key);
        if (translation) el.textContent = translation;
      }
    });
    root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (key) {
        const translation = window.i18n.t(key);
        if (translation) el.placeholder = translation;
      }
    });
    root.querySelectorAll('[data-i18n-title]').forEach((el) => {
      const key = el.getAttribute('data-i18n-title');
      if (key) {
        const translation = window.i18n.t(key);
        if (translation) el.title = translation;
      }
    });
  }

  /** 刷新 confirm-modal 组件容器内的翻译 */
  updateComponentTranslations() {
    const container = document.getElementById('confirm-modal-container');
    if (container) this.updateUIText(container);
  }
}

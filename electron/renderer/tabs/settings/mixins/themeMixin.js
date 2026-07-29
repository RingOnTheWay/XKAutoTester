/**
 * Theme Mixin - 主题色与暗色模式相关方法
 *
 * 从 SettingsView 提取，通过 Object.assign 绑定到原型。
 */

import { SettingsModel } from '../model.js';

export const themeMixin = {
  // ─── Dark Mode ─────────────────────────────────────────────────

  applyDarkMode(isDark) {
    document.body.classList.toggle('dark-theme', isDark);
  },

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
  },

  /**
   * 隐藏主题色选项面板
   */
  hideThemeColorOptions() {
    const { themeColorOptions } = this.els;
    if (themeColorOptions) themeColorOptions.classList.remove('show');
  },

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
  },

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
  },

  /**
   * 设置主题色 HEX 输入框的值
   * @param {string} color
   */
  setThemeColorHex(color) {
    const { themeColorHex } = this.els;
    if (themeColorHex) themeColorHex.value = color;
  },

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
  },
};

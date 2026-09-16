import { BaseModel } from '../../../core/BaseModel.js';
import { AppState } from '../../../core/AppState.js';

/**
 * ThemeModel - 主题/语言状态 (settings 拆分, R26 候选②)
 *
 * 状态: darkMode / themeColor / language。
 * 由 facade (../model.js) 在 config-changed 时调用 applyFromConfig 同步。
 * 颜色数学工具在 core/utils/color.js (view 直接用, 不经 model)。
 */
export class ThemeModel extends BaseModel {
  constructor() {
    super({
      darkMode: false,
      themeColor: '#4CAF50',
      language: 'zh-CN',
    });
  }

  get darkMode() {
    return this.get('darkMode');
  }

  get themeColor() {
    return this.get('themeColor');
  }

  get language() {
    return this.get('language');
  }

  /**
   * 从 APP_SETTINGS 同步主题/语言状态 (config 加载/导入后由 facade 调用)。
   * 相等值短路不发事件 —— 与原 SettingsModel.loadConfig 行为一致。
   * @param {object} settings - config.APP_SETTINGS
   */
  applyFromConfig(settings = {}) {
    this.set('darkMode', !!settings.dark_mode, 'dark-mode-changed');
    this.set('themeColor', settings.theme_color || '#4CAF50', 'theme-color-changed');
    this.set('language', settings.language || 'zh-CN', 'language-changed');
  }

  applyDarkMode(isDark) {
    this.set('darkMode', isDark, 'dark-mode-changed');
  }

  applyThemeColor(color) {
    this.set('themeColor', color, 'theme-color-changed');
  }

  /**
   * 切换语言 (同时同步 AppState.locale 供其他 tab 读取)
   */
  changeLanguage(lang) {
    this.set('language', lang, 'language-changed');
    AppState.instance.set('locale', lang);
  }
}

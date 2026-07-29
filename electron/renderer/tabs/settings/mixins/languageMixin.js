/**
 * Language Mixin - 语言选择器相关方法
 *
 * 从 SettingsView 提取，通过 Object.assign 绑定到原型。
 */

export const languageMixin = {
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
  },

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
        customLanguageOptions.querySelectorAll('.custom-select__option').forEach(opt => opt.classList.remove('selected'));
        option.classList.add('selected');
      }
      customLanguageOptions.classList.remove('show');
      this.enablePageScroll();
    };
    customLanguageOptions.addEventListener('click', listener);
    return () => customLanguageOptions.removeEventListener('click', listener);
  },

  /**
   * 将语言下拉选项移到 body（避免父容器 transform 影响定位）
   */
  moveLanguageOptionsToBody() {
    const { customLanguageOptions, customLanguageSelected } = this.els;
    if (customLanguageOptions && customLanguageSelected && !customLanguageOptions.dataset.moved) {
      document.body.appendChild(customLanguageOptions);
      customLanguageOptions.dataset.moved = 'true';
    }
  },

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
  },
};

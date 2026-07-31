/**
 * Notification Mixin - 通知平台（钉钉）相关方法
 *
 * 从 SettingsView 提取，通过 Object.assign 绑定到原型。
 */

export const notificationMixin = {
  updateNotificationConfig(notification) {
    if (!notification) return;
    const platform = notification.platform || 'none';

    // 更新平台选择
    if (this.els.customNotificationPlatformSelected) {
      const textSpan = this.els.customNotificationPlatformSelected.querySelector('.custom-select__text');
      if (textSpan) {
        const labels = { 'none': window.i18n.t('settings.none'), 'dingtalk': window.i18n.t('settings.dingtalk') };
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
  },

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
        customNotificationPlatformOptions.querySelectorAll('.custom-select__option').forEach(opt => opt.classList.remove('selected'));
        option.classList.add('selected');
      }
      customNotificationPlatformOptions.classList.remove('show');
      this.enablePageScroll();
    };
    customNotificationPlatformOptions.addEventListener('click', listener);
    return () => customNotificationPlatformOptions.removeEventListener('click', listener);
  },

  /**
   * 将通知平台下拉选项移到 body
   */
  moveNotificationOptionsToBody() {
    const { customNotificationPlatformOptions, customNotificationPlatformSelected } = this.els;
    if (customNotificationPlatformOptions && customNotificationPlatformSelected && !customNotificationPlatformOptions.dataset.moved) {
      document.body.appendChild(customNotificationPlatformOptions);
      customNotificationPlatformOptions.dataset.moved = 'true';
    }
  },

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
  },

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
  },

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
  },

  /**
   * 获取钉钉 access_token 输入框的值
   * @returns {string}
   */
  getAccessToken() {
    const { notificationAccessToken } = this.els;
    return notificationAccessToken?.value || '';
  },

  /**
   * 获取钉钉 secret 输入框的值
   * @returns {string}
   */
  getSecret() {
    const { notificationSecret } = this.els;
    return notificationSecret?.value || '';
  },
};

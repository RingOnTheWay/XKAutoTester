// Control Params Mixin for AndroidConnectionView
// Extracted from view.js during refactor
// Provides: control-params load/collect, custom-select get/set, floating tooltip

export const controlParamsMixin = {
  // ─── 控制参数 ──────────────────────────────────────────────────

  loadControlParamsValues(params) {
    const { maxSize, videoBitRate, maxFps, alwaysOnTop } = this.els;
    if (maxSize) maxSize.value = params.max_size || '';
    if (videoBitRate) videoBitRate.value = params.video_bit_rate || '';
    if (maxFps) maxFps.value = params.max_fps || '';
    if (alwaysOnTop) alwaysOnTop.checked = params.always_on_top || false;
    this.setCustomSelectValue('video-codec', params.video_codec || 'h264');
  },

  collectControlParams() {
    const { maxSize, videoBitRate, maxFps, alwaysOnTop } = this.els;
    return {
      max_size: maxSize?.value || null,
      video_bit_rate: videoBitRate?.value || null,
      max_fps: maxFps?.value || null,
      video_codec: this.getCustomSelectValue('video-codec') || null,
      always_on_top: alwaysOnTop?.checked || false,
    };
  },

  setCustomSelectValue(wrapperId, value) {
    const wrapper = document.getElementById(wrapperId);
    if (!wrapper) return;
    const optionsEl = document.getElementById(`${wrapperId}-options`);
    if (!optionsEl) return;

    const selected = wrapper.querySelector('.custom-select__text');
    optionsEl.querySelectorAll('.custom-select__option').forEach(option => {
      if (option.dataset.value === value) {
        option.classList.add('selected');
        if (selected) selected.textContent = option.querySelector('span')?.textContent || option.textContent;
      } else {
        option.classList.remove('selected');
      }
    });
  },

  getCustomSelectValue(wrapperId) {
    const optionsEl = document.getElementById(`${wrapperId}-options`);
    if (!optionsEl) return null;
    const selectedOption = optionsEl.querySelector('.custom-select__option.selected');
    return selectedOption ? selectedOption.dataset.value : null;
  },

  // ─── 浮动提示 ──────────────────────────────────────────────────

  showFloatingTooltip(element, message, type = 'info', duration = 3000) {
    // 移除已有提示
    const existing = document.querySelector('.floating-tooltip');
    if (existing) existing.remove();

    const tooltip = document.createElement('div');
    tooltip.className = 'floating-tooltip';
    tooltip.textContent = message;

    tooltip.style.cssText = 'position:absolute;z-index:1000;padding:8px 12px;border-radius:4px;font-size:12px;white-space:nowrap;opacity:0;transform:translateY(10px);transition:opacity 0.3s ease,transform 0.3s ease;';

    // 根据类型设置颜色
    switch (type) {
      case 'error':
        tooltip.style.backgroundColor = '#ffebee';
        tooltip.style.color = '#c62828';
        tooltip.style.border = '1px solid #ef5350';
        break;
      case 'success':
        tooltip.style.backgroundColor = '#e8f5e8';
        tooltip.style.color = '#2e7d32';
        tooltip.style.border = '1px solid #4caf50';
        break;
      case 'info':
      default:
        tooltip.style.backgroundColor = '#e3f2fd';
        tooltip.style.color = '#1565c0';
        tooltip.style.border = '1px solid #2196f3';
        break;
    }

    document.body.appendChild(tooltip);

    // 计算位置
    const elementRect = element.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    tooltip.style.left = `${elementRect.left + (elementRect.width - tooltipRect.width) / 2}px`;
    tooltip.style.top = `${elementRect.bottom + 8}px`;

    // 显示
    setTimeout(() => {
      tooltip.style.opacity = '1';
      tooltip.style.transform = 'translateY(0)';
    }, 10);

    // 自动隐藏
    setTimeout(() => {
      tooltip.style.opacity = '0';
      tooltip.style.transform = 'translateY(10px)';
      setTimeout(() => {
        if (document.body.contains(tooltip)) tooltip.remove();
      }, 300);
    }, duration);

    return tooltip;
  },
};

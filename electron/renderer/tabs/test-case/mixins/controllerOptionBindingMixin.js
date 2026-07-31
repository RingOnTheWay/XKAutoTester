// Option binding mixin for TestCaseController
// Extracted from controller.js during refactor
// Provides: app/platform/markers option click delegation + marker badge remove
// (bindAppOptionClicks, bindPlatformOptionClicks, bindMarkersOptionClicks, syncMarkerOptionsState, bindMarkerBadgeRemove)

export const controllerOptionBindingMixin = {
  // ─── App / Platform / Markers 选项点击绑定 ────────────────

  bindAppOptionClicks() {
    const optionsContainer = this.view.els.appOptions;
    if (!optionsContainer) return;

    // 使用事件委托（避免每次重新渲染后重新绑定）
    if (optionsContainer.__tcAppOptionBound) return;
    optionsContainer.__tcAppOptionBound = true;

    optionsContainer.addEventListener('click', (e) => {
      const option = e.target.closest('.custom-select__option:not(.disabled)');
      if (!option) return;
      e.stopPropagation();

      const appId = option.dataset.value;
      const appName = option.dataset.name || option.querySelector('span')?.textContent || '';

      // MVC: 选中态 classList 通过 view.markOptionSelected
      this.view.markOptionSelected(optionsContainer, option);

      // 更新显示文本
      this.view.setAppSelectedText(appName);

      // 隐藏下拉框
      this.view.closeDropdown(optionsContainer);

      // 通知 model
      const apps = this.model.get('apps');
      const app = apps?.find(a => a.id === appId);
      if (app) this.handleAppSelect(appId);
    });
  },

  bindPlatformOptionClicks() {
    const optionsContainer = this.view.els.platformSelectWrapperOptions;
    if (!optionsContainer) return;

    if (optionsContainer.__tcPlatformOptionBound) return;
    optionsContainer.__tcPlatformOptionBound = true;

    optionsContainer.addEventListener('click', (e) => {
      const option = e.target.closest('.custom-select__option');
      if (!option) return;
      e.stopPropagation();

      const platformValue = option.dataset.value;

      // MVC: 选中态 classList 通过 view.markOptionSelected
      this.view.markOptionSelected(optionsContainer, option);

      // 更新显示文本
      const label = option.querySelector('span')?.textContent || platformValue;
      this.view.setPlatformSelectedText(label);

      // 隐藏下拉框
      this.view.closeDropdown(optionsContainer);

      // 通知 model
      this.handlePlatformSelect(platformValue);
    });
  },

  bindMarkersOptionClicks() {
    const optionsContainer = this.view.els.markersOptions;
    if (!optionsContainer) return;

    if (optionsContainer.__tcMarkersOptionBound) return;
    optionsContainer.__tcMarkersOptionBound = true;

    optionsContainer.addEventListener('click', (e) => {
      const option = e.target.closest('.custom-select__option:not(.disabled)');
      if (!option) return;
      e.stopPropagation();

      const value = option.dataset.value;

      // MVC: markers 多选 toggle 通过 view.toggleMarkerOption
      this.view.toggleMarkerOption(option);

      // 通知 model（会触发 markers-changed → renderSelectedMarkers + bindMarkerBadgeRemove）
      this.handleMarkerToggle(value);
    });
  },

  /**
   * 同步 markers 下拉框选项的选中状态
   * MVC: 批量 classList 操作委托给 view
   */
  syncMarkerOptionsState(markers) {
    const optionsContainer = this.view.els.markersOptions;
    if (!optionsContainer) return;
    this.view.syncMarkerOptionsState(optionsContainer, markers);
  },

  /**
   * 绑定 marker 徽章的移除点击事件
   */
  bindMarkerBadgeRemove() {
    const selectedContainer = this.view.els.markersSelected;
    if (!selectedContainer) return;

    selectedContainer.querySelectorAll('.marker-badge-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const marker = btn.dataset.marker;
        if (marker) {
          this.handleMarkerToggle(marker);
        }
      });
    });
  },
};

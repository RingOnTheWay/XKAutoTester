// optionRenderer — TestCaseView 选项面板渲染域 (R28 候选③ 拆分)
// 从 tabs/test-case/view.js 拆出: 应用/平台/标记/蓝牙设备 选项渲染与选择初始化。
// 保持方法体 / this 引用不变 (this 指向 TestCaseView 实例), 由 view.js 在类后
// Object.assign 到 TestCaseView.prototype。
export const optionRenderer = {
  renderSelectedApp(app) {
    // 更新选中应用的显示
    this._currentApp = app;
    if (this.els.appSelected) {
      this.els.appSelected.textContent = app?.name || '';
    }
  },

  renderSelectedPlatform(platform) {
    // 更新选中平台的显示
    this._currentPlatform = platform;
    if (this.els.platformSelected) {
      this.els.platformSelected.textContent = platform || 'android';
    }
  },

  renderSelectedMarkers(markers) {
    this.updateMarkersDisplay(markers);
  },

  renderBleDevices(devices) {
    // BLE 设备列表已存储，供步骤渲染时使用
    this._bleDevices = devices;
  },

  // ═════════════════════════════════════════════════════════════════
  // ─── App/Platform/Markers Select + Custom Select (原 selectMixin) ─
  // ═════════════════════════════════════════════════════════════════

  renderAppOptions(apps, selectedAppId) {
    const optionsContainer = this.els.appOptions;
    if (!optionsContainer) return;

    if (apps.length === 0) {
      optionsContainer.innerHTML = `<div class="custom-select__option disabled"><span>${window.i18n.t('pagePackage.noApps')}</span></div>`;
      return;
    }

    optionsContainer.innerHTML = apps
      .map((app) => {
        const safeName = this.escapeHtml(app.name);
        const safeId = this.escapeHtml(app.id);
        return `
            <div class="custom-select__option${selectedAppId?.id === app.id ? ' selected' : ''}" data-value="${safeId}" data-name="${safeName}">
                <span>${safeName}</span>
            </div>
        `;
      })
      .join('');
  },

  renderPlatformOptions(platforms, selectedPlatform) {
    // 使用 platformSelectWrapperOptions（script.js 动态生成的 options 容器 ID 为 tc-platform-select-wrapper-options）
    const optionsContainer = this.els.platformSelectWrapperOptions;
    if (!optionsContainer) return;

    optionsContainer.innerHTML = platforms
      .map(
        (platform) => `
            <div class="custom-select__option${selectedPlatform === platform.value ? ' selected' : ''}" data-value="${platform.value}">
                <span>${platform.label}</span>
            </div>
        `
      )
      .join('');
  },

  renderMarkersOptions(markers, selectedMarkers) {
    const optionsContainer = this.els.markersOptions;
    if (!optionsContainer) return;

    if (!markers || markers.length === 0) {
      optionsContainer.innerHTML = `<div class="custom-select__option disabled"><span>${window.i18n.t('testExecution.noMarkers')}</span></div>`;
      return;
    }

    optionsContainer.innerHTML = markers
      .map((marker) => {
        const safeName = this.escapeHtml(marker.name);
        const safeDescription = this.escapeHtml(marker.description || '');
        return `
            <div class="custom-select__option${selectedMarkers.includes(marker.name) ? ' selected' : ''}" data-value="${safeName}" data-description="${safeDescription}">
                <span>${safeName}</span>
            </div>
        `;
      })
      .join('');
  },

  updateMarkersDisplay(selectedMarkers) {
    const selectedContainer = this.els.markersSelected;
    if (!selectedContainer) return;

    const textSpan = selectedContainer.querySelector('.custom-select__text');
    if (!textSpan) return;

    if (selectedMarkers.length === 0) {
      textSpan.textContent = window.i18n.t('placeholders.selectMarkers');
      return;
    }

    // Build badges HTML
    let badgesHtml = '';
    selectedMarkers.forEach((marker) => {
      const safe = this.escapeHtml(marker);
      badgesHtml += `<span class="marker-badge" data-marker="${safe}">${safe}<span class="marker-badge-remove" data-marker="${safe}">x</span></span>`;
    });
    textSpan.innerHTML = badgesHtml;
  },

  /**
   * 初始化应用选择下拉框
   */
  initAppSelect() {
    const select = this.els.appSelect;
    if (!select || select.dataset.initialized === 'true') return;

    const selected = select.querySelector('.custom-select__selected');
    const options = this.els.appOptions;
    if (!selected || !options) return;

    document.body.appendChild(options);
    select.dataset.initialized = 'true';

    selected.addEventListener('click', (e) => {
      e.stopPropagation();
      const isShowing = options.classList.contains('show');
      if (!isShowing) {
        this.openDropdown(selected, options);
      } else {
        this.closeDropdown(options);
      }
    });
  },

  /**
   * 初始化平台选择下拉框
   */
  initPlatformSelect() {
    const select = this.els.platformSelectWrapperSelect;
    if (!select || select.dataset.initialized === 'true') return;

    const selected = select.querySelector('.custom-select__selected');
    const options = this.els.platformSelectWrapperOptions;
    if (!selected || !options) return;

    document.body.appendChild(options);
    select.dataset.initialized = 'true';

    selected.addEventListener('click', (e) => {
      e.stopPropagation();
      const isShowing = options.classList.contains('show');
      if (!isShowing) {
        this.openDropdown(selected, options);
      } else {
        this.closeDropdown(options);
      }
    });
  },

  /**
   * 初始化 Markers 多选下拉框
   */
  initMarkersSelect() {
    const select = this.els.markersSelect;
    if (!select || select.dataset.initialized === 'true') return;

    const selected = select.querySelector('.custom-select__selected');
    const options = this.els.markersOptions;
    if (!selected || !options) return;

    document.body.appendChild(options);
    select.dataset.initialized = 'true';

    selected.addEventListener('click', (e) => {
      e.stopPropagation();
      const isShowing = options.classList.contains('show');
      if (!isShowing) {
        this.openDropdown(selected, options);
      } else {
        this.closeDropdown(options);
      }
    });
  },

  /**
   * 切换 marker 选项的选中态（多选 toggle）
   * MVC: classList.toggle 归 view
   * @param {Element} optionEl - .custom-select__option 元素
   */
  toggleMarkerOption(optionEl) {
    if (!optionEl) return;
    optionEl.classList.toggle('selected');
  },

  /**
   * 批量同步 markers 选项的选中态
   * MVC: classList.toggle 批量归 view
   * @param {Element} optionsContainer - markers options 容器
   * @param {Array<string>} markers - 已选中的 marker 值列表
   */
  syncMarkerOptionsState(optionsContainer, markers) {
    if (!optionsContainer) return;
    optionsContainer.querySelectorAll('.custom-select__option').forEach((opt) => {
      opt.classList.toggle('selected', markers.includes(opt.dataset.value));
    });
  },

  /**
   * 更新 App 选中显示文本
   * @param {string} name
   */
  setAppSelectedText(name) {
    const selectedSpan = this.els.appSelected?.querySelector('.custom-select__text');
    if (selectedSpan) selectedSpan.textContent = name;
  },

  /**
   * 更新 Platform 选中显示文本
   * @param {string} label
   */
  setPlatformSelectedText(label) {
    const selectedSpan = this.els.platformSelected?.querySelector('.custom-select__text');
    if (selectedSpan) selectedSpan.textContent = label;
  },
};

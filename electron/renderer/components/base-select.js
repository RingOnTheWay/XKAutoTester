// BaseSelect: CascadeSelect / CustomSelect / DeviceCascadeSelect 的公共基类。
// 抽取共享的下拉开闭 / ARIA / 键盘导航 / 选项高亮 / 文档点击外部关闭 / 滚动锁逻辑。
// 静态 activeDropdown 与 _openInstances 在基类上管理，3 个子类共享单例开闭（同时只允许一个下拉打开）。
// 子类通过覆盖 _beforeOpen / _afterOpen / _afterClose / _getOptionSelector / _selectOptionElement /
// _isInsideComponent / _handleExtraKeys / _onEscapeKey 等钩子定制行为，public API 保持不变。
export class BaseSelect {
  static activeDropdown = null;
  static _openInstances = new Set();

  constructor() {
    this._activeIndex = -1;
  }

  // === 元素访问（子类可覆盖） ===

  _getDropdownEl() {
    return this.dropdownEl || this.optionsEl || null;
  }

  _getSelectedEl() {
    return this.selectedEl || null;
  }

  _getOptionsContainer() {
    return this.optionsEl || null;
  }

  _getOptionSelector() {
    return '.select__option';
  }

  // === ARIA ===

  _setupAria() {
    const selectedEl = this._getSelectedEl();
    const optionsEl = this._getOptionsContainer();
    if (selectedEl) {
      selectedEl.setAttribute('role', 'combobox');
      selectedEl.setAttribute('aria-haspopup', 'listbox');
      selectedEl.setAttribute('aria-expanded', 'false');
      selectedEl.setAttribute('tabindex', '0');
    }
    if (optionsEl) {
      optionsEl.setAttribute('role', 'listbox');
    }
  }

  _setAriaExpanded(expanded) {
    const selectedEl = this._getSelectedEl();
    if (selectedEl) {
      selectedEl.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    }
  }

  // === 开闭 ===

  _isDropdownOpen() {
    const el = this._getDropdownEl();
    return !!(el && el.classList.contains('show'));
  }

  _showDropdown() {
    const el = this._getDropdownEl();
    if (el) el.classList.add('show');
  }

  _hideDropdown() {
    const el = this._getDropdownEl();
    if (el) el.classList.remove('show');
  }

  _registerActiveDropdown() {
    BaseSelect.activeDropdown = this;
    BaseSelect._openInstances.add(this);
  }

  _unregisterActiveDropdown() {
    if (BaseSelect.activeDropdown === this) {
      BaseSelect.activeDropdown = null;
    }
    BaseSelect._openInstances.delete(this);
  }

  toggle() {
    if (this._isDropdownOpen()) {
      this.close();
    } else {
      this.open();
    }
  }

  open() {
    BaseSelect.closeAll();
    this._beforeOpen();
    this._showDropdown();
    this._setAriaExpanded(true);
    this._registerActiveDropdown();
    this._afterOpen();
  }

  close() {
    this._hideDropdown();
    this._setAriaExpanded(false);
    this._unregisterActiveDropdown();
    this._clearActive();
    this._afterClose();
  }

  // 子类覆盖钩子
  _beforeOpen() {}
  _afterOpen() {}
  _afterClose() {}

  // === 选项高亮（单级；多级子类需覆盖） ===

  _getVisibleOptions() {
    const container = this._getOptionsContainer();
    if (!container) return [];
    return Array.from(container.querySelectorAll(this._getOptionSelector())).filter(
      (opt) => opt.style.display !== 'none'
    );
  }

  _setActive(index) {
    const opts = this._getVisibleOptions();
    if (opts.length === 0) {
      this._activeIndex = -1;
      return;
    }
    if (index < 0) index = opts.length - 1;
    if (index >= opts.length) index = 0;

    opts.forEach((opt) => opt.classList.remove('active'));
    opts[index].classList.add('active');
    this._activeIndex = index;
    opts[index].scrollIntoView({ block: 'nearest' });
  }

  _moveActive(delta) {
    this._setActive(this._activeIndex + delta);
  }

  _clearActive() {
    const opts = this._getVisibleOptions();
    opts.forEach((opt) => opt.classList.remove('active'));
    this._activeIndex = -1;
  }

  _highlightSelectedOrDefault() {
    const opts = this._getVisibleOptions();
    const selectedIndex = opts.findIndex((opt) => opt.classList.contains('selected'));
    this._setActive(selectedIndex >= 0 ? selectedIndex : 0);
  }

  // === 键盘导航 ===

  _handleKeydown(e) {
    const key = e.key;
    const isOpen = this._isDropdownOpen();

    if (this._handleExtraKeys(e, key, isOpen)) return;

    switch (key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!isOpen) {
          this.open();
        } else {
          this._moveActive(1);
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (isOpen) {
          this._moveActive(-1);
        }
        break;
      case 'Home':
        if (isOpen) {
          e.preventDefault();
          this._setActive(0);
        }
        break;
      case 'End':
        if (isOpen) {
          e.preventDefault();
          const opts = this._getVisibleOptions();
          this._setActive(opts.length - 1);
        }
        break;
      case 'Escape':
        if (isOpen) {
          e.preventDefault();
          this.close();
          this._onEscapeKey();
        }
        break;
    }
  }

  // 默认仅处理 Enter（不处理 Space，避免在 searchInput 上拦截空格输入）。
  // CustomSelect / DeviceCascadeSelect 覆盖此方法以追加 Space / ArrowLeft / ArrowRight / Tab。
  _handleExtraKeys(e, key, isOpen) {
    if (key === 'Enter') {
      e.preventDefault();
      if (!isOpen) {
        this.open();
      } else {
        this._selectActiveOnEnter();
      }
      return true;
    }
    return false;
  }

  _selectActiveOnEnter() {
    const opts = this._getVisibleOptions();
    if (opts.length > 0 && this._activeIndex >= 0 && this._activeIndex < opts.length) {
      this._selectOptionElement(opts[this._activeIndex]);
    }
  }

  // 子类覆盖：根据 option 元素选中对应项
  _selectOptionElement(optionEl) {
    // 默认空实现，子类覆盖
  }

  _onEscapeKey() {
    const selectedEl = this._getSelectedEl();
    if (selectedEl) selectedEl.focus();
  }

  // === 文档点击外部关闭 ===

  _bindOutsideClickHandler() {
    this._documentClickHandler = (e) => {
      if (!this._isInsideComponent(e.target)) {
        this.close();
      }
    };
    document.addEventListener('click', this._documentClickHandler);
  }

  _unbindOutsideClickHandler() {
    if (this._documentClickHandler) {
      document.removeEventListener('click', this._documentClickHandler);
      this._documentClickHandler = null;
    }
  }

  _isInsideComponent(target) {
    // 覆盖所有 3 个子类的判定：container（cascade/device）或 selectEl（custom）+ 下拉元素
    if (this.container && this.container.contains(target)) return true;
    if (this.selectEl && this.selectEl.contains(target)) return true;
    const dd = this._getDropdownEl();
    if (dd && dd.contains(target)) return true;
    return false;
  }

  // === mainContent 滚动锁（CustomSelect / DeviceCascadeSelect 用） ===

  _lockMainContentScroll() {
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
      mainContent.classList.add('dropdown-open');
      mainContent.addEventListener('wheel', BaseSelect.preventScroll, {
        passive: false,
      });
    }
  }

  _unlockMainContentScroll() {
    const mainContent = document.querySelector('.main-content');
    if (mainContent && !BaseSelect.activeDropdown) {
      mainContent.classList.remove('dropdown-open');
      mainContent.removeEventListener('wheel', BaseSelect.preventScroll, {
        passive: false,
      });
    }
  }

  // === 静态 ===

  static preventScroll(e) {
    e.preventDefault();
  }

  static closeAll() {
    // 复制后遍历，避免迭代中 close() 修改 _openInstances
    const instances = Array.from(BaseSelect._openInstances);
    instances.forEach((inst) => inst.close());
  }
}

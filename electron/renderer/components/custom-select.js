// R7 a11y 修复: 已加键盘导航 (Enter/Space/方向键/Esc) + ARIA 角色 (combobox/listbox/option/aria-expanded/aria-selected)
export class CustomSelect {
  static activeDropdown = null;
  static scrollPrevented = false;

  constructor(selectId, options = {}) {
    this.selectId = selectId;
    this.placeholder = options.placeholder || '';
    this.onChange = options.onChange || null;
    this.dataLoader = options.dataLoader || null;
    this.selectEl = document.getElementById(selectId);
    this.selectedEl = document.getElementById(`${selectId}-selected`);
    this.optionsEl = document.getElementById(`${selectId}-options`);
    this._value = null;
    this._initialized = false;
    this._activeIndex = -1;

    if (this.selectEl && this.selectedEl && this.optionsEl) {
      this.init();
    }
  }

  init() {
    if (this._initialized) return;
    this._initialized = true;

    if (this.optionsEl.parentElement !== document.body) {
      document.body.appendChild(this.optionsEl);
    }

    // ARIA: combobox 角色 + 可聚焦
    this.selectedEl.setAttribute('role', 'combobox');
    this.selectedEl.setAttribute('aria-haspopup', 'listbox');
    this.selectedEl.setAttribute('aria-expanded', 'false');
    this.selectedEl.setAttribute('tabindex', '0');
    this.optionsEl.setAttribute('role', 'listbox');

    this.selectedEl.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggle();
    });

    this.selectedEl.addEventListener('keydown', (e) => {
      this._handleKeydown(e);
    });

    this.optionsEl.addEventListener('click', (e) => {
      const option = e.target.closest('.custom-select__option');
      if (option) {
        this.selectOption(option);
      }
    });

    document.addEventListener('click', (e) => {
      if (!this.selectEl.contains(e.target) && !this.optionsEl.contains(e.target)) {
        this.close();
      }
    });
  }

  _handleKeydown(e) {
    const key = e.key;
    const isOpen = this.optionsEl.classList.contains('show');

    switch (key) {
      case 'Enter':
      case ' ':
      case 'Spacebar':
        e.preventDefault();
        if (!isOpen) {
          this.open();
        } else {
          // 选中当前高亮项
          const opts = this._getVisibleOptions();
          if (opts.length > 0 && this._activeIndex >= 0 && this._activeIndex < opts.length) {
            this.selectOption(opts[this._activeIndex]);
          }
        }
        break;
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
      case 'Escape':
        if (isOpen) {
          e.preventDefault();
          this.close();
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
    }
  }

  _getVisibleOptions() {
    return Array.from(this.optionsEl.querySelectorAll('.custom-select__option'));
  }

  _setActive(index) {
    const opts = this._getVisibleOptions();
    if (opts.length === 0) return;
    // 循环边界
    if (index < 0) index = opts.length - 1;
    if (index >= opts.length) index = 0;

    opts.forEach(opt => opt.classList.remove('active'));
    opts[index].classList.add('active');
    this._activeIndex = index;
    // 滚动到可见
    opts[index].scrollIntoView({ block: 'nearest' });
  }

  _moveActive(delta) {
    this._setActive(this._activeIndex + delta);
  }

  toggle() {
    if (this.optionsEl.classList.contains('show')) {
      this.close();
    } else {
      this.open();
    }
  }

  open() {
    CustomSelect.closeAll();

    this.positionDropdown();
    this.optionsEl.classList.add('show');
    this.selectedEl.setAttribute('aria-expanded', 'true');
    CustomSelect.activeDropdown = this;

    // 默认高亮已选中项, 没有则第一项
    const opts = this._getVisibleOptions();
    const selectedIndex = opts.findIndex(opt => opt.classList.contains('selected'));
    this._setActive(selectedIndex >= 0 ? selectedIndex : 0);

    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
      mainContent.classList.add('dropdown-open');
      mainContent.addEventListener('wheel', CustomSelect.preventScroll, { passive: false });
    }
  }

  close() {
    this.optionsEl.classList.remove('show');
    this.selectedEl.setAttribute('aria-expanded', 'false');
    if (CustomSelect.activeDropdown === this) {
      CustomSelect.activeDropdown = null;
    }

    // 清除高亮
    this.optionsEl.querySelectorAll('.custom-select__option.active').forEach(opt => {
      opt.classList.remove('active');
    });
    this._activeIndex = -1;

    const mainContent = document.querySelector('.main-content');
    if (mainContent && !CustomSelect.activeDropdown) {
      mainContent.classList.remove('dropdown-open');
      mainContent.removeEventListener('wheel', CustomSelect.preventScroll, { passive: false });
    }
  }

  positionDropdown() {
    const rect = this.selectedEl.getBoundingClientRect();
    this.optionsEl.style.position = 'fixed';
    this.optionsEl.style.left = `${rect.left}px`;
    this.optionsEl.style.top = `${rect.bottom + 4}px`;
    this.optionsEl.style.minWidth = `${rect.width}px`;
    this.optionsEl.style.zIndex = '10000';
  }

  selectOption(optionEl) {
    const value = optionEl.dataset.value;
    const label = optionEl.querySelector('span')?.textContent || optionEl.textContent;

    this.optionsEl.querySelectorAll('.custom-select__option').forEach(opt => {
      opt.classList.remove('selected');
      opt.setAttribute('aria-selected', 'false');
    });
    optionEl.classList.add('selected');
    optionEl.setAttribute('aria-selected', 'true');

    const textEl = this.selectedEl.querySelector('.custom-select__text');
    if (textEl) {
      textEl.textContent = label;
    }

    this._value = value;
    this.close();

    if (this.onChange) {
      this.onChange(value, label);
    }
  }

  setOptions(items, labelKey = 'label', valueKey = 'value') {
    this.optionsEl.innerHTML = '';
    items.forEach(item => {
      const optionEl = document.createElement('div');
      const isSelected = item.default || item.selected;
      optionEl.className = `custom-select__option${isSelected ? ' selected' : ''}`;
      optionEl.dataset.value = typeof item === 'object' ? item[valueKey] : item;
      optionEl.setAttribute('role', 'option');
      optionEl.setAttribute('aria-selected', isSelected ? 'true' : 'false');
      optionEl.innerHTML = `<span>${typeof item === 'object' ? item[labelKey] : item}</span>`;
      this.optionsEl.appendChild(optionEl);
    });
  }

  async loadOptions() {
    if (!this.dataLoader) return;
    const items = await this.dataLoader();
    this.setOptions(items);
  }

  setValue(value) {
    this._value = value;
    const optionEl = this.optionsEl.querySelector(`.custom-select__option[data-value="${value}"]`);
    if (optionEl) {
      this.optionsEl.querySelectorAll('.custom-select__option').forEach(opt => {
        opt.classList.remove('selected');
        opt.setAttribute('aria-selected', 'false');
      });
      optionEl.classList.add('selected');
      optionEl.setAttribute('aria-selected', 'true');
      const textEl = this.selectedEl.querySelector('.custom-select__text');
      if (textEl) {
        textEl.textContent = optionEl.querySelector('span')?.textContent || optionEl.textContent;
      }
    }
  }

  getValue() {
    return this._value;
  }

  disable() {
    this.selectEl.classList.add('disabled');
    this.selectedEl.style.pointerEvents = 'none';
    this.selectedEl.style.opacity = '0.5';
    this.selectedEl.setAttribute('tabindex', '-1');
  }

  enable() {
    this.selectEl.classList.remove('disabled');
    this.selectedEl.style.pointerEvents = '';
    this.selectedEl.style.opacity = '';
    this.selectedEl.setAttribute('tabindex', '0');
  }

  static preventScroll(e) {
    e.preventDefault();
  }

  static closeAll() {
    document.querySelectorAll('.custom-select__options.show').forEach(opt => {
      opt.classList.remove('show');
    });
    // 同步关闭所有 combobox 的 aria-expanded
    document.querySelectorAll('.custom-select__selected[aria-expanded="true"]').forEach(el => {
      el.setAttribute('aria-expanded', 'false');
    });
    CustomSelect.activeDropdown = null;

    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
      mainContent.classList.remove('dropdown-open');
      mainContent.removeEventListener('wheel', CustomSelect.preventScroll, { passive: false });
    }
  }
}

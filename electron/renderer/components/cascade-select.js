// R7 a11y 修复: 已加键盘导航 (Enter/Space/方向键/Esc) + ARIA 角色 (combobox/listbox/option/aria-expanded/aria-selected)
export class CascadeSelect {
  static activeDropdown = null;

  constructor(containerId, options = {}) {
    this.containerId = containerId;
    this.placeholder = options.placeholder || window.i18n.t('cascadeSelect.placeholder');
    this.searchPlaceholder = options.searchPlaceholder || window.i18n.t('cascadeSelect.searchPlaceholder');
    this.showActions = options.showActions !== false;
    this.onSelect = options.onSelect || (() => {});
    this.onAdd = options.onAdd || null;
    this.onEdit = options.onEdit || null;
    this.onDelete = options.onDelete || null;
    this.labelKey = options.labelKey || 'name';
    this.valueKey = options.valueKey || 'id';
    this.selectedItem = null;
    this.items = [];
    this._activeIndex = -1;

    this.container = document.getElementById(containerId);
    if (!this.container) return;

    this.init();
  }

  init() {
    this.cascadeEl = this.container.querySelector('.cascade-select');
    this.searchInput = this.container.querySelector('.cascade-select__search');
    this.selectedEl = this.container.querySelector('.cascade-select__selected');
    this.textEl = this.container.querySelector('.cascade-select__text');
    this.dropdownEl = this.container.querySelector('.cascade-select__dropdown');
    this.optionsEl = this.container.querySelector('.cascade-select__options');
    this.addBtn = this.container.querySelector('.cascade-select__btn.add');
    this.editBtn = this.container.querySelector('.cascade-select__btn.edit');
    this.deleteBtn = this.container.querySelector('.cascade-select__btn.delete');

    this._setupAria();
    this.bindEvents();
  }

  _setupAria() {
    if (this.selectedEl) {
      this.selectedEl.setAttribute('role', 'combobox');
      this.selectedEl.setAttribute('aria-haspopup', 'listbox');
      this.selectedEl.setAttribute('aria-expanded', 'false');
      this.selectedEl.setAttribute('tabindex', '0');
    }
    if (this.optionsEl) {
      this.optionsEl.setAttribute('role', 'listbox');
    }
    if (this.searchInput) {
      this.searchInput.setAttribute('role', 'searchbox');
      this.searchInput.setAttribute('aria-label', this.searchPlaceholder);
    }
  }

  bindEvents() {
    if (this.selectedEl) {
      this.selectedEl.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggle();
      });

      this.selectedEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
          e.preventDefault();
          this.toggle();
        }
      });
    }

    if (this.searchInput) {
      this.searchInput.addEventListener('input', (e) => {
        this.filterOptions(e.target.value);
        // 过滤后重置高亮到第一项
        this._setActive(0);
      });

      this.searchInput.addEventListener('click', (e) => {
        e.stopPropagation();
      });

      // 键盘导航: 方向键/Enter/Esc
      this.searchInput.addEventListener('keydown', (e) => {
        this._handleKeydown(e);
      });
    }

    if (this.addBtn && this.onAdd) {
      this.addBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onAdd();
      });
    }

    if (this.editBtn && this.onEdit) {
      this.editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.selectedItem) this.onEdit(this.selectedItem);
      });
    }

    if (this.deleteBtn && this.onDelete) {
      this.deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.selectedItem) this.onDelete(this.selectedItem);
      });
    }

    document.addEventListener('click', (e) => {
      if (!this.container.contains(e.target)) {
        this.close();
      }
    });
  }

  _handleKeydown(e) {
    const key = e.key;
    const opts = this._getVisibleOptions();

    switch (key) {
      case 'ArrowDown':
        e.preventDefault();
        this._setActive(this._activeIndex + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        this._setActive(this._activeIndex - 1);
        break;
      case 'Enter':
        e.preventDefault();
        if (opts.length > 0 && this._activeIndex >= 0 && this._activeIndex < opts.length) {
          const itemId = opts[this._activeIndex].dataset.id;
          const item = this.items.find(it => String(it[this.valueKey]) === String(itemId));
          if (item) this.select(item);
        }
        break;
      case 'Escape':
        e.preventDefault();
        this.close();
        if (this.selectedEl) this.selectedEl.focus();
        break;
      case 'Home':
        e.preventDefault();
        this._setActive(0);
        break;
      case 'End':
        e.preventDefault();
        this._setActive(opts.length - 1);
        break;
    }
  }

  _getVisibleOptions() {
    return Array.from(this.optionsEl.querySelectorAll('.cascade-select__option')).filter(opt => opt.style.display !== 'none');
  }

  _setActive(index) {
    const opts = this._getVisibleOptions();
    if (opts.length === 0) {
      this._activeIndex = -1;
      return;
    }
    if (index < 0) index = opts.length - 1;
    if (index >= opts.length) index = 0;

    opts.forEach(opt => opt.classList.remove('active'));
    opts[index].classList.add('active');
    this._activeIndex = index;
    opts[index].scrollIntoView({ block: 'nearest' });
  }

  toggle() {
    if (this.dropdownEl.classList.contains('show')) {
      this.close();
    } else {
      this.open();
    }
  }

  open() {
    CascadeSelect.closeAll();

    this.dropdownEl.classList.add('show');
    if (this.selectedEl) {
      this.selectedEl.setAttribute('aria-expanded', 'true');
    }
    if (this.searchInput) {
      this.searchInput.value = '';
      this.filterOptions('');
      this.searchInput.focus();
    }
    // 默认高亮已选中项, 没有则第一项
    const opts = this._getVisibleOptions();
    const selectedIndex = opts.findIndex(opt => opt.classList.contains('selected'));
    this._setActive(selectedIndex >= 0 ? selectedIndex : 0);
    CascadeSelect.activeDropdown = this;
  }

  close() {
    if (this.dropdownEl) {
      this.dropdownEl.classList.remove('show');
    }
    if (this.selectedEl) {
      this.selectedEl.setAttribute('aria-expanded', 'false');
    }
    if (CascadeSelect.activeDropdown === this) {
      CascadeSelect.activeDropdown = null;
    }
    // 清除高亮
    if (this.optionsEl) {
      this.optionsEl.querySelectorAll('.cascade-select__option.active').forEach(opt => {
        opt.classList.remove('active');
      });
    }
    this._activeIndex = -1;
  }

  render(items) {
    this.items = items || [];
    if (!this.optionsEl) return;

    this.optionsEl.innerHTML = '';

    if (this.items.length === 0) {
      this.optionsEl.innerHTML = `<div class="cascade-select__empty">${this.placeholder}</div>`;
      return;
    }

    this.items.forEach(item => {
      const optionEl = document.createElement('div');
      const isSelected = this.selectedItem && item[this.valueKey] === this.selectedItem[this.valueKey];
      optionEl.className = `cascade-select__option${isSelected ? ' selected' : ''}`;
      optionEl.dataset.id = item[this.valueKey];
      optionEl.setAttribute('role', 'option');
      optionEl.setAttribute('aria-selected', isSelected ? 'true' : 'false');
      optionEl.textContent = item[this.labelKey];
      optionEl.addEventListener('click', () => {
        this.select(item);
      });
      this.optionsEl.appendChild(optionEl);
    });
  }

  select(item) {
    this.selectedItem = item;

    if (this.textEl) {
      this.textEl.textContent = item[this.labelKey];
      this.textEl.classList.remove('placeholder');
    }

    this.optionsEl.querySelectorAll('.cascade-select__option').forEach(opt => {
      const isSelected = opt.dataset.id === item[this.valueKey];
      opt.classList.toggle('selected', isSelected);
      opt.setAttribute('aria-selected', isSelected ? 'true' : 'false');
    });

    if (this.editBtn) this.editBtn.disabled = false;
    if (this.deleteBtn) this.deleteBtn.disabled = false;

    this.close();
    if (this.selectedEl) this.selectedEl.focus();
    this.onSelect(item);
  }

  clear() {
    this.selectedItem = null;
    if (this.textEl) {
      this.textEl.textContent = this.placeholder;
      this.textEl.classList.add('placeholder');
    }
    if (this.editBtn) this.editBtn.disabled = true;
    if (this.deleteBtn) this.deleteBtn.disabled = true;
    this.optionsEl.querySelectorAll('.cascade-select__option').forEach(opt => {
      opt.classList.remove('selected');
      opt.setAttribute('aria-selected', 'false');
    });
  }

  filterOptions(searchTerm) {
    const lowerTerm = (searchTerm || '').toLowerCase();
    this.optionsEl.querySelectorAll('.cascade-select__option').forEach(opt => {
      const text = (opt.textContent || '').toLowerCase();
      opt.style.display = text.includes(lowerTerm) ? '' : 'none';
    });
  }

  setDisabled(disabled) {
    if (this.cascadeEl) {
      this.cascadeEl.classList.toggle('disabled', disabled);
    }
    if (this.selectedEl) {
      this.selectedEl.setAttribute('tabindex', disabled ? '-1' : '0');
    }
  }

  getSelected() {
    return this.selectedItem;
  }

  static closeAll() {
    document.querySelectorAll('.cascade-select__dropdown.show').forEach(dd => {
      dd.classList.remove('show');
    });
    document.querySelectorAll('.cascade-select__selected[aria-expanded="true"]').forEach(el => {
      el.setAttribute('aria-expanded', 'false');
    });
    CascadeSelect.activeDropdown = null;
  }
}

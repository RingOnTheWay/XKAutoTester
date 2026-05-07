class CascadeSelect {
  static activeDropdown = null;

  constructor(containerId, options = {}) {
    this.containerId = containerId;
    this.placeholder = options.placeholder || '请选择...';
    this.searchPlaceholder = options.searchPlaceholder || '搜索...';
    this.showActions = options.showActions !== false;
    this.onSelect = options.onSelect || (() => {});
    this.onAdd = options.onAdd || null;
    this.onEdit = options.onEdit || null;
    this.onDelete = options.onDelete || null;
    this.labelKey = options.labelKey || 'name';
    this.valueKey = options.valueKey || 'id';
    this.selectedItem = null;
    this.items = [];

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

    this.bindEvents();
  }

  bindEvents() {
    if (this.selectedEl) {
      this.selectedEl.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggle();
      });
    }

    if (this.searchInput) {
      this.searchInput.addEventListener('input', (e) => {
        this.filterOptions(e.target.value);
      });

      this.searchInput.addEventListener('click', (e) => {
        e.stopPropagation();
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
    if (this.searchInput) {
      this.searchInput.value = '';
      this.filterOptions('');
      this.searchInput.focus();
    }
    CascadeSelect.activeDropdown = this;
  }

  close() {
    if (this.dropdownEl) {
      this.dropdownEl.classList.remove('show');
    }
    if (CascadeSelect.activeDropdown === this) {
      CascadeSelect.activeDropdown = null;
    }
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
      optionEl.className = `cascade-select__option${this.selectedItem && item[this.valueKey] === this.selectedItem[this.valueKey] ? ' selected' : ''}`;
      optionEl.dataset.id = item[this.valueKey];
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
      opt.classList.toggle('selected', opt.dataset.id === item[this.valueKey]);
    });

    if (this.editBtn) this.editBtn.disabled = false;
    if (this.deleteBtn) this.deleteBtn.disabled = false;

    this.close();
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
  }

  getSelected() {
    return this.selectedItem;
  }

  static closeAll() {
    document.querySelectorAll('.cascade-select__dropdown.show').forEach(dd => {
      dd.classList.remove('show');
    });
    CascadeSelect.activeDropdown = null;
  }
}

window.CascadeSelect = CascadeSelect;

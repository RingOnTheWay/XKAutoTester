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

    this.selectedEl.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggle();
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
    CustomSelect.activeDropdown = this;

    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
      mainContent.classList.add('dropdown-open');
      mainContent.addEventListener('wheel', CustomSelect.preventScroll, { passive: false });
    }
  }

  close() {
    this.optionsEl.classList.remove('show');
    if (CustomSelect.activeDropdown === this) {
      CustomSelect.activeDropdown = null;
    }

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
    });
    optionEl.classList.add('selected');

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
      optionEl.className = `custom-select__option${item.default || item.selected ? ' selected' : ''}`;
      optionEl.dataset.value = typeof item === 'object' ? item[valueKey] : item;
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
      });
      optionEl.classList.add('selected');
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
  }

  enable() {
    this.selectEl.classList.remove('disabled');
    this.selectedEl.style.pointerEvents = '';
    this.selectedEl.style.opacity = '';
  }

  static preventScroll(e) {
    e.preventDefault();
  }

  static closeAll() {
    document.querySelectorAll('.custom-select__options.show').forEach(opt => {
      opt.classList.remove('show');
    });
    CustomSelect.activeDropdown = null;

    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
      mainContent.classList.remove('dropdown-open');
      mainContent.removeEventListener('wheel', CustomSelect.preventScroll, { passive: false });
    }
  }
}

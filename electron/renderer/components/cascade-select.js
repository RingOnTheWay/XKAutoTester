// R7 a11y 修复: 已加键盘导航 (Enter/Space/方向键/Esc) + ARIA 角色 (combobox/listbox/option/aria-expanded/aria-selected)
// 重构: 继承 BaseSelect, 复用 open/close/toggle/_handleKeydown/_setupAria/选项高亮/文档点击外部关闭/static closeAll 等。
import { BaseSelect } from './base-select.js';

export class CascadeSelect extends BaseSelect {
  constructor(containerId, options = {}) {
    super();
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
    super._setupAria();
    if (this.searchInput) {
      this.searchInput.setAttribute('role', 'searchbox');
      this.searchInput.setAttribute('aria-label', this.searchPlaceholder);
    }
  }

  _getOptionSelector() {
    return '.cascade-select__option';
  }

  // searchInput 上的 Enter 选中当前高亮项
  _selectOptionElement(optionEl) {
    const itemId = optionEl.dataset.id;
    const item = this.items.find(it => String(it[this.valueKey]) === String(itemId));
    if (item) this.select(item);
  }

  bindEvents() {
    if (this.selectedEl) {
      this.selectedEl.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggle();
      });

      // selectedEl 上 Enter/Space 仅切换开闭 (不选中, 选中由 searchInput 键盘处理)
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

      // 键盘导航: 方向键/Enter/Esc (BaseSelect._handleKeydown)
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

    this._bindOutsideClickHandler();
  }

  // open 时: 清空搜索 + 聚焦 searchInput + 默认高亮已选/首项
  _afterOpen() {
    if (this.searchInput) {
      this.searchInput.value = '';
      this.filterOptions('');
      this.searchInput.focus();
    }
    this._highlightSelectedOrDefault();
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
    BaseSelect.closeAll();
  }
}

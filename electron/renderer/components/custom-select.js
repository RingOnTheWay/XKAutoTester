// R7 a11y 修复: 已加键盘导航 (Enter/Space/方向键/Esc) + ARIA 角色 (combobox/listbox/option/aria-expanded/aria-selected)
// 重构: 继承 BaseSelect, 复用 open/close/toggle/_handleKeydown/_setupAria/选项高亮/文档点击外部关闭/滚动锁/static closeAll 等。
import { BaseSelect } from './base-select.js';

export class CustomSelect extends BaseSelect {
  static scrollPrevented = false;

  constructor(selectId, options = {}) {
    super();
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

    this._setupAria();

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

    this._bindOutsideClickHandler();
  }

  _getOptionSelector() {
    return '.custom-select__option';
  }

  // CustomSelect 无搜索框, 选项不按 display 过滤
  _getVisibleOptions() {
    const container = this._getOptionsContainer();
    if (!container) return [];
    return Array.from(container.querySelectorAll(this._getOptionSelector()));
  }

  // Enter/Space: 未开则开, 已开则选中当前高亮项
  _handleExtraKeys(e, key, isOpen) {
    if (key === 'Enter' || key === ' ' || key === 'Spacebar') {
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

  _selectOptionElement(optionEl) {
    this.selectOption(optionEl);
  }

  // CustomSelect 的 Escape 不回焦 selectedEl
  _onEscapeKey() {}

  _beforeOpen() {
    this.positionDropdown();
  }

  _afterOpen() {
    this._highlightSelectedOrDefault();
    this._lockMainContentScroll();
  }

  _afterClose() {
    this._unlockMainContentScroll();
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

  static closeAll() {
    BaseSelect.closeAll();
  }
}

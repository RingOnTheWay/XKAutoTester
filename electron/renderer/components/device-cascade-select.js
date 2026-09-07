// R7 a11y 修复: 已加键盘导航 (Enter/Space/方向键/Esc) + ARIA 角色 (combobox/listbox/option/aria-expanded/aria-selected)
// 三级联动: 每级维护独立 _activeIndex, Tab 切换级, 方向键在当前级导航
// 重构: 继承 BaseSelect, 复用 toggle/_showDropdown/_setAriaExpanded/_registerActiveDropdown/_lockMainContentScroll/
// 文档点击外部关闭/static closeAll 等; 多级 _handleKeydown/_setActive/open/close 因签名差异自行覆盖。
import { BaseSelect } from './base-select.js';
import { escapeHtml } from '../core/utils/html.js';

// R15: 转义 BLE 设备数据（manufacturer/category/type/model 来自设备扫描与用户配置），防止 XSS

export class DeviceCascadeSelect extends BaseSelect {
  static instances = {};

  constructor(containerId, options = {}) {
    super();
    this.containerId = containerId;
    this.placeholder = options.placeholder || window.i18n.t('deviceCascadeSelect.placeholder');
    this.manufacturerPlaceholder =
      options.manufacturerPlaceholder || window.i18n.t('deviceCascadeSelect.manufacturerPlaceholder');
    this.typePlaceholder = options.typePlaceholder || window.i18n.t('deviceCascadeSelect.typePlaceholder');
    this.modelPlaceholder = options.modelPlaceholder || window.i18n.t('deviceCascadeSelect.modelPlaceholder');
    this.onSelect = options.onSelect || (() => {});
    this.labelKey = options.labelKey || 'name';
    this.valueKey = options.valueKey || 'deviceId';
    this.selectedDevice = null;
    this.selectedManufacturer = null;
    this.selectedType = null;
    this.devices = [];
    this.groupedDevices = {};
    this._destroyed = false;
    this._activeLevel = 'manufacturer';
    this._activeIndices = { manufacturer: -1, type: -1, model: -1 };

    this.container = document.getElementById(containerId);
    if (!this.container) return;

    if (DeviceCascadeSelect.instances[containerId]) {
      DeviceCascadeSelect.instances[containerId].destroy();
    }

    this._render();
    this._bindEvents();

    DeviceCascadeSelect.instances[containerId] = this;
  }

  // DeviceCascadeSelect 用 _getLevelOptions, 不使用单级 optionsEl
  _getOptionsContainer() {
    return null;
  }

  _render() {
    this.container.innerHTML = `
      <div class="device-cascade-select">
        <div class="device-cascade-select__selected">
          <span class="device-cascade-select__text placeholder">${this.placeholder}</span>
          <span class="device-cascade-select__arrow">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 12L3 7l1.4-1.4L8 9.2l3.6-3.6L13 7l-5 5z" fill="currentColor"/>
            </svg>
          </span>
        </div>
      </div>
    `;

    this.cascadeEl = this.container.querySelector('.device-cascade-select');
    this.selectedEl = this.container.querySelector('.device-cascade-select__selected');
    this.textEl = this.container.querySelector('.device-cascade-select__text');

    // ARIA: combobox 角色 + 可聚焦
    if (this.selectedEl) {
      this.selectedEl.setAttribute('role', 'combobox');
      this.selectedEl.setAttribute('aria-haspopup', 'listbox');
      this.selectedEl.setAttribute('aria-expanded', 'false');
      this.selectedEl.setAttribute('tabindex', '0');
      this.selectedEl.setAttribute('aria-label', this.placeholder);
    }

    this.dropdownEl = document.createElement('div');
    this.dropdownEl.className = 'device-cascade-select__dropdown';
    this.dropdownEl.setAttribute('data-cascade-id', this.containerId);
    this.dropdownEl.setAttribute('role', 'listbox');
    this.dropdownEl.innerHTML = `
      <div class="device-cascade-select__levels">
        <div class="device-cascade-select__level" id="${this.containerId}-manufacturer-level">
          <div class="device-cascade-select__level-header">
            <span class="device-cascade-select__level-title">${this.manufacturerPlaceholder}</span>
          </div>
          <div class="device-cascade-select__level-options" id="${this.containerId}-manufacturer-options" role="listbox" aria-label="${this.manufacturerPlaceholder}"></div>
        </div>
        <div class="device-cascade-select__level device-cascade-select__level--hidden" id="${this.containerId}-type-level">
          <div class="device-cascade-select__level-header">
            <span class="device-cascade-select__level-title">${this.typePlaceholder}</span>
          </div>
          <div class="device-cascade-select__level-options" id="${this.containerId}-type-options" role="listbox" aria-label="${this.typePlaceholder}"></div>
        </div>
        <div class="device-cascade-select__level device-cascade-select__level--hidden" id="${this.containerId}-model-level">
          <div class="device-cascade-select__level-header">
            <span class="device-cascade-select__level-title">${this.modelPlaceholder}</span>
          </div>
          <div class="device-cascade-select__level-options" id="${this.containerId}-model-options" role="listbox" aria-label="${this.modelPlaceholder}"></div>
        </div>
      </div>
    `;

    document.body.appendChild(this.dropdownEl);

    this.manufacturerOptionsEl = this.dropdownEl.querySelector(`#${this.containerId}-manufacturer-options`);
    this.typeOptionsEl = this.dropdownEl.querySelector(`#${this.containerId}-type-options`);
    this.modelOptionsEl = this.dropdownEl.querySelector(`#${this.containerId}-model-options`);
    this.manufacturerLevelEl = this.dropdownEl.querySelector(`#${this.containerId}-manufacturer-level`);
    this.typeLevelEl = this.dropdownEl.querySelector(`#${this.containerId}-type-level`);
    this.modelLevelEl = this.dropdownEl.querySelector(`#${this.containerId}-model-level`);
  }

  _bindEvents() {
    this._clickHandler = (e) => {
      e.stopPropagation();
      this.toggle();
    };

    this._keydownHandler = (e) => {
      this._handleKeydown(e);
    };

    this._dropdownClickHandler = (e) => {
      e.stopPropagation();
    };

    if (this.selectedEl) {
      this.selectedEl.addEventListener('click', this._clickHandler);
      this.selectedEl.addEventListener('keydown', this._keydownHandler);
    }

    this.dropdownEl.addEventListener('click', this._dropdownClickHandler);
    // 下拉内键盘事件 (level options 接收焦点时)
    this.dropdownEl.addEventListener('keydown', (e) => {
      this._handleKeydown(e);
    });

    this._bindOutsideClickHandler();
  }

  // 覆盖: 追加 _destroyed 守卫
  _bindOutsideClickHandler() {
    this._documentClickHandler = (e) => {
      if (this._destroyed) return;
      if (!this._isInsideComponent(e.target)) {
        this.close();
      }
    };
    document.addEventListener('click', this._documentClickHandler);
  }

  // 多级键盘导航: 覆盖 BaseSelect._handleKeydown (单级), 在当前级导航
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
          this._setActive(this._activeLevel, 0);
        }
        break;
      case 'End':
        if (isOpen) {
          e.preventDefault();
          const opts = this._getLevelOptions(this._activeLevel);
          this._setActive(this._activeLevel, opts.length - 1);
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

  // Enter/Space 选中当前级当前高亮项; ArrowLeft/Right 切换级
  _handleExtraKeys(e, key, isOpen) {
    if (key === 'Enter' || key === ' ' || key === 'Spacebar') {
      e.preventDefault();
      if (!isOpen) {
        this.open();
      } else {
        // 选中当前级的当前高亮项
        this._selectActive();
      }
      return true;
    }
    if (key === 'ArrowRight') {
      // 跳到下一级 (type / model)
      e.preventDefault();
      if (isOpen) {
        this._advanceLevel(1);
      }
      return true;
    }
    if (key === 'ArrowLeft') {
      // 返回上一级 (model -> type -> manufacturer)
      e.preventDefault();
      if (isOpen) {
        this._advanceLevel(-1);
      }
      return true;
    }
    // Tab: 不阻止默认, 不处理 (让默认 Tab 行为生效)
    return false;
  }

  _getLevelOptions(level) {
    const el =
      level === 'manufacturer'
        ? this.manufacturerOptionsEl
        : level === 'type'
          ? this.typeOptionsEl
          : this.modelOptionsEl;
    return el ? Array.from(el.querySelectorAll('.device-cascade-select__option')) : [];
  }

  // 多级 _setActive: 覆盖 BaseSelect._setActive(index) (单级)
  _setActive(level, index) {
    const opts = this._getLevelOptions(level);
    if (opts.length === 0) return;
    if (index < 0) index = opts.length - 1;
    if (index >= opts.length) index = 0;

    opts.forEach((opt) => opt.classList.remove('active'));
    opts[index].classList.add('active');
    this._activeIndices[level] = index;
    this._activeLevel = level;
    opts[index].scrollIntoView({ block: 'nearest' });
  }

  _moveActive(delta) {
    this._setActive(this._activeLevel, this._activeIndices[this._activeLevel] + delta);
  }

  _advanceLevel(direction) {
    // direction: 1 = 向下 (manufacturer -> type -> model), -1 = 向上
    const levels = ['manufacturer', 'type', 'model'];
    let idx = levels.indexOf(this._activeLevel);
    if (idx < 0) idx = 0;
    idx += direction;
    // 边界: type/model 仅在已选时可见
    if (idx < 0) idx = 0;
    if (idx > 2) idx = 2;
    const targetLevel = levels[idx];
    // 检查目标级是否可见
    if (targetLevel === 'type' && !this.selectedManufacturer) return;
    if (targetLevel === 'model' && !this.selectedType) return;
    // 若目标级无选项, 不切换
    const opts = this._getLevelOptions(targetLevel);
    if (opts.length === 0) return;
    this._setActive(targetLevel, Math.max(0, this._activeIndices[targetLevel]));
  }

  _selectActive() {
    const level = this._activeLevel;
    const idx = this._activeIndices[level];
    const opts = this._getLevelOptions(level);
    if (idx < 0 || idx >= opts.length) return;
    const opt = opts[idx];

    if (level === 'manufacturer') {
      const manufacturerId = opt.dataset.manufacturer;
      if (this.selectedManufacturer === manufacturerId) {
        this.selectedManufacturer = null;
        this.selectedType = null;
      } else {
        this.selectedManufacturer = manufacturerId;
        this.selectedType = null;
      }
      this._renderManufacturerOptions();
      this._renderTypeOptions();
      this._renderModelOptions();
      this._updateLevelVisibility();
      // 选中 manufacturer 后自动跳到 type 级
      if (this.selectedManufacturer) {
        this._setActive('type', 0);
      }
    } else if (level === 'type') {
      const type = opt.dataset.type;
      if (this.selectedType === type) {
        this.selectedType = null;
      } else {
        this.selectedType = type;
      }
      this._renderTypeOptions();
      this._renderModelOptions();
      this._updateLevelVisibility();
      if (this.selectedType) {
        this._setActive('model', 0);
      }
    } else if (level === 'model') {
      const id = opt.dataset.id;
      const device = this.devices.find((d) => d[this.valueKey] === id);
      if (device) {
        this.select(device);
      }
    }
  }

  // 覆盖 open: _positionDropdown 顺序特殊 (需临时 add show 测高度), 且有 'open' class + 多级默认高亮
  open() {
    BaseSelect.closeAll();
    this._positionDropdown();
    this._showDropdown();
    if (this.selectedEl) {
      this.selectedEl.classList.add('open');
    }
    this._setAriaExpanded(true);
    this._registerActiveDropdown();

    // 定位当前级: 有 selectedDevice 则 model 级, 有 selectedManufacturer 则 type 级, 否则 manufacturer 级
    if (this.selectedDevice) {
      this._activeLevel = 'model';
    } else if (this.selectedManufacturer) {
      this._activeLevel = 'type';
    } else {
      this._activeLevel = 'manufacturer';
    }

    // 修复: 无已选项时不默认高亮第一项 (此前 _setActive(0) 让首项带上 .active
    // 主题色背景, 用户误以为"已选中"; 键盘首键 (方向键) 会从 -1 落到第 0 项)
    const opts = this._getLevelOptions(this._activeLevel);
    const selectedIndex = opts.findIndex((opt) => opt.classList.contains('selected'));
    if (selectedIndex >= 0) {
      // 有已选项: 高亮定位到已选项
      this._setActive(this._activeLevel, selectedIndex);
    } else {
      // 无已选项: 清除所有级 active, 保持 _activeIndices = -1
      ['manufacturer', 'type', 'model'].forEach((level) => {
        const levelOpts = this._getLevelOptions(level);
        levelOpts.forEach((opt) => opt.classList.remove('active'));
        this._activeIndices[level] = -1;
      });
    }

    this._lockMainContentScroll();
  }

  // 覆盖 close: 清 'open' class + above class + 三级高亮
  close() {
    this._hideDropdown();
    if (this.dropdownEl) {
      this.dropdownEl.classList.remove('device-cascade-select__dropdown--above');
    }
    if (this.selectedEl) {
      this.selectedEl.classList.remove('open');
    }
    this._setAriaExpanded(false);
    this._unregisterActiveDropdown();

    // 清除高亮
    ['manufacturer', 'type', 'model'].forEach((level) => {
      const opts = this._getLevelOptions(level);
      opts.forEach((opt) => opt.classList.remove('active'));
      this._activeIndices[level] = -1;
    });

    this._unlockMainContentScroll();
  }

  _positionDropdown() {
    if (!this.selectedEl || !this.dropdownEl) return;
    const rect = this.selectedEl.getBoundingClientRect();

    if (rect.width === 0 && rect.height === 0) {
      this.dropdownEl.style.top = '50%';
      this.dropdownEl.style.left = '50%';
      this.dropdownEl.style.width = '200px';
      this.dropdownEl.style.transform = 'translate(-50%, -50%)';
      return;
    }

    this.dropdownEl.classList.add('show');
    const actualDropdownHeight = this.dropdownEl.offsetHeight || 300;
    this.dropdownEl.classList.remove('show');

    const viewportHeight = window.innerHeight;
    const gap = 4;
    const padding = 80;

    const spaceBelow = viewportHeight - rect.bottom - gap - padding;
    const spaceAbove = rect.top - gap - padding;

    let top;
    let showAbove = false;
    let maxHeight = null;

    if (spaceBelow >= actualDropdownHeight) {
      top = rect.bottom + gap;
      showAbove = false;
    } else if (spaceAbove >= actualDropdownHeight) {
      top = rect.top - actualDropdownHeight - gap;
      showAbove = true;
    } else if (spaceAbove > spaceBelow) {
      top = padding;
      showAbove = true;
      maxHeight = Math.floor(spaceAbove);
    } else {
      top = rect.bottom + gap;
      showAbove = false;
      maxHeight = Math.floor(spaceBelow);
    }

    this.dropdownEl.style.position = 'fixed';
    this.dropdownEl.style.left = `${rect.left}px`;
    this.dropdownEl.style.width = `${rect.width}px`;
    this.dropdownEl.style.top = `${top}px`;
    this.dropdownEl.style.bottom = 'auto';
    this.dropdownEl.style.transform = 'none';
    this.dropdownEl.style.zIndex = '10000';
    this.dropdownEl.style.maxHeight = maxHeight ? `${maxHeight}px` : '';

    if (showAbove) {
      this.dropdownEl.classList.add('device-cascade-select__dropdown--above');
    } else {
      this.dropdownEl.classList.remove('device-cascade-select__dropdown--above');
    }
  }

  render(devices) {
    this.devices = devices || [];
    this.groupedDevices = {};

    this.devices.forEach((device) => {
      const manufacturerId = device.manufacturerId || 'other';
      const manufacturer = device.manufacturer || manufacturerId;
      const type = device.deviceType || 'other';
      const category = device.category || type;

      if (!this.groupedDevices[manufacturerId]) {
        this.groupedDevices[manufacturerId] = {
          manufacturerId: manufacturerId,
          manufacturer: manufacturer,
          types: {},
        };
      }
      if (!this.groupedDevices[manufacturerId].types[type]) {
        this.groupedDevices[manufacturerId].types[type] = {
          type: type,
          category: category,
          devices: [],
        };
      }
      this.groupedDevices[manufacturerId].types[type].devices.push(device);
    });

    this._renderManufacturerOptions();
    this._updateLevelVisibility();
  }

  _renderManufacturerOptions() {
    if (!this.manufacturerOptionsEl) return;

    const manufacturers = Object.values(this.groupedDevices);
    if (manufacturers.length === 0) {
      this.manufacturerOptionsEl.innerHTML = `<div class="device-cascade-select__empty">${window.i18n.t('deviceCascadeSelect.noManufacturer')}</div>`;
      return;
    }

    this.manufacturerOptionsEl.innerHTML = manufacturers
      .map((group) => {
        const totalDevices = Object.values(group.types).reduce((sum, t) => sum + t.devices.length, 0);
        const displayManufacturer =
          group.manufacturerId !== 'other'
            ? `${group.manufacturer}(${group.manufacturerId.charAt(0).toUpperCase() + group.manufacturerId.slice(1)})`
            : group.manufacturer;
        const isSelected = this.selectedManufacturer === group.manufacturerId;
        return `
        <div class="device-cascade-select__option${isSelected ? ' selected' : ''}" data-manufacturer="${escapeHtml(group.manufacturerId)}" role="option" aria-selected="${isSelected ? 'true' : 'false'}" tabindex="-1">
          <span class="device-cascade-select__option-text">${escapeHtml(displayManufacturer)}</span>
          <span class="device-cascade-select__option-count">${totalDevices}</span>
        </div>
      `;
      })
      .join('');

    this.manufacturerOptionsEl.querySelectorAll('.device-cascade-select__option').forEach((opt) => {
      opt.addEventListener('click', () => {
        const manufacturerId = opt.dataset.manufacturer;
        if (this.selectedManufacturer === manufacturerId) {
          this.selectedManufacturer = null;
          this.selectedType = null;
        } else {
          this.selectedManufacturer = manufacturerId;
          this.selectedType = null;
        }
        this._renderManufacturerOptions();
        this._renderTypeOptions();
        this._renderModelOptions();
        this._updateLevelVisibility();
      });
    });
  }

  _renderTypeOptions() {
    if (!this.typeOptionsEl) return;

    if (!this.selectedManufacturer || !this.groupedDevices[this.selectedManufacturer]) {
      this.typeOptionsEl.innerHTML = `<div class="device-cascade-select__empty">${this.typePlaceholder}</div>`;
      return;
    }

    const types = Object.values(this.groupedDevices[this.selectedManufacturer].types);
    if (types.length === 0) {
      this.typeOptionsEl.innerHTML = `<div class="device-cascade-select__empty">${window.i18n.t('deviceCascadeSelect.noType')}</div>`;
      return;
    }

    this.typeOptionsEl.innerHTML = types
      .map((group) => {
        const isSelected = this.selectedType === group.type;
        return `
      <div class="device-cascade-select__option${isSelected ? ' selected' : ''}" data-type="${escapeHtml(group.type)}" role="option" aria-selected="${isSelected ? 'true' : 'false'}" tabindex="-1">
        <span class="device-cascade-select__option-text">${escapeHtml(group.category)}</span>
        <span class="device-cascade-select__option-count">${group.devices.length}</span>
      </div>
    `;
      })
      .join('');

    this.typeOptionsEl.querySelectorAll('.device-cascade-select__option').forEach((opt) => {
      opt.addEventListener('click', () => {
        const type = opt.dataset.type;
        if (this.selectedType === type) {
          this.selectedType = null;
        } else {
          this.selectedType = type;
        }
        this._renderTypeOptions();
        this._renderModelOptions();
        this._updateLevelVisibility();
      });
    });
  }

  _renderModelOptions() {
    if (!this.modelOptionsEl) return;

    if (!this.selectedManufacturer || !this.selectedType || !this.groupedDevices[this.selectedManufacturer]) {
      this.modelOptionsEl.innerHTML = `<div class="device-cascade-select__empty">${this.modelPlaceholder}</div>`;
      return;
    }

    const typeGroup = this.groupedDevices[this.selectedManufacturer].types[this.selectedType];
    if (!typeGroup || typeGroup.devices.length === 0) {
      this.modelOptionsEl.innerHTML = `<div class="device-cascade-select__empty">${window.i18n.t('deviceCascadeSelect.noDevice')}</div>`;
      return;
    }

    this.modelOptionsEl.innerHTML = typeGroup.devices
      .map((device) => {
        const isSelected = this.selectedDevice && device[this.valueKey] === this.selectedDevice[this.valueKey];
        return `
      <div class="device-cascade-select__option${isSelected ? ' selected' : ''}" data-id="${escapeHtml(device[this.valueKey])}" role="option" aria-selected="${isSelected ? 'true' : 'false'}" tabindex="-1">
        <span class="device-cascade-select__option-text">${escapeHtml(device[this.labelKey])}</span>
      </div>
    `;
      })
      .join('');

    this.modelOptionsEl.querySelectorAll('.device-cascade-select__option').forEach((opt) => {
      opt.addEventListener('click', () => {
        const id = opt.dataset.id;
        if (this.selectedDevice && this.selectedDevice[this.valueKey] === id) {
          this.selectedDevice = null;
          if (this.textEl) {
            this.textEl.textContent = this.placeholder;
            this.textEl.classList.add('placeholder');
          }
          this._renderModelOptions();
          this.onSelect(null);
        } else {
          const device = this.devices.find((d) => d[this.valueKey] === id);
          if (device) {
            this.select(device);
          }
        }
      });
    });
  }

  _updateLevelVisibility() {
    if (this.typeLevelEl) {
      if (this.selectedManufacturer) {
        this.typeLevelEl.classList.remove('device-cascade-select__level--hidden');
        this.typeLevelEl.classList.add('device-cascade-select__level--visible');
      } else {
        this.typeLevelEl.classList.add('device-cascade-select__level--hidden');
        this.typeLevelEl.classList.remove('device-cascade-select__level--visible');
      }
    }

    if (this.modelLevelEl) {
      if (this.selectedType) {
        this.modelLevelEl.classList.remove('device-cascade-select__level--hidden');
        this.modelLevelEl.classList.add('device-cascade-select__level--visible');
      } else {
        this.modelLevelEl.classList.add('device-cascade-select__level--hidden');
        this.modelLevelEl.classList.remove('device-cascade-select__level--visible');
      }
    }
  }

  select(device, silent = false) {
    this.selectedDevice = device;
    this.selectedManufacturer = device.manufacturerId || 'other';
    this.selectedType = device.deviceType;

    if (this.textEl) {
      const parts = [];
      if (device.manufacturer) {
        const mfgId = device.manufacturerId || 'other';
        parts.push(
          mfgId !== 'other'
            ? `${device.manufacturer}(${mfgId.charAt(0).toUpperCase() + mfgId.slice(1)})`
            : device.manufacturer
        );
      }
      if (device.category) parts.push(device.category);
      parts.push(device[this.labelKey]);
      this.textEl.textContent = parts.join(' - ');
      this.textEl.classList.remove('placeholder');
    }

    this._renderManufacturerOptions();
    this._renderTypeOptions();
    this._renderModelOptions();
    this._updateLevelVisibility();
    this.close();
    if (!silent) {
      this.onSelect(device);
    }
  }

  clear() {
    this.selectedDevice = null;
    this.selectedManufacturer = null;
    this.selectedType = null;

    if (this.textEl) {
      this.textEl.textContent = this.placeholder;
      this.textEl.classList.add('placeholder');
    }

    this._renderManufacturerOptions();
    this._renderTypeOptions();
    this._renderModelOptions();
    this._updateLevelVisibility();
  }

  getSelected() {
    return this.selectedDevice;
  }

  setDisabled(disabled) {
    if (this.cascadeEl) {
      this.cascadeEl.classList.toggle('disabled', disabled);
    }
    if (this.selectedEl) {
      this.selectedEl.setAttribute('tabindex', disabled ? '-1' : '0');
      this.selectedEl.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    }
  }

  destroy() {
    this._destroyed = true;
    this.close();

    if (this.selectedEl && this._clickHandler) {
      this.selectedEl.removeEventListener('click', this._clickHandler);
    }
    if (this.selectedEl && this._keydownHandler) {
      this.selectedEl.removeEventListener('keydown', this._keydownHandler);
    }
    if (this.dropdownEl && this._dropdownClickHandler) {
      this.dropdownEl.removeEventListener('click', this._dropdownClickHandler);
    }
    this._unbindOutsideClickHandler();

    if (this.dropdownEl && this.dropdownEl.parentElement) {
      this.dropdownEl.parentElement.removeChild(this.dropdownEl);
    }
    this.dropdownEl = null;

    if (DeviceCascadeSelect.instances[this.containerId] === this) {
      delete DeviceCascadeSelect.instances[this.containerId];
    }
  }

  static closeAll() {
    BaseSelect.closeAll();
  }

  static destroyAll() {
    Object.values(DeviceCascadeSelect.instances).forEach((instance) => {
      instance.destroy();
    });
    DeviceCascadeSelect.instances = {};
  }
}

class DeviceCascadeSelect {
  static activeDropdown = null;
  static instances = {};

  constructor(containerId, options = {}) {
    this.containerId = containerId;
    this.placeholder = options.placeholder || '请选择设备...';
    this.manufacturerPlaceholder = options.manufacturerPlaceholder || '选择厂商';
    this.typePlaceholder = options.typePlaceholder || '选择类型';
    this.modelPlaceholder = options.modelPlaceholder || '选择型号';
    this.onSelect = options.onSelect || (() => {});
    this.labelKey = options.labelKey || 'name';
    this.valueKey = options.valueKey || 'deviceId';
    this.selectedDevice = null;
    this.selectedManufacturer = null;
    this.selectedType = null;
    this.devices = [];
    this.groupedDevices = {};
    this._destroyed = false;

    this.container = document.getElementById(containerId);
    if (!this.container) return;

    if (DeviceCascadeSelect.instances[containerId]) {
      DeviceCascadeSelect.instances[containerId].destroy();
    }

    this._render();
    this._bindEvents();

    DeviceCascadeSelect.instances[containerId] = this;
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

    this.dropdownEl = document.createElement('div');
    this.dropdownEl.className = 'device-cascade-select__dropdown';
    this.dropdownEl.setAttribute('data-cascade-id', this.containerId);
    this.dropdownEl.innerHTML = `
      <div class="device-cascade-select__levels">
        <div class="device-cascade-select__level" id="${this.containerId}-manufacturer-level">
          <div class="device-cascade-select__level-header">
            <span class="device-cascade-select__level-title">${this.manufacturerPlaceholder}</span>
          </div>
          <div class="device-cascade-select__level-options" id="${this.containerId}-manufacturer-options"></div>
        </div>
        <div class="device-cascade-select__level device-cascade-select__level--hidden" id="${this.containerId}-type-level">
          <div class="device-cascade-select__level-header">
            <span class="device-cascade-select__level-title">${this.typePlaceholder}</span>
          </div>
          <div class="device-cascade-select__level-options" id="${this.containerId}-type-options"></div>
        </div>
        <div class="device-cascade-select__level device-cascade-select__level--hidden" id="${this.containerId}-model-level">
          <div class="device-cascade-select__level-header">
            <span class="device-cascade-select__level-title">${this.modelPlaceholder}</span>
          </div>
          <div class="device-cascade-select__level-options" id="${this.containerId}-model-options"></div>
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

    this._dropdownClickHandler = (e) => {
      e.stopPropagation();
    };

    this._documentClickHandler = (e) => {
      if (this._destroyed) return;
      if (!this.container.contains(e.target) && !this.dropdownEl.contains(e.target)) {
        this.close();
      }
    };

    if (this.selectedEl) {
      this.selectedEl.addEventListener('click', this._clickHandler);
    }

    this.dropdownEl.addEventListener('click', this._dropdownClickHandler);

    document.addEventListener('click', this._documentClickHandler);
  }

  toggle() {
    if (this.dropdownEl.classList.contains('show')) {
      this.close();
    } else {
      this.open();
    }
  }

  open() {
    DeviceCascadeSelect.closeAll();
    this._positionDropdown();
    this.dropdownEl.classList.add('show');
    this.selectedEl.classList.add('open');
    DeviceCascadeSelect.activeDropdown = this;

    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
      mainContent.classList.add('dropdown-open');
      mainContent.addEventListener('wheel', DeviceCascadeSelect.preventScroll, { passive: false });
    }
  }

  close() {
    if (this.dropdownEl) {
      this.dropdownEl.classList.remove('show');
      this.dropdownEl.classList.remove('device-cascade-select__dropdown--above');
    }
    if (this.selectedEl) {
      this.selectedEl.classList.remove('open');
    }
    if (DeviceCascadeSelect.activeDropdown === this) {
      DeviceCascadeSelect.activeDropdown = null;
    }

    const mainContent = document.querySelector('.main-content');
    if (mainContent && !DeviceCascadeSelect.activeDropdown) {
      mainContent.classList.remove('dropdown-open');
      mainContent.removeEventListener('wheel', DeviceCascadeSelect.preventScroll, { passive: false });
    }
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

  static preventScroll(e) {
    e.preventDefault();
  }

  render(devices) {
    this.devices = devices || [];
    this.groupedDevices = {};

    this.devices.forEach(device => {
      const manufacturerId = device.manufacturerId || 'other';
      const manufacturer = device.manufacturer || manufacturerId;
      const type = device.deviceType || 'other';
      const category = device.category || type;

      if (!this.groupedDevices[manufacturerId]) {
        this.groupedDevices[manufacturerId] = {
          manufacturerId: manufacturerId,
          manufacturer: manufacturer,
          types: {}
        };
      }
      if (!this.groupedDevices[manufacturerId].types[type]) {
        this.groupedDevices[manufacturerId].types[type] = {
          type: type,
          category: category,
          devices: []
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
      this.manufacturerOptionsEl.innerHTML = `<div class="device-cascade-select__empty">暂无设备厂商</div>`;
      return;
    }

    this.manufacturerOptionsEl.innerHTML = manufacturers.map(group => {
      const totalDevices = Object.values(group.types).reduce((sum, t) => sum + t.devices.length, 0);
      const displayManufacturer = group.manufacturerId !== 'other'
        ? `${group.manufacturer}(${group.manufacturerId.charAt(0).toUpperCase() + group.manufacturerId.slice(1)})`
        : group.manufacturer;
      return `
        <div class="device-cascade-select__option${this.selectedManufacturer === group.manufacturerId ? ' selected' : ''}" data-manufacturer="${group.manufacturerId}">
          <span class="device-cascade-select__option-text">${displayManufacturer}</span>
          <span class="device-cascade-select__option-count">${totalDevices}</span>
        </div>
      `;
    }).join('');

    this.manufacturerOptionsEl.querySelectorAll('.device-cascade-select__option').forEach(opt => {
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
      this.typeOptionsEl.innerHTML = `<div class="device-cascade-select__empty">暂无设备类型</div>`;
      return;
    }

    this.typeOptionsEl.innerHTML = types.map(group => `
      <div class="device-cascade-select__option${this.selectedType === group.type ? ' selected' : ''}" data-type="${group.type}">
        <span class="device-cascade-select__option-text">${group.category}</span>
        <span class="device-cascade-select__option-count">${group.devices.length}</span>
      </div>
    `).join('');

    this.typeOptionsEl.querySelectorAll('.device-cascade-select__option').forEach(opt => {
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
      this.modelOptionsEl.innerHTML = `<div class="device-cascade-select__empty">暂无设备</div>`;
      return;
    }

    this.modelOptionsEl.innerHTML = typeGroup.devices.map(device => `
      <div class="device-cascade-select__option${this.selectedDevice && device[this.valueKey] === this.selectedDevice[this.valueKey] ? ' selected' : ''}" data-id="${device[this.valueKey]}">
        <span class="device-cascade-select__option-text">${device[this.labelKey]}</span>
      </div>
    `).join('');

    this.modelOptionsEl.querySelectorAll('.device-cascade-select__option').forEach(opt => {
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
          const device = this.devices.find(d => d[this.valueKey] === id);
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
        parts.push(mfgId !== 'other'
          ? `${device.manufacturer}(${mfgId.charAt(0).toUpperCase() + mfgId.slice(1)})`
          : device.manufacturer);
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
  }

  destroy() {
    this._destroyed = true;
    this.close();

    if (this.selectedEl && this._clickHandler) {
      this.selectedEl.removeEventListener('click', this._clickHandler);
    }
    if (this.dropdownEl && this._dropdownClickHandler) {
      this.dropdownEl.removeEventListener('click', this._dropdownClickHandler);
    }
    if (this._documentClickHandler) {
      document.removeEventListener('click', this._documentClickHandler);
    }

    if (this.dropdownEl && this.dropdownEl.parentElement) {
      this.dropdownEl.parentElement.removeChild(this.dropdownEl);
    }
    this.dropdownEl = null;

    if (DeviceCascadeSelect.instances[this.containerId] === this) {
      delete DeviceCascadeSelect.instances[this.containerId];
    }
  }

  static closeAll() {
    document.querySelectorAll('.device-cascade-select__dropdown.show').forEach(dd => {
      dd.classList.remove('show');
      dd.classList.remove('device-cascade-select__dropdown--above');
    });
    document.querySelectorAll('.device-cascade-select__selected.open').forEach(sel => {
      sel.classList.remove('open');
    });
    DeviceCascadeSelect.activeDropdown = null;
  }

  static destroyAll() {
    Object.values(DeviceCascadeSelect.instances).forEach(instance => {
      instance.destroy();
    });
    DeviceCascadeSelect.instances = {};
  }
}

window.DeviceCascadeSelect = DeviceCascadeSelect;

/**
 * CustomSelects - 自定义下拉框机制 (R26 候选③, 自 app.js 拆出)
 *
 * 职责:
 * - initializeCustomSelects: 按 .custom-select-wrapper[data-options] 声明式生成下拉框
 * - initCustomSelect: 绑定 selected/options 开关交互 (options 移 body, 定位, 滚动锁)
 * - positionDropdown: options 面板视口定位 (上/下方空间决策)
 * - preventScroll: wheel 拦截 handler (滚动锁), 供全局点击关闭时同用
 *
 * 拆分动机: 下拉机制独立演进 (与 settings view 的同类辅助语义对齐)。
 */

export class CustomSelects {
  /** wheel 拦截 handler (main-content.dropdown-open 时 preventDefault) */
  preventScroll = (e) => {
    const mainContent = document.querySelector('.main-content');
    if (mainContent && mainContent.classList.contains('dropdown-open')) {
      e.preventDefault();
    }
  };

  /** 按 wrapper 声明批量生成下拉框 */
  initializeCustomSelects() {
    const selectWrappers = document.querySelectorAll('.custom-select-wrapper[data-options]');

    selectWrappers.forEach((wrapper) => {
      if (wrapper.querySelector('.custom-select')) return;

      const optionsData = wrapper.getAttribute('data-options');
      if (!optionsData) return;

      try {
        const options = JSON.parse(optionsData);
        const selectId = wrapper.id;

        const selectHtml = `
          <div class="custom-select" id="${selectId}-select">
            <div class="custom-select__selected" id="${selectId}-selected">
              <span class="custom-select__text"></span>
            </div>
            <div class="custom-select__options" id="${selectId}-options">
              ${options
                .map(
                  (opt) => `
                <div class="custom-select__option${opt.default ? ' selected' : ''}" data-value="${opt.value}">
                  <span data-i18n="${opt.label}">${window.i18n.t(opt.label)}</span>
                </div>
              `
                )
                .join('')}
            </div>
          </div>
        `;

        wrapper.innerHTML = selectHtml;

        const selectedSpan = wrapper.querySelector('.custom-select__text');
        const defaultOption = options.find((opt) => opt.default);
        if (selectedSpan && defaultOption) {
          selectedSpan.textContent = window.i18n.t(defaultOption.label);
          selectedSpan.setAttribute('data-i18n', defaultOption.label);
        }

        this.initCustomSelect(`${selectId}-select`);
      } catch (e) {
        console.error('解析下拉框选项失败:', e);
      }
    });
  }

  /** 绑定单个下拉框交互 (幂等: dataset.initialized 防重) */
  initCustomSelect(selectId) {
    const select = document.getElementById(selectId);
    if (!select) return;

    if (select.dataset.initialized === 'true') return;
    select.dataset.initialized = 'true';

    const selected = select.querySelector('.custom-select__selected');
    const options = select.querySelector('.custom-select__options');

    if (!selected || !options) return;

    document.body.appendChild(options);

    selected.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.custom-select__options.show').forEach((opt) => {
        if (opt !== options) {
          opt.classList.remove('show');
        }
      });

      const mainContent = document.querySelector('.main-content');
      const isShowing = options.classList.contains('show');
      if (!isShowing) {
        this.positionDropdown(selected, options);
        options.classList.add('show');
        if (mainContent) {
          mainContent.classList.add('dropdown-open');
          mainContent.addEventListener('wheel', this.preventScroll, {
            passive: false,
          });
        }
      } else {
        options.classList.remove('show');
        if (mainContent) {
          mainContent.classList.remove('dropdown-open');
          mainContent.removeEventListener('wheel', this.preventScroll, {
            passive: false,
          });
        }
      }
    });

    const optionItems = options.querySelectorAll('.custom-select__option');
    optionItems.forEach((option) => {
      option.addEventListener('click', (e) => {
        e.stopPropagation();
        const displayText = option.querySelector('span')?.textContent || option.textContent;

        const selectedSpan = selected.querySelector('.custom-select__text');
        if (selectedSpan) {
          selectedSpan.textContent = displayText;
        }

        optionItems.forEach((opt) => opt.classList.remove('selected'));
        option.classList.add('selected');

        options.classList.remove('show');
        const mainContent = document.querySelector('.main-content');
        if (mainContent) {
          mainContent.classList.remove('dropdown-open');
          mainContent.removeEventListener('wheel', this.preventScroll, {
            passive: false,
          });
        }
      });
    });
  }

  /** options 面板视口定位 */
  positionDropdown(selected, options) {
    const rect = selected.getBoundingClientRect();

    if (rect.width === 0 && rect.height === 0) {
      options.style.top = '50%';
      options.style.left = '50%';
      options.style.width = '200px';
      options.style.transform = 'translate(-50%, -50%)';
      return;
    }

    const viewportHeight = window.innerHeight;
    options.classList.add('show');
    const actualOptionsHeight = options.offsetHeight || 200;

    const gap = 4;
    const threshold = 2;
    let top;

    const spaceBelow = viewportHeight - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    const requiredSpaceBelow = actualOptionsHeight * threshold;

    if (spaceAbove >= actualOptionsHeight && spaceBelow < requiredSpaceBelow) {
      top = rect.top - actualOptionsHeight - gap;
    } else if (spaceBelow >= actualOptionsHeight) {
      top = rect.bottom + gap;
    } else if (spaceAbove >= actualOptionsHeight) {
      top = rect.top - actualOptionsHeight - gap;
    } else {
      if (spaceBelow >= spaceAbove) {
        top = rect.bottom + gap;
      } else {
        top = Math.max(10, rect.top - actualOptionsHeight - gap);
      }
    }

    options.style.top = `${top}px`;
    options.style.left = `${rect.left}px`;
    options.style.width = `${rect.width}px`;
    options.style.transform = 'none';
  }
}

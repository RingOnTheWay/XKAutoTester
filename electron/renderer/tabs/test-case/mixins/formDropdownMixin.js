// Dropdown Utilities mixin for TestCaseView
// Extracted from formMixin.js during sub-refactor
// Provides: dropdown positioning/open/close + scroll lock

export const formDropdownMixin = {
    // ─── Dropdown Utilities ────────────────────────────────────────

    /**
     * 定位下拉框到选中区域下方
     */
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
            top = spaceBelow >= spaceAbove ? rect.bottom + gap : Math.max(10, rect.top - actualOptionsHeight - gap);
        }

        options.style.top = `${top}px`;
        options.style.left = `${rect.left}px`;
        options.style.width = `${rect.width}px`;
        options.style.transform = '';
    },

    /**
     * 阻止页面滚动（下拉框打开时）
     */
    preventScroll(e) {
        const mainContent = document.querySelector('.main-content');
        if (mainContent && mainContent.classList.contains('dropdown-open')) {
            e.preventDefault();
        }
    },

    /**
     * 关闭所有下拉框
     */
    closeAllDropdowns() {
        const hadOpen = document.querySelectorAll('.custom-select__options.show').length > 0;
        document.querySelectorAll('.custom-select__options.show').forEach(opt => {
            opt.classList.remove('show');
        });
        if (hadOpen) {
            const mainContent = document.querySelector('.main-content');
            if (mainContent) {
                mainContent.classList.remove('dropdown-open');
                mainContent.removeEventListener('wheel', this.preventScroll, { passive: false });
            }
        }
    },

    /**
     * 打开下拉框
     */
    openDropdown(selected, options) {
        this.closeAllDropdowns();
        this.positionDropdown(selected, options);
        options.classList.add('show');
        const mainContent = document.querySelector('.main-content');
        if (mainContent) {
            mainContent.classList.add('dropdown-open');
            mainContent.addEventListener('wheel', this.preventScroll, { passive: false });
        }
    },

    /**
     * 关闭单个下拉框
     */
    closeDropdown(options) {
        options.classList.remove('show');
        const mainContent = document.querySelector('.main-content');
        if (mainContent) {
            mainContent.classList.remove('dropdown-open');
            mainContent.removeEventListener('wheel', this.preventScroll, { passive: false });
        }
    },
};

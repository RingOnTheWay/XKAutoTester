// Editor Initialization mixin for TestCaseView
// Extracted from formMixin.js during sub-refactor
// Provides: editor initialization (app/platform/markers selects, collapsible, dirty listener, step selects)

export const formEditorInitMixin = {
    // ─── Editor Initialization ─────────────────────────────────────

    async initEditor() {
        this.initAppSelect();
        this.initPlatformSelect();
        this.initMarkersSelect();
        this.initCollapsible();
        this.initDirtyListener();
        // 渲染平台选项（平台列表是静态的）
        this.renderPlatformOptions(
            [{ value: 'android', label: 'Android' }],
            this._currentPlatform || 'android'
        );
    },

    /**
     * 初始化应用选择下拉框
     */
    initAppSelect() {
        const select = this.els.appSelect;
        if (!select || select.dataset.initialized === 'true') return;

        const selected = select.querySelector('.custom-select__selected');
        const options = this.els.appOptions;
        if (!selected || !options) return;

        document.body.appendChild(options);
        select.dataset.initialized = 'true';

        selected.addEventListener('click', (e) => {
            e.stopPropagation();
            const isShowing = options.classList.contains('show');
            if (!isShowing) {
                this.openDropdown(selected, options);
            } else {
                this.closeDropdown(options);
            }
        });
    },

    /**
     * 初始化平台选择下拉框
     */
    initPlatformSelect() {
        const select = this.els.platformSelectWrapperSelect;
        if (!select || select.dataset.initialized === 'true') return;

        const selected = select.querySelector('.custom-select__selected');
        const options = this.els.platformSelectWrapperOptions;
        if (!selected || !options) return;

        document.body.appendChild(options);
        select.dataset.initialized = 'true';

        selected.addEventListener('click', (e) => {
            e.stopPropagation();
            const isShowing = options.classList.contains('show');
            if (!isShowing) {
                this.openDropdown(selected, options);
            } else {
                this.closeDropdown(options);
            }
        });
    },

    /**
     * 初始化 Markers 多选下拉框
     */
    initMarkersSelect() {
        const select = this.els.markersSelect;
        if (!select || select.dataset.initialized === 'true') return;

        const selected = select.querySelector('.custom-select__selected');
        const options = this.els.markersOptions;
        if (!selected || !options) return;

        document.body.appendChild(options);
        select.dataset.initialized = 'true';

        selected.addEventListener('click', (e) => {
            e.stopPropagation();
            const isShowing = options.classList.contains('show');
            if (!isShowing) {
                this.openDropdown(selected, options);
            } else {
                this.closeDropdown(options);
            }
        });
    },

    /**
     * 初始化可折叠区域
     */
    initCollapsible() {
        const headers = document.querySelectorAll('.tc-collapsible-header');
        headers.forEach(header => {
            if (header.dataset.initialized === 'true') return;
            header.dataset.initialized = 'true';
            header.addEventListener('click', () => {
                const section = header.closest('.tc-section-collapsible');
                if (section) section.classList.toggle('collapsed');
            });
        });
    },

    /**
     * 初始化编辑器表单 dirty 监听
     */
    initDirtyListener() {
        const editorForm = this.els.editorForm;
        if (editorForm && !editorForm._dirtyListenerAdded) {
            editorForm.addEventListener('change', (e) => {
                if (e.target.matches('input, select, textarea') && !e.target.closest('.tc-step-card')) {
                    this._onDirty?.();
                }
            });
            editorForm._dirtyListenerAdded = true;
        }
    },

    /**
     * 设置 dirty 回调（由 controller 调用）
     */
    onDirty(callback) {
        this._onDirty = callback;
    },

    /**
     * 初始化步骤卡片内的所有 custom-select 组件
     * @param {HTMLElement} container - 步骤卡片容器
     */
    initStepSelects(container) {
        const selectWrappers = container.querySelectorAll('.tc-step-select-wrapper');

        selectWrappers.forEach(wrapper => {
            const select = wrapper.querySelector('.custom-select');
            if (!select || select.dataset.initialized) return;

            const selected = select.querySelector('.custom-select__selected');
            const options = select.querySelector('.custom-select__options');
            if (!selected || !options) return;

            select.dataset.initialized = 'true';

            // 移除 body 下已有的同 ID options
            if (options.id) {
                const existing = document.body.querySelector(`#${options.id}`);
                if (existing && existing !== options) existing.remove();
            }

            // 将下拉选项移到 body 下
            if (!options.dataset.moved) {
                document.body.appendChild(options);
                options.dataset.moved = 'true';
            }

            // 点击选中区域
            selected.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                const isShowing = options.classList.contains('show');
                if (!isShowing) {
                    this.openDropdown(selected, options);
                } else {
                    this.closeDropdown(options);
                }
            });
        });
    },

    /**
     * 初始化步骤列表内的 custom-select（默认使用缓存的 #tc-steps-list）
     * @param {Element} [container] - 可选容器，默认使用 this.els.stepsList
     */
    initStepSelectsSafe(container) {
        const target = container || this.els.stepsList;
        if (target) this.initStepSelects(target);
    },
};

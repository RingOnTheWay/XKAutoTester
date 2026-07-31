// Step List / Search / File List Event Bridge mixin for TestCaseView
// Extracted from formMixin.js during sub-refactor
// Provides: step card CRUD helpers, drag/drop, search input, file list click, select state helpers, BLE cascade select

import { DeviceCascadeSelect } from '../../../components/device-cascade-select.js';

export const formStepBridgeMixin = {
    // ─── Step Card Helpers ─────────────────────────────────────────

    /**
     * 绑定对比目标值输入与容差输入框的联动
     * - 当对比来源为"手动输入"(custom)时，targetValue 为非数字字符串则禁用容差输入框
     * - 当 targetValue 转为纯数字（或为空）时，恢复容差输入框可用
     * @param {Element} card - 步骤卡片元素
     * @returns {Function} unbind 函数
     */
    bindCompareToleranceToggle(card) {
        if (!card) return () => {};
        const targetValueInput = card.querySelector('.tc-compare-target-value');
        const toleranceInput = card.querySelector('.tc-compare-tolerance');
        if (!targetValueInput || !toleranceInput) return () => {};

        const updateToleranceState = () => {
            const val = targetValueInput.value;
            // 仅当 targetValue 为空或纯数字时启用容差；包含非数字字符（含"阿123"等混合）则禁用
            const isPureNumber = val !== '' && !isNaN(Number(val)) && isFinite(Number(val));
            const shouldDisable = val !== '' && !isPureNumber;
            toleranceInput.disabled = shouldDisable;
            // targetValue 从纯数字变为字符串时，清空已输入的容差值
            if (shouldDisable && toleranceInput.value) {
                toleranceInput.value = '';
            }
        };

        targetValueInput.addEventListener('input', updateToleranceState);
        return () => targetValueInput.removeEventListener('input', updateToleranceState);
    },

    /**
     * 获取所有步骤卡片元素
     * @returns {Element[]}
     */
    getStepCards() {
        if (!this.els.stepsList) return [];
        return Array.from(this.els.stepsList.querySelectorAll('.tc-step-card'));
    },

    /**
     * 查找指定 stepId 对应的步骤卡片
     * @param {string} stepId
     * @returns {Element|null}
     */
    findStepCard(stepId) {
        if (!this.els.stepsList) return null;
        return this.els.stepsList.querySelector(`[data-step-id="${stepId}"].tc-step-card`);
    },

    /**
     * 用新卡片替换指定 stepId 的旧卡片
     * @param {string} stepId
     * @param {Element} newCard
     * @returns {boolean} 是否成功替换
     */
    replaceStepCard(stepId, newCard) {
        const oldCard = this.findStepCard(stepId);
        if (!oldCard) return false;
        oldCard.replaceWith(newCard);
        return true;
    },

    /**
     * 清理某 step 移动到 body 的 options 元素
     * @param {string} stepId
     */
    cleanupMovedOptionsForStep(stepId) {
        document.querySelectorAll(`.custom-select__options[data-moved][id*="${stepId}"]`).forEach(opt => opt.remove());
    },

    /**
     * 按 DOM 顺序重排步骤卡片序号显示，并返回 [{stepId, order}] 供 Controller 同步 model
     * @returns {Array<{stepId: string, order: number}>}
     */
    renumberStepCards() {
        const cards = this.getStepCards();
        const result = [];
        cards.forEach((card, index) => {
            const stepId = card.getAttribute('data-step-id');
            const numberEl = card.querySelector('.tc-step-number');
            if (numberEl) numberEl.textContent = index + 1;
            if (stepId) result.push({ stepId, order: index + 1 });
        });
        return result;
    },

    /**
     * 更新步骤卡片上下移动按钮的禁用状态
     */
    updateMoveButtonsState() {
        const cards = this.getStepCards();
        cards.forEach((card, index) => {
            const upBtns = card.querySelectorAll('.tc-step-move-up-btn');
            const downBtns = card.querySelectorAll('.tc-step-move-down-btn');
            upBtns.forEach((btn) => {
                btn.disabled = index === 0;
                btn.classList.toggle('tc-step-move-btn-disabled', index === 0);
            });
            downBtns.forEach((btn) => {
                btn.disabled = index === cards.length - 1;
                btn.classList.toggle('tc-step-move-btn-disabled', index === cards.length - 1);
            });
        });
    },

    /**
     * 查找 select 对应的 options 元素（可能仍在 select 内或已移到 body）
     * @param {Element} select
     * @returns {Element|null}
     */
    findOptionsForSelect(select) {
        if (!select) return null;
        let options = select.querySelector('.custom-select__options');
        if (!options && select.id) {
            options = document.getElementById(`${select.id}-options`);
        }
        return options;
    },

    // ─── Search / File List Event Binding ──────────────────────────

    /**
     * 绑定搜索输入框 input 事件
     * @param {Function} handler - (query: string) => void
     * @returns {Function} unbind
     */
    bindSearchInput(handler) {
        const { searchInput } = this.els;
        if (!searchInput) return () => {};
        const listener = (e) => handler(e.target.value.trim());
        searchInput.addEventListener('input', listener);
        return () => searchInput.removeEventListener('input', listener);
    },

    /**
     * 清空搜索输入框的值
     */
    clearSearchInput() {
        if (this.els.searchInput) this.els.searchInput.value = '';
    },

    /**
     * 绑定文件列表委托 click 事件
     * @param {Function} handler - (file: {name, pyFilePath}, fileItem: Element) => void
     * @returns {Function} unbind
     */
    bindFileListClick(handler) {
        const container = this.els.testFilesList;
        if (!container) return () => {};
        const clickHandler = (e) => {
            const fileItem = e.target.closest('.test-case-file-item');
            if (!fileItem) return;
            const fileName = fileItem.dataset.fileName;
            const pyFilePath = fileItem.dataset.pyFilePath;
            if (fileName) {
                handler({ name: fileName, pyFilePath }, fileItem);
            }
        };
        if (!container.__tcClickBound) {
            container.addEventListener('click', clickHandler);
            container.__tcClickBound = true;
            return () => {
                container.removeEventListener('click', clickHandler);
                container.__tcClickBound = false;
            };
        }
        return () => {};
    },

    /**
     * 绑定步骤卡片拖拽排序事件（View 内部维护 dragged 状态）
     * @param {Function} onDragEnd - 拖拽结束时回调（无参数），由 Controller 触发 model 同步
     * @returns {Function} unbind
     */
    bindStepDragDrop(onDragEnd) {
        const container = this.els.stepsList;
        if (!container) return () => {};
        const cards = Array.from(container.querySelectorAll('.tc-step-card'));
        const unbinds = [];
        let draggedCard = null;

        cards.forEach((card) => {
            const grips = card.querySelectorAll('.tc-drag-grip[data-drag-grip]');
            grips.forEach((grip) => {
                grip.draggable = true;

                const dragstartHandler = (e) => {
                    draggedCard = card;
                    card.classList.add('dragging');
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setDragImage(card, 0, 0);
                };
                grip.addEventListener('dragstart', dragstartHandler);
                unbinds.push(() => grip.removeEventListener('dragstart', dragstartHandler));

                const dragendHandler = () => {
                    card.classList.remove('dragging');
                    draggedCard = null;
                    if (onDragEnd) onDragEnd();
                };
                grip.addEventListener('dragend', dragendHandler);
                unbinds.push(() => grip.removeEventListener('dragend', dragendHandler));
            });

            const dragoverHandler = (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (draggedCard && draggedCard !== card) {
                    const allCards = Array.from(container.querySelectorAll('.tc-step-card:not(.dragging)'));
                    const nextCard = allCards.find((c) => {
                        const rect = c.getBoundingClientRect();
                        return e.clientY < rect.top + rect.height / 2;
                    });
                    if (nextCard) {
                        container.insertBefore(draggedCard, nextCard);
                    } else {
                        container.appendChild(draggedCard);
                    }
                }
            };
            card.addEventListener('dragover', dragoverHandler);
            unbinds.push(() => card.removeEventListener('dragover', dragoverHandler));
        });

        return () => unbinds.forEach(fn => fn());
    },

    // ─── Select State Helpers (MVC: classList 归 view) ────────────

    /**
     * 标记 custom-select 某选项为选中态（清除其他选项的 selected）
     * MVC: 选中态 classList 管理归 view
     * @param {Element} optionsContainer - .custom-select__options 容器
     * @param {Element} selectedOption - 被点击的 .custom-select__option
     */
    markOptionSelected(optionsContainer, selectedOption) {
        if (!optionsContainer || !selectedOption) return;
        optionsContainer.querySelectorAll('.custom-select__option').forEach(opt => opt.classList.remove('selected'));
        selectedOption.classList.add('selected');
    },

    /**
     * 更新 custom-select 选中显示文本（通用版，适用于 step card 内的 select）
     * MVC: 选中态文本显示归 view
     * @param {Element} selectEl - .custom-select 元素
     * @param {string} text - 显示文本
     */
    setSelectSelectedText(selectEl, text) {
        if (!selectEl) return;
        const selectedSpan = selectEl.querySelector('.custom-select__text');
        if (selectedSpan) selectedSpan.textContent = text;
    },

    /**
     * 截断数字 input 的小数位数（蓝牙参数精度限制）
     * MVC: DOM value 写入归 view
     * @param {HTMLInputElement} inputEl - input 元素
     * @param {number} precision - 最大小数位数
     */
    truncateDecimalInput(inputEl, precision) {
        if (!inputEl || precision === undefined || inputEl.type !== 'number') return;
        const value = inputEl.value;
        if (value.includes('.')) {
            const parts = value.split('.');
            const maxDecimals = parseInt(precision);
            if (parts[1] && parts[1].length > maxDecimals) {
                parts[1] = parts[1].substring(0, maxDecimals);
                inputEl.value = parts.join('.');
            }
        }
    },

    /**
     * 切换 marker 选项的选中态（多选 toggle）
     * MVC: classList.toggle 归 view
     * @param {Element} optionEl - .custom-select__option 元素
     */
    toggleMarkerOption(optionEl) {
        if (!optionEl) return;
        optionEl.classList.toggle('selected');
    },

    /**
     * 批量同步 markers 选项的选中态
     * MVC: classList.toggle 批量归 view
     * @param {Element} optionsContainer - markers options 容器
     * @param {Array<string>} markers - 已选中的 marker 值列表
     */
    syncMarkerOptionsState(optionsContainer, markers) {
        if (!optionsContainer) return;
        optionsContainer.querySelectorAll('.custom-select__option').forEach(opt => {
            opt.classList.toggle('selected', markers.includes(opt.dataset.value));
        });
    },

    // ─── BLE Cascade Select ────────────────────────────────────────

    /**
     * 在 step card 内初始化蓝牙设备级联选择器
     * MVC: UI 组件实例化归 view，controller 仅传数据 + 回调
     * @param {string|number} stepId - 步骤 ID
     * @param {Array} bleDevices - 蓝牙设备列表
     * @param {string|null} currentDeviceId - 当前已选设备 ID（用于回显）
     * @param {Function} onSelect - (device: {deviceId, name}) => void
     */
    showDeviceCascadeSelect(stepId, bleDevices, currentDeviceId, onSelect) {
        const container = document.querySelector(`.tc-ble-device-select-container[data-step-id="${stepId}"]`);
        if (!container) return;

        if (!container.id) {
            container.id = `ble-select-${stepId}`;
        }

        // 销毁旧实例
        if (DeviceCascadeSelect?.instances?.[container.id]) {
            DeviceCascadeSelect.instances[container.id].destroy();
        }

        const cascadeSelect = new DeviceCascadeSelect(container.id, {
            placeholder: window.i18n.t('testCase.bleDeviceSelect'),
            typePlaceholder: window.i18n.t('testCase.bleDeviceType'),
            modelPlaceholder: window.i18n.t('testCase.bleDeviceModel'),
            onSelect: onSelect
        });

        cascadeSelect.render(bleDevices);

        // 回显已选设备
        if (currentDeviceId) {
            const device = bleDevices.find(d => d.deviceId === currentDeviceId);
            if (device) {
                cascadeSelect.select(device, true);
            }
        }
    },

    // ─── App / Platform Selected Text ─────────────────────────────

    /**
     * 更新 App 选中显示文本
     * @param {string} name
     */
    setAppSelectedText(name) {
        const selectedSpan = this.els.appSelected?.querySelector('.custom-select__text');
        if (selectedSpan) selectedSpan.textContent = name;
    },

    /**
     * 更新 Platform 选中显示文本
     * @param {string} label
     */
    setPlatformSelectedText(label) {
        const selectedSpan = this.els.platformSelected?.querySelector('.custom-select__text');
        if (selectedSpan) selectedSpan.textContent = label;
    },
};
